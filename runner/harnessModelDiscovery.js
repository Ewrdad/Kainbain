import { spawnSync } from "node:child_process";
import { parseModelKey } from "../shared/modelKeys.js";
import { discoverClaudeModels as discoverMuseModelsRaw } from "./modelDiscovery.js";

/**
 * MARK: DISCOVER_LEG_TIMEOUT_DEFAULT_MS
 * @description Default per-leg watchdog (ms) when a leg hangs.
 ***/
export const DISCOVER_LEG_TIMEOUT_DEFAULT_MS = 20000;

/**
 * Per-harness cache slices: `{ [harnessId]: { ids: string[], atMs: number, error: {code,message,...}|null } }`.
 */
export const discoveryCache = {};

/** Helper: trim + dedupe case-sensitive strings. */
function dedupeStrings(list) {
	const out = [];
	const seen = new Set();
	for (const item of list || []) {
		if (typeof item !== "string") continue;
		const value = item.trim();
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
}

/** Validate one fleet id has the `harness::provider::id` shape (3 segments). */
function validFleetId(id, expectedHarness) {
	if (typeof id !== "string" || !id.trim()) return false;
	const parsed = parseModelKey(id.trim());
	if (!parsed || (parsed.form !== "harness" && parsed.form !== "harnessReasoning")) return false;
	if (expectedHarness && parsed.harness !== expectedHarness) return false;
	return true;
}

function nowMs() {
	return Date.now();
}

/**
 * Wraps a promise with a watchdog. Rejects with a timeout error if `timeoutMs` elapses.
 */
function withTimeout(promise, timeoutMs) {
	let timer = null;
	const timeoutPromise = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(`discovery timed out after ${timeoutMs}ms`)), timeoutMs);
		if (typeof timer.unref === "function") timer.unref();
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

/** Best-effort error classification for a generic leg. */
function classifyLegError(error, harnessId) {
	const detail = String(error?.message || error || "unknown error");
	return {
		code: `${String(harnessId || "harness").toUpperCase()}_DISCOVERY_FAILED`,
		message: detail.slice(0, 500),
		hint: `Re-run model re-detection after fixing the ${harnessId} setup.`,
	};
}

/**
 * Run one leg by id, honoring per-leg timeout and keep-old-on-failure.
 * Returns `{ harnessId, ids, error }`. Updates `discoveryCache`.
 */
export async function runDiscoveryLeg(harnessId, ctx = {}) {
	const leg = DISCOVERY_LEGS[harnessId];
	const previous = discoveryCache[harnessId];
	const previousIds = Array.isArray(previous?.ids) ? [...previous.ids] : [];
	const timeoutMs = Number.isFinite(ctx?.timeoutMs) ? ctx.timeoutMs : DISCOVER_LEG_TIMEOUT_DEFAULT_MS;

	if (typeof leg !== "function") {
		const error = { code: "NO_DISCOVERY_LEG", message: `No discovery leg for ${harnessId}`, hint: "" };
		if (previousIds.length) {
			discoveryCache[harnessId] = { ids: previousIds, atMs: nowMs(), error };
		} else {
			discoveryCache[harnessId] = { ids: [], atMs: nowMs(), error };
		}
		return { harnessId, ids: discoveryCache[harnessId].ids, error };
	}

	let legPromise;
	try {
		legPromise = leg(ctx);
		const raw = await withTimeout(legPromise, timeoutMs);
		const incoming = dedupeStrings(Array.isArray(raw) ? raw : []);
		// Keep only ids valid for this harness grammar.
		const valid = incoming.filter((id) => validFleetId(id, harnessId));
		let ids = valid;
		let error = null;
		if (valid.length === 0 && incoming.length > 0) {
			// Nothing survived validation; treat as a malformed outcome but
			// keep the previous cache slice.
			error = { code: `${harnessId.toUpperCase()}_MODELS_UNPARSEABLE`, message: "Discovery yielded no usable model ids.", hint: "" };
		}
		if (valid.length === 0) {
			// Keep-old behavior: if we already had ids, retain them.
			if (previousIds.length > 0) {
				ids = previousIds;
				if (!error) {
					error = previous?.error || null;
				}
			}
		} else {
			// Non-empty replaces.
		}
		if (valid.length > 0) {
			error = null;
		}
		discoveryCache[harnessId] = { ids, atMs: nowMs(), error };
		return { harnessId, ids: discoveryCache[harnessId].ids, error: discoveryCache[harnessId].error };
	} catch (err) {
		const error = classifyLegError(err, harnessId);
		const ids = previousIds.length > 0 ? previousIds : [];
		discoveryCache[harnessId] = { ids, atMs: nowMs(), error };
		return { harnessId, ids, error };
	}
}

/**
 * Discover models for a set of harness ids. Runs legs in sequence (each
 * leg is independently bounded). Returns the combined, deduped id list.
 * Per-harness results are available via `discoveryCache` / `getDiscoveryStatus`.
 */
export async function discoverModelsForHarnesses(ids, ctx = {}) {
	const list = Array.isArray(ids) ? ids : [];
	const combined = [];
	const result = {};
	for (const id of list) {
		const clean = String(id ?? "").trim();
		if (!clean) continue;
		const legResult = await runDiscoveryLeg(clean, { ...ctx });
		// discoverFn override? handled by caller via ctx.legs maybe.
		result[clean] = legResult;
		for (const mid of legResult.ids) {
			if (!combined.includes(mid)) combined.push(mid);
		}
	}
	// Attach convenience properties without breaking Array consumers.
	const arr = combined;
	arr.byHarness = result;
	arr.status = getDiscoveryStatus();
	return arr;
}

