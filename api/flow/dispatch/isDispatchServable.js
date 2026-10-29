import { taskRequirements } from "./taskRequirements.js";
import { selectAliasTarget } from "../../aliasSelector.js";
import { normalizeStageType } from "../../projectStore.js";

/***
 * MARK: isDispatchServable
 * @description True when a task's current stage should run on a Runner over
 *   the wire instead of embedded in the backend. Every command stage
 *   qualifies in every branch mode: the backend never executes stage
 *   commands (it may be a container without bash/Docker), and a Runner
 *   honours runOnBranch 'primary'/'custom' by executing in the matching
 *   checkout on its host (which has the toolchain). Normalized-`agent`
 *   stages qualify as before. `review` normalizes to a human checkpoint
 *   (parks, never spawns), and human / unknown legacy types keep their
 *   embedded behavior.
 *   Alias-harness stages additionally require the alias to resolve in
 *   principle (peek: shared smooth-WRR counters untouched,
 *   every target treated as known — liveness is the dispatch poll's job,
 *   not this predicate's). Used by the runner-execution cutover gate in
 *   `executeStage`. Remote-backed merge stages are dispatch-servable
 *   as leased `integrate` jobs; other merge stages keep embedded behavior.
 * @example isDispatchServable({ project, task, stages }) => true
 * @param {Object} [opts]
 * @param {Object} [opts.project] - Project entity.
 * @param {Object} [opts.task] - Task entity.
 * @param {Array} [opts.stages] - Resolved stage list (overrides task/project stages).
 * @param {Object} [opts.stage] - Already-resolved current stage (overrides id lookup).
 * @returns {boolean} Whether a Runner over the wire can take this stage.
 ***/
export function isDispatchServable({ project = {}, task = {}, stages = null, stage = null } = {}) {
	const effectiveStages = Array.isArray(stages)
		? stages
		: Array.isArray(task.stages)
			? task.stages
			: [];
	const resolved =
		stage ||
		effectiveStages.find((s) => String(s?.id) === String(task.currentStageId)) ||
		effectiveStages[0] ||
		{};
	const stageKind = normalizeStageType(resolved.type);
	// All command stages run on Runners (any branch mode, any command):
	// the backend never executes stage commands.
	if (stageKind === "ci") {
		return true;
	}
	// Merge stages run on Runners as leased `integrate` jobs (Step 4) —
	// but only for remote-backed projects. The integration Runner clones
	// the origin, so local-only repos keep the embedded merge path.
	if (stageKind === "merge") {
		return project?.hasUpstreamRepo === true;
	}
	// Only stages that would spawn an in-process model child move to a
	// Runner. Everything else (human checkpoints, unknown legacy types)
	// keeps its exact embedded behavior.
	if (stageKind !== "agent") return false;
	const req = taskRequirements(project, {
		...task,
		...(Array.isArray(stages) ? { stages } : {}),
		...(resolved.id ? { currentStageId: resolved.id } : {}),
	});
	if (!req || !req.runnableType) return false;
	if (!req.alias) return true;
	try {
		return (
			selectAliasTarget(project, req.alias, {
				isHarnessKnown: () => true,
				peek: true,
			}) !== null
		);
	} catch {
		return false;
	}
}
