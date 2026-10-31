// Domain: The Work — task names and board projections (barrel over api/work modules).
/***
 * MARK: work barrel
 * @description Task CRUD/lifecycle domain barrel. Re-exports every
 *   `api/work/task*.js` module that is free of route/flow cycles so
 *   `api/taskStore.js` and `api/flow/` share one import seam. Route
 *   registrars (`taskWorkRoutes`, which imports `api/flow/`) and the
 *   `TaskStore` wiring itself stay out: importing them here would close a
 *   work → flow → work evaluation cycle.
 * @example import { createTask, resolveEngineOwnerSnapshot } from './index.js';
 ***/
export { _sanitizeTaskTitle, toTaskSummary } from './taskIdentity.js';
export { TASK_BRANCH_PREFIX, taskBranchName, resolveTaskBranch, isBranchModeEnabled, isWorktreeIsolationEnabled, resolveDirtyTreeRecoveryMode, ensureTaskBranch, ensureTaskBranchRef, syncMainToRemoteBestEffort } from './taskBranches.js';
export { finalizeTaskBranch } from './taskFinalize.js';
export { isUnrecoverableError, isTransientInfrastructureError, isOperatorAbortError, isGitLockError, classifyStageError } from './taskErrors.js';
export { safeParseJsonArray, parseStoredRecords, _formatFrontmatterValue, _parseFrontmatter } from './taskFiles.js';
export { saveTaskMarkdown, recordHistory, recordTimeline, recordTimelineWithDiffStat, formatTimelineDiffStat, parseTimelineDiffStat, syncTaskReports, parseTaskMarkdown } from './taskPersistence.js';
export { scanTasks, createTask, listTasks, getTasks, getTask, getTaskLogFeed, isTaskBlocked, parseBlockedByValue, blockedByCreatesCycle, validateBlockedBy, updateTask, deleteTask, removeTask, cancelProjectExecutions, clearProject, removeTaskWorktreeSync, reapOrphanedWorktreesSync, WORKTREE_REAPABLE_STATUSES } from './taskLifecycle.js';
export { isAllowedImageExt, imageMediaType, sanitizeImageName, dedupeImageName, taskAssetDir, resolveTaskAssetFile, taskAssetRelPath, listTaskImages, collectTaskImageRefs, writeTaskImage, deleteTaskImage } from './taskAssets.js';
export { resolveTaskCwd, ensureTaskWorktree, removeTaskWorktree, reapOrphanedWorktrees, resolveProjectCwdForStore, repairDocsLinkAfterSwitch, worktreesBaseFor, quarantineDirFor, workspaceProjectFor, WORKTREE_BASE_DIR, QUARANTINE_DIR } from './taskWorkspace.js';
export { resolveEngineOwnerSnapshot, countOpenTasksGlobal } from './taskEngineState.js';
export { resolveEngineState } from './resolveEngineState.js';
export { setEngineState } from './setEngineState.js';
export { resolveProjectCwd } from './resolveProjectCwd.js';
export { repairDocsLink } from './repairDocsLink.js';
export { settleWedgedEntryForTask } from './settleWedgedEntryForTask.js';
export { kickIfRunnable } from './kickIfRunnable.js';
export { notifyQueueEmpty } from './notifyQueueEmpty.js';
export { notifyStagePush } from './notifyStagePush.js';
export { notifySchedulerStall } from './notifySchedulerStall.js';
export { summarizeDiffStat, parseNumstatStdout, defaultWorkingTreeDiff, computeStageDelta, getTaskDiffStat, filesToRangeStat, getCommitRangeDiffStat } from './taskDiffStat.js';
export { normalizeRepoKey, withRepoGitLock, getGitLockStats } from './gitLock.js';
export { NO_VERDICT_REJECTION_DIAGNOSTIC, REPORT_MATCH_WINDOW_MS, isSpuriousNoVerdictFailure, sanitizeSpuriousNoVerdictRejections, remediateTaskMarkdown, remediateReportMarkdown } from './remediateNoVerdictRejections.js';
export { DEFAULT_SURVEY_FILENAME, SURVEY_FILENAME, QUESTION_ME_SKILL_NAME, SURVEY_OUTPUT_FILE_KEYS, normalizeSurveyFileName, outputFileFromSkillAttachment, resolveQuestionMeOutputFile, resolveSurveyPath, surveyProjectFor, readSurvey, spliceRoundsIntoMarkdown, appendSurveyRound, saveSurveyAnswers, resolveSurveyGate, renderSurveyMarkdownFor } from './taskSurvey.js';

export { readRetryState, setRetryScheduled, clearRetryState, armRetry, isRetryingTask, retryProgressLabel, retryWaitLabel, isRetryStuck, TASK_RETRY_STATES } from './taskRetryState.js';
