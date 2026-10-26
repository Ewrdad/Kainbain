import { createHash } from "node:crypto";
import { startSupervisedSpawn } from "../shared/harnessScaffold.js";
import { resolveSpawnBinary } from "../../harnessDiscovery.js";
import { config } from "../../../config.js";
import {
	classifyAgyCrashExit,
	classifyAgyRunTimeout,
	classifyAgySpawnError,
	formatAgyRunError,
} from "./agyRunErrors.js";
import {
	classifiesForeignHarness,
	harnessModelKey,
	normalizeModelRef,
	parseModelKey,
} from "../../../../shared/modelKeys.js";

/** Stable harness identity (registry id + model-key scope). */
const HARNESS_ID = "antigravity";

/** `${projectId}:${ref}` keys already warned about, so hot loops cannot spam logs. */
const warnedInitialModels = new Set();

/***
 * MARK: foreignHarnessOf
 * @description Names the owning harness when a stored ref is a canonical
 *   3-part key scoped to ANOTHER harness (a pi-catalog model asked of the
 *   antigravity catalog) — null otherwise. Only the canonical form
 *   classifies; legacy 2-part and bare refs are harness-agnostic by design.
 * @example foreignHarnessOf('pi::google::m') => 'pi'
 * @param {unknown} ref - Any stored model reference.
 * @returns {string|null} The foreign harness id, or null.
 ***/
function foreignHarnessOf(ref) {
	if (!classifiesForeignHarness(ref, HARNESS_ID)) return null;
	return parseModelKey(String(ref).trim())?.harness || null;
}
import {
	buildAgyArgs,
	buildAgyChildEnv,
	parseAgyAllowRules,
	parseAgyDurationMs,
} from "./agyPermissions.js";
import { createAgyStreamParser } from "./agyStreamParser.js";
import { createAgyEventMapper } from "./agyEventMapper.js";
import { createAgyModelCatalog } from "./agyModelCatalog.js";
import { AcpSessionRuntime } from "../acp/AcpSessionRuntime.js";
import { AcpSessionWrapper } from "../acp/AcpSessionWrapper.js";
import {
	buildAgyAcpHandshake,
	buildAgyAcpSessionParams,
	classifyAgyAcpStartupFailure,
	detectSwallowed502,
	resolveAgyAcpEndpoint,
	resolveAgyPermissionDecision,
	sanitizeAgyAcpEnv,
	swallowed502Error,
} from "./agyAcpSupport.js";

/**
 * MARK: agyHarness
 * @description The antigravity AgentHarness: it spawns the `agy` CLI (Google
 *   Antigravity) headlessly per stage turn, parses its `--output-format
 *   stream-json` NDJSON stream (`agyStreamParser.js`), maps the raw rows to
 *   the engine's normalized agent-event vocabulary (`agyEventMapper.js`), and
 *   exposes the full AgentHarness / HarnessSession contract
 *   (`api/agent/harnessContract.js`) — the same conformance gate the pi
 *   harness passes.
 *
 *   Lifecycle: one `prompt(text)` = ONE `agy -p <prompt>` process (stage
 *   executions begin fresh sessions, so per-stage spawn matches the engine's
 *   fresh-per-stage semantics). Within one session, conversation continuity
 *   is carried by agy's own `--conversation <id>` once an `init` event has
 *   revealed the conversation id.
 *
 *   Safety: argv/env come from `agyPermissions.js` — `--sandbox` is omitted
 *   and `--dangerously-skip-permissions` is passed by operator-chosen default
 *   (YOLO), both reversible via config/env; every spawn logs its effective
 *   model/permissions and the run-open transcript line repeats them. The
 *   child env is redacted, and an engine-side watchdog (SIGTERM → SIGKILL)
 *   backs the CLI's own `--print-timeout`.
 */

/** Child-process supervision (spawn, watchdog SIGTERM→SIGKILL, stderr ring,
 *  UTF-8 decoders) is owned by the shared scaffold
 *  (`../shared/harnessScaffold.js`); this file keeps argv shape, run-outcome
 *  semantics, and event translation. */

/***
 * MARK: resolveAgySettings
 * @description Resolves the harness's agy settings from injected overrides or
 *   the engine configuration. Every knob is overridable so tests can point the
 *   harness at the fixture mock binary without touching the environment.
 * @example resolveAgySettings({ agyBin: "/path/to/mock-agy.mjs" }).bin => "/path/to/mock-agy.mjs"
 * @param {Object} [deps] - Injected overrides (agyBin, printTimeout, sandbox, skipPermissions, allowRules).
 * @returns {Object} { bin, printTimeout, watchdogMs, sandbox, skipPermissions, allowRules }.
 ***/
