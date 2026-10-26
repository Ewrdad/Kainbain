import {
	getAliasTargets,
	normalizeAliasName,
} from "../shared/modelAliases.js";
import {
	getHarnessByName,
	hasHarness,
	harnessModelSelection,
	harnessReasoningLevels,
} from "./agent/harnessRegistry.js";
import {
	checkReasoningLevelText,
	parseModelKey,
	stripReasoning,
	validateModelRefShape,
} from "../shared/modelKeys.js";

/***
 * MARK: aliasTargets (harness-aware alias target rules)
 * @description The API-side companion to the dependency-free
 *   `shared/modelAliases.js` grammar: rules that need to know a harness's
 *   `modelSelection` mode. Save-time validation runs in two tiers
 *   (`validateAliasTargetModels`): HARD errors refuse structurally impossible
 *   combinations (a model on a `none` harness, an unknown harness id, a
 *   malformed ref), while SOFT warnings surface catalog-miss combinations
 *   (valid shape, absent from the target harness's catalog right now —
 *   catalogs drift and discovery may be offline, so these never block the
 *   save). The load path blanks legacy `none`-harness rows with a warning
 *   (`sanitizeAliasTargetModels`, defense in depth — old projects keep
 *   loading). All lookups are injectable so tests never need the real
 *   registry or live CLIs.
 ***/

/***
 * MARK: defaultModelIdsFor
 * @description The default catalog probe for save-time validation: the set of
 *   matchable model identities (`key`, `provider::id`, `id`, `name`) for one
 *   harness, or null when the catalog cannot be read (unknown harness, no
 *   listModels, discovery failure — null means "unknown", which warns about
 *   NOTHING, so unhealthy harnesses never flap soft warnings onto saves).
 * @example await defaultModelIdsFor("mock") => Set { "mock::echo-v1", "echo-v1", … }
 * @param {string} harnessId - The harness id to probe.
 * @returns {Promise<Set<string>|null>} Matchable identities, or null when unknown.
 ***/
export async function defaultModelIdsFor(harnessId) {
	try {
		if (!hasHarness(harnessId)) return null;
		const harness = getHarnessByName(harnessId);
		if (typeof harness?.listModels !== "function") return null;
		const models = await harness.listModels();
		if (!Array.isArray(models)) return null;
		const ids = new Set();
		for (const m of models) {
			if (!m || typeof m !== "object") continue;
			if (typeof m.key === "string" && m.key) ids.add(m.key);
			if (typeof m.provider === "string" && typeof m.id === "string") {
				ids.add(`${m.provider}::${m.id}`);
			}
			if (typeof m.id === "string" && m.id) ids.add(m.id);
			if (typeof m.name === "string" && m.name) ids.add(m.name);
		}
		return ids;
	} catch {
		return null;
	}
}

/***
 * MARK: modelRefMatchesIds
 * @description Reports whether a stored model reference names any identity in
 *   a probed catalog set: canonical 3-part keys match their full key, their
 *   `provider::id` pair, or their bare id; legacy 2-part keys match their
 *   full key or bare id; bare refs match verbatim (id or name).
 * @example modelRefMatchesIds("pi::google::m", new Set(["google::m"])) => true
 * @param {string} ref - A non-blank stored model reference.
 * @param {Set<string>} ids - The probed matchable identities.
 * @returns {boolean} True when the ref names a catalogued model.
 ***/
export function modelRefMatchesIds(ref, ids) {
	if (!ids || typeof ids.has !== "function") return false;
	const raw = String(ref || "").trim();
	if (!raw || ids.has(raw)) return ids?.has(raw) === true;
	const parsed = parseModelKey(raw);
	if (parsed && parsed.form !== "bare") {
		const baseRef = stripReasoning(raw);
		if (ids.has(baseRef)) return true;
		if (ids.has(`${parsed.provider}::${parsed.id}`)) return true;
		if (ids.has(parsed.id)) return true;
	}
	return false;
}

/***
 * MARK: stripUnsupportedReasoningLevel
 * @description Drops the reasoning level off a model reference when the run's
 *   harness does not advertise it, so dispatch runs on the model default
 *   instead of failing the stage (defense in depth — save-time validation
 *   should already have refused it, but catalogs drift and stored values
 *   predate the check). Supported levels, and refs without one, pass through
 *   untouched. The owning harness is the run harness first, falling back to
 *   the harness named inside the ref itself — a level only means something
 *   inside the harness scope that defined it.
 * @example stripUnsupportedReasoningLevel({ modelRef: "pi::p::m::high", harnessName: "pi", reasoningLevelsFor: () => ["high"] }) => "pi::p::m::high"
 * @example stripUnsupportedReasoningLevel({ modelRef: "pi::p::m::ultra", harnessName: "pi", reasoningLevelsFor: () => ["high"] }) => "pi::p::m"
 * @example stripUnsupportedReasoningLevel({ modelRef: "pi::p::m", harnessName: "pi" }) => "pi::p::m"
 * @param {Object} [opts]
 * @param {string} [opts.modelRef] - Stored model reference (any accepted form).
 * @param {string} [opts.harnessName] - The harness the run executes on ("" = unknown).
 * @param {Function} [opts.reasoningLevelsFor] - `(harnessId) => string[]|null` (defaults to the harness registry).
 * @returns {string} The ref to dispatch: the original when supported, the base ref when stripped.
 ***/
