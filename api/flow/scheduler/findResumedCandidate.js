import {
	resolveCandidateStage,
	resolveStagesForTask,
} from '../stageResolution.js';
import {
	RESUMED_PRIORITY_REASON,
} from '../routing/tables/index.js';
import { interruptionTimestampMs } from './interruptionTimestampMs.js';
import { isResumedAfterInterruption } from './isResumedAfterInterruption.js';
import { resumedTimestampMs } from './resumedTimestampMs.js';
import { isResumedStageRunnable } from './isResumedStageRunnable.js';
import { isSchedulerRunnable } from './isSchedulerRunnable.js';

/***
 * MARK: findResumedCandidate
 * @description Rule 0 pickup: the oldest auto-resumable interruption across
 *   all projects (oldest interruption first). Two shapes qualify: still-
 *   `interrupted` tasks left by a stop/crash, and `in_stage` tasks carrying
 *   the durable `resumedAfterInterruption` marker from startup recovery
 *   (which must keep their priority even though the `interrupted` label is
 *   gone). Both sort ahead of fresh `in_stage` work (including follow-ons)
 *   so a restart picks up straight where it left off. Tasks that fail the
 *   auto-resume policy (markerless merge, human/paused/blocked) stay parked
 *   for the operator or the continuity plugin and never surface here.
 * @param {Object} store
 * @returns {Object|null} Candidate with `priorityReason: "resumed_interrupted"`.
  * @example findResumedCandidate(store) => { task, priorityReason: "resumed_interrupted", … }
 ***/
export function findResumedCandidate(store) {
	if (
		!store.projectStore ||
		typeof store.projectStore.listProjects !== "function"
	) {
		return null;
	}
	const interrupted = [];
	for (const project of store.projectStore.listProjects()) {
		let tasks;
		try {
			tasks = store.listTasks(project.id, project.cwd);
		} catch {
			continue;
		}
		for (const task of tasks) {
			const isMarked = isResumedAfterInterruption(task);
			if (task?.status !== "interrupted" && !isMarked) continue;
			let stages = [];
			let stage = null;
			let blocked = false;
			try {
				stages = resolveStagesForTask(project, task);
				stage = resolveCandidateStage(stages, task.currentStageId);
				if (!stage) continue;
				blocked = store.isTaskBlocked(project.id, task.id)?.blocked === true;
			} catch {
				continue;
			}
			if (isMarked) {
				if (!isResumedStageRunnable(stage, { blocked, task })) continue;
			} else if (
				!isSchedulerRunnable(task, stage, {
					blocked,
					allowInterrupted: true,
				})
			) {
				continue;
			}
			interrupted.push({
				projectId: project.id,
				taskId: task.id,
				task,
				stage,
				stages,
				projectCwd: project.cwd,
				interruptedAt: isMarked
					? resumedTimestampMs(task)
					: interruptionTimestampMs(task),
			});
		}
	}
	if (interrupted.length === 0) return null;
	// Oldest interruption first: the task waiting longest resumes first.
	interrupted.sort((a, b) => a.interruptedAt - b.interruptedAt);
	const top = interrupted[0];
	return {
		projectId: top.projectId,
		taskId: top.taskId,
		task: top.task,
		stage: top.stage,
		stages: top.stages,
		projectCwd: top.projectCwd,
		priorityReason: RESUMED_PRIORITY_REASON,
	};
}
