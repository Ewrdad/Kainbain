import { parseModelKey } from "../../../shared/modelKeys.js";

/***
 * MARK: catalogIngest
 * @description Pure ingestion seam for runner-advertised model ids: every id
 *   the fleet serves funnels through here before it can reach the central
 *   catalogue. Parsing follows the shared grammar (`parseModelKey`, single
 *   `:` allowed in ids) so ingestion can never disagree with the pickers;
 *   the advertised id itself is kept BYTE-IDENTICAL (dispatch matches fleet
 *   picks verbatim, so any rewrite would break the match) and the normalized
 *   attributes (harness/provider/model/effort) ride alongside it. Only
 *   canonical harness-scoped forms (`harness`, `harnessReasoning`) are
 *   admitted: bare and `provider::id` forms are quarantined with a
 *   not-harness-qualified reason (audit trail, never served), and a
 *   harness-scoped id naming a harness the runner does not serve is
 *   quarantined with a not-served reason. Per-entry attribution is the
 *   harness parsed from the id (`entry.harnesses = [parsed.harness]`) —
 *   never the runner's whole harness list — so catalogue sections cannot
 *   leak ids into pickers for other harnesses. Malformed ids are
 *   quarantined with a reason — visible in Settings, never served, never
 *   silently dropped. No I/O, no registry reads: the snapshot store owns
 *   persistence, this module only classifies.
 * @example ingestAdvertisedId('muse::meta::muse-spark-1.4', { runnerId: 'r1', harnesses: ['muse'] }) => { ok: true, entry: { id: 'muse::meta::muse-spark-1.4', form: 'harness', harness: 'muse', … } }
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
 * MARK: cleanHarnessIds
 * @description Trims a runner's reported harness list into deduped ids,
 *   accepting both registry shapes — plain strings (`'muse'`) and
 *   objects (`{ id: 'muse' }`) — dropping blanks and non-strings. The
 *   ingest wrong-harness quarantine, the confirmation stale rule, and
 *   the snapshot store all funnel through here so the three can never
 *   disagree on "does this runner serve this harness".
 * @example cleanHarnessIds([{ id: 'muse' }, ' pi ', '', 42]) => ['muse', 'pi']
 * @param {unknown} list - Raw harness list value.
 * @returns {string[]} Clean unique harness ids.
 ***/
export const cleanHarnessIds = (list) => {
	const out = [];
	const seen = new Set();
	for (const item of Array.isArray(list) ? list : []) {
		const value = typeof item === "string" ? item.trim() : String(item?.id ?? "").trim();
		if (!value || seen.has(value)) continue;
		seen.add(value);
		out.push(value);
	}
	return out;
};

/***
 * MARK: cleanStringList
 * @description Trims a raw attribution list (effort tiers) into a deduped
 *   string list, dropping blanks and non-strings. Runner facts are
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
 *   catalogue. Only canonical harness-scoped forms (`harness`,
 *   `harnessReasoning`) return `{ ok: true, entry }` with the id
 *   byte-identical plus its parsed attributes
 *   (harness/provider/model/reasoning), the effort tiers, per-entry
 *   attribution (`harnesses: [parsed.harness]` — the harness named by the
 *   id, never the runner's whole harness list), and the provenance
 *   (runnerId, detected-at, source). Bare and `provider::id` forms return
 *   `{ ok: false, quarantined }` with the not-harness-qualified reason;
 *   a harness-scoped id naming a harness the runner does not serve
 *   (non-empty reported harness list lacking it) returns
 *   `{ ok: false, quarantined }` with the harness-not-served reason — an
 *   empty/absent reported harness list stays fail-open (old runners) and
 *   accepts. Malformed ids (unparseable grammar) return
 *   `{ ok: false, quarantined }` with the reason — served nowhere,
 *   surfaced in Settings. Blank ids return `{ ok: false, skipped: true }`
 *   (nothing to quarantine, nothing to serve).
 * @example ingestAdvertisedId('muse::meta::m', { runnerId: 'r1', harnesses: ['muse'], tiers: ['T0'] }).entry.harness => 'muse'
 * @example ingestAdvertisedId('prov::m1', { runnerId: 'r1', harnesses: ['muse'] }).quarantined.reason => 'Model id "prov::m1" is not harness-qualified (want harness::provider::model[::effort]).'
 * @param {unknown} rawId - Advertised id (any JSON value; coerced like the fleet builder).
 * @param {Object} [ctx] - Provenance.
 * @param {string} [ctx.runnerId] - Serving runner id.
 * @param {Array} [ctx.harnesses] - Runner's advertised harness ids (used only for the harness-not-served check; never copied onto the entry).
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
	if (parsed.form !== "harness" && parsed.form !== "harnessReasoning") {
		return {
			ok: false,
			quarantined: {
				id,
				reason: `Model id "${id}" is not harness-qualified (want harness::provider::model[::effort]).`,
				runnerId,
				atMs,
			},
		};
	}
	const reported = cleanHarnessIds(ctx?.harnesses);
	if (reported.length > 0 && !reported.includes(parsed.harness)) {
		return {
			ok: false,
			quarantined: {
				id,
				reason: `Model id "${id}" names harness "${parsed.harness}", which runner ${runnerId} does not serve (harness not served by runner ${runnerId}).`,
				runnerId,
				atMs,
			},
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
			harnesses: [parsed.harness],
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
 * @example ingestAdvertisedIds(['muse::meta::m', 'a::b::c::d::e', 'prov::m1'], { runnerId: 'r1' }).quarantined => [{ id: 'a::b::c::d::e', … }, { id: 'prov::m1', … }]
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
