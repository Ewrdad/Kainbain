import { resolveStagesForTask, candidateStageIndex } from "../stageResolution.js";
import { isSchedulerRunnable } from "../scheduler/isSchedulerRunnable.js";
import { taskRequirements } from "./taskRequirements.js";

/***
 * MARK: scanClaimableTasks
 * @description Scans all projects for tasks a Runner may claim, mirroring
 *   the embedded scheduler's scan (`findNextCandidateTask`): status
 *   in_stage, resolvable stages, on-stage index, runnable, unblocked, and
 *   — crucially — not already lease-held (the claim fence stays the
 *   single arbiter; the scan only avoids wasted attempts). Sorted like the
 *   scheduler (closest-to-completion, then oldest) so backend-routed and
 *   embedded dispatch prioritize identically — plus the WP-3.3 starvation
 *   guard: candidates waiting past `maxWaitMs` jump ahead oldest-first,
 *   bounding the worst-case wait under perpetual late-stage influx (R13).
 *   Human/non-model stages are excluded here (their requirements mark
 *   `runnableType: false`).
 * @example scanClaimableTasks({ projectStore, taskStore, claimStore }) => [{ projectId, taskId, task, req }]
 * @param {Object} deps - Stores (`projectStore`, `taskStore`, `claimStore`).
 * @param {Object} [opts] - `{ projectIds }` (Runner-enforced allowlist), `{ maxWaitMs, now }` (starvation boost; 0 disables).
 * @returns {Array} Claimable tasks with requirements, in dispatch order.
 ***/
export function scanClaimableTasks(deps = {}, opts = {}) {
	const { projectStore, taskStore, claimStore } = deps;
	const only = Array.isArray(opts.projectIds) ? new Set(opts.projectIds) : null;
	const maxWaitMs =
		typeof opts.maxWaitMs === "number" && Number.isFinite(opts.maxWaitMs) && opts.maxWaitMs > 0
			? opts.maxWaitMs
			: 0;
	const now = typeof opts.now === "number" && Number.isFinite(opts.now) ? opts.now : Date.now();
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
			const req = taskRequirements(project, task);
			if (!req.runnableType) continue;
			const enteredAt = new Date(task.enteredStageAt || task.updatedAt || 0).getTime();
			out.push({
				projectId: project.id,
				taskId: task.id,
				task,
				stage,
				req,
				stageIndex,
				enteredStageAt: Number.isFinite(enteredAt) ? enteredAt : 0,
			});
		}
	}
	out.sort((a, b) => {
		if (maxWaitMs > 0) {
			const aOverdue = now - a.enteredStageAt > maxWaitMs;
			const bOverdue = now - b.enteredStageAt > maxWaitMs;
			if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
			if (aOverdue && bOverdue) return a.enteredStageAt - b.enteredStageAt;
		}
		if (b.stageIndex !== a.stageIndex) return b.stageIndex - a.stageIndex;
		return a.enteredStageAt - b.enteredStageAt;
	});
	return out;
}
