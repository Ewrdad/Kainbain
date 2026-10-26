import path from "node:path";
import fs from "node:fs";
import os from "node:os";
// The pi SDK is loaded lazily (dynamic import on first use, same package
// specifier) so importing this module — and therefore the engine, the API
// server, and every test that boots them — never pays the SDK's load cost
// until a real pi session actually starts. This module remains the ONLY
// engine file that references the SDK package (see
// api/agent/harnessBoundary.test.js); the literal specifier below must stay
// a string literal so the test-time module mock still intercepts it.
async function loadPiSdk() {
	return import("@earendil-works/pi-coding-agent");
}
import {
	classifiesForeignHarness,
	normalizeModelRef,
	parseModelKey,
	providerAuthSummary,
	resolveModel,
	resolveModelFromRegistry,
	withModelKey,
} from "../../../models.js";
import { createExtensionUIContext } from "./piExtensionUI.js";
import { translatePiEvent } from "./piSessionEvents.js";
import { config } from "../../../config/index.js";
import { resolveSessionsDir } from "../../../kainbainDir.js";

/***
 * MARK: HARNESS_ID
 * @description THE single source of pi harness identity. Model keys carry this
 *   id as their first segment (`pi::provider::id`) so a future second harness
 *   exposing the same provider::id can never collide with pi's models. The
 *   harness instance also carries it as `id`; no other engine file hard-codes
 *   "pi" as a key segment.
 * @example HARNESS_ID // => "pi"
 ***/
export const HARNESS_ID = "pi";

/** `${projectId}:${ref}` keys already warned about, so hot loops cannot spam logs. */
const warnedInitialModels = new Set();

/***
 * MARK: foreignHarnessOf
 * @description Names the owning harness when a stored ref is a canonical
 *   3-part key scoped to ANOTHER harness — null otherwise. Only the
 *   canonical form classifies; legacy 2-part and bare refs are
 *   harness-agnostic by design.
 * @example foreignHarnessOf('antigravity::google::m') => 'antigravity'
 * @param {unknown} ref - Any stored model reference.
 * @returns {string|null} The foreign harness id, or null.
 ***/
function foreignHarnessOf(ref) {
	if (!classifiesForeignHarness(ref, HARNESS_ID)) return null;
	return parseModelKey(String(ref).trim())?.harness || null;
}

/**
 * MARK: piHarness
 * @description THE ONLY FILE IN THE ENGINE THAT IMPORTS THE PI SDK. Everything
 *   pi-specific — SDK calls, on-disk session layout, agent-directory
 *   resolution, model discovery, raw event names — lives behind this module.
 *   The rest of the engine talks to the AgentHarness / HarnessSession contract
 *   (see `api/agent/harnessContract.js`) and never to pi directly.
 *
 *   The harness is registered in the harness registry
 *   (`api/agent/harnessRegistry.js`) under the id "pi" as the built-in
 *   default; projects select it (or a future harness) via `project.harness`.
 *
 *   `createSession` returns the raw pi session wrapped so that:
 *     - `subscribe` delivers NORMALIZED agent events (raw pi events are
 *       translated by `piSessionEvents.translatePiEvent` before the handler
 *       sees them),
 *     - the engine contract methods (getMessages, getLastAssistantText,
 *       getActiveModel, switchModel, listModels, resolveModelRef) delegate to
 *       the pi session's fields with today's soft-fail semantics,
 *     - every other pi member (prompt, abort, steer, messages, sessionManager,
 *       modelRuntime, …) passes through unchanged.
 */

/***
 * MARK: DIAGNOSIS_SYSTEM_PROMPT
 * @description The fixed system prompt for stuck-check diagnosis sessions.
 *   The session is strictly advisory: it analyzes the pasted logs and answers
 *   in the VERDICT/REASONING format; it has NO tools and must never suggest
 *   taking actions itself.
 ***/
export const DIAGNOSIS_SYSTEM_PROMPT = [
	"You are a stuck-detection assistant for an automated task pipeline.",
	"You receive the recent logs of one task's current stage and decide whether the execution looks stuck",
	"(looping, repeating identical tool calls, retrying the same failing step, or making no progress).",
	"You are advisory ONLY: you never take actions and you have no tools.",
	"Answer EXACTLY in this format:",
	"VERDICT: STUCK | NOT_STUCK | UNCLEAR",
	"REASONING: one short paragraph citing concrete evidence from the logs (repeated identical commands, unchanged outputs, identical errors, elapsed-turn counts).",
].join("\n");

