/***
 * MARK: modelAliases (shared alias grammar)
 * @description THE single implementation of the KainBain per-project model
 *   alias system, shared verbatim by the backend engine (`api/projectStore.js`,
 *   `api/agentRunner.js`, `api/sessionStore.js`) and the frontend settings UI
 *   (`frontend/src/components/settings/ModelAliasesSection.jsx`) so validation
 *   and resolution rules cannot drift. Plain ESM, zero dependencies.
 *
 *   An alias binds a short per-project name (e.g. `small`, `design`) to one
 *   or more weighted harness + model targets
 *   (`{ name, targets: [{ harness, model, percent }] }`, persisted on
 *   `project.modelAliases`; a legacy `{ name, harness, model }` record reads
 *   as one 100% target). Stages reference aliases through the
 *   existing harness-first fields — `harness: "alias"` + `model: "<name>"` —
 *   so every inherit/override path keeps working unchanged, and editing an
 *   alias changes every referencing stage with no stage edits (stages store
 *   the reference, never a copy of the concrete values).
 *
 *   `alias` is a VIRTUAL harness id: it never names a real AgentHarness
 *   (registering it throws — see `api/agent/harnessRegistry.js`), and an
 *   alias target pointing back at `alias` is a loop, treated as unknown.
 ***/

/** The virtual harness id that scopes alias references. Never a real harness. */
export const ALIAS_HARNESS_ID = "alias";

/** Alias names mirror the harness-id shape: lowercase, URL-safe. */
export const ALIAS_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

/** Maximum alias name length (keeps picker labels and logs readable). */
export const ALIAS_NAME_MAX_LENGTH = 64;

/***
 * MARK: normalizeAliasName
 * @description Trims an alias name to its usable form ("" when blank or
 *   non-string, i.e. "no alias named").
 * @example normalizeAliasName("  Small  ") => "Small"
 * @example normalizeAliasName("") => ""
 * @param {unknown} name - Raw alias name.
 * @returns {string} Trimmed name, or "" when unset.
 ***/
export function normalizeAliasName(name) {
	return typeof name === "string" ? name.trim() : "";
}

/***
 * MARK: validateAliasName
 * @description Validates an alias name, returning an error string or null.
 *   Names are trimmed, 1–64 chars, and must match `[a-z0-9][a-z0-9_-]*`
 *   (case-sensitive: `Small` and `small` are different aliases, and uppercase
 *   is rejected so references cannot drift by case).
 * @example validateAliasName("small") => null
 * @example validateAliasName("Small") => "…"
 * @param {unknown} name - Raw alias name.
 * @returns {string|null} Error message, or null when valid.
 ***/
export function validateAliasName(name) {
	const trimmed = normalizeAliasName(name);
	if (!trimmed) return "Alias name is required";
	if (trimmed.length > ALIAS_NAME_MAX_LENGTH) {
		return `Alias name must be at most ${ALIAS_NAME_MAX_LENGTH} characters`;
	}
	if (!ALIAS_NAME_PATTERN.test(trimmed)) {
		return "Alias name must start with a letter or digit and contain only lowercase letters, digits, - and _";
	}
	return null;
}

/***
 * MARK: validateAliasTarget
 * @description Validates ONE weighted target inside a multi-target alias,
 *   returning an error string or null. The target harness must be a
 *   non-empty string that is NOT the virtual `alias` id (loop guard). The
 *   target model is a string in any accepted model-key form (blank is
 *   allowed at the grammar level for self-managed `none` harnesses — the
 *   settings UI additionally requires a model for `list` harnesses). The
 *   percent is an integer 1–100 (the rows of one alias must sum to exactly
 *   100 — see `validateAliasTargets`).
 * @example validateAliasTarget({ harness: "pi", model: "google::m", percent: 90 }, "small") => null
 * @example validateAliasTarget({ harness: "pi", model: "m", percent: 0 }, "small") => "…"
 * @param {unknown} target - Candidate `{ harness, model, percent }` record.
 * @param {unknown} aliasName - Owning alias name (for error messages).
 * @returns {string|null} Error message, or null when valid.
 ***/
