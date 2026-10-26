import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { createAcpFrameParser } from "./AcpStreamTransport.js";
import { AcpClientConnection, ACP_CLOSED_CODE } from "./AcpClientConnection.js";

/**
 * MARK: AcpSessionRuntime
 * @description Generic ACP agent subprocess supervision: spawn, handshake,
 *   session instantiation, and teardown. Zero vendor knowledge — the binary,
 *   argv, env, and handshake payloads arrive via options, so the next ACP
 *   harness reuses this file unchanged:
 *
 *   1. Spawn the agent in a DETACHED process group (`detached` on POSIX) and
 *      capture the exact PID at spawn time (never pattern-match).
 *   2. Wrap stdout in a StringDecoder + NDJSON frame parser feeding a
 *      JSON-RPC connection; stdout stays purely protocol (stderr carries
 *      diagnostics into a bounded ring for post-mortems).
 *   3. `start()` runs the handshake (`initialize`) then `session/new` and
 *      keeps both results for capability negotiation by the caller.
 *   4. Teardown is process-group SIGTERM with SIGKILL escalation after
 *      `killGraceMs` (the same escalation contract as the shared scaffold's
 *      supervised spawn: aliveness is `exitCode === null`, never
 *      `child.killed`).
 */

/** Grace period between SIGTERM and SIGKILL for a lingering agent (ms). */
export const DEFAULT_ACP_KILL_GRACE_MS = 500;

/** Handshake ceiling: an agent that never answers `initialize` is hung. */
export const DEFAULT_ACP_START_TIMEOUT_MS = 30000;

/***
 * MARK: AcpSessionRuntime
 * @description Owns one ACP agent child process and its JSON-RPC connection.
 * @example const runtime = new AcpSessionRuntime({ command: "/usr/local/bin/acp-agent", args: ["acp"], cwd: "/repo", env: {} });
 * @example await runtime.start(); await runtime.prompt([{ type: "text", text: "hi" }]);
 ***/
export class AcpSessionRuntime {
	constructor({
		command,
		args = [],
		cwd,
		env,
		initializeParams = { protocolVersion: 1 },
		newSessionParams = {},
		startTimeoutMs = DEFAULT_ACP_START_TIMEOUT_MS,
		killGraceMs = DEFAULT_ACP_KILL_GRACE_MS,
		maxLineBytes,
		maxStderrLines = 50,
		maxStderrChars = 2000,
		platform = process.platform,
		spawnFn = spawn,
		log,
		onNotification,
		onRequest,
	} = {}) {
		if (!command || typeof command !== "string") {
			throw new Error("AcpSessionRuntime requires a command (agent binary path)");
		}
		if (!cwd || typeof cwd !== "string") {
			throw new Error("AcpSessionRuntime requires a cwd (the agent runs pinned to the project workspace)");
		}
		this.command = command;
		this.args = [...args];
		this.cwd = cwd;
		this.env = env;
		this.initializeParams = initializeParams;
		this.newSessionParams = newSessionParams;
		this.startTimeoutMs = startTimeoutMs;
		this.killGraceMs = killGraceMs;
		this.maxLineBytes = maxLineBytes;
		this.maxStderrLines = maxStderrLines;
		this.maxStderrChars = maxStderrChars;
		this.platform = platform;
		this.spawnFn = spawnFn;
		this.log = typeof log === "function" ? log : null;
		this.onNotification = onNotification;
		this.onRequest = onRequest;

		this.child = null;
		this.connection = null;
		this.parser = null;
		this.stdoutDecoder = null;
		this.stderrDecoder = null;
		this.stderrLines = [];
		this.sessionId = null;
		/** The full `session/new` result (modes, configOptions, …) so flavor
		 *  adapters can read capability data the handshake exposed without
		 *  re-running the session. */
		this.sessionResult = null;
		this.agentCapabilities = null;
		this.protocolVersion = null;
		this.started = false;
		this.disposed = false;
		this.forceKillTimer = null;
		this.exitInfo = null;
	}

	/** The agent child's PID (null before start). */
	get pid() {
		return this.child?.pid ?? null;
	}

	/** Bounded stderr tail for run_error diagnostics. */
	stderrText() {
		return this.stderrLines.join("\n").slice(-this.maxStderrChars);
	}