export function stripUnsupportedReasoningLevel({
	modelRef,
	harnessName,
	reasoningLevelsFor = harnessReasoningLevels,
} = {}) {
	const parsed = parseModelKey(
		typeof modelRef === "string" ? modelRef : "",
	);
	if (parsed?.form !== "harnessReasoning") return modelRef;
	const runHarness =
		(typeof harnessName === "string" && harnessName.trim()) || parsed.harness;
	const allowed = reasoningLevelsFor(runHarness);
	if (Array.isArray(allowed) && allowed.includes(parsed.reasoning)) {
		return modelRef;
	}
	return stripReasoning(modelRef);
}

/***
 * MARK: validateAliasTargetModels
 * @description Validates ONE grammar-valid alias record's harness↔model
 *   pairings in two tiers. HARD (returned `error`, save refused): a target
 *   on a `none` harness carrying a model string; a target naming an unknown
 *   harness id (including the virtual `"alias"` — aliases cannot point at
 *   aliases); a non-blank malformed model ref. SOFT (returned `warnings[]`,
 *   save succeeds): a model absent from its target harness's catalog right
 *   now (`list` harnesses only, and only when the probe actually read a
 *   catalog — an unreadable catalog warns about nothing).
 * @example await validateAliasTargetModels({ name: "w", harness: "muse", model: "g::m" }) => { error: 'alias "w" targets harness "muse", …', warnings: [] }
 * @example await validateAliasTargetModels({ name: "s", harness: "pi", model: "google::m" }) => { error: null, warnings: [] }
 * @param {unknown} entry - One alias record (either shape; grammar-validated first).
 * @param {Object} [opts]
 * @param {Function} [opts.modelSelectionFor] - `(harnessId) => "none"|"list"` (defaults to the harness registry).
 * @param {Function} [opts.isKnownHarness] - `(harnessId) => boolean` (defaults to the harness registry).
 * @param {Function} [opts.modelIdsFor] - `(harnessId) => Promise<Set<string>|null>` catalog probe (defaults to `defaultModelIdsFor`).
 * @param {Function} [opts.reasoningLevelsFor] - `(harnessId) => string[]|null` advertised levels (defaults to the harness registry).
 * @returns {Promise<{error: string|null, warnings: string[]}>} The hard error and soft warnings.
 ***/
export async function validateAliasTargetModels(
	entry,
	{
		modelSelectionFor = harnessModelSelection,
		isKnownHarness = hasHarness,
		modelIdsFor = defaultModelIdsFor,
		reasoningLevelsFor = harnessReasoningLevels,
	} = {},
) {
	const name = normalizeAliasName(entry?.name) || "(unnamed alias)";
	const warnings = [];
	for (const target of getAliasTargets(entry)) {
		const harnessId =
			typeof target.harness === "string" ? target.harness.trim() : "";
		const model = typeof target.model === "string" ? target.model.trim() : "";
		if (harnessId && !isKnownHarness(harnessId)) {
			return {
				error:
					`alias "${name}" targets unknown harness "${harnessId}" — ` +
					`pick a registered harness in Settings › Model Aliases`,
				warnings,
			};
		}
		if (!model) continue;
		if (modelSelectionFor(target.harness) === "none") {
			return {
				error:
					`alias "${name}" targets harness "${target.harness}", which ` +
					`manages its own model — leave the model blank`,
				warnings,
			};
		}
		if (validateModelRefShape(model) === null) {
			return {
				error:
					`alias "${name}" targets harness "${harnessId}" with a malformed ` +
					`model ref "${model}" — use "harness::provider::id", "provider::id", or a bare id`,
				warnings,
			};
		}
		// Reasoning-level enforcement (hard): a 4-part model ref carries a
		// level that the target harness must advertise. Validated against
		// the harness's declared set only — never the live catalog, which
		// drifts and may be unreachable when the save happens.
		const parsedRef = parseModelKey(model);
		if (parsedRef?.form === "harnessReasoning") {
			const level = parsedRef.reasoning;
			const levelProblem = checkReasoningLevelText({ level });
			if (levelProblem) {
				return {
					error:
						`alias "${name}" targets harness "${harnessId}" with a malformed ` +
						`model ref "${model}" — invalid reasoning level "${level}" (${levelProblem})`,
					warnings,
				};
			}
			const effectiveHarnessId = harnessId || parsedRef.harness;
			const advertised = reasoningLevelsFor(effectiveHarnessId);
			if (!Array.isArray(advertised)) {
				return {
					error:
						`alias "${name}" targets harness "${effectiveHarnessId}", which does not support ` +
						`adjustable reasoning, but model "${model}" carries reasoning level "${level}"`,
					warnings,
				};
			}
			if (!advertised.includes(level)) {
				return {
					error:
						`alias "${name}" targets harness "${effectiveHarnessId}" with reasoning level ` +
						`"${level}", which is not supported (supported: ${advertised.join(", ")})`,
					warnings,
				};
			}
		}
		// Soft catalog-membership check (`list` harnesses only): a miss warns
		// visibly but never blocks the save (catalogs drift, discovery may
		// be offline). An unreadable catalog (probe null) warns nothing.
		if (modelSelectionFor(target.harness) !== "list") continue;
		let ids = null;
		try {
			ids = await modelIdsFor(harnessId);
		} catch {
			ids = null;
		}
		if (!ids) continue;
		if (!modelRefMatchesIds(model, ids)) {
			warnings.push(
				`alias "${name}" targets harness "${harnessId}" with model "${model}", ` +
					`which is not in that harness's model catalog right now — the stage will ` +
					`fall back at dispatch if it is still missing then`,
			);
		}
	}
	return { error: null, warnings };
}

