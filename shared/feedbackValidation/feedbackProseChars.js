// Domain: The Work — submit-time human-feedback validation (shared single
// owner). Counts the visible prose in a feedback draft: image markup is
// dropped entirely (alt text is fallback, not prose), plain-link markup
// keeps its link text (rendered words the human wrote), destinations are
// dropped. The match grammar is the same pattern `extractAssetRefs` scans,
// so prose measurement can never drift from ref detection.

/***
 * MARK: feedbackProseChars
 * @description Counts visible prose characters (whitespace excluded) in a
 *   markdown draft after removing image/link markup. Total on untrusted
 *   input: non-strings read as zero prose.
 * @example feedbackProseChars('Fix the retry path') => 15
 * @example feedbackProseChars('![shot](assets/shot.png)') => 0
 * @example feedbackProseChars('[see this](assets/a.png)') => 7
 * @param {string} markdown - Draft text to measure.
 * @returns {number} Non-whitespace prose characters outside markup.
 ***/
export function feedbackProseChars(markdown) {
	if (!markdown || typeof markdown !== "string") return 0;
	// Same grammar as extractAssetRefs: the `<...>` alternative first so
	// angle destinations holding parens capture whole.
	const pattern = /!?\[([^\]]*)\]\((<[^>\n]+>|[^)]+)\)/g;
	const prose = markdown.replace(pattern, (match, linkText) =>
		match.startsWith("!") ? " " : ` ${linkText || ""} `,
	);
	return prose.replace(/\s/g, "").length;
}
