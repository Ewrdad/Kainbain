import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { AcpSessionRuntime } from "../acp/AcpSessionRuntime.js";
import { resolveModel, withModelKey } from "../../../models.js";
import { config } from "../../../config/index.js";
import { resolveSpawnBinary } from "../../harnessDiscovery.js";
import {
	buildVibeAcpHandshake,
	classifyVibeAcpStartupFailure,
	resolveVibeAcpEndpoint,
	sanitizeVibeAcpEnv,
} from "./vibeAcpSupport.js";

/** The vibe harness id — the first segment of every harness-scoped model key
 *  this catalog produces (`vibe::mistral::<model id>`). */
const VIBE_HARNESS_ID = "vibe";

/** The provider tag for every discovered vibe model (Mistral-hosted). */
const VIBE_MODEL_PROVIDER = "mistral";

/**
 * MARK: vibeModelCatalog
 * @description Model discovery for the vibe harness's ACP transport: it
 *   spawns the standalone `vibe-acp` agent, runs the `initialize` +
 *   `session/new` handshake on a throwaway temp cwd, and reads the
 *   deployment-fed model select out of the `session/new` result's
 *   `configOptions` — NO LLM call, NO prompt, NO cost. The list is cached
 *   with a TTL (single-flight) so stage dispatch does not spawn the agent
 *   on every resolution; the spawn is bounded by a watchdog and always
 *   disposed (no orphan agent survives discovery).
 *
 *   Each option becomes `{ provider: "mistral", id: value, name, key }` so
 *   `vibe::mistral::<id>` refs resolve per
 *   `docs/EngineDetails/ModelKeys.md` (legacy `mistral::<id>` and bare ids
 *   still resolve through the shared resolver). Pure parsing is separated
 *   from spawning so tests can inject the mock ACP agent's output.
 *
 *   When the harness runs on the exec transport (ACP off/unavailable),
 *   `createVibeModelCatalog` is never consulted by the harness — the exec
 *   path keeps its honest empty list; this catalog serves ONLY the ACP
 *   path's live list.
 */

/** Default cache TTL for the discovery result (mirrors the model-discovery cache). */
const DEFAULT_CACHE_TTL_MS = config.modelCacheTtlMs || 30000;

/** Last-resort handshake watchdog (ms) when no explicit timeout is given —
 *  fail safe rather than an unbounded spawn. */
const FALLBACK_ACP_START_TIMEOUT_MS = 30000;

/***
 * MARK: parseVibeConfigModels
 * @description Pure mapping from a `session/new` result's `configOptions` to
 *   the engine's model shape: the select with `category: "model"` contributes
 *   one model per option (`value` → id, `name` → name). Missing or empty
 *   selects are skipped (forward tolerance) — an agent that ships no model
 *   select yields [], which the loader reports as an unparseable discovery
 *   (the catalog must never fake a list).
 * @example parseVibeConfigModels([{ category: "model", options: [{ value: "mistral-large-4-0-3", name: "Mistral Large 4.0.3" }] }]) => [{ provider: "mistral", id: "mistral-large-4-0-3", … }]
 * @param {Array<Object>} configOptions - The `configOptions` array from `session/new`.
 * @returns {Array<Object>} The provider-tagged, key-attached model list.
 ***/
export function parseVibeConfigModels(configOptions) {
	if (!Array.isArray(configOptions)) return [];
	const models = [];
	for (const option of configOptions) {
		if (!option || typeof option !== "object") continue;
		if (option.category !== "model" && option.id !== "model") continue;
		if (!Array.isArray(option.options)) continue;
		for (const entry of option.options) {
			if (typeof entry?.value !== "string" || !entry.value) continue;
			models.push(
				withModelKey(
					{
						provider: VIBE_MODEL_PROVIDER,
						id: entry.value,
						name: typeof entry.name === "string" && entry.name ? entry.name : entry.value,
					},
					VIBE_HARNESS_ID,
				),
			);
		}
	}
	return models;
}

