// Domain: The Work — submit-time human-feedback validation (shared single
// owner). The UI pre-check and the API 422 shell both decide through this
// module, so the two can never drift.

/***
 * MARK: MIN_FEEDBACK_PROSE_CHARS
 * @description Minimum visible prose characters (outside image/link markup)
 *   that image-carrying feedback must contain: a short note explaining what
 *   the pictures show, not an essay. Plain-text feedback without images is
 *   never measured against this bar.
 * @example MIN_FEEDBACK_PROSE_CHARS >= 1 => true
 ***/
export const MIN_FEEDBACK_PROSE_CHARS = 10;

/***
 * MARK: FEEDBACK_VALIDATION_CODE
 * @description Machine-readable `code` carried by the API's 422
 *   feedback-validation refusals, so UI shells can distinguish a missing-asset
 *   / image-only block (recovery dialog) from any other failure.
 * @example FEEDBACK_VALIDATION_CODE => 'FEEDBACK_VALIDATION_FAILED'
 ***/
export const FEEDBACK_VALIDATION_CODE = "FEEDBACK_VALIDATION_FAILED";
