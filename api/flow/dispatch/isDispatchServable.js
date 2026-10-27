import { taskRequirements } from "./taskRequirements.js";
import { selectAliasTarget } from "../../aliasSelector.js";
import { normalizeStageType } from "../../projectStore.js";

/***
 * MARK: isDispatchServable
 * @description True when a task's current stage would spawn an in-process
 *   model child under the embedded engine AND a Runner could serve it over
 *   the wire instead. Only normalized-`agent` stages qualify: `review`
 *   normalizes to a human checkpoint (parks, never spawns), and human /
 *   command / ci stages stay embedded by design (local, non-model work).
 *   Alias-harness stages additionally require the alias to resolve in
 *   principle (peek: shared smooth-WRR counters untouched,
 *   every target treated as known — liveness is the dispatch poll's job,
 *   not this predicate's). Used by the runner-execution cutover gate in
 *   `executeStage`.
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
	// Only stages that would spawn an in-process model child move to a
	// Runner. Everything else (human checkpoints, commands, CI, unknown
	// legacy types) keeps its exact embedded behavior.
	if (normalizeStageType(resolved.type) !== "agent") return false;
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
