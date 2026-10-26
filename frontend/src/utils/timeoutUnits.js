/***
 * MARK: timeoutUnits
 * @description Presentation-layer unit conversion for timeout fields. Storage,
 *   API payloads, and backend resolution stay in milliseconds (or seconds for
 *   the harness draft); only the rendered value and the parsed input pass
 *   through here, so execution behavior is unchanged.
 *   Fail-safe contract: no function in this module ever returns NaN. Blank
 *   stays blank ('' = "follow the default"), unparseable input parses back to
 *   blank rather than poisoning the draft, and the backend treats blank,
 *   zero, and negative stored values as "use the default".
 * @example msToMinutes(1800000) => 30; minutesToMs('1.5') => 90000
 ***/

const MS_PER_MINUTE = 60000;
const SECS_PER_MINUTE = 60;
// Trim float noise (e.g. 100000ms -> 1.666666...min) to 6 decimal places so
// legacy values display exactly and round-trip without drift.
const DISPLAY_PRECISION = 1e6;

function trimDisplay(value) {
  return Math.round(value * DISPLAY_PRECISION) / DISPLAY_PRECISION;
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

/***
 * MARK: msToMinutes
 * @description Converts a stored millisecond timeout to minutes for display.
 *   Blank stays blank so empty still means "follow the default".
 * @example msToMinutes(90000) => 1.5
 * @param {string|number|null|undefined} ms - Stored timeout in milliseconds.
 * @returns {number|string} Minutes for display, or '' when unset.
 ***/
export function msToMinutes(ms) {
  if (isBlank(ms)) return '';
  const num = Number(ms);
  if (!Number.isFinite(num)) return '';
  return trimDisplay(num / MS_PER_MINUTE);
}

/***
 * MARK: minutesToMs
 * @description Parses an edited minute value back to whole milliseconds for
 *   persistence. Blank stays blank so clearing still unsets the override;
 *   unparseable input (letters, '-', '.', 'Infinity', ...) also parses to
 *   blank instead of NaN so a mid-typing draft can never corrupt storage.
 *   Negative input is preserved (the backend falls back to the default),
 *   never clamped, so the field keeps showing what the user typed.
 * @example minutesToMs('1.5') => 90000
 * @param {string|number|null|undefined} minutes - Edited value in minutes.
 * @returns {number|string} Whole milliseconds, or '' when blank/unparseable.
 ***/
export function minutesToMs(minutes) {
  if (isBlank(minutes)) return '';
  const raw = String(minutes).trim();
  if (raw === '') return '';
  const num = Number(raw);
  if (!Number.isFinite(num)) return '';
  return Math.round(num * MS_PER_MINUTE);
}

/***
 * MARK: secsToMinutes
 * @description Converts a stored seconds timeout (harness draft) to minutes
 *   for display. Blank stays blank.
 * @example secsToMinutes(600) => 10
 * @param {string|number|null|undefined} secs - Stored timeout in seconds.
 * @returns {number|string} Minutes for display, or '' when unset.
 ***/
export function secsToMinutes(secs) {
  if (isBlank(secs)) return '';
  const num = Number(secs);
  if (!Number.isFinite(num)) return '';
  return trimDisplay(num / SECS_PER_MINUTE);
}

/***
 * MARK: minutesToSecs
 * @description Parses an edited minute value back to whole seconds for the
 *   harness draft. Blank stays blank; unparseable input parses to blank
 *   instead of NaN (same fail-safe contract as minutesToMs).
 * @example minutesToSecs('1.5') => 90
 * @param {string|number|null|undefined} minutes - Edited value in minutes.
 * @returns {number|string} Whole seconds, or '' when blank/unparseable.
 ***/
export function minutesToSecs(minutes) {
  if (isBlank(minutes)) return '';
  const raw = String(minutes).trim();
  if (raw === '') return '';
  const num = Number(raw);
  if (!Number.isFinite(num)) return '';
  return Math.round(num * SECS_PER_MINUTE);
}