/***
 * MARK: validateDefaultModelCombination
 * @description Validates a project's `defaultModel` against its effective
 *   harness in the same two tiers. Blank/`"default"` always passes
 *   (inherit). On the virtual `"alias"` harness the default names an alias:
 *   an unresolvable name warns softly (never blocks — the alias may be
 *   renamed later). On a concrete harness: a malformed non-blank ref is a
 *   HARD error when it arrives in the save payload (stored values from a
 *   harness change re-check warn softly instead, so unrelated saves are
 *   never blocked by pre-existing data); a model on a self-managed `none`
 *   harness warns softly (the stored value is ignored at dispatch); a model
 *   absent from the harness's catalog right now warns softly.
 * @example await validateDefaultModelCombination({ defaultModel: "a::b::c::d", harness: "pi", fromPayload: true }) => { error: "…malformed…", warnings: [] }
 * @param {Object} [opts]
 * @param {string} [opts.defaultModel] - The default model under validation.
 * @param {string} [opts.harness] - The effective harness id (`""` = follow the server default).
 * @param {boolean} [opts.fromPayload] - True when the ref arrives in this save's payload (stored re-checks warn softly).
 * @param {Object} [deps]
 * @param {Function} [deps.modelSelectionFor] - `(harnessId) => "none"|"list"` (defaults to the harness registry).
 * @param {Function} [deps.modelIdsFor] - `(harnessId) => Promise<Set<string>|null>` catalog probe (defaults to `defaultModelIdsFor`).
 * @param {Function} [deps.resolveAliasDefault] - `() => truthy when the project-default alias resolves` (peek; required for alias-harness checks).
 * @param {Function} [deps.reasoningLevelsFor] - `(harnessId) => string[]|null` advertised levels (defaults to the harness registry).
 * @returns {Promise<{error: string|null, warnings: string[]}>} The hard error and soft warnings.
 ***/
