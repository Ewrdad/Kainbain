// Domain: The Flow — stage transition lifecycle (moving, advancing, failing back, pausing, resuming, retrying, completing).
import { _appendProcessLog, AUTO_REPORT_MARKER } from '../watch/index.js';
import { emitAlert } from '../observability/alerts.js';
import { isBranchModeEnabled } from '../work/taskBranches.js';
import { docsTasksIgnorePath } from "../docsPath.js";
import { normalizeStageType } from '../projectStore.js';
import { buildHumanApprovalContent } from '../reviewCommentFormatter.js';
import {
	formatAutoApproveDuration,
	parseAutoApproveDuration,
	resolveAutoApproveAt,
} from '../../shared/autoApproveDuration.js';
import { isTerminalTaskStatus, resolveStageLabel, stageElapsedSeconds, clearResumedMarker, findStageByIdOrName, findStageIndexByIdOrName, isEngineOwnerOf } from './stagePolicy.js';
import { resolveStagesForTask } from './taskScheduler.js';
import { killTaskProcess } from './taskControl.js';
import { buildTimelineAttribution } from './runAttribution.js';

/***
 * MARK: releaseEngineOwnership
 * @description Releases the engine to idle and clears every ownership field
 *   in one write, so no partial reset can leave a stranded `activeStageId`
 *   behind for a monitor surface to read. Single home for the reset shape
 *   (used by interruptLiveRun and the checkpoint-release path); the field
 *   list must stay in sync with abortTask's teardown in taskControl.js.
 * @param {Object} store - The TaskStore (mutated in place).
 ***/
function releaseEngineOwnership(store) {
	store.setEngineState({
		status: "idle",
		activeTaskId: null,
		activeProjectId: null,
		activeProjectName: null,
		activeStageId: null,
		activeStageName: null,
		activeStageType: null,
	});
}

/***
 * MARK: interruptLiveRun
 * @description Stops a task's live execution (child process group plus agent
 *   session) and releases engine ownership when it holds it. The task status
 *   itself is left for the caller to set (paused/completed), so the stop is
 *   never mistaken for a stage outcome. Mirrors abortTask's teardown without
 *   its status reset.
 * @returns {boolean} Whether this task owned the engine.
 ***/
function interruptLiveRun(store, projectId, taskId) {
	killTaskProcess(store, taskId);
	if (store.sessionStore && typeof store.sessionStore.get === "function") {
		try {
			const activeSession = store.sessionStore.get(projectId);
			if (typeof activeSession?.abort === "function") {
				activeSession.abort();
			}
		} catch {
			// ignore abort error
		}
	}
	const wasOwner = isEngineOwnerOf(store.engineState, taskId);
	if (wasOwner) {
		releaseEngineOwnership(store);
	}
	return wasOwner;
}

/***
 * MARK: moveToStage
 * @description Moves a task to an explicit workflow stage, updating timestamps, history, and notifying clients.
 * Writes an arrival-centric timeline row: stage = destination, status =
 * Moved/Advanced, duration = time spent in the FROM stage (attributed via
 * durationStage/durationStageId for analytics). This is deliberately NOT
 * paired with the Failed outcome row that precedes it on failback (that row
 * records stage = source): the display layer (buildDisplayTimeline) owns
 * rendering the pair honestly, and the arrival row is load-bearing for
 * diff-stat baselines, so the write pair must stay as-is.
 * Auto-approve rule: entering a `human` stage with an `autoApproveAfterMs`
 * hold stamps `task.autoApproveAt = enteredStageAt + hold` once (immutable
 * for this visit — later config edits affect only future entries); every
 * other destination clears the stamp and its reminder marker, so a stale
 * deadline can never fire after the task left. `options.automated` marks an
 * arrival driven by the auto-approve sweeper (history + timeline badge only;
 * the row status stays Advanced for analytics).
 ***/