function resolveAgySettings(deps = {}) {
	const printTimeout = deps.printTimeout || config.agyPrintTimeout || "10m";
	const allowRaw =
		deps.allowRules !== undefined ? deps.allowRules : config.agyAllow;
	// Transport selection: "on" forces the two-way ACP session, "off" forces
	// the legacy per-turn exec, and "auto" (default) stays on exec unless an
	// explicit ACP endpoint is configured — existing deployments never pay a
	// speculative ACP probe per stage. Tests point acpBin at the mock fixture.
	const acpBinRaw = deps.acpBin !== undefined ? deps.acpBin : config.agyAcpBin;
	const acpModeRaw = deps.acpMode !== undefined ? deps.acpMode : config.agyAcpMode;
	return {
		// Bare names resolve through PATH + standard install dirs
		// (~/.local/bin, ~/bin) so an off-PATH install still runs; explicit
		// paths and PATH hits pass through verbatim (see resolveSpawnBinary).
		bin: resolveSpawnBinary(deps.agyBin || config.agyBin || "agy"),
		printTimeout,
		watchdogMs: deps.watchdogMs || parseAgyDurationMs(printTimeout) || 600000,
		acpMode: typeof acpModeRaw === "string" && acpModeRaw.trim() ? acpModeRaw.trim() : "auto",
		acpBin: typeof acpBinRaw === "string" ? acpBinRaw.trim() : "",
		// Handshake ceiling for the ACP session start (tests shorten it; the
		// per-turn watchdog stays engine-side, as with the exec transport).
		acpStartTimeoutMs: deps.acpStartTimeoutMs || 30000,
		sandbox:
			deps.sandbox === undefined
				? config.agySandbox === true
				: Boolean(deps.sandbox),
		skipPermissions:
			deps.skipPermissions === undefined
				? config.agySkipPermissions !== false
				: Boolean(deps.skipPermissions),
		allowRules: parseAgyAllowRules(allowRaw),
	};
}

/***
 * MARK: promptFacts
 * @description Captures redacted prompt metadata for one run: the prompt's
 *   character count plus its SHA-256 hex digest — enough to correlate a run
 *   with its instruction size and to detect retry-identical prompts, without
 *   ever storing raw prompt text (or secrets) in the run metadata.
 * @example promptFacts("hi") => { promptChars: 2, promptHash: "8f434…" }
 * @param {string} promptText - The raw stage prompt for this run.
 * @returns {Object} { promptChars, promptHash } — never the raw text.
 ***/
function promptFacts(promptText) {
	const text = typeof promptText === "string" ? promptText : String(promptText ?? "");
	return {
		promptChars: text.length,
		promptHash: createHash("sha256").update(text, "utf8").digest("hex"),
	};
}

/***
 * MARK: formatDiscoveryFailureStatus
 * @description Renders one discovery status as a warning suffix: "" when
 *   discovery is healthy (or the harness never reported a status), otherwise
 *   the failure code + reason + fix. Shared by the harness and session
 *   unresolvable-model warnings so both name the same cause.
 * @example formatDiscoveryFailureStatus({ ok: true }) => ""
 * @example formatDiscoveryFailureStatus({ ok: false, error: { code: "AGY_BIN_MISSING", message: "m", hint: "h" } }) => " Antigravity model discovery failed [AGY_BIN_MISSING]: m h"
 * @param {Object|null} status - `{ ok, error? }` from `getModelDiscoveryStatus`.
 * @returns {string} The suffix ("" when healthy).
 ***/
function formatDiscoveryFailureStatus(status) {
	if (!status || status.ok !== false || !status.error) return "";
	return ` Antigravity model discovery failed [${status.error.code}]: ${status.error.message} ${status.error.hint}`;
}

/***
 * MARK: createAgySession
 * @description Builds one HarnessSession backed by per-turn `agy` processes.
 *   The session owns the spawn lifecycle (watchdog, abort escalation, stderr
 *   capture), delivers NORMALIZED events via `subscribe`, reconstructs the
 *   conversation from the stream, and implements the optional model-control
 *   surface (`getActiveModel`/`switchModel`/`listModels`) against the
 *   harness's model catalog.
 * @param {Object} project - The project entity (cwd is REQUIRED: every agy run is pinned to the project workspace).
 * @param {Object} [meta] - { taskId, stageId } run metadata (fresh sessions per stage).
 * @param {Object} harness - The owning antigravity harness (model catalog + settings).
 * @returns {Object} The contract-conforming HarnessSession.
 ***/
