import { scheduleTick } from './scheduleTick.js';
import { ensureScheduler } from './ensureScheduler.js';

/***
 * MARK: kickScheduler
 * @description Debounced event-driven re-tick for moments that create newly
 *   runnable work (task created, resumed, retried, approved, aborted). The
 *   periodic interval stays the liveness backstop; the kick just shortens
 *   pickup to ~150 ms and heals a lost interval timer via ensureScheduler.
 *   Duplicate dispatch is impossible: scheduleTick re-checks the busy gate.
 * @returns {boolean} Whether a re-tick was armed.
  * @example kickScheduler(store) => true (re-tick armed)
 ***/
export function kickScheduler(store, opts = {}) {
	if (!store.schedulerRunning) return false;
	ensureScheduler(store, opts);
	if (store._kickTimer) return true;
	store._kickTimer = setTimeout(() => {
		store._kickTimer = null;
		if (store.schedulerRunning) {
			scheduleTick(store, opts).catch(() => {});
		}
	}, 150);
	if (store._kickTimer?.unref) store._kickTimer.unref();
	return true;
}
