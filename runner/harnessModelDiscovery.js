/***
 * MARK: harnessModelDiscovery
 * @description Runner-side model auto-detect: one discovery leg per
 *   supported harness (`pi`, `muse`, `antigravity`, `vibe`, `opencode`,
 *   `codex`), each reusing its backend harness's own `listModels()` so
 *   "ready to use right now" means the same thing on both sides of the
 *   wire. Every leg runs best-effort behind a watchdog, caches its ids in
 *   a per-harness slice, and keeps the previous slice on failure — a
 *   failed scan warns, never breaks heartbeats, and never serves ids the
 *   leg cannot back. The daemon drives one round per boot, per
 *   `modelDiscoveryIntervalMs` tick, and per Re-detect command.
 * @example await runDiscoveryRound({ harnessIds: ['pi', 'muse'] }) => { combinedIds: ['pi::mistral::x'], resultsByHarness: { pi: {...}, muse: {...} } }
 ***/
import { harnessModelKey, parseModelKey } from "../shared/modelKeys.js";
import { DISCOVERY_ENV_VARS, resolveBinary } from "../api/agent/harnessDiscovery.js";
import { discoverClaudeModels as discoverMuseModelsRaw } from "./modelDiscovery.js";

/***
 * MARK: DISCOVER_LEG_TIMEOUT_DEFAULT_MS
 * @description Default per-leg watchdog (ms): a leg that hangs past this
 *   resolves to its previous slice with a timeout error instead of
 *   stalling the round. Legs that spawn children (agy, vibe, muse) also
 *   hand the same budget to their own child watchdog so no orphaned CLI
 *   outlives the round.
 * @example DISCOVER_LEG_TIMEOUT_DEFAULT_MS => 20000
 ***/
export const DISCOVER_LEG_TIMEOUT_DEFAULT_MS = 20000;

/***
 * MARK: discoveryCache
 * @description Per-harness discovery slices, the single place a round
 *   reads and writes: `{ [harnessId]: { ids, atMs, error } }`. A slice
 *   keeps its previous `ids` whenever a later round fails or empties
 *   (survey q5), so heartbeats always advertise the last good list. Read
 *   it through `getDiscoveryStatus()` / `summarizeDiscoverySlices()`;
 *   reset it in tests with `clearDiscoveryCache()`.
 * @example discoveryCache.pi => { ids: ['pi::mistral::x'], atMs: 123, error: null }
 ***/
export const discoveryCache = {};

/***
 * MARK: dedupeStrings
 * @description Trims a raw leg result into a deduped id list, dropping
 *   blanks and non-strings. Legs disagree on hygiene (some pass SDK rows
 *   straight through), so every leg result funnels through here before
 *   grammar validation.
 * @example dedupeStrings([' a ', 'a', 42, '']) => ['a']
 * @param {Array} [list] - Raw leg result (any mix of values).
 * @returns {string[]} Clean unique ids.
 ***/
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

/***
 * MARK: checkFleetIdForHarness
 * @description Whether one id is servable fleet grammar for a harness:
 *   a canonical `harness::provider::id` (or `::reasoning`) key whose
 *   harness segment matches. Anything else (legacy 2-part keys, bare
 *   ids, other-harness keys, malformed text) is never advertised —
 *   dispatch matches fleet picks verbatim, so an ungrammatical id would
 *   match nothing and only mislead the picker.
 * @example checkFleetIdForHarness('pi::mistral::x', 'pi') => true
 * @example checkFleetIdForHarness('muse::meta::x', 'pi') => false
 * @param {string} fleetId - Candidate id from a leg.
 * @param {string} expectedHarness - Harness the leg scanned for.
 * @returns {boolean} True when the id may be advertised for the harness.
 ***/
function checkFleetIdForHarness(fleetId, expectedHarness) {
	if (typeof fleetId !== "string" || !fleetId.trim()) return false;
	const parsed = parseModelKey(fleetId.trim());
	if (!parsed || (parsed.form !== "harness" && parsed.form !== "harnessReasoning")) return false;
	if (expectedHarness && parsed.harness !== expectedHarness) return false;
	return true;
}

/***
 * MARK: resolveLegTimeoutMs
 * @description Settles the watchdog budget for one leg run: a finite
 *   positive override wins, anything else (missing, zero, negative,
 *   NaN) falls back to the default. A non-positive budget would time
 *   out a healthy leg on arrival, so it reads as "no override" rather
 *   than "no time".
 * @example resolveLegTimeoutMs(50) => 50
 * @example resolveLegTimeoutMs(0) => 20000
 * @param {unknown} rawTimeoutMs - Requested budget (ms).
 * @returns {number} Effective budget (ms).
 ***/