	/***
	 * MARK: start
	 * @description Spawns the agent, runs `initialize` + `session/new`, and
	 *   resolves with `{ sessionId, agentCapabilities, protocolVersion }`.
	 *   Rejects (killing the child) when the handshake times out, the child
	 *   exits early, or the spawn itself fails.
	 ***/
	async start() {
		if (this.started) return this.describe();
		this.parser = createAcpFrameParser(
			this.maxLineBytes ? { maxLineBytes: this.maxLineBytes } : {},
		);
		this.stdoutDecoder = new StringDecoder("utf8");
		this.stderrDecoder = new StringDecoder("utf8");

		const detached = this.platform !== "win32";
		let child;
		try {
			child = this.spawnFn(this.command, this.args, {
				cwd: this.cwd,
				env: this.env,
				stdio: ["pipe", "pipe", "pipe"],
				detached,
			});
		} catch (error) {
			throw startupError(`Failed to start ACP agent '${this.command}': ${error?.message || error}`);
		}
		this.child = child;
		this.log?.(`ACP agent spawned (pid ${child.pid ?? "unknown"})`);

		child.stdin.on("error", (error) => {
			// EPIPE / ERR_STREAM_DESTROYED are expected when the agent child process terminates or is killed
			this.log?.(`ACP agent stdin error: ${error?.message || error}`);
		});

		this.connection = new AcpClientConnection({
			sendLine: (line) => {
				if (!child.stdin || child.stdin.destroyed || !child.stdin.writable) {
					return;
				}
				try {
					child.stdin.write(line);
				} catch (error) {
					throw startupError(`ACP agent stdin is not writable: ${error?.message || error}`);
				}
			},
			onNotification: (method, params) => this.onNotification?.(method, params),
			onRequest: (method, params) => this.handleAgentRequest(method, params),
		});

		child.stdout.on("data", (chunk) => {
			for (const frame of this.parser.push(this.stdoutDecoder.write(chunk))) {
				this.connection.handleLine(frame);
			}
		});

		child.stderr.on("data", (chunk) => {
			this.pushStderr(this.stderrDecoder.write(chunk));
		});

		const earlyExit = new Promise((_, reject) => {
			child.on("error", (error) => {
				reject(startupError(`Failed to start ACP agent '${this.command}': ${error?.message || error}`));
			});
			child.on("close", (code, signal) => {
				this.exitInfo = { code, signal };
				// A dead agent settles everything: pending turns reject via
				// the closed connection instead of hanging (both at startup
				// and mid-session — an orphaned prompt must never pin a stage).
				this.connection?.close(
					`ACP agent exited (code ${code ?? signal ?? "unknown"})${this.stderrText() ? `: ${this.stderrText()}` : ""}`,
				);
				if (!this.started) {
					reject(
						startupError(
							`ACP agent '${this.command}' exited during startup (code ${code ?? signal ?? "unknown"})${this.stderrText() ? `: ${this.stderrText()}` : ""}`,
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
			this.protocolVersion = initResult?.protocolVersion ?? null;
			this.agentCapabilities = initResult?.agentCapabilities ?? initResult?.capabilities ?? null;
			const wantedVersion = this.initializeParams?.protocolVersion;
			if (
				wantedVersion !== undefined &&
				this.protocolVersion !== null &&
				this.protocolVersion !== wantedVersion
			) {
				throw startupError(
					`Unsupported ACP protocol version: agent speaks ${this.protocolVersion}, client wants ${wantedVersion}`,
				);
			}

			const sessionResult = await Promise.race([
				this.connection.request(
					"session/new",
					{ cwd: this.cwd, mcpServers: [], ...this.newSessionParams },
					{ timeoutMs: this.startTimeoutMs },
				),
				earlyExit,
			]);
			if (!sessionResult?.sessionId || typeof sessionResult.sessionId !== "string") {
				throw startupError(
					`ACP agent '${this.command}' returned no sessionId from session/new`,
				);
			}
			this.sessionId = sessionResult.sessionId;
			this.sessionResult = sessionResult;
			this.started = true;
			this.log?.(`ACP session established (${this.sessionId})`);
			return this.describe();
		} catch (error) {
			if (error?.code === ACP_CLOSED_CODE && this.exitInfo) {
				throw startupError(
					`ACP agent '${this.command}' exited before the handshake completed${this.stderrText() ? `: ${this.stderrText()}` : ""}`,
				);
			}
			this.kill("SIGTERM");
			throw error;
		}
	}

	/***
	 * MARK: handleAgentRequest
	 * @description Answers one agent-initiated request (e.g. permission
	 *   gates) through the injected `onRequest` callback. A missing callback
	 *   rejects with Method-not-found (via the connection) instead of hanging
	 *   the agent's turn.
	 ***/
	async handleAgentRequest(method, params) {
		if (typeof this.onRequest !== "function") {
			const error = new Error(`No handler for ACP method "${method}"`);
			error.code = -32601;
			throw error;
		}
		return this.onRequest(method, params);
	}

	/***
	 * MARK: invoke
	 * @description Sends one session-scoped JSON-RPC request to the agent
	 *   (prompt, steer, cancel, …). Requires `start()` first.
	 ***/
	async invoke(method, params, { timeoutMs = 0 } = {}) {
		this.assertStarted(method);
		return this.connection.request(method, params, { timeoutMs });
	}

	/***
	 * MARK: prompt
	 * @description Runs one agent turn: the `session/prompt` request stays
	 *   open across streaming updates and permission pauses and resolves
	 *   with the agent's stop result.
	 ***/
	async prompt(promptParts, { model, timeoutMs = 0 } = {}) {
		this.assertStarted("session/prompt");
		return this.connection.request(
			"session/prompt",
			{
				sessionId: this.sessionId,
				prompt: promptParts,
				...(model ? { model } : {}),
			},
			{ timeoutMs },
		);
	}

	/***
	 * MARK: steer
	 * @description Sends mid-turn steering to the active turn (best-effort:
	 *   agents without the method answer Method-not-found, which the caller
	 *   surfaces instead of crashing).
	 ***/
	async steer(text, { timeoutMs = 10000 } = {}) {
		this.assertStarted("session/steer");
		return this.connection.request(
			"session/steer",
			{ sessionId: this.sessionId, text },
			{ timeoutMs },
		);
	}

	/***
	 * MARK: cancel
	 * @description Asks the agent to cancel the active turn gracefully
	 *   (protocol-level; the process keeps running for follow-ups).
	 ***/
	async cancel({ timeoutMs = 10000 } = {}) {
		if (!this.started || !this.connection || this.connection.closed) {
			return { status: "idle" };
		}
		try {
			return await this.connection.request(
				"session/cancel",
				{ sessionId: this.sessionId },
				{ timeoutMs },
			);
		} catch {
			return { status: "cancel-requested" };
		}
	}

	/***
	 * MARK: abort
	 * @description Stops the current run at the process level: SIGTERM to the
	 *   whole process group, SIGKILL after the grace period. Always safe to
	 *   call (no child = idle).
	 ***/
	abort() {
		if (!this.child || this.child.exitCode !== null) return { status: "idle" };
		this.kill("SIGTERM");
		return { status: "aborted" };
	}

	/***
	 * MARK: dispose
	 * @description Idempotent cleanup: closes the connection (pending turns
	 *   reject), kills the process group immediately, and drops timers.
	 ***/
	async dispose() {
		if (this.disposed) return;
		this.disposed = true;
		try {
			this.connection?.close("ACP session disposed");
		} catch {
			// best-effort
		}
		if (this.child && this.child.exitCode === null) {
			this.kill("SIGKILL");
		}
		if (this.forceKillTimer) {
			clearTimeout(this.forceKillTimer);
			this.forceKillTimer = null;
		}
		try {
			this.child?.stdin?.end?.();
		} catch {
			// already gone
		}
	}

	describe() {
		return {
			sessionId: this.sessionId,
			agentCapabilities: this.agentCapabilities,
			protocolVersion: this.protocolVersion,
			pid: this.pid,
		};
	}

	assertStarted(method) {
		if (!this.started || !this.connection) {
			throw new Error(`ACP runtime has not started (cannot send "${method}")`);
		}
	}

	pushStderr(chunk) {
		for (const line of String(chunk).split("\n")) {
			if (!line.trim()) continue;
			this.stderrLines.push(line.trim());
			while (this.stderrLines.length > this.maxStderrLines) this.stderrLines.shift();
		}
	}

	kill(signal) {
		const child = this.child;
		// NOTE: the guard is deliberately NOT `child.killed`: Node sets
		// `killed=true` once a signal is SENT (even when the child ignores
		// it), so a killed-check would disable the SIGKILL escalation below.
		// `exitCode` (null until the child actually exits) is the aliveness
		// check — same contract as the shared scaffold's supervised spawn.
		if (!child || !child.pid || child.exitCode !== null) return;
		const detached = this.platform !== "win32";
		try {
			if (detached) {
				try {
					process.kill(-child.pid, signal);
				} catch {
					child.kill(signal);
				}
			} else {
				child.kill(signal);
			}
		} catch {
			// already gone
		}
		if (signal === "SIGTERM") {
			this.forceKillTimer = setTimeout(() => {
				try {
					if (child.exitCode === null) {
						if (detached) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						} else {
							child.kill("SIGKILL");
						}
					}
				} catch {
					// already gone
				}
			}, this.killGraceMs);
			if (this.forceKillTimer.unref) this.forceKillTimer.unref();
		}
	}
}

/***
 * MARK: startupError
 * @description Builds the handshake/spawn rejection: plain Error with the
 *   command named, so flavor adapters can classify it (bin-missing vs auth
 *   vs timeout) from the message.
 ***/
function startupError(message) {
	return new Error(String(message));
}