export function validateAliasTarget(target, aliasName) {
	const label =
		normalizeAliasName(aliasName) || "(unnamed alias)";
	if (!target || typeof target !== "object" || Array.isArray(target)) {
		return `Alias "${label}" has a target that must be an object { harness, model, percent }`;
	}
	const harness =
		typeof target.harness === "string" ? target.harness.trim() : "";
	if (!harness) return `Alias "${label}" has a target without a harness`;
	if (harness === ALIAS_HARNESS_ID) {
		return `Alias "${label}" cannot target the "${ALIAS_HARNESS_ID}" harness (aliases cannot point at aliases)`;
	}
	if (typeof target.model !== "string") {
		return `Alias "${label}" has a target without a model`;
	}
	if (
		typeof target.percent !== "number" ||
		!Number.isInteger(target.percent) ||
		target.percent < 1 ||
		target.percent > 100
	) {
		return `Alias "${label}" has a target whose percent must be a whole number from 1 to 100`;
	}
	return null;
}

/***
 * MARK: validateAliasTargets
 * @description Validates a whole multi-target split: a non-empty array whose
 *   every target satisfies `validateAliasTarget` and whose percents sum to
 *   exactly 100 (users see percentages, never arbitrary weights).
 * @example validateAliasTargets([{ harness: "pi", model: "m", percent: 90 }, { harness: "custom", model: "", percent: 10 }], "small") => null
 * @param {unknown} targets - Candidate targets array.
 * @param {unknown} aliasName - Owning alias name (for error messages).
 * @returns {string|null} Error message, or null when valid.
 ***/
export function validateAliasTargets(targets, aliasName) {
	const label =
		normalizeAliasName(aliasName) || "(unnamed alias)";
	if (!Array.isArray(targets) || targets.length === 0) {
		return `Alias "${label}" needs at least one target`;
	}
	for (const target of targets) {
		const reason = validateAliasTarget(target, aliasName);
		if (reason) return reason;
	}
	const total = targets.reduce((sum, t) => sum + t.percent, 0);
	if (total !== 100) {
		return `Alias "${label}" splits ${total}% — Percents must add up to 100%`;
	}
	return null;
}

/***
 * MARK: validateModelAlias
 * @description Validates one alias record, returning an error string or null.
 *   Two shapes are accepted: the legacy single-target record
 *   (`{ name, harness, model }`, read as one 100% target) and the weighted
 *   record (`{ name, targets: [{ harness, model, percent }] }` whose
 *   percents sum to 100). A lone target harness must be a non-empty string
 *   that is NOT the virtual `alias` id (loop guard); the model accepts any
 *   model-key form, EXCEPT blank is allowed only for self-managed harnesses
 *   at dispatch (the settings UI requires a model for `list` harnesses).
 * @example validateModelAlias({ name: "small", harness: "pi", model: "google::m" }) => null
 * @example validateModelAlias({ name: "c", harness: "custom", model: "" }) => null
 * @param {unknown} entry - Candidate alias record.
 * @returns {string|null} Error message, or null when valid.
 ***/
export function validateModelAlias(entry) {
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		return "Alias must be an object { name, targets }";
	}
	const nameError = validateAliasName(entry.name);
	if (nameError) return nameError;
	if (entry.targets !== undefined && entry.targets !== null) {
		return validateAliasTargets(entry.targets, entry.name);
	}
	const harness =
		typeof entry.harness === "string" ? entry.harness.trim() : "";
	if (!harness) return `Alias "${normalizeAliasName(entry.name)}" needs a harness`;
	if (harness === ALIAS_HARNESS_ID) {
		return `Alias "${normalizeAliasName(entry.name)}" cannot target the "${ALIAS_HARNESS_ID}" harness (aliases cannot point at aliases)`;
	}
	if (typeof entry.model !== "string") {
		return `Alias "${normalizeAliasName(entry.name)}" needs a model`;
	}
	return null;
}

/***
 * MARK: isAliasRef
 * @description Whether a harness + model pair is an alias reference
 *   (`harness === "alias"` with a non-blank model naming the alias).
 * @example isAliasRef("alias", "small") => true
 * @example isAliasRef("pi", "small") => false
 * @param {unknown} harness - Effective harness id.
 * @param {unknown} model - Effective model value (the alias name).
 * @returns {boolean} True when the pair references an alias.
 ***/
export function isAliasRef(harness, model) {
	return (
		(typeof harness === "string" ? harness.trim() : "") ===
			ALIAS_HARNESS_ID && Boolean(normalizeAliasName(model))
	);
}