/***
 * MARK: diagnosisSessionDirFor
 * @description Resolves the throwaway session directory for diagnosis runs:
 *   a per-project folder under the OS temp dir, so diagnosis transcripts can
 *   never pollute the project's real session history.
 * @example diagnosisSessionDirFor({ id: 'proj-1' }) => '/tmp/kainbain-diagnosis-sessions/proj-1'
 * @param {Object} project - The project entity (id).
 * @returns {string} The diagnosis session directory path.
 ***/
function diagnosisSessionDirFor(project) {
	return path.join(
		os.tmpdir(),
		"kainbain-diagnosis-sessions",
		String(project?.id || "default"),
	);
}

/***
 * MARK: resolveAgentDir
 * @description Resolves the pi agent directory for a project: the project's
 *   own agent directory when it is a real path, otherwise the validated
 *   `PI_AGENT_DIR` config (which defaults to the user's ~/.pi/agent
 *   directory).
 * @example resolveAgentDir({ agentDir: "/repo/.pi-agent" }) => "/repo/.pi-agent"
 * @param {Object} project - The project entity (agentDir/cwd).
 * @returns {string} The agent directory path.
 ***/
function resolveAgentDir(project) {
	return project.agentDir && !project.agentDir.startsWith("/tmp/pi-agent-dir")
		? project.agentDir
		: config.piAgentDir;
}

/***
 * MARK: defaultSessionDirFor
 * @description Fallback session directory when the caller does not pass one:
 *   the engine's `.kainbain/sessions` folder under the project working
 *   directory. The SessionStore normally supplies its own directory policy.
 * @param {Object} project - The project entity (cwd/agentDir).
 * @returns {string} The session directory path.
 ***/
function defaultSessionDirFor(project) {
	const base = project.cwd || project.agentDir || process.cwd();
	return (
		resolveSessionsDir(base, project) || path.join(base, ".kainbain", "sessions")
	);
}

/***
 * MARK: getLastAssistantTextFrom
 * @description Reads the latest assistant text from a pi session: the session's
 *   own helper when available, otherwise derived from its messages array.
 * @param {Object} rawSession - The raw pi session.
 * @returns {string} The last assistant text ("" when none).
 ***/
function getLastAssistantTextFrom(rawSession) {
	if (typeof rawSession.getLastAssistantText === "function") {
		return rawSession.getLastAssistantText();
	}
	const assistantMessages = (rawSession.messages || []).filter(
		(m) => m?.role === "assistant",
	);
	return assistantMessages.at(-1)?.content ?? "";
}

/***
 * MARK: wrapPiSession
 * @description Wraps a raw pi session so it satisfies the HarnessSession
 *   contract: normalized event delivery via subscribe, contract model/context
 *   methods, and pass-through for everything else. Methods are bound to the
 *   raw session so `this`-based pi internals keep working.
 * @param {Object} rawSession - The session returned by the pi SDK.
 * @param {Object} harness - The owning pi harness (for model reference resolution).
 * @returns {Object} The contract-conforming session.
 ***/
