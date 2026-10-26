import {
	runInterruptionReconcilePlugins,
} from '../stageLifecycle.js';
import { scheduleTick } from './scheduleTick.js';

/***
 * MARK: runScheduledTick
 * @description One full scheduler interval body: run the registered
 *   continuity plugins' interruption reconcile FIRST (awaited, never
 *   fire-and-forget — the same ordering `performStartupRecovery` guarantees
 *   at boot), then run the normal `scheduleTick`. With no plugins installed
 *   this is a no-op. Sequencing matters: a concurrent tick could dispatch a
 *   task while reconciliation is mid-decision about that same task. A
 *   reconcile failure never breaks the tick — the tasks stay parked and the
 *   next interval retries.
 * @param {Object} store
 * @param {Object} [opts] - Passed through to `scheduleTick`.
 * @returns {Promise<*>} The `scheduleTick` outcome.
  * @example await runScheduledTick(store) => scheduleTick(store) outcome
 ***/
export async function runScheduledTick(store, opts = {}) {
	try {
		await runInterruptionReconcilePlugins(store);
	} catch {
		// Reconcile retries next interval; the tick below still runs.
	}
	return scheduleTick(store, opts);
}
