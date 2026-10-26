// Domain: The Flow — pure stage resolution shared by the scheduler, the
// stall watchdog, startup recovery, and the queue display.
//
// These helpers were extracted out of `taskScheduler.js` so the stage
// heartbeat/watchdog module can resolve a task's current stage without
// importing the scheduler that imports it. `taskScheduler.js` re-exports
// them unchanged, so every existing import site keeps working. Keeping this
// module dependency-free (no scheduler, no config, no store) is what makes
// the import graph acyclic.

/***
 * MARK: resolveStagesForTask
 * @description Resolves stages for a task within its project and workflow.
 *   A workflow-scoped task uses its workflow's stages when they exist;
 *   otherwise the project's top-level stages are the single source of truth.
 * @param {Object|null} project
 * @param {Object|null} task
 * @returns {Array<Object>} Stage list (never null).
 * @example resolveStagesForTask(project, task) => [{ id: "build" }]
 ***/
export function resolveStagesForTask(project, task) {
	if (task?.workflowId && Array.isArray(project?.workflows)) {
		const wf = project.workflows.find((w) => w.id === task.workflowId);
		if (wf?.stages?.length > 0) {
			return wf.stages;
		}
	}
	return project?.stages || [];
}

/***
 * MARK: candidateStageIndex
 * @description Locates a task's current stage by id (falling back to a
 *   case-insensitive name match). Shared by every scan (candidate search,
 *   resume scan, interruption reconcile, queue display) so all of them agree
 *   on which stage a task sits at. Returns -1 when the task references a
 *   stage that no longer exists. Total on untrusted input.
 * @param {Array<Object>} stages
 * @param {string} currentStageId
 * @returns {number}
 * @example candidateStageIndex([{ id: "s-1", name: "Build" }], "build") => 0
 ***/
export function candidateStageIndex(stages, currentStageId) {
	if (!Array.isArray(stages)) return -1;
	return stages.findIndex(
		(s) =>
			String(s?.id) === String(currentStageId) ||
			(s?.name &&
				String(s.name).toLowerCase() ===
					String(currentStageId ?? "").toLowerCase()),
	);
}

/***
 * MARK: resolveCandidateStage
 * @description Returns the stage a task currently sits at (by id, falling
 *   back to a case-insensitive name match), or null when the stages list is
 *   empty or the reference no longer exists. A null stage means "leave the
 *   task alone": callers treat it as not runnable and never auto-resume it.
 * @param {Array<Object>} stages
 * @param {string} currentStageId
 * @returns {Object|null}
 * @example resolveCandidateStage([{ id: "s-1" }], "s-1") => { id: "s-1" }
 ***/
export function resolveCandidateStage(stages, currentStageId) {
	const index = candidateStageIndex(stages, currentStageId);
	return index === -1 ? null : stages[index];
}
