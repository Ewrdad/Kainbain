// Domain: The Work — submit-time human-feedback validation (shared single
// owner). Caller-ready refusal text: every missing file is named, and the
// image-only case asks for the description. The API 422 body and the UI
// block render this same message, so reviewers read identical words from
// either shell.
import { MIN_FEEDBACK_PROSE_CHARS } from "./feedbackValidationConstants.js";

/***
 * MARK: formatFeedbackValidationError
 * @description Formats the refusal message for a failed feedback validation:
 *   the missing `assets/*` refs by name, and/or the missing-description
 *   request. A clean decision formats as "" (no message at all).
 * @example formatFeedbackValidationError({ missing: ['assets/gone.png'], imageOnly: false }) => 'Feedback references 1 file that is not attached: assets/gone.png. Attach the file or remove the reference before sending.'
 * @example formatFeedbackValidationError({ missing: [], imageOnly: false }) => ''
 * @param {Object} [decision] - `{ missing, imageOnly, minProseChars }` from `validateHumanFeedback`.
 * @returns {string} The refusal message, or "" when valid.
 ***/
export function formatFeedbackValidationError(decision = {}) {
	const missing = Array.isArray(decision?.missing)
		? decision.missing.filter((ref) => typeof ref === "string" && ref)
		: [];
	const bar =
		Number.isFinite(decision?.minProseChars) && decision.minProseChars > 0
			? Math.floor(decision.minProseChars)
			: MIN_FEEDBACK_PROSE_CHARS;
	const parts = [];
	if (missing.length > 0) {
		const count =
			missing.length === 1
				? "1 file that is"
				: `${missing.length} files that are`;
		parts.push(
			`Feedback references ${count} not attached: ${missing.join(", ")}. Attach the file or remove the reference before sending.`,
		);
	}
	if (decision?.imageOnly) {
		parts.push(
			`Feedback contains only images — add a short written description (at least ${bar} characters) explaining what the pictures show.`,
		);
	}
	return parts.join(" ");
}
