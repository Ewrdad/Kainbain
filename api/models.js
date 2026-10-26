import { config } from "./config.js";
import { discoverHarnesses } from "./agent/harnessDiscovery.js";
import {
	harnessModelKey,
	modelKey,
	withModelKey,
} from "../shared/modelKeys.js";

/***
 * MARK: FALLBACK_MODELS
 * @description Curated fallback model list served when a harness yields no
 *   usable models (empty availability snapshot, harness error, or no harness
 *   at all). Keeps the model picker non-empty (the frontend depends on a
 *   non-empty `/compute/models` response) when local model configuration is
 *   unavailable. Lives in the model domain (not the routes) because both
 *   `/compute/models` and `/harnesses/:id/models` fall back to it.
 *
 *   DE-STALE POLICY (task 970c0045): the curated fallback may only ever list
 *   models that CAN actually run. The former google (`gemini-2.5-*`) and
 *   anthropic (`claude-3-7-sonnet`) entries were removed — no configured
 *   registry exposes them and no credentials exist for those providers, so
 *   they could never run. The remaining entries mirror the live ollama-cloud
 *   models.json catalogue; keep this list in sync with reality and let the
 *   credential-aware enrichment (withRunnableFlags) label every served entry
 *   honestly — synthetic fallback rows are never reported "Ready" unless the
 *   provider's snapshot membership proves they are.
 ***/
export const FALLBACK_MODELS = [
	{
		id: "deepseek-v4-flash:0731-cloud",
		name: "DeepSeek v4 Flash (Cloud)",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "deepseek-v4-pro:0813-cloud",
		name: "DeepSeek v4 Pro (Cloud)",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "gemma4:12b",
		name: "Gemma 4 12B",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "gemma4:31b-cloud",
		name: "Gemma 4 31B (Cloud)",
		provider: "ollama-cloud",
		input: ["text", "image"],
	},
	{
		id: "glm-5.1:cloud",
		name: "GLM 5.1 (Cloud)",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "glm-5.2:cloud",
		name: "GLM 5.2 (Cloud)",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "glm-5.3-flash:cloud",
		name: "GLM 5.3 Flash (Cloud)",
		provider: "ollama-cloud",
		input: ["text", "image"],
	},
	{
		id: "gpt-oss:120b-cloud",
		name: "GPT-OSS 120B (Cloud)",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "gpt-oss:20b-cloud",
		name: "GPT-OSS 20B (Cloud)",
		provider: "ollama-cloud",
		input: ["text"],
	},
	{
		id: "kimi-k2.7-code:cloud",
		name: "Kimi K2.7 Code (Cloud)",
		provider: "ollama-cloud",
		input: ["text", "image"],
	},
	{
		id: "kimi-k3:cloud",
		name: "Kimi K3 (Cloud)",
		provider: "ollama-cloud",
		input: ["text", "image"],
	},
	{
		id: "qwen3.5:397b-cloud",
		name: "Qwen 3.5 397B (Cloud)",
		provider: "ollama-cloud",
		input: ["text", "image"],
	},
];

/***
 * MARK: models (backend canonical module)
 * @description The engine's canonical import point for model identity keys.
 *   Builds, parses, normalizes, and resolves model references in all three
 *   accepted forms:
 *
 *     1. `harness::provider::id`  — canonical, harness-scoped
 *     2. `provider::id`           — legacy composite key (still accepted)
 *     3. bare `id` or `name`      — oldest form (first-match fallback)
 *
 *   The pure grammar implementation lives in `shared/modelKeys.js` (plain
 *   ESM, zero dependencies) so the frontend switcher mirrors it exactly and
 *   the two grammars cannot drift. Parsing splits on the first two `::`
 *   occurrences only — model ids may contain single `:`, never `::`; no
 *   segment may itself contain `::`; harness ids must match
 *   `[a-z0-9][a-z0-9_-]*`. Malformed keys are rejected (parse → null,
 *   builders → thrown error), never mis-read into a wrong model.
 *
 *   MARK: exported surface (implementation + full JSDoc in shared/modelKeys.js)
 *   - MODEL_KEY_SEP, HARNESS_ID_PATTERN
 *   - modelKey(provider, id)             — legacy composite key builder
 *   - harnessModelKey(harness, provider, id) — canonical harness-scoped builder
 *   - withModelKey(m, harness?)          — attach key (+harness) to a model
 *   - parseModelKey(ref)                 — parse any accepted form
 *   - validateModelRefShape(ref)         — grammar shape without a catalog
 *   - classifiesForeignHarness(ref, harness?) — 3-part key naming another harness
 *   - normalizeModelRef(ref, harness?)   — canonicalize a stored reference
 *   - resolveModel(available, target)    — snapshot resolution (all forms)
 *   - resolveModelFromRegistry(runtime, target) — full-registry resolution
 ***/

