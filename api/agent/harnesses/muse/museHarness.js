import { execFile } from "node:child_process";
import { startSupervisedSpawn } from "../shared/harnessScaffold.js";
import { binaryAvailable, resolveSpawnBinary } from "../../harnessDiscovery.js";
import { config } from "../../../config.js";
import {
	buildMuseChildEnv,
	buildMuseSpawnPlan,
	resolveMuseSettings,
	readHistoryFromDisk as readMuseExportHistory,
} from "./musePermissions.js";
import { createMuseStreamParser } from "./museStreamParser.js";
import { createMuseEventMapper } from "./museEventMapper.js";
import { generateUuidV7 } from "./msp/uuidv7.js";
import { createMuseMspSession } from "./msp/museMspSession.js";
import { createMuseMspModelCatalog } from "./msp/museMspModelCatalog.js";
import { createMuseServeHostPool } from "./msp/museServeHostPool.js";
import { MspSessionRuntime } from "./msp/MspSessionRuntime.js";
import {
	buildMuseMspHandshake,
	buildMuseServeSpawnPlan,
	classifyMuseMspStartupFailure,
	resolveMuseMspApprovalMode,
	resolveMuseMspSettings,
	sanitizeMuseMspEnv,
	selectMuseTransport,
} from "./msp/museMspSupport.js";

/**
 * MARK: museHarness
 * @description The Muse Code AgentHarness: it spawns the `muse exec` CLI
 *   headlessly per stage turn, parses its `--json` NDJSON stream
 *   (`museStreamParser.js`), maps the raw rows to the engine's normalized
 *   agent-event vocabulary (`museEventMapper.js`), and exposes the full
 *   AgentHarness / HarnessSession contract (`api/agent/harnessContract.js`)
 *   — the same conformance gate the pi and antigravity harnesses pass.
 *
 *   Transports (Tier 2): `auto` (default) engages the MSP transport — a
 *   per-project `muse serve` host speaking JSON-RPC, with a live model
 *   catalogue via `model/list` — when the resolved binary advertises
 *   `serve`, and falls back to the exec transport on MSP startup failure;
 *   `KAINBAIN_MUSE_MSP=off` is the documented exec-only rollback.
 *
 *   Exec lifecycle: one `prompt(text)` = ONE `muse exec` process, pinned to
 *   one `--session-id` per KainBain session (multi-turn continuity) with a
 *   resolved model plumbed through `--model`.
 *
 *   Model contract: on MSP the harness declares `modelSelection: "list"`
 *   (the engine may dispatch a model ref, pinned via `session/setModel`); on
 *   exec it declares `"none"` — there is no exec-side catalogue, so the
 *   curated fallback applies and the monitor shows no Model pill. Alias
 *   targets for muse must leave the model blank on the exec transport
 *   (`none`); on MSP (`list`) they must name a catalogued model like any
 *   other list harness — the API refuses muse + model rows on exec and
 *   blank muse rows on MSP, and the load path blanks legacy exec ones.
 *
 *   Safety: argv/env come from `musePermissions.js` — `--workspace` is
 *   always pinned, `--yolo` is ON by default (operator-chosen: no approval
 *   UI exists yet; KAINBAIN_MUSE_YOLO=0 restores sandbox-on), and the flag
 *   is constructed ONLY from the resolved setting — never from prompt text.
 *   The child env is redacted, and an engine-side watchdog (SIGTERM → SIGKILL)
 *   backs every run. Every spawn and settle emits one [MUSE] system-log
 *   line via the event bridge carrying the argv SHAPE (flags only — prompt
 *   text is elided to its length, never logged), pid, exit code, duration,
 *   terminal record kind, and stderr-tail size on failure.
 */

/** Child-process supervision (spawn, watchdog SIGTERM→SIGKILL, stderr ring,
 *  UTF-8 decoders) is owned by the shared scaffold
 *  (`../shared/harnessScaffold.js`); this file keeps argv shape, run-outcome
 *  semantics, and event translation. */

