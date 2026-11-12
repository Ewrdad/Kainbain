import { parseModelKey } from "../../../shared/modelKeys.js";

/***
 * MARK: fleetSectionMerge
 * @description Backend half of the central-list merge: attributes fleet
 *   catalogue entries to harness sections and folds them into the
 *   `/compute/models` harness view (existing sections gain fleet-only
 *   ids, fleet-only harness ids gain synthesized sections). Attribution
 *   rules mirror the frontend `fleetModelsForHarness` exactly — strict
 *   for harness-scoped ids (an `h::p::m` id only ever appears under `h`),
 *   lenient for legacy `provider::id` and bare ids (offered under every
 *   section the fleet serves them on), the serving gate applied to both
 *   (an id whose serving union names no such harness is withheld), and
 *   malformed ids skipped. A parity test pair pins both sides to
 *   identical fixtures (`fleetSectionMerge.test.js` here,
 *   `frontend/src/services/fleetModelOptions.test.js` there) — change
 *   the rule in one place and the other side's test names the drift.
 * @example fleetEntriesForHarness('muse', [{ id: 'muse::meta::m', harnesses: ['muse'] }]) => [{ id: 'muse::meta::m', … }]
 ***/

/***
 * MARK: cleanEntryList
 * @description Trims one fleet entry's string list (serving harnesses,
 *   tiers, runner ids) into a deduped array. Catalogue input is
 *   operator-influenced; the merge never trusts its shape.
 * @example cleanEntryList([' muse ', '']) => ['muse']
 * @param {unknown} list - Raw list value.
 * @returns {string[]} Clean unique strings.
 ***/
