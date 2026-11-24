/***
 * MARK: CAPACITY_REFUSAL_HIDE_MS
 * @description How long a task is hidden from the runner that just
 *   capacity-refused it (task 3b82f6ae, survey q4): the backend cannot
 *   direct-assign, so instead the fleet scan omits that one task from that
 *   one runner's listing for this window (~2min), giving a different runner
 *   the chance to claim it.
 * @example CAPACITY_REFUSAL_HIDE_MS => 120000
 ***/
export const CAPACITY_REFUSAL_HIDE_MS = 2 * 60_000;

/***
 * MARK: isCapacityRefusalHidden
 * @description Whether `task` is currently hidden from `runnerId` because
 *   that runner capacity-refused it less than CAPACITY_REFUSAL_HIDE_MS ago
 *   (task 3b82f6ae). False for any other runner, after the window, with no
 *   recorded refusal, or when no runner id is known — the hide is a
 *   preference, never a park. Garbage timestamps collapse to the epoch,
 *   which expires the window immediately (fail-open, same collapse policy
 *   as `interruptionTimestampMs`).
 * @param {Object} task - Task carrying `lastCapacityRefusal: { runnerId, at }`.
 * @param {string|null} runnerId - The requesting runner (fleet scan opts).
 * @param {number} [nowMs=Date.now()] - Clock in ms since epoch (tests inject).
 * @returns {boolean}
 * @example isCapacityRefusalHidden({ lastCapacityRefusal: { runnerId: "r1", at: "2026-09-24T10:00:00.000Z" } }, "r1", Date.parse("2026-09-24T10:01:00.000Z")) => true
 * @example isCapacityRefusalHidden({ lastCapacityRefusal: { runnerId: "r1", at: "2026-09-24T10:00:00.000Z" } }, "r2", Date.parse("2026-09-24T10:01:00.000Z")) => false
 * @example isCapacityRefusalHidden({ lastCapacityRefusal: { runnerId: "r1", at: "2026-09-24T10:00:00.000Z" } }, "r1", Date.parse("2026-09-24T10:03:00.000Z")) => false
 ***/
export function isCapacityRefusalHidden(task, runnerId, nowMs = Date.now()) {
	const refusal = task?.lastCapacityRefusal;
	if (!refusal || typeof runnerId !== "string" || !runnerId.trim()) return false;
	if (refusal.runnerId !== runnerId) return false;
	const parsed = new Date(refusal.at || 0).getTime();
	const atMs = Number.isFinite(parsed) ? parsed : 0;
	const now = Number.isFinite(nowMs) ? nowMs : Date.now();
	return now - atMs < CAPACITY_REFUSAL_HIDE_MS;
}
