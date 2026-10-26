/***
 * MARK: skillInjection
 * @description Pure prompt-section builder that turns a stage's `skills` array into
 *   curated-prompt markdown sections. This is the seam that delivers stage skills to
 *   a stage agent in one of two modes:
 *
 *   - `direct`  — full skill body (with KB_config `context` prepended and every
 *     keyword resolved) is injected into the prompt; the agent always sees it.
 *   - `option`  — only a compact manifest entry (name + description + absolute
 *     SKILL.md path) is injected; the agent may read/invoke the file itself.
 *
 * Guarantees:
 *   - With `skills` absent or empty the returned `sections` array is empty, so a
 *     curated prompt for a legacy project is byte-identical to before this module
 *     existed (locked by api/promptCuration.skills.contract.test.js).
 *   - Unknown `{{...}}` patterns are preserved (never mangled, never removed).
 *   - Total injected skill text is capped at `maxChars`; skills that do not fit are
 *     omitted with a visible `[skill <name> omitted: size cap]` marker, processed in
 *     stage-list order (earlier entries win the budget).
 *
 * @example buildSkillsPromptSections({ skills: stage.skills, interpolationContext, maxChars, loadSkill })
 ***/

import path from "node:path";
import { normalizeSkillMode, skillPathForName } from "./skillsRegistry.js";

/***
 * MARK: resolveSkillKeywordMap
 * @description Builds the layered keyword map for one skill:
 *   stage.skills[i].config[key] > KB_config.keywords[key].value. Values keep raw
 *   `{{...}}` templates at this point (built-ins are resolved lazily at substitution
 *   time so precedence stays consistent).
 * @example resolveSkillKeywordMap({ keywords: { a: '1' } }, { a: '2' }) => { a: '2' }
 * @param {Object} [skillKeywords] - KB_config keywords (raw values).
 * @param {Object} [stageConfig] - Per-stage overrides from stage.skills[i].config.
 * @returns {Object} Plain map of raw keyword values.
 ***/
export function resolveSkillKeywordMap(skillKeywords = {}, stageConfig = {}) {
	const map = {};
	const sources = [
		skillKeywords && typeof skillKeywords === "object" ? skillKeywords : {},
		stageConfig && typeof stageConfig === "object" && !Array.isArray(stageConfig)
			? stageConfig
			: {},
	];
	/* eslint-disable security/detect-object-injection -- keys come from Object.entries of validated plain objects */
	for (const source of sources) {
		for (const [key, value] of Object.entries(source)) {
			// Tolerant scalar coercion: strings/numbers/booleans become keyword values;
			// objects and arrays are ignored (never stringified into "[object Object]").
			if (typeof value === "string") {
				map[key] = value;
			} else if (
				(typeof value === "number" && Number.isFinite(value)) ||
				typeof value === "boolean"
			) {
				map[key] = String(value);
			}
		}
	}
	/* eslint-enable security/detect-object-injection */
	return map;
}

/***
 * MARK: applySkillKeywords
 * @description Applies the layered keyword map to skill text. Custom keys are
 *   substituted first (so they win over built-ins), then the built-in interpolation
 *   runs for the rest, leaving unknown `{{...}}` patterns untouched.
 * @example applySkillKeywords('Target: {{targetStage}} for {{project}}', { targetStage: 'Intake' }, ctx)
 * @param {string} text
 * @param {Object} keywordMap - Raw custom keyword values (may themselves contain {{built-ins}}).
 * @param {Object} interpolationContext - Context for interpolatePromptKeywords.
 * @returns {string}
 ***/
export function applySkillKeywords(
	text,
	keywordMap = {},
	interpolationContext = {},
) {
	if (typeof text !== "string" || text === "") return "";
	const keys = Object.keys(keywordMap);
	let result = text;
	if (keys.length > 0) {
		// One ordered pass: custom keys first, built-ins after, unknown preserved.
		/* eslint-disable security/detect-object-injection -- guarded by hasOwnProperty above */
		result = result.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
			const key = rawKey.trim();
			if (Object.prototype.hasOwnProperty.call(keywordMap, key)) {
				return keywordMap[key];
			}
			return match;
		});
		/* eslint-enable security/detect-object-injection */
	}
	// Built-ins + custom re-check (custom values may reference built-ins like {{project}}).
	return interpolateWithSkillKeywords(result, keywordMap, interpolationContext);
}

/** Lazy import seam so this pure module stays test-friendly (avoids a cycle with promptCuration). */
let _interpolateFn = null;

