/***
 * MARK: Flow scheduler barrel
 * @description Thin re-export barrel over candidate selection, resume/interruption, wedge health, and tick lifecycle helpers in `api/flow/scheduler/`.
 * @example import { findNextCandidateTask } from './scheduler/index.js';
 ***/
// Stage-resolution helpers live in `stageResolution.js` (a dependency-free
// module) so `stageHeartbeat.js` can resolve a task's current stage without
// importing this scheduler — which imports the watchdog. Re-exported here so
// every existing import site keeps working unchanged.
export {
	candidateStageIndex,
	resolveCandidateStage,
	resolveStagesForTask,
} from '../stageResolution.js';
export { interruptionTimestampMs } from './interruptionTimestampMs.js';
export { isResumedAfterInterruption } from './isResumedAfterInterruption.js';
export { resumedTimestampMs } from './resumedTimestampMs.js';
export { hasContinuityHold } from './hasContinuityHold.js';
export { isResumedStageRunnable } from './isResumedStageRunnable.js';
export { consumeResumedMarker } from './consumeResumedMarker.js';
export { findResumedCandidate } from './findResumedCandidate.js';
export { findNextCandidateTask } from './findNextCandidateTask.js';
export { freshSchedulerStats } from './freshSchedulerStats.js';
export { hasRehydrationMarkers } from './hasRehydrationMarkers.js';
export { isAutoResumableWithReason } from './isAutoResumableWithReason.js';
export { isAutoResumable } from './isAutoResumable.js';
export { isSchedulerRunnable } from './isSchedulerRunnable.js';
export { countHumanPendingTasks } from './countHumanPendingTasks.js';
export { describeQueueWedge } from './describeQueueWedge.js';
export { resolveIdleWedge } from './resolveIdleWedge.js';
export { resolveRunningWedge } from './resolveRunningWedge.js';
export { scheduleTick } from './scheduleTick.js';
export { ORPHANED_RUNNING_STATUSES } from './orphanedRunningStatuses.js';
export { autoResumeTask } from './autoResumeTask.js';
export { collectResumeEvidence } from './collectResumeEvidence.js';
export { reconcileInterruptedRuns } from './reconcileInterruptedRuns.js';
export { runScheduledTick } from './runScheduledTick.js';
export { startScheduler } from './startScheduler.js';
export { stopScheduler } from './stopScheduler.js';
export { ensureScheduler } from './ensureScheduler.js';
export { kickScheduler } from './kickScheduler.js';
export { getScheduledQueue } from './getScheduledQueue.js';
