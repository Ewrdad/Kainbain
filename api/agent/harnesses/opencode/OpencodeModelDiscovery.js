/**
 * MARK: OpencodeModelDiscovery
 * @description The OpenCode harness's model discovery: turns the Opencode
 *   server's `/config/providers` payload into the engine's model-list shape
 *   (`{ provider, id, name, contextWindow, input }` — same shape pi's
 *   discovery emits, so the merged /compute/models list and the project
 *   model pickers stay uniform), resolves stored `provider::id` references
 *   against that list, and caches with a TTL.
 *
 *   The mapping (`mapProvidersPayloadToModels`) is a pure function — the
 *   fetching/caching lives in the instance so tests can drive both halves
 *   separately.
 */

import { modelKey, parseModelKey } from "../../../models.js";

const DEFAULT_CACHE_TTL_MS = 30000;
const FETCH_TIMEOUT_MS = 3000;

/***
 * MARK: enabledInputModalities
 * @description Converts an Opencode model's capability matrix into the input
 *   modality array the engine reads (pi shape): only modalities the model
 *   actually accepts are listed.
 * @example enabledInputModalities({ text: true, image: true }) => ["text", "image"]
 * @param {Object} input - The model's `capabilities.input` flags.
 * @returns {Array<string>} Enabled input modalities.
 ***/
function enabledInputModalities(input) {
	return Object.entries(input || {})
		.filter(([, enabled]) => enabled === true)
		.map(([modality]) => modality);
}

/***
 * MARK: mapProvidersPayloadToModels
 * @description Flattens the `/config/providers` payload (`{ providers, default }`)
 *   into a plain model list. Each entry carries BOTH the engine's composite
 *   `key` and OpenCode's `providerID`/`modelID` pair so per-message model
 *   selection never has to re-split keys.
 * @example mapProvidersPayloadToModels(payload) => [{ provider, id, name, contextWindow, input, providerID, modelID, key }]
 * @param {Object} payload - The parsed providers response.
 * @returns {Array<Object>} The flattened model list.
 ***/
export function mapProvidersPayloadToModels(payload) {
	const providers = Array.isArray(payload?.providers) ? payload.providers : [];
	const models = [];

	for (const provider of providers) {
		if (!provider || typeof provider !== "object") continue;
		for (const [modelId, model] of Object.entries(provider.models || {})) {
			const input = enabledInputModalities(model?.capabilities?.input);
			models.push({
				provider: provider.id,
				id: modelId,
				name: model?.name || modelId,
				contextWindow: model?.limit?.context,
				input: input.length > 0 ? input : ["text"],
				providerID: provider.id,
				modelID: modelId,
			});
		}
	}

	// Default models first within the list (stable, cheap signal for pickers),
	// then everything else in payload order.
	const defaultPairs = new Set(
		Object.entries(payload?.default || {}).map(
			([providerID, modelID]) => modelKey(providerID, String(modelID)),
		),
	);
	models.sort((a, b) => {
		const aDefault = defaultPairs.has(modelKey(a.provider, a.id)) ? 0 : 1;
		const bDefault = defaultPairs.has(modelKey(b.provider, b.id)) ? 0 : 1;
		return aDefault - bDefault;
	});

	return models;
}

/***
 * MARK: OpencodeModelDiscovery
 * @description Fetches and caches the OpenCode server's provider/model list.
 ***/
export class OpencodeModelDiscovery {
	/***
	 * MARK: constructor
	 * @param {Object} [opts]
	 * @param {Function} [opts.fetchModels] - Test seam: () => Promise<payload>; defaults to fetching /config/providers from the base URL.
	 * @param {string} [opts.baseUrl] - Server base URL (used by the default fetch).
	 * @param {string} [opts.password] - Optional bearer password (OPENCODE_SERVER_PASSWORD).
	 * @param {number} [opts.cacheTtlMs] - Model-list cache TTL (ms).
	 ***/
	constructor({ fetchModels, baseUrl, password, cacheTtlMs } = {}) {
		this.fetchModelsImpl =
			fetchModels ||
			(async () => {
				const headers = { accept: "application/json" };
				if (password) headers.authorization = `Bearer ${password}`;
				const response = await fetch(`${baseUrl}/config/providers`, {
					headers,
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				});
				if (!response.ok) {
					throw new Error(`GET /config/providers → ${response.status}`);
				}
				return response.json();
			});
		this.cacheTtlMs = cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
		this.cachedModels = null;
		this.lastFetchTime = 0;
	}

	/***
	 * MARK: listModels
	 * @description Returns the discovered model list, from cache when fresh and
	 *   re-fetched otherwise. Any failure (server down, bad payload) yields an
	 *   empty list — model discovery must never take session creation down.
	 * @example await discovery.listModels() => [{ provider, id, name, … }]
	 * @param {Object} [opts]
	 * @param {boolean} [opts.refresh=false] - Bypass the cache.
	 * @returns {Promise<Array<Object>>} The model list ([] when unavailable).
	 ***/
	async listModels({ refresh = false } = {}) {
		const now = Date.now();
		if (
			!refresh &&
			this.cachedModels &&
			now - this.lastFetchTime < this.cacheTtlMs
		) {
			return this.cachedModels;
		}
		try {
			const payload = await this.fetchModelsImpl();
			this.cachedModels = mapProvidersPayloadToModels(payload).map((m) => ({
				...m,
				key: modelKey(m.provider, m.id),
			}));
			this.lastFetchTime = now;
		} catch {
			// Server unreachable or payload unusable: report no models rather than
			// throwing, but keep any previously-good cache.
			this.cachedModels = this.cachedModels || [];
			this.lastFetchTime = now;
		}
		return this.cachedModels;
	}

	/***
	 * MARK: resolveModelRef
	 * @description Resolves a stored model reference against the discovered
	 *   list: composite keys match on their `provider` + `id` segments
	 *   (canonical 3-part keys and legacy 2-part keys alike — the harness
	 *   segment never participates); bare ids/names fall back to first
	 *   match (same semantics as the engine's resolveModel).
	 * @example await discovery.resolveModelRef("anthropic::claude-3-7-sonnet") => { provider, id, … }
	 * @param {string|Object} target - Composite key, bare id, or {provider, id}.
	 * @returns {Promise<Object|null>} The resolved model, or null.
	 ***/
	async resolveModelRef(target) {
		const models = await this.listModels();
		if (!Array.isArray(models) || !target) return null;
		if (typeof target === "object") {
			// Accept both engine shape {provider, id} and server shape {providerID, modelID}.
			const provider = target.provider ?? target.providerID;
			const id = target.id ?? target.modelID;
			const byPair = models.find((m) => m.provider === provider && m.id === id);
			return byPair || null;
		}
		const key = String(target);
		const parsed = parseModelKey(key);
		if (parsed && parsed.form !== "bare") {
			return (
				models.find(
					(m) => m.provider === parsed.provider && m.id === parsed.id,
				) || null
			);
		}
		return models.find((m) => m.id === key || m.name === key) || null;
	}
}