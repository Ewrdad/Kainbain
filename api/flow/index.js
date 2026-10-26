// Domain: The Flow — stage timing and human-readable stage references.
/***
 * MARK: Flow engine root barrel
 * @description Root barrel exposing the public interface of the KainBain flow engine.
 * @example import { executeStage, handleStageFailure, scheduleTick } from './flow/index.js';
 ***/
export { resolveStageLabel, resolveStageTimeout, resolveProjectTimeout, resolveStage, stageElapsedSeconds, isTerminalTaskStatus, clearResumedMarker } from './stagePolicy.js';
export { ExecutionQueue, EQUEUE_TIMEOUT_CODE } from './executionQueue.js';
export { resolveMaxAutoIterations, resolveMaxTransientRetries, resolveTransientBudget, resolveAutoIterationEnabled, beginAutoIteration, resetAutoIteration, resetAttemptBudgets, handleStageFailure, handleTransientFailure, settleOperatorAbort, trimLogExcerpt, excerptLog, failureLogExcerptLimit, computeRetryDelay, resolveRetryDelayConfig, resolveRetryable, harnessBlipSignalFor, transientRetryDefaults } from './stageFailureRouting.js';
export { resolveStagesForTask, candidateStageIndex, resolveCandidateStage, interruptionTimestampMs, findNextCandidateTask, findResumedCandidate, scheduleTick, reconcileInterruptedRuns, autoResumeTask, isAutoResumable, isSchedulerRunnable, hasContinuityHold, startScheduler, stopScheduler, ensureScheduler, kickScheduler, freshSchedulerStats, getScheduledQueue, describeQueueWedge, resolveIdleWedge, resolveRunningWedge, RESUMED_PRIORITY_REASON, RESUMED_QUEUE_REASON, RESUMED_PRIORITY_RANK } from './taskScheduler.js';
export { registerStageLifecyclePlugin, clearStageLifecyclePlugins, listStageLifecyclePlugins, runInterruptionReconcilePlugins } from './stageLifecycle.js';
export { performStartupRecovery, autoResumeInterrupted, countInterrupted, startupRecoverySummary } from './startupRecovery.js';
export { moveToStage, advanceStage, failbackStage, completeTask, pauseTask, resumeTask, retryStage } from './stageTransitions.js';
export { harnessName, executeStage } from './stageExecution.js';
export { runCommandStage, executeMergeStage } from './commandStages.js';
export { registerChild, unregisterChild, killTaskProcess, abortTask, rejectTask, followUpTask, steerTask } from './taskControl.js';
export { freshCircuitState, loadCircuitState, saveCircuitState, getCircuitState, isTripped, isCircuitEnabled, tripEngine, resetEngine, circuitSnapshot, canaryAdmissionOpen, markCanary, isCanaryTask, recordCanaryFailure, recordCanarySuccess, escalateProbeBackoff, ENGINE_STATE_EVENT, CIRCUIT_STATE_VERSION } from './circuitBreaker.js';
export { freshCircuitSensors, getCircuitSensors, recordCircuitFailure, recordCircuitSuccess, evaluateResourceSensors, isAuthFailure, isInfraLikeFailure, probeDiskFreeBytes, probeMemoryUsagePct, formatBytes, resolveFailureWindowMs, CIRCUIT_FAILURE_WINDOW_MS_FALLBACK } from './circuitSensors.js';
export { startStageHeartbeatTicker, resolveCommandHeartbeatIntervalMs, DEFAULT_CI_HEARTBEAT_INTERVAL_MS } from './commandLiveness.js';
export { recordStageHeartbeat, clearStageHeartbeat, getStageHeartbeat, watchdogTick, resolveStallThresholdMs, markStallHandled, consumeStallHandled, clearStallHandled, noteStallKill, consumeStallKill, routeStallRecovery, resolveWedgeStuckMs, resolveWedgeOccupant, recoverWedgedQueueEntry, STALLED_STATUS_NOTE, STALL_HANDLED_TTL_MS } from './stageHeartbeat.js';