export async function validateDefaultModelCombination(
	{ defaultModel, harness, fromPayload = false } = {},
	{
		modelSelectionFor = harnessModelSelection,
		modelIdsFor = defaultModelIdsFor,
		resolveAliasDefault = null,
		reasoningLevelsFor = harnessReasoningLevels,
	} = {},
) {
	const warnings = [];
	const model =
		typeof defaultModel === "string" ? defaultModel.trim() : "";
	if (!model || model === "default") return { error: null, warnings };
	const harnessId = typeof harness === "string" ? harness.trim() : "";
	if (harnessId === "alias") {
		// The default names an alias, not a model: grammar shape does not
		// apply — an unresolvable name warns softly, never blocks.
		let resolved = true;
		if (typeof resolveAliasDefault === "function") {
			try {
				resolved = Boolean(await resolveAliasDefault());
			} catch {
				resolved = true;
			}
		}
		if (!resolved) {
			warnings.push(
				`project default alias "${model}" does not resolve to any target — ` +
					`runs fall back to the built-in default. Fix it in Settings › Model Aliases.`,
			);
		}
		return { error: null, warnings };
	}
	if (harnessId && modelSelectionFor(harnessId) === "none") {
		warnings.push(
			`project harness "${harnessId}" manages its own model — the stored ` +
				`default model "${model}" is ignored at dispatch. Clear it in Settings.`,
		);
		return { error: null, warnings };
	}
	if (validateModelRefShape(model) === null) {
		const message =
			`project defaultModel "${model}" is a malformed model ref — use ` +
			`"harness::provider::id", "provider::id", or a bare id`;
		if (fromPayload) return { error: message, warnings };
		warnings.push(`${message} (stored value kept)`);
		return { error: null, warnings };
	}
	// Reasoning-level enforcement (hard on payload saves, soft on stored).
	const parsedDefault = parseModelKey(model);
	if (parsedDefault?.form === "harnessReasoning") {
		const level = parsedDefault.reasoning;
		const allowedHarnessId = harnessId || parsedDefault.harness;
		const advertised = reasoningLevelsFor(allowedHarnessId);
		const levelMessage =
			`project defaultModel "${model}" is not supported: ` +
			`reasoning level "${level}" is not supported by harness "${allowedHarnessId}"`;
		if (checkReasoningLevelText({ level })) {
			if (fromPayload) {
				return {
					error: `project defaultModel "${model}" is a malformed model ref — use "harness::provider::id", "provider::id", or a bare id`,
					warnings,
				};
			}
			warnings.push(
				`project defaultModel "${model}" is a malformed model ref — use "harness::provider::id", "provider::id", or a bare id (stored value kept)`,
			);
			return { error: null, warnings };
		}
		if (!Array.isArray(advertised)) {
			if (fromPayload) {
				return {
					error: `project defaultModel "${model}" carries reasoning level "${level}" but harness "${allowedHarnessId}" does not support adjustable reasoning`,
					warnings,
				};
			}
			warnings.push(
				`project defaultModel "${model}" carries reasoning level "${level}" but harness "${allowedHarnessId}" does not support adjustable reasoning (stored value kept)`,
			);
			return { error: null, warnings };
		}
		if (!advertised.includes(level)) {
			if (fromPayload) return { error: levelMessage, warnings };
			warnings.push(`${levelMessage} (stored value kept)`);
			return { error: null, warnings };
		}
	}
	if (modelSelectionFor(harnessId) !== "list") return { error: null, warnings };
	let ids = null;
	try {
		ids = await modelIdsFor(harnessId);
	} catch {
		ids = null;
	}
	if (!ids) return { error: null, warnings };
	if (!modelRefMatchesIds(model, ids)) {
		warnings.push(
			`project defaultModel "${model}" is not in the "${harnessId || "default"}" ` +
				`harness's model catalog right now — runs fall back at dispatch if it is ` +
				`still missing then`,
		);
	}
	return { error: null, warnings };
}

/***
 * MARK: sanitizeAliasTargetModels
 * @description Blanks the model on every `none`-harness target of normalized
 *   alias records (legacy load-path defense: rows saved before the API
 *   refusal existed). List/unknown-harness targets pass through untouched.
 *   Never mutates its input — returns fresh records with the legacy
 *   `harness`/`model` mirror recomputed from the (possibly blanked) first
 *   target — plus the list of dropped models for the one-line load warning.
 * @example sanitizeAliasTargetModels([{ name: "w", harness: "muse", model: "g::m", targets: [{ harness: "muse", model: "g::m", percent: 100 }] }]).aliases => [{ name: "w", harness: "muse", model: "", targets: [{ harness: "muse", model: "", percent: 100 }] }]
 * @param {Array} aliases - Normalized alias records.
 * @param {Object} [opts]
 * @param {Function} [opts.modelSelectionFor] - `(harnessId) => "none"|"list"` (defaults to the harness registry).
 * @returns {{aliases: Array, dropped: Array<{alias: string, harness: string, model: string}>}} Clean records and the dropped models.
 ***/
export function sanitizeAliasTargetModels(
	aliases,
	{ modelSelectionFor = harnessModelSelection } = {},
) {
	const list = Array.isArray(aliases) ? aliases : [];
	const dropped = [];
	const clean = list.map((entry) => {
		const name = normalizeAliasName(entry?.name);
		const targets = getAliasTargets(entry).map((target) => {
			const model =
				typeof target.model === "string" ? target.model.trim() : "";
			if (model && modelSelectionFor(target.harness) === "none") {
				dropped.push({ alias: name, harness: target.harness, model });
				return { ...target, model: "" };
			}
			return { ...target };
		});
		return {
			name,
			harness: targets[0]?.harness ?? "",
			model: targets[0]?.model ?? "",
			targets,
		};
	});
	return { aliases: clean, dropped };
}
