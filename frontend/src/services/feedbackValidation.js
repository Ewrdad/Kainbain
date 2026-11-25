// Domain: The Work — submit-time feedback validation (UI shell).
import { FEEDBACK_VALIDATION_CODE } from '../../../shared/feedbackValidation/index.js';

/***
 * MARK: parseFeedbackValidationError
 * @description Reads a failed submit's error for the API's 422
 *   feedback-validation refusal. Returns the server-authoritative finding
 *   (`{ missing, imageOnly }`) so the blocking dialog re-opens with the
 *   server-named files, or null for any other failure (which keeps its
 *   existing handling).
 * @example parseFeedbackValidationError({ status: 422, body: '{"code":"FEEDBACK_VALIDATION_FAILED","missing":[],"imageOnly":true}' }) => { missing: [], imageOnly: true }
 * @example parseFeedbackValidationError({ status: 409 }) => null
 * @param {Object} err - Rejection from the transport `request()` helper.
 * @returns {{missing: string[], imageOnly: boolean}|null} The finding, or null.
 ***/
export function parseFeedbackValidationError(err) {
  if (!err || err.status !== 422) return null;
  let body = err.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return null;
    }
  }
  if (!body || body.code !== FEEDBACK_VALIDATION_CODE) return null;
  const missing = Array.isArray(body.missing)
    ? body.missing
        .map((entry) => (typeof entry === 'string' ? entry : entry?.ref))
        .filter(Boolean)
    : [];
  return { missing, imageOnly: body.imageOnly === true };
}