export function moveToStage(
	store,
	projectId,
	taskId,
	stageId,
	reason = "Moved",
	bridge = store.eventBridge,
	projectCwd,
	options = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	const fromStageId = task.currentStageId;
	const durationStartedAt = task.enteredStageAt;
	const durationSeconds = stageElapsedSeconds(task);

	let projStages = [];
	let targetStage = null;
	if (store.projectStore && typeof store.projectStore.getProject === "function") {
		const proj = store.projectStore.getProject(projectId);
		projStages = resolveStagesForTask(proj, task) || [];
		targetStage = findStageByIdOrName(projStages, stageId);
	}
	const toLabel = targetStage?.name || resolveStageLabel(stageId, projStages);
	const fromLabel = fromStageId
		? resolveStageLabel(fromStageId, projStages)
		: null;
	task.currentStageId = stageId;
	// A stage change ends any automatic retry/iteration context that belonged
	// to the previous stage: the task is now at a new stage, so it must not
	// keep reading as "retrying" the failed stage (or carry stale auto-run
	// flags forward). Iteration counters are deliberately preserved so retry
	// budgets remain auditable across moves; only the live flags reset.
	task.autoRetrying = false;
	task.autoIterating = false;
	// A stage change consumes any startup-recovery priority: the task is no
	// longer sitting where the interruption left it, so it competes as
	// normal work from here on.
	clearResumedMarker(task);

	// Normalized at the transition boundary so a legacy `review` checkpoint
	// parks as human exactly like an explicit `human` stage; the raw type is
	// only kept as a display label.
	const stageType = normalizeStageType(targetStage?.type);
	if (stageType === "human") {
		task.status = "waiting_human";
	} else {
		task.status = "in_stage";
	}
	task.failureReason = null;
	task.lastError = null;

	task.enteredStageAt = new Date().toISOString();
	task.updatedAt = task.enteredStageAt;
	// Auto-approve deadline stamp (see the MARK note above): stamped once on
	// entry to a human stage with a hold, cleared on every other arrival.
	const entryHoldMs =
		stageType === "human"
			? parseAutoApproveDuration(targetStage?.autoApproveAfterMs)
			: null;
	if (entryHoldMs) {
		task.autoApproveAt = resolveAutoApproveAt(task.enteredStageAt, entryHoldMs);
		task.autoApproveRemindedAt = null;
	} else {
		task.autoApproveAt = null;
		task.autoApproveRemindedAt = null;
	}
	const automatedArrival =
		options?.automated && typeof options.automated === "object"
			? options.automated
			: null;
	task.history.push({
		timestamp: task.updatedAt,
		action: automatedArrival
			? `Advanced to stage '${toLabel}' (automatic)`
			: `${reason} to stage '${toLabel}'`,
	});
	// Arrival rows never carry run attribution: a row's badge must describe
	// the run of the stage the row is headed with, and that stamp happens at
	// agent dispatch (executeStage stamps this stage's own arrival row).
	// Stamping here would put the FROM stage's agent badge on the TO stage's
	// row — visibly misattributing a model to a human / CI stage.
	store._recordTimelineWithDiffStat(
		task,
		{
			stage: toLabel,
			status: reason === "Advanced" ? "Advanced" : "Moved",
			duration: durationSeconds === undefined ? "--" : `${durationSeconds}s`,
			durationSeconds,
			durationStage: fromLabel,
			durationStageId: fromStageId,
			durationStartedAt,
			timestamp: task.updatedAt,
			// Sweeper-driven arrivals badge the row without changing its
			// status (analytics keep reading Advanced/Moved).
			...(automatedArrival
				? {
						automated: true,
						autoApproveAt: automatedArrival.autoApproveAt || null,
						autoApproveFiredAt: automatedArrival.firedAt || null,
					}
				: {}),
		},
		projectCwd,
		{
			useBranches: isBranchModeEnabled(store.projectStore, projectId),
			docsTasksPrefix: docsTasksIgnorePath(
				store.projectStore?.getProject?.(projectId),
			),
		},
	);
	// The run that produced this row's duration is over: drop its pending
	// choice so a later transition (e.g. the Completed row) can never
	// inherit a previous stage's model. The run's own badge already sits on
	// its own arrival row, stamped at its dispatch.
	task.currentRunAttribution = null;
	_appendProcessLog(
		task,
		`[INFO] ${reason} from stage ${fromLabel ? `'${fromLabel}'` : "none"} to stage '${toLabel}'`,
	);

	bridge?.emitProcessEvent?.(projectId, "stage:enter", {
		taskId,
		fromStageId,
		stageId,
		stageType,
		stageName: targetStage?.name || stageId,
		reason,
	});
	if (stageType === "human") {
		// Scheduled checkpoint: the same WebSocket emission as before, routed
		// through the alert seam as `task.checkpoint_wait`/`info` so every
		// alert consumer sees the scheduled-vs-unscheduled distinction.
		void emitAlert(bridge, {
			event: "task.checkpoint_wait",
			severity: "info",
			projectId,
			taskId,
			stage: { id: stageId, name: targetStage?.name || stageId, type: stageType },
			message: "Awaiting human approval",
			ui: {
				event: "stage:checkpoint_wait",
				payload: {
					taskId,
					stageId,
					stageName: targetStage?.name || stageId,
					message: "Awaiting human approval",
				},
			},
		});
	}
	store._saveTaskMarkdown(projectCwd, task);

	bridge?.broadcastGlobal?.("TASK_UPDATED", task);

	// Engine-owner reconciliation: the task's stage just changed, so the
	// engine snapshot must move with it in the same transition. Otherwise the
	// badge keeps naming the stage the task left while the card shows the new
	// one — the "ACTIVE: <old stage>" desync reported in task 072e2cfa.
	if (isEngineOwnerOf(store.engineState, taskId)) {
		if (options.operatorMove) {
			// A manual move/jump is an explicit operator override of a live run:
			// the in-flight execution belongs to the stage the task just left,
			// so stop it and release the engine (the same teardown as
			// abort/complete). The task stays parked at the destination.
			// Record the abandoned stage BEFORE interrupting: a command-stage
			// run surfaces the kill as a plain non-zero exit (no
			// operator-abort marker), so without this its settle would fail
			// back with a spurious failureReason and auto-retry, undoing the
			// move. handleStageFailure settles a run whose stage no longer
			// matches the task quietly and consumes this marker.
			// The marker is intentionally memory-only (never written to the
			// task markdown frontmatter): the orphaned run it describes dies
			// with this process, so after a restart there is nothing to
			// quiet — startup recovery re-parks the task via the orphaned
			// running-status collapse instead. A stale marker can therefore
			// never suppress a post-restart failure.
			if (
				fromStageId != null &&
				String(fromStageId) !== String(stageId)
			) {
				task.supersededStageId = fromStageId;
			}
			interruptLiveRun(store, projectId, taskId);
		} else if (store.engineState.status === "checkpoint") {
			// Advancing out of a human checkpoint releases the parked engine.
			releaseEngineOwnership(store);
		} else {
			// Automatic advance/failback while the run settles (or a paused
			// owner): keep the engine state but re-point the displayed stage at
			// the destination so no reader sees a stranded stage.
			store.setEngineState({
				activeStageId: targetStage?.id ?? stageId,
				activeStageName: toLabel,
				activeStageType: stageType,
			});
		}
	}

	return task;
}

