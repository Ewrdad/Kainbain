import {
	retryStateOf as sharedRetryStateOf,
	isRetryingTask as sharedIsRetryingTask,
	retryProgressLabel as sharedRetryProgressLabel,
	retryWaitLabel as sharedRetryWaitLabel,
	clearRetryState as sharedClearRetryState,
	setRetryScheduled as sharedSetRetryScheduled,
	isRetryStuck as sharedIsRetryStuck,
	TASK_RETRY_STATES,
} from "../../shared/taskRetryState.js";

/***
 * MARK: taskRetryState (backend mirror)
 * @description Task-store-aware retry-state helpers, backed by the shared
 *   `shared/taskRetryState.js` implementation so backend and frontend never
 *   drift.
 * @example readRetryState({ status: "failed", autoRetrying: true }) => { state: "exhausted" }
 ***/
export { TASK_RETRY_STATES };

/***
 * @example readRetryState({ autoRetrying: true, status: "in_stage" }) => { state: "scheduled" }
 ***/
export const readRetryState = (task) => {
	return sharedRetryStateOf(task);
}

/***
 * @example isRetryingTask({ retryState: "running", status: "in_stage" }) => true
 ***/
export const isRetryingTask = sharedIsRetryingTask;

/***
 * @example retryProgressLabel({ retryState: "scheduled", autoRetrying: true, status: "in_stage" }) => "RETRYING (scheduled)"
 ***/
export const retryProgressLabel = sharedRetryProgressLabel;

/***
 * @example retryWaitLabel({ retryState: "scheduled", status: "in_stage", nextRetryAt: "2020-01-01T00:00:00.000Z" }, 1e13) => "due now"
 ***/
export const retryWaitLabel = sharedRetryWaitLabel;

/***
 * @example isRetryStuck({ retryState: "scheduled", nextRetryAt: "2020-01-01T00:00:00.000Z", status: "in_stage" }, 1e13) => true
 ***/
export const isRetryStuck = sharedIsRetryStuck;

/***
 * @example setRetryScheduled({ getTask: () => ({ id: "t1" }) }, "p", "t1", { attempt: 2, maxAttempts: 5 }) => ({ retryState: "scheduled" })
 ***/
export const setRetryScheduled = (taskStore, projectId, taskId, meta = {}) => {
	const task = taskStore?.getTask?.(projectId, taskId);
	if (!task) return null;
	sharedSetRetryScheduled(task, meta);
	return task;
}

/***
 * @example clearRetryState({ getTask: () => ({ id: "t1", autoRetrying: true }) }, "p", "t1") => ({ autoRetrying: false })
 ***/
export const clearRetryState = (taskStore, projectId, taskId, opts = {}) => {
	const task = taskStore?.getTask?.(projectId, taskId);
	if (!task) return null;
	sharedClearRetryState(task, opts);
	return task;
}

/***
 * @example armRetry({ schedulerRunning: false, _dueRetryIds: new Set() }, { id: "t1" }, 1000, { attempt: 1, maxAttempts: 3 }) => false
 ***/
export const armRetry = (taskStore, task, delayMs, meta = {}) => {
	const delay = Math.max(0, Number(delayMs) || 0);
	const nextRetryAt = new Date(Date.now() + delay).toISOString();
	sharedSetRetryScheduled(task, {
		attempt: meta.attempt,
		maxAttempts: meta.maxAttempts,
		nextRetryAt,
	});
	if (meta.budgetSource) task.retryBudgetSource = meta.budgetSource;

	if (taskStore?.schedulerRunning) {
		const timer = setTimeout(() => {
			try {
				taskStore.scheduleTick?.().catch?.(() => {});
			} catch {}
		}, delay);
		try {
			timer?.unref?.();
		} catch {}
		task.retryScheduledInStandby = false;
		return true;
	}
	task.retryScheduledInStandby = true;
	taskStore._dueRetryIds = taskStore._dueRetryIds || new Set();
	taskStore._dueRetryIds.add(task.id);
	return false;
}