/***
 * MARK: getAliasTargets
 * @description Returns one alias record's weighted targets as fresh
 *   `{ harness, model, percent }` rows. A legacy single-target record
 *   (`{ harness, model }` with no `targets`) reads as one 100% target, so
 *   every consumer downstream sees a single shape. Never throws — an absent
 *   or malformed record yields no targets.
 * @example getAliasTargets({ name: "s", harness: "pi", model: "m" }) => [{ harness: "pi", model: "m", percent: 100 }]
 * @param {unknown} alias - Alias record (either shape).
 * @returns {Array<{harness: string, model: string, percent: number}>} Target rows (possibly empty).
 ***/
export function getAliasTargets(alias) {
	if (!alias || typeof alias !== "object" || Array.isArray(alias)) return [];
	if (Array.isArray(alias.targets)) {
		const out = [];
		for (const target of alias.targets) {
			if (!target || typeof target !== "object" || Array.isArray(target)) {
				continue;
			}
			const harness =
				typeof target.harness === "string" ? target.harness.trim() : "";
			const model =
				typeof target.model === "string" ? target.model.trim() : "";
			const percent = target.percent;
			if (!harness || harness === ALIAS_HARNESS_ID) continue;
			if (
				typeof percent !== "number" ||
				!Number.isInteger(percent) ||
				percent < 1
			) {
				continue;
			}
			out.push({ harness, model, percent });
		}
		if (out.length > 0) return out;
	}
	const harness =
		typeof alias.harness === "string" ? alias.harness.trim() : "";
	if (!harness || harness === ALIAS_HARNESS_ID) return [];
	if (typeof alias.model !== "string") return [];
	return [{ harness, model: alias.model.trim(), percent: 100 }];
}

/***
 * MARK: aliasTargetsSignature
 * @description Builds the canonical fingerprint of an alias's targets
 *   (trimmed harness + model with percent, joined) so rename inference,
 *   selector counters, and tests can tell "same split" from "retargeted"
 *   without caring about the legacy/new record shape.
 * @example aliasTargetsSignature({ name: "s", harness: "pi", model: "m" }) => "pi::m@100"
 * @param {unknown} alias - Alias record (either shape).
 * @returns {string} Canonical signature ("" when the alias has no targets).
 ***/
export function aliasTargetsSignature(alias) {
	return getAliasTargets(alias)
		.map((t) => `${t.harness}::${t.model}@${t.percent}`)
		.join("|");
}

/***
 * MARK: normalizeTargetPercents
 * @description Spreads 100% evenly across the given targets (largest share
 *   first for the leftover points, so thirds become 34/33/33), returning
 *   fresh rows with the same harness + model. Powers the UI's one-click
 *   "make the rows add to 100%" helper; the API never auto-fixes splits
 *   (a non-100 payload is refused so the user sees the correction).
 * @example normalizeTargetPercents([{ harness: "a", model: "m" }, { harness: "b", model: "n" }]) => [{ harness: "a", model: "m", percent: 50 }, { harness: "b", model: "n", percent: 50 }]
 * @param {unknown} targets - Target rows (harness + model read, percent ignored).
 * @returns {Array<{harness: string, model: string, percent: number}>} Rows summing to exactly 100 (empty when input is empty).
 ***/
export function normalizeTargetPercents(targets) {
	const rows = Array.isArray(targets)
		? targets
				.filter((t) => t && typeof t === "object" && !Array.isArray(t))
				.map((t) => ({
					harness: typeof t.harness === "string" ? t.harness.trim() : "",
					model: typeof t.model === "string" ? t.model : "",
				}))
		: [];
	if (rows.length === 0) return [];
	const base = Math.floor(100 / rows.length);
	let leftover = 100 - base * rows.length;
	return rows.map((row) => {
		const extra = leftover > 0 ? 1 : 0;
		leftover -= extra;
		return { ...row, percent: base + extra };
	});
}

/***
 * MARK: selectWeightedIndex
 * @description ONE deterministic step of smooth weighted round-robin: adds
 *   each weight to its running score, picks the highest scorer (lowest
 *   index wins ties), then subtracts the weight total from the winner so
 *   the next pick rotates. With weights [90, 10] the minority index wins
 *   exactly every 10th call, evenly spread — no random clustering, and the
 *   sequence replays exactly from a zeroed score array (scores are kept
 *   outside so the caller owns persistence: in-memory counters in
 *   `api/aliasSelector.js`, injectable arrays in tests).
 * @example selectWeightedIndex([90, 10], [0, 0]) => 0
 * @param {Array<number>} weights - Per-target weights (the integer percents).
 * @param {Array<number>} scores - Running scores, mutated in place (must match weights in length).
 * @returns {number} Winning index (-1 when there is nothing to pick).
 ***/
