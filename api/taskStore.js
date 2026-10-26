// Role: barrel + TaskStore — re-exports work/flow/watch/house domains and defines the TaskStore class (filesystem-backed task instances).
import {
	taskBranchName,
	resolveTaskBranch,
	isBranchModeEnabled,
	ensureTaskBranch,
	ensureTaskBranchRef,
	finalizeTaskBranch,
	isUnrecoverableError,
	isTransientInfrastructureError,
	safeParseJsonArray,
	_formatFrontmatterValue,
	_parseFrontmatter,
	saveTaskMarkdown,
	recordHistory,
	recordTimeline,
	recordTimelineWithDiffStat,
	syncTaskReports,
	parseTaskMarkdown,
	scanTasks,
	createTask,
	listTasks,
	getTasks,
	getTask,
	getTaskLogFeed,
	isTaskBlocked,
	updateTask,
	deleteTask,
	removeTask,
	cancelProjectExecutions,
	clearProject,
	resolveTaskCwd,
	ensureTaskWorktree,
	removeTaskWorktree,
	reapOrphanedWorktrees,
	resolveEngineState as resolveEngineStateFn,
	setEngineState as setEngineStateFn,
	resolveProjectCwd as resolveProjectCwdFn,
	repairDocsLink as repairDocsLinkFn,
	settleWedgedEntryForTask as settleWedgedEntryForTaskFn,
	kickIfRunnable as kickIfRunnableFn,
	notifyQueueEmpty as notifyQueueEmptyFn,
	notifyStagePush as notifyStagePushFn,
	notifySchedulerStall as notifySchedulerStallFn,
} from "./work/index.js";
import { ExecutionQueue } from "./flow/index.js";

import {
	_appendProcessLog,
	_logEntriesForFeed,
	_appendLogEntries,
	_replaceLogEntries,
	computeObservabilityMetrics,
} from "./watch/index.js";
import { _atomicWriteFileSync } from "./house/index.js";
export {
	TASK_BRANCH_PREFIX,
	taskBranchName,
	isUnrecoverableError,
	isTransientInfrastructureError,
} from "./work/index.js";
export { ExecutionQueue } from "./flow/index.js";
export { _appendProcessLog, renderLogEntriesText } from "./watch/index.js";
export { _atomicWriteFileSync } from "./house/index.js";
import { _sanitizeTaskTitle } from "./work/index.js";
import {
	resolveStageLabel,
	resolveStageTimeout,
	resolveMaxAutoIterations,
	resolveMaxTransientRetries,
	resolveAutoIterationEnabled,
	beginAutoIteration,
	resetAutoIteration,
	handleStageFailure,
	handleTransientFailure,
	settleOperatorAbort,
	resolveStagesForTask,
	findNextCandidateTask,
	findResumedCandidate,
	scheduleTick,
	runInterruptionReconcilePlugins,
	reconcileInterruptedRuns,
	autoResumeTask,
	isAutoResumable,
	isSchedulerRunnable,
	performStartupRecovery,
	startScheduler,
	stopScheduler,
	ensureScheduler,
	kickScheduler,
	freshSchedulerStats,
	getScheduledQueue,
	moveToStage,
	advanceStage,
	failbackStage,
	completeTask,
	pauseTask,
	resumeTask,
	retryStage,
	harnessName,
	executeStage,
	runCommandStage,
	executeMergeStage,
	registerChild,
	unregisterChild,
	killTaskProcess,
	abortTask,
	rejectTask,
	followUpTask,
	steerTask,
	circuitSnapshot,
} from "./flow/index.js";
import {
	AUTO_REPORT_MARKER,
	isAutoReportContent,
	generateStageReportContent,
	saveStageReport,
	getTaskReports,
} from "./watch/index.js";
export { _sanitizeTaskTitle, toTaskSummary } from "./work/index.js";
export {
	resolveStageLabel,
	resolveStageTimeout,
	stageElapsedSeconds,
	isTerminalTaskStatus,
} from "./flow/index.js";
export {
	AUTO_REPORT_MARKER,
	isAutoReportContent,
	generateStageReportContent,
} from "./watch/index.js";

import { eventBridge as globalEventBridge } from "./eventBridge.js";
import { config } from "./config.js";
import {
	readActiveSessionDisplay,
	resolveActiveTaskDisplay,
	resolveEngineStageProjection,
} from "./activeTaskDisplay.js";

/***
 * MARK: TaskStore
 * @description Manages discrete task execution instances and metadata per project.
 * Tasks are server-authoritative, filesystem-backed at `<projectRoot>/docs/tasks/<taskId>/task.md`,
 * navigate through workflow stages, record execution history, and store markdown stage reports.
 ***/
