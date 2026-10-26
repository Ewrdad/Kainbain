// Domain: The Flow — operator intervention and task process control (abort, reject, follow-up, steer, and process group management).
import { _appendProcessLog, AUTO_REPORT_MARKER } from '../watch/index.js';
import { isBranchModeEnabled } from '../work/taskBranches.js';
import { stageElapsedSeconds, clearResumedMarker, isEngineOwnerOf } from './stagePolicy.js';
import { buildHumanRejectionContent } from '../reviewCommentFormatter.js';
import { killProcessTreeSync } from '../utils/processTree.js';

/***
 * MARK: registerChild
 * @description Registers a running child process for a task so it can be terminated on skip/abort/timeout.
 ***/
export function registerChild(store, taskId, child) {
	if (child && typeof child.pid === "number") {
		store._activeChildren.set(String(taskId), child);
	}
}

/***
 * MARK: unregisterChild
 * @description Removes a task's child process reference once it has exited.
 ***/
export function unregisterChild(store, taskId) {
	store._activeChildren.delete(String(taskId));
}

/***
 * MARK: killTaskProcess
 * @description Terminates the running child process for a task, including its whole process group.
 ***/
export function killTaskProcess(store, taskId, opts = {}) {
	const child = store._activeChildren.get(String(taskId));
	if (!child || typeof child.pid !== "number") return false;
	try {
		killProcessTreeSync(child.pid, { child, ...opts });
	} catch {
		// already gone or safe fallback
	}
	unregisterChild(store, taskId);
	return true;
}

/***
 * MARK: abortTask
 * @description Safely aborts the active stage execution for a task and resets engine state to idle.
 ***/
export function abortTask(store, projectId, taskId, projectCwd) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;

	// Unpark the queue synchronously when this task owns the live entry: an
	// abort must take effect now, not after a never-settling run deigns to
	// finish (and not via a scheduler tick that the wedged latch would skip).
	// The late run still settles on its own; its duplicate routing is
	// absorbed by the normal abort/failure path.
	try {
		store.settleWedgedEntryForTask?.(
			taskId,
			new Error(`Task ${taskId} aborted by operator; queue entry force-settled`),
		);
	} catch {
		// Settle is best-effort; the kill below still lands.
	}

	killTaskProcess(store, taskId);

	if (store.sessionStore && typeof store.sessionStore.get === "function") {
		try {
			const activeSession = store.sessionStore.get(projectId);
			if (typeof activeSession?.abort === "function") {
				activeSession.abort();
			}
		} catch (e) {
			// ignore abort error
		}
	}

	task.status = "in_stage";
	task.wasInterrupted = false;
	// An abort parks the task: any startup-recovery priority is consumed so
	// the scheduler does not instantly re-dispatch what the operator stopped.
	clearResumedMarker(task);
	task.updatedAt = new Date().toISOString();
	store._recordHistory(
		task,
		"Stage execution aborted manually by operator",
		task.updatedAt,
	);
	store._saveTaskMarkdown(projectCwd, task);

	if (isEngineOwnerOf(store.engineState, taskId)) {
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
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);
	return task;
}

/***
 * MARK: rejectTask
 * @description Human review rejection: records human feedback, appends it to task goal/feedback, and fails the task back.
 * @description The rejection reason stays on the failed-back task as its failure context (failureReason plus a lastError marked failureKind "rejected") so the task view flags it REJECTED with the reason at the top, while the task itself stays agent-ready (in_stage) for the next pickup — where executeStage snapshots the reason into the next attempt's prompt.
 * @description `reviewComments` (line-by-line threads from the checkpoint) join the `# Human rejection` report unless the feedback draft already carries them.
 * @example rejectTask(store, "p1", "t1", stages, "missing validation", undefined, "/repo", comments) => (task failed back, failureReason kept)
 ***/
