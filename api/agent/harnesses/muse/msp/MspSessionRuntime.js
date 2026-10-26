import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import {
	MspClientConnection,
	createMspFrameParser,
	MSP_CLOSED_CODE,
} from "./MspClientConnection.js";
import { createStderrRing } from "../../shared/harnessScaffold.js";
import { isWindows } from "../../../../utils/platform.js";
import { killProcessTree } from "../../../../utils/processTree.js";
import {
	buildMuseMspSessionParams,
	describeMuseMspSandboxPosture,
	describeMuseMspSchemaDrift,
} from "./museMspSupport.js";

/**
 * MARK: MspSessionRuntime
 * @description Supervises ONE long-lived `muse serve` MSP host process and
 *   owns the wire state machine: spawn in a detached process group, stdout
 *   stays protocol-only (NDJSON JSON-RPC 2.0), stderr lands in a bounded ring
 *   for post-mortems, the LSP-style two-step handshake (`initialize` then the
 *   MANDATORY `initialized` notification — GOTCHA-1), and `session/start` /
 *   `session/resume` bookkeeping. Supervision mechanics mirror the ACP core
 *   (process groups, SIGTERM→SIGKILL escalation, handshake ceiling) — copied
 *   deliberately, because MSP is not ACP on the wire.
 *
 *   A host that dies mid-session closes the connection, which rejects every
 *   pending request — an orphaned turn can never pin a stage forever.
 *
 *   One host can carry SEVERAL MSP sessions (the per-project pool shares it),
 *   so notifications and server→client requests are MULTIPLEXED: listeners
 *   register with `addNotificationListener` / `addRequestListener` (and remove
 *   themselves on dispose/reconnect). Notifications fan out to every listener
 *   (each filters by its own sessionId); requests follow a fail-safe answer
 *   ladder — first claim (non-undefined return) wins, else the first listener
 *   failure, else a method-not-found error (a listener returns `undefined`
 *   to abstain).
 */

/** Grace period between SIGTERM and SIGKILL for a lingering host (ms). */
export const DEFAULT_MSP_KILL_GRACE_MS = 500;

/** Handshake ceiling: a host that never answers `initialize` is hung. */
export const DEFAULT_MSP_START_TIMEOUT_MS = 30000;

/***
 * MARK: MspSessionRuntime
 * @description Owns one `muse serve` host and its MSP connection.
 * @example const runtime = new MspSessionRuntime({ command: "/home/u/.local/bin/muse", args: ["serve", "--provider", "echo"], cwd: "/repo", env: {} });
 * @example await runtime.start(); await runtime.startSession({ workspaceRoot: "/repo" });
 ***/
export class MspSessionRuntime {
	constructor({
		command,
		args = [],
		cwd,
		env,
		initializeParams = {},
		startTimeoutMs = DEFAULT_MSP_START_TIMEOUT_MS,
		killGraceMs = DEFAULT_MSP_KILL_GRACE_MS,
		maxStderrLines = 50,
		maxStderrChars = 2000,
		platform = process.platform,
		spawnFn = spawn,
		log,
		onNotification,
		onRequest,
		onNoise,
		hostSettings = {},
	} = {}) {
		if (!command || typeof command !== "string") {
			throw new Error("MspSessionRuntime requires a command (the muse binary path)");
		}
		if (!cwd || typeof cwd !== "string") {
			throw new Error(
				"MspSessionRuntime requires a cwd (the host runs pinned to the project workspace)",
			);
		}
		this.command = command;
		this.args = [...args];
		this.cwd = cwd;
		this.env = env;
		this.initializeParams = initializeParams;
		this.startTimeoutMs = startTimeoutMs;
		this.killGraceMs = killGraceMs;
		this.platform = platform;
		this.spawnFn = spawnFn;
		this.log = typeof log === "function" ? log : null;
		this.onNoise = onNoise;
		this.hostSettings = hostSettings;
		this.stderr = createStderrRing({ maxLines: maxStderrLines, maxChars: maxStderrChars });

		this.notificationListeners = new Set();
		this.requestListeners = new Set();
		if (typeof onNotification === "function") {
			this.notificationListeners.add(onNotification);
		}
		if (typeof onRequest === "function") {
			this.requestListeners.add(onRequest);
		}

		this.child = null;
		this.connection = null;
		this.parser = null;
		this.stdoutDecoder = null;
		this.stderrDecoder = null;
		this.initializeResult = null;
		this.sessionId = null;
		this.viewCursor = null;
		this.sessionResult = null;
		this.started = false;
		this.startFailed = false;
		this.disposed = false;
		this.forceKillTimer = null;
		this.exitInfo = null;
	}

	/***
	 * MARK: addNotificationListener
	 * @description Registers one notification listener (one per MSP session on
	 *   this shared host). Listeners must filter by their own sessionId.
	 ***/
	addNotificationListener(listener) {
		if (typeof listener === "function") this.notificationListeners.add(listener);
	}

	removeNotificationListener(listener) {
		this.notificationListeners.delete(listener);
	}

