import { parseModelKey } from "../../../shared/modelKeys.js";

/***
 * MARK: runnerModelConfirmation
 * @description Confirms one runner-advertised model id against that runner's
 *   own discovery signals: the per-id `modelProvenance` (which scan listed
 *   the id) and the per-harness `discoveryStatus` (which scans succeeded).
 *   A harness-scoped pin the runner's own successful scan contradicts is
 *   `stale` — the catalogue marks it unavailable with a reason instead of
 *   serving it as available ("runners muse code doesn't have" is a stale
 *   pin, not a capability). Every inconclusive shape fails OPEN to
 *   `unknown` (trusted): a failed or missing scan, an old runner with no
 *   provenance signal, a truncated provenance map, and legacy/bare ids
 *   (their attribution is lenient by design — no single leg can deny
 *   them). Pure classifier, no I/O: the snapshot store owns persistence.
 * @example confirmRunnerModel({ capabilities: { modelProvenance: { 'muse::meta::m': {} }, discoveryStatus: { muse: { ok: true } } } }, 'muse::meta::m').status => 'confirmed'
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
 * MARK: confirmRunnerModel
 * @description Classifies ONE effective advertised id for ONE runner record
 *   as `confirmed` (a scan listed it), `stale` (the named harness leg
 *   succeeded without it — the pin contradicts the harness's own menu),
 *   or `unknown` (nothing speaks conclusively — trusted). Only
 *   harness-scoped ids (`harness`/`harnessReasoning` forms) can be stale:
 *   they name the leg that denies them. Never throws — malformed input
 *   reads as `unknown` (ingest quarantines malformed ids separately).
 * @example confirmRunnerModel({ capabilities: { modelProvenance: {}, discoveryStatus: { muse: { ok: true } } } }, 'muse::meta::old').status => 'stale'
 * @example confirmRunnerModel({ capabilities: {} }, 'muse::meta::old').status => 'unknown'
 * @param {Object} [record] - Runner registry record (`capabilities.modelProvenance` / `capabilities.discoveryStatus`).
 * @param {unknown} [rawId] - Advertised id (any JSON value; trimmed like the fleet builder).
 * @returns {{status: "confirmed"|"stale"|"unknown", harness: string|null}} Verdict plus the parsed harness (null when unparsed).
 ***/
export function confirmRunnerModel(record = {}, rawId) {
	const id = String(rawId ?? "").trim();
	let parsed = null;
	try {
		parsed = id ? parseModelKey(id) : null;
	} catch {
		parsed = null;
	}
	const harness = parsed?.harness ?? null;
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
	const provenance = caps.modelProvenance;
	// No provenance signal at all (old runner): nothing can contradict.
	if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
		return { status: "unknown", harness };
	}
	if (Object.hasOwn(provenance, id)) return { status: "confirmed", harness };
	// A full map may have truncated the id at ingest: inconclusive.
	if (Object.keys(provenance).length >= MODEL_PROVENANCE_TRUST_CAP) {
		return { status: "unknown", harness };
	}
	const status = caps.discoveryStatus;
	const leg = status && typeof status === "object" && !Array.isArray(status) ? status[parsed.harness] : null;
	if (leg && typeof leg === "object" && leg.ok === true) return { status: "stale", harness };
	return { status: "unknown", harness };
}

