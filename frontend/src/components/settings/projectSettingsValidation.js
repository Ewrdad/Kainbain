import { minutesToMs } from '../../utils/timeoutUnits';

/***
 * MARK: parseRetrySettings
 * @description Validates the Retry & Timeouts drafts into a save payload:
 *   blank drafts become null (clear = follow the global default), counts
 *   must be whole numbers >= 0 (0 disables that loop), timeout drafts are
 *   entered in minutes (decimals allowed, must be above 0) and persisted as
 *   whole milliseconds, and the tri-state switch maps default/enabled/
 *   disabled to null/true/false. Returns per-field errors keyed by draft
 *   name plus the payload (valid even when errors is non-empty — callers
 *   must check).
 * @example parseRetrySettings({ maxAutoIterations: '3', agentTimeoutMs: '', ... }) => { errors: {}, payload: { maxAutoIterations: 3, agentTimeoutMs: null, ... } }
 * @param {Object} drafts - Raw string drafts (timeout drafts in minutes) plus the tri-state switch value.
 * @returns {{ errors: Object, payload: Object }}
 ***/
export function parseRetrySettings(drafts) {
  const errors = {};
  const payload = {};
  /* eslint-disable security/detect-object-injection -- keys are compile-time constants at every parseCount/parseTimeout call below */
  const parseCount = (key, label) => {
    const raw = String(drafts[key] ?? '').trim();
    if (raw === '') {
      payload[key] = null;
      return;
    }
    if (!/^\d+$/.test(raw)) {
      errors[key] = `${label} must be a whole number (0 disables, blank follows the default).`;
      return;
    }
    payload[key] = Number(raw);
  };
  const parseTimeout = (key, label) => {
    const raw = String(drafts[key] ?? '').trim();
    if (raw === '') {
      payload[key] = null;
      return;
    }
    // Positive decimal minutes, no exponents or hex (same `^\d+$` pieces
    // the count parser uses, so no new lint surface).
    const parts = raw.split('.');
    const isDecimalMinutes = parts.length <= 2 && parts.every((part) => /^\d+$/.test(part));
    if (!isDecimalMinutes || Number(raw) <= 0) {
      errors[key] = `${label} must be a number of minutes above 0 (blank follows the default).`;
      return;
    }
    payload[key] = minutesToMs(raw);
  };
  parseCount('maxAutoIterations', 'Max auto-iterations');
  parseCount('maxTransientRetries', 'Max transient retries');
  payload.autoIterationEnabled =
    drafts.autoIterationEnabled === 'enabled'
      ? true
      : drafts.autoIterationEnabled === 'disabled'
        ? false
        : null;
  parseTimeout('agentTimeoutMs', 'Agent stage timeout');
  parseTimeout('ciTimeoutMs', 'CI stage timeout');
  parseTimeout('mergeTimeoutMs', 'Merge stage timeout');
  /* eslint-enable security/detect-object-injection */
  return { errors, payload };
}