/***
 * MARK: resolveAutomatedApprovalDetail
 * @description Builds the audit detail for a sweeper-driven human exit:
 *   fire time, stamped deadline, held-since entry, and the rendered hold
 *   length. Every field degrades to a readable fallback (never undefined)
 *   so attribution text can always be written; the duration prefers the
 *   sweeper-passed value and falls back to the stamp-minus-entry span.
 * @example resolveAutomatedApprovalDetail({ enteredStageAt: '2026-11-01T00:00:00.000Z' }, { automated: true, durationMs: 60000 }) => { firedAt, … }
 * @param {Object} task - Task leaving the checkpoint.
 * @param {Object} humanReview - Sweeper marker (`automated/autoApproveAt/firedAt/durationMs`).
 * @returns {Object} `{ firedAt, autoApproveAt, heldSince, durationMs, durationText }`.
 ***/
function resolveAutomatedApprovalDetail(task, humanReview) {
	const firedAt =
		typeof humanReview?.firedAt === "string" && humanReview.firedAt
			? humanReview.firedAt
			: new Date().toISOString();
	const autoApproveAt =
		(typeof humanReview?.autoApproveAt === "string" && humanReview.autoApproveAt) ||
		(typeof task?.autoApproveAt === "string" && task.autoApproveAt) ||
		"unknown deadline";
	const heldSince =
		(typeof task?.enteredStageAt === "string" && task.enteredStageAt) ||
		"unknown time";
	let durationMs =
		typeof humanReview?.durationMs === "number" &&
		Number.isFinite(humanReview.durationMs) &&
		humanReview.durationMs > 0
			? humanReview.durationMs
			: null;
	if (durationMs === null) {
		const span = Date.parse(autoApproveAt) - Date.parse(heldSince);
		if (Number.isFinite(span) && span > 0) durationMs = span;
	}
	return {
		firedAt,
		autoApproveAt,
		heldSince,
		durationMs,
		durationText: formatAutoApproveDuration(durationMs) || "the configured hold",
	};
}

