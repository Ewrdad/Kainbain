import {
	config,
} from '../../config.js';
import { runScheduledTick } from './runScheduledTick.js';

/***
 * MARK: startScheduler
 * @description Starts the autonomous scheduler loop.
  * @example startScheduler(store) => (periodic tick armed)
 ***/
export function startScheduler(store, opts = {}) {
	if (store.schedulerTimer) return;
	if (config.schedulerDisabled || opts.disabled) {
		store.schedulerRunning = false;
		return;
	}
	store.schedulerRunning = true;
	if (opts.agentRunner) store.defaultAgentRunner = opts.agentRunner;
	if (opts.promptEngine) store.defaultPromptEngine = opts.promptEngine;

	const interval = opts.intervalMs || store.defaultSchedulerInterval || 3000;
	store.schedulerTimer = setInterval(() => {
		if (store.schedulerRunning) {
			runScheduledTick(store).catch(() => {});
		}
	}, interval);
	if (store.schedulerTimer?.unref) {
		store.schedulerTimer.unref();
	}
	// Retries armed while the engine was stopped recorded their ids in
	// `_dueRetryIds` (see armRetry): they stay `in_stage`, so the normal
	// scan picks them up, but trigger one prompt tick so a due retry does
	// not wait a full interval.
	try {
		if (store._dueRetryIds && store._dueRetryIds.size > 0) {
			store._dueRetryIds.clear();
			if (store.schedulerRunning) {
				runScheduledTick(store).catch(() => {});
			}
		}
	} catch {
		// Prompt pickup is best-effort; the interval still covers it.
	}
}
