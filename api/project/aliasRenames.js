import { aliasTargetsSignature } from "../../shared/modelAliases.js";

/** `${projectDir}:${alias}:${harness}` keys already warned about, so rescans cannot spam logs. */
const warnedLegacyNoneHarnessModels = new Set();

/***
 * MARK: warnLegacyNoneHarnessModel
 * @description Warns once per project + alias + harness that a stored alias
 *   target pairs a `none` harness (which manages its own model) with a model
 *   string — the load path blanks it (see `sanitizeAliasTargetModels`) and
 *   the next save persists the clean row.
 * @param {string} projectDir - Absolute path of the project directory (dedup key part).
 * @param {Object} options - The alias row being checked.
 * @param {string} options.alias - Alias name.
 * @param {string} options.harness - Harness name the alias targets.
 * @param {string} options.model - Stored model string (ignored for `none` harnesses).
 * @returns {boolean} `true` when this call emitted the warning (first occurrence),
 *   `false` when the warning was already emitted for this key (deduplicated).
 * @example const first = warnLegacyNoneHarnessModel("/proj", { alias: "x", harness: "none", model: "m" }) // true
 * @example const second = warnLegacyNoneHarnessModel("/proj", { alias: "x", harness: "none", model: "m" }) // false
 ***/
export function warnLegacyNoneHarnessModel(projectDir, { alias, harness, model }) {
	const key = `${projectDir}:${alias}:${harness}`;
	if (warnedLegacyNoneHarnessModels.has(key)) return false;
	warnedLegacyNoneHarnessModels.add(key);
	console.warn(
		`[projectStore] Alias "${alias}" in ${projectDir} targets harness "${harness}", which manages its own model — ignoring the stored model "${model}". Clear the model in Settings › Model Aliases.`,
	);
	return true;
}

/***
 * MARK: inferAliasRenames
 * @description Infers alias renames from an old vs. new alias list so a
 *   rename migrates referencing stages atomically in the same save (a rename
 *   can never orphan stages). Matching is deterministic: a removed name maps
 *   to an added entry with the identical target (same harness + model +
 *   split — compared by canonical target signature so weighted aliases
 *   match too); one leftover removed/added pair maps regardless
 *   (rename-with-retarget). Returns `[{ from, to }]` pairs (possibly empty).
 * @example inferAliasRenames([{ name: "s", harness: "pi", model: "m" }], [{ name: "m", harness: "pi", model: "m" }]) => [{ from: "s", to: "m" }]
 * @param {Array} oldList - Current normalized alias records.
 * @param {Array} newList - Incoming normalized alias records.
 * @returns {Array<{from: string, to: string}>} Rename pairs.
 ***/
export function inferAliasRenames(oldList, newList) {
	const oldNames = new Set((oldList || []).map((a) => a.name));
	const newNames = new Set((newList || []).map((a) => a.name));
	const removed = (oldList || []).filter((a) => !newNames.has(a.name));
	let added = (newList || []).filter((a) => !oldNames.has(a.name));
	const pairs = [];
	for (const r of removed) {
		const candidates = added.filter(
			(a) => aliasTargetsSignature(a) === aliasTargetsSignature(r),
		);
		if (candidates.length === 1) {
			pairs.push({ from: r.name, to: candidates[0].name });
			added = added.filter((a) => a.name !== candidates[0].name);
		}
	}
	const leftoverRemoved = removed.filter(
		(r) => !pairs.some((p) => p.from === r.name),
	);
	if (leftoverRemoved.length === 1 && added.length === 1) {
		pairs.push({ from: leftoverRemoved[0].name, to: added[0].name });
	}
	return pairs;
}
