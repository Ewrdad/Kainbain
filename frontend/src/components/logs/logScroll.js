/**
 * MARK: logScroll
 * @description Pure, layout-free helpers for the LogViewer follow-scroll
 *   (stick-to-bottom) decision. Keeping the decision pure makes it unit-
 *   testable in jsdom, where the log container reports zero geometry.
 *
 *   Contract:
 *   - Follow-scroll engages ONLY when the log content actually overflows the
 *     visible viewport (`scrollHeight > clientHeight + epsilon`) AND the
 *     user is already at/near the bottom (`stickToBottom`).
 *   - When the content is shorter than the viewport nothing is scrolled:
 *     the log stays at the top and remains visible (the mobile "jumped past
 *     the logs" defect).
 *   - A user who scrolled up to read history is not yanked to the bottom.
 *
 *   Thresholds are recorded here so they are not magic numbers in the
 *   component: NEAR_BOTTOM_PX ~ 32px (one short line of head-room) and
 *   OVERFLOW_EPSILON_PX ~ 1px to absorb mobile browser chrome / sub-pixel
 *   layout jitter.
 */

/** Distance (px) from the bottom that still counts as "stuck to bottom". */
export const STICK_TO_BOTTOM_THRESHOLD_PX = 32;

/** Tolerance (px) for the overflow comparison. */
export const OVERFLOW_EPSILON_PX = 2;

/** Default threshold exported for callers that want the stock value. */
export const NEAR_BOTTOM_THRESHOLD_PX = STICK_TO_BOTTOM_THRESHOLD_PX;

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/***
 * MARK: isNearBottomPure
 * @description True when `scrollTop` is within `thresholdPx` of the bottom.
 *   Defensive: NaN / missing inputs resolve to "not near bottom" so callers
 *   fail safe (no programmatic scroll) instead of scrolling.
 ***/
export function isNearBottom(
  { scrollTop, scrollHeight, clientHeight },
  thresholdPx = STICK_TO_BOTTOM_THRESHOLD_PX,
) {
  const st = toFinite(scrollTop, NaN);
  const sh = toFinite(scrollHeight, NaN);
  const ch = toFinite(clientHeight, NaN);
  if (!Number.isFinite(st) || !Number.isFinite(sh) || !Number.isFinite(ch)) return false;
  if (sh <= 0 || ch <= 0) return true; // empty/zero layout: treat as stuck so we never fight the user
  const distance = sh - (st + ch);
  return distance <= thresholdPx;
}

/***
 * MARK: contentOverflows
 * @description True when the content is taller than the viewport by more than
 *   the overflow epsilon.
 ***/
export function contentOverflows({ scrollHeight, clientHeight }, epsilon = OVERFLOW_EPSILON_PX) {
  const sh = toFinite(scrollHeight, 0);
  const ch = toFinite(clientHeight, 0);
  return sh > ch + epsilon;
}

/***
 * MARK: shouldFollowScroll
 * @description Pure decision: follow-scroll engages iff content overflows AND
 *   the user is already near the bottom (stick-to-bottom). `thresholdPx` and
 *   `epsilon` are optional overrides.
 ***/
export function shouldFollowScroll({ scrollTop, scrollHeight, clientHeight, thresholdPx } = {}) {
  const t = thresholdPx == null ? STICK_TO_BOTTOM_THRESHOLD_PX : thresholdPx;
  if (!contentOverflows({ scrollHeight, clientHeight })) return false;
  return isNearBottom({ scrollTop, scrollHeight, clientHeight }, t);
}

// Aliases for alternate naming used by callers / tests.
export const shouldAutoScroll = shouldFollowScroll;
export const stickToBottom = shouldFollowScroll;
export const isStickToBottom = shouldFollowScroll;
export const nearBottom = isNearBottom;
export default shouldFollowScroll;

// Extra naming aliases for compatibility with callers/tests.
export const shouldFollow = shouldFollowScroll;
export const shouldStick = shouldFollowScroll;
export const shouldAutoScrollFollow = shouldFollowScroll;
export const isStuckToBottom = shouldFollowScroll;
export const useStickToBottom = shouldFollowScroll;