export class TaskStore {
	/***
	 * MARK: constructor
	 * @description Initializes the TaskStore with event bridge, in-memory cache, and deduplication map.
	 * @example const store = new TaskStore({ projectStore })
	 * @param {Object} [options]
	 * @param {Object} [options.eventBridge]
	 * @param {Object} [options.projectStore]
	 ***/
	constructor(options = {}) {
		// projectId -> Map<taskId, task>
		this.tasksByProject = new Map();
		this.scannedProjects = new Set();
		this.eventBridge = options.eventBridge || globalEventBridge;
		this.projectStore = options.projectStore || null;
		// DeployManager reads the durable deploy result/state files written by
		// deploy.sh (~/.kainbain/deploy). Used to reconcile tasks that were
		// interrupted when a self-deploy restarted the API process.
		this.deployManager = options.deployManager || null;
		// Deduplication cache: key -> { task, createdAt }
		this.dedupeMap = new Map();
		// In-flight creations: key -> Promise<task>
		this.inFlightCreations = new Map();
		// Global priority execution queue across all projects. The settle
		// guarantee (`queueEntryTimeoutMs`, default 15 min) bounds every
		// entry: a run that never settles is force-settled and routed to the
		// transient ladder instead of parking the scheduler forever. `0`
		// disables the guarantee (the scheduler wedge watchdog guards alone).
		// Overridable per store (`queueEntryTimeoutMs` option) so tests can
		// use a tiny budget without touching global config.
		this.executionQueue = new ExecutionQueue({
			activeTimeoutMs:
				options.queueEntryTimeoutMs ?? config?.queueEntryTimeoutMs ?? 900000,
		});
		// Active child processes per taskId (for CI/script/deploy steps) so they
		// can be terminated on skip/abort/timeout — including their whole process
		// group so grandchildren that hold the terminal open are also reaped.
		this._activeChildren = new Map();
		this._onIdleTimer = null;
		this._kickTimer = null;
		this.executionQueue.onIdle = () => {
			if (this.schedulerRunning) {
				if (this._onIdleTimer) clearTimeout(this._onIdleTimer);
				this._onIdleTimer = setTimeout(() => {
					this._onIdleTimer = null;
					if (
						this.schedulerRunning &&
						!this.executionQueue.isRunning &&
						this.engineState.status === "idle"
					) {
						this.scheduleTick().catch(() => {});
					}
				}, 150);
				if (this._onIdleTimer?.unref) this._onIdleTimer.unref();
			}
		};
		// Autonomous scheduler state
		this.schedulerRunning = false;
		this.schedulerTimer = null;
		// Tick-outcome telemetry (dispatched / no-candidate-idle / skipped-busy)
		// so idle-vs-stuck is answerable from evidence.
		this.schedulerStats = freshSchedulerStats();
		this.lastCompletedTask = null; // { projectId, taskId, timestamp } for Priority 1 follow-on
		this.defaultSchedulerInterval = config.schedulerIntervalMs;
		this.defaultAgentRunner = null;
		this.defaultPromptEngine = null;
		// Global engine state snapshot
		this.engineState = {
			status: "idle",
			activeTaskId: null,
			activeProjectId: null,
			activeProjectName: null,
			activeStageId: null,
			activeStageName: null,
			activeStageType: null,
			updatedAt: new Date().toISOString(),
		};
	}

	/***
	 * MARK: getEngineState
	 * @description Returns the current snapshot of global AI agent / pipeline engine execution state.
	 * Enriched with the project-independent owner source behind the Now
	 * Playing bar: `activeTask` is the full owner-task snapshot (resolved
	 * from the owning project, never the selected one) and `openQueueDepth`
	 * is the global open-task count across all projects. Both derivations
	 * are read-only and best-effort — a lookup failure degrades to
	 * `activeTask: null` / an absent depth (the bar falls back to its loaded
	 * list) instead of ever breaking the state read.
	 * @example taskStore.getEngineState() => { status: 'running', activeTaskId: 't1', activeTask: {...}, openQueueDepth: 2 }
	 * @returns {Object}
	 ***/
	getEngineState() {
		return resolveEngineStateFn(this);
	}

	/***
	 * MARK: setEngineState
	 * @description Updates the global engine state and broadcasts an ENGINE_STATE event across all connected sockets.
	 * @example taskStore.setEngineState({ status: 'running', activeTaskId: 't1', activeProjectId: 'p1' })
	 * @param {Object} updates
	 * @returns {Object} The updated engine state.
	 ***/
	setEngineState(updates = {}) {
		return setEngineStateFn(this, updates);
	}

	/***
	 * MARK: setProjectStore
	 * @description Attaches the ProjectStore reference for automatic cwd resolution.
	 * @example taskStore.setProjectStore(projectStore)
	 * @param {Object} projectStore
	 ***/
	setProjectStore(projectStore) {
		this.projectStore = projectStore;
	}

