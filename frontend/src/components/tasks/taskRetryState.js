import {
	TASK_RETRY_STATES,
	retryStateOf,
	isRetryingTask,
	retryProgressLabel,
	retryWaitLabel,
	clearRetryState,
	setRetryScheduled,
	isRetryStuck,
} from '../../../../shared/taskRetryState.js';

export {
	TASK_RETRY_STATES,
	retryStateOf,
	isRetryingTask,
	retryProgressLabel,
	retryWaitLabel,
	clearRetryState,
	setRetryScheduled,
	isRetryStuck,
};

/***
 * MARK: taskRetryState
 * @description One shared place to ask whether a task is retrying the same
 * stage in place, whether its status counts as settled, and whether an
 * automatic re-run flag is set. Every label, pace tint, and history row
 * reads these answers, so import from here instead of re-checking the
 * flags by hand.
 * @example isRetryInProgress({ autoRetrying: true, currentStageId: '2', lastError: { stageId: '2' } }) => true
 */
export { isRetryInProgress } from './taskRetryState/isRetryInProgress.js';
export { isTaskSettledStatus } from './taskRetryState/isTaskSettledStatus.js';
export { hasLiveRerunFlag } from './taskRetryState/hasLiveRerunFlag.js';
