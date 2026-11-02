import { classifyStageError } from "../../../work/index.js";
import { didFailbackMoveStages } from "./didFailbackMoveStages.js";
import { resolveAutoIterationEnabled } from "./resolveAutoIterationEnabled.js";
import { resolveMaxAutoIterations } from "./resolveMaxAutoIterations.js";

/***
 * MARK: beginAutoIteration
 * @description Attempts to start an automatic re-execution cycle after a stage
 *   failure. Increments the task's auto-iteration counter and returns the budget
 *   when the task is eligible to be re-run automatically (auto-iteration enabled,
 *   the failback landed on an automated stage, and the budget is not exhausted).
 *   Returns null when the task should be parked for human intervention instead.
 *
 *   The retry flags distinguish the two re-run shapes: when the failback moved
 *   the task to a DIFFERENT stage (`task.currentStageId !== stage.id`), the
 *   re-run is a cross-stage auto iteration — `autoIterating = true` and
 *   `autoRetrying = false`, because the task is no longer retrying the failed
 *   stage, it is running the failback stage as normal work. When the failback
 *   landed back on the SAME stage (e.g. first-stage failure), it is a genuine
 *   in-place retry: `autoRetrying = true`, `autoIterating = false`.
 * @example beginAutoIteration(task, stage, error, project) => { maxAttempts: 3 }
 * @param {Object} task
 * @param {Object} [stage]
 * @param {string|Error} [error]
 * @param {Object} [project] - Project carrying retry budget overrides.
 * @returns {{ maxAttempts: number }|null}
 ***/
export function beginAutoIteration(task, stage, error, project) {
	if (!resolveAutoIterationEnabled(project)) return null;
	// Single taxonomy: operator aborts settle quietly and permanent halts
	// (auth/quota/context-overflow/already-processing) never auto-retry.
	const classification = classifyStageError(error);
	if (classification.kind === "operator-abort") return null;
	if (classification.kind === "unrecoverable") return null;
	// If the failback landed on a human checkpoint, stop: a human must act.
	if (task.status === "waiting_human") return null;
	const maxAttempts = resolveMaxAutoIterations(stage, project);
	if (maxAttempts <= 0) return null;
	task.autoIterationCount = (task.autoIterationCount || 0) + 1;
	if (task.autoIterationCount > maxAttempts) return null;
	// The failback has already run, so `task.currentStageId` is the
	// destination. Delegate the comparison so the UI helper and this
	// resolver can never drift.
	const movedStages = didFailbackMoveStages(task, stage);
	task.autoRetrying = !movedStages;
	task.autoIterating = movedStages;
	return { maxAttempts };
}