	/***
	 * MARK: _resolveProjectCwd
	 * @description Resolves the working directory for a project without falling back to process.cwd().
	 *   Instance API delegate (invoked on the store from work modules/tests).
	 *   Never throws: unresolvable input degrades to `null`.
	 * @example taskStore._resolveProjectCwd('proj-1', '/custom/cwd') => '/custom/cwd'
	 * @param {string} projectId
	 * @param {string} [explicitCwd]
	 * @returns {string|null}
	 ***/
	_resolveProjectCwd(projectId, explicitCwd) {
		return resolveProjectCwdFn(this, projectId, explicitCwd);
	}

	/***
	 * MARK: resolveTaskCwd
	 * @description Resolves the task-specific working directory (supporting worktrees when enabled).
	 * @param {Object} task
	 * @param {string} [projectCwd]
	 * @param {Object} [opts]
	 * @returns {Promise<string|null>}
	 ***/
	resolveTaskCwd(task, projectCwd, opts) {
		return resolveTaskCwd(this, task, projectCwd, opts);
	}

	/***
	 * MARK: appendProcessLog
	 * @description Appends a rendered log chunk to a task's structured
	 *   `logEntries` as one synthesized entry (the single log storage path;
	 *   growth bounded by `config.logEntriesMaxCount`).
	 * @example taskStore.appendProcessLog('proj-1', 'task-1', 'chunk')
	 * @param {string} projectId
	 * @param {string} taskId
	 * @param {string} chunk
	 * @returns {void}
	 ***/
	appendProcessLog(projectId, taskId, chunk) {
		const task = this.getTask(projectId, taskId);
		if (!task || !chunk) return;
		_appendProcessLog(task, chunk);
	}

	/***
	 * MARK: _getMap
	 * @description Retrieves or initializes the task map for a project.
	 * @example taskStore._getMap('proj-1') => Map
	 * @param {string} projectId
	 * @returns {Map<string,Object>}
	 ***/
	_getMap(projectId) {
		if (!this.tasksByProject.has(projectId)) {
			this.tasksByProject.set(projectId, new Map());
		}
		return this.tasksByProject.get(projectId);
	}

	/***
	 * MARK: _saveTaskMarkdown
	 * @description Persists a task entity and its execution history to `<projectRoot>/docs/tasks/<taskId>/task.md`.
	 * @example taskStore._saveTaskMarkdown('/path/to/project', task)
	 * @param {string} projectCwd
	 * @param {Object} task
	 * @returns {void}
	 ***/
	_saveTaskMarkdown(projectCwd, task) {
		// Repair-after-switch: a branch checkout may have removed the
		// `<cwd>/docs` symlink (old kb/* branches still track it while
		// master ignores it); saving without the link would cement a
		// one-task shadow directory that hides every other task from the
		// UI (2026-10-02 recurrence). Re-verifying on every save closes the
		// gap for all present and future switch sites at negligible cost,
		// and silently no-ops when the link is healthy or no notes space
		// exists (fresh clones / WP-2 local backend).
		this._repairDocsLinkAfterSwitch(task?.projectId, projectCwd);
		return saveTaskMarkdown(this, projectCwd, task);
	}

	/***
	 * MARK: _repairDocsLinkAfterSwitch
	 * @description Re-verifies a project's `<cwd>/docs` symlink ahead of a
	 *   task save, recreating a missing link (or repointing a dangling one)
	 *   before the write lands. The single seam every engine save passes
	 *   through (see `_saveTaskMarkdown`), so branch switches that delete
	 *   the tracked link can never strand the next save in a shadow
	 *   directory. Never throws: link verification must not fail a save.
	 * @example taskStore._repairDocsLinkAfterSwitch('proj-1', '/repo') => { state: 'ok', ... } | null
	 * @param {string} projectId
	 * @param {string} [projectCwd]
	 * @returns {Object|null} The `ensureDocsLink` result, or null when the project or link cannot be resolved.
	 ***/
	_repairDocsLinkAfterSwitch(projectId, projectCwd) {
		return repairDocsLinkFn(this, projectId, projectCwd);
	}

	/***
	 * MARK: _recordHistory
	 * @description Records an audit history event on a task while preventing duplicate consecutive or identical timestamp entries.
	 * @example taskStore._recordHistory(task, 'Task details edited')
	 * @param {Object} task
	 * @param {string} action
	 * @param {string} [timestamp]
	 * @returns {void}
	 ***/
	_recordHistory(task, action, timestamp = new Date().toISOString()) {
		return recordHistory(task, action, timestamp);
	}

	/***
	 * MARK: _recordTimeline
	 * @description Records a stage-transition timeline entry on a task.
	 * @param {Object} task
	 * @param {Object} entry
	 * @returns {void}
	 ***/
	_recordTimeline(
		task,
		{ stage, status, duration = "0m", timestamp, ...metadata },
	) {
		return recordTimeline(task, {
			stage,
			status,
			duration,
			timestamp,
			...metadata,
		});
	}