function resolveLegTimeoutMs(rawTimeoutMs) {
	return Number.isFinite(rawTimeoutMs) && rawTimeoutMs > 0
		? rawTimeoutMs
		: DISCOVER_LEG_TIMEOUT_DEFAULT_MS;
}

/***
 * MARK: awaitWithTimeout
 * @description Awaits one leg promise behind a watchdog: the first of
 *   the leg result and a timeout rejection wins, and the timer is always
 *   cleared and unref'd so a hung leg can neither stall the round nor
 *   pin the event loop. A late leg result after the timeout is ignored.
 * @example await awaitWithTimeout(Promise.resolve(['a']), 50) => ['a']
 * @param {Promise} promise - In-flight leg work.
 * @param {number} timeoutMs - Watchdog budget (ms).
 * @returns {Promise} The leg result, or a timeout rejection.
 ***/
function awaitWithTimeout(promise, timeoutMs) {
	let timer = null;
	const timeoutPromise = new Promise((_, reject) => {
		timer = setTimeout(() => reject(new Error(`discovery timed out after ${timeoutMs}ms`)), timeoutMs);
		if (typeof timer.unref === "function") timer.unref();
	});
	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

/***
 * MARK: classifyLegError
 * @description Sorts one leg failure into the status slot's stable
 *   `{code,message,hint}` shape. Classified errors thrown by legs (the
 *   agy/vibe catalogues' retained discovery failures, the honest-empty
 *   legs' reasons) pass through untouched so the slot names the real
 *   cause; anything else becomes `<HARNESS>_DISCOVERY_FAILED` with the
 *   raw message attached. All strings are length-capped so one chatty
 *   CLI cannot bloat every heartbeat.
 * @example classifyLegError(Object.assign(new Error('no agy'), { code: 'AGY_BIN_MISSING', hint: 'install' }), 'antigravity') => { code: 'AGY_BIN_MISSING', message: 'no agy', hint: 'install' }
 * @param {unknown} error - Whatever the leg threw.
 * @param {string} harnessId - Harness the leg scanned for.
 * @returns {{code: string, message: string, hint: string}} Status-slot error.
 ***/
function classifyLegError(error, harnessId) {
	if (error && typeof error === "object" && typeof error.code === "string" && error.code.trim()) {
		return {
			code: error.code.trim().slice(0, 120),
			message: String(error.message || error.code).slice(0, 500),
			hint: typeof error.hint === "string" ? error.hint.slice(0, 500) : "",
		};
	}
	const detail = String(error?.message || error || "unknown error");
	return {
		code: `${String(harnessId || "harness").toUpperCase()}_DISCOVERY_FAILED`,
		message: detail.slice(0, 500),
		hint: `Re-run model re-detection after fixing the ${harnessId} setup.`,
	};
}

/***
 * MARK: throwLegError
 * @description Throws a classified leg error: the honest-empty legs and
 *   the retained catalogue failures raise through here so `runDiscoveryLeg`
 *   catches a coded reason into the status slot instead of a bare Error.
 * @example throwLegError('CODEX_DISCOVERY_UNAVAILABLE', 'no live transport', 'wait for the transport')
 * @param {string} code - Stable status-slot code.
 * @param {string} message - Human-readable cause.
 * @param {string} [hint] - Operator fix, shown in Settings.
 ***/
function throwLegError(code, message, hint = "") {
	const err = new Error(message);
	err.code = code;
	err.hint = hint;
	throw err;
}

/***
 * MARK: runDiscoveryLeg
 * @description Runs one harness leg behind the watchdog and maintains
 *   its cache slice. Success with usable ids replaces the slice;
 *   failure, timeout, an unusable leg result, or an empty round keeps
 *   the previous ids (survey q5: the old list stays until a better one
 *   arrives) and records the error. Never throws — every failure lands
 *   in the returned `{harnessId, ids, error}` and the slice, so one bad
 *   harness cannot fail the round.
 * @example await runDiscoveryLeg('pi', {}) => { harnessId: 'pi', ids: ['pi::mistral::x'], error: null }
 * @param {string} harnessId - Harness to scan (a `DISCOVERY_LEGS` key).
 * @param {Object} [ctx] - Leg seams (`timeoutMs`, harness/catalog overrides for tests).
 * @returns {Promise<{harnessId: string, ids: string[], error: Object|null}>} Slice outcome.
 ***/
export async function runDiscoveryLeg(harnessId, ctx = {}) {
	const leg = DISCOVERY_LEGS[harnessId];
	const previous = discoveryCache[harnessId];
	const previousIds = Array.isArray(previous?.ids) ? [...previous.ids] : [];
	const timeoutMs = resolveLegTimeoutMs(ctx?.timeoutMs);

	if (typeof leg !== "function") {
		const error = { code: "NO_DISCOVERY_LEG", message: `No discovery leg for ${harnessId}`, hint: "" };
		discoveryCache[harnessId] = { ids: previousIds, atMs: Date.now(), error };
		return { harnessId, ids: [...previousIds], error };
	}

	try {
		const raw = await awaitWithTimeout(leg(ctx), timeoutMs);
		if (!Array.isArray(raw)) {
			// A leg that resolves a non-list is broken (honest legs return
			// `[]` when there is nothing to serve): keep the old slice and
			// say so, instead of silently reading garbage as an empty menu.
			const error = {
				code: `${String(harnessId).toUpperCase()}_MODELS_UNPARSEABLE`,
				message: "Discovery returned an unusable result (expected a model id list).",
				hint: "",
			};
			discoveryCache[harnessId] = { ids: previousIds, atMs: Date.now(), error };
			return { harnessId, ids: [...previousIds], error };
		}
		const incoming = dedupeStrings(raw);
		// Keep only ids valid for this harness grammar.
		const valid = incoming.filter((id) => checkFleetIdForHarness(id, harnessId));
		if (valid.length > 0) {
			discoveryCache[harnessId] = { ids: valid, atMs: Date.now(), error: null };
			return { harnessId, ids: [...valid], error: null };
		}
		// Nothing usable: keep the previous slice. A round where every id
		// failed validation names that; a silently empty round (no login,
		// exec-only host) keeps whatever error the slice already had.
		const error = incoming.length > 0
			? {
				code: `${String(harnessId).toUpperCase()}_MODELS_UNPARSEABLE`,
				message: "Discovery yielded no usable model ids.",
				hint: "",
			}
			: (previous?.error || null);
		discoveryCache[harnessId] = { ids: previousIds, atMs: Date.now(), error };
		return { harnessId, ids: [...previousIds], error };
	} catch (err) {
		const error = classifyLegError(err, harnessId);
		discoveryCache[harnessId] = { ids: previousIds, atMs: Date.now(), error };
		return { harnessId, ids: [...previousIds], error };
	}
}

/***
 * MARK: runDiscoveryRound
 * @description Runs the discovery legs for one harness list (a boot
 *   seed, a cadence tick, or a Re-detect command) and combines the ids.
 *   Legs run in list order, each independently watchdogged; harness ids
 *   without a leg (`mock`, `custom`, unknown) are skipped, and blank
 *   entries are dropped. Returns a plain object — the per-harness
 *   slices stay readable via `getDiscoveryStatus()`.
 * @example await runDiscoveryRound({ harnessIds: ['pi'] }) => { combinedIds: ['pi::mistral::x'], resultsByHarness: { pi: { harnessId: 'pi', ids: [...], error: null } } }
 * @param {Object} [opts] - Labelled inputs.
 * @param {string[]} [opts.harnessIds] - Harness ids to scan, in order.
 * @param {number} [opts.timeoutMs] - Per-leg watchdog budget (ms).
 * @param {Object} [opts.legOptions] - Seams forwarded to every leg (each leg gets a fresh copy).
 * @returns {Promise<{combinedIds: string[], resultsByHarness: Object}>} Combined ids plus per-leg outcomes.
 ***/
export async function runDiscoveryRound({ harnessIds = [], timeoutMs, legOptions = {} } = {}) {
	const effectiveTimeoutMs = resolveLegTimeoutMs(timeoutMs);
	const combinedIds = [];
	const resultsByHarness = {};
	for (const id of Array.isArray(harnessIds) ? harnessIds : []) {
		const clean = String(id ?? "").trim();
		if (!clean) continue;
		if (!Object.prototype.hasOwnProperty.call(DISCOVERY_LEGS, clean)) continue;
		const legResult = await runDiscoveryLeg(clean, { ...legOptions, timeoutMs: effectiveTimeoutMs });
		resultsByHarness[clean] = legResult;
		for (const modelId of legResult.ids) {
			if (!combinedIds.includes(modelId)) combinedIds.push(modelId);
		}
	}
	return { combinedIds, resultsByHarness };
}

/***
 * MARK: getDiscoveryStatus
 * @description Reads the per-harness discovery status for heartbeat
 *   facts: `{ [harnessId]: { ok, count, atMs, error? } }`. Pass the
 *   configured harness ids to filter out stale slices from harnesses no
 *   longer configured (read-time filter, so concurrent rounds cannot
 *   race a prune); omit it to read every slice (tests, debugging).
 * @example getDiscoveryStatus(['pi']) => { pi: { ok: true, count: 1, atMs: 123 } }
 * @param {string[]} [onlyHarnessIds] - Harness ids to include (all when omitted).
 * @returns {Object} Status by harness id.
 ***/
export function getDiscoveryStatus(onlyHarnessIds) {
	const wanted = Array.isArray(onlyHarnessIds)
		? new Set(onlyHarnessIds.map((id) => String(id ?? "").trim()).filter(Boolean))
		: null;
	const out = {};
	for (const [id, slice] of Object.entries(discoveryCache)) {
		if (wanted && !wanted.has(id)) continue;
		out[id] = {
			ok: slice?.error == null,
			count: Array.isArray(slice?.ids) ? slice.ids.length : 0,
			atMs: slice?.atMs ?? null,
			...(slice?.error ? { error: slice.error } : {}),
		};
	}
	return out;
}

/***
 * MARK: summarizeDiscoverySlices
 * @description Summarizes the current slices for one harness list into
 *   the log/ack shape: stable per-harness counts plus the first leg
 *   error in list order. Harness ids without a leg are skipped (they
 *   never scan), and ids never scanned read as `0` rather than vanishing
 *   from the line.
 * @example summarizeDiscoverySlices(['pi', 'muse']) => { countsText: 'pi:1, muse:0', firstError: null }
 * @param {string[]} [harnessIds] - Configured harness ids, in order.
 * @returns {{countsText: string, firstError: Object|null}} Counts line plus first leg error.
 ***/
export function summarizeDiscoverySlices(harnessIds = []) {
	const legged = (Array.isArray(harnessIds) ? harnessIds : [])
		.map((id) => String(id ?? "").trim())
		.filter((id) => id && Object.prototype.hasOwnProperty.call(DISCOVERY_LEGS, id));
	const countsText = legged
		.map((id) => `${id}:${discoveryCache[id]?.ids?.length ?? 0}`)
		.join(", ");
	const firstError = legged
		.map((id) => discoveryCache[id]?.error)
		.find((error) => error && error.code) || null;
	return { countsText, firstError };
}

/***
 * MARK: clearDiscoveryCache
 * @description Drops every discovery slice (test seam): the next round
 *   scans cold with no keep-old fallback.
 * @example clearDiscoveryCache()
 ***/
export function clearDiscoveryCache() {
	for (const key of Object.keys(discoveryCache)) delete discoveryCache[key];
}

/***
 * MARK: provenanceForIds
 * @description Attributes advertised ids to the discovery slice that
 *   produced them: `{ [id]: { harness, atMs } }` — which harness leg
 *   detected the id, and when. Reads the live slices (first harness
 *   claiming the id wins); ids no slice holds (pins, allowlist rows)
 *   carry no entry — the heartbeat's `modelSource` already says why.
 *   Advisory display data for the central catalogue, never dispatch input.
 * @example provenanceForIds(['pi::mistral::x']) => { 'pi::mistral::x': { harness: 'pi', atMs: 123 } }
 * @param {string[]} [ids] - Advertised model ids.
 * @returns {Object} Provenance by id (possibly empty).
 ***/
export function provenanceForIds(ids) {
	const out = {};
	for (const id of Array.isArray(ids) ? ids : []) {
		if (typeof id !== "string" || !id || Object.hasOwn(out, id)) continue;
		for (const [harness, slice] of Object.entries(discoveryCache)) {
			if (Array.isArray(slice?.ids) && slice.ids.includes(id)) {
				out[id] = { harness, atMs: slice?.atMs ?? null };
				break;
			}
		}
	}
	return out;
}

// --- Individual legs ------------------------------------------------------

/***
 * MARK: loadPiHarness
 * @description Loads the pi harness for discovery: the injected test
 *   double when `ctx.createHarness` is set, else the bundled backend pi
 *   harness builder (lazy import — the Runner bundle ships `api/` next
 *   to `runner/`). Imports the builder directly rather than through the
 *   daemon's loader so discovery never cycles back into `daemon.js`.
 * @example const harness = await loadPiHarness({})
 * @param {Object} [ctx] - Leg seams (`createHarness` test double).
 * @returns {Promise<Object>} Harness with `listModels`.
 ***/
async function loadPiHarness(ctx) {
	if (ctx && typeof ctx.createHarness === "function") return ctx.createHarness();
	const { createPiHarness } = await import("../api/agent/harnesses/pi/piHarness.js");
	return createPiHarness({});
}

/***
 * MARK: describePiEmptyCatalogue
 * @description Explains one empty pi catalogue for the status slot: the
 *   offline auth summary (when the harness offers `modelAuthStatus`)
 *   distinguishes "no provider login" from "logged in but nothing
 *   yielded" from a failed availability refresh, so the operator sees
 *   the fix instead of a bare zero. Never throws — an unreadable
 *   summary degrades to the generic wording.
 * @example describePiEmptyCatalogue({ error: null, providers: [] }).message => 'Pi reported no models ready to use (no provider login found).'
 * @param {Object|null} [authSummary] - `modelAuthStatus()` result (or null when unknown).
 * @returns {{code: string, message: string, hint: string}} Classified empty-catalogue failure.
 ***/
function describePiEmptyCatalogue(authSummary) {
	const providers = Array.isArray(authSummary?.providers) ? authSummary.providers : null;
	const configuredCount = providers ? providers.filter((entry) => entry && entry.configured).length : null;
	const refreshError = typeof authSummary?.error === "string" && authSummary.error.trim()
		? authSummary.error.trim().slice(-200)
		: "";
	let message = "Pi reported no models ready to use.";
	if (configuredCount === 0) {
		message = "Pi reported no models ready to use (no provider login found).";
	} else if (typeof configuredCount === "number" && configuredCount > 0) {
		message = `Pi reported no models ready to use (${configuredCount} provider(s) logged in, but none yielded models).`;
	}
	if (refreshError) message += ` Availability refresh failed: ${refreshError}.`;
	return {
		code: "PI_MODELS_EMPTY",
		message,
		hint: "Log in to a provider in pi (its ~/.pi/agent auth), then re-run model re-detection.",
	};
}

/***
 * MARK: discoverPiModels
 * @description Lists the pi models ready to use right now via the pi
 *   SDK availability snapshot (only providers with valid credentials
 *   appear — survey q2): no CLI, no keys read, ids already canonical
 *   `pi::…` keys. An empty catalogue throws `PI_MODELS_EMPTY` (with the
 *   login state in the message when the harness can report it) instead
 *   of resolving a silent `[]` — a bare zero with `ok: true` reads as
 *   healthy, while the truth is "nothing logged in", which the
 *   operator must see as a warning.
 * @example await discoverPiModels({}) => ['pi::mistral::codestral-2508']
 * @example await discoverPiModels({}) // throws PI_MODELS_EMPTY when no provider is logged in
 * @param {Object} [ctx] - Leg seams (`createHarness` test double).
 * @returns {Promise<string[]>} Canonical pi model ids (never silently empty).
 ***/
export async function discoverPiModels(ctx = {}) {
	const harness = await loadPiHarness(ctx);
	const models = await harness.listModels({ refresh: true });
	const ids = dedupeStrings((models || []).map((m) => (typeof m === "string" ? m : m?.key)));
	if (ids.length > 0) return ids;
	let authSummary = null;
	if (harness && typeof harness.modelAuthStatus === "function") {
		try {
			authSummary = await harness.modelAuthStatus();
		} catch {
			authSummary = null;
		}
	}
	const empty = describePiEmptyCatalogue(authSummary);
	throwLegError(empty.code, empty.message, empty.hint);
}

/***
 * MARK: loadAgyCatalog
 * @description Loads the antigravity model catalogue for discovery: the
 *   injected test double when `ctx.createCatalog` is set, else the
 *   bundled backend catalogue. Hands the leg's watchdog budget to the
 *   catalogue's own spawn watchdog so a hung `agy models` child dies
 *   with the leg instead of lingering past it.
 * @example const catalog = await loadAgyCatalog({})
 * @param {Object} [ctx] - Leg seams (`createCatalog`, `spawnAgyModels`, `agyBin`, `log`, `timeoutMs`).
 * @returns {Promise<Object>} Catalogue with `listAgyModels`.
 ***/
async function loadAgyCatalog(ctx) {
	if (ctx && typeof ctx.createCatalog === "function") return ctx.createCatalog();
	const { createAgyModelCatalog } = await import("../api/agent/harnesses/antigravity/agyModelCatalog.js");
	return createAgyModelCatalog({
		spawnAgyModels: ctx?.spawnAgyModels,
		agyBin: ctx?.agyBin,
		spawnTimeoutMs: Number.isFinite(ctx?.timeoutMs) && ctx.timeoutMs > 0 ? ctx.timeoutMs : undefined,
		log: ctx?.log,
	});
}

/***
 * MARK: discoverAntigravityModels
 * @description Lists the antigravity models ready right now by spawning
 *   `agy models` and parsing the output (fresh probe: the catalogue
 *   cache is cleared first). An empty catalogue with a retained
 *   classified failure (missing CLI, missing login) raises that reason
 *   into the status slot instead of serving a silent empty list.
 * @example await discoverAntigravityModels({}) => ['antigravity::google::gemini-3-pro']
 * @param {Object} [ctx] - Leg seams (see `loadAgyCatalog`).
 * @returns {Promise<string[]>} Canonical antigravity model ids (possibly empty).
 ***/
export async function discoverAntigravityModels(ctx = {}) {
	const catalog = await loadAgyCatalog(ctx);
	if (typeof catalog.clearCache === "function") catalog.clearCache();
	const models = typeof catalog.listAgyModels === "function"
		? await catalog.listAgyModels()
		: (typeof catalog.listModels === "function" ? await catalog.listModels() : []);
	const ids = dedupeStrings((models || []).map((m) => (typeof m === "string" ? m : m?.key)));
	if (ids.length === 0) {
		const retained = typeof catalog.lastDiscoveryError === "function" ? catalog.lastDiscoveryError() : null;
		if (retained && typeof retained.code === "string" && retained.code) {
			throwLegError(retained.code, String(retained.message || retained.code), typeof retained.hint === "string" ? retained.hint : "");
		}
	}
	return ids;
}

/***
 * MARK: loadVibeCatalog
 * @description Loads the vibe model catalogue for discovery: the
 *   injected test double when `ctx.createCatalog` is set, else the
 *   bundled backend catalogue. Hands the leg's watchdog budget to the
 *   catalogue's handshake watchdog (whose default is longer than the
 *   leg budget) so the ACP child dies with the leg.
 * @example const catalog = await loadVibeCatalog({})
 * @param {Object} [ctx] - Leg seams (`createCatalog`, `endpoint`, `discoverModels`, `tempDir`, `log`, `timeoutMs`).
 * @returns {Promise<Object>} Catalogue with `listModels`.
 ***/
async function loadVibeCatalog(ctx) {
	if (ctx && typeof ctx.createCatalog === "function") return ctx.createCatalog();
	const { createVibeModelCatalog } = await import("../api/agent/harnesses/vibe/vibeModelCatalog.js");
	return createVibeModelCatalog({
		endpoint: ctx?.endpoint,
		discoverModels: ctx?.discoverModels,
		tempDir: ctx?.tempDir,
		log: ctx?.log,
		startTimeoutMs: Number.isFinite(ctx?.timeoutMs) && ctx.timeoutMs > 0 ? ctx.timeoutMs : undefined,
	});
}

/***
 * MARK: discoverVibeModels
 * @description Lists the vibe models ready right now via one
 *   handshake-only ACP probe (no prompt, no cost; the catalogue cache is
 *   cleared first). Exec-only hosts and missing agents yield nothing —
 *   the catalogue's retained classified failure raises into the status
 *   slot so the empty list is explained, never silent.
 * @example await discoverVibeModels({}) => ['vibe::mistral::large']
 * @param {Object} [ctx] - Leg seams (see `loadVibeCatalog`).
 * @returns {Promise<string[]>} Canonical vibe model ids (possibly empty).
 ***/
export async function discoverVibeModels(ctx = {}) {
	const catalog = await loadVibeCatalog(ctx);
	if (typeof catalog.clearCache === "function") catalog.clearCache();
	const models = typeof catalog.listModels === "function" ? await catalog.listModels() : [];
	const ids = dedupeStrings((models || []).map((m) => (typeof m === "string" ? m : m?.key)));
	if (ids.length === 0) {
		const retained = typeof catalog.lastDiscoveryError === "function" ? catalog.lastDiscoveryError() : null;
		if (retained && typeof retained.code === "string" && retained.code) {
			throwLegError(retained.code, String(retained.message || retained.code), typeof retained.hint === "string" ? retained.hint : "");
		}
	}
	return ids;
}

/***
 * MARK: resolveMuseProbeBinary
 * @description Resolves the `muse` binary the leg will spawn through the
 *   backend's own resolver (explicit `ctx.bin` wins, then the
 *   `KAINBAIN_MUSE_BIN` override, then the bare `muse` name across PATH
 *   plus the standard install dirs). Resolving here — instead of
 *   spawning the bare name — is what keeps the leg consistent with
 *   harness auto-detect: a CLI that lives only in `~/.local/bin` (never
 *   on a systemd unit's minimal PATH) is detected AND probed, never
 *   detected-then-missed. Throws `MUSE_MSP_BIN_MISSING` when nothing
 *   resolves, so the status slot names the install fix.
 * @example resolveMuseProbeBinary({ bin: '/opt/muse' }) => '/opt/muse'
 * @param {Object} [ctx] - Leg seams (`bin`, `env`, `platform`).
 * @returns {string} Absolute spawn path, or the bare name when it resolves on PATH.
 ***/
function resolveMuseProbeBinary(ctx = {}) {
	const envMap = ctx?.env ?? process.env;
	const platformValue = ctx?.platform ?? process.platform;
	const configured = typeof ctx?.bin === "string" && ctx.bin.trim()
		? ctx.bin.trim()
		: (typeof envMap?.[DISCOVERY_ENV_VARS.muse] === "string" && envMap[DISCOVERY_ENV_VARS.muse].trim()
			? envMap[DISCOVERY_ENV_VARS.muse].trim()
			: "muse");
	const resolved = resolveBinary("muse", {
		...(configured === "muse" ? {} : { envOverride: configured }),
		env: envMap,
		platform: platformValue,
	});
	if (!resolved.found) {
		throwLegError(
			"MUSE_MSP_BIN_MISSING",
			`The muse CLI was not found ('${configured}' is not runnable).`,
			"Install the Muse CLI and ensure it is on PATH or in ~/.local/bin, or set KAINBAIN_MUSE_BIN to its absolute path.",
		);
	}
	return resolved.path;
}

/***
 * MARK: discoverMuseModels
 * @description Lists the models the installed `muse` CLI can serve via
 *   `muse serve` stdio `model/list` (box-local login, only ids come
 *   back). The probe runs strict: a missing binary throws
 *   `MUSE_MSP_BIN_MISSING`, a failed round-trip throws the classified
 *   spawn failure, and a CLI that answers with zero rows throws
 *   `MUSE_MSP_MODELS_EMPTY` (the backend catalogue's own wording) —
 *   a bare zero with `ok: true` used to read as healthy while hiding
 *   "the CLI works but the catalogue is empty". `ctx.discoverFn`
 *   overrides the probe (called with the leg ctx; a no-arg override
 *   works too) and `ctx.spawnSyncFn` seams the spawn — when the spawn
 *   is stubbed the binary pre-check is skipped so tests never touch
 *   the real host. The spawn matches the backend MSP probe — `--provider`
 *   (default `meta`, `ctx.provider` overrides) plus the standard handshake —
 *   so the leg and the backend catalogue read the same host the same way.
 *   The daemon's test seam rides through here so even
 *   overridden ids pass grammar validation before advertisement.
 * @example await discoverMuseModels({}) => ['muse::meta::muse-spark-1.3']
 * @example await discoverMuseModels({}) // throws MUSE_MSP_MODELS_EMPTY when the CLI answers with zero rows
 * @param {Object} [ctx] - Leg seams (`discoverFn`, `bin`, `env`, `platform`, `timeoutMs`, `spawnSyncFn`, `provider`, `args`).
 * @returns {Promise<string[]>} Canonical muse model ids (never silently empty).
 ***/
export async function discoverMuseModels(ctx = {}) {
	if (ctx && typeof ctx.discoverFn === "function") {
		const raw = await ctx.discoverFn(ctx);
		return dedupeStrings(Array.isArray(raw) ? raw : []);
	}
	const spawnStubbed = typeof ctx?.spawnSyncFn === "function";
	const opts = { strict: true };
	if (spawnStubbed) {
		if (ctx?.bin) opts.bin = ctx.bin;
		opts.spawnSyncFn = ctx.spawnSyncFn;
	} else {
		opts.bin = resolveMuseProbeBinary(ctx);
	}
	// Probe parity with the backend MSP catalogue: the host is told its
	// provider explicitly (`--provider`, default meta) instead of relying
	// on the CLI's implicit default, so the leg and the backend read the
	// same host the same way.
	if (typeof ctx?.provider === "string" && ctx.provider.trim()) opts.provider = ctx.provider.trim();
	if (Array.isArray(ctx?.args)) opts.args = ctx.args;
	if (Number.isFinite(ctx?.timeoutMs)) opts.timeoutMs = ctx.timeoutMs;
	const raw = await discoverMuseModelsRaw(opts);
	const ids = dedupeStrings(Array.isArray(raw) ? raw : []);
	if (ids.length === 0) {
		throwLegError(
			"MUSE_MSP_MODELS_EMPTY",
			"The muse serve host reported no models.",
			"Check the provider configuration (KAINBAIN_MUSE_MSP / muse serve --provider) and retry.",
		);
	}
	return ids;
}

/***
 * MARK: discoverOpencodeModels
 * @description Lists the opencode server's provider models, mapped from
 *   the server catalogue's legacy 2-part rows into harness-scoped
 *   `opencode::…` keys (malformed rows skipped, never served).
 *   Honest-empty when no server is configured: discovery only talks to
 *   an existing server (`OPENCODE_URL` / `OPENCODE_SERVER_URL`, plus
 *   `OPENCODE_SERVER_PASSWORD` when the server needs auth) and never
 *   spawns one per scan — the status slot carries
 *   `OPENCODE_NOT_CONFIGURED` with the fix.
 * @example await discoverOpencodeModels({ baseUrl: 'http://127.0.0.1:4096' }) => ['opencode::anthropic::claude-x']
 * @param {Object} [ctx] - Leg seams (`baseUrl`/`url`, `password`, `fetchModels`).
 * @returns {Promise<string[]>} Canonical opencode model ids (possibly empty).
 ***/
export async function discoverOpencodeModels(ctx = {}) {
	const configuredUrl = (ctx && (ctx.baseUrl || ctx.url)) || process.env.OPENCODE_URL || process.env.OPENCODE_SERVER_URL;
	const url = typeof configuredUrl === "string" ? configuredUrl.trim() : "";
	if (!url) {
		throwLegError(
			"OPENCODE_NOT_CONFIGURED",
			"No opencode server configured on this Runner host.",
			"Set OPENCODE_URL (and OPENCODE_SERVER_PASSWORD when the server needs auth), then re-run model re-detection.",
		);
	}
	const { OpencodeModelDiscovery } = await import("../api/agent/harnesses/opencode/OpencodeModelDiscovery.js");
	const discovery = new OpencodeModelDiscovery({
		baseUrl: url,
		password: (ctx && ctx.password) || process.env.OPENCODE_SERVER_PASSWORD || null,
		fetchModels: ctx?.fetchModels,
		cacheTtlMs: 0,
	});
	const models = await discovery.listModels({ refresh: true });
	const ids = [];
	for (const m of models || []) {
		if (typeof m === "string") {
			if (m.trim()) ids.push(m.trim());
			continue;
		}
		try {
			ids.push(harnessModelKey("opencode", m?.provider, m?.id));
		} catch {
			// Skip malformed rows.
		}
	}
	return dedupeStrings(ids);
}

/***
 * MARK: discoverCodexModels
 * @description Codex discovery leg: honestly empty. The live codex
 *   model-listing surface is UNVERIFIED (see `codexHarness.js`), so there
 *   is nothing truthful to serve — the status slot carries
 *   `CODEX_DISCOVERY_UNAVAILABLE` until the transport lands. Codex stays
 *   runnable by explicit model ref meanwhile.
 * @example await discoverCodexModels() // throws CODEX_DISCOVERY_UNAVAILABLE
 ***/
export async function discoverCodexModels() {
	throwLegError(
		"CODEX_DISCOVERY_UNAVAILABLE",
		"Codex model discovery is not available (live codex transport unverified).",
		"Codex stays runnable by explicit model ref; re-detection will pick it up once the live transport lands.",
	);
}

/***
 * MARK: DISCOVERY_LEGS
 * @description The discovery leg per harness id: `async (ctx) =>
 *   string[]`. `custom`/`mock` have no legs by design (`mock` is
 *   test-only, `custom` manages its own model). Every leg funnels
 *   through `runDiscoveryLeg`, which owns the watchdog, validation,
 *   caching, and keep-old behavior — legs only fetch.
 * @example Object.keys(DISCOVERY_LEGS) => ['pi', 'muse', 'antigravity', 'vibe', 'opencode', 'codex']
 ***/
export const DISCOVERY_LEGS = {
	pi: async (ctx) => discoverPiModels(ctx),
	muse: async (ctx) => discoverMuseModels(ctx),
	antigravity: async (ctx) => discoverAntigravityModels(ctx),
	vibe: async (ctx) => discoverVibeModels(ctx),
	opencode: async (ctx) => discoverOpencodeModels(ctx),
	codex: async () => discoverCodexModels(),
};
