import {
	resetFailbackWarnings,
} from "../../../observability/alerts.js";
import { clearRetryState } from "../../../../shared/taskRetryState.js";

/***
 * MARK: resetAttemptBudgets
 * @description Gives a task a genuinely fresh attempt: clears every
 *   iteration/timeout loop counter (auto-iteration count, transient
 *   same-stage count, auto-retry flag) and restarts the stage clock, so the
 *   failback/auto-retry budget starts over and "time in stage" measures the
 *   new attempt only. Failure context (failureReason/lastError) is
 *   deliberately kept: executeStage snapshots it into the next attempt's
 *   prompt, then clears it.
 * @example resetAttemptBudgets(task) => (counters zeroed, enteredStageAt is now)
 * @param {Object} task
 ***/
export function resetAttemptBudgets(task) {
	task.autoIterationCount = 0;
	task.infraRetryCount = 0;
	task.transientRetryLadder = [];
	task.timeInStage = 0;
	task.enteredStageAt = new Date().toISOString();
	clearRetryState(task);
	resetFailbackWarnings(task);
}