	/***
	 * MARK: _recordTimelineWithDiffStat
	 * @description Records a stage-transition timeline entry immediately, then
	 *   best-effort attributes its per-stage diff size once git answers (see
	 *   recordTimelineWithDiffStat). Stays synchronous so stage transitions
	 *   never wait on git.
	 * @param {Object} task
	 * @param {Object} entry
	 * @param {string} [projectCwd]
	 * @param {Object} [diffStatOpts]
	 * @returns {Object|undefined} The recorded entry.
	 ***/
	_recordTimelineWithDiffStat(task, entry, projectCwd, diffStatOpts = {}) {
		return recordTimelineWithDiffStat(
			this,
			task,
			entry,
			projectCwd,
			diffStatOpts,
		);
	}

	/***
	 * MARK: _syncTaskReports
	 * @description Synchronizes and deduplicates markdown report files from disk for a task.
	 * @example taskStore._syncTaskReports('proj-1', task, '/path/to/project')
	 * @param {string} projectId
	 * @param {Object} task
	 * @param {string} [projectCwd]
	 * @returns {Array<Object>} Deduplicated reports list.
	 ***/
	_syncTaskReports(projectId, task, projectCwd) {
		return syncTaskReports(this, projectId, task, projectCwd);
	}

	/***
	 * MARK: _parseTaskMarkdown
	 * @description Parses `<projectRoot>/docs/tasks/<taskId>/task.md` into a task entity.
	 * @example taskStore._parseTaskMarkdown(content, 'task-1', 'proj-1') => task
	 * @param {string} content - File content of task.md.
	 * @param {string} taskId
	 * @param {string} projectId
	 * @returns {Object}
	 ***/
	_parseTaskMarkdown(content, taskId, projectId) {
		return parseTaskMarkdown(this, content, taskId, projectId);
	}

	/***
	 * MARK: scanTasks
	 * @description Scans `<projectRoot>/docs/tasks/` on startup or project load and rehydrates tasks into memory cache from `task.md`.
	 * @example taskStore.scanTasks('proj-1', '/path/to/project') => [{ id: 'task-1' }]
	 * @param {string} projectId
	 * @param {string} [projectCwd]
	 * @returns {Array<Object>} Rehydrated tasks for the project.
	 ***/
	scanTasks(projectId, projectCwd) {
		return scanTasks(this, projectId, projectCwd);
	}

	createTask(projectId, opts = {}) {
		return this._kickIfRunnable(createTask(this, projectId, opts));
	}

	listTasks(projectId, projectCwd, workflowId) {
		return listTasks(this, projectId, projectCwd, workflowId);
	}

	getTasks(projectId, workflowId, projectCwd) {
		return getTasks(this, projectId, workflowId, projectCwd);
	}

	getTask(projectId, taskId) {
		return getTask(this, projectId, taskId);
	}

	getTaskLogFeed(projectId, taskId, options = {}) {
		return getTaskLogFeed(this, projectId, taskId, options);
	}

	isTaskBlocked(projectId, taskId) {
		return isTaskBlocked(this, projectId, taskId);
	}

	updateTask(projectId, taskId, updates, projectCwd) {
		return updateTask(this, projectId, taskId, updates, projectCwd);
	}

	deleteTask(projectId, taskId, projectCwd) {
		return deleteTask(this, projectId, taskId, projectCwd);
	}

	removeTask(projectId, taskId, projectCwd) {
		return removeTask(this, projectId, taskId, projectCwd);
	}

	/***
	 * MARK: _isBranchModeEnabled
	 * @description Whether per-task branch support is enabled for a project.
	 *   Opt-in via project.useBranches; default off so existing projects keep
	 *	 their single-branch behaviour unchanged.
	 * @example taskStore._isBranchModeEnabled('proj-1') => true
	 * @param {string} projectId
	 * @returns {boolean}
	 **/
	_isBranchModeEnabled(projectId) {
		return isBranchModeEnabled(this.projectStore, projectId);
	}

	/***
	 * MARK: resolveTaskBranch
	 * @description Returns a task's per-task branch name. Uses the persisted
	 *   task.branch when present, otherwise derives 'kb/<taskId>'.
	 * @example taskStore.resolveTaskBranch(task) => 'kb/123e4567-...'
	 * @param {Object} task
	 * @returns {string}
	 **/
	resolveTaskBranch(task) {
		return resolveTaskBranch(task);
	}

	/***
	 * MARK: ensureTaskBranch
	 * @description Safely makes sure the task's branch exists and is checked out
	 *   in the project working directory.
	 * @example await taskStore.ensureTaskBranch(task, projectCwd, { bridge }) => { created, switched }
	 * @param {Object} task - The task entity (branch resolved from it).
	 * @param {string} [projectCwd] - Project working directory.
	 * @param {Object} [opts]
	 * @param {Object} [opts.bridge] - Event bridge override.
	 * @returns {Promise<{created: boolean, switched: boolean, branch: string}|null>} null when the cwd cannot be resolved.
	 **/
	async ensureTaskBranch(task, projectCwd, opts = {}) {
		return ensureTaskBranch(this, task, projectCwd, opts);
	}

