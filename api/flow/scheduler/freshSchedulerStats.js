import {
	watchdogTick,
} from '../stageHeartbeat.js';

/***
 * MARK: freshSchedulerStats
 * @description Creates a zeroed scheduler tick-outcome counter set. Kept on
 *   the store as `schedulerStats` so the next "it looks off" report can be
 *   answered from evidence instead of guesses. `resumedInterrupted` counts
 *   tasks auto-resumed by startup recovery (see performStartupRecovery).
  * @example freshSchedulerStats() => { dispatched: 0, … }
 ***/
export function freshSchedulerStats() {
	return {
		ticks: 0,
		dispatched: 0,
		idleNoCandidate: 0,
		skippedBusy: 0,
		skippedBusyWhileIdle: 0,
		resumedInterrupted: 0,
		// Tier-5 containment: ticks where dispatch was held back by the trip
		// (queued work preserved, budgets untouched).
		deferredTripped: 0,
		canaryDispatched: 0,
		tripCount: 0,
		// WP6 stall watchdog: stages terminated because their heartbeat went
		// silent past the per-type threshold (see `watchdogTick`).
		stallRecoveries: 0,
		lastTickAt: null,
		lastDispatchAt: null,
		lastOutcome: null,
	};
}
