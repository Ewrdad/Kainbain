import { resolveStagesForTask } from "./stageResolution.js";

/***
 * MARK: buildRunnerAssignmentSummary
 * @description Enriches one live Runner hold with cross-pipeline identity so
 *   the Runner fleet view renders the real task title and stage name even
 *   when the operator looks at a different pipeline. Every store lookup is
 *   best-effort: a missing task or project still yields a valid assignment
 *   carrying the raw ids with the enriched fields set to null (never throws).
 *   Cross-pipeline task hydration stays on `GET /tasks/:id?projectId=...`,
 *   which already accepts `projectId` — this payload only carries the
 *   identity the UI needs to render immediately.
 * @example buildRunnerAssignmentSummary({ hold: { projectId: 'p', taskId: 't' }, projectStore, taskStore }) => { projectName: 'P', taskTitle: 'T', stageName: 'Build', ... }
 * @param {Object} args - `{ hold, projectStore, taskStore, stageId }`; `stageId` is the Runner-reported stage (from the execution ledger) used before the task's `currentStageId` fallback.
 * @returns {Object} `{ projectName, workflowId, workflowName, taskTitle, taskGoal, taskStatus, stageName }` (nulls when unresolvable).
 ***/
export function buildRunnerAssignmentSummary({ hold, projectStore, taskStore, stageId = null } = {}) {
	const summary = {
		projectName: null,
		workflowId: null,
		workflowName: null,
		taskTitle: null,
		taskGoal: null,
		taskStatus: null,
		stageName: null,
	};
	try {
		const projectId = hold?.projectId ?? null;
		const taskId = hold?.taskId ?? null;
		let project = null;
		try {
			project = projectStore?.getProject?.(projectId) ?? null;
		} catch {
			project = null;
		}
		let task = null;
		try {
			task = projectId != null && taskId != null ? taskStore?.getTask?.(projectId, taskId) ?? null : null;
		} catch {
			task = null;
		}
		if (project && typeof project.name === "string" && project.name.trim()) {
			summary.projectName = project.name;
		}
		if (task) {
			if (task.workflowId != null && String(task.workflowId) !== "") {
				summary.workflowId = task.workflowId;
			}
			if (typeof task.title === "string" && task.title.trim()) {
				summary.taskTitle = task.title;
			}
			if (typeof task.goal === "string" && task.goal.trim()) {
				summary.taskGoal = task.goal;
			}
			if (task.status != null && String(task.status) !== "") {
				summary.taskStatus = task.status;
			}
		}
		try {
			let workflow = null;
			if (task?.workflowId) {
				workflow = projectStore?.getWorkflow?.(projectId, task.workflowId) ?? null;
			}
			if (!workflow && projectId != null) {
				workflow = projectStore?.getActiveWorkflow?.(projectId) ?? null;
			}
			if (workflow && typeof workflow.name === "string" && workflow.name.trim()) {
				summary.workflowName = workflow.name;
			} else if (!workflow && typeof project?.activeWorkflowName === "string" && project.activeWorkflowName.trim()) {
				summary.workflowName = project.activeWorkflowName;
			}
			if (!summary.workflowId && workflow?.id != null) {
				summary.workflowId = workflow.id;
			}
		} catch {
			// Workflow identity stays null; task/project identity above still stands.
		}
		try {
			const stages = resolveStagesForTask(project, task);
			const reported = stageId != null && String(stageId) !== "" ? String(stageId) : null;
			const current = task?.currentStageId != null && String(task.currentStageId) !== "" ? String(task.currentStageId) : null;
			const stage =
				(reported ? stages.find((s) => String(s?.id) === reported) : null) ||
				(current ? stages.find((s) => String(s?.id) === current) : null) ||
				null;
			const name = stage?.name || stage?.title;
			if (typeof name === "string" && name.trim()) {
				summary.stageName = name;
			} else if (reported) {
				summary.stageName = reported;
			} else if (current) {
				summary.stageName = current;
			}
		} catch {
			if (stageId != null && String(stageId) !== "") {
				summary.stageName = String(stageId);
			}
		}
	} catch {
		// Best-effort: return whatever resolved (possibly all nulls).
	}
	return summary;
}
