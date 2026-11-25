// Domain: The Work — submit-time human-feedback validation (shared single
// owner). Decides whether a feedback draft is image-only: it carries visual
// content (image markup anywhere, or an `assets/*` reference) but its
// visible prose stays below the bar, so the receiving agent would work
// blind. Plain-text drafts — however short — are never image-only.
import { extractAssetRefs } from "../taskAssetRefs/index.js";
import { MIN_FEEDBACK_PROSE_CHARS } from "./feedbackValidationConstants.js";
import { feedbackProseChars } from "./feedbackProseChars.js";

/***
 * MARK: isImageOnlyFeedback
 * @description Whether a feedback draft carries images without an adequate
 *   written description: visual markup is present (any `![alt](…)` image or
 *   any `assets/*` reference, attached or not) while visible prose stays
 *   below `minProseChars`. Total on untrusted input: non-strings read as
 *   not image-only (existing emptiness guards own the empty case).
 * @example isImageOnlyFeedback('![shot](assets/shot.png)') => true
 * @example isImageOnlyFeedback('The retry path drops the error — see ![shot](assets/shot.png)') => false
 * @example isImageOnlyFeedback('fix it') => false
 * @param {string} markdown - Draft text to classify.
 * @param {Object} [opts]
 * @param {number} [opts.minProseChars] - Prose bar (default `MIN_FEEDBACK_PROSE_CHARS`).
 * @returns {boolean} True when a written description is required first.
 ***/
export function isImageOnlyFeedback(markdown, { minProseChars } = {}) {
	if (!markdown || typeof markdown !== "string") return false;
	const bar =
		Number.isFinite(minProseChars) && minProseChars > 0
			? Math.floor(minProseChars)
			: MIN_FEEDBACK_PROSE_CHARS;
	// Same match grammar as extractAssetRefs, image-form only.
	const hasImageMarkup = /!\[[^\]]*\]\((<[^>\n]+>|[^)]+)\)/.test(markdown);
	if (!hasImageMarkup && extractAssetRefs(markdown).length === 0) return false;
	return feedbackProseChars(markdown) < bar;
}
