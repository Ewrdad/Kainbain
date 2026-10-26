import {
	isTripped,
} from '../circuitBreaker.js';
import {
	QUEUE_EMPTY_DEBOUNCE_MS,
} from '../routing/tables/index.js';
import { findNextCandidateTask } from './findNextCandidateTask.js';
import { countHumanPendingTasks } from './countHumanPendingTasks.js';
import { cancelQueueEmptyTimer } from './cancelQueueEmptyTimer.js';

/***
 * MARK: fireQueueEmptyPush
 * @description Best-effort queue-empty push hook with debounce. Arms a timer
 *   instead of notifying immediately; when the timer expires the queue is
 *   re-checked (the scheduler must still be idle, the engine must not be busy,
 *   containment must not be tripped, and `findNextCandidateTask` must still
 *   find nothing) before the store-owned `notifyQueueEmpty` seam fires. A
 *   missing seam or any failure is swallowed so scheduler polling can never
 *   break because notifications did.
 * @param {Object} store
 * @param {Object} [opts]
 * @param {number} [opts.debounceMs] - Override debounce duration (tests).
  * @example fireQueueEmptyPush(store) => (queue-empty push debounced and fired)
 ***/
export function fireQueueEmptyPush(store, opts = {}) {
	try {
		cancelQueueEmptyTimer(store);
		const debounceMs = opts.debounceMs ?? QUEUE_EMPTY_DEBOUNCE_MS;
		store._queueEmptyTimer = setTimeout(() => {
			store._queueEmptyTimer = null;
			try {
				// The scheduler picked up work while the timer was armed.
				if (store._schedulerWasActive === true) return;
				// The engine is actively executing work.
				if (store.executionQueue?.isRunning || store.engineState?.status === "running") return;
				// Containment tripped: work is halted by circuit breaker, queue is not empty.
				if (isTripped(store)) return;
				// A candidate appeared during the window (the next stage
				// landed after the handover): preserve lastCompletedTask if checked, then stay silent.
				const prevLastCompleted = store.lastCompletedTask;
				const hasCandidate = !!findNextCandidateTask(store);
				if (hasCandidate && prevLastCompleted && !store.lastCompletedTask) {
					store.lastCompletedTask = prevLastCompleted;
				}
				if (hasCandidate) return;
				const humanPendingCount = countHumanPendingTasks(store);
				const maybe = store?.notifyQueueEmpty?.({ humanPendingCount });
				if (maybe && typeof maybe.catch === "function") maybe.catch(() => {});
			} catch {
				// Push must never break the scheduler tick.
			}
		}, debounceMs);
		if (store._queueEmptyTimer?.unref) store._queueEmptyTimer.unref();
	} catch {
		// Push must never break the scheduler tick.
	}
}
