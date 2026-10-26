/***
 * MARK: cancelQueueEmptyTimer
 * @description Cancels a pending debounced queue-empty push, if any. Called
 *   wherever the scheduler observes runnable work (busy gate, stall
 *   recovery, candidate dispatch) so a notification armed during a stage
 *   handover dies as soon as the next stage starts.
 * @param {Object} store
  * @example cancelQueueEmptyTimer(store) => (pending queue-empty timer cleared)
 ***/
export function cancelQueueEmptyTimer(store) {
	try {
		if (store?._queueEmptyTimer) {
			clearTimeout(store._queueEmptyTimer);
			store._queueEmptyTimer = null;
		}
	} catch {
		// Timer cleanup must never break the scheduler tick.
	}
}