export function selectWeightedIndex(weights, scores) {
	if (!Array.isArray(weights) || weights.length === 0) return -1;
	const total = weights.reduce(
		(sum, w) => sum + (typeof w === "number" && w > 0 ? w : 0),
		0,
	);
	if (total <= 0) return -1;
	let winner = 0;
	let best = -Infinity;
	for (let i = 0; i < weights.length; i++) {
		const weight = typeof weights[i] === "number" && weights[i] > 0 ? weights[i] : 0;
		scores[i] = (typeof scores[i] === "number" ? scores[i] : 0) + weight;
		if (scores[i] > best) {
			best = scores[i];
			winner = i;
		}
	}
	scores[winner] -= total;
	return winner;
}

/***
 * MARK: normalizeModelAliases
 * @description Normalizes a persisted alias list on write: drops non-objects
 *   and invalid entries, trims every field, upgrades legacy single-target
 *   records to the weighted form, dedupes by name (first wins), and returns
 *   fresh canonical records. Every record carries `targets`
 *   (`[{ harness, model, percent }]`, percents summing to 100) with the
 *   first target mirrored onto the legacy `harness`/`model` fields, so a
 *   rollback build that only reads the legacy fields keeps serving the top
 *   target. Never throws — garbage in stored JSON degrades to fewer
 *   aliases, not a broken project.
 * @example normalizeModelAliases([{ name: " s ", harness: "pi", model: "m", extra: 1 }]) => [{ name: "s", harness: "pi", model: "m", targets: [{ harness: "pi", model: "m", percent: 100 }] }]
 * @param {unknown} list - Persisted `project.modelAliases` value.
 * @returns {Array<{name: string, harness: string, model: string, targets: Array}>} Clean alias records.
 ***/
export function normalizeModelAliases(list) {
	if (!Array.isArray(list)) return [];
	const seen = new Set();
	const out = [];
	for (const entry of list) {
		if (validateModelAlias(entry)) continue;
		const name = normalizeAliasName(entry.name);
		if (seen.has(name)) continue;
		seen.add(name);
		const targets = getAliasTargets({
			harness:
				typeof entry.harness === "string" ? entry.harness.trim() : "",
			model: typeof entry.model === "string" ? entry.model : "",
			targets: Array.isArray(entry.targets)
				? entry.targets.map((t) =>
						t && typeof t === "object" && !Array.isArray(t)
							? {
									harness:
										typeof t.harness === "string" ? t.harness.trim() : "",
									model: typeof t.model === "string" ? t.model : "",
									percent: t.percent,
								}
							: t,
					)
				: undefined,
		});
		if (targets.length === 0) continue;
		out.push({
			name,
			harness: targets[0].harness,
			model: targets[0].model,
			targets: targets.map((t) => ({ ...t })),
		});
	}
	return out;
}

/***
 * MARK: getAliasList
 * @description Returns the project's normalized alias list (never the live
 *   array — safe to map over even when the project never had aliases).
 * @example getAliasList({ modelAliases: [{ name: "s", harness: "pi", model: "m" }] }) => [{ name: "s", harness: "pi", model: "m" }]
 * @param {Object} [project] - Project entity.
 * @returns {Array<Object>} Normalized alias records (possibly empty).
 ***/
export function getAliasList(project) {
	return normalizeModelAliases(project?.modelAliases);
}

/***
 * MARK: resolveAlias
 * @description Looks up one alias by name on a project. Name matching is
 *   trimmed and case-sensitive (names are validated lowercase, so `Small`
 *   never silently resolves `small`).
 * @example resolveAlias(project, "small") => { name: "small", harness: "pi", model: "google::m" }
 * @param {Object} [project] - Project entity.
 * @param {unknown} name - Alias name.
 * @returns {Object|null} The alias record, or null when absent.
 ***/
export function resolveAlias(project, name) {
	const wanted = normalizeAliasName(name);
	if (!wanted) return null;
	return getAliasList(project).find((a) => a.name === wanted) || null;
}

/***
 * MARK: findAliasUsages
 * @description Finds every stage (across all named workflows plus the legacy
 *   root stage list) and the project default that reference an alias name
 *   (`harness === "alias"` + `model === name`). Used by the settings UI to
 *   show impact ("3 stages use this alias") and to prove rename migration.
 * @example findAliasUsages(project, "small") => { stages: [{ workflowId, stageId, stageName }], usesAsDefault: true }
 * @param {Object} [project] - Project entity.
 * @param {unknown} name - Alias name.
 * @returns {{stages: Array<Object>, usesAsDefault: boolean}} Usage locations.
 ***/
