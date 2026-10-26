// Domain: The Crew — available models for each crew member.
import {
	listPublicModels,
	modelListCache,
	aggregateModelCatalog,
} from "../models.js";
import config from "../config.js";
/***
 * MARK: clearModelsCache
 * @description Clears the cached model listings to force a fresh harness
 *   listing on the next request (all harness slots of the shared cache).
 * @example clearModelsCache()
 * @returns {void}
 ***/
export function clearModelsCache() {
	modelListCache.clear();
}

/***
 * MARK: getAvailableModels
 * @description Lists the available models of one agent harness through its
 *   `listModels()` contract method — the same source of truth sessions
 *   resolve models against — projected onto the public model shape, TTL-cached
 *   per harness id (shared with `/harnesses/:id/models`), with the curated
 *   fallback when the harness yields nothing, has no `listModels`, or throws.
 *   Every model is tagged with the owning harness's harness-scoped key
 *   (`harness::provider::id`, plus a `harness` field) when the harness
 *   declares its id; legacy references in all forms still resolve everywhere.
 *   Harnesses with no model catalogue pass `fallbackWhenEmpty: false` to get
 *   an honest empty list instead of the fallback (those models cannot run
 *   there — the UI hides model selection for them).
 * @example await getAvailableModels({ harness }) => [{ key: 'pi::google::m', harness: 'pi', … }]
 * @param {Object} [opts]
 * @param {boolean} [opts.refresh=false] - Ask the harness for a network-free disk refresh first and bypass the cache.
 * @param {Object} [opts.harness] - The AgentHarness to list through.
 * @param {boolean} [opts.fallbackWhenEmpty=true] - Serve the curated fallback when the harness yields nothing (false ⇒ honest empty list).
 * @returns {Promise<Array<Object>>} Public model projections (never empty when fallbackWhenEmpty is true).
 ***/
export async function getAvailableModels(
	{ refresh = false, harness, fallbackWhenEmpty = true } = {},
) {
	return modelListCache.getOrLoad(
		harness?.id || "default",
		() => listPublicModels({ harness, refresh, fallbackWhenEmpty }),
		{ refresh },
	);
}

/***
 * MARK: harnessesView
 * @description Projects the id-keyed harness VIEW registry (deps.harnessRegistry,
 *   registered by the composition root) onto the additive `harnesses[]` payload
 *   served by `/compute/models` — the navigation data behind the UI's
 *   harness-first model selector. Each entry carries the registry entry's `id`,
 *   its display `name` as `label`, its `description`, `modelSelection` /
 *   `modelFlag` (how the UI renders model selection for the harness), whether
 *   it is the default harness, and its model catalogue through the same
 *   `listModels()` contract source as the flat list, plus the additive
 *   `discoveryError` (`{ code, message, hint }`) when the harness reports a
 *   discovery failure behind `getModelDiscoveryStatus()`. The default harness's
 *   entry reuses the flat list's array (one cache slot, one listing) so its
 *   `models` are always the exact catalogue served as `models`. Every
 *   NON-default entry serves its harness's listing honestly: an empty or
 *   failing discovery yields `[]`, never the curated fallback — fallback
 *   models cannot run on that harness, and serving them lets users pick
 *   models (e.g. pi-flavored entries for antigravity) that can never
 *   resolve. Only the default harness's flat list keeps the curated fallback
 *   (offline resilience for the primary picker). A missing or empty registry
 *   degrades to `[]` — the frontend wraps the flat catalogue as a single
 *   harness row in that case, so older callers never break.
 * @example await harnessesView({ registry, defaultHarness, models, refresh })
 *   => [{ id: 'pi', label: 'pi coding agent', description: '…', modelSelection: 'list', models: [...] }]
 * @param {Object} [opts]
 * @param {Object} [opts.registry] - The id-keyed harness view registry (`{ list() }`).
 * @param {Object} [opts.defaultHarness] - The harness the flat `models` list was resolved through.
 * @param {Array<Object>} [opts.models] - The flat catalogue served alongside (reused for the default entry).
 * @param {boolean} [opts.refresh=false] - Passed through to per-harness listings for non-default entries.
 * @param {number} [opts.timeoutMs] - Per-harness listing budget (defaults to the configured models timeout).
 * @returns {Promise<Array<Object>>} Harness view entries (never throws; empty without a registry).
 ***/
/***
 * MARK: listHarnessModelsWithTimeout
 * @description Lists one non-default harness's models, raced against the
 *   configured per-harness budget (`KAINBAIN_MODELS_HARNESS_TIMEOUT_MS`). A
 *   harness that hangs serves an honest `[]` instead of stalling the whole
 *   `/compute/models` catalogue behind the slowest harness — the tail-latency
 *   failure that leaves remote UIs unpopulated on high-latency links.
 * @example await listHarnessModelsWithTimeout(harness, { timeoutMs: 50 }) => []
 * @param {Object} [harness] - The AgentHarness to list through.
 * @param {Object} [opts]
 * @param {boolean} [opts.refresh=false] - Bypass the TTL cache for this listing.
 * @param {number} [opts.timeoutMs] - Budget for one harness listing.
 * @returns {Promise<Array<Object>>} Public model projections (possibly empty).
 ***/
export async function listHarnessModelsWithTimeout(
	harness,
	{ refresh = false, timeoutMs = config.modelsHarnessTimeoutMs } = {},
) {
	let timer;
	try {
		return await Promise.race([
			getAvailableModels({ refresh, harness, fallbackWhenEmpty: false }),
			new Promise((resolve) => {
				timer = setTimeout(() => resolve([]), timeoutMs);
				if (typeof timer.unref === "function") timer.unref();
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

export async function harnessesView({
	registry,
	defaultHarness,
	models,
	refresh = false,
	timeoutMs = config.modelsHarnessTimeoutMs,
} = {}) {
	// Single implementation: the domain aggregator (api/models.js) owns the
	// per-harness projection; this crew seam forwards the caller's
	// precomputed flat list so the default entry reuses its array.
	const { harnesses } = await aggregateModelCatalog({
		registry,
		defaultHarness,
		flatModels: models,
		refresh,
		timeoutMs,
	});
	return harnesses;
}