function wrapPiSession(rawSession, harness) {
	const boundMethods = new Map();
	return new Proxy(rawSession, {
		get(target, prop) {
			if (typeof prop !== "string") {
				return Reflect.get(target, prop, target);
			}
			switch (prop) {
				case "harnessId":
					// The owning harness's identity, so engine code can scope model
					// references without importing anything harness-specific.
					return HARNESS_ID;
				case "subscribe":
					return (handler) =>
						target.subscribe((rawEvent) => handler(translatePiEvent(rawEvent)));
				case "getMessages":
					return () => target.messages;
				case "getContextUsage":
					return async () => {
						// pi returns its own ContextUsage shape ({tokens, contextWindow,
						// percent}) or undefined on a fresh session; the engine contract
						// (sessionContract.test.js) pins a {current, limit} pair. Normalize
						// here at the harness boundary so every engine consumer sees
						// contract shape regardless of the raw SDK reporting.
						const usage =
							typeof target.getContextUsage === "function"
								? target.getContextUsage()
								: undefined;
						if (!usage) return { current: 0, limit: 0 };
						if (usage.current !== undefined || usage.limit !== undefined) {
							return usage;
						}
						return {
							current: usage.tokens ?? 0,
							limit: usage.contextWindow ?? 0,
						};
					};
				case "getLastAssistantText":
					return () => getLastAssistantTextFrom(target);
				case "getActiveModel":
					return async () => {
						const active = target.model ?? null;
						if (active && typeof active === "object" && typeof target.getThinkingLevel === "function") {
							try {
								const lvl = target.getThinkingLevel() ?? active.reasoning ?? null;
								return lvl ? { ...active, reasoning: lvl } : { ...active };
							} catch {
								return active;
							}
						}
						return active;
					};
				case "switchModel":
					return async (ref) => {
						// Soft-fail: a session that cannot switch models reports null
						// instead of throwing, so callers warn visibly and continue.
						if (typeof target.setModel !== "function") return null;
						await target.setModel(ref);
						const level =
							(typeof ref === "string"
								? parseModelKey(ref)?.reasoning
								: ref?.reasoning) || null;
						if (
							level &&
							(harness.reasoningLevels || []).includes(level) &&
							typeof target.setThinkingLevel === "function"
						) {
							try {
								target.setThinkingLevel(level);
							} catch {
								// best-effort
							}
						}
						const active = target.model ?? ref ?? null;
						if (active && typeof active === "object") {
							const resolvedLevel =
								(typeof target.getThinkingLevel === "function"
									? target.getThinkingLevel()
									: null) || level || null;
							const cloned = { ...active };
							if (resolvedLevel) {
								cloned.reasoning = resolvedLevel;
							} else {
								delete cloned.reasoning;
							}
							return cloned;
						}
						return active;
					};
				case "listModels":
					return async () =>
						(target.modelRuntime?.getAvailableSnapshot?.() ?? []).map((m) =>
							withModelKey(m, HARNESS_ID),
						);
				case "resolveModelRef":
					return (ref) => harness.resolveModelRef(ref);
				default: {
					const value = Reflect.get(target, prop, target);
					if (typeof value !== "function") return value;
					if (!boundMethods.has(prop)) {
						boundMethods.set(prop, value.bind(target));
					}
					return boundMethods.get(prop);
				}
			}
		},
	});
}

/***
 * MARK: collectProviderAuthStatus
 * @description Offline credential-state read for the shared ModelRuntime,
 *   delegated to the pure `providerAuthSummary` helper in api/models.js (the
 *   same duck-typed surface /compute/models enrichment uses — routes never
 *   import the SDK). Shape: { error, providers, snapshotProviders,
 *   snapshotSize, registrySize }.
 * @param {Object} runtime - The pi ModelRuntime (or a duck-typed fake in tests).
 * @returns {{error: string|null, providers: Array<{provider, configured, source, label}>, snapshotProviders: Array<string>, snapshotSize: number, registrySize: number}}
 ***/
function collectProviderAuthStatus(runtime) {
	return (
		providerAuthSummary(runtime) ?? {
			error: null,
			providers: [],
			snapshotProviders: [],
			snapshotSize: 0,
			registrySize: 0,
		}
	);
}

/***
 * MARK: createPiHarness
 * @description Builds the pi AgentHarness: the engine's single entry point for
 *   creating pi-backed sessions, discovering models, and reading persisted
 *   history. The event bridge is injected so harness output (extension UI
 *   notifications, model-resolution warnings) lands in the activity console.
 * @example const harness = createPiHarness({ eventBridge });
 * @example const session = await harness.createSession(project, { taskId, stageId, sessionDir });
 * @param {Object} [deps]
 * @param {Object} [deps.eventBridge] - The EventBridge singleton (injected for testability).
 * @returns {Object} The AgentHarness for pi.
 ***/
