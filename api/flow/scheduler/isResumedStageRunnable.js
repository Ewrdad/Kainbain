/***
 * MARK: isResumedStageRunnable
 * @description Stage policy for a task carrying the startup-recovery marker:
 *   the same scope `autoResumeTask` applied at flip time (agent/ci/script,
 *   plus rehydratable merge — human stages wait for the operator),
 *   unpaused and unblocked. A ci stage whose command happens to run the
 *   deploy script is an ordinary automated stage: it resumes like any other
 *   ci stage. The optional `task` carries the rehydration markers: a marked
 *   merge task keeps its Rule 0 priority only while its markers prove the
 *   resumed attempt. Checked at tick time so a stage that was paused or
 *   blocked after the resume stays parked.
 * @param {Object} stage - Resolved current stage.
 * @param {Object} [opts]
 * @param {boolean} [opts.blocked] - Whether the task is currently blocked.
 * @param {Object} [opts.task] - The marked task (for merge marker proof).
 * @returns {boolean}
 * @example isResumedStageRunnable({ type: "agent" }) => true
 ***/
import {
	normalizeStageType,
} from '../../projectStore.js';
import { hasContinuityHold } from './hasContinuityHold.js';
import { hasRehydrationMarkers } from './hasRehydrationMarkers.js';

export function isResumedStageRunnable(stage, { blocked = false, task = null } = {}) {
	if (!stage || blocked) return false;
	if (stage?.paused === true) return false;
	// A continuity hold outranks Rule 0 priority: the plugin that parked the
	// task is still waiting for its own durable outcome.
	if (hasContinuityHold(task)) return false;
	// Normalized: legacy `script` reads as `ci`, `review` as `human`.
	const stageType = normalizeStageType(stage?.type);
	if (stageType === "agent" || stageType === "ci") {
		return true;
	}
	if (stageType === "merge") {
		return hasRehydrationMarkers(task);
	}
	return false;
}
