/***
 * MARK: settleWedgedEntryForTask
 * @description Synchronous latch release for one task's in-flight queue
 *   entry: when `taskId` owns the live entry, force-settles it so the queue
 *   unparks immediately (operator abort/retry must not wait for a
 *   never-settling run, nor round-trip through the scheduler tick). Settles
 *   NOTHING when another task owns the entry, when the queue is idle, or
 *   when the entry already settled — check the return value. Never throws,
 *   so a malformed queue or store can never break an operator action.
 * @param {Object} [store] - The TaskStore (or any holder of an executionQueue).
 * @param {string} taskId
 * @param {Error|string} [error] - Settle reason recorded on the rejection.
 * @returns {boolean} Whether this task's entry was settled.
 ***/
export function settleWedgedEntryForTask(store, taskId, error) {
	try {
		const eq = store && store.executionQueue;
		if (!eq || taskId == null) return false;
		if (String(eq.activeEntry?.taskId ?? "") !== String(taskId)) return false;
		if (typeof eq.settleActive !== "function") return false;
		const settleError =
			error instanceof Error
				? error
				: new Error(
						String(
							error ||
								`Queue entry for task ${taskId} force-settled by operator action`,
						),
					);
		return eq.settleActive(settleError);
	} catch {
		return false;
	}
}
