import {
	normalizeStageType,
} from '../../projectStore.js';
import { isAutoResumable } from './isAutoResumable.js';

/***
 * MARK: isSchedulerRunnable
 * @description Single shared predicate for "may the scheduler dispatch this
 *   task right now". An `in_stage` task needs an automated, unpaused stage
 *   and no blockers; an `interrupted` task additionally needs the
 *   `isAutoResumable` policy (merge/human/paused/blocked interruptions stay
 *   parked for the operator or the continuity plugin). The
 *   `allowInterrupted` flag keeps existing in_stage-only call sites on their
 *   exact current behaviour until they opt into resume pickup.
 * @param {Object} task
 * @param {Object} stage - Resolved current stage.
 * @param {Object} [opts]
 * @param {boolean} [opts.blocked] - Whether the task is currently blocked.
 * @param {boolean} [opts.allowInterrupted] - Whether `interrupted` tasks may qualify.
 * @returns {boolean}
 * @example isSchedulerRunnable({ status: "in_stage" }, { type: "agent" }) => true
 ***/
export function isSchedulerRunnable(
	task,
	stage,
	{ blocked = false, allowInterrupted = false } = {},
) {
	if (!task || !stage) return false;
	if (blocked) return false;
	if (task.status === "interrupted") {
		if (!allowInterrupted) return false;
		if (!isAutoResumable(task, stage, { blocked })) return false;
	} else if (task.status !== "in_stage") {
		return false;
	}
	// Normalized: legacy `script` reads as `ci`.
	const stageType = normalizeStageType(stage?.type);
	const isAutomated =
		stageType === "agent" ||
		stageType === "ci" ||
		stageType === "merge";
	if (!isAutomated || stage?.paused === true) return false;
	return true;
}