export {
	MODEL_KEY_SEP,
	HARNESS_ID_PATTERN,
	modelKey,
	harnessModelKey,
	withModelKey,
	parseModelKey,
	validateModelRefShape,
	classifiesForeignHarness,
	normalizeModelRef,
	stripReasoning,
	splitReasoning,
	appendReasoning,
	checkReasoningLevelText,
	resolveModel,
	resolveModelFromRegistry,
} from "../shared/modelKeys.js";

/***
 * MARK: toPublicModel
 * @description Projects a raw harness model (SDK `Model` or file-style model)
 *   onto the stable public shape served by the model-list API endpoints, and
 *   tags it with the owning harness's harness-scoped `key`
 *   (`harness::provider::id`, plus a `harness` field) when a harness id is
 *   supplied — the canonical identity since model keys became harness-scoped —
 *   or with the legacy provider-scoped `key` (`provider::id`) otherwise.
 *   SDK models carry internals the API must not leak (`api`, `baseUrl`, `cost`,
 *   `maxTokens`, `compat`, `headers`); projecting keeps the response payload
 *   minimal and shape-stable for clients, whatever the underlying harness
 *   returns. A non-string second argument (e.g. the index leaked by
 *   `list.map(toPublicModel)`) is ignored, preserving the 1-arg legacy shape.
 * @example toPublicModel({ id: 'm', provider: 'google', baseUrl: '…', cost: {} })
 *   => { id: 'm', name: 'm', provider: 'google', contextWindow: undefined, input: undefined, key: 'google::m' }
 * @example toPublicModel({ id: 'm', provider: 'google' }, 'pi')
 *   => { …, key: 'pi::google::m', harness: 'pi' }
 * @param {Object} m - Raw model object with at least `id` and `provider`.
 * @param {string} [harness] - Owning harness id; scopes the key when supplied.
 * @returns {Object} Public model projection: `{ key, id, name, provider, contextWindow, input }` (+ `harness` when scoped).
 ***/
export function toPublicModel(m, harness) {
	if (!m || typeof m !== "object") return m;
	const projected = {
		id: m.id,
		name: m.name ?? m.id,
		provider: m.provider,
		contextWindow: m.contextWindow,
		input: m.input,
	};
	if (m && Object.prototype.hasOwnProperty.call(m, "supportedReasoning")) {
		projected.supportedReasoning = m.supportedReasoning;
	}
	return withModelKey(projected, harness);
}

/***
 * MARK: publicModelJsonSchema
 * @description JSON schema of the public model shape served by the model-list
 *   HTTP views (`/compute/models`, `/harnesses/:id/models`). Declared once so
 *   every model view validates (and documents in Swagger) the identical
 *   payload that `toPublicModel` produces — including the `harness` field
 *   carried by harness-scoped keys; extra fields are tolerated
 *   (`additionalProperties: true`) for forward compatibility.
 ***/
export const publicModelJsonSchema = {
	type: "object",
	properties: {
		key: { type: "string" },
		id: { type: "string" },
		name: { type: "string" },
		provider: { type: "string" },
		harness: { type: "string" },
		contextWindow: { type: "number" },
		input: {
			type: "array",
			items: { type: "string" },
		},
		// Credential-aware availability enrichment (optional — present only when
		// the serving view read a model runtime; see withRunnableFlags).
		runnable: { type: "boolean" },
		authConfigured: { type: ["boolean", "null"] },
		authSource: { type: ["string", "null"] },
		authLabel: { type: ["string", "null"] },
		statusLabel: { type: "string" },
		// Per-model advertised reasoning levels (optional).
		supportedReasoning: { type: ["array", "null"], items: { type: "string" } },
	},
	additionalProperties: true,
};