/***
 * MARK: advanceStage
 * @description Advances a task to the next sequential stage in the project pipeline and persists to disk.
 *   When leaving a human checkpoint, `humanReview.comments` (line-by-line review
 *   threads) and `humanReview.guidance` are folded into the `# Human approval`
 *   report, so a pass keeps the reviewer's notes in the durable record.
 *   The auto-approve sweeper takes this same path with
 *   `humanReview.automated: true` (plus `autoApproveAt`/`firedAt`/
 *   `durationMs`): the exit stays a PASS, but the history line, timeline
 *   row, report header, and alert all say *automatic* with the deadline and
 *   fire time. Manual exits (no marker) render byte-identically to before.
 * @example advanceStage(store, 'p1', 't1', stages, bridge, '/repo', { comments, guidance: 'ship it' })
 * @param {Object} store - TaskStore instance.
 * @param {Object} [humanReview] - `{ comments?: Array, guidance?: string, automated?: boolean, autoApproveAt?: string, firedAt?: string, durationMs?: number }` for the exiting human stage.
 ***/
export function advanceStage(
	store,
	projectId,
	taskId,
	stages = [],
	bridge = store.eventBridge,
	projectCwd,
	humanReview = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	// Terminal tasks never advance: a manual complete that lands while a run
	// is in flight must stick when the orphaned run settles.
	if (isTerminalTaskStatus(task.status)) return task;
	let effectiveStages = stages;
	if (!Array.isArray(effectiveStages) || effectiveStages.length === 0) {
		if (
			store.projectStore &&
			typeof store.projectStore.getProject === "function"
		) {
			const proj = store.projectStore.getProject(projectId);
			if (task.workflowId && Array.isArray(proj?.workflows)) {
				const wf = proj.workflows.find((w) => w.id === task.workflowId);
				if (wf?.stages?.length > 0) {
					effectiveStages = wf.stages;
				}
			}
			if (!effectiveStages || effectiveStages.length === 0) {
				effectiveStages = proj?.stages || [];
			}
		}
	}
	if (!Array.isArray(effectiveStages) || effectiveStages.length === 0)
		return task;

	const index = findStageIndexByIdOrName(
		effectiveStages,
		task.currentStageId,
	);
	if (index === -1) {
		const fallback = effectiveStages[0];
		if (!fallback) return task;
		return moveToStage(
			store,
			projectId,
			taskId,
			fallback.id,
			"Advanced (First Stage)",
			bridge,
			projectCwd,
		);
	}
	const exitingStage = effectiveStages.at(index);
	const exitingIsHuman = normalizeStageType(exitingStage?.type) === "human";
	// The sweeper's marker is honoured only on a human exit: an automated
	// flag arriving with any other stage type is meaningless and ignored.
	const automatedDetail =
		exitingIsHuman && humanReview?.automated === true
			? resolveAutomatedApprovalDetail(task, humanReview)
			: null;
	// Human approval reports are written for normalized human checkpoints
	// (legacy `review` included); only agent stages can fail a verdict gate,
	// so a human exit is always a PASS.
	if (exitingIsHuman) {
		// Review comments captured during the checkpoint ride along in the
		// approval report (a line-by-line pass still leaves a written record)
		// and in the optional pass guidance for downstream stages.
		const reviewComments = Array.isArray(humanReview?.comments)
			? humanReview.comments
			: [];
		if (automatedDetail) {
			task.history.push({
				timestamp: automatedDetail.firedAt,
				action:
					`Auto-approved after ${automatedDetail.durationText} (automatic): ` +
					`held since ${automatedDetail.heldSince}, ` +
					`deadline ${automatedDetail.autoApproveAt}, fired ${automatedDetail.firedAt}`,
			});
		}
		store.saveStageReport(projectId, taskId, {
			stageName: exitingStage.name || exitingStage.id,
			stageId: exitingStage.id,
			duration: stageElapsedSeconds(task),
			status: "PASSED",
			content: `${AUTO_REPORT_MARKER}\n${buildHumanApprovalContent({
				stageName: exitingStage.name || exitingStage.id,
				guidance: humanReview?.guidance,
				comments: reviewComments,
				...(automatedDetail ? { automated: automatedDetail } : {}),
			})}`,
			projectCwd,
		});
		if (automatedDetail) {
			// Fire-and-forget: a dead alert sink never affects the advance.
			void emitAlert(bridge, {
				event: "task.auto_approve",
				severity: "info",
				projectId,
				taskId,
				stage: {
					id: exitingStage.id,
					name: exitingStage.name || exitingStage.id,
					type: "human",
				},
				message:
					`Auto-approved after ${automatedDetail.durationText} ` +
					`(deadline ${automatedDetail.autoApproveAt}, fired ${automatedDetail.firedAt})`,
			});
		}
	}
	if (index >= effectiveStages.length - 1) {
		const currentName = effectiveStages.at(index)?.name || "Final Stage";
		bridge?.emitProcessEvent?.(projectId, "stage:complete", {
			taskId,
			stageId: task.currentStageId,
			stageName: currentName,
			nextStageName: null,
			isTerminal: true,
			pipelineFinished: true,
			message: `Stage '${currentName}' complete — pipeline finished`,
		});
		return completeTask(
			store,
			projectId,
			taskId,
			projectCwd,
			automatedDetail ? { automated: automatedDetail } : undefined,
		);
	}
	const currentStage = effectiveStages.at(index);
	const nextStage = effectiveStages.at(index + 1);
	bridge?.emitProcessEvent?.(projectId, "stage:complete", {
		taskId,
		stageId: currentStage?.id,
		stageName: currentStage?.name,
		nextStageId: nextStage?.id,
		nextStageName: nextStage?.name,
		isTerminal: false,
		message: `Stage '${currentStage?.name || currentStage?.id}' complete — advancing to '${nextStage?.name || nextStage?.id}'`,
	});
	return moveToStage(
		store,
		projectId,
		taskId,
		nextStage.id,
		"Advanced",
		bridge,
		projectCwd,
		automatedDetail ? { automated: automatedDetail } : undefined,
	);
}