export function findAliasUsages(project, name) {
	const wanted = normalizeAliasName(name);
	const usages = { stages: [], usesAsDefault: false };
	if (!wanted || !project || typeof project !== "object") return usages;
	if (
		isAliasRef(project.harness, project.defaultModel) &&
		normalizeAliasName(project.defaultModel) === wanted
	) {
		usages.usesAsDefault = true;
	}
	const checkStage = (workflowId, stage) => {
		if (!stage || typeof stage !== "object") return;
		if (
			isAliasRef(stage.harness, stage.model) &&
			normalizeAliasName(stage.model) === wanted
		) {
			usages.stages.push({
				workflowId: workflowId || null,
				stageId: stage.id ?? null,
				stageName: stage.name ?? null,
			});
		}
	};
	if (Array.isArray(project.workflows) && project.workflows.length > 0) {
		// Named workflows are authoritative (the legacy root list mirrors the
		// active workflow's stages as copies — scanning both double-counts).
		for (const wf of project.workflows) {
			if (!wf || typeof wf !== "object") continue;
			for (const stage of wf.stages || []) checkStage(wf.id, stage);
		}
	} else if (Array.isArray(project.stages)) {
		for (const stage of project.stages) checkStage(null, stage);
	}
	return usages;
}

/***
 * MARK: applyAliasRename
 * @description Migrates every reference to an alias in place (project default
 *   + all workflow stages + legacy root stages) so a rename can never orphan
 *   stages. Mutates `project` and returns the number of references migrated.
 *   Both names are trimmed; a blank new name or identical names migrates
 *   nothing. Only exact alias references move — stages on other harnesses
 *   whose model merely equals the name are untouched.
 * @example applyAliasRename(project, "small", "medium") => 3
 * @param {Object} project - Project entity (mutated).
 * @param {unknown} oldName - Current alias name.
 * @param {unknown} newName - Replacement alias name.
 * @returns {number} Count of migrated references.
 ***/
export function applyAliasRename(project, oldName, newName) {
	const from = normalizeAliasName(oldName);
	const to = normalizeAliasName(newName);
	if (!project || typeof project !== "object" || !from || !to || from === to) {
		return 0;
	}
	let migrated = 0;
	// The project default stores its model in `defaultModel` (not `model`).
	if (
		isAliasRef(project.harness, project.defaultModel) &&
		normalizeAliasName(project.defaultModel) === from
	) {
		project.defaultModel = to;
		migrated += 1;
	}
	const migrateStages = (stages) => {
		if (!Array.isArray(stages)) return;
		for (const stage of stages) {
			if (
				stage &&
				typeof stage === "object" &&
				isAliasRef(stage.harness, stage.model) &&
				normalizeAliasName(stage.model) === from
			) {
				stage.model = to;
				migrated += 1;
			}
		}
	};
	if (Array.isArray(project.workflows) && project.workflows.length > 0) {
		// Named workflows are authoritative (see findAliasUsages).
		for (const wf of project.workflows) {
			if (wf && typeof wf === "object") migrateStages(wf.stages);
		}
	} else {
		migrateStages(project.stages);
	}
	return migrated;
}

/***
 * MARK: aliasPseudoModels
 * @description Projects a project's aliases onto catalogue-shaped pseudo-models
 *   (`{ id, name, provider: "alias", key, harness: "alias" }`) for the virtual
 *   `alias` entry of the harness-first picker. Keys ARE the alias names, so
 *   the picker's exact-key matching, bare-name fallback, and provider
 *   grouping all work with zero picker forks.
 * @example aliasPseudoModels([{ name: "small", harness: "pi", model: "m" }]) => [{ id: "small", name: "small", provider: "alias", key: "small", harness: "alias" }]
 * @param {unknown} aliases - Alias records (any shape — normalized first).
 * @returns {Array<Object>} Pseudo-model rows (possibly empty).
 ***/
export function aliasPseudoModels(aliases) {
	return normalizeModelAliases(aliases).map((a) => ({
		id: a.name,
		name: a.name,
		provider: ALIAS_HARNESS_ID,
		key: a.name,
		harness: ALIAS_HARNESS_ID,
	}));
}