	/***
	 * MARK: addRequestListener
	 * @description Registers one server→client request listener. A listener
	 *   CLAIMS a request by returning a response (or throwing — its error is
	 *   the answer); returning `undefined` ABSTAINS so another session's
	 *   listener can answer. Nobody claiming answers method-not-found.
	 ***/
	addRequestListener(listener) {
		if (typeof listener === "function") this.requestListeners.add(listener);
	}

	removeRequestListener(listener) {
		this.requestListeners.delete(listener);
	}

	dispatchNotification(method, params) {
		for (const listener of [...this.notificationListeners]) {
			try {
				listener(method, params);
			} catch {
				// One bad listener never breaks the stream for the others.
			}
		}
	}

	/***
	 * MARK: dispatchRequest
	 * @description Answers one server→client request across the registered
	 *   listeners. The answer ladder is fail-safe: the FIRST listener that
	 *   CLAIMS the request (returns a non-undefined response) wins; when
	 *   nobody claims, the FIRST listener failure surfaces (a listener that
	 *   owned the request and threw is failing it closed — never a silent
	 *   method-not-found); when nobody claims and nobody failed, the host
	 *   gets method-not-found (-32601). Listeners abstain with `undefined`.
	 ***/
	async dispatchRequest(method, params) {
		let firstError = null;
		for (const listener of [...this.requestListeners]) {
			try {
				const response = await listener(method, params);
				if (response !== undefined) return response;
			} catch (error) {
				if (!firstError) firstError = error;
			}
		}
		if (firstError) throw firstError;
		throw Object.assign(new Error(`No handler for MSP method "${method}"`), {
			code: -32601,
		});
	}

	/** The host child's PID (null before start). */
	get pid() {
		return this.child?.pid ?? null;
	}

	/** Bounded stderr tail for run_error diagnostics. */
	stderrText() {
		return this.stderr.text();
	}

	/***
	 * MARK: start
	 * @description Spawns the host and completes the handshake (`initialize`
	 *   + the `initialized` notification). Resolves with the raw initialize
	 *   result. Rejects (killing the child) when the handshake times out, the
	 *   child exits early, or the spawn itself fails.
	 ***/
	async start() {
		if (this.started) return this.initializeResult;
		if (this.startFailed) {
			// A failed start leaves a half-built child; the pool always builds a
			// fresh runtime per acquire, so re-entry is a bug — refuse loudly
			// instead of double-spawning a host.
			throw startupError(
				`muse serve '${this.command}' already failed to start; create a new runtime (the host pool does this on every acquire)`,
			);
		}
		this.parser = createMspFrameParser({ onNoise: (line) => this.onNoise?.(line) });
		this.stdoutDecoder = new StringDecoder("utf8");
		this.stderrDecoder = new StringDecoder("utf8");

		const detached = !isWindows(this.platform);
		let child;
		try {
			child = this.spawnFn(this.command, this.args, {
				cwd: this.cwd,
				env: this.env,
				stdio: ["pipe", "pipe", "pipe"],
				detached,
			});
		} catch (error) {
			throw startupError(
				`Failed to start muse serve '${this.command}': ${error?.message || error}`,
			);
		}
		this.child = child;
		this.log?.(`spawn pid=${child.pid ?? "?"}`);

		child.stdin.on("error", (error) => {
			// EPIPE / ERR_STREAM_DESTROYED are expected when the server child process terminates or is killed
			this.log?.(`muse serve stdin error: ${error?.message || error}`);
		});

		this.connection = new MspClientConnection({
			sendLine: (line) => {
				if (!child.stdin || child.stdin.destroyed || child.stdin.writable === false) {
					return;
				}
				try {
					child.stdin.write(line);
				} catch (error) {
					throw startupError(
						`muse serve stdin is not writable: ${error?.message || error}`,
					);
				}
			},
			onNotification: (method, params) => this.dispatchNotification(method, params),
			onRequest: (method, params) => this.dispatchRequest(method, params),
		});

		child.stdout.on("data", (chunk) => {
			for (const frame of this.parser.push(this.stdoutDecoder.write(chunk))) {
				this.connection.handleLine(frame);
			}
		});

		child.stderr.on("data", (chunk) => {
			this.stderr.push(this.stderrDecoder.write(chunk));
		});

		const earlyExit = new Promise((_, reject) => {
			child.on("error", (error) => {
				reject(
					startupError(
						`Failed to start muse serve '${this.command}': ${error?.message || error}`,
					),
				);
			});
			child.on("close", (code, signal) => {
				this.exitInfo = { code, signal };
				this.connection?.close(
					`muse serve exited (code ${code ?? signal ?? "unknown"})${this.stderrText() ? `: ${this.stderrText()}` : ""}`,
				);
				if (!this.started) {
					reject(
						startupError(
							`muse serve '${this.command}' exited during startup (code ${code ?? signal ?? "unknown"})${this.stderrText() ? `: ${this.stderrText()}` : ""}`,
						),
					);
				}
			});
		});

		try {
			const initResult = await Promise.race([
				this.connection.request("initialize", this.initializeParams, {
					timeoutMs: this.startTimeoutMs,
				}),
				earlyExit,
			]);
			this.initializeResult = initResult || {};
			// GOTCHA-1: without this notification every later call fails
			// `notInitialized`. It is a notification, never a request.
			this.connection.notify("initialized", {});
			const drift = describeMuseMspSchemaDrift(this.initializeResult);
			if (drift) this.log?.(drift);
			this.log?.(describeMuseMspSandboxPosture(this.initializeResult, this.hostSettings));
		} catch (error) {
			this.startFailed = true;
			this.kill("SIGTERM");
			throw error;
		}
		this.started = true;
		return this.initializeResult;
	}