/***
 * MARK: failbackStage
 * @description Routes a task via its stage failback policy ('start', 'previous', 'abort', or a specific target stage ID).
 ***/
export function failbackStage(
	store,
	projectId,
	taskId,
	stages = [],
	fallbackStageId,
	bridge = store.eventBridge,
	projectCwd,
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	// Terminal tasks never fail back: a late failure from an orphaned run
	// must not resurrect a task the operator already finished.
	if (isTerminalTaskStatus(task.status)) return task;
	let effectiveStages = stages;
	if (!Array.isArray(effectiveStages) || effectiveStages.length === 0) {
		if (
			store.projectStore &&
			typeof store.projectStore.getProject === "function"
		) {
			const proj = store.projectStore.getProject(projectId);
			if (task.workflowId && Array.isArray(proj?.workflows)) {
				const wf = proj.workflows.find((w) => w.id === task.workflowId);
				if (wf?.stages?.length > 0) {
					effectiveStages = wf.stages;
				}
			}
			if (!effectiveStages || effectiveStages.length === 0) {
				effectiveStages = proj?.stages || [];
			}
		}
	}
	const stage = findStageByIdOrName(effectiveStages, task.currentStageId);
	const policy =
		fallbackStageId || stage?.fallbackStageId || stage?.failback || "previous";
	let targetId;

	if (
		fallbackStageId &&
		findStageByIdOrName(effectiveStages, fallbackStageId)
	) {
		targetId = fallbackStageId;
	} else if (policy === "start") {
		targetId = effectiveStages[0]?.id;
	} else if (policy === "abort") {
		store.updateTask(projectId, taskId, { status: "failed" }, projectCwd);
		// A terminal settle cancels any live auto-approve wait.
		task.autoApproveAt = null;
		task.autoApproveRemindedAt = null;
		task.history.push({
			timestamp: new Date().toISOString(),
			action: "Aborted by failback policy",
		});
		_appendProcessLog(task, `[ERROR] Task aborted by stage failback policy`);
		bridge?.emitProcessEvent?.(projectId, "stage:failback", {
			taskId,
			fromStageId: task.currentStageId,
			targetStageId: "abort",
			aborted: true,
		});
		store._saveTaskMarkdown(projectCwd, task);
		return task;
	} else if (policy === "previous") {
		const index = findStageIndexByIdOrName(
			effectiveStages,
			task.currentStageId,
		);
		targetId =
			index > 0 ? effectiveStages[index - 1].id : effectiveStages[0]?.id;
	} else if (policy === "any" && fallbackStageId) {
		targetId = fallbackStageId;
	} else {
		const targetStage = findStageByIdOrName(effectiveStages, policy);
		if (targetStage) {
			targetId = targetStage.id;
		} else {
			const index = findStageIndexByIdOrName(
				effectiveStages,
				task.currentStageId,
			);
			targetId =
				index > 0 ? effectiveStages[index - 1].id : effectiveStages[0]?.id;
		}
	}
	if (!targetId) return task;
	bridge?.emitProcessEvent?.(projectId, "stage:failback", {
		taskId,
		fromStageId: task.currentStageId,
		targetStageId: targetId,
	});
	return moveToStage(
		store,
		projectId,
		taskId,
		targetId,
		"Failed back",
		bridge,
		projectCwd,
	);
}

