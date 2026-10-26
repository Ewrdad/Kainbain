/***
 * MARK: notifySchedulerStall
 * @description Push seam for destructive wedge recoveries (a queue entry
 *   was force-settled and its occupant routed to the transient ladder).
 *   Same lazy, never-throw contract as `notifyQueueEmpty`.
 * @param {Object} [detail] - `{ taskId, projectId, ageMs, reason }`.
 * @example await notifySchedulerStall({ taskId: "t1", reason: "engine-idle" })
 ***/
export async function notifySchedulerStall(detail = {}) {
	try {
		const { getPushService } = await import('../push/index.js');
		await getPushService().notifySchedulerStall(detail);
	} catch {
		// Push must never break recovery.
	}
}
