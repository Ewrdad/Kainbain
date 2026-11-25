/***
 * MARK: cleanSingleLineText
 * @description Turns untrusted text (a runner-supplied interrupt reason, a
 *   resume-marker field) into one safe line for a history or timeline
 *   string. Task history persists as one `- timestamp: action` line per
 *   entry, so an embedded newline would silently drop the rest of the line
 *   on reload — or forge a new entry — which is why this trims, collapses
 *   every whitespace run (newlines, tabs, repeats) to one space, and caps
 *   the length. Never throws and never returns a non-string: anything
 *   unusable (missing, non-string, blank, bad cap) reads as "".
 * @example cleanSingleLineText({ text: 'socket hangup' }) => 'socket hangup'
 * @example cleanSingleLineText({ text: '  spaced   out  ' }) => 'spaced out'
 * @example cleanSingleLineText({ text: 'abcdef', maxLength: 4 }) => 'abcd'
 * @example cleanSingleLineText({ text: null }) => ''
 * @param {Object} [args] - Labeled input.
 * @param {*} [args.text] - The untrusted text to clean.
 * @param {number} [args.maxLength=500] - Kept length cap (the pre-existing
 *   interrupt-reason budget); missing or bad values fall back to it.
 * @returns {string} One trimmed line, at most maxLength chars, or "" when unusable.
 ***/
export function cleanSingleLineText({ text, maxLength = 500 } = {}) {
	const cap = Number.isInteger(maxLength) && maxLength > 0 ? maxLength : 500;
	if (typeof text !== "string") return "";
	const collapsed = text.trim().replace(/\s+/g, " ");
	if (!collapsed) return "";
	// A cap that lands on a space would leave a trailing space, so trim
	// again after the cut ("ab cd" capped at 3 is "ab", not "ab ").
	return collapsed.slice(0, cap).trim();
}
