import {
	config,
} from '../../config.js';
import { autoApproveSweep } from './autoApproveSweep.js';

/***
 * MARK: ensureAutoApproveTimer
 * @description Arms the single auto-approve sweeper interval (the feature's
 *   only timer — never one per task) when it is not already armed. Honours
 *   the global kill switches (`schedulerDisabled`, `opts.disabled`) and the
 *   sweeper's own (`sweepMs: 0` disables it while stamps persist, so
 *   re-enabling resumes firing overdue tasks oldest-first, never early).
 *   The tick body never throws out (a sweep failure is counted, not fatal).
 * @example ensureAutoApproveTimer(store) => true (sweeper armed)
 * @param {Object} store - Task store (owns `autoApproveTimer`).
 * @param {Object} [opts]
 * @param {boolean} [opts.disabled] - Force the sweeper off.
 * @param {number} [opts.sweepMs] - Sweep cadence override.
 * @param {number} [opts.batch] - Per-sweep batch override.
 * @param {number} [opts.configuredLeadMs] - Reminder lead override.
 * @returns {boolean} Whether a timer is now armed by this call.
 ***/
export function ensureAutoApproveTimer(store, opts = {}) {
	if (!store || store.autoApproveTimer) return false;
	if (config.schedulerDisabled || opts.disabled) return false;
	const sweepMs =
		opts.sweepMs ?? store.defaultAutoApproveSweepMs ?? config.autoApproveSweepMs ?? 60000;
	if (!(sweepMs > 0)) return false;
	try {
		store.autoApproveTimer = setInterval(() => {
			try {
				autoApproveSweep(store, {
					batch: opts.batch,
					configuredLeadMs: opts.configuredLeadMs,
				});
			} catch {
				// A sweep failure is counted inside the sweep; the interval
				// itself must never die.
			}
		}, sweepMs);
	} catch {
		return false;
	}
	if (store.autoApproveTimer?.unref) {
		store.autoApproveTimer.unref();
	}
	return true;
}
