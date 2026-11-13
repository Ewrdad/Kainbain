import { resolveStagesForTask, candidateStageIndex } from "../stageResolution.js";
import { isSchedulerRunnable } from "../scheduler/isSchedulerRunnable.js";
import { sortCentralQueue } from "../scheduler/sortCentralQueue.js";
import { taskRequirements } from "./taskRequirements.js";

/***
 * MARK: scanClaimableTasks
 * @description Scans all projects for tasks a Runner may claim, mirroring
 *   the embedded scheduler's scan (`findNextCandidateTask`): status
 *   in_stage, resolvable stages, on-stage index, runnable, unblocked, and
 *   — crucially — not already lease-held (the claim fence stays the
 *   single arbiter; the scan only avoids wasted attempts). Results are
 *   sorted through the SAME central-queue seam as the scheduler and the
 *   queue display (`sortCentralQueue`), so backend-routed and embedded
 *   dispatch always prioritize identically: default "oldest-first" — the
 *   oldest waiting task first, wherever it lives, with furthest-along-as-a-
 *   percentage as tiebreak — plus the starvation ceiling (`maxWaitMs`):
 *   candidates waiting past it jump ahead oldest-first. The ceiling comes
 *   from `maxWaitMs` when given, else config `dispatchMaxWaitMs`, else the
 *   built-in 15-minute default in oldest-first mode (task 16d6fbd6).
 *   Human/non-model stages are excluded here (their requirements mark
 *   `runnableType: false`).
 * @example scanClaimableTasks({ projectStore, taskStore, claimStore }) => [{ projectId, taskId, task, req }]
 * @param {Object} deps - Stores (`projectStore`, `taskStore`, `claimStore`).
 * @param {Object} [opts] - `{ projectIds }` (Runner-enforced allowlist), `{ maxWaitMs, now, order }` (central-queue policy overrides; omitted = config defaults).
 * @returns {Array} Claimable tasks with requirements, in dispatch order.
 ***/
export function scanClaimableTasks(deps = {}, opts = {}) {
	const { projectStore, taskStore, claimStore } = deps;
	const only = Array.isArray(opts.projectIds) ? new Set(opts.projectIds) : null;
	if (!projectStore || typeof projectStore.listProjects !== "function") return [];
	if (!taskStore || typeof taskStore.listTasks !== "function") return [];
	const out = [];
	for (const project of projectStore.listProjects()) {
		if (only && !only.has(project.id)) continue;
		let tasks = [];
		try {
			tasks = taskStore.listTasks(project.id, project.cwd) || [];
		} catch {
			continue;
		}
		for (const task of tasks) {
			if (!task || task.status !== "in_stage") continue;
			if (claimStore && typeof claimStore.describe === "function" && claimStore.describe(task.id)) {
				continue;
			}
			let blockCheck = { blocked: false };
			try {
				blockCheck = taskStore.isTaskBlocked(project.id, task.id);
			} catch {
				continue;
			}
			const stages = resolveStagesForTask(project, task);
			if (!Array.isArray(stages) || stages.length === 0) continue;
			const stageIndex = candidateStageIndex(stages, task.currentStageId);
			if (stageIndex === -1) continue;
			const stage = stages[stageIndex];
			if (
				!isSchedulerRunnable(task, stage, {
					blocked: blockCheck.blocked,
					claimed: false,
				})
			) {
				continue;
			}
			// The task's own pipeline stages (resolved above) travel into
			// requirements, so a task on any pipeline is judged by its own
			// stage — never the viewed pipeline's mirror.
			const req = taskRequirements(project, task, stages);
			if (!req.runnableType) continue;
			const enteredAt = new Date(task.enteredStageAt || task.updatedAt || 0).getTime();
			out.push({
				projectId: project.id,
				taskId: task.id,
				task,
				stage,
				req,
				stageIndex,
				totalStages: stages.length,
				enteredStageAt: Number.isFinite(enteredAt) ? enteredAt : 0,
			});
		}
	}
	// Central-queue order, shared with the embedded scheduler and the queue
	// display: overdue (past the ceiling) first oldest-first, then the
	// configured mode — default oldest-waiting-first with furthest-along
	// percentage as tiebreak.
	return sortCentralQueue(out, opts);
}