/***
 * MARK: argvShape
 * @description Renders an argv array as its flag SHAPE for logs: flags and
 *   their option values are kept, but the prompt payload (final element, or
 *   the --prompt-file path) is elided to a length marker so prompt text
 *   never leaks into logs.
 ***/
export function museArgvShape(args) {
	const shape = [];
	for (let i = 0; i < args.length; i += 1) {
		const token = args[i];
		if (token === "--prompt-file") {
			shape.push("--prompt-file", "<staged>");
			i += 1;
			continue;
		}
		if (token === "--workspace" || token === "--approval-mode" || token === "--model") {
			shape.push(token, args[i + 1] ?? "");
			i += 1;
			continue;
		}
		if (token.startsWith("--")) {
			shape.push(token);
			continue;
		}
		shape.push(`<prompt:${Buffer.byteLength(String(token), "utf8")}B>`);
	}
	return shape.join(" ");
}

/***
 * MARK: createMuseSession
 * @description Builds one HarnessSession backed by per-turn `muse exec`
 *   processes. The session owns the spawn lifecycle (watchdog, abort
 *   escalation, stderr capture, prompt-file cleanup), delivers NORMALIZED
 *   events via `subscribe`, and implements the model-control surface by
 *   delegating to the harness catalogue (listModels / resolveModelRef) and
 *   tracking a switchable active model for `--model` passthrough.
 * @param {Object} project - The project entity (cwd is REQUIRED: every muse run is pinned to the project workspace).
 * @param {Object} [meta] - { taskId, stageId } run metadata (fresh sessions per stage).
 * @param {Object} harness - The owning muse harness (settings + log).
 * @returns {Object} The contract-conforming HarnessSession.
 ***/