	/***
	 * MARK: ensureTaskBranchRef
	 * @description Human-review git policy: ensures the task's branch ref
	 *   exists without checking it out, committing, or pushing. Never throws
	 *   for environmental git states (non-repo, unborn repo) — defers with a
	 *   process-log warning instead, so human checkpoints always park.
	 * @example await taskStore.ensureTaskBranchRef(task, projectCwd, { stageName: 'Review' }) => { created, branch }
	 * @param {Object} task - The task entity (branch resolved from it).
	 * @param {string} [projectCwd] - Project working directory.
	 * @param {Object} [opts]
	 * @param {Object} [opts.bridge] - Event bridge override.
	 * @param {string} [opts.stageName] - Human stage name for audit messages.
	 * @returns {Promise<{created: boolean, existed: boolean, deferred: string|null, checkedOut: boolean, switched: boolean, branch: string, startPoint: string|null}|null>} null when the task is missing or the cwd cannot be resolved.
	 **/
	async ensureTaskBranchRef(task, projectCwd, opts = {}) {
		return ensureTaskBranchRef(this, task, projectCwd, opts);
	}

	/***
	 * MARK: finalizeTaskBranch
	 * @description Completes the per-task branch lifecycle after a work stage:
	 *   commit all changes, push when a remote exists, return to default.
	 * @example await taskStore.finalizeTaskBranch(task, projectCwd, { stageName: 'Plan' }) => { committed, pushed, switched, ... }
	 * @param {Object} task - The task entity (branch resolved from it).
	 * @param {string} [projectCwd] - Project working directory.
	 * @param {Object} [opts]
	 * @param {Object} [opts.bridge] - Event bridge override.
	 * @param {string} [opts.stageName] - Stage name for log/commit messages.
	 * @returns {Promise<Object|null>} Finalisation summary, or null when the cwd cannot be resolved.
	 **/
	async finalizeTaskBranch(task, projectCwd, opts = {}) {
		return finalizeTaskBranch(this, task, projectCwd, opts);
	}

	/***
	 * MARK: moveToStage
	 * @description Moves a task into a specific stage (non-linear jump or drag-and-drop) and persists to disk.
	 * @example taskStore.moveToStage('proj-1', taskId, '3', 'Jumped')
	 * @param {string} projectId
	 * @param {string} taskId
	 * @param {string} stageId
	 * @param {string} [reason='Moved']
	 * @param {Object} [bridge]
	 * @param {string} [projectCwd]
	 * @param {Object} [options]
	 * @param {boolean} [options.operatorMove=false] - True for an operator-initiated move/jump: interrupt any live run this task owns and release the engine.
	 * @returns {Object|null}
	 ***/
	moveToStage(
		projectId,
		taskId,
		stageId,
		reason = "Moved",
		bridge = this.eventBridge,
		projectCwd,
		options = {},
	) {
		return this._kickIfRunnable(
			moveToStage(
				this,
				projectId,
				taskId,
				stageId,
				reason,
				bridge,
				projectCwd,
				options,
			),
		);
	}

	advanceStage(
		projectId,
		taskId,
		stages = [],
		bridge = this.eventBridge,
		projectCwd,
		humanReview = {},
	) {
		return advanceStage(
			this,
			projectId,
			taskId,
			stages,
			bridge,
			projectCwd,
			humanReview,
		);
	}

	failbackStage(
		projectId,
		taskId,
		stages = [],
		fallbackStageId,
		bridge = this.eventBridge,
		projectCwd,
	) {
		return failbackStage(
			this,
			projectId,
			taskId,
			stages,
			fallbackStageId,
			bridge,
			projectCwd,
		);
	}

	/***
	 * MARK: _resolveMaxAutoIterations
	 * @description Resolves the automatic-iteration budget for a stage.
	 *   Instance API delegate (invoked on the store from flow modules/tests).
	 * @param {Object} [stage]
	 * @param {Object} [project]
	 * @returns {number}
	 **/
	_resolveMaxAutoIterations(stage, project) {
		return resolveMaxAutoIterations(stage, project);
	}

	/***
	 * MARK: _resolveMaxTransientRetries
	 * @description Resolves the same-stage retry budget for transient infrastructure failures.
	 *   Instance API delegate (invoked on the store from flow modules/tests).
	 * @param {Object} [stage]
	 * @param {Object} [project]
	 * @returns {number}
	 **/
	_resolveMaxTransientRetries(stage, project) {
		return resolveMaxTransientRetries(stage, project);
	}