export function rejectTask(
	store,
	projectId,
	taskId,
	stages = [],
	feedback,
	bridge = store.eventBridge,
	projectCwd,
	reviewComments = [],
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	const cleanFeedback = String(feedback || "").trim();
	const stage = stages.find(
		(item) => String(item.id) === String(task.currentStageId),
	);
	store.saveStageReport(projectId, taskId, {
		stageName: stage?.name || task.currentStageId,
		stageId: task.currentStageId,
		duration: stageElapsedSeconds(task),
		status: "FAILED",
		content: `${AUTO_REPORT_MARKER}\n${buildHumanRejectionContent({
			feedback: cleanFeedback,
			comments: reviewComments,
		})}`,
		projectCwd,
	});

	task.feedback = cleanFeedback;
	store._resetAutoIteration(task);
	if (cleanFeedback) {
		task.goal = `${task.goal}\n\n## Human Correction / Feedback\n${cleanFeedback}`;
		task.body = task.goal;
	}
	const rejectionReason = cleanFeedback || "No feedback";
	task.failureReason = rejectionReason;
	task.lastError = {
		message: rejectionReason,
		stageId: stage?.id,
		stageName: stage?.name || stage?.id,
		stageType: stage?.type || "human",
		failureKind: "rejected",
		timestamp: new Date().toISOString(),
	};
	task.history.push({
		timestamp: new Date().toISOString(),
		action: `Rejected by human review: ${cleanFeedback || "No feedback"}`,
	});
	// The timeline carries the structured reason (same shape as agent
	// failures in stageFailureRouting) so the history timeline renders the
	// rejection note instead of a silent failback row.
	const rejectionDuration = stageElapsedSeconds(task);
	store._recordTimelineWithDiffStat(
		task,
		{
			stage: stage?.name || stage?.id || task.currentStageId,
			status: "Failed",
			duration:
				rejectionDuration === undefined ? "--" : `${rejectionDuration}s`,
			durationSeconds: rejectionDuration,
			durationStageId: stage?.id || task.currentStageId,
			durationStartedAt: task.enteredStageAt,
			timestamp: new Date().toISOString(),
			reason: cleanFeedback || "No feedback",
			stageId: stage?.id,
			stageName: stage?.name || stage?.id,
		},
		projectCwd,
		{ useBranches: isBranchModeEnabled(store.projectStore, projectId) },
	);
	_appendProcessLog(
		task,
		`[HUMAN] Rejected by human review: ${cleanFeedback || "No feedback"}`,
	);
	store._saveTaskMarkdown(projectCwd, task);

	const failedBackTask = store.failbackStage(
		projectId,
		taskId,
		stages,
		null,
		bridge,
		projectCwd,
	);
	// Every stage transition clears failure context, so re-apply the
	// rejection after the failback: the task keeps its REJECTED flag and
	// reason banner while staying agent-ready for the next pickup.
	const settledTask = failedBackTask || task;
	settledTask.failureReason = rejectionReason;
	settledTask.lastError = {
		message: rejectionReason,
		stageId: stage?.id,
		stageName: stage?.name || stage?.id,
		stageType: stage?.type || "human",
		failureKind: "rejected",
		timestamp: new Date().toISOString(),
	};
	store._saveTaskMarkdown(projectCwd, settledTask);
	return failedBackTask;
}

/***
 * MARK: followUpTask
 * @description Injects a follow-up prompt into an active or waiting task and dispatches to agent session if running.
 ***/
export async function followUpTask(
	store,
	projectId,
	taskId,
	prompt,
	{
		session,
		projectCwd,
		stages = [],
		agentRunner = store.defaultAgentRunner,
		promptEngine = store.defaultPromptEngine,
	} = {},
) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	const cleanPrompt = String(prompt || "").trim();
	if (!cleanPrompt) return task;

	task.goal = `${task.goal}\n\n## Follow-up Guidance\n${cleanPrompt}`;
	task.body = task.goal;
	task.updatedAt = new Date().toISOString();
	store._recordHistory(
		task,
		`Manual follow-up submitted: ${cleanPrompt}`,
		task.updatedAt,
	);
	store._saveTaskMarkdown(projectCwd, task);
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);

	if (
		session &&
		session.isStreaming &&
		typeof session.followUp === "function"
	) {
		await session.followUp(cleanPrompt);
	} else if (
		task.status === "interrupted" ||
		task.status === "in_stage" ||
		task.status === "waiting_human"
	) {
		if (agentRunner) {
			await store.executeStage(projectId, taskId, {
				stages,
				projectCwd,
				agentRunner,
				promptEngine,
				priority: "high",
			});
		}
	}
	return store.getTask(projectId, taskId) || task;
}

/***
 * MARK: steerTask
 * @description Provides steering guidance to an executing agent session.
 ***/
export async function steerTask(store, projectId, taskId, guidance, { session, projectCwd } = {}) {
	const task = store.getTask(projectId, taskId);
	if (!task) return null;
	const cleanGuidance = String(guidance || "").trim();
	if (!cleanGuidance) return task;

	task.goal = `${task.goal}\n\n## Steering Guidance\n${cleanGuidance}`;
	task.body = task.goal;
	task.updatedAt = new Date().toISOString();
	store._recordHistory(
		task,
		`Steering guidance provided: ${cleanGuidance}`,
		task.updatedAt,
	);
	store._saveTaskMarkdown(projectCwd, task);
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);

	if (session && typeof session.steer === "function") {
		await session.steer(cleanGuidance);
	}
	return task;
}