function createMuseSession(project, meta, harness, { initialModel = null } = {}) {
	if (!project || !project.cwd) {
		throw new Error(
			"Muse sessions require a project with a cwd (muse runs are pinned to the project workspace)",
		);
	}

	const handlers = new Set();
	const messages = [];
	const runLabel = `${meta?.stageId || "adhoc"}:${meta?.taskId || "chat"}`;
	// Multi-turn continuity on the exec transport: reuse ONE session id for
	// this KainBain session so `muse exec --session-id` chains context across
	// turns (the CLI mints its own id otherwise, losing continuity).
	const execSessionId = generateUuidV7();

	let disposed = false;
	let streaming = false;
	let lastAssistantText = "";
	let liveSup = null;
	let selfAborted = false;
	// The active model is plumbed through --model on every spawn; switchModel
	// re-pins it (unresolvable refs warn and keep the current model).
	let activeModel = initialModel ? { ...initialModel } : null;

	const deliver = (event) => {
		for (const handler of [...handlers]) handler(event);
	};

	function spawnMuseRun(promptText, { onAssistantDelta } = {}) {
		return new Promise((resolveRun) => {
			const runState = {
				response: "",
				status: null,
				error: null,
				sawTerminal: false,
				terminalKind: null,
				deltaText: "",
			};
			const startedAt = Date.now();
			const parser = createMuseStreamParser();
			const runFacts = {
				harness: "muse",
				approvalMode: harness.settings.approvalMode,
				yolo: Boolean(harness.settings.yolo),
			};
			const mapper = createMuseEventMapper({ runFacts });

			let planPromise;
			try {
				planPromise = buildMuseSpawnPlan({
					prompt: promptText,
					workspaceDir: project.cwd,
					// A resolved/switched model is plumbed through --model, and
					// one session id per KainBain session gives multi-turn continuity.
					modelId: activeModel?.id ?? null,
					sessionId: execSessionId,
					settings: harness.settings,
				});
			} catch (planError) {
				const message = `Failed to build muse spawn plan: ${planError?.message || planError}`;
				deliver({ type: "run_error", error: message });
				resolveRun({ ...runState, status: "ERROR", error: message });
				return;
			}

			planPromise.then(
				(plan) => {
					const childEnv = buildMuseChildEnv();
					let sup;
					try {
						// Spawn mechanics (options, decoders, stderr ring, watchdog
						// SIGTERM→SIGKILL) are owned by the shared scaffold; the
						// run-outcome handlers below stay here (protocol mapping).
						sup = startSupervisedSpawn(plan.command, plan.args, {
							cwd: project.cwd,
							env: childEnv,
							timeoutMs: harness.settings.timeoutMs,
							onTimeout: () => {
								runState.timedOut = true;
								runState.status = "ERROR";
								runState.error = `muse run timed out after ${harness.settings.timeoutMs}ms`;
							},
						});
					} catch (spawnError) {
						const message = `Failed to start muse CLI '${plan.command}': ${spawnError?.message || spawnError}`;
						deliver({ type: "run_error", error: message });
						plan.cleanup?.().finally(() => {
							resolveRun({ ...runState, status: "ERROR", error: message });
						});
						return;
					}
					const child = sup.child;
					const { stdoutDecoder, stderrDecoder, stderr } = sup;
					liveSup = sup;
					harness.log(
						`[MUSE] spawn ${runLabel}: ${museArgvShape(plan.args)} pid=${child.pid ?? "?"}`,
					);

					const settle = (outcome) => {
						if (runState.settled) return;
						runState.settled = true;
						sup.dispose();
						liveSup = null;
						const durationMs = Date.now() - startedAt;
						const tailChars = stderr.text().length;
						harness.log(
							`[MUSE] settle ${runLabel}: exit=${outcome.exitCode ?? "?"} terminal=${runState.terminalKind || "none"} durationMs=${durationMs} stderrChars=${tailChars}`,
						);
						plan.cleanup?.().finally(() => resolveRun(outcome));
					};

					function ingestRows(rows) {
						for (const row of rows) {
							for (const event of mapper.map(row)) {
								if (
									event.type === "assistant_delta" &&
									typeof event.delta === "string"
								) {
									runState.deltaText += event.delta;
									onAssistantDelta?.(event.delta);
								}
								if (event.type === "run_finished") {
									runState.sawTerminal = true;
									runState.terminalKind = "completed";
									runState.status = "COMPLETED";
									if (typeof event.response === "string") {
										runState.response = event.response;
									}
								}
								if (event.type === "run_error") {
									runState.sawTerminal = true;
									runState.terminalKind = "failed";
									runState.status = "ERROR";
									runState.error =
										typeof event.error === "string"
											? event.error
											: "muse run failed";
								}
								deliver(event);
							}
						}
					}

					child.stdout.on("data", (chunk) => {
						ingestRows(parser.push(stdoutDecoder.write(chunk)));
					});

					child.stderr.on("data", (chunk) => {
						stderr.push(stderrDecoder.write(chunk));
					});

					child.on("error", (error) => {
						if (runState.settled) return;
						runState.status = "ERROR";
						runState.error = `Failed to start muse CLI '${plan.command}': ${error.message}`;
						deliver({ type: "run_error", error: runState.error });
						settle({ ...runState, exitCode: null, aborted: selfAborted });
					});

					child.on("close", (code) => {
						if (runState.settled) return;
						ingestRows(parser.push(stdoutDecoder.end()));
						stderr.push(stderrDecoder.end());
						ingestRows(parser.flush());

						if (runState.sawTerminal) {
							settle({ ...runState, exitCode: code, aborted: selfAborted });
							return;
						}
						if (selfAborted) {
							deliver({
								type: "run_finished",
								status: "aborted",
								interrupted: true,
							});
							settle({
								...runState,
								status: "ABORTED",
								exitCode: code,
								aborted: true,
							});
							return;
						}
						if (runState.timedOut) {
							deliver({ type: "run_error", error: runState.error });
							settle({ ...runState, exitCode: code, aborted: false });
							return;
						}
						const tail = stderr.text();
						runState.status = "ERROR";
						runState.error =
							`muse exited with code ${code ?? "unknown"} without a terminal record` +
							(tail ? `: ${tail}` : "");
						deliver({ type: "run_error", error: runState.error });
						settle({ ...runState, exitCode: code, aborted: false });
					});
				},
				(planError) => {
					const message = `Failed to build muse spawn plan: ${planError?.message || planError}`;
					deliver({ type: "run_error", error: message });
					resolveRun({ ...runState, status: "ERROR", error: message });
				},
			);
		});
	}

	const session = {
		harnessId: "muse",
		harnessName: "muse",
		runLabel,

		get isStreaming() {
			return streaming;
		},

		getMessages: () => messages,

		getLastAssistantText: () => lastAssistantText,

		async prompt(text, { onChunk } = {}) {
			if (disposed) throw new Error("Muse session is disposed");
			if (streaming) {
				throw new Error("Muse session is already running a prompt");
			}
			messages.push({ role: "user", content: text });
			streaming = true;
			selfAborted = false;
			let turnText = "";
			lastAssistantText = "";

			try {
				const outcome = await spawnMuseRun(text, {
					onAssistantDelta: (delta) => {
						lastAssistantText += delta;
						onChunk?.(delta);
					},
				});
				turnText =
					typeof outcome.response === "string" && outcome.response.trim()
						? outcome.response
						: lastAssistantText;
				if (turnText) {
					messages.push({ role: "assistant", content: turnText });
				}
				return turnText;
			} finally {
				streaming = false;
				liveSup = null;
			}
		},

		subscribe(handler) {
			handlers.add(handler);
			return () => handlers.delete(handler);
		},

		async abort() {
			if (!liveSup) return { status: "idle" };
			selfAborted = true;
			// SIGTERM with scaffold-owned SIGKILL escalation (the escalation
			// now actually fires for delivered-but-ignored SIGTERMs — see the
			// NOTE in harnessScaffold.js).
			liveSup.kill("SIGTERM");
			return { status: "aborted" };
		},

		async dispose() {
			if (disposed) return;
			disposed = true;
			if (liveSup) {
				selfAborted = true;
				liveSup.kill("SIGKILL");
				liveSup = null;
			}
			handlers.clear();
		},

		async getActiveModel() {
			return activeModel ? { ...activeModel } : null;
		},

		async listModels(opts) {
			return harness.listModels(opts);
		},

		async resolveModelRef(ref) {
			return harness.resolveModelRef(ref);
		},

		/***
		 * MARK: switchModel
		 * @description Re-pins the active model; on the exec transport the pin
		 *   travels with the next spawn as `--model`. An unresolvable ref
		 *   warns and returns null — never a silent swap.
		 ***/
		async switchModel(ref) {
			const resolved = await harness.resolveModelRef(ref).catch(() => null);
			if (!resolved) {
				harness.log(
					`[WARN] Requested model '${typeof ref === "string" ? ref : ref?.id}' could not be resolved on the muse harness; the stage keeps the current model.`,
				);
				return null;
			}
			activeModel = { ...resolved };
			return activeModel;
		},
	};

	return session;
}