	/***
	 * MARK: _resolveAutoIterationEnabled
	 * @description Whether automatic failback-and-retry is enabled for a project.
	 *   Instance API delegate (invoked on the store from flow modules/tests).
	 * @param {Object} [project]
	 * @returns {boolean}
	 **/
	_resolveAutoIterationEnabled(project) {
		return resolveAutoIterationEnabled(project);
	}

	/***
	 * MARK: _beginAutoIteration
	 * @description Attempts to start an automatic re-execution cycle after a stage failure.
	 *   Instance API delegate (invoked on the store from flow modules/tests).
	 * @param {Object} task
	 * @param {Object} [stage]
	 * @param {string|Error} [error]
	 * @param {Object} [project]
	 * @returns {{ maxAttempts: number }|null}
	 **/
	_beginAutoIteration(task, stage, error, project) {
		return beginAutoIteration(task, stage, error, project);
	}

	/***
	 * MARK: _resetAutoIteration
	 * @description Clears a task's automatic-iteration state: every loop
	 *   counter plus the stage clock, so the next attempt starts a fresh budget.
	 *   Instance API delegate (invoked on the store from flow modules/tests).
	 * @param {Object} task
	 **/
	_resetAutoIteration(task) {
		return resetAutoIteration(task);
	}

	/***
	 * MARK: handleStageFailure
	 * @description Handles stage execution failure: logs error, generates failure report, emits events, and routes to fallback stage.
	 * @param {string} projectId
	 * @param {string} taskId
	 * @param {Object} stage
	 * @param {Error|string} error
	 * @param {Object} [opts]
	 * @returns {Object} Failure result.
	 ***/
	handleStageFailure(projectId, taskId, stage, error, opts = {}) {
		return handleStageFailure(this, projectId, taskId, stage, error, opts);
	}

	/***
	 * MARK: handleTransientFailure
	 * @description Handles transient infrastructure failures by retrying the SAME stage instead of failback routing.
	 * @param {string} projectId
	 * @param {string} taskId
	 * @param {Object} stage
	 * @param {Error|string} error
	 * @param {Object} [opts]
	 * @returns {Object} Retry or parked-failure result.
	 ***/
	handleTransientFailure(projectId, taskId, stage, error, opts = {}) {
		return handleTransientFailure(this, projectId, taskId, stage, error, opts);
	}

	/***
	 * MARK: settleOperatorAbort
	 * @description Settles an operator-initiated run abort quietly: no
	 *   failback, no same-stage retry, no budget consumed, and no
	 *   failureReason/lastError recorded. Consumes zero retry and zero
	 *   auto-iteration budget and is never counted as an unscheduled
	 *   intervention.
	 * @param {string} projectId
	 * @param {string} taskId
	 * @param {Object} stage
	 * @param {Error|string} error
	 * @param {Object} [opts]
	 * @returns {Object} Quiet settle result.
	 ***/
	settleOperatorAbort(projectId, taskId, stage, error, opts = {}) {
		return settleOperatorAbort(this, projectId, taskId, stage, error, opts);
	}

	/***
	 * MARK: _harnessName
	 * @description The label of the agent harness this store runs stages with,
	 *   read from the harness's own identity metadata (see
	 *   api/agent/harnessContract.js) so user-facing log prose describes the
	 *   configured harness instead of hard-coding a vendor name. Falls back to
	 *   the neutral "agent" when no session store/harness is wired (unit-test
	 *   seams) or when the harness cannot be asked — log composition must
	 *   never be able to throw.
	 * @example this._harnessName() => "pi"
	 * @returns {string} The harness label, or "agent" when unknown.
	 ***/
	_harnessName() {
		return harnessName(this);
	}

	async executeStage(projectId, taskId, opts = {}) {
		return executeStage(this, projectId, taskId, opts);
	}

	rejectTask(
		projectId,
		taskId,
		stages = [],
		feedback,
		bridge = this.eventBridge,
		projectCwd,
		reviewComments = [],
	) {
		return rejectTask(
			this,
			projectId,
			taskId,
			stages,
			feedback,
			bridge,
			projectCwd,
			reviewComments,
		);
	}

	saveStageReport(projectId, taskId, opts = {}) {
		// Same repair-after-switch as _saveTaskMarkdown: report writes
		// mkdir the task dir directly, so a deleted link would cement a
		// shadow here too (2026-10-02 recurrence was born by a catchup
		// report, not a save).
		this._repairDocsLinkAfterSwitch(projectId, opts.projectCwd);
		return saveStageReport(this, projectId, taskId, opts);
	}

	getTaskReports(projectId, taskId, projectCwd) {
		return getTaskReports(this, projectId, taskId, projectCwd);
	}

	/***
	 * MARK: completeTask
	 * @description Marks a task completed and persists to disk.
	 * @example taskStore.completeTask('proj-1', taskId)
	 * @param {string} projectId
	 * @param {string} taskId
	 * @param {string} [projectCwd]
	 * @returns {Object|null}
	 ***/
	completeTask(projectId, taskId, projectCwd) {
		return completeTask(this, projectId, taskId, projectCwd);
	}

