import { parseModelKey } from "../../../shared/modelKeys.js";

/***
 * MARK: runnerModelConfirmation
 * @description Confirms one runner-advertised model id against that runner's
 *   own discovery signals: the per-id `modelProvenance` (which scan listed
 *   the id) and the per-harness `discoveryStatus` (which scans succeeded).
 *   A harness-scoped pin the runner's own successful scan contradicts is
 *   `stale` — the catalogue marks it unavailable with a reason instead of
 *   serving it as available, and dispatch refuses it like an unoffered
 *   model ("runners muse code doesn't have" is a stale pin, not a
 *   capability). `confirmed` additionally requires the naming leg to be
 *   successful AND fresh (see `discoveryLegFresh`): a provenance hit from
 *   a scan whose leg has since gone stale is `unknown`, not confirmed —
 *   the catalogue counts only recently-confirmed runners. Every other
 *   inconclusive shape fails OPEN to `unknown` (trusted): a failed or
 *   missing scan, an old runner with no provenance signal, a truncated
 *   provenance map, legacy/bare ids (their attribution is lenient by
 *   design — no single leg can deny them), and operator-asserted ids (the
 *   `availableModels` override is an explicit servability declaration that
 *   wins over runner-reported signals). Stale semantics are byte-identical
 *   to before (only the `stale` verdict refuses in dispatch); freshness
 *   only narrows `confirmed`. Pure classifier, no I/O: the snapshot store
 *   owns persistence, `runnerMatches` owns the dispatch refusal.
 * @example confirmRunnerModel({ capabilities: { modelProvenance: { 'muse::meta::m': {} }, discoveryStatus: { muse: { ok: true, atMs: Date.now() } } } }, 'muse::meta::m').status => 'confirmed'
 ***/

/***
 * MARK: MODEL_PROVENANCE_TRUST_CAP
 * @description Provenance maps at this size are inconclusive: the heartbeat
 *   sanitizer caps the map here, so an id missing from a full map may be
 *   truncated rather than contradicted — failing open keeps giant menus
 *   servable.
 * @example MODEL_PROVENANCE_TRUST_CAP => 1000
 ***/
export const MODEL_PROVENANCE_TRUST_CAP = 1000;

/***
 * MARK: DISCOVERY_LEG_MAX_AGE_MS
 * @description How long a successful discovery leg stays confirming: a leg
 *   older than this no longer proves the runner serves the id, so a
 *   provenance hit on a stale leg reads `unknown` (unconfirmed) instead of
 *   `confirmed`. Local WP-C fallback until WP-B lands its freshness
 *   predicate — WP-B can replace the constant/predicate without touching
 *   callers. A day: heartbeats refresh legs far more often, while a
 *   backend that has not heard a successful scan in a day should stop
 *   counting the runner as verified.
 * @example DISCOVERY_LEG_MAX_AGE_MS => 86400000
 ***/
export const DISCOVERY_LEG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/***
 * MARK: discoveryLegFresh
 * @description Whether one per-harness `discoveryStatus` leg still
 *   confirms: the leg must be a successful scan (`ok === true`) and its
 *   `atMs` must be within `DISCOVERY_LEG_MAX_AGE_MS` of `nowMs`. A leg
 *   with no usable timestamp stays fail-open (fresh): old runners report
 *   `ok` without timing, and nothing may deny on a signal that was never
 *   sent. Pure predicate, exported for the snapshot store and tests.
 * @example discoveryLegFresh({ ok: true, atMs: Date.now() }, Date.now()) => true
 * @example discoveryLegFresh({ ok: true, atMs: 1 }, Date.now()) => false
 * @example discoveryLegFresh({ ok: false, atMs: Date.now() }, Date.now()) => false
 * @param {unknown} leg - The `discoveryStatus[harness]` slice (any JSON value).
 * @param {number} [nowMs] - Clock seam (ms epoch; defaults to `Date.now()`).
 * @returns {boolean} True when the leg still confirms.
 ***/
export const discoveryLegFresh = (leg, nowMs = Date.now()) => {
	if (!leg || typeof leg !== "object" || Array.isArray(leg)) return false;
	if (leg.ok !== true) return false;
	const atMs = leg.atMs;
	if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < 0) return true;
	const now = typeof nowMs === "number" && Number.isFinite(nowMs) && nowMs >= 0 ? nowMs : Date.now();
	return now - atMs <= DISCOVERY_LEG_MAX_AGE_MS;
};