/***
 * MARK: createMuseHarness
 * @description Builds the Muse Code AgentHarness: the engine's entry point
 *   for creating muse-backed sessions. Same factory signature as the pi and
 *   antigravity harnesses (it registers into the same harness seam), with
 *   every muse setting overridable for tests.
 * @example const harness = createMuseHarness({ eventBridge });
 * @example const session = await harness.createSession(project, { taskId, stageId });
 * @param {Object} [deps]
 * @param {Object} [deps.eventBridge] - The EventBridge singleton (injected for testability).
 * @param {string} [deps.museBin] - Override the muse binary path (tests use the fixture mock).
 * @param {string} [deps.approvalMode] - Override --approval-mode.
 * @param {boolean} [deps.yolo] - Override the --yolo opt-in (default false).
 * @param {boolean} [deps.trustWorkspace] - Override --trust-workspace.
 * @param {boolean} [deps.noSessionLog] - Override --no-session-log.
 * @param {number} [deps.timeoutMs] - Override the engine-side watchdog duration.
 * @param {string|Array} [deps.extraArgs] - Override KAINBAIN_MUSE_ARGS.
 * @param {string} [deps.mspMode] - Transport selection: "on" (MSP serve session), "off" (exec), "auto" (default; MSP when the muse binary advertises `serve`).
 * @param {string} [deps.mspBin] - Standalone `muse serve` binary override (engages MSP; tests use the mock host).
 * @param {boolean} [deps.supportsServe] - Serve-probe override (tests inject; skips the real spawn probe).
 * @param {string} [deps.mspProvider] - Provider for the serve host (default meta; tests use echo).
 * @param {number} [deps.mspStartTimeoutMs] - Handshake ceiling for the MSP session start.
 * @param {number} [deps.mspHostIdleTtlMs] - Idle TTL before an unused serve host is disposed.
 * @param {number} [deps.mspTurnSettleGraceMs] - Watchdog settle grace before a wedged turn force-settles.
 * @returns {Object} The AgentHarness for muse.
 ***/