/***
 * MARK: discoveryErrorJsonSchema
 * @description JSON schema of the additive discovery-error payload served
 *   alongside model catalogues (`/harnesses/:id/models` top level,
 *   `/compute/models` per-harness entries): `{ code, message, hint }` — the
 *   stable failure code, the human reason, and the remediation. Declared once
 *   so every model view validates (and documents in Swagger) the identical
 *   shape; the field is present only when discovery actually failed.
 ***/
export const discoveryErrorJsonSchema = {
	type: "object",
	properties: {
		code: { type: "string" },
		message: { type: "string" },
		hint: { type: "string" },
	},
	required: ["code", "message", "hint"],
	additionalProperties: true,
};

/***
 * MARK: getHarnessDiscoveryStatus
 * @description Reads one harness's OPTIONAL discovery-health report behind the
 *   `getModelDiscoveryStatus()` contract method (`{ ok: true }` or `{ ok:
 *   false, error: { code, message, hint } }`). Harnesses without the method
 *   (pi, custom) report nothing — their views behave exactly as before.
 *   Never throws: a missing method, a malformed status, or a
 *   reporting failure all read as "no failure to report" (null), so a broken
 *   probe can never break the model list itself.
 * @example await getHarnessDiscoveryStatus(antigravityHarness) => { code: "AGY_BIN_MISSING", message: "…", hint: "…" }
 * @example await getHarnessDiscoveryStatus(piHarness) => null
 * @param {Object} [harness] - The AgentHarness to probe (may be null).
 * @returns {Promise<Object|null>} The `{ code, message, hint }` error, or null when healthy/unknown.
 ***/
export async function getHarnessDiscoveryStatus(harness) {
	try {
		if (!harness || typeof harness.getModelDiscoveryStatus !== "function") {
			return null;
		}
		const status = await harness.getModelDiscoveryStatus();
		if (!status || status.ok !== false) return null;
		const error = status.error;
		if (
			!error ||
			typeof error.code !== "string" ||
			typeof error.message !== "string" ||
			typeof error.hint !== "string"
		) {
			return null;
		}
		return { code: error.code, message: error.message, hint: error.hint };
	} catch {
		return null;
	}
}

/***
 * MARK: createModelListCache
 * @description Creates a TTL cache for harness model listings, keyed by an
 *   arbitrary slot key (per harness id). `getOrLoad` serves a fresh-enough
 *   cached listing within the TTL, otherwise invokes `load()` once and caches
 *   the result; `refresh` bypasses the TTL read but still repopulates the
 *   cache. `clear()` evicts one slot or the whole cache.
 * @example const cache = createModelListCache({ ttlMs: 30000 });
 * @param {Object} [opts]
 * @param {number} [opts.ttlMs=30000] - Cache lifetime for one listing.
 * @returns {Object} Cache with `getOrLoad(key, load, { refresh })` and `clear(key?)`.
 ***/
export function createModelListCache({ ttlMs = 30000 } = {}) {
	const entries = new Map(); // slot key -> { models, fetchedAt }
	return {
		/***
		 * MARK: modelListCache.getOrLoad
		 * @description Returns the cached listing for `key` when it is younger than
		 *   the TTL and `refresh` is not requested; otherwise awaits `load()` once
		 *   and caches its result. Load errors propagate to the caller.
		 ***/
		async getOrLoad(key, load, { refresh = false } = {}) {
			const now = Date.now();
			const hit = refresh ? null : entries.get(key);
			if (hit && now - hit.fetchedAt < ttlMs) return hit.models;
			const models = await load();
			entries.set(key, { models, fetchedAt: now });
			return models;
		},
		/***
		 * MARK: modelListCache.clear
		 * @description Evicts the slot for `key`, or the entire cache when omitted.
		 ***/
		clear(key) {
			if (key === undefined) entries.clear();
			else entries.delete(key);
		},
	};
}

