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
import { isCentralQueueCandidateOverdue } from './isCentralQueueCandidateOverdue.js';
import { resolveCentralQueuePolicy } from './centralQueuePolicy.js';
import { sortCentralQueue } from './sortCentralQueue.js';

/***
 * MARK: findNextCandidateTask
 * @description Discovers the next task to run across ALL projects from the one
 *   central queue (see docs/EngineDetails/TaskQueueing.md):
 *   Rule 0: Interrupted-but-resumable tasks first (oldest interruption first).
 *   Rule 1: Follow-on from just-completed task — a single-use pass that is
 *     withheld when other candidates have already waited past the starvation
 *     ceiling, so a churning pipeline cannot indefinitely pre-empt older
 *     cross-pipeline work (task 16d6fbd6).
 *   Rule 2/3: The shared central-queue order (`sortCentralQueue`): by default
 *     oldest-waiting-first with furthest-along-as-a-percentage as tiebreak
 *     ("oldest-first"); legacy "furthest-along" mode restores
 *     closest-to-completion then oldest.
 *   The scan never looks at the UI-focused/active project — dispatch is a
 *   property of the waiting work only.
 *   Tier-5 containment is a pre-condition: while the engine is tripped the
 *   scan returns null (recording `store.lastTripDeferral`) unless the caller
 *   explicitly opts into the single half-open canary admission.
 * @param {Object} store
 * @param {Object} [opts]
 * @param {boolean} [opts.ignoreTrip=false] - Admit a candidate despite the trip (canary probe).
 * @param {Object} [opts.queue] - Central-queue policy overrides (`order`, `maxWaitMs`, `now`); omitted = config defaults.
 * @returns {Object|null}
  * @example findNextCandidateTask(store) => { task, projectId, … } | null
 ***/
export function findNextCandidateTask(store, { ignoreTrip = false, queue = null } = {}) {
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

	const candidates = [];
	const projects =
		store.projectStore && typeof store.projectStore.listProjects === "function"
			? store.projectStore.listProjects()
			: [];

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

	// Rule 1: Follow on from just completed task. Single-use pass, but it must
	// not pre-empt cross-pipeline work that has already waited past the
	// starvation ceiling (task 16d6fbd6): if any OTHER candidate is overdue,
	// the follow-on competes in the normal central-queue order instead.
	const policy = resolveCentralQueuePolicy(queue || {});
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
				const preemptsOverdue = candidates.some(
					(candidate) =>
						!(candidate.projectId === projectId && candidate.taskId === task.id) &&
						isCentralQueueCandidateOverdue(candidate, policy),
				);
				if (!preemptsOverdue) {
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
	}

	if (candidates.length === 0) return null;

	// Rules 2/3: the shared central-queue order — identical to the runner
	// fleet scan and the queue display, never influenced by UI focus.
	return sortCentralQueue(candidates, policy)[0];
}