/***
 * MARK: confirmRunnerModel
 * @description Classifies ONE effective advertised id for ONE runner record
 *   as `confirmed` (a scan listed it AND the naming leg is successful and
 *   fresh — see `discoveryLegFresh`), `stale` (the named harness leg
 *   succeeded without it — the pin contradicts the harness's own menu —
 *   or the id scopes a harness the runner never reported), or `unknown`
 *   (nothing speaks conclusively — trusted). Only harness-scoped ids
 *   (`harness`/`harnessReasoning` forms) can be stale or confirmed: they
 *   name the leg that speaks for them. An id the operator explicitly
 *   asserted via `operatorConfig.availableModels` is always `unknown`
 *   (trusted) — the override is a servability declaration, not a claim
 *   to verify. Never throws — malformed input reads as `unknown` (ingest
 *   quarantines malformed ids separately).
 * @example confirmRunnerModel({ capabilities: { modelProvenance: {}, discoveryStatus: { muse: { ok: true, atMs: Date.now() } } } }, 'muse::meta::old').status => 'stale'
 * @example confirmRunnerModel({ capabilities: {} }, 'muse::meta::old').status => 'unknown'
 * @example confirmRunnerModel({ capabilities: { modelProvenance: {}, discoveryStatus: { muse: { ok: true, atMs: Date.now() } } }, operatorConfig: { availableModels: ['muse::meta::old'] } }, 'muse::meta::old').status => 'unknown'
 * @param {Object} [record] - Runner registry record (`capabilities.modelProvenance` / `capabilities.discoveryStatus`).
 * @param {unknown} [rawId] - Advertised id (any JSON value; trimmed like the fleet builder).
 * @param {Object|Function|number} [clock] - Clock seam: a `() => ms` function, a ms-epoch number, or `{ now }` (either shape); defaults to `Date.now`.
 * @returns {{status: "confirmed"|"stale"|"unknown", harness: string|null}} Verdict plus the parsed harness (null when unparsed).
 ***/
export function confirmRunnerModel(record = {}, rawId, clock) {
	const id = String(rawId ?? "").trim();
	let parsed = null;
	try {
		parsed = id ? parseModelKey(id) : null;
	} catch {
		parsed = null;
	}
	const harness = parsed?.harness ?? null;
	// Operator-asserted ids are declarations, not claims: the override
	// exists so an under-reporting runner can serve declared models, so
	// it wins over every runner-reported signal below (scan or harness
	// list). Trimmed like the fleet builder; a non-array override (null
	// = advertised) asserts nothing.
	const override = record?.operatorConfig?.availableModels;
	if (id && Array.isArray(override) && override.some((m) => String(m ?? "").trim() === id)) {
		return { status: "unknown", harness };
	}
	if (!parsed || (parsed.form !== "harness" && parsed.form !== "harnessReasoning")) {
		return { status: "unknown", harness };
	}
	const caps = record?.capabilities && typeof record.capabilities === "object" ? record.capabilities : {};
	// A runner's reported capability set is the authority for "does this
	// runner serve this harness at all": an id scoped to a harness the
	// runner never reported can never run there, so treat it as a stale
	// pin when the runner did publish a harness list. Runners with no
	// capability signal (old runners, tests) stay trusted via the existing
	// fail-open rules below.
	const reportedHarnesses = Array.isArray(caps.harnesses)
		? caps.harnesses
			.map((h) => (typeof h === "string" ? h.trim() : String(h?.id ?? "").trim()))
			.filter(Boolean)
		: [];
	if (parsed?.harness && reportedHarnesses.length > 0 && !reportedHarnesses.includes(parsed.harness)) {
		return { status: "stale", harness };
	}
	let nowMs = Date.now();
	try {
		if (typeof clock === "function") nowMs = clock();
		else if (typeof clock === "number") nowMs = clock;
		else if (clock && typeof clock === "object") {
			if (typeof clock.now === "function") nowMs = clock.now();
			else if (typeof clock.now === "number") nowMs = clock.now;
		}
	} catch {
		nowMs = Date.now();
	}
	const provenance = caps.modelProvenance;
	// No provenance signal at all (old runner): nothing can contradict.
	if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
		return { status: "unknown", harness };
	}
	const legFor = (name) => {
		const status = caps.discoveryStatus;
		const legs = status && typeof status === "object" && !Array.isArray(status) ? status : null;
		return legs ? legs[name] : null;
	};
	// A provenance hit only confirms while the naming leg is successful
	// AND fresh: the scan that listed the id must still speak for it.
	// Stale, failed, or missing legs read `unknown` (unconfirmed) — the
	// snapshot counts these runners as declared, never as serving. A leg
	// with no usable timestamp stays fail-open (fresh); staleness needs a
	// timestamp to judge. Stale verdicts below are unchanged, so dispatch
	// refusal (which branches only on `stale`) is byte-identical.
	if (Object.hasOwn(provenance, id)) {
		return discoveryLegFresh(legFor(parsed.harness), nowMs)
			? { status: "confirmed", harness }
			: { status: "unknown", harness };
	}
	// A full map may have truncated the id at ingest: inconclusive.
	if (Object.keys(provenance).length >= MODEL_PROVENANCE_TRUST_CAP) {
		return { status: "unknown", harness };
	}
	const status = caps.discoveryStatus;
	const leg = status && typeof status === "object" && !Array.isArray(status) ? status[parsed.harness] : null;
	if (leg && typeof leg === "object" && leg.ok === true) return { status: "stale", harness };
	return { status: "unknown", harness };
}