	pauseTask(projectId, taskId, projectCwd) {
		return pauseTask(this, projectId, taskId, projectCwd);
	}

	async resumeTask(projectId, taskId, opts = {}) {
		return this._kickIfRunnable(await resumeTask(this, projectId, taskId, opts));
	}

	async retryStage(projectId, taskId, opts = {}) {
		return this._kickIfRunnable(await retryStage(this, projectId, taskId, opts));
	}

	/***
	 * MARK: _runCommandStage
	 * @description Shared execution engine for command stages ('ci' and
	 *   legacy 'script', which normalizes to 'ci'). Runs the stage command in
	 *   the project cwd (via execRunner when provided, otherwise a platform-aware
	 *   shell executor with a dedicated process group so long-running children
	 *   are reaped on timeout, skip, or abort), captures stdout/stderr, writes
	 *   the auto-report, and advances or fails the task based on the exit code.
	 *   Instance API delegate (invoked on the store from flow modules/tests).
	 * @example await store._runCommandStage(projectId, taskId, stage, { kind: 'ci', label: 'CI', logTag: 'CI/CMD', ... })
	 ***/
	async _runCommandStage(projectId, taskId, stage, opts = {}) {
		return runCommandStage(this, projectId, taskId, stage, opts);
	}

	async _executeMergeStage(opts = {}) {
		return executeMergeStage(this, opts);
	}

	_registerChild(taskId, child) {
		return registerChild(this, taskId, child);
	}

	_unregisterChild(taskId) {
		return unregisterChild(this, taskId);
	}

	killTaskProcess(taskId) {
		return killTaskProcess(this, taskId);
	}

	abortTask(projectId, taskId, projectCwd) {
		return this._kickIfRunnable(abortTask(this, projectId, taskId, projectCwd));
	}

	async followUpTask(projectId, taskId, prompt, opts = {}) {
		return this._kickIfRunnable(
			await followUpTask(this, projectId, taskId, prompt, opts),
		);
	}

	async steerTask(projectId, taskId, guidance, opts = {}) {
		return steerTask(this, projectId, taskId, guidance, opts);
	}

	/***
	 * MARK: cancelProjectExecutions
	 * @description Resets engine execution state and cancels pending task executions for a project upon compute stop.
	 * @example taskStore.cancelProjectExecutions('proj-1')
	 * @param {string} projectId
	 ***/
	cancelProjectExecutions(projectId) {
		return cancelProjectExecutions(this, projectId);
	}

	clearProject(projectId, projectCwd) {
		return clearProject(this, projectId, projectCwd);
	}

	/***
	 * MARK: _resolveStagesForTask
	 * @description Resolves the ordered workflow stages for a specific task based on its workflowId and project.
	 * @param {Object} project
	 * @param {Object} task
	 * @returns {Array<Object>}
	 ***/
	_resolveStagesForTask(project, task) {
		return resolveStagesForTask(project, task);
	}

	findNextCandidateTask() {
		return findNextCandidateTask(this);
	}

	async scheduleTick(opts = {}) {
		return scheduleTick(this, opts);
	}

	/***
	 * MARK: notifyQueueEmpty
	 * @description Push seam for the scheduler's active→idle transition
	 *   (see `scheduleTick`'s `_schedulerWasActive` latch). Lazy-imports the
	 *   push singleton so `taskStore.js` never gains a load-time dependency
	 *   on push state, crypto, or disk — and swallows every failure so a
	 *   notification problem can never break scheduling. Overridable in
	 *   tests (assign a stub) to observe the trigger without sending.
	 * @param {Object} [opts] - Forwarded to the push service (humanPendingCount).
	 * @example await taskStore.notifyQueueEmpty({ humanPendingCount: 1 })
	 ***/
	async notifyQueueEmpty(opts = {}) {
		return notifyQueueEmptyFn(opts);
	}

	/***
	 * MARK: notifyStagePush
	 * @description Push seam for human-intervention stage failures (see
	 *   `resolveStageErrorPushReason`). Same lazy, never-throw contract as
	 *   `notifyQueueEmpty`; overridable in tests.
	 * @param {Object} [payload] - `{ projectId, taskId, stage, error, reason }`.
	 * @example await taskStore.notifyStagePush({ projectId: "p1", taskId: "t1", reason: "unrecoverable" })
	 ***/
	async notifyStagePush(payload = {}) {
		return notifyStagePushFn(payload);
	}

