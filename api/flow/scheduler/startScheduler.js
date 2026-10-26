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
}