/***
 * MARK: unparseableVibeModelsError
 * @description Builds the `VIBE_MODELS_UNPARSEABLE` error for the
 *   handshake-succeeded-but-no-models case: the agent answered, but its
 *   `configOptions` carried no usable model select — almost always
 *   `vibe-acp` output-shape drift the catalog does not know yet.
 * @example unparseableVibeModelsError().code => "VIBE_MODELS_UNPARSEABLE"
 * @returns {{code: string, message: string, hint: string}} The classified error.
 ***/
export function unparseableVibeModelsError() {
	return {
		code: "VIBE_MODELS_UNPARSEABLE",
		message:
			"The vibe-acp handshake succeeded but its session/new configOptions carried no model select.",
		hint: "The vibe-acp output shape may have changed — run probe-vibe-acp.mjs (see api/agent/harnesses/vibe/fixtures/) and paste the result in a bug report.",
	};
}

/***
 * MARK: createVibeModelCatalog
 * @description Builds the vibe model catalog. `listModels()` runs one
 *   handshake-only discovery (initialize + session/new on a temp cwd, then
 *   dispose — no prompt, no cost), parses the model select, and caches the
 *   result for `ttlMs`; resolution helpers run against the cached list.
 * @example const catalog = createVibeModelCatalog({ endpoint: { command: "/bin/mock-acp" } });
 * @example await catalog.listModels() => [{ provider: "mistral", id: "mistral-large-4-0-3", … }]
 * @param {Object} [opts]
 * @param {Object} [opts.endpoint] - The spawn endpoint from `resolveVibeAcpEndpoint` (defaults to resolving it from the engine config).
 * @param {Function} [opts.discoverModels] - Async () => Array<Object> loader (defaults to the handshake-only ACP probe; tests inject the mock agent).
 * @param {number} [opts.startTimeoutMs] - Handshake watchdog for the discovery spawn (default 30s; the child is killed on trip).
 * @param {number} [opts.ttlMs] - Cache TTL (default: the engine's model-cache TTL).
 * @param {string} [opts.tempDir] - Directory for the throwaway discovery workspace (default: the OS temp dir); tests inject a private root.
 * @param {Function} [opts.log] - Optional logger (message) for discovery failures.
 * @returns {Object} The catalog: { listModels, resolveModelRef, clearCache, cachedModels, lastDiscoveryError, getModelDiscoveryStatus }.
 ***/
