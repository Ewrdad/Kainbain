/***
 * MARK: feedbackValidation (shared)
 * @description Single source of truth for submit-time human-feedback
 *   validation, shared verbatim by the frontend pre-check and the API's
 *   authoritative 422 shell. One file per function plus this single front
 *   file, following the shared/taskAssetRefs layout.
 ***/
export * from "./feedbackValidationConstants.js";
export * from "./feedbackProseChars.js";
export * from "./isImageOnlyFeedback.js";
export * from "./findMissingRefsAgainst.js";
export * from "./stripAssetRefs.js";
export * from "./validateHumanFeedback.js";
export * from "./formatFeedbackValidationError.js";
