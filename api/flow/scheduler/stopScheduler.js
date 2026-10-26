import { cancelQueueEmptyTimer } from './cancelQueueEmptyTimer.js';

/***
 * MARK: stopScheduler
 * @description Stops the autonomous scheduler loop.
  * @example stopScheduler(store) => (periodic tick disarmed)
 ***/
export function stopScheduler(store) {
	store.schedulerRunning = false;
	if (store.schedulerTimer) {
		clearInterval(store.schedulerTimer);
		store.schedulerTimer = null;
	}
	if (store._onIdleTimer) {
		clearTimeout(store._onIdleTimer);
		store._onIdleTimer = null;
	}
	if (store._kickTimer) {
		clearTimeout(store._kickTimer);
		store._kickTimer = null;
	}
	cancelQueueEmptyTimer(store);
}
