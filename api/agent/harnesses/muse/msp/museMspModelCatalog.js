import os from "node:os";
import { MspSessionRuntime } from "./MspSessionRuntime.js";
import { resolveSpawnBinary } from "../../../harnessDiscovery.js";
import { resolveModel, withModelKey } from "../../../../models.js";
import {
	buildMuseMspHandshake,
	buildMuseServeSpawnPlan,
	classifyMuseMspStartupFailure,
	sanitizeMuseMspEnv,
} from "./museMspSupport.js";

/** The muse harness id — the first segment of every harness-scoped model key. */
const MUSE_HARNESS_ID = "muse";

/** Default cache TTL for the probed catalogue (ms). */
export const MUSE_MSP_MODEL_CACHE_TTL_MS = 300000;

/***
 * MARK: parseMuseMspModels
 * @description Maps a `model/list` result onto the engine's model shape:
 *   `{ provider, id, name, contextLimit, outputLimit, isDefault, key }`,
 *   harness-keyed so the UI can resolve `muse::<provider>::<modelId>`.
 *   Rows without a `modelId` are skipped (forward tolerance); a host with no
 *   bundled models yields [], which the loader reports honestly.
 * @example parseMuseMspModels({ models: [{ modelId: "muse-wonder-1.0", displayLabel: "muse-wonder-1.0", providerId: "meta" }] }) => [{ provider: "meta", id: "muse-wonder-1.0", … }]
 * @param {Object} result - The raw `model/list` result.
 * @returns {Array<Object>} The provider-tagged, key-attached model list.
 ***/
export function parseMuseMspModels(result) {
	const rows = Array.isArray(result?.models) ? result.models : [];
	const providerFallback =
		typeof result?.providerId === "string" && result.providerId ? result.providerId : "muse";
	const models = [];
	for (const row of rows) {
		if (!row || typeof row !== "object") continue;
		const id = typeof row.modelId === "string" && row.modelId ? row.modelId : null;
		if (!id) continue;
		models.push(
			withModelKey(
				{
					provider:
						typeof row.providerId === "string" && row.providerId
							? row.providerId
							: providerFallback,
					id,
					name:
						typeof row.displayLabel === "string" && row.displayLabel
							? row.displayLabel
							: id,
					contextLimit: numberOrNull(row.contextLimit),
					outputLimit: numberOrNull(row.outputLimit),
					isDefault: row.isDefault === true,
				},
				MUSE_HARNESS_ID,
			),
		);
	}
	return models;
}

/***
 * MARK: createMuseMspModelCatalog
 * @description Live model discovery for the muse MSP transport: a
 *   SHORT-LIVED probe host (`muse serve`, neutral cwd, echo-safe) answers
 *   `initialize` + `model/list`, then is disposed. Results are cached for the
 *   TTL so the UI's model routes never spawn a host per request, and a failed
 *   probe degrades to an empty list with the failure retained for
 *   `getModelDiscoveryStatus()` — the catalogue never fakes a list.
 * @example const catalog = createMuseMspModelCatalog({ settings });
 * @example await catalog.listModels() => [{ provider: "meta", id: "muse-wonder-1.0", … }]
 * @param {Object} opts
 * @param {Object} opts.settings - Resolved muse settings (bin, mspBin, provider, yolo, …).
 * @param {Function} [opts.log] - Diagnostic logger.
 * @param {Function} [opts.createRuntime] - Runtime factory override (tests).
 * @param {number} [opts.cacheTtlMs] - Cache TTL (default 5 min).
 * @returns {Object} { listModels, resolveModelRef, getModelDiscoveryStatus, clearCache }.
 ***/
export function createMuseMspModelCatalog({
	settings = {},
	log,
	createRuntime,
	cacheTtlMs = MUSE_MSP_MODEL_CACHE_TTL_MS,
} = {}) {
	let cachedModels = null;
	let cacheLoadedAt = 0;
	let cachePromise = null;
	let lastError = null;

	async function probe() {
		const binary = settings.mspBin || settings.bin || "muse";
		const command = resolveSpawnBinary(binary);
		const plan = buildMuseServeSpawnPlan({
			workspaceDir: os.tmpdir(),
			settings: {
				bin: command,
				provider: settings.provider,
				yolo: settings.yolo,
				trustWorkspace: settings.trustWorkspace,
				noSessionLog: settings.noSessionLog,
				mspExtraArgs: settings.mspExtraArgs,
			},
		});
		const runtime =
			typeof createRuntime === "function"
				? await createRuntime({ plan, command })
				: new MspSessionRuntime({
						command: plan.command,
						args: plan.args,
						cwd: os.tmpdir(),
						env: { ...sanitizeMuseMspEnv(), ...(settings.mspEnv || {}) },
						initializeParams: buildMuseMspHandshake(),
						startTimeoutMs: settings.mspStartTimeoutMs || 30000,
						hostSettings: { yolo: settings.yolo },
						log: (message) => log?.(`[MUSE MSP] ${message}`),
					});
		try {
			if (!runtime.started) await runtime.start();
			const result = await runtime.request(
				"model/list",
				{},
				{ timeoutMs: settings.mspStartTimeoutMs || 30000 },
			);
			return parseMuseMspModels(result);
		} finally {
			await runtime.dispose().catch(() => {});
		}
	}

	function loadModels({ refresh = false } = {}) {
		const now = Date.now();
		if (!refresh && cachedModels && now - cacheLoadedAt < cacheTtlMs) {
			return Promise.resolve(cachedModels);
		}
		if (cachePromise) return cachePromise;
		cachePromise = probe()
			.then((models) => {
				cachedModels = models;
				cacheLoadedAt = Date.now();
				lastError =
					models.length === 0
						? {
								code: "MUSE_MSP_MODELS_EMPTY",
								message: "The muse serve host reported no models.",
								hint: "Check the provider configuration (KAINBAIN_MUSE_MSP / muse serve --provider) and retry.",
							}
						: null;
				return models;
			})
			.catch((error) => {
				lastError = classifyMuseMspStartupFailure(error, {
					bin: settings.mspBin || settings.bin,
				});
				// Contract: a failed refresh keeps serving the STALE snapshot
				// (the catalogue never fakes a list, and never blanks a
				// previously good one on a transient probe failure).
				return cachedModels ?? [];
			})
			.finally(() => {
				cachePromise = null;
			});
		return cachePromise;
	}

	return {
		async listModels(opts) {
			return loadModels({ refresh: opts?.refresh === true });
		},

		async resolveModelRef(target) {
			const models = await loadModels();
			return resolveModel(models, target);
		},

		clearCache() {
			cachedModels = null;
			cacheLoadedAt = 0;
			cachePromise = null;
		},

		cachedModels() {
			return cachedModels;
		},

		lastDiscoveryError() {
			return lastError;
		},

		getModelDiscoveryStatus() {
			return lastError ? { ok: false, error: lastError } : { ok: true };
		},
	};
}

function numberOrNull(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
