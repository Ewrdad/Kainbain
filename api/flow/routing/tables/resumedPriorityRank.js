/***
 * MARK: RESUMED_PRIORITY_RANK
 * @description Display rank for auto-resumable interrupted tasks in
 *   `getScheduledQueue`. Sits between Active Execution (0) and Follow-On
 *   Priority (1) so the queue display matches dispatch order (Rule 0 ahead
 *   of follow-on). Fractional by design: the existing integer ranks are
 *   asserted by tests and must not shift.
 * @example RESUMED_PRIORITY_RANK => 0.5
 ***/
export const RESUMED_PRIORITY_RANK = 0.5;