	/***
	 * MARK: notifySchedulerStall
	 * @description Push seam for destructive wedge recoveries (a queue entry
	 *   was force-settled and its occupant routed to the transient ladder).
	 *   Same lazy, never-throw contract as `notifyQueueEmpty`; overridable
	 *   in tests. Fired at most once per wedge episode (the recovery helper
	 *   latches on `_wedgedStallNotified`, cleared by the next dispatch).
	 * @param {Object} [detail] - `{ taskId, projectId, ageMs, reason }`.
	 * @example await taskStore.notifySchedulerStall({ taskId: "t1", reason: "engine-idle" })
	 ***/
	async notifySchedulerStall(detail = {}) {
		return notifySchedulerStallFn(detail);
	}

	/***
	 * MARK: settleWedgedEntryForTask
	 * @description Synchronous latch release for one task's in-flight queue
	 *   entry: when `taskId` owns the live entry, force-settles it so the
	 *   queue unparks immediately (operator abort/retry must not wait for a
	 *   never-settling run, nor round-trip through the scheduler tick).
	 *   Settles NOTHING when another task owns the entry, when the queue is
	 *   idle, or when the entry already settled — check the return value.
	 *   Never throws.
	 * @param {string} taskId
	 * @param {Error|string} [error] - Settle reason recorded on the rejection.
	 * @returns {boolean} Whether this task's entry was settled.
	 ***/
	settleWedgedEntryForTask(taskId, error) {
		return settleWedgedEntryForTaskFn(this, taskId, error);
	}

	/***
	 * MARK: kickScheduler
	 * @description Arms a debounced (~150 ms) scheduler re-tick for moments that
	 *   create newly runnable work. No-op unless the scheduler is running, so an
	 *   explicit stop stays stopped. Safe to call redundantly: overlapping kicks
	 *   collapse into one, and scheduleTick re-checks the busy gate.
	 * @example taskStore.kickScheduler()
	 * @param {Object} [opts]
	 * @returns {boolean} Whether a re-tick was armed.
	 ***/
	kickScheduler(opts = {}) {
		return kickScheduler(this, opts);
	}

	/***
	 * MARK: ensureScheduler
	 * @description Restarts the scheduler interval when it claims to run but
	 *   lost its timer. No-op when stopped or when the timer is alive.
	 * @example taskStore.ensureScheduler()
	 * @param {Object} [opts]
	 * @returns {boolean} Whether a timer is now armed.
	 ***/
	ensureScheduler(opts = {}) {
		return ensureScheduler(this, opts);
	}

	/***
	 * MARK: _kickIfRunnable
	 * @description Kicks the scheduler when a mutation just left a task
	 *   runnable (`in_stage`), so create/resume/retry/approve/abort pick up
	 *   within one debounce instead of one full interval.
	 * @param {Object|null} task
	 * @returns {Object|null} The task, unchanged.
	 * @private
	 ***/
	_kickIfRunnable(task) {
		return kickIfRunnableFn(this, task);
	}

	async reconcileInterruptedDeploys() {
		return runInterruptionReconcilePlugins(this);
	}

	reconcileInterruptedRuns() {
		return reconcileInterruptedRuns(this);
	}

	autoResumeTask(projectId, taskId, projectCwd) {
		return autoResumeTask(this, projectId, taskId, projectCwd);
	}

	isAutoResumable(task, stage, opts) {
		return isAutoResumable(task, stage, opts);
	}

	isSchedulerRunnable(task, stage, opts) {
		return isSchedulerRunnable(task, stage, opts);
	}

	findResumedCandidate() {
		return findResumedCandidate(this);
	}

	/***
	 * MARK: performStartupRecovery
	 * @description Establishes the initial queue after a stop/crash/restart:
	 *   orphan reconcile → awaited continuity-plugin reconcile → auto-resume
	 *   eligible interruptions → scheduler start + kick. See
	 *   `api/flow/startupRecovery.js` for the ordering contract.
	 * @example await taskStore.performStartupRecovery({ promptEngine, agentRunner })
	 * @param {Object} [opts]
	 * @returns {Promise<Object>} Recovery summary.
	 ***/
	async performStartupRecovery(opts = {}) {
		return performStartupRecovery(this, opts);
	}

	_completeDeployStage(
		projectId,
		taskId,
		stage,
		stages,
		projectCwd,
		lastResult,
	) {
		// Legacy entry point: deploy continuity now lives in the
		// implementation-specific plugin
		// (`api/continuity/kainbainSelfDeploy.js`). Kept as a no-op so older
		// callers do not throw; continuity decisions flow through the
		// lifecycle seam instead.
		void [projectId, taskId, stage, stages, projectCwd, lastResult];
		return null;
	}

	startScheduler(opts = {}) {
		return startScheduler(this, opts);
	}

	getScheduledQueue(filterProjectId) {
		return getScheduledQueue(this, filterProjectId);
	}

	async getObservabilityMetrics(filterProjectId) {
		return computeObservabilityMetrics(this, filterProjectId);
	}

	stopScheduler() {
		return stopScheduler(this);
	}
}

export const taskStore = new TaskStore();