export function createVibeModelCatalog({
	endpoint,
	discoverModels,
	startTimeoutMs,
	ttlMs = DEFAULT_CACHE_TTL_MS,
	tempDir,
	log,
} = {}) {
	let cachedModels = null;
	let cacheLoadedAt = 0;
	let cachePromise = null;
	// The last discovery failure (`{ code, message, hint }`), retained so the
	// API and the UI can explain an empty catalogue instead of serving it
	// silently. Cleared by the next load that yields at least one model.
	let lastError = null;

	const resolvedEndpoint = endpoint || resolveVibeAcpEndpoint({ acpBin: config.vibeAcpBin });

	/** Default loader: one handshake-only ACP probe on a throwaway cwd.
	 *  Bounded by the runtime's start watchdog; the agent child is ALWAYS
	 *  disposed (a discovery spawn must never become an orphan).
	 *  The workspace is removed on every exit path — setup throw, start throw,
	 *  dispose throw; a failed rm is logged, never silent. */
	async function defaultDiscoverModels() {
		const workspace = await fs.promises.mkdtemp(path.join(tempDir || os.tmpdir(), "vibe-acp-models-"));
		let runtime;
		try {
			const command = resolveSpawnBinary(resolvedEndpoint.command);
			runtime = new AcpSessionRuntime({
				command,
				args: resolvedEndpoint.args,
				cwd: workspace,
				env: sanitizeVibeAcpEnv(),
				initializeParams: buildVibeAcpHandshake(),
				newSessionParams: {},
				startTimeoutMs: startTimeoutMs || config.vibeAcpStartTimeoutMs || FALLBACK_ACP_START_TIMEOUT_MS,
			});
			await runtime.start();
			return parseVibeConfigModels(runtime.sessionResult?.configOptions);
		} finally {
			try {
				await runtime?.dispose();
			} catch {
				// dispose is best-effort; workspace cleanup must still run
			}
			try {
				await fs.promises.rm(workspace, { recursive: true, force: true });
			} catch (cleanupError) {
				const message = `[WARN] vibe model discovery cleanup failed for '${workspace}': ${cleanupError?.message || cleanupError}`;
				console.warn(message);
				log?.(message);
			}
		}
	}

	const loader = discoverModels || defaultDiscoverModels;

	/** Records one discovery failure: retained for the API/UI, and loud on
	 *  purpose — a silent [] here would surface as a working-but-modelless
	 *  vibe harness with no explanation. */
	function recordFailure(classified) {
		lastError = classified;
		const message =
			`[WARN] vibe model discovery failed [${classified.code}]: ` +
			`${classified.message} ${classified.hint}`;
		console.warn(message);
		log?.(message);
	}

	async function loadModels() {
		const age = Date.now() - cacheLoadedAt;
		if (cachedModels && age < ttlMs) return cachedModels;
		if (!cachePromise) {
			cachePromise = loader()
				.then((models) => {
					cachedModels = Array.isArray(models) ? models : [];
					cacheLoadedAt = Date.now();
					if (cachedModels.length === 0) {
						recordFailure(unparseableVibeModelsError());
					} else {
						lastError = null;
					}
					return cachedModels;
				})
				.catch((error) => {
					recordFailure(
						classifyVibeAcpStartupFailure(error, {
							bin: resolveSpawnBinary(resolvedEndpoint.command),
						}),
					);
					return [];
				})
				.finally(() => {
					cachePromise = null;
				});
		}
		return cachePromise;
	}

	return {
		/***
		 * MARK: listModels
		 * @description Lists the deployment's vibe models (cached for the
		 *   TTL). A failed discovery degrades to an empty list with the
		 *   failure retained for `getModelDiscoveryStatus()`.
		 * @returns {Promise<Array<Object>>} The provider-tagged model list.
		 ***/
		async listModels() {
			return loadModels();
		},

		/***
		 * MARK: resolveModelRef
		 * @description Resolves a stored model reference (canonical
		 *   `vibe::mistral::<id>`, legacy `mistral::<id>`, or bare id/name)
		 *   against the cached discovery list; null when unresolvable —
		 *   callers warn, never silently swap.
		 * @returns {Promise<Object|null>} The resolved model, or null.
		 ***/
		async resolveModelRef(target) {
			const models = await loadModels();
			return resolveModel(models, target);
		},

		/***
		 * MARK: clearCache
		 * @description Drops the cached model list so the next call re-runs
		 *   discovery.
		 ***/
		clearCache() {
			cachedModels = null;
			cacheLoadedAt = 0;
			cachePromise = null;
		},

		/***
		 * MARK: cachedModels
		 * @description Returns the current cached list (null when never
		 *   loaded) — for tests.
		 ***/
		cachedModels() {
			return cachedModels;
		},

		/***
		 * MARK: lastDiscoveryError
		 * @description Returns the last discovery failure (`{ code, message,
		 *   hint }`), or null when the last load succeeded (or nothing has
		 *   loaded yet).
		 * @returns {Object|null} The retained error, or null.
		 ***/
		lastDiscoveryError() {
			return lastError;
		},

		/***
		 * MARK: getModelDiscoveryStatus
		 * @description Reports the catalog's discovery health: `{ ok: true }`
		 *   when the last load succeeded (or nothing has loaded yet — no
		 *   failure to report), `{ ok: false, error }` after a failure.
		 * @returns {{ok: boolean, error?: Object}} The discovery status.
		 ***/
		getModelDiscoveryStatus() {
			return lastError ? { ok: false, error: lastError } : { ok: true };
		},
	};
}
