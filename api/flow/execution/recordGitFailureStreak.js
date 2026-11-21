import {
	GIT_FAILURE_PARK_AFTER,
	gitFailureSignature,
	isDeterministicGitFailure,
} from "../../../shared/gitFailure.js";
import { clearGitFailureStreak } from "../scheduler/clearGitFailureStreak.js";

/***
 * MARK: recordGitFailureStreak
 * @description Maintains a task's consecutive-deterministic-git-failure
 *   streak from runner reports (the only producer: the backend never
 *   invents envelopes). A deterministic `gitFailure`
 *   (hook-rejected/commit-failed/merge-conflict) with the same
 *   `gitFailureSignature` as the stored streak bumps its count, a changed
 *   signature restarts at 1, and anything else (a pass, a failure without
 *   deterministic git detail) clears the streak — the tree moved on. When
 *   the count exactly hits `GIT_FAILURE_PARK_AFTER`, one history line
 *   records that auto-dispatch paused until an operator retries, resumes,
 *   or moves the task. Call before failure routing: failback clears
 *   `lastError`, but the streak must survive the walk-back. Never throws.
 * @example recordGitFailureStreak({ task, stageId: 'build', gitFailure: { kind: 'hook-rejected', hookName: 'pre-commit', files: ['a.png'] } }).parked => false
 * @param {Object} [args] - Recording context.
 * @param {Object} [args.task] - Task to record on (mutated in place).
 * @param {string} [args.stageId] - Failing stage (falls back to the task's current stage).
 * @param {Object|null} [args.gitFailure] - Sanitized `GitFailureDetails`, or null to clear.
 * @returns {{ streak: Object|null, parked: boolean }} Current streak and whether it parks.
 ***/
export function recordGitFailureStreak({ task, stageId, gitFailure } = {}) {
	if (!task || typeof task !== "object") return { streak: null, parked: false };
	if (!gitFailure || !isDeterministicGitFailure(gitFailure)) {
		clearGitFailureStreak(task);
		return { streak: null, parked: false };
	}
	const signature = gitFailureSignature(gitFailure);
	if (!signature) {
		clearGitFailureStreak(task);
		return { streak: null, parked: false };
	}
	const stage =
		typeof stageId === "string" && stageId
			? stageId
			: typeof task.currentStageId === "string" && task.currentStageId
				? task.currentStageId
				: null;
	const prev = task.gitFailureStreak;
	const count =
		prev &&
		typeof prev === "object" &&
		prev.signature === signature &&
		Number.isInteger(prev.count)
			? prev.count + 1
			: 1;
	const streak = {
		stageId: stage,
		signature,
		count,
		updatedAt: new Date().toISOString(),
	};
	task.gitFailureStreak = streak;
	if (count === GIT_FAILURE_PARK_AFTER) {
		if (!Array.isArray(task.history)) task.history = [];
		const shown = signature.length > 120 ? `${signature.slice(0, 119)}…` : signature;
		task.history.push({
			timestamp: streak.updatedAt,
			action:
				`Git failure streak: ${count} consecutive '${shown}' failures on stage '${stage}' — ` +
				"auto-dispatch paused until an operator retries, resumes, or moves the task.",
		});
	}
	return { streak, parked: count >= GIT_FAILURE_PARK_AFTER };
}
