/***
 * MARK: serverErrorMessage
 * @description Extracts the operator-facing message from a failed `request()`:
 *   the JSON `{ error }` body the API sends, falling back to the raw error
 *   text and then the rejection message. Shared by every form that surfaces
 *   server validation inline (settings saves, project dialogs, skill flows)
 *   so a 400/409 always reads as the server's sentence, never a transport
 *   wrapper.
 * @example serverErrorMessage({ body: '{"error":"Taken"}' }) => 'Taken'
 * @example serverErrorMessage({ body: 'plain failure' }) => 'plain failure'
 * @example serverErrorMessage(new Error('down'), 'Fallback') => 'down'
 * @param {Error} err - Rejection from the shared request helper.
 * @param {string} [fallback] - Message when nothing usable is attached.
 * @returns {string}
 ***/
export function serverErrorMessage(err, fallback = 'Request failed') {
  const raw = err?.body;
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.error === 'string' && parsed.error) {
        return parsed.error;
      }
    } catch {
      return raw;
    }
  }
  return err?.message || fallback;
}
