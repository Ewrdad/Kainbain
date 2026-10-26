/***
 * MARK: chatProgress helpers
 * @description Pure formatting/parsing helpers for long-running chat turns:
 *   turn-id generation, elapsed-time copy, and the bounded progress-tail
 *   idiom (mirroring the server's `truncateOutputTail` in
 *   `api/routes/retrospectiveChat.js` — the two packages cannot import
 *   each other, so the parity test below pins the shared shape). Chat turns
 *   run with no timeout, so there is deliberately no budget copy here.
 ***/

/** Character ceiling for the live progress tail (same idiom as the server's output tail). */
export const CHAT_PROGRESS_TAIL_MAX_CHARS = 2000;

/** Front-truncation marker for the progress tail (same marker as the server). */
export const CHAT_PROGRESS_TRUNCATED_MARKER = '[…truncated…]';

/***
 * MARK: truncateProgressTail
 * @description Bounds live progress text to a readable tail: text at or under
 *   the cap passes through; longer text keeps its most recent chars behind
 *   the front-truncation marker.
 * @example truncateProgressTail('short') => 'short'
 * @param {string} text - The accumulated progress text.
 * @param {number} [maxChars=CHAT_PROGRESS_TAIL_MAX_CHARS] - Total ceiling incl. marker.
 * @returns {string} The bounded tail ('' for non-string input).
 ***/
export function truncateProgressTail(text, maxChars = CHAT_PROGRESS_TAIL_MAX_CHARS) {
  if (typeof text !== 'string' || !text) return '';
  if (text.length <= maxChars) return text;
  const tailLen = maxChars - CHAT_PROGRESS_TRUNCATED_MARKER.length - 1;
  if (tailLen <= 0) return text.slice(-maxChars);
  return `${CHAT_PROGRESS_TRUNCATED_MARKER}\n${text.slice(-tailLen)}`;
}

/***
 * MARK: formatChatElapsed
 * @description Elapsed-turn copy for the working card: bare seconds under a
 *   minute, minutes+seconds beyond (long turns read as "12m 30s elapsed",
 *   not "750s elapsed").
 * @example formatChatElapsed(5) => '5s elapsed'
 * @example formatChatElapsed(90) => '1m 30s elapsed'
 * @param {number} totalSeconds - Elapsed seconds (>= 0).
 * @returns {string} The elapsed copy.
 ***/
export function formatChatElapsed(totalSeconds) {
  const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  if (secs < 60) return `${secs}s elapsed`;
  const minutes = Math.floor(secs / 60);
  return `${minutes}m ${secs % 60}s elapsed`;
}

/***
 * MARK: elapsedSecondsSince
 * @description Whole seconds elapsed since a turn's start timestamp (wall-clock
 *   ms): non-numeric/missing inputs return 0, future timestamps (clock skew)
 *   clamp to 0, otherwise returns floor((nowMs - startedAt) / 1000).
 * @example elapsedSecondsSince(Date.now() - 5000) => 5
 * @example elapsedSecondsSince(null) => 0
 * Failure modes: any non-numeric input (null, undefined, booleans,
 *   objects, ''), non-positive starts, or a now at/before start all
 *   return 0 — never NaN, never negative, never throwing.
 * @param {number|string} startedAt - Start timestamp in wall-clock ms.
 * @param {number|string} [nowMs=Date.now()] - Current wall-clock ms (injected for tests).
 * @returns {number} Whole seconds elapsed (>= 0).
 ***/
function toWallClockMs(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

export function elapsedSecondsSince(startedAt, nowMs = Date.now()) {
  const start = toWallClockMs(startedAt);
  const now = toWallClockMs(nowMs);
  if (!Number.isFinite(start) || !Number.isFinite(now) || start <= 0) return 0;
  if (now <= start) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

/***
 * MARK: newChatTurnId
 * @description Generates a unique id for one chat turn: the progress
 *   correlator (server tags `CHAT_PROGRESS` frames with it) and the storage
 *   descriptor key. Prefers `crypto.randomUUID`, degrading to a
 *   timestamp+random id where unavailable.
 * @example newChatTurnId() => 'turn-...' (unique per call)
 * @returns {string} A unique turn id (never empty).
 ***/
export function newChatTurnId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the timestamp fallback.
  }
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/***
 * MARK: readChatProgressEvent
 * @description Validates one inbound `CHAT_PROGRESS` payload: both `turnId`
 *   and `tail` must be non-empty strings, or the frame is ignored (never
 *   trusted blindly — a malformed frame must not blank the working card).
 * @example readChatProgressEvent({ turnId: 't', tail: 'hi' }) => { turnId: 't', tail: 'hi' }
 * @example readChatProgressEvent({ turnId: 't' }) => null
 * @param {unknown} payload - The raw WS payload.
 * @returns {{ turnId: string, tail: string } | null} The valid frame, or null.
 ***/
export function readChatProgressEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const { turnId, tail } = payload;
  if (typeof turnId !== 'string' || !turnId) return null;
  if (typeof tail !== 'string' || !tail) return null;
  return { turnId, tail };
}