/***
 * MARK: completeTask
 * @description Transitions a task to the completed state and records terminal history and timeline.
 *   A terminal settle cancels any live auto-approve wait. `options.automated`
 *   (from a sweeper-driven advance out of a final human checkpoint) badges
 *   the terminal timeline row without changing its Completed status.
 ***/
export function completeTask(store, projectId, taskId, projectCwd, options = {}) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	if (task.status === "completed") return task;
	// Completing a task that is mid-run must also stop the run: otherwise the
	// orphaned execution advances or fails back afterwards and the finished
	// task visibly reverts to an automated stage.
	interruptLiveRun(store, projectId, taskId);
	const durationSeconds = stageElapsedSeconds(task);
	task.status = "completed";
	task.failureReason = null;
	task.lastError = null;
	task.autoRetrying = false;
	task.autoIterating = false;
	task.autoApproveAt = null;
	task.autoApproveRemindedAt = null;
	task.updatedAt = new Date().toISOString();
	const automatedTerminal =
		options?.automated && typeof options.automated === "object"
			? options.automated
			: null;
	task.history.push({
		timestamp: task.updatedAt,
		action: "Completed",
	});
	let completedStages = [];
	if (store.projectStore && typeof store.projectStore.getProject === "function") {
		const proj = store.projectStore.getProject(projectId);
		if (proj) {
			completedStages = resolveStagesForTask(proj, task) || [];
		}
	}
	// Timeline attribution on the terminal row: the Completed row is headed
	// with the FINAL stage's own name, so it carries the final run's
	// pending choice only when that run happened in this stage — the same
	// "a row's badge names the run of the row's own stage" rule as the
	// dispatch-time arrival stamps.
	const runAttribution =
		task.currentRunAttribution &&
		String(task.currentRunAttribution.stageId) === String(task.currentStageId)
			? buildTimelineAttribution(task.currentRunAttribution)
			: null;
	// Final-stage close-out (plan §3.2): the terminal row is headed with the
	// final stage's name, so it owns the final stage's commit range. The
	// success path persists the latest range on the task
	// (`currentStageBoundary`, updated by every finalize); attaching it here
	// lets range attribution measure the final delta instead of opening the
	// terminal row at `+0 -0`. Without boundary data the legacy cumulative
	// behaviour is unchanged.
	const finalBoundaryStart =
		(typeof task.currentStageStartSha === "string" &&
			task.currentStageStartSha.trim()) ||
		task.currentStageBoundary?.start ||
		null;
	const finalBoundaryEnd =
		(typeof task.currentStageEndSha === "string" &&
			task.currentStageEndSha.trim()) ||
		task.currentStageBoundary?.end ||
		null;
	store._recordTimelineWithDiffStat(
		task,
		{
			stage: task.currentStageId
				? resolveStageLabel(task.currentStageId, completedStages)
				: "Final Stage",
			status: "Completed",
			duration: durationSeconds === undefined ? "--" : `${durationSeconds}s`,
			durationSeconds,
			durationStageId: task.currentStageId,
			timestamp: task.updatedAt,
			...(runAttribution || {}),
			...(automatedTerminal
				? {
						automated: true,
						autoApproveAt: automatedTerminal.autoApproveAt || null,
						autoApproveFiredAt: automatedTerminal.firedAt || null,
					}
				: {}),
			...(finalBoundaryStart && finalBoundaryEnd
				? {
						boundaryStartSha: finalBoundaryStart,
						boundaryEndSha: finalBoundaryEnd,
					}
				: {}),
		},
		projectCwd,
		{
			useBranches: isBranchModeEnabled(store.projectStore, projectId),
			docsTasksPrefix: docsTasksIgnorePath(
				store.projectStore?.getProject?.(projectId),
			),
		},
	);
	task.currentRunAttribution = null;
	store._saveTaskMarkdown(projectCwd, task);
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);
	return task;
}

