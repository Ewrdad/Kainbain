import { startScheduler } from './startScheduler.js';

/***
 * MARK: ensureScheduler
 * @description Heals a scheduler that claims to run but lost its interval
 *   timer. Only restarts when `schedulerRunning` is true — an explicit
 *   `stopScheduler()` stays stopped. This is the backstop behind the idle
 *   invariant: empty queue ⇒ idle polling, stop only via explicit stop.
  * @example ensureScheduler(store) => (scheduler running exactly once)
 ***/
export function ensureScheduler(store, opts = {}) {
	if (!store.schedulerRunning || store.schedulerTimer) return false;
	startScheduler(store, {
		intervalMs: store.defaultSchedulerInterval,
		agentRunner: opts.agentRunner || store.defaultAgentRunner,
		promptEngine: opts.promptEngine || store.defaultPromptEngine,
	});
	return Boolean(store.schedulerTimer);
}
