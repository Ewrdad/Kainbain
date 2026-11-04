/***
 * MARK: skillConditionals
 * @description Pure, runtime-agnostic conditional sections for skill prompt
 *   bodies. A block wrapped in `{{#if key}} … {{/if}}` renders its inner text
 *   only when `key` is truthy in the layered keyword map; otherwise the whole
 *   block (markers included) is removed before keyword substitution runs, so
 *   a falsy section can never leak placeholder tokens into the agent prompt.
 *
 *   Truthiness is deliberately narrow: missing, empty, whitespace-only, and
 *   the literal value `"none"` (any case) are falsy — everything else renders.
 *   The `question-me` skill uses this so `imageGen: none` (the default) drops
 *   the image-question section byte-cleanly while any provider id keeps it.
 *
 *   Malformed markers (an opener without a closer, or an empty key) are
 *   preserved verbatim, honouring the skill engine's unknown-`{{...}}`
 *   guarantee; nesting composes by resolving innermost blocks first.
 *
 * @example renderSkillConditionals('a{{#if k}}b{{/if}}c', { k: 'x' }) => 'abc'
 ***/

const MAX_CONDITIONAL_PASSES = 25;

/***
 * MARK: isTruthySkillConditionalValue
 * @description Whether one layered keyword value renders an `{{#if key}}`
 *   block: any non-empty string except `"none"` (case-insensitive). Missing,
 *   empty, and whitespace-only values are falsy.
 * @example isTruthySkillConditionalValue('muse') => true
 * @example isTruthySkillConditionalValue('none') => false
 * @param {*} value - Raw keyword value from the layered map.
 * @returns {boolean}
 ***/
export const isTruthySkillConditionalValue = (value) => {
	if (value === undefined || value === null) return false;
	const text = String(value).trim();
	if (text === "") return false;
	return text.toLowerCase() !== "none";
};

/***
 * MARK: renderSkillConditionals
 * @description Resolves every well-formed `{{#if key}} … {{/if}}` block in
 *   skill text against the layered keyword map. Inputs without a conditional
 *   opener return byte-identical (same reference when unchanged); malformed
 *   blocks pass through untouched.
 * @example renderSkillConditionals('a{{#if k}}b{{/if}}c', {}) => 'ac'
 * @param {string} text - Raw skill text (context + body).
 * @param {Object} [keywordMap] - Layered keyword values.
 * @returns {string}
 ***/
export const renderSkillConditionals = (text, keywordMap = {}) => {
	if (typeof text !== "string" || text === "") {
		return typeof text === "string" ? text : "";
	}
	if (!text.includes("{{#if")) return text;
	const map =
		keywordMap && typeof keywordMap === "object" ? keywordMap : {};
	let result = text;
	// Innermost-first passes: each pass only touches blocks whose inner text
	// holds no further opener, so nesting resolves from the inside out and
	// an unclosed opener never matches (and is therefore preserved).
	for (let pass = 0; pass < MAX_CONDITIONAL_PASSES; pass += 1) {
		const pattern =
			/\{\{#if\s+([^}/]+?)\}\}((?:(?!\{\{#if[\s}])[\s\S])*?)\{\{\/if\}\}/g;
		if (!pattern.test(result)) break;
		pattern.lastIndex = 0;
		result = result.replace(pattern, (match, rawKey, inner) => {
			const key = String(rawKey || "").trim();
			if (!key) return match;
			/* eslint-disable-next-line security/detect-object-injection -- key is trimmed marker text guarded by hasOwnProperty */
			const value = Object.prototype.hasOwnProperty.call(map, key)
				? map[key]
				: undefined;
			return isTruthySkillConditionalValue(value) ? inner : "";
		});
	}
	return result;
};