function createAgySession(project, meta, harness, { initialModel } = {}) {
	if (!project || !project.cwd) {
		throw new Error(
			"Antigravity sessions require a project with a cwd (agy runs are pinned to the project workspace)",
		);
	}

	const handlers = new Set();
	const messages = [];
	// Diagnostic label mirroring the pi harness's per-stage run label.
	const runLabel = `${meta?.stageId || "adhoc"}:${meta?.taskId || "chat"}`;

	let disposed = false;
	let streaming = false;
	let conversationId = null; // within-session continuity (fresh per session)
	let lastAssistantText = "";
	let activeModel = initialModel || null; // project default (or switchModel / the init echo)
	let pendingModelSlug = initialModel?.id || null; // slug pinned for the NEXT spawn
	let pendingEffort = initialModel?.effort || initialModel?.reasoning || null; // effort suffix (--effort) for the NEXT spawn
	let liveSup = null;
	let selfAborted = false; // set when KainBain (not the CLI) stops the run

	const deliver = (event) => {
		for (const handler of [...handlers]) handler(event);
	};

	/***
	 * MARK: spawnAgyRun (internal)
	 * @description Spawns ONE headless agy process for the given prompt and
	 *   settles when the child exits: stream rows are parsed, mapped to
	 *   normalized events and delivered; the result line (or the process exit)
	 *   decides the run outcome. The promise resolves with
	 *   `{ response, status, error }` — it never rejects, because the
	 *   normalized run_error event is the failure signal the engine consumes.
	 ***/
	function spawnAgyRun(promptText, { onAssistantDelta } = {}) {
		return new Promise((resolveRun) => {
			const runState = {
				response: "",
				status: null,
				error: null,
				sawResult: false,
				deltaText: "",
			};
			const parser = createAgyStreamParser();
			// Run facts travel with the mapper into the run_started event so the
			// transcript can show exactly which model/permissions this spawn uses.
			// Prompt capture is redacted metadata only (size + SHA-256) — never
			// raw prompt text or secrets.
			const runFacts = {
				harness: "antigravity",
				model: pendingModelSlug,
				effort: pendingEffort,
				sandbox: Boolean(harness.settings.sandbox),
				skipPermissions: Boolean(harness.settings.skipPermissions),
				timeout: harness.settings.printTimeout,
				...promptFacts(promptText),
			};
			const mapper = createAgyEventMapper({ runFacts });
			harness.log(
				`[AGY] spawn ${runLabel}: model=${runFacts.model || "agy default"}${runFacts.effort ? ` effort=${runFacts.effort}` : ""} sandbox=${runFacts.sandbox ? "on" : "off"} approvals=${runFacts.skipPermissions ? "auto (YOLO)" : "prompt"}`,
			);
			const argv = buildAgyArgs({
				prompt: promptText,
				conversationId,
				modelSlug: pendingModelSlug,
				effort: pendingEffort,
				printTimeout: harness.settings.printTimeout,
				sandbox: harness.settings.sandbox,
				skipPermissions: harness.settings.skipPermissions,
			});
			const childEnv = buildAgyChildEnv();

			let sup;
			try {
				// Spawn mechanics (options, decoders, stderr ring, watchdog
				// SIGTERM→SIGKILL) are owned by the shared scaffold; the
				// run-outcome handlers below stay here (protocol mapping).
				// Engine-side watchdog: even with the CLI's own
				// --print-timeout, a hung child must never pin a stage
				// forever. The flag is recorded BEFORE the kill so the close
				// handler reports the timeout (not a bare crash) when the
				// killed child's close event wins the race.
				sup = startSupervisedSpawn(harness.settings.bin, argv, {
					cwd: project.cwd,
					env: childEnv,
					timeoutMs: harness.settings.watchdogMs,
					onTimeout: () => {
						runState.timedOut = true;
						runState.status = "ERROR";
						runState.timeoutClassified = classifyAgyRunTimeout({
							printTimeout: harness.settings.printTimeout,
							watchdogMs: harness.settings.watchdogMs,
						});
						runState.error = formatAgyRunError(runState.timeoutClassified);
					},
				});
			} catch (spawnError) {
				// Spawn can throw synchronously (invalid path shape) — fail fast.
				const classified = classifyAgySpawnError(spawnError, {
					bin: harness.settings.bin,
				});
				harness.log(`[AGY] spawn ${runLabel} failed [${classified.code}]: ${classified.message} ${classified.hint}`);
				runState.status = "ERROR";
				runState.error = formatAgyRunError(classified);
				deliver({ type: "run_error", error: runState.error, code: classified.code, hint: classified.hint });
				resolveRun(runState);
				return;
			}
			const child = sup.child;
			const { stdoutDecoder, stderrDecoder, stderr } = sup;
			liveSup = sup;

			const settle = (outcome) => {
				if (runState.settled) return;
				runState.settled = true;
				sup.dispose();
				liveSup = null;
				resolveRun(outcome);
			};

			/***
			 * MARK: ingestRows (internal)
			 * @description Consumes parsed stream rows: updates the run state from
			 *   `init`/`result` rows and delivers every mapped normalized event.
			 *   Shared by the stdout data handler and the close handler (which
			 *   flushes the decoder tail + parser tail), so both paths handle rows
			 *   identically.
			 ***/
			function ingestRows(rows) {
				for (const row of rows) {
					if (row.event === "init") {
						conversationId = row.conversationId || conversationId;
						// The init echo reflects the model the CLI will actually use.
						if (typeof row.payload?.model === "string" && row.payload.model) {
							activeModel = { provider: "antigravity", id: row.payload.model };
						}
					}
					if (row.event === "result") {
						runState.sawResult = true;
						runState.status = row.payload?.status ?? "UNKNOWN";
						runState.error =
							typeof row.payload?.error === "string" ? row.payload.error : null;
						if (typeof row.payload?.response === "string") {
							runState.response = row.payload.response;
						}
					}
					for (const event of mapper.map(row)) {
						if (event.type === "assistant_delta" && typeof event.delta === "string") {
							runState.deltaText += event.delta;
							onAssistantDelta?.(event.delta);
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
				// Spawn failure (ENOENT etc.): no events will ever arrive. Node also
				// emits 'close' for a failed spawn — the settled guard below keeps
				// this the ONLY run_error for the run.
				if (runState.settled) return;
				const classified = classifyAgySpawnError(error, {
					bin: harness.settings.bin,
				});
				harness.log(`[AGY] spawn ${runLabel} failed [${classified.code}]: ${classified.message} ${classified.hint}`);
				runState.status = "ERROR";
				runState.error = formatAgyRunError(classified);
				deliver({ type: "run_error", error: runState.error, code: classified.code, hint: classified.hint });
				settle({ ...runState, aborted: selfAborted });
			});

			child.on("close", (code, signal) => {
				// The run already settled (spawn failure delivered run_error via the
				// 'error' event — Node emits BOTH 'error' and 'close' for a failed
				// spawn): never report the same failed run twice.
				if (runState.settled) return;
				// Flush any bytes the decoder still held, then the parser's final
				// unterminated line — both through the SAME row path as live data.
				ingestRows(parser.push(stdoutDecoder.end()));
				stderr.push(stderrDecoder.end());
				ingestRows(parser.flush());

				if (runState.sawResult) {
					// The result line (mapped above) is authoritative; just settle.
					settle({ ...runState, aborted: selfAborted });
					return;
				}

				if (selfAborted) {
					// KainBain-initiated interruption is a graceful stop, not an error.
					deliver({ type: "run_finished", status: "aborted", interrupted: true });
					settle({ ...runState, status: "ABORTED", aborted: true });
					return;
				}

				if (runState.timedOut) {
					// The watchdog fired and killed the child: report the timeout,
					// not a bare crash (the killed child's close event won the race).
					// The classification names the engine watchdog ceiling that
					// tripped (not the CLI's own --print-timeout).
					const classified =
						runState.timeoutClassified ||
						classifyAgyRunTimeout({
							printTimeout: harness.settings.printTimeout,
							watchdogMs: harness.settings.watchdogMs,
						});
					runState.error = formatAgyRunError(classified);
					harness.log(`[AGY] run ${runLabel} timed out [${classified.code}]: ${classified.message} ${classified.hint}`);
					deliver({ type: "run_error", error: runState.error, code: classified.code, hint: classified.hint });
					settle({ ...runState, aborted: false });
					return;
				}

				// Process died without a result line (crash / kill / auth failure):
				// synthesize a classified run_error from the exit code / signal + the
				// stderr tail (auth-shaped tails report AGY_AUTH_REQUIRED, never
				// a bare crash).
				const tail = stderr.text();
				const classified = classifyAgyCrashExit({ code, signal, stderrTail: tail });
				harness.log(`[AGY] run ${runLabel} failed [${classified.code}]: ${classified.message} ${classified.hint}`);
				runState.status = "ERROR";
				runState.error = formatAgyRunError(classified);
				deliver({ type: "run_error", error: runState.error, code: classified.code, hint: classified.hint });
				settle({ ...runState, aborted: false });
			});
		});
	}

	const session = {
		/** Stable harness identity for engine-side diagnostics (harness-scoped
		 *  model keys on newer engine versions key off this id). */
		harnessId: "antigravity",
		harnessName: "antigravity",

		/** Diagnostic run label (stageId:taskId), mirroring the pi harness. */
		runLabel,

		get isStreaming() {
			return streaming;
		},

		getMessages: () => messages,

		getLastAssistantText: () => lastAssistantText,

		/***
		 * MARK: prompt
		 * @description Runs ONE agy process for this turn: spawns the CLI with the
		 *   contract argv, streams normalized events to subscribers, and resolves
		 *   with the run's final assistant text ("" when the run failed before any
		 *   output). Failure is signalled via the run_error event, not a rejection,
		 *   so engine consumers keep one handling path.
		 ***/
		async prompt(text, { onChunk } = {}) {
			if (disposed) throw new Error("Antigravity session is disposed");
			if (streaming) {
				throw new Error("Antigravity session is already running a prompt");
			}
			messages.push({ role: "user", content: text });
			streaming = true;
			selfAborted = false;
			let turnText = "";
			// Per-turn assistant text: reset so getLastAssistantText() reflects the
			// LATEST turn, not an accumulation across the session.
			lastAssistantText = "";

			try {
				const outcome = await spawnAgyRun(text, {
					onAssistantDelta: (delta) => {
						lastAssistantText += delta;
						onChunk?.(delta);
					},
				});

				// The assistant text for the turn: the result response when present,
				// otherwise the deltas accumulated from the stream.
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

		/***
		 * MARK: abort
		 * @description Stops the current run: SIGTERM, then SIGKILL after a grace
		 *   period. The interrupted turn settles as run_finished (status
		 *   "aborted") — an engine-initiated stop is never an agent error.
		 ***/
		async abort() {
			if (!liveSup) return { status: "idle" };
			selfAborted = true;
			// SIGTERM with scaffold-owned SIGKILL escalation (the escalation
			// now actually fires for delivered-but-ignored SIGTERMs — see the
			// NOTE in harnessScaffold.js).
			liveSup.kill("SIGTERM");
			return { status: "aborted" };
		},

		/***
		 * MARK: dispose
		 * @description Idempotent cleanup: kills any live child immediately and
		 *   clears subscribers. Safe to call twice (the conformance gate requires it).
		 ***/
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

		/***
		 * MARK: steer
		 * @description Records mid-run guidance in the conversation (Tier-2
		 *   two-way surface). The exec transport has no live turn to inject
		 *   into — the guidance lands as a user message so the NEXT prompt
		 *   carries it — and resolves `{ status: "steered" }` like the ACP
		 *   path, so engine callers keep one handling path.
		 ***/
		async steer(text) {
			if (disposed) throw new Error("Antigravity session is disposed");
			messages.push({ role: "user", content: text });
			return { status: "steered" };
		},

		/***
		 * MARK: followUp
		 * @description Records a follow-up question in the conversation
		 *   (Tier-2 two-way surface): a user message the next prompt answers,
		 *   resolving `{ status: "followed_up" }` like the ACP path.
		 ***/
		async followUp(text) {
			if (disposed) throw new Error("Antigravity session is disposed");
			messages.push({ role: "user", content: text });
			return { status: "followed_up" };
		},

		async getActiveModel() {
			return activeModel;
		},

		/***
		 * MARK: listModels (session)
		 * @description Lists the harness's models (session-level parity with the
		 *   harness contract). Listing opts (`{ refresh }`) are forwarded so a
		 *   refresh re-runs `agy models` instead of serving the TTL snapshot.
		 * @param {Object} [opts] - Forwarded to `harness.listModels`.
		 * @returns {Promise<Array<Object>>} The provider-tagged model list.
		 ***/
		async listModels(opts) {
			return harness.listModels(opts);
		},

		/***
		 * MARK: getModelDiscoveryStatus (session)
		 * @description Forwards the harness's discovery health (`{ ok: true }`
		 *   or `{ ok: false, error }`) so stage dispatch can explain an
		 *   unresolvable model instead of silently running the session default.
		 * @returns {Promise<Object>} The discovery status.
		 ***/
		async getModelDiscoveryStatus() {
			if (typeof harness.getModelDiscoveryStatus === "function") {
				return harness.getModelDiscoveryStatus();
			}
			return { ok: true };
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference against the harness's
		 *   catalog (session-level parity with the pi wrapped session, which the
		 *   engine's model-selection path prefers over the raw registry):
		 *   bare slugs, `provider::id` composite keys, and effort-suffixed refs.
		 *   null when unresolvable — callers warn, never silently swap.
		 * @returns {Promise<Object|null>} The resolved model (with `effort` when a suffix was used), or null.
		 ***/
		async resolveModelRef(ref) {
			return harness.resolveModelRef(ref);
		},

		/***
		 * MARK: switchModel
		 * @description Pins the model for the NEXT spawn. The ref is resolved via
		 *   the harness's catalog (bare slug, composite key, or an
		 *   `effort-suffixed` ref like `gemini-3.1-pro:high`); unresolvable refs
		 *   soft-fail with a logged warning (return null), exactly the semantics
		 *   agentRunner's model-switch path expects.
		 ***/
		async switchModel(ref) {
			const resolved =
				typeof ref === "string" || !ref?.id
					? await harness.resolveModelRef(ref)
					: await harness.resolveModelRef(
							ref.key ||
								harnessModelKey("antigravity", ref.provider || "antigravity", ref.id),
						);
			if (!resolved) {
				const discoverySuffix = formatDiscoveryFailureStatus(
					typeof harness.getModelDiscoveryStatus === "function"
						? await harness.getModelDiscoveryStatus()
						: null,
				);
				harness.log(
					`[WARN] Requested model '${typeof ref === "string" ? ref : ref?.id}' could not be resolved in the antigravity catalog; the stage keeps agy's default model.${discoverySuffix}`,
				);
				return null;
			}
			pendingModelSlug = resolved.id;
			const candidateEffort = resolved.effort || resolved.reasoning || null;
			const supportedEffort =
				candidateEffort && (harness.reasoningLevels || []).includes(candidateEffort)
					? candidateEffort
					: null;
			pendingEffort = supportedEffort;
			activeModel =
				supportedEffort
					? { ...resolved, effort: supportedEffort, reasoning: supportedEffort }
					: { ...resolved, effort: null, reasoning: null };
			return activeModel;
		},
	};

	return session;
}

/***
 * MARK: selectAgyTransport
 * @description Chooses the session transport: `"acp"` for the long-lived
 *   two-way ACP session, `"exec"` for the legacy per-turn CLI spawn.
 *   `"on"` forces ACP, `"off"` forces exec, and `"auto"` (default) engages
 *   ACP only when an explicit ACP endpoint is configured — existing
 *   deployments never pay a speculative ACP probe per stage.
 * @example selectAgyTransport({ acpMode: "auto", acpBin: "" }) => "exec"
 * @example selectAgyTransport({ acpMode: "auto", acpBin: "/bin/mock" }) => "acp"
 * @param {Object} settings - The resolved harness settings (acpMode, acpBin).
 * @returns {"acp"|"exec"} The transport for new sessions.
 ***/
function selectAgyTransport(settings) {
	if (settings?.acpMode === "off") return "exec";
	if (settings?.acpMode === "on") return "acp";
	if (typeof settings?.acpBin === "string" && settings.acpBin.trim()) return "acp";
	return "exec";
}

/***
 * MARK: createAcpAgySession
 * @description Builds one HarnessSession backed by a long-lived bidirectional
 *   ACP connection (the Tier-2 path): the generic core owns framing,
 *   JSON-RPC, process-group supervision, and event mapping, while the
 *   antigravity flavor contributes the entrypoint, env sanitization, the
 *   swallowed-502 filter, and the permission policy. Startup failures are
 *   classified (bin-missing / auth / timeout / discovery-failed) and logged
 *   with their fix hint; the session itself reports them as run_error.
 * @param {Object} project - The project entity (cwd is REQUIRED).
 * @param {Object} [meta] - { taskId, stageId } run metadata.
 * @param {Object} harness - The owning antigravity harness (settings + catalog + log).
 * @param {Object} [opts]
 * @param {Object|null} [opts.initialModel] - Pinned model for the session's turns.
 * @returns {Object} The contract-conforming HarnessSession.
 ***/
function createAcpAgySession(project, meta, harness, { initialModel } = {}) {
	if (!project || !project.cwd) {
		throw new Error(
			"Antigravity sessions require a project with a cwd (agy runs are pinned to the project workspace)",
		);
	}
	const runLabel = `${meta?.stageId || "adhoc"}:${meta?.taskId || "chat"}`;
	const endpoint = resolveAgyAcpEndpoint({
		agyBin: harness.settings.bin,
		acpBin: harness.settings.acpBin,
	});
	const catalogAdapter = {
		listModels: (opts) => harness.listModels(opts),
		resolveModelRef: (ref) => harness.resolveModelRef(ref),
		getModelDiscoveryStatus: () => harness.getModelDiscoveryStatus(),
	};
	return new AcpSessionWrapper({
		harnessId: "antigravity",
		runLabel,
		catalog: catalogAdapter,
		initialModel: initialModel || null,
		log: (message) => harness.log(`[AGY ACP] ${message}`, project?.id),
		permissionPolicy: async (method, params) => {
			if (method !== "requestPermission") return { outcome: { outcome: "cancelled" } };
			return resolveAgyPermissionDecision(params, {
				skipPermissions: harness.settings.skipPermissions,
			});
		},
		inspectAssistantText: (text) =>
			detectSwallowed502(text) ? swallowed502Error(text) : null,
		createRuntime: async (hooks) => {
			const runtime = new AcpSessionRuntime({
				command: endpoint.command,
				args: endpoint.args,
				cwd: project.cwd,
				env: sanitizeAgyAcpEnv(),
				initializeParams: buildAgyAcpHandshake(),
				newSessionParams: buildAgyAcpSessionParams({ cwd: project.cwd, model: initialModel }),
				startTimeoutMs: harness.settings.acpStartTimeoutMs || 30000,
				log: (message) => harness.log(`[AGY ACP] ${message}`, project?.id),
				onNotification: hooks.onNotification,
				onRequest: hooks.onRequest,
			});
			try {
				await runtime.start();
			} catch (error) {
				const classified = classifyAgyAcpStartupFailure(error, { bin: endpoint.command });
				harness.log(
					`[AGY ACP] session start failed [${classified.code}]: ${classified.message} ${classified.hint}`,
					project?.id,
				);
				throw error;
			}
			return runtime;
		},
	});
}

/***
 * MARK: createAntigravityHarness
 * @description Builds the antigravity AgentHarness: the engine's entry point
 *   for creating agy-backed sessions, discovering models, and resolving model
 *   references. Same factory signature as createPiHarness (it registers into
 *   the same harness seam), with every agy setting overridable for tests.
 * @example const harness = createAntigravityHarness({ eventBridge });
 * @example const session = await harness.createSession(project, { taskId, stageId });
 * @param {Object} [deps]
 * @param {Object} [deps.eventBridge] - The EventBridge singleton (injected for testability).
 * @param {string} [deps.agyBin] - Override the agy binary path (tests use the fixture mock).
 * @param {string} [deps.printTimeout] - Override the --print-timeout duration.
 * @param {boolean} [deps.sandbox] - Override --sandbox (default: config, off).
 * @param {boolean} [deps.skipPermissions] - Override --dangerously-skip-permissions (default: config, on).
 * @param {string} [deps.allowRules] - Override KAINBAIN_AGY_ALLOW (parsed + validated, logged-not-applied).
 * @param {Object} [deps.catalog] - Override the model catalog (tests inject fixture loaders).
 * @param {number} [deps.watchdogMs] - Override the engine-side watchdog duration.
 * @param {string} [deps.acpMode] - Transport selection: "on" (ACP session), "off" (exec), "auto" (ACP only with acpBin).
 * @param {string} [deps.acpBin] - Standalone ACP agent binary (engages the ACP path; tests use the mock fixture).
 * @param {number} [deps.acpStartTimeoutMs] - Handshake ceiling for the ACP session start.
 * @returns {Object} The AgentHarness for antigravity.
 ***/
export function createAntigravityHarness(deps = {}) {
	const { eventBridge } = deps;
	const settings = resolveAgySettings(deps);

	const log = (message, projectId) => {
		if (!message) return;
		const target = projectId || deps.projectId || "antigravity";
		eventBridge?.emitSystemLog?.(target, message, {
			projectId: projectId || deps.projectId || null,
			tag: "[AGY]",
			level: "info",
		});
	};

	// The catalog shares the harness's binary so a mocked harness (tests) also
	// mocks model discovery — the same bin is used for `agy models`. Its log
	// callback is wired to the harness log so discovery failures reach the
	// event bridge / project log, not just the server console.
	const catalog =
		deps.catalog || createAgyModelCatalog({ agyBin: settings.bin, log });

	/** Names the retained discovery failure ("" when discovery is healthy) so
	 *  unresolvable-model warnings can point at the cause instead of shrugging. */
	function discoveryFailureSuffix() {
		return formatDiscoveryFailureStatus(
			typeof catalog.getModelDiscoveryStatus === "function"
				? catalog.getModelDiscoveryStatus()
				: null,
		);
	}

	const harness = {
		/** Stable harness identity. */
		id: "antigravity",

		/** Programmatic model catalogue (`agy models` discovery): the UI
		 *  renders a model dropdown for this harness. */
		modelSelection: "list",
		reasoningLevels: ["low", "medium", "high"],

		settings,

		log,

		/***
		 * MARK: modelRuntime
		 * @description Returns the harness's model runtime adapter: the same
		 *   surface the engine's shared model runtime exposes
		 *   (getAvailableSnapshot/getModels), backed by the agy model catalog.
		 * @returns {Promise<Object>} The model runtime adapter.
		 ***/
		async modelRuntime() {
			return {
				getAvailableSnapshot: async () => catalog.listAgyModels(),
				getModels: async () => catalog.listAgyModels(),
				getModel: () => null,
			};
		},

		/***
		 * MARK: listModels
		 * @description Lists the models available to antigravity sessions (from the cached `agy models` discovery).
		 *   With `{ refresh: true }` the TTL cache is dropped first so discovery
		 *   re-runs — the Refresh actions in the UI (and `?refresh=true` on the
		 *   model routes, via `listPublicModels`) genuinely re-check the CLI
		 *   instead of serving the stale cached snapshot.
		 * @example await harness.listModels() => [{ provider: "antigravity", … }]
		 * @example await harness.listModels({ refresh: true }) // re-runs `agy models` first
		 * @param {Object} [opts]
		 * @param {boolean} [opts.refresh=false] - Drop the TTL cache and re-run discovery before listing.
		 * @returns {Promise<Array<Object>>} The provider-tagged model list.
		 ***/
		async listModels({ refresh = false } = {}) {
			if (refresh) catalog.clearCache();
			return catalog.listAgyModels();
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference against the agy catalog;
		 *   null when unresolvable (callers warn — resolution never silently swaps).
		 * @returns {Promise<Object|null>} The resolved model, or null.
		 ***/
		async resolveModelRef(target) {
			return catalog.resolveModelRef(target);
		},

		/***
		 * MARK: getModelDiscoveryStatus
		 * @description Reports the harness's model-discovery health (`{ ok:
		 *   true }` or `{ ok: false, error: { code, message, hint } }`) from
		 *   the catalog's retained failure. Optional contract method: routes
		 *   consult it when present and serve the error alongside an empty
		 *   catalogue; harnesses without it behave exactly as before.
		 * @example harness.getModelDiscoveryStatus() => { ok: true }
		 * @returns {Object} The discovery status.
		 ***/
		getModelDiscoveryStatus() {
			if (typeof catalog.getModelDiscoveryStatus === "function") {
				return catalog.getModelDiscoveryStatus();
			}
			return { ok: true };
		},

		/***
		 * MARK: resolveInitialModel
		 * @description Resolves the project's stored default model against the
		 *   agy catalog for a NEW session (parity with the pi/opencode
		 *   harnesses, which both honor `project.defaultModel` at creation so
		 *   stages without an explicit override still run on the project
		 *   default). Blank means "agy default" (null, silent). An
		 *   unresolvable non-blank reference warns visibly instead of silently
		 *   running elsewhere.
		 * @example await harness.resolveInitialModel(project) => model|null
		 * @param {Object} project - The project entity (defaultModel).
		 * @returns {Promise<Object|null>} The resolved model (with `effort` when a suffix was used), or null.
		 ***/
		async resolveInitialModel(project) {
			const ref = project?.defaultModel;
			if (typeof ref !== "string" || !ref.trim()) return null;
			// Stored references may predate harness-scoped keys: normalize
			// legacy `provider::id` values to this harness's canonical form
			// before resolving (bare ids/sentinels pass through untouched).
			const normalizedRef = normalizeModelRef(ref, HARNESS_ID);
			const resolved = await catalog.resolveModelRef(normalizedRef);
			if (!resolved) {
				// A canonical key naming a DIFFERENT harness is not this
				// harness's default at all — one INFO line (deduped), never
				// the scary WARN. Anything else keeps the loud warning with
				// the cross-harness hint (deduped per project + ref).
				const foreign = foreignHarnessOf(ref);
				const dedupeKey = `${project?.id || "system"}:${ref}`;
				if (!warnedInitialModels.has(dedupeKey)) {
					warnedInitialModels.add(dedupeKey);
					log(
						foreign
							? `[INFO] Configured model '${ref}' is scoped to harness '${foreign}', not antigravity; agy's default model will be used for project '${project.name || project.id}'. Scope it with a Model Alias to silence this.`
							: `[WARN] Configured model '${ref}' could not be resolved against the antigravity model catalog for project '${project.name || project.id}'; agy's default model will be used. Update the project default model in Settings (this model may belong to another harness — check Model Aliases / the project harness).${discoveryFailureSuffix()}`,
						project?.id,
					);
				}
			}
			return resolved;
		},

		/***
		 * MARK: readHistoryFromDisk
		 * @description The agy CLI owns conversation history (resumed via
		 *   `--conversation` inside its own credential cache), so KainBain has no
		 *   on-disk history to read: an intentionally empty history.
		 * @returns {Promise<{messages: Array, tree: Array}>} Always empty.
		 ***/
		async readHistoryFromDisk() {
			return { messages: [], tree: [] };
		},

		/***
		 * MARK: createSession
		 * @description Creates a fresh HarnessSession for a project. One
		 *   `prompt()` = one `agy` process; stage executions (taskId/stageId)
		 *   begin with no conversation id, so every stage starts clean. The
		 *   project's stored default model is resolved first and pinned for
		 *   the session's spawns (stages without an explicit override still
		 *   run on the project default, like the pi/opencode harnesses).
		 * @example await harness.createSession(project, { taskId, stageId }) => session
		 * @param {Object} project - The project entity (cwd required).
		 * @param {Object} [meta] - { taskId, stageId, sessionDir, model } run metadata.
		 * @param {string} [meta.model] - Dispatch-resolved model ref: pinned for
		 *   the session's spawns, skipping `resolveInitialModel` (target hand-off).
		 * @returns {Promise<Object>} The contract-conforming session.
		 ***/
		async createSession(project, { taskId, stageId, sessionDir, model } = {}) {
			if (
				settings.allowRules.rules.length > 0 ||
				settings.allowRules.errors.length > 0
			) {
				// Allow rules are validated but NOT applied (logged-not-applied policy):
				// the effective approval mode is unchanged — see the run-open
				// transcript line — until scoped agy settings support is verified.
				const suffix = settings.allowRules.valid
					? `${settings.allowRules.rules.length} rule(s): ${settings.allowRules.rules.map((rule) => `${rule.action}(${rule.target})`).join(", ")}`
					: `rejected: ${settings.allowRules.errors.join("; ")}`;
				log(
					`[AGY] KAINBAIN_AGY_ALLOW is validated but NOT applied (${suffix}). Effective approval mode is unchanged (see the run-open line).`,
					project?.id,
				);
			}
			// TARGET HAND-OFF: a dispatch-resolved `model` is pinned for the
			// session's spawns and `resolveInitialModel` is skipped entirely
			// (the project default belongs to another harness's catalog for
			// cross-harness runs). Unresolvable hand-offs warn once and fall
			// back to agy's default — never a silent swap.
			let initialModel = null;
			if (typeof model === "string" && model.trim()) {
				const pinned = await catalog.resolveModelRef(
					normalizeModelRef(model, HARNESS_ID),
				);
				if (!pinned) {
					log(
						`[WARN] Dispatch-resolved model '${model}' could not be resolved against the antigravity model catalog for project '${project.name || project.id}'; agy's default model will be used.${discoveryFailureSuffix()}`,
						project?.id,
					);
				}
				initialModel = pinned;
			} else {
				initialModel = await harness.resolveInitialModel(project);
			}
			const candidateEffort =
				initialModel?.effort || initialModel?.reasoning || null;
			if (
				initialModel &&
				typeof initialModel === "object" &&
				candidateEffort &&
				!(harness.reasoningLevels || []).includes(candidateEffort)
			) {
				initialModel = { ...initialModel, effort: null, reasoning: null };
			} else if (
				initialModel &&
				typeof initialModel === "object" &&
				candidateEffort
			) {
				initialModel = {
					...initialModel,
					effort: candidateEffort,
					reasoning: candidateEffort,
				};
			}
			// Tier-2 path: a long-lived bidirectional ACP session (two-way
			// steering, permission interception, swallowed-502 filter).
			// Legacy path: one `agy -p` process per prompt.
			if (selectAgyTransport(settings) === "acp") {
				return createAcpAgySession(
					project,
					{ taskId, stageId, sessionDir },
					{ ...harness, catalog },
					{ initialModel },
				);
			}
			return createAgySession(
				project,
				{ taskId, stageId, sessionDir },
				{ ...harness, catalog },
				{ initialModel },
			);
		},
	};

	return harness;
}