export function createPiHarness({ eventBridge } = {}) {
	let cachedRuntime = null;

	const harness = {
		// Harness identity (see api/agent/harnessContract.js): engine log prose
		// is composed from this metadata, so the engine never hard-codes the
		// vendor name in user-facing messages.
		name: "pi",
		label: "Pi",

		/***
		 * MARK: id
		 * @description Stable harness identity (`HARNESS_ID`), matching the
		 *   /harnesses registry entry and the model-listing cache slot key. It is
		 *   also the first segment of every harness-scoped model key this harness
		 *   produces (`pi::provider::id`).
		 * @example harness.id // => "pi"
		 ***/
		id: HARNESS_ID,

		/***
		 * MARK: modelSelection
		 * @description Programmatic model catalogue (`"list"`): sessions resolve
		 *   against `listModels()`, and the UI renders a model dropdown for
		 *   this harness. (The custom harness declares `"free"` instead; a
		 *   harness with no model support at all declares `"none"` and the UI
		 *   hides model selection for it.)
		 ***/
		modelSelection: "list",
		reasoningLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],

		/***
		 * MARK: modelRuntime
		 * @description Lazily creates and returns the shared pi ModelRuntime —
		 *   the single source of truth for which models sessions can resolve.
		 * @example await harness.modelRuntime() => ModelRuntime
		 * @returns {Promise<Object>} The shared ModelRuntime instance.
		 ***/
		async modelRuntime() {
			if (!cachedRuntime) {
				const { ModelRuntime } = await loadPiSdk();
				cachedRuntime = await ModelRuntime.create();
			}
			return cachedRuntime;
		},

		/***
		 * MARK: resolveInitialModel
		 * @description Resolves a stored model reference (composite key or bare id)
		 *   against the model runtime's available snapshot for a NEW session. If
		 *   the reference cannot be resolved the snapshot may be stale (it is only
		 *   built when the runtime is created, so a long-running API process never
		 *   sees models.json changes) — the runtime is refreshed from disk once and
		 *   resolution is retried before falling back. Every failure path is
		 *   logged loudly and surfaced in the activity console instead of silently
		 *   swapping models.
		 * @example await harness.resolveInitialModel(project) => model|null
		 * @param {Object} project
		 * @returns {Promise<Object|null>} The resolved model, or null when nothing is available.
		 ***/
		async resolveInitialModel(project) {
			const runtime = cachedRuntime;
			if (!runtime) return null;
			const projectModelId = project.defaultModel;
			// Stored references may predate harness-scoped keys: normalize legacy
			// `provider::id` values to this harness's canonical form before
			// resolving (bare ids/sentinels pass through untouched).
			const normalizedProjectModelId = normalizeModelRef(
				projectModelId,
				HARNESS_ID,
			);
			const available = runtime.getAvailableSnapshot?.() || [];
			let initialModel = resolveModel(available, normalizedProjectModelId);

			if (!initialModel) {
				// Refresh the snapshot from disk once (models.json may have changed
				// since the runtime was created) and retry before giving up.
				try {
					await runtime.refresh({ allowNetwork: false });
				} catch {
					// Best-effort refresh; fall through with the stale snapshot.
				}
				const refreshed = runtime.getAvailableSnapshot?.() || [];
				initialModel = resolveModel(refreshed, normalizedProjectModelId);

				// The availability snapshot can transiently drop a provider when an
				// auth re-check flakes. Before giving up, resolve against the
				// runtime's full registry — a static-key provider from models.json
				// is usable even when the availability pass missed it.
				if (!initialModel) {
					initialModel = resolveModelFromRegistry(runtime, normalizedProjectModelId);
				}

				// Only fall back AND warn when neither snapshot nor registry could
				// match — a successful resolution must stay silent.
				if (!initialModel) {
					// A canonical key naming a DIFFERENT harness is not this
					// harness's default at all — one INFO line (deduped),
					// never the scary WARN, and no first-available fallback
					// (the SDK default wins instead of a misleading pin).
					const foreign =
						projectModelId && foreignHarnessOf(projectModelId);
					if (foreign) {
						const dedupeKey = `${project?.id || "system"}:${projectModelId}`;
						if (!warnedInitialModels.has(dedupeKey)) {
							warnedInitialModels.add(dedupeKey);
							eventBridge?.emitSystemLog?.(
								project.id,
								`[INFO] Configured model '${projectModelId}' is scoped to harness '${foreign}', not pi; the pi default model will be used for project '${project.name || project.id}'. Scope it with a Model Alias to silence this.`,
								{ projectId: project.id, tag: "[INFO]", level: "info" },
							);
						}
						return null;
					}
					if (refreshed.length > 0) {
						// Deterministic first-available selection: the snapshot
						// order is the provider's own order. No substring
						// preference (a hardcoded model id here would rot).
						initialModel = refreshed[0];
					}
					if (projectModelId) {
						const detail = initialModel
							? `using ${initialModel.provider}/${initialModel.id} instead`
							: "no available model found";
						const warn = `[WARN] Configured model '${projectModelId}' could not be resolved for project '${project.name || project.id}'; ${detail}. Update the project default model in Settings (this model may belong to another harness — check Model Aliases / the project harness).`;
						eventBridge?.emitSystemLog?.(project.id, warn, {
							projectId: project.id,
							tag: "[WARN]",
							level: "warn",
						});
					}
				}
			}

			return initialModel || null;
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a model reference against the runtime: first the
		 *   availability snapshot, then (when the snapshot transiently drops a
		 *   provider) the runtime's full registry. Returns null when unresolvable —
		 *   callers decide whether to warn.
		 * @example await harness.resolveModelRef("ollama-cloud::glm-5.3-flash:cloud") => model
		 * @param {string|Object} target - Composite model key or bare id.
		 * @returns {Promise<Object|null>} The resolved model, or null.
		 ***/
		async resolveModelRef(target) {
			const runtime = await harness.modelRuntime();
			// Accept all reference forms (canonical 3-part, legacy 2-part, bare):
			// legacy `provider::id` values are normalized to this harness's
			// canonical form first; bare ids and sentinels pass through untouched.
			const normalizedTarget = normalizeModelRef(target, HARNESS_ID);
			const available = runtime.getAvailableSnapshot?.() || [];
			return (
				resolveModel(available, normalizedTarget) ||
				resolveModelFromRegistry(runtime, normalizedTarget) ||
				null
			);
		},

		/***
		 * MARK: listModels
		 * @description Lists the models currently available to sessions, from the
		 *   runtime's availability snapshot. With `{ refresh: true }` the snapshot
		 *   is refreshed from disk first (never over the network — a request path
		 *   must not block on provider catalogs); a failed refresh keeps serving
		 *   the stale snapshot instead of failing the listing.
		 * @example await harness.listModels() => [{ provider, id, … }]
		 * @example await harness.listModels({ refresh: true }) // re-reads models.json first
		 * @param {Object} [opts]
		 * @param {boolean} [opts.refresh=false] - Best-effort disk refresh before listing.
		 * @returns {Promise<Array<Object>>} The available models.
		 ***/
		async listModels({ refresh = false } = {}) {
			const runtime = await harness.modelRuntime();
			if (refresh) {
				try {
					await runtime.refresh({ allowNetwork: false });
				} catch {
					// Best-effort refresh; keep serving the stale snapshot.
				}
			}
			// Tag every model with a harness-scoped key so engine consumers and the
			// UI see the canonical `harness::provider::id` identity.
			return (runtime.getAvailableSnapshot?.() || []).map((m) =>
				withModelKey(m, HARNESS_ID),
			);
		},

		/***
		 * MARK: modelAuthStatus
		 * @description Per-provider credential status read straight from the shared
		 *   ModelRuntime (offline): which providers have configured auth, where it
		 *   comes from (stored key / environment / models.json …), and any
		 *   availability-refresh error. One duck-typed surface shared by the health
		 *   probe and the /compute/models enrichment so routes never import the SDK.
		 * @example await harness.modelAuthStatus() => { error: null, providers: [{ provider, configured, source, label }] }
		 * @returns {Promise<Object>} The auth summary (see collectProviderAuthStatus).
		 ***/
		async modelAuthStatus() {
			const runtime = await harness.modelRuntime();
			return collectProviderAuthStatus(runtime);
		},

		/***
		 * MARK: probeHealth
		 * @description Harness-level health probe for the HealthChecker (optional
		 *   AgentHarness contract member; the engine duck-types it and never calls
		 *   it unguarded). Offline by default: reads the runtime snapshot, the
		 *   availability-refresh error, and per-provider auth status without any
		 *   network work. With `{ refresh: true }` it additionally re-checks
		 *   provider availability (network-capable, bounded by the caller's
		 *   timeout). Never throws — every failure path returns
		 *   `status: 'error'` with a message so a broken harness degrades the
		 *   health report instead of crashing it.
		 *   Classification: `error` when the runtime is unavailable, the last
		 *   availability refresh errored, or no provider has configured auth;
		 *   `warning` when some configured providers are missing from the
		 *   availability snapshot; `ok` otherwise.
		 * @example await harness.probeHealth() => { name: 'pi', status: 'ok', latencyMs, timestamp, checks: { runtime, models, auth } }
		 * @param {Object} [options]
		 * @param {boolean} [options.refresh=false] - Re-check provider availability (network-capable).
		 * @returns {Promise<Object>} The HarnessProbeResult (see harnessContract.js).
		 ***/
		async probeHealth({ refresh = false } = {}) {
			const startedAt = Date.now();
			const probeError = (message, runtimeCheck) => ({
				name: "pi",
				status: "error",
				latencyMs: Date.now() - startedAt,
				timestamp: new Date().toISOString(),
				message,
				checks: {
					runtime: runtimeCheck || { status: "error", message },
				},
			});
			try {
				const runtime = await harness.modelRuntime();
				const auth = collectProviderAuthStatus(runtime);

				// Optional network re-check of availability: the SDK runs per-provider
				// checkAuth and updates the snapshot on success.
				let refreshError = null;
				if (refresh && typeof runtime.getAvailable === "function") {
					try {
						await runtime.getAvailable();
					} catch (err) {
						refreshError = err?.message || String(err);
					}
				}
				// Re-read the snapshot so a successful refresh is reflected.
				const postSnapshot = runtime.getAvailableSnapshot?.() || [];
				const postProviders = new Set(
					postSnapshot.map((m) => m?.provider).filter((p) => typeof p === "string"),
				);

				const configuredProviders = auth.providers.filter((p) => p.configured);
				const missingFromSnapshot = configuredProviders.filter(
					(p) => !postProviders.has(p.provider),
				);
				const runtimeCheck = { status: "ok" };
				const modelsCheck = {
					status: postSnapshot.length > 0 ? "ok" : "warning",
					available: postSnapshot.length,
					total: Math.max(auth.registrySize, postSnapshot.length),
					message:
						postSnapshot.length > 0
							? `${postSnapshot.length} models available`
							: "no models in the availability snapshot",
				};
				const combinedError = auth.error || refreshError;
				let authStatus;
				let message;
				if (combinedError) {
					authStatus = "error";
					message = `Model availability error: ${combinedError}`;
				} else if (configuredProviders.length === 0) {
					authStatus = "error";
					message =
						auth.providers.length === 0
							? "No model providers configured"
							: "No model providers have configured credentials";
				} else if (missingFromSnapshot.length > 0) {
					authStatus = "warning";
					message = `${missingFromSnapshot.map((p) => p.provider).join(", ")} configured but not in the availability snapshot`;
				} else {
					authStatus = "ok";
					message = `${configuredProviders.length} provider(s) configured, ${postSnapshot.length} models available`;
				}

				const statuses = [runtimeCheck.status, modelsCheck.status, authStatus];
				const status = statuses.includes("error")
					? "error"
					: statuses.includes("warning")
						? "warning"
						: "ok";

				return {
					name: "pi",
					status,
					latencyMs: Date.now() - startedAt,
					timestamp: new Date().toISOString(),
					message,
					checks: {
						runtime: runtimeCheck,
						models: modelsCheck,
						auth: {
							status: authStatus,
							error: combinedError,
							providers: auth.providers.map((p) => ({
								provider: p.provider,
								configured: p.configured,
								...(p.source !== null ? { source: p.source } : {}),
								...(p.label !== null ? { label: p.label } : {}),
							})),
						},
					},
				};
			} catch (err) {
				const detail = err?.message || String(err);
				return probeError(`Harness probe failed: ${detail}`);
			}
		},

		/***
		 * MARK: createSession
		 * @description Creates or resumes a pi-backed AgentSession for a project
		 *   and returns it wrapped to the HarnessSession contract. Stage
		 *   executions (taskId or stageId present) always start with a clean,
		 *   empty context so each stage only sees its curated prompt; interactive
		 *   sessions resume the latest persisted session from disk.
		 * @example await harness.createSession(project, { taskId, stageId, sessionDir }) => session
		 * @param {Object} project - The project entity (cwd/agentDir/defaultModel).
		 * @param {Object} [meta]
		 * @param {string} [meta.taskId] - Task the stage belongs to (forces a fresh session).
		 * @param {string} [meta.stageId] - Stage being executed (forces a fresh session).
		 * @param {string} [meta.sessionDir] - Session directory (store's directory policy); defaults to <cwd>/.kainbain/sessions.
		 * @param {string} [meta.model] - Dispatch-resolved model ref: pinned
		 *   for the session, skipping `resolveInitialModel` (target hand-off).
		 * @returns {Promise<Object>} The contract-conforming session.
		 ***/
		async createSession(project, { taskId, stageId, sessionDir, model } = {}) {
			const { SessionManager, createAgentSession } = await loadPiSdk();
			const runtime = await harness.modelRuntime();
			const resolvedSessionDir = sessionDir || defaultSessionDirFor(project);
			// eslint-disable-next-line security/detect-non-literal-fs-filename -- sessionDir is derived from trusted project config, not user input
			fs.mkdirSync(resolvedSessionDir, { recursive: true });

			// Stage executions (taskId or stageId provided) always start with a
			// clean, empty context so each stage only sees its curated prompt.
			// Interactive sessions resume the latest persisted session from disk if one exists.
			let sessionManager;
			const isStageRun = Boolean(taskId || stageId);
			if (!isStageRun) {
				try {
					const sessions = await SessionManager.list(
						project.cwd,
						resolvedSessionDir,
					);
					if (sessions && sessions.length > 0) {
						const latest = [...sessions].sort((a, b) => b.modified - a.modified)[0];
						if (latest?.path) {
							sessionManager = SessionManager.open(
								latest.path,
								resolvedSessionDir,
								project.cwd,
							);
						}
					}
				} catch {
					sessionManager = null;
				}
			}

			if (!sessionManager) {
				sessionManager = SessionManager.create(project.cwd, resolvedSessionDir);
			}

			const resolvedAgentDir = resolveAgentDir(project);

			// TARGET HAND-OFF: a dispatch-resolved `model` is pinned for the
			// session and `resolveInitialModel` is skipped entirely (the
			// project default belongs to another harness's catalog for
			// cross-harness runs). Unresolvable hand-offs warn once and fall
			// back to the SDK default — never a silent swap.
			let initialModel;
			if (typeof model === "string" && model.trim()) {
				initialModel = await harness.resolveModelRef(model);
				if (!initialModel) {
					eventBridge?.emitSystemLog?.(
						project.id,
						`[WARN] Dispatch-resolved model '${model}' could not be resolved for project '${project.name || project.id}'; the pi default model will be used.`,
						{ projectId: project.id, tag: "[WARN]", level: "warn" },
					);
				}
			} else {
				// Resolve initial model (refreshes the runtime snapshot and surfaces a
				// visible warning instead of silently swapping models when the stored
				// reference cannot be matched).
				initialModel = await harness.resolveInitialModel(project);
			}
			// Defense-in-depth: drop a reasoning level the harness/model does not
			// support before handing the model to the SDK. The key is removed
			// (not set to undefined) so downstream reads see "no level".
			let resolvedInitialModel = initialModel;
			if (
				resolvedInitialModel &&
				typeof resolvedInitialModel === "object" &&
				resolvedInitialModel.reasoning &&
				!(harness.reasoningLevels || []).includes(resolvedInitialModel.reasoning)
			) {
				resolvedInitialModel = { ...resolvedInitialModel };
				delete resolvedInitialModel.reasoning;
			}

			const runLabel = `${stageId || "adhoc"}:${taskId || "chat"}`;
			const res = await createAgentSession({
				sessionId: `${project.id}::${runLabel}::${new Date().toISOString()}`,
				cwd: project.cwd,
				agentDir: resolvedAgentDir,
				model: resolvedInitialModel,
				modelRuntime: runtime,
				sessionManager,
			});
			const rawSession = res.session;

			// Route extension UI output (e.g. `ctx.ui.notify(...)` from loop-guard,
			// command-timeout-monitor, etc.) into the event bridge so it shows in the
			// activity console instead of being swallowed by the headless no-op UI
			// context. Fire-and-forget; does not touch LLM context.
			if (typeof rawSession.bindExtensions === "function") {
				try {
					await rawSession.bindExtensions({
						mode: "rpc",
						uiContext: createExtensionUIContext(eventBridge, project.id),
					});
				} catch {
					// If binding the UI context fails (older SDK), continue with the
					// default headless no-op context.
				}
			}

			// AUTO-COMPACTION ENABLED
			if (typeof rawSession.setAutoCompactionEnabled === "function") {
				rawSession.setAutoCompactionEnabled(true);
			}

			if (
				resolvedInitialModel &&
				typeof resolvedInitialModel === "object" &&
				resolvedInitialModel.reasoning &&
				(harness.reasoningLevels || []).includes(resolvedInitialModel.reasoning) &&
				typeof rawSession.setThinkingLevel === "function"
			) {
				try {
					rawSession.setThinkingLevel(resolvedInitialModel.reasoning);
				} catch {
					// best-effort
				}
			}

			return wrapPiSession(rawSession, harness);
		},

		/***
		 * MARK: createDiagnosisSession
		 * @description Creates a THROWAWAY, strictly read-only pi session for
		 *   one-shot diagnosis runs (e.g. the task "is it stuck?" check). The
		 *   session:
		 *     - has NO tools (`noTools: "all"`), so the model physically cannot
		 *       take any action — it can only produce text;
		 *     - loads NO extensions, skills, prompt templates, themes or context
		 *       files, and overrides the system prompt with the diagnosis prompt,
		 *       so the run cannot be steered by project-level configuration;
		 *     - persists under the OS temp dir (never the project's real session
		 *       history);
		 *     - uses the caller-supplied model (resolved beforehand by the
		 *       checker via `resolveModelRef`), typically a smaller/faster model
		 *       chosen by the user for a cheap sanity check.
		 *   The caller owns the session lifecycle and MUST dispose it.
		 * @example await harness.createDiagnosisSession(project, { model, systemPrompt }) => session
		 * @param {Object} project - The project entity (id/cwd/agentDir).
		 * @param {Object} [opts]
		 * @param {Object} [opts.model] - The resolved SDK model object to run on.
		 * @param {string} [opts.systemPrompt] - System prompt override; defaults to DIAGNOSIS_SYSTEM_PROMPT.
		 * @returns {Promise<Object>} The contract-wrapped, tools-free session.
		 ***/
		async createDiagnosisSession(project, { model, systemPrompt } = {}) {
			const { SessionManager, DefaultResourceLoader, createAgentSession } =
				await loadPiSdk();
			const runtime = await harness.modelRuntime();
			const cwd = project.cwd || process.cwd();
			const resolvedAgentDir = resolveAgentDir(project);
			const diagnosisDir = diagnosisSessionDirFor(project);
			/* eslint-disable security/detect-non-literal-fs-filename -- path is derived from trusted project config + fixed tmp root */
			fs.mkdirSync(diagnosisDir, { recursive: true });
			const sessionManager = SessionManager.create(cwd, diagnosisDir);
			const loader = new DefaultResourceLoader({
				cwd,
				agentDir: resolvedAgentDir,
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPrompt: systemPrompt || DIAGNOSIS_SYSTEM_PROMPT,
			});
			await loader.reload();
			const res = await createAgentSession({
				cwd,
				agentDir: resolvedAgentDir,
				model,
				modelRuntime: runtime,
				sessionManager,
				noTools: "all",
				resourceLoader: loader,
			});
			/* eslint-enable security/detect-non-literal-fs-filename */
			return wrapPiSession(res.session, harness);
		},

		/***
		 * MARK: readHistoryFromDisk
		 * @description Lightweight reader that extracts messages and the entry tree
		 *   directly from persisted disk storage without instantiating
		 *   createAgentSession, ModelRuntime, tool extensions, or RPC bindings.
		 * @example await harness.readHistoryFromDisk(project, sessionDir) => { messages: [], tree: [] }
		 * @param {Object} project - The project entity (cwd).
		 * @param {string} [sessionDir] - Session directory; defaults to <cwd>/.kainbain/sessions.
		 * @returns {Promise<{messages: Array, tree: Array}>} The messages and entry tree from disk.
		 ***/
		async readHistoryFromDisk(project, sessionDir) {
			const { SessionManager } = await loadPiSdk();
			const resolvedSessionDir = sessionDir || defaultSessionDirFor(project);
			/* eslint-disable security/detect-non-literal-fs-filename */
			try {
				if (!fs.existsSync(resolvedSessionDir)) {
					return { messages: [], tree: [] };
				}
				const sessions = await SessionManager.list(
					project.cwd || process.cwd(),
					resolvedSessionDir,
				);
				if (!sessions || sessions.length === 0) {
					return { messages: [], tree: [] };
				}
				const latest = [...sessions].sort((a, b) => b.modified - a.modified)[0];
				if (!latest?.path) {
					return { messages: [], tree: [] };
				}
				const sm = SessionManager.open(
					latest.path,
					resolvedSessionDir,
					project.cwd || process.cwd(),
				);
				const tree = sm.getEntries() || [];
				const context = sm.buildSessionContext();
				return {
					messages: context.messages || [],
					tree,
				};
			} catch {
				return { messages: [], tree: [] };
			}
			/* eslint-enable security/detect-non-literal-fs-filename */
		},
	};

	return harness;
}