export function getDiscoveryStatus() {
	const out = {};
	for (const [id, slice] of Object.entries(discoveryCache)) {
		out[id] = {
			ok: slice?.error == null,
			count: Array.isArray(slice?.ids) ? slice.ids.length : 0,
			atMs: slice?.atMs ?? null,
			...(slice?.error ? { error: slice.error } : {}),
		};
	}
	return out;
}

export function clearDiscoveryCache() {
	for (const key of Object.keys(discoveryCache)) delete discoveryCache[key];
}

// --- Individual legs ------------------------------------------------------

async function withHarness(harnessId, ctx) {
	const factoryOpt =
		ctx && typeof ctx.createHarness === "function"
			? ctx.createHarness
			: null;
	if (factoryOpt) return factoryOpt();
	// Lazy import to avoid circular deps with daemon.js.
	const { defaultLoadHarness } = await import("./daemon.js");
	return defaultLoadHarness(harnessId);
}

export async function discoverPiModels(ctx = {}) {
	const harness = await withHarness("pi", ctx);
	const models = await harness.listModels({ refresh: true });
	return dedupeStrings((models || []).map((m) => (typeof m === "string" ? m : m?.key)));
}

async function defaultAgyCatalog(ctx) {
	const { createAgyModelCatalog } = await import("../api/agent/harnesses/antigravity/agyModelCatalog.js");
	return createAgyModelCatalog({ spawnAgyModels: ctx?.spawnAgyModels, agyBin: ctx?.agyBin, log: ctx?.log });
}

export async function discoverAntigravityModels(ctx = {}) {
	const catalog = ctx && typeof ctx.createCatalog === "function"
		? ctx.createCatalog()
		: await defaultAgyCatalog(ctx);
	if (typeof catalog.clearCache === "function") catalog.clearCache();
	const models = typeof catalog.listAgyModels === "function"
		? await catalog.listAgyModels()
		: (typeof catalog.listModels === "function" ? await catalog.listModels() : []);
	return dedupeStrings((models || []).map((m) => (typeof m === "string" ? m : m?.key)));
}

async function defaultVibeCatalog(ctx) {
	const { createVibeModelCatalog } = await import("../api/agent/harnesses/vibe/vibeModelCatalog.js");
	return createVibeModelCatalog({ endpoint: ctx?.endpoint, discoverModels: ctx?.discoverModels });
}

export async function discoverVibeModels(ctx = {}) {
	const catalog = ctx && typeof ctx.createCatalog === "function"
		? ctx.createCatalog()
		: await defaultVibeCatalog(ctx);
	if (typeof catalog.clearCache === "function") catalog.clearCache();
	const models = typeof catalog.listModels === "function" ? await catalog.listModels() : [];
	return dedupeStrings((models || []).map((m) => (typeof m === "string" ? m : m?.key)));
}

export async function discoverMuseModels(ctx = {}) {
	if (ctx && typeof ctx.discoverFn === "function") {
		const raw = await ctx.discoverFn(ctx);
		return dedupeStrings(Array.isArray(raw) ? raw : []);
	}
	const fn = ctx?.binOpts ? null : null;
	const opts = {};
	if (ctx?.bin) opts.bin = ctx.bin;
	if (Number.isFinite(ctx?.timeoutMs)) opts.timeoutMs = ctx.timeoutMs;
	if (typeof ctx?.spawnSyncFn === "function") opts.spawnSyncFn = ctx.spawnSyncFn;
	const raw = await discoverMuseModelsRaw(opts);
	return dedupeStrings(Array.isArray(raw) ? raw : []);
}

export async function discoverOpencodeModels(ctx = {}) {
	const url = (ctx && (ctx.baseUrl || ctx.url)) || process.env.OPENCODE_URL || process.env.OPENCODE_SERVER_URL;
	if (!url) return [];
	const { OpencodeModelDiscovery } = await import("../api/agent/harnesses/opencode/OpencodeModelDiscovery.js");
	const discovery = new OpencodeModelDiscovery({
		baseUrl: url,
		password: (ctx && ctx.password) || process.env.OPENCODE_SERVER_PASSWORD || null,
		fetchModels: ctx?.fetchModels,
		cacheTtlMs: 0,
	});
	const models = await discovery.listModels({ refresh: true });
	return dedupeStrings((models || []).map((m) => {
		if (typeof m === "string") return m;
		const provider = m?.provider;
		const id = m?.id;
		if (provider && id) return `opencode::${provider}::${id}`;
		return m?.key;
	}));
}

export async function discoverCodexModels(_ctx = {}) {
	return [];
}

// --- default legs ----------------------------------------------------------

export const DISCOVERY_LEGS = {
	pi: async (ctx) => discoverPiModels(ctx),
	muse: async (ctx) => discoverMuseModels(ctx),
	antigravity: async (ctx) => discoverAntigravityModels(ctx),
	vibe: async (ctx) => discoverVibeModels(ctx),
	opencode: async (ctx) => discoverOpencodeModels(ctx),
	codex: async (ctx) => discoverCodexModels(ctx),
};

// Allow property access alias used by some tests.
export const DISCOVERY_LEGS_BY_ID = DISCOVERY_LEGS;