export function createMuseHarness(deps = {}) {
	const { eventBridge } = deps;
	const rawSettings = resolveMuseSettings(deps);
	// Resolved FIRST: the settings literal below carries the MSP-only knobs
	// the MSP session reads off harness.settings.
	const mspSettings = resolveMuseMspSettings(deps);
	const settings = {
		// Bare names resolve through PATH + standard install dirs
		// (~/.local/bin, ~/bin) so an off-PATH install still runs; explicit
		// paths and PATH hits pass through verbatim (see resolveSpawnBinary).
		bin: resolveSpawnBinary(deps.museBin || config.museBin || rawSettings.bin),
		approvalMode: deps.approvalMode || config.museApprovalMode || rawSettings.approvalMode,
		yolo:
			deps.yolo !== undefined
				? Boolean(deps.yolo)
				: (rawSettings?.yolo ?? config.museYolo ?? true),
		trustWorkspace:
			deps.trustWorkspace !== undefined
				? Boolean(deps.trustWorkspace)
				: Boolean(config.museTrustWorkspace || rawSettings.trustWorkspace),
		noSessionLog:
			deps.noSessionLog !== undefined
				? Boolean(deps.noSessionLog)
				: Boolean(config.museNoSessionLog || rawSettings.noSessionLog),
		timeoutMs: deps.timeoutMs || config.museTimeoutMs || rawSettings.timeoutMs,
		extraArgs: deps.extraArgs !== undefined ? deps.extraArgs : (config.museArgs ?? rawSettings.extraArgs),
		// MSP-only knobs the MSP session reads off harness.settings (the
		// turn/start ceiling and the watchdog settle grace); harmless on exec.
		mspStartTimeoutMs: mspSettings.mspStartTimeoutMs,
		mspTurnSettleGraceMs: mspSettings.mspTurnSettleGraceMs,
	};

	const log = (message, projectId) => {
		if (!message) return;
		const target = projectId || deps.projectId || "muse";
		eventBridge?.emitSystemLog?.(target, message, {
			projectId: projectId || deps.projectId || null,
			tag: "[MUSE]",
			level: "info",
		});
	};

	// --- MSP transport wiring (Tier 2) -------------------------------------
	// Transport selection mirrors the vibe-ACP shape: `off` is the documented
	// rollback to the exec path, `on` forces MSP, `auto` engages MSP only when
	// the resolved muse binary advertises `serve` (or an explicit MSP binary
	// is configured) — old installs and the test mock keep running on exec.
	const transport = selectMuseTransport(
		{ mspMode: mspSettings.mspMode, mspBin: mspSettings.mspBin, bin: settings.bin },
		typeof deps.supportsServe === "function" ? { supportsServe: deps.supportsServe } : undefined,
	);
	const effectiveApprovalMode = resolveMuseMspApprovalMode({ yolo: settings.yolo });

	async function startMuseServeHost(workspaceKey) {
		const command = resolveSpawnBinary(mspSettings.mspBin || settings.bin);
		const plan = buildMuseServeSpawnPlan({
			workspaceDir: workspaceKey,
			settings: {
				bin: command,
				provider: deps.mspProvider,
				yolo: settings.yolo,
				trustWorkspace: settings.trustWorkspace,
				noSessionLog: settings.noSessionLog,
				mspExtraArgs: deps.mspExtraArgs,
			},
		});
		const runtime = new MspSessionRuntime({
			command: plan.command,
			args: plan.args,
			cwd: workspaceKey,
			env: { ...sanitizeMuseMspEnv(), ...(mspSettings.mspEnv || {}) },
			initializeParams: buildMuseMspHandshake(),
			startTimeoutMs: mspSettings.mspStartTimeoutMs,
			hostSettings: { yolo: settings.yolo },
			log: (message) => log(`[MUSE MSP] ${message}`),
		});
		try {
			await runtime.start();
		} catch (error) {
			const classified = classifyMuseMspStartupFailure(error, { bin: plan.command });
			log(`[MUSE MSP] host start failed [${classified.code}]: ${classified.message} ${classified.hint}`);
			throw error;
		}
		return runtime;
	}

	const hostPool = createMuseServeHostPool({
		startHost: startMuseServeHost,
		idleTtlMs: mspSettings.mspHostIdleTtlMs,
		log: (message) => log(`[MUSE MSP] ${message}`),
	});

	const catalog = createMuseMspModelCatalog({
		settings: {
			bin: settings.bin,
			mspBin: mspSettings.mspBin,
			provider: deps.mspProvider,
			yolo: settings.yolo,
			trustWorkspace: settings.trustWorkspace,
			noSessionLog: settings.noSessionLog,
			mspStartTimeoutMs: mspSettings.mspStartTimeoutMs,
			mspEnv: mspSettings.mspEnv,
		},
		log,
	});
	// --- end MSP transport wiring ------------------------------------------

	const harness = {
		id: "muse",

		/** Model catalogue: MSP serves the live `model/list` catalogue (the UI
		 *  shows the model control); the exec transport has none (hide it). */
		modelSelection: transport === "msp" ? "list" : "none",
		reasoningLevels: null,

		settings,
		transport,
		effectiveApprovalMode,
		hostPool,
		log,

		async modelRuntime() {
			const models = transport === "msp" ? await catalog.listModels() : [];
			return {
				getAvailableSnapshot: async () => models,
				getModels: async () => models,
				getModel: () => null,
			};
		},

		/** Model catalogue: MSP serves the live `model/list` catalogue;
		 *  the exec transport has none, so an empty list is the honest answer. */
		async listModels(opts) {
			if (transport !== "msp") return [];
			return catalog.listModels(opts);
		},

		async resolveModelRef(ref) {
			if (transport !== "msp") return null;
			return catalog.resolveModelRef(ref);
		},

		/***
		 * MARK: readHistoryFromDisk
		 * @description Reads a persisted muse session's history via
		 *   `muse export --redacted` and maps the export document onto
		 *   `{ messages, tree }`. The engine passes the KainBain session
		 *   DIRECTORY as `sessionRef`; muse keeps its own store keyed by
		 *   workspace, so only a UUID-shaped ref scopes the export to one
		 *   session (`--session <id>`) — anything else (a directory, null)
		 *   reads the workspace's most recent retained session (`--last`).
		 *   Any export failure degrades to the honest empty history.
		 * @example await harness.readHistoryFromDisk(project, "/repo/.kainbain/sessions") => { messages: [...], tree: [] }
		 * @param {Object} project - The project entity (cwd pins the export).
		 * @param {string|Object} [sessionRef] - The session id, the session dir, or `{ sessionId }`.
		 * @returns {Promise<Object>} { messages, tree }.
		 ***/
		async readHistoryFromDisk(project, sessionRef) {
			const sessionId =
				typeof sessionRef === "string"
					? sessionRef
					: sessionRef?.sessionId || project?.museSessionId || null;
			return readMuseExportHistory({
				sessionId,
				workspaceDir: project?.cwd || process.cwd(),
				settings: { bin: settings.bin },
			});
		},

		/***
		 * MARK: getModelDiscoveryStatus
		 * @description Reports the harness's model-discovery health (`{ ok:
		 *   true }` or `{ ok: false, error: { code, message, hint } }`) from
		 *   binary resolution: the exec transport has no model catalogue to
		 *   fail (its listModels is always []), but a missing binary means
		 *   stages cannot run at all, so that surfaces here in the same vocabulary
		 *   the antigravity harness uses. Optional contract method: routes
		 *   consult it when present and serve the error alongside an empty
		 *   catalogue.
		 * @example harness.getModelDiscoveryStatus() => { ok: true }
		 * @returns {Object} The discovery status.
		 ***/
		getModelDiscoveryStatus() {
			if (transport === "msp") return catalog.getModelDiscoveryStatus();
			if (binaryAvailable(settings.bin)) return { ok: true };
			return {
				ok: false,
				error: {
					code: "MUSE_BIN_MISSING",
					message: `The muse CLI was not found ('${settings.bin}' is not on PATH).`,
					hint: "Install the Muse CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_MUSE_BIN to its absolute path.",
				},
			};
		},

		/***
		 * MARK: probeHealth
		 * @description Offline health probe: resolves the binary and reports
		 *   its `muse --version` string so version drift is visible. Never
		 *   runs inference and never touches project state.
		 ***/
		async probeHealth() {
			const started = Date.now();
			const version = await new Promise((resolve) => {
				const timer = setTimeout(() => resolve(null), 4000);
				if (timer.unref) timer.unref();
				execFile(
					settings.bin,
					["--version"],
					{ timeout: 4000 },
					(error, stdout) => {
						clearTimeout(timer);
						if (error) return resolve(null);
						resolve(String(stdout || "").trim().slice(0, 200) || null);
					},
				);
			});
			if (!version) {
				return {
					name: "muse",
					status: "error",
					latencyMs: Date.now() - started,
					timestamp: new Date().toISOString(),
					message: `muse binary '${settings.bin}' not resolvable`,
					binary: settings.bin,
				};
			}
			return {
				name: "muse",
				status: "ok",
				latencyMs: Date.now() - started,
				timestamp: new Date().toISOString(),
				message: `muse reachable (${version})`,
				binary: settings.bin,
				version,
			};
		},

		/***
		 * MARK: createSession
		 * @description Creates a muse session on the selected transport. On the
		 *   MSP transport the shared per-project host is started eagerly; a
		 *   startup failure is classified, logged with the
		 *   `KAINBAIN_MUSE_MSP=off` rollback hint, and fails over to the exec
		 *   transport — never a silent no-op. A dispatch-resolved `model` is
		 *   pinned via `session/setModel` on MSP and plumbed through `--model`
		 *   on the exec fallback.
		 * @param {Object} project - The project entity (cwd required).
		 * @param {Object} [meta] - { taskId, stageId, sessionDir, model } run metadata.
		 * @returns {Promise<Object>} The contract-conforming session.
		 ***/
		async createSession(project, { taskId, stageId, sessionDir, model } = {}) {
			let initialModel = null;
			if (transport === "msp" && typeof model === "string" && model.trim()) {
				const pinned = await catalog.resolveModelRef(model);
				if (!pinned) {
					log(
						`[WARN] Dispatch-resolved model '${model}' could not be resolved against the muse catalogue; the session's default model will be used.`,
						project?.id,
					);
				}
				initialModel = pinned;
			}
			if (transport === "msp") {
				const session = createMuseMspSession(
					project,
					{ taskId, stageId, sessionDir },
					harness,
					{ initialModel },
				);
				try {
					// Eager start proves the host + session before a stage turn, so a
					// broken host fails over here instead of mid-stage.
					await session.ensureHost();
					return session;
				} catch (error) {
					const classified = classifyMuseMspStartupFailure(error, {
						bin: mspSettings.mspBin || settings.bin,
					});
					log(
						`[WARN] MSP session start failed [${classified.code}]: ${classified.message} Falling back to the exec transport. ${classified.hint}`,
						project?.id,
					);
					await session.dispose().catch(() => {});
				}
			}
			return createMuseSession(project, { taskId, stageId, sessionDir }, harness, {
				initialModel,
			});
		},
	};

	return harness;
}
