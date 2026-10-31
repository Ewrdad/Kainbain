import {
	_appendProcessLog,
} from "../../../watch/index.js";
import {
	clearResumedMarker,
} from "../../stagePolicy.js";
import { handleStageFailure } from './handleStageFailure.js';
import { clearRetryState } from '../../../work/taskRetryState.js';

/***
 * MARK: settleOperatorAbort
 * @description Settles an operator-initiated run abort (pause/stop/supersede/
 *   restart) quietly: no failback, no same-stage retry, no budget consumed,
 *   and the abort is deliberately NOT recorded as failureReason/lastError so
 *   the next attempt's prompt is not poisoned with "You MUST resolve: This
 *   operation was aborted" as review feedback. The task keeps its current
 *   status (paused/interrupted/in_stage) for resume/retry to pick up cleanly.
 * @example settleOperatorAbort(store, "p1", "t1", stage, err, {}) => { status: "in_stage", … }
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId
 * @param {string} taskId
 * @param {Object} stage
 * @param {Error|string} error
 * @param {Object} [opts]
 * @param {Object} [opts.bridge]
 * @param {string} [opts.projectCwd]
 * @returns {Object} Quiet settle result.
 ***/
export function settleOperatorAbort(
	taskStore,
	projectId,
	taskId,
	stage,
	_error,
	{ bridge = taskStore.eventBridge, projectCwd } = {},
) {
	const task = taskStore.getTask(projectId, taskId);
	if (!task) return null;
	// The superseded-run marker (task 072e2cfa) is consumed by every quiet
	// settle: an agent run superseded by an operator move reaches here via
	// the operator-abort classification, bypassing the handleStageFailure
	// guard above, and must not leave the marker behind for later runs.
	delete task.supersededStageId;
	const cwd = taskStore._resolveProjectCwd(projectId, projectCwd);
	const stageType = stage?.type || "agent";
	const stageLabel = stage?.name || stage?.id || "unknown";
	// A run left in a running_* state with no live execution behind it would
	// strand the task (the scheduler only picks up in_stage): return it to
	// the pre-dispatch state. Claimed states (paused/interrupted/in_stage)
	// are kept as-is for resume/retry to pick up cleanly.
	if (String(task.status || "").startsWith("running_")) {
		task.status = "in_stage";
		task.wasInterrupted = false;
		// Parking an orphaned run for resume/retry serves no startup
		// priority: the operator path below owns the next dispatch.
		clearResumedMarker(task);
	}
	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Stage run aborted by operator in '${stageLabel}': no retry scheduled`,
	});
	_appendProcessLog(
		task,
		`[INFO] Stage run aborted by operator in '${stageLabel}' — awaiting resume/retry`,
	);
clearRetryState(taskStore, projectId, taskId);
	// Scheduled intervention, not a failure: no failureReason/lastError to
	// poison the next attempt's prompt, and no budget consumed (infraRetryCount
	// and autoIterationCount are deliberately left untouched).
	task.failureReason = null;
	task.lastError = null;
	taskStore._saveTaskMarkdown(cwd, task);
	bridge?.emitSystemLog?.(
		projectId,
		`[INFO] Stage '${stageLabel}' run on task #${task.id?.slice(0, 4)} was aborted by the operator; settling quietly without retry`,
		{ taskId, stageId: stage?.id },
	);
	return {
		task,
		stageType,
		status: task.status,
		message: "Stage run aborted by operator; no retry scheduled",
	};
}
