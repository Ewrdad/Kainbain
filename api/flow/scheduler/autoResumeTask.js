import {
	resolveCandidateStage,
	resolveStagesForTask,
} from '../stageResolution.js';
import { collectResumeEvidence } from './collectResumeEvidence.js';

/***
 * MARK: autoResumeTask
 * @description Transitions one `interrupted` task back to runnable
 *   (`in_stage`) exactly the way manual `resumeTask` does — cleared
 *   `wasInterrupted`, fresh auto-iteration budget, history entry, persisted
 *   markdown — but WITHOUT dispatching execution itself. Additionally stamps
 *   the durable `resumedAfterInterruption` marker (plus an `interruptedAt`
 *   snapshot of the pre-flip timestamp, so oldest-interruption ordering
 *   survives the flip) that keeps Rule 0 priority until the first dispatch
 *   consumes it. The caller is either startup recovery (the normal
 *   `scheduleTick` then dispatches under the busy gate) or `scheduleTick`
 *   (which dispatches immediately after). Never calls `executeStage`
 *   directly, so the single-active invariant holds. Idempotent: a
 *   non-interrupted task is returned untouched.
 * @param {Object} store
 * @param {string} projectId
 * @param {string} taskId
 * @param {string} [projectCwd]
 * @returns {Object|null} The task, or null when unknown.
  * @example autoResumeTask(store, "p1", "t1") => task (status "in_stage")
 ***/
export function autoResumeTask(store, projectId, taskId, projectCwd, { reason } = {}) {
	const task = store.getTask(projectId, taskId);
	if (!task || task.status !== "interrupted") return task || null;
	// Snapshot BEFORE the flip: `updatedAt` is about to become "now" for
	// every resumed task, which would destroy oldest-first ordering.
	task.interruptedAt =
		task.updatedAt || task.enteredStageAt || new Date().toISOString();
	task.resumedAfterInterruption = true;
	task.wasInterrupted = false;
	task.status = "in_stage";
	task.updatedAt = new Date().toISOString();
	if (typeof store._resetAutoIteration === "function") {
		store._resetAutoIteration(task);
	}
	const historyAction =
		"Auto-resumed after server restart — prioritised in queue";
	if (typeof store._recordHistory === "function") {
		try {
			store._recordHistory(task, historyAction, task.updatedAt);
		} catch {
			// History is best-effort; the flip already happened.
		}
	}
	// WP6 auto-resume evidence: every resume records WHAT was discovered
	// (markers present, SHAs, verdict) into the timeline so an operator can
	// audit the decision. Best-effort: evidence gathering must never break
	// the flip.
	try {
		const evidence = collectResumeEvidence(store, task);
		let stageLabel = task.currentStageId || "stage";
		try {
			const project =
				typeof store.projectStore?.getProject === "function"
					? store.projectStore.getProject(projectId)
					: null;
			if (project) {
				const stages = resolveStagesForTask(project, task);
				const stage = resolveCandidateStage(stages, task.currentStageId);
				if (stage?.name || stage?.id) stageLabel = stage.name || stage.id;
			}
		} catch {
			// Label resolution is best-effort; the evidence still records.
		}
		if (typeof store._recordTimeline === "function") {
			store._recordTimeline(task, {
				stage: stageLabel,
				status: "Resumed",
				reason: reason || historyAction,
				...evidence,
			});
		}
	} catch {
		// Timeline evidence is best-effort; the flip already happened.
	}
	const cwd =
		typeof store._resolveProjectCwd === "function"
			? store._resolveProjectCwd(projectId, projectCwd)
			: projectCwd;
	if (typeof store._saveTaskMarkdown === "function") {
		store._saveTaskMarkdown(cwd, task);
	}
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);
	return task;
}