/***
 * MARK: modelListCache (shared instance)
 * @description Process-wide TTL cache shared by the model-list HTTP views
 *   (`/compute/models` and `/harnesses/:id/models`) so every view of the same
 *   harness resolves from one cached listing per TTL window. Slots are keyed
 *   by harness id (`"default"` when a harness does not declare one).
 ***/
export const modelListCache = createModelListCache({
	ttlMs: config.modelCacheTtlMs,
});

/***
 * MARK: listPublicModels
 * @description Lists one harness's models through its `listModels()` contract
 *   method (with an optional best-effort, network-free snapshot refresh) and
 *   projects them onto the public API shape. Falls back to the curated
 *   `FALLBACK_MODELS` when the harness yields nothing, has no `listModels`, or
 *   throws — the default harness's picker must never render empty because a
 *   harness had a bad moment — UNLESS `fallbackWhenEmpty` is false: callers
 *   pass false for every non-default harness (and for catalogue-less ones
 *   like custom) to serve an honest empty list instead, so callers hide model
 *   selection rather than offer models that cannot run there. Shared by
 *   `/compute/models` and `/harnesses/:id/models` so every model view has
 *   identical semantics. Every projection is tagged with the owning harness's
 *   harness-scoped key (`harness::provider::id` + a `harness` field) when the
 *   harness declares its `id`, so the same `provider::id` exposed by two
 *   harnesses can never collide; harnesses without an id keep the legacy
 *   provider-scoped key shape.
 * @example await listPublicModels({ harness }) => [{ key: 'pi::google::m', harness: 'pi', … }]
 * @example await listPublicModels({ harness: customHarness, fallbackWhenEmpty: false }) => []
 * @param {Object} [opts]
 * @param {Object} [opts.harness] - The AgentHarness to list models through.
 * @param {boolean} [opts.refresh=false] - Ask the harness to refresh its model snapshot from disk first (no network).
 * @param {boolean} [opts.fallbackWhenEmpty=true] - Serve FALLBACK_MODELS when the harness yields nothing (false ⇒ honest empty list).
 * @returns {Promise<Array<Object>>} Public model projections (never empty when fallbackWhenEmpty is true).
 ***/
export async function listPublicModels(
	{ harness, refresh = false, fallbackWhenEmpty = true } = {},
) {
	let listed = null;
	if (harness && typeof harness.listModels === "function") {
		try {
			const models = await harness.listModels({ refresh });
			if (Array.isArray(models) && models.length > 0) listed = models;
		} catch {
			// Harness failure → curated fallback below (when allowed).
		}
	}
	const source = listed || (fallbackWhenEmpty ? FALLBACK_MODELS : []);
	return source.map((m) => toPublicModel(m, harness?.id));
}

/*
 * resolveModel / resolveModelFromRegistry (and the rest of the key grammar)
 * are re-exported from `shared/modelKeys.js` above — the single implementation
 * of the model-key grammar shared with the frontend. They accept all three
 * reference forms (harness::provider::id, provider::id, bare id/name).
 */

/***
 * MARK: listCatalogWithTimeout
 * @description Lists one non-default harness's catalog for the aggregator,
 *   raced against the per-harness budget (`KAINBAIN_MODELS_HARNESS_TIMEOUT_MS`).
 *   A harness that hangs serves an honest `[]` instead of stalling the whole
 *   catalogue behind the slowest harness. Shares the process-wide
 *   `modelListCache` slots with every other model view, so the listing is
 *   fetched once per TTL window however many views read it. Never serves
 *   the curated fallback (non-default catalogs are honest, never synthetic).
 * @example await listCatalogWithTimeout(harness, { timeoutMs: 50 }) => []
 * @param {Object} [harness] - The AgentHarness to list through.
 * @param {Object} [opts]
 * @param {boolean} [opts.refresh=false] - Bypass the TTL cache for this listing.
 * @param {number} [opts.timeoutMs] - Budget for one harness listing.
 * @returns {Promise<Array<Object>>} Public model projections (possibly empty).
 ***/