	/***
	 * MARK: startSession
	 * @description Creates a brand-new MSP session on this host via
	 *   `session/start` (command; UUIDv7 commandId added by the connection).
	 *   Stores `sessionId` and `viewCursor`, and resolves with the raw result.
	 * @param {Object} opts
	 * @param {string} opts.workspaceRoot - Absolute project workspace root (pinned).
	 * @param {string} [opts.approvalMode] - Closed-enum approval mode.
	 * @param {string|null} [opts.modelId] - Initial model.
	 * @param {number} [opts.timeoutMs] - Ceiling (defaults to startTimeoutMs).
	 ***/
	async startSession({ workspaceRoot, approvalMode, modelId, timeoutMs } = {}) {
		const result = await this.request(
			"session/start",
			buildMuseMspSessionParams({ workspaceRoot, approvalMode, modelId }),
			{ command: true, timeoutMs: timeoutMs ?? this.startTimeoutMs },
		);
		this.sessionResult = result;
		this.sessionId = result?.session?.sessionId ?? null;
		this.viewCursor = result?.viewCursor ?? null;
		if (!this.sessionId) {
			throw new Error("muse serve did not return a sessionId from session/start");
		}
		return result;
	}

	/***
	 * MARK: resumeSession
	 * @description Re-attaches a stored session after a supervised host
	 *   restart via `session/resume`, returning the history the host serves.
	 * @param {Object} opts
	 * @param {string} opts.sessionId - The session to resume.
	 * @param {string|null} [opts.cursor] - Last observed view cursor.
	 * @param {number} [opts.timeoutMs] - Ceiling (defaults to startTimeoutMs).
	 ***/
	async resumeSession({ sessionId, cursor = null, timeoutMs } = {}) {
		const params = { sessionId };
		if (cursor) params.cursor = cursor;
		const result = await this.request("session/resume", params, {
			command: true,
			timeoutMs: timeoutMs ?? this.startTimeoutMs,
		});
		this.sessionResult = result;
		this.sessionId = result?.session?.sessionId ?? sessionId;
		this.viewCursor = result?.viewCursor ?? this.viewCursor;
		return result;
	}

	/***
	 * MARK: request
	 * @description Sends one MSP request on the host connection.
	 ***/
	request(method, params, opts) {
		if (!this.connection) {
			return Promise.reject(closedError("muse serve host is not started"));
		}
		return this.connection.request(method, params, opts);
	}

	/***
	 * MARK: kill
	 * @description Process-group SIGTERM with SIGKILL escalation after
	 *   `killGraceMs`. Aliveness is `exitCode === null` (never `child.killed`),
	 *   matching the shared scaffold's escalation contract. Windows uses a
	 *   whole-tree terminate instead.
	 ***/
	kill(signal = "SIGTERM", { escalate = signal === "SIGTERM" } = {}) {
		const child = this.child;
		if (!child || !child.pid || child.exitCode !== null) return;
		if (isWindows(this.platform)) {
			killProcessTree(child.pid, {
				platform: this.platform,
				child,
				spawnFn: this.spawnFn,
			}).catch(() => {});
			return;
		}
		try {
			process.kill(-child.pid, signal);
		} catch {
			try {
				child.kill(signal);
			} catch {
				// already gone
			}
		}
		if (escalate) {
			this.forceKillTimer = setTimeout(() => {
				if (child.exitCode !== null) return;
				try {
					process.kill(-child.pid, "SIGKILL");
				} catch {
					try {
						child.kill("SIGKILL");
					} catch {
						// already gone
					}
				}
			}, this.killGraceMs);
			if (this.forceKillTimer.unref) this.forceKillTimer.unref();
		}
	}

	/***
	 * MARK: dispose
	 * @description Idempotent teardown: closes the connection (rejecting
	 *   pending requests) and terminates the host process group.
	 ***/
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.notificationListeners.clear();
		this.requestListeners.clear();
		this.connection?.close("muse serve host disposed");
		if (this.forceKillTimer) {
			clearTimeout(this.forceKillTimer);
			this.forceKillTimer = null;
		}
		this.kill("SIGTERM");
	}
}

function startupError(message) {
	const error = new Error(message);
	error.code = "MSP_STARTUP_FAILED";
	return error;
}

function closedError(message) {
	const error = new Error(message);
	error.code = MSP_CLOSED_CODE;
	return error;
}