/***
 * MARK: setInterpolatePromptKeywords
 * @description Wires the keyword interpolation implementation (dependency inversion
 *   to avoid an import cycle with promptCuration.js). Called once by promptCuration.js.
 * @param {Function} fn
 ***/
export function setInterpolatePromptKeywords(fn) {
	_interpolateFn = fn;
}

/***
 * MARK: interpolateWithSkillKeywords
 * @description Runs the built-in prompt-keyword interpolation with the custom skill
 *   map attached; custom keys take precedence over built-ins, unknown keys preserved.
 * @param {string} text
 * @param {Object} keywordMap
 * @param {Object} interpolationContext
 * @returns {string}
 ***/
function interpolateWithSkillKeywords(text, keywordMap, interpolationContext) {
	if (_interpolateFn) {
		return _interpolateFn(text, {
			...interpolationContext,
			customKeywords: keywordMap,
		});
	}
	return text;
}

/***
 * MARK: resolveSkillMode
 * @description Resolves the delivery mode for a stage-skill attachment:
 *   explicit stage mode > skill KB_config defaults.mode > 'direct'.
 * @example resolveSkillMode({ mode: 'option' }, { defaults: { mode: 'direct' } }) => 'option'
 * @param {Object} [stageSkill] - The stage.skills[i] attachment.
 * @param {Object} [skillConfig] - The loaded KB_config.
 * @returns {'direct'|'option'}
 ***/
export function resolveSkillMode(stageSkill = {}, skillConfig = {}) {
	const requested =
		stageSkill && typeof stageSkill === "object" ? stageSkill.mode : undefined;
	if (requested) return normalizeSkillMode(requested, "direct");
	const defaultsMode =
		skillConfig &&
		typeof skillConfig === "object" &&
		skillConfig.defaults &&
		typeof skillConfig.defaults === "object"
			? skillConfig.defaults.mode
			: undefined;
	if (defaultsMode) return normalizeSkillMode(defaultsMode, "direct");
	return "direct";
}

/***
 * MARK: buildDirectSkillBlock
 * @description Builds the markdown block for one direct-injected skill:
 *   optional KB_config context, then the resolved body under a `## <name>` heading.
 *   Exported for tests.
 * @param {Object} opts
 * @param {Object} opts.skill - Loaded skill descriptor ({ name, body, config, ... }).
 * @param {Object} [opts.stageSkill] - Attachment (mode/config overrides).
 * @param {Object} interpolationContext
 * @returns {string}
 ***/
export function buildDirectSkillBlock({
	skill,
	stageSkill,
	interpolationContext,
}) {
	const keywordMap = resolveSkillKeywordMap(
		skill.keywords,
		stageSkill?.config || {},
	);
	const contextText =
		skill.config && typeof skill.config.context === "string"
			? skill.config.context.trim()
			: "";
	const bodyText = typeof skill.body === "string" ? skill.body : "";
	const resolved = applySkillKeywords(
		contextText ? `${contextText}\n\n${bodyText}` : bodyText,
		keywordMap,
		interpolationContext,
	);
	const heading = skill.name || "skill";
	return `## ${heading}\n${resolved.trim()}`;
}

/***
 * MARK: buildOptionManifestEntry
 * @description Builds one compact manifest entry for an option-mode skill:
 *   name, description, and the absolute SKILL.md path with an invocation hint.
 *   Never includes the skill body (that is the whole point of option mode).
 * @param {Object} opts
 * @param {Object} opts.skill - Loaded skill descriptor.
 * @returns {string}
 ***/
export function buildOptionManifestEntry({ skill }) {
	const name = skill.name || "skill";
	const description = (skill.description || "").trim();
	const skillPath =
		typeof skill.path === "string" ? path.resolve(skill.path) : "";
	const lines = [`### ${name}`];
	if (description) {
		lines.push(description);
	}
	lines.push(
		`Skill file: \`${skillPath}\` — Read this file with your file tools if you need it; follow its instructions.`,
	);
	return lines.join("\n");
}

/***
 * MARK: buildSkillsPromptSections
 * @description Composes the skills prompt sections for a stage. Direct skills land
 *   under `# Stage Skills`, option skills under `# Available Skills`. Skills are
 *   processed in stage-list order; once the size cap is reached, later skills are
 *   omitted with a visible marker. Unknown/broken skills are reported in `omitted`.
 * @example const { sections, injected, omitted } = buildSkillsPromptSections({ skills, interpolationContext, maxChars, loadSkill })
 * @param {Object} opts
 * @param {Array<Object>} [opts.skills=[]] - The stage.skills attachments.
 * @param {Object} [opts.interpolationContext={}] - Task/project context for keyword resolution.
 * @param {number} [opts.maxChars=16000] - Total injected skill char cap.
 * @param {Function} [opts.loadSkill] - `(name) => skill descriptor | null`.
 * @returns {{ sections: string[], injected: Array<Object>, omitted: Array<Object>, usedChars: number }}
 ***/
