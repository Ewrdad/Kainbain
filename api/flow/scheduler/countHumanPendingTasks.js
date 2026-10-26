import {
	resolveCandidateStage,
	resolveStagesForTask,
} from '../stageResolution.js';
import {
	normalizeStageType,
} from '../../projectStore.js';

/***
 * MARK: countHumanPendingTasks
 * @description Counts tasks waiting for human intervention: either
 *   `waiting_human` status or `in_stage` at a human checkpoint stage. Used
 *   to enrich the queue-empty notification so the operator can tell "nothing
 *   left for the runner" apart from "everything is done". Total (never
 *   throws): unreadable stores read as zero because the count is
 *   informational only.
 * @param {Object} store
 * @returns {number}
 * @example countHumanPendingTasks(store) => 2
 ***/
export function countHumanPendingTasks(store) {
	let count = 0;
	try {
		if (!store?.projectStore || typeof store.projectStore.listProjects !== "function") {
			return 0;
		}
		const projects = store.projectStore.listProjects();
		if (!Array.isArray(projects)) return 0;
		for (const project of projects) {
			if (!project || typeof project !== "object" || !project.id) continue;
			let tasks;
			try {
				tasks = store.listTasks(project.id, project.cwd);
			} catch {
				continue;
			}
			if (!Array.isArray(tasks)) continue;
			for (const task of tasks) {
				if (!task || typeof task !== "object") continue;
				if (task.status === "waiting_human") {
					count += 1;
					continue;
				}
				if (task.status !== "in_stage") continue;
				let stage = null;
				try {
					const stages = resolveStagesForTask(project, task);
					stage = resolveCandidateStage(stages, task.currentStageId);
				} catch {
					continue;
				}
				if (stage && normalizeStageType(stage?.type) === "human") {
					count += 1;
				}
			}
		}
	} catch {
		return count;
	}
	return count;
}
