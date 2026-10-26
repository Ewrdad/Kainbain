import { classifyStageError } from "../../../work/index.js";
import { resolveAutoIterationEnabled } from "./resolveAutoIterationEnabled.js";
import { resolveMaxAutoIterations } from "./resolveMaxAutoIterations.js";

/***
 * MARK: resolveStageErrorPushReason
 * @description Decides whether a parked (`failed`) stage failure needs a
 *   human-intervention push, and why. Returns the reason string, or null
 *   when no push should fire. Deliberate rejections (`failureKind:
 *   "rejected"` — agent fail verdicts, review/human rejections) and tasks
 *   parked at a human checkpoint (`waiting_human`, the designed handoff) are
 *   normal workflow, never alerts. Push fires when auto-recovery is
 *   impossible: unrecoverable errors (auth, quota, connection), an exhausted
 *   auto-iteration budget, or a failback-skipped park (landed work awaiting a
 *   manual retry).
 * @param {Object} [args]
 * @param {Object} [args.task] - Task as parked (pre-park status passed via `parkedFrom`).
 * @param {string|null} [args.parkedFrom] - Task status before parking.
 * @param {Object} [args.stage]
 * @param {string|Error} [args.error]
 * @param {string} [args.failureKind]
 * @param {Object} [args.failureProject]
 * @param {boolean} [args.skipFailback]
 * @example resolveStageErrorPushReason({ error: new Error("401 unauthorized") }) => "unrecoverable"
 * @returns {string|null}
 ***/
export function resolveStageErrorPushReason({
	task,
	parkedFrom,
	stage,
	error,
	failureKind,
	failureProject,
	skipFailback = false,
} = {}) {
	if (failureKind === "rejected") return null;
	if (parkedFrom === "waiting_human") return null;
	// Single taxonomy: operator aborts are scheduled interventions, never
	// unscheduled-failure alerts; permanent halts always need a human.
	const classification = classifyStageError(error);
	if (classification.kind === "operator-abort") return null;
	if (classification.kind === "unrecoverable") return "unrecoverable";
	const maxAttempts = resolveMaxAutoIterations(stage, failureProject);
	if (
		resolveAutoIterationEnabled(failureProject) &&
		maxAttempts > 0 &&
		(task?.autoIterationCount || 0) > maxAttempts
	) {
		return "auto_iteration_exhausted";
	}
	if (skipFailback === true) return "parked_failed";
	return null;
}