async function listCatalogWithTimeout(
	harness,
	{ refresh = false, timeoutMs = config.modelsHarnessTimeoutMs } = {},
) {
	let timer;
	try {
		return await Promise.race([
			modelListCache.getOrLoad(
				harness?.id || "default",
				() =>
					listPublicModels({ harness, refresh, fallbackWhenEmpty: false }),
				{ refresh },
			),
			new Promise((resolve) => {
				timer = setTimeout(() => resolve([]), timeoutMs);
				if (typeof timer.unref === "function") timer.unref();
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/***
 * MARK: aggregateModelCatalog
 * @description The engine's dynamic model catalog: queries each AVAILABLE
 *   harness's live `listModels()` and merges the results into the
 *   `/compute/models` shape (`models` flat + `harnesses[]` per-harness view).
 *   Tier order: (a) the live aggregated catalog; (b) the curated
 *   `FALLBACK_MODELS` as the last-resort offline tier for the DEFAULT
 *   harness only (existing `fallbackWhenEmpty` semantics — catalogue-less
 *   defaults honestly serve `[]`, every non-default harness honestly serves
 *   `[]`, never synthetic entries that cannot run there).
 *
 *   Availability-aware: a non-default harness that discovery reports
 *   unavailable AND whose own `getModelDiscoveryStatus()` already names the
 *   failure skips its (doomed) `listModels()` call and contributes `[]` +
 *   its `discoveryError`; every other harness lists through the shared TTL
 *   cache with the per-harness timeout budget, so one hanging/throwing
 *   harness can never stall or break the whole catalogue. The default
 *   entry reuses the flat list's array (one cache slot, one listing).
 * @example await aggregateModelCatalog({ registry, defaultHarness }) => { models: [...], harnesses: [{ id: 'pi', models: [...] }] }
 * @param {Object} [opts]
 * @param {Object} [opts.registry] - The id-keyed harness view registry (`{ list() }`).
 * @param {Object} [opts.defaultHarness] - The harness the flat `models` list resolves through.
 * @param {Array<Object>} [opts.flatModels] - Precomputed flat list (reused for the flat payload + default entry without refetching).
 * @param {boolean} [opts.refresh=false] - Ask harnesses for a network-free disk refresh and bypass the caches.
 * @param {number} [opts.timeoutMs] - Per-harness listing budget (defaults to the configured models timeout).
 * @param {boolean} [opts.fallbackWhenEmpty] - Serve the curated fallback for an empty default catalog (defaults to the default harness's modelSelection: list ⇒ true, none ⇒ false).
 * @returns {Promise<{models: Array<Object>, harnesses: Array<Object>}> The merged catalog (never throws for harness failures).
 ***/
export async function aggregateModelCatalog({
	registry,
	defaultHarness,
	flatModels,
	refresh = false,
	timeoutMs = config.modelsHarnessTimeoutMs,
	fallbackWhenEmpty,
} = {}) {
	const entries = typeof registry?.list === "function" ? registry.list() : [];
	const flatFallback =
		fallbackWhenEmpty ?? (defaultHarness?.modelSelection || "list") === "list";
	const models =
		flatModels ??
		(await modelListCache.getOrLoad(
			defaultHarness?.id || "default",
			() =>
				listPublicModels({
					harness: defaultHarness,
					refresh,
					fallbackWhenEmpty: flatFallback,
				}),
			{ refresh },
		));

	let availability = new Map();
	try {
		for (const row of discoverHarnesses({ refresh })) {
			availability.set(row.id, row);
		}
	} catch {
		availability = new Map();
	}

	const harnesses = await Promise.all(
		entries.map(async (entry) => {
			try {
				const isDefaultEntry = entry.harness === defaultHarness;
				let entryModels;
				if (isDefaultEntry) {
					entryModels = models;
				} else {
					entryModels = null;
					const probe = availability.get(entry.id);
					if (probe?.available === false) {
						// Known-unavailable AND the harness already names the
						// failure: skip the doomed listModels() call (the
						// discoveryError below still explains the empty list).
						// Harnesses whose status needs a load (cold agy
						// catalog reports healthy) fall through to the live
						// listing so their specific error is preserved.
						const reported = await getHarnessDiscoveryStatus(
							entry.harness,
						);
						if (reported) entryModels = [];
					}
					if (entryModels === null) {
						entryModels = await listCatalogWithTimeout(entry.harness, {
							refresh,
							timeoutMs,
						});
					}
				}
				const view = {
					id: entry.id,
					label: entry.name || entry.id,
					description: entry.description || "",
					modelSelection:
						entry.modelSelection || entry.harness?.modelSelection || "list",
					modelFlag: entry.modelFlag ?? entry.harness?.modelFlag ?? null,
					reasoningLevels:
						entry.reasoningLevels ?? entry.harness?.reasoningLevels ?? null,
					// Whether this harness can run the advisory stuck-check diagnosis
					// (only harnesses with a createDiagnosisSession function).
					supportsDiagnosis:
						typeof entry.harness?.createDiagnosisSession === "function",
					isDefault: isDefaultEntry,
					models: entryModels,
				};
				// Additive availability projection (same discovery source as GET
				// /harnesses): the pickers render badges + hints from it.
				// Entries without a discovery row (unknown ids) carry the
				// unknown shape so older and newer clients agree.
				const availabilityRow = availability.get(entry.id);
				if (availabilityRow) {
					view.available = availabilityRow.available;
					view.detectionSource = availabilityRow.detectionSource;
					if (availabilityRow.hint !== undefined) {
						view.hint = availabilityRow.hint;
					}
				} else {
					view.available = null;
					view.detectionSource = "unknown";
				}
				const discoveryError = await getHarnessDiscoveryStatus(entry.harness);
				if (discoveryError) view.discoveryError = discoveryError;
				return view;
			} catch {
				// A malformed registry entry (or a harness that throws outside
				// its contract) contributes an honest empty row — never a 500.
				return {
					id: entry?.id || "unknown",
					label: entry?.name || entry?.id || "unknown",
					description: entry?.description || "",
					modelSelection: "list",
					modelFlag: null,
					supportsDiagnosis: false,
					isDefault: false,
					models: [],
				};
			}
		}),
	);
	return { models, harnesses };
}

/***
 * MARK: safeRuntimeCall
 * @description Invokes an optional runtime method, returning its result or the
 *   provided fallback when the method is missing or throws. Keeps the
 *   credential-aware helpers below tolerant of partial/legacy runtime shapes.
 * @param {Function} fn - Thunk invoking the optional method.
 * @param {any} [fallback] - Value returned when the call fails.
 * @returns {any}
 ***/
function safeRuntimeCall(fn, fallback) {
	try {
		const value = fn();
		return value === undefined ? fallback : value;
	} catch {
		return fallback;
	}
}

/***
 * MARK: providerAuthSummary
 * @description Pure, duck-typed read of a ModelRuntime's credential state —
 *   the single source both the /compute/models enrichment and the pi harness's
 *   health probe share. Never imports the pi SDK and never triggers network
 *   work: it only reads the availability snapshot, the full registry, and
 *   per-provider auth status. Returns null when no runtime is supplied so
 *   callers behave exactly as before enrichment existed.
 * @example providerAuthSummary(runtime) => { error: null, providers: [{ provider, configured, source, label }], snapshotProviders: ['ollama-cloud'], snapshotSize: 5, registrySize: 5 }
 * @param {Object} runtime - ModelRuntime-like object (getAvailableSnapshot / getModels / getProviderAuthStatus / getError).
 * @returns {Object|null} The auth summary, or null when runtime is absent.
 ***/
export function providerAuthSummary(runtime) {
	if (!runtime || typeof runtime !== "object") return null;
	const snapshot =
		safeRuntimeCall(() => runtime.getAvailableSnapshot?.(), []) || [];
	const registry = safeRuntimeCall(() => runtime.getModels?.(), []) || [];
	const providers = [
		...new Set(
			[...registry, ...snapshot]
				.map((m) => m?.provider)
				.filter((p) => typeof p === "string" && p.length > 0),
		),
	];
	const authProviders = providers.map((provider) => {
		const status = safeRuntimeCall(
			() => runtime.getProviderAuthStatus?.(provider),
			null,
		);
		const configured = Boolean(status?.configured);
		const source = status?.source ?? null;
		const label = status?.label ?? null;
		return {
			provider,
			configured,
			...(source !== null ? { source } : {}),
			...(label !== null ? { label } : {}),
		};
	});
	const error = safeRuntimeCall(() => runtime.getError?.(), null) || null;
	const snapshotProviders = [
		...new Set(
			snapshot
				.map((m) => m?.provider)
				.filter((p) => typeof p === "string" && p.length > 0),
		),
	];
	return {
		error,
		providers: authProviders,
		snapshotProviders,
		snapshotSize: snapshot.length,
		registrySize: registry.length,
	};
}

/***
 * MARK: modelAvailableKeys
 * @description Builds the set of key forms under which a snapshot model is
 *   "known available". The raw SDK snapshot carries no harness scope, so every
 *   snapshot entry is registered under its legacy provider-scoped key
 *   (`provider::id`) AND, when the entry already carries a harness-scoped
 *   `key`/`harness` (harness.listModels tags them), under the canonical
 *   `harness::provider::id` form too. Matching against BOTH grammars is what
 *   keeps `runnable` flags correct for harness-scoped public models
 *   (`pi::provider::id`) whose snapshot rows only know `provider::id`.
 * @example modelAvailableKeys([{ provider: 'ollama-cloud', id: 'm' }]) => Set(['ollama-cloud::m'])
 * @param {Array<Object>} snapshot - Availability snapshot models.
 * @returns {Set<string>} Every accepted key form for the snapshot entries.
 ***/
function modelAvailableKeys(snapshot) {
	const keys = new Set();
	for (const m of snapshot) {
		if (!m || typeof m !== "object") continue;
		if (m.provider != null && m.id != null) {
			keys.add(modelKey(m.provider, m.id));
			if (typeof m.harness === "string" && m.harness) {
				try {
					keys.add(harnessModelKey(m.harness, m.provider, m.id));
				} catch {
					// Malformed harness segment: the legacy form above still matches.
				}
			}
		}
		if (typeof m.key === "string" && m.key) keys.add(m.key);
	}
	return keys;
}

/***
 * MARK: withRunnableFlags
 * @description Enriches a public model list with credential-aware availability
 *   flags taken from a ModelRuntime's availability snapshot: a model is
 *   `runnable: true` iff its identity is present in the snapshot (the SDK only
 *   places providers with VALID credentials there). Matching accepts BOTH key
 *   grammars — the canonical harness-scoped `harness::provider::id` public keys
 *   produced by listPublicModels/toPublicModel and the legacy `provider::id`
 *   the raw snapshot carries — so harness-scoped models are never falsely
 *   flagged unrunnable. Each model also carries `authConfigured` /
 *   `authSource` / `authLabel` (per-provider auth state) and a human
 *   `statusLabel`. Non-destructive: returns shallow copies. When the runtime is
 *   absent (or cannot be read) the models are returned unchanged, so callers
 *   behave exactly as before this helper existed.
 * @example withRunnableFlags(models, runtime) => [{ id, provider, key: 'pi::ollama-cloud::m', runnable: true, authConfigured: true, authSource: 'models_json_key', authLabel: 'models.json', statusLabel: 'Ready' }]
 * @param {Array<Object>} models - Public models (harness-scoped key optional).
 * @param {Object|null} runtime - The ModelRuntime (or a duck-typed fake in tests); may be null.
 * @returns {Array<Object>} Enriched copies of the models, or the input list when no runtime.
 ***/
export function withRunnableFlags(models, runtime) {
	if (!runtime || typeof runtime !== "object" || !Array.isArray(models)) {
		return models;
	}
	const snapshot =
		safeRuntimeCall(() => runtime.getAvailableSnapshot?.(), []) || [];
	const availableKeys = modelAvailableKeys(snapshot);
	return models.map((m) => {
		if (!m || typeof m !== "object") return m;
		const candidates = [];
		if (typeof m.key === "string" && m.key) candidates.push(m.key);
		if (m.provider != null && m.id != null)
			candidates.push(modelKey(m.provider, m.id));
		const runnable = candidates.some((k) => availableKeys.has(k));
		const provider = m.provider;
		const status =
			provider != null
				? safeRuntimeCall(() => runtime.getProviderAuthStatus?.(provider), null)
				: null;
		const authConfigured = status ? Boolean(status.configured) : null;
		const authSource = status?.source ?? null;
		const authLabel = status?.label ?? null;
		const statusLabel = runnable
			? "Ready"
			: authConfigured === false
				? "No credentials"
				: authConfigured === true
					? "Unavailable"
					: "Unknown";
		return {
			...m,
			runnable,
			authConfigured,
			authSource,
			authLabel,
			statusLabel,
		};
	});
}

/***
 * MARK: isModelRunnable
 * @description Whether a resolved model object is present in an availability
 *   snapshot — i.e. its provider has valid credentials per the SDK snapshot.
 *   Matching accepts both key grammars (harness-scoped public keys and the
 *   snapshot's raw provider::id rows), plus a bare-id fallback for legacy
 *   model shapes without a provider. Used by the stage-dispatch guard to warn
 *   before running on an uncredentialed model.
 * @example isModelRunnable(session.listModels(), targetModel) => true
 * @param {Array<Object>} available - The availability snapshot.
 * @param {Object|null} model - The resolved model.
 * @returns {boolean}
 ***/
export function isModelRunnable(available, model) {
	if (
		!model ||
		typeof model !== "object" ||
		!Array.isArray(available) ||
		available.length === 0
	) {
		return false;
	}
	// Candidate identity forms of the target model, most specific first.
	const targets = new Set();
	if (typeof model.key === "string" && model.key) targets.add(model.key);
	if (model.provider != null && model.id != null) {
		targets.add(modelKey(model.provider, model.id));
		if (typeof model.harness === "string" && model.harness) {
			try {
				targets.add(harnessModelKey(model.harness, model.provider, model.id));
			} catch {
				// Malformed harness segment: the legacy form above still matches.
			}
		}
	}
	for (const m of available) {
		if (model.provider == null) {
			// Legacy model shape without a provider: fall back to a bare-id match.
			if (m.id === model.id) return true;
			continue;
		}
		const forms = new Set();
		if (typeof m.key === "string" && m.key) forms.add(m.key);
		if (m.provider != null && m.id != null) {
			forms.add(modelKey(m.provider, m.id));
			if (typeof m.harness === "string" && m.harness) {
				try {
					forms.add(harnessModelKey(m.harness, m.provider, m.id));
				} catch {
					// Malformed harness segment: the legacy form above still matches.
				}
			}
		}
		for (const t of targets) {
			if (forms.has(t)) return true;
		}
	}
	return false;
}

/***
 * MARK: describeProviderAuthStatus
 * @description Human-readable one-liner about a provider's credential state,
 *   read duck-typed from the runtime (never throws, never hits the network).
 *   Used in dispatch warnings so operators see WHY a model is not runnable.
 * @example describeProviderAuthStatus(runtime, 'google') => "auth not configured"
 * @param {Object|null} runtime - The ModelRuntime (or duck-typed fake).
 * @param {string|undefined} provider - The provider id.
 * @returns {string} The parenthesized detail ('' when nothing is known).
 ***/
export function describeProviderAuthStatus(runtime, provider) {
	if (!runtime || typeof runtime !== "object" || !provider) return "";
	const status = safeRuntimeCall(
		() => runtime.getProviderAuthStatus?.(provider),
		null,
	);
	if (!status) return "";
	if (status.configured) {
		return ` (auth configured via ${status.source || "unknown source"} but not currently available)`;
	}
	return " (auth not configured)";
}