const cleanEntryList = (list) => {
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
 * MARK: fleetEntriesForHarness
 * @description The fleet entries attributable to one harness section, in
 *   catalogue order: entries whose id parses AND whose serving union
 *   (when non-empty) includes the section; harness-scoped ids must
 *   additionally name the section. Malformed ids and allowlist-overreach
 *   ids (scoping a harness no serving runner offers) are withheld.
 * @example fleetEntriesForHarness('pi', [{ id: 'muse::meta::m', harnesses: ['muse'] }]) => []
 * @param {string} harnessId - Catalogue harness section.
 * @param {Array} [entries] - Fleet entries (`{ id, harnesses, … }`).
 * @returns {Array<Object>} Attributable entries (possibly empty).
 ***/
export const fleetEntriesForHarness = (harnessId, entries) => {
	const hid = typeof harnessId === "string" ? harnessId.trim() : "";
	if (!hid) return [];
	const out = [];
	for (const entry of Array.isArray(entries) ? entries : []) {
		const id = typeof entry?.id === "string" ? entry.id.trim() : "";
		if (!id) continue;
		let parsed = null;
		try {
			parsed = parseModelKey(id);
		} catch {
			continue;
		}
		if (!parsed) continue;
		const serving = cleanEntryList(entry?.harnesses);
		if (serving.length > 0 && !serving.includes(hid)) continue;
		if (parsed.form === "harness" || parsed.form === "harnessReasoning") {
			if (parsed.harness !== hid) continue;
		}
		out.push(entry);
	}
	return out;
};

/***
 * MARK: projectFleetEntry
 * @description Projects one attributable fleet entry onto the public
 *   section-model shape: the EXACT advertised id as `key` (dispatch
 *   matches verbatim, so keys stay byte-equal), parsed provider/model
 *   segments, the owning `harness`, and the additive fleet availability
 *   (`fleet`, `runnerCount`, `runnerIds`, `claimedBy`, `tiers`,
 *   `available`, `unavailableReason`) the pickers badge from.
 * @example projectFleetEntry({ id: 'muse::meta::m', runnerCount: 1 }, 'muse').key => 'muse::meta::m'
 * @param {Object} entry - Attributable fleet entry.
 * @param {string} harnessId - Owning section id.
 * @returns {Object|null} Public model, or null when unprojectable.
 ***/
export const projectFleetEntry = (entry, harnessId) => {
	const id = typeof entry?.id === "string" ? entry.id.trim() : "";
	if (!id) return null;
	const parsed = parseModelKey(id);
	if (!parsed) return null;
	const base = {
		key: id,
		harness: harnessId,
		fleet: true,
		runnerCount: typeof entry?.runnerCount === "number" && Number.isFinite(entry.runnerCount) && entry.runnerCount >= 0
			? Math.floor(entry.runnerCount)
			: 0,
		runnerIds: cleanEntryList(entry?.runnerIds),
		claimedBy: cleanEntryList(entry?.claimedBy),
		tiers: cleanEntryList(entry?.tiers),
		available: entry?.available !== false,
		unavailableReason: typeof entry?.unavailableReason === "string" ? entry.unavailableReason : null,
	};
	if (parsed.form === "harness" || parsed.form === "harnessReasoning") {
		return {
			...base,
			id: parsed.form === "harnessReasoning" ? `${parsed.id}::${parsed.reasoning}` : parsed.id,
			provider: parsed.provider,
			name: parsed.id,
		};
	}
	if (parsed.form === "provider") {
		return { ...base, id: parsed.id, provider: parsed.provider, name: parsed.id };
	}
	return { ...base, id: parsed.id, provider: "", name: parsed.id };
};

/***
 * MARK: optionKeyOf
 * @description The dedupe key for one section model: the backend `key`
 *   first, else the locally-computed composite, else the bare id —
 *   the same precedence the pickers use for option values, so a
 *   backend entry and its fleet twin compare equal.
 * @example optionKeyOf({ provider: 'p', id: 'm' }) => 'p::m'
 * @param {Object} model - Section model.
 * @returns {string} Dedupe key.
 ***/
const optionKeyOf = (model) => {
	if (typeof model?.key === "string" && model.key) return model.key;
	if (typeof model?.provider === "string" && model.provider) return `${model.provider}::${model?.id ?? ""}`;
	return typeof model?.id === "string" ? model.id : "";
};

/***
 * MARK: fleetOnlyHarnessIds
 * @description Harness ids the fleet serves that no backend section
 *   covers: strict harness segments of attributable harness-scoped ids
 *   plus the serving unions of attributable legacy/bare ids. Sorted,
 *   deduped — the union-section checklist.
 * @example fleetOnlyHarnessIds([{ id: 'muse::meta::m', harnesses: ['muse'] }], ['pi']) => ['muse']
 * @param {Array} [entries] - Fleet entries.
 * @param {Array} [knownIds] - Backend section ids.
 * @returns {string[]} Fleet-only harness ids (possibly empty).
 ***/
export const fleetOnlyHarnessIds = (entries, knownIds) => {
	const known = new Set((Array.isArray(knownIds) ? knownIds : []).filter((id) => typeof id === "string"));
	const found = new Set();
	for (const entry of Array.isArray(entries) ? entries : []) {
		const id = typeof entry?.id === "string" ? entry.id.trim() : "";
		if (!id) continue;
		const parsed = parseModelKey(id);
		if (!parsed) continue;
		const serving = cleanEntryList(entry?.harnesses);
		if (parsed.form === "harness" || parsed.form === "harnessReasoning") {
			if (serving.length > 0 && !serving.includes(parsed.harness)) continue;
			if (!known.has(parsed.harness)) found.add(parsed.harness);
		} else {
			for (const h of serving) {
				if (!known.has(h)) found.add(h);
			}
		}
	}
	return [...found].sort();
};

/***
 * MARK: describeFleetSection
 * @description Builds one synthesized union-section view for a
 *   fleet-only harness id: honest unknown-backend labels, `list`
 *   selection over exactly the attributable fleet ids, and the
 *   `fleetOnly` marker (plus the unknown-availability shape) so
 *   pickers render it like any section while Settings can tell it
 *   apart. Never throws — an unusable harness id yields null.
 * @example describeFleetSection('muse', [{ id: 'muse::meta::m', harnesses: ['muse'] }]).models => [{ key: 'muse::meta::m', … }]
 * @param {string} harnessId - Fleet-only harness id.
 * @param {Array} [entries] - Fleet entries.
 * @returns {Object|null} Section view, or null when nothing attributes.
 ***/
export const describeFleetSection = (harnessId, entries) => {
	const hid = typeof harnessId === "string" ? harnessId.trim() : "";
	if (!hid) return null;
	const models = fleetEntriesForHarness(hid, entries)
		.map((entry) => projectFleetEntry(entry, hid))
		.filter(Boolean);
	if (models.length === 0) return null;
	return {
		id: hid,
		label: hid,
		description: "Fleet-served harness (no backend registration)",
		modelSelection: "list",
		modelFlag: null,
		reasoningLevels: null,
		supportsDiagnosis: false,
		isDefault: false,
		models,
		available: null,
		detectionSource: "fleet",
		fleetOnly: true,
	};
};

/***
 * MARK: mergeFleetIntoSections
 * @description Folds fleet entries into a harness-view list and appends
 *   union sections for fleet-only harness ids: the central list the
 *   pickers read. Backend entries win ties by option key (their richer
 *   labels survive); fleet-only ids append in catalogue order; views
 *   without an id pass through untouched. Never mutates its inputs —
 *   returns fresh view objects — and a missing/empty fleet returns the
 *   views unchanged.
 * @example mergeFleetIntoSections([{ id: 'pi', models: [] }], [{ id: 'muse::meta::m', harnesses: ['muse'] }]) => [{ id: 'pi', … }, { id: 'muse', … }]
 * @param {Array} [views] - Backend harness views.
 * @param {Array} [entries] - Fleet entries.
 * @returns {Array} Merged views (possibly the input views).
 ***/
export const mergeFleetIntoSections = (views, entries) => {
	const list = Array.isArray(views) ? views : [];
	const fleet = Array.isArray(entries) ? entries : [];
	if (fleet.length === 0) return list;
	const merged = list.map((view) => {
		const hid = typeof view?.id === "string" ? view.id : "";
		if (!hid) return view;
		const base = Array.isArray(view?.models) ? view.models : [];
		const seen = new Set(base.map(optionKeyOf));
		const extra = fleetEntriesForHarness(hid, fleet)
			.map((entry) => projectFleetEntry(entry, hid))
			.filter((model) => model && !seen.has(model.key));
		if (extra.length === 0) return view;
		return { ...view, models: [...base, ...extra] };
	});
	for (const hid of fleetOnlyHarnessIds(fleet, list.map((view) => view?.id))) {
		const section = describeFleetSection(hid, fleet);
		if (section) merged.push(section);
	}
	return merged;
};
