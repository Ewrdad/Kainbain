import { parseModelKey } from "../../../shared/modelKeys.js";

/***
 * MARK: catalogIngest
 * @description Pure ingestion seam for runner-advertised model ids: every id
 *   the fleet serves funnels through here before it can reach the central
 *   catalogue. Parsing follows the shared grammar (`parseModelKey`, single
 *   `:` allowed in ids) so ingestion can never disagree with the pickers;
 *   the advertised id itself is kept BYTE-IDENTICAL (dispatch matches fleet
 *   picks verbatim, so any rewrite would break the match) and the normalized
 *   attributes (harness/provider/model/effort) ride alongside it. Malformed
 *   ids are quarantined with a reason — visible in Settings, never served,
 *   never silently dropped. No I/O, no registry reads: the snapshot store
 *   owns persistence, this module only classifies.
 * @example ingestAdvertisedId('muse::meta::muse-spark-1.4', { runnerId: 'r1' }) => { ok: true, entry: { id: 'muse::meta::muse-spark-1.4', form: 'harness', harness: 'muse', … } }
 * @example ingestAdvertisedId('a::b::c::d::e', { runnerId: 'r1' }) => { ok: false, quarantined: { id: 'a::b::c::d::e', reason: '…', runnerId: 'r1' } }
 ***/

/***
 * MARK: describeMalformedId
 * @description Names why one trimmed id failed `parseModelKey`: five-plus
 *   segments, or an empty segment. Pure classifier for the quarantine
 *   reason — the id is already known-malformed, this only words it.
 * @example describeMalformedId('a::b::c::d::e') => 'has 5 segments (want at most 4: harness::provider::id::reasoning)'
 * @param {string} id - Trimmed advertised id that failed to parse.
 * @returns {string} Human-readable reason.
 ***/
const describeMalformedId = (id) => {
	const segments = String(id).split("::").length;
	if (segments >= 5) {
		return `has ${segments} segments (want at most 4: harness::provider::id::reasoning)`;
	}
	return "has an empty segment (every part between :: must be non-empty)";
};

/***
 * MARK: cleanStringList
 * @description Trims a raw attribution list (serving harnesses, tiers) into a
 *   deduped string list, dropping blanks and non-strings. Runner facts are
 *   operator-influenced input; the catalogue never stores the raw mix.
 * @example cleanStringList([' muse ', '', 42, 'muse']) => ['muse']
 * @param {unknown} list - Raw list value.
 * @returns {string[]} Clean unique strings.
 ***/
const cleanStringList = (list) => {
	const out = [];
	const seen = new Set();
	for (const item of Array.isArray(list) ? list : []) {
		if (typeof item !== "string") continue;
		const value = item.trim();
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
};

/***
 * MARK: ingestAdvertisedId
 * @description Classifies ONE runner-advertised model id for the central
 *   catalogue. Accepted forms (harness, harnessReasoning, provider, bare)
 *   return `{ ok: true, entry }` with the id byte-identical plus its parsed
 *   attributes (harness/provider/model/reasoning), the effort tiers, and the
 *   provenance (runnerId, serving harnesses, detected-at, source). Malformed
 *   ids (unparseable grammar) return `{ ok: false, quarantined }` with the
 *   reason — served nowhere, surfaced in Settings. Blank ids return
 *   `{ ok: false, skipped: true }` (nothing to quarantine, nothing to serve).
 * @example ingestAdvertisedId('muse::meta::m', { runnerId: 'r1', harnesses: ['muse'], tiers: ['T0'] }).entry.harness => 'muse'
 * @param {unknown} rawId - Advertised id (any JSON value; coerced like the fleet builder).
 * @param {Object} [ctx] - Provenance.
 * @param {string} [ctx.runnerId] - Serving runner id.
 * @param {Array} [ctx.harnesses] - Runner's advertised harness ids.
 * @param {Array} [ctx.tiers] - Runner's advertised effort tiers.
 * @param {number} [ctx.atMs] - When the runner detected it (ms epoch, null when unknown).
 * @param {string} [ctx.source] - Advertisement source ('pinned'|'discovered'|'unknown').
 * @returns {{ok: boolean, entry?: Object, quarantined?: Object, skipped?: boolean}} Classification.
 ***/
export const ingestAdvertisedId = (rawId, ctx = {}) => {
	const id = String(rawId ?? "").trim();
	if (!id) return { ok: false, skipped: true };
	const parsed = parseModelKey(id);
	const runnerId = typeof ctx?.runnerId === "string" ? ctx.runnerId : "";
	const atMs = typeof ctx?.atMs === "number" && Number.isFinite(ctx.atMs) && ctx.atMs >= 0 ? ctx.atMs : null;
	const source = typeof ctx?.source === "string" && ctx.source.trim() ? ctx.source.trim() : "unknown";
	if (!parsed) {
		return {
			ok: false,
			quarantined: { id, reason: `Model id "${id}" ${describeMalformedId(id)}.`, runnerId, atMs },
		};
	}
	return {
		ok: true,
		entry: {
			id,
			form: parsed.form,
			harness: parsed.harness ?? null,
			provider: parsed.provider ?? null,
			model: parsed.id ?? id,
			reasoning: parsed.reasoning ?? null,
			tiers: cleanStringList(ctx?.tiers),
			harnesses: cleanStringList(ctx?.harnesses),
			runnerId,
			atMs,
			source,
		},
	};
};

/***
 * MARK: ingestAdvertisedIds
 * @description Classifies a runner's whole advertised list: `{ entries,
 *   quarantined }`. Order-preserving, never throws — one bad id cannot fail
 *   the batch. Blank ids vanish (skipped); every other input lands in
 *   exactly one of the two outputs.
 * @example ingestAdvertisedIds(['muse::meta::m', 'a::b::c::d::e'], { runnerId: 'r1' }).quarantined => [{ id: 'a::b::c::d::e', … }]
 * @param {unknown} list - Advertised id list (any mix of values).
 * @param {Object} [ctx] - Provenance shared by the batch (see ingestAdvertisedId).
 * @returns {{entries: Array<Object>, quarantined: Array<Object>}} Classification.
 ***/
export const ingestAdvertisedIds = (list, ctx = {}) => {
	const entries = [];
	const quarantined = [];
	for (const rawId of Array.isArray(list) ? list : []) {
		const result = ingestAdvertisedId(rawId, ctx);
		if (result.ok) entries.push(result.entry);
		else if (result.quarantined) quarantined.push(result.quarantined);
	}
	return { entries, quarantined };
};
