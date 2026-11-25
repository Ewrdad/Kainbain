// Domain: The Work — submit-time human-feedback validation (shared single
// owner). The one decision both enforcement shells (UI pre-check, API 422)
// share: dangling `assets/*` refs and image-only drafts block, everything
// else passes through untouched.
import { MIN_FEEDBACK_PROSE_CHARS } from "./feedbackValidationConstants.js";
import { feedbackProseChars } from "./feedbackProseChars.js";
import { findMissingRefsAgainst } from "./findMissingRefsAgainst.js";
import { isImageOnlyFeedback } from "./isImageOnlyFeedback.js";

/***
 * MARK: validateHumanFeedback
 * @description Validates one human-feedback draft against the attached asset
 *   names: reports dangling `assets/*` refs and whether a written
 *   description is still missing. `strict: false` downgrades the verdict to
 *   advisory (`ok` stays true with findings reported) — the single
 *   block-vs-confirm switch both shells share, so softening the policy
 *   later is a one-flag change. Total on untrusted input.
 * @example validateHumanFeedback('Please add tests', []) => { ok: true, missing: [], imageOnly: false, proseChars: 14, minProseChars: 10 }
 * @example validateHumanFeedback('![a](assets/gone.png)', []).ok => false
 * @param {string} markdown - Draft text to validate.
 * @param {string[]} [presentNames] - Attached asset names to match against.
 * @param {Object} [opts]
 * @param {number} [opts.minProseChars] - Prose bar (default `MIN_FEEDBACK_PROSE_CHARS`).
 * @param {boolean} [opts.strict] - False downgrades to advisory (default true).
 * @returns {{ok: boolean, missing: string[], imageOnly: boolean, proseChars: number, minProseChars: number}} The decision.
 ***/
export function validateHumanFeedback(markdown, presentNames, opts = {}) {
	const { minProseChars, strict = true } = opts || {};
	const text = typeof markdown === "string" ? markdown : "";
	const bar =
		Number.isFinite(minProseChars) && minProseChars > 0
			? Math.floor(minProseChars)
			: MIN_FEEDBACK_PROSE_CHARS;
	const missing = findMissingRefsAgainst(text, presentNames);
	const imageOnly = isImageOnlyFeedback(text, { minProseChars: bar });
	const blocked = missing.length > 0 || imageOnly;
	return {
		ok: strict ? !blocked : true,
		missing,
		imageOnly,
		proseChars: feedbackProseChars(text),
		minProseChars: bar,
	};
}