/***
 * MARK: pauseTask
 * @description Manually pauses a task's execution and updates engine state.
 *   Pausing also clears any automatic re-run flags: the scheduler only
 *   dispatches `in_stage` tasks, so a queued retry/iteration is definitionally
 *   cancelled the moment the task parks — leaving the flags set would label a
 *   paused task RETRYING. Iteration counters are deliberately preserved so
 *   retry budgets remain auditable across the pause (resume resets them).
 *   Hand-edit contract (see `site-docs/develop-alongside.md`): pause stops
 *   the live run, so edits committed on the task branch while paused survive
 *   the resume — resume re-runs the current stage on that branch.
 ***/
export function pauseTask(store, projectId, taskId, projectCwd) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	// Terminal tasks stay finished: pausing must not revive them.
	if (isTerminalTaskStatus(task.status)) return task;
	// Pausing the active task must halt its live execution, not just flip the
	// status while the agent keeps running to completion behind it.
	const wasOwner = interruptLiveRun(store, projectId, taskId);
	task.status = "paused";
	task.autoRetrying = false;
	task.autoIterating = false;
	// Pausing parks the task out of the queue entirely: any live
	// auto-approve wait is cancelled (re-parking re-stamps a fresh visit).
	task.autoApproveAt = null;
	task.autoApproveRemindedAt = null;
	// A paused task sits out the queue entirely; any startup-recovery
	// priority would be meaningless until an operator resumes it.
	clearResumedMarker(task);
	task.updatedAt = new Date().toISOString();
	store._recordHistory(task, "Task execution paused manually", task.updatedAt);
	store._saveTaskMarkdown(projectCwd, task);

	// Keep the paused task as the engine owner (interruptLiveRun cleared it):
	// the settling run's cleanup recognises its owner and releases the
	// engine to idle instead of stranding a "paused" state with no owner.
	if (wasOwner || isEngineOwnerOf(store.engineState, taskId)) {
		let projectName = projectId;
		try {
			projectName =
				store.projectStore?.getProject?.(projectId)?.name || projectId;
		} catch {
			// display name is best-effort here
		}
		store.setEngineState({
			status: "paused",
			activeTaskId: taskId,
			activeProjectId: projectId,
			activeProjectName: projectName,
		});
	}
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);
	return task;
}