export function buildSkillsPromptSections({
	skills = [],
	interpolationContext = {},
	maxChars = 16000,
	loadSkill,
} = {}) {
	const result = { sections: [], injected: [], omitted: [], usedChars: 0 };
	if (!Array.isArray(skills) || skills.length === 0) {
		return result; // No-op: byte-identical prompts for projects without skills.
	}
	if (typeof loadSkill !== "function") {
		return result;
	}

	// Tuples keep name+mode+text together so size-cap accounting can drop by index
	// instead of matching by content (two skills may render identical lengths).
	const prepared = [];

	for (const attachment of skills) {
		const name =
			attachment &&
			typeof attachment === "object" &&
			typeof attachment.name === "string"
				? attachment.name.trim()
				: "";
		if (!name) {
			result.omitted.push({ name: "", reason: "missing skill name" });
			continue;
		}

		const skill = loadSkill(name);
		if (!skill) {
			result.omitted.push({ name, reason: "skill not found in library" });
			continue;
		}
		if (skill.invalid) {
			result.omitted.push({
				name,
				reason: skill.error || "skill is invalid",
			});
			continue;
		}

		const mode = resolveSkillMode(attachment, skill.config);

		if (mode === "option") {
			prepared.push({ name, mode, text: buildOptionManifestEntry({ skill }) });
		} else {
			prepared.push({
				name,
				mode,
				text: buildDirectSkillBlock({
					skill,
					stageSkill: attachment,
					interpolationContext,
				}),
			});
		}
	}

	// Size cap: processed in stage-list order; entries that no longer fit are
	// omitted with a visible marker (earlier entries win the budget).
	const cap = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : 0;
	let used = 0;
	const kept = [];
	for (const item of prepared) {
		if (cap && used + item.text.length > cap) {
			result.omitted.push({ name: item.name, reason: "size cap" });
			continue;
		}
		used += item.text.length;
		kept.push(item);
		result.injected.push({
			name: item.name,
			mode: item.mode,
			chars: item.text.length,
		});
	}
	result.usedChars = used;

	const directOnly = kept.filter((item) => item.mode === "direct");
	const optionOnly = kept.filter((item) => item.mode === "option");

	if (directOnly.length > 0) {
		result.sections.push(
			`# Stage Skills\n${directOnly.map((item) => item.text).join("\n\n")}`,
		);
	}
	if (optionOnly.length > 0) {
		result.sections.push(
			`# Available Skills\nThe following optional skills are attached to this stage. Use one only if it is relevant to your current work.\n${optionOnly
				.map((item) => item.text)
				.join("\n\n")}`,
		);
	}

	// Mark omitted-by-cap skills inside the prompt so the agent understands why
	// an attached skill is not available this run.
	if (result.omitted.some((o) => o.reason === "size cap" && o.name)) {
		const markers = result.omitted
			.filter((o) => o.reason === "size cap" && o.name)
			.map((o) => `- [skill ${o.name} omitted: size cap]`)
			.join("\n");
		result.sections.push(
			`# Skill Budget\n${markers}\nAttached skills above the injection budget were omitted; they are not available this run.`,
		);
	}

	return result;
}

/***
 * MARK: estimateSkillInjectionChars
 * @description Best-effort char estimate for a stage's skills given a skill lookup
 *   (used by the UI budget readout; mirrors buildSkillsPromptSections accounting).
 * @param {Object} opts
 * @param {Array<Object>} opts.skills - stage.skills attachments.
 * @param {Function} opts.loadSkill
 * @param {number} [opts.maxChars=16000]
 * @returns {{ usedChars: number, maxChars: number }}
 ***/
export function estimateSkillInjectionChars({
	skills = [],
	loadSkill,
	maxChars = 16000,
}) {
	const { usedChars } = buildSkillsPromptSections({
		skills,
		interpolationContext: {},
		maxChars,
		loadSkill,
	});
	return { usedChars, maxChars };
}

/** Re-export for convenience so callers can resolve absolute paths uniformly. */
export { skillPathForName };
