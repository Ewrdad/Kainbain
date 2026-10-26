import {
	circuitSnapshot,
	isTripped,
} from '../circuitBreaker.js';
import {
	candidateStageIndex,
	resolveCandidateStage,
	resolveStagesForTask,
} from '../stageResolution.js';
import { findResumedCandidate } from './findResumedCandidate.js';
import { isSchedulerRunnable } from './isSchedulerRunnable.js';

/***
 * MARK: findNextCandidateTask
 * @description Discovers the next highest-priority task across all projects according to TaskQueueing.md:
 *   Rule 0: Interrupted-but-resumable tasks first (oldest interruption first).
 *   Rule 1: Follow-on from just-completed task.
 *   Rule 2: Closest to completion (furthest right in stage order).
 *   Rule 3: Oldest updated task among ties.
 *   Tier-5 containment is a pre-condition: while the engine is tripped the
 *   scan returns null (recording `store.lastTripDeferral`) unless the caller
 *   explicitly opts into the single half-open canary admission.
 * @param {Object} store
 * @param {Object} [opts]
 * @param {boolean} [opts.ignoreTrip=false] - Admit a candidate despite the trip (canary probe).
 * @returns {Object|null}
  * @example findNextCandidateTask(store) => { task, projectId, … } | null
 ***/
export function findNextCandidateTask(store, { ignoreTrip = false } = {}) {
	// Tier-5 containment gate: containment stops dispatch before any candidate
	// scan so even a direct caller (route, test, reconcile) cannot bypass it.
	if (!ignoreTrip && isTripped(store)) {
		const snapshot = circuitSnapshot(store);
		store.lastTripDeferral = {
			at: new Date().toISOString(),
			reason: snapshot.reason,
			source: snapshot.source,
		};
		return null;
	}
	// Rule 0: resume what an interruption left behind, ahead of everything.
	const resumed = findResumedCandidate(store);
	if (resumed) return resumed;

	// Rule 1: Follow on from just completed task
	if (store.lastCompletedTask) {
		const { projectId, taskId } = store.lastCompletedTask;
		store.lastCompletedTask = null; // Clear so it only triggers once
		const task = store.getTask(projectId, taskId);
		if (task && task.status === "in_stage") {
			const project = store.projectStore?.getProject?.(projectId);
			const stages = resolveStagesForTask(project, task);
			const stage =
				resolveCandidateStage(stages, task.currentStageId) || stages[0];
			const blockCheck = store.isTaskBlocked(projectId, taskId);

			// A follow-on whose project lost its stages keeps the historical
			// default (agent/unpaused) so this path stays behavior-identical.
			if (
				isSchedulerRunnable(task, stage || { type: "agent" }, {
					blocked: blockCheck.blocked,
					claimed: !!store.claimStore?.describe?.(task.id),
				})
			) {
				return {
					projectId,
					taskId: task.id,
					task,
					stage,
					stages,
					projectCwd: project?.cwd,
					priorityReason: "follow_on",
				};
			}
		}
	}

	if (
		!store.projectStore ||
		typeof store.projectStore.listProjects !== "function"
	) {
		return null;
	}

	const candidates = [];
	const projects = store.projectStore.listProjects();

	for (const project of projects) {
		const tasks = store.listTasks(project.id, project.cwd);
		for (const task of tasks) {
			if (task.status !== "in_stage") continue;

			const stages = resolveStagesForTask(project, task);
			if (!Array.isArray(stages) || stages.length === 0) continue;

			const stageIndex = candidateStageIndex(stages, task.currentStageId);
			if (stageIndex === -1) continue;

			const stage = stages[stageIndex];
			const blockCheck = store.isTaskBlocked(project.id, task.id);
			if (
				!isSchedulerRunnable(task, stage, {
					blocked: blockCheck.blocked,
					claimed: !!store.claimStore?.describe?.(task.id),
				})
			) {
				continue;
			}

			const enteredAt = new Date(
				task.enteredStageAt || task.updatedAt || 0,
			).getTime();
			candidates.push({
				projectId: project.id,
				taskId: task.id,
				task,
				stage,
				stages,
				projectCwd: project.cwd,
				stageIndex,
				enteredStageAt: Number.isFinite(enteredAt) ? enteredAt : 0,
			});
		}
	}

	if (candidates.length === 0) return null;

	// Sort candidates:
	// 1. Closest to completion (furthest right -> higher stageIndex descending)
	// 2. Oldest updated / entered stage (enteredStageAt ascending)
	candidates.sort((a, b) => {
		if (b.stageIndex !== a.stageIndex) {
			return b.stageIndex - a.stageIndex;
		}
		return a.enteredStageAt - b.enteredStageAt;
	});

	return candidates[0];
}