/***
 * MARK: resumeTask
 * @description Resumes a paused or interrupted task and dispatches stage execution.
 ***/
export async function resumeTask(
	store,
	projectId,
	taskId,
	{
		stages = [],
		projectCwd,
		agentRunner = store.defaultAgentRunner,
		promptEngine = store.defaultPromptEngine,
		priority = "high",
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;

	task.wasInterrupted = false;
	// An operator resume serves the pickup directly (dispatch below), so any
	// startup-recovery priority is consumed here rather than lingering.
	clearResumedMarker(task);
	task.status = "in_stage";
	task.updatedAt = new Date().toISOString();
	store._resetAutoIteration(task);
	store._recordHistory(task, "Task execution resumed manually", task.updatedAt);
	store._saveTaskMarkdown(projectCwd, task);
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);

	if (agentRunner) {
		await store.executeStage(projectId, taskId, {
			stages,
			projectCwd,
			agentRunner,
			promptEngine,
			priority,
		});
	}
	return store.getTask(projectId, taskId) || task;
}

/***
 * MARK: retryStage
 * @description Retries execution of a failed, aborted, or rejected stage with a
 *   freshly curated prompt. The task gets a genuinely fresh attempt: every
 *   iteration/timeout loop counter restarts and the stage clock re-enters, so
 *   the failback/auto-retry budget starts over (unlike plain execute, which
 *   keeps counting from the current values).
 ***/
export async function retryStage(
	store,
	projectId,
	taskId,
	{
		stages = [],
		projectCwd,
		agentRunner = store.defaultAgentRunner,
		promptEngine = store.defaultPromptEngine,
		priority = "high",
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;

	task.wasInterrupted = false;
	// A wedged entry owned by this task would strand the retry dispatch
	// behind a corpse: release the latch synchronously first so the enqueue
	// below runs now. Settles nothing when another task owns the entry.
	try {
		store.settleWedgedEntryForTask?.(
			taskId,
			new Error(`Task ${taskId} retried by operator; queue entry force-settled`),
		);
	} catch {
		// Settle is best-effort; the scheduler wedge watchdog guards alone.
	}
	// A manual retry serves the pickup directly (dispatch below), so any
	// startup-recovery priority is consumed here rather than lingering.
	clearResumedMarker(task);
	// Preserve failureReason/lastError here: executeStage snapshots them at entry
	// to reinject the failure into the next attempt's prompt, then clears them.
	// (Clearing here would blind the retried attempt to the failure that parked it.)
	store._resetAutoIteration(task);
	task.status = "in_stage";
	task.updatedAt = new Date().toISOString();
	store._recordHistory(task, "Stage execution retried manually", task.updatedAt);
	store._saveTaskMarkdown(projectCwd, task);
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);

	if (agentRunner) {
		await store.executeStage(projectId, taskId, {
			stages,
			projectCwd,
			agentRunner,
			promptEngine,
			priority,
		});
	}
	return store.getTask(projectId, taskId) || task;
}
