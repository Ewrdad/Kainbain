import { GIT_FAILURE_PARK_AFTER } from "../../../shared/gitFailure.js";

/***
 * MARK: isGitFailureParked
 * @description Whether a task is parked after consecutive deterministic git
 *   failures: its `gitFailureStreak` reached `GIT_FAILURE_PARK_AFTER`
 *   strikes and still names the task's current stage. A stage change (the
 *   failback walk, an operator move) unparks by mismatch — the walk itself
 *   terminates because a stage that keeps failing in place re-parks — while
 *   an operator retry/resume/move or any success clears the streak
 *   outright. Consumed by the single dispatch gate
 *   (`isSchedulerRunnable`) and the direct-claim route, so parked tasks
 *   take no embedded or Runner work until the operator acts. Never throws.
 * @example isGitFailureParked({ currentStageId: 'build', gitFailureStreak: { stageId: 'build', signature: 'hook-rejected|pre-commit|recovery|a.png', count: 3 } }) => true
 * @example isGitFailureParked({ currentStageId: 'build' }) => false
 * @param {Object} [task] - Task object, may carry `gitFailureStreak`.
 * @returns {boolean} True when auto-dispatch must skip this task.
 ***/
export function isGitFailureParked(task) {
	if (!task || typeof task !== "object") return false;
	const streak = task.gitFailureStreak;
	if (!streak || typeof streak !== "object" || Array.isArray(streak)) return false;
	if (!Number.isInteger(streak.count) || streak.count < GIT_FAILURE_PARK_AFTER) return false;
	if (typeof streak.stageId !== "string" || !streak.stageId) return false;
	if (typeof streak.signature !== "string" || !streak.signature) return false;
	return streak.stageId === task.currentStageId;
}
