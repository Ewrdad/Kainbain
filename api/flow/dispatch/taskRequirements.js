import { ALIAS_HARNESS_ID } from "../../../shared/modelAliases.js";
import { resolveHarnessName } from "../../agent/harnessRegistry.js";

/***
 * MARK: taskRequirements
 * @description Derives what a task's current stage needs from a Runner:
 *   harness (stage override else project default else configured default,
 *   same order as the embedded `resolveHarnessName`),
 *   model (stage else project default), and required tier (explicit
 *   stage/task tier else T1 for model-driven stages else T0). Stages whose
 *   harness is the `alias` virtual id resolve in WP-3.2 (D3 central
 *   counters) and are marked `{ alias }` so dispatch skips them loudly
 *   instead of guessing. Only agent/review stages are Runner-runnable;
 *   human, command, and ci stages stay embedded.
 * @example taskRequirements({ harness: 'pi' }, { currentStageId: 's1', stages: [{ id: 's1', type: 'agent' }] }) => { harness: 'pi', ... }
 * @param {Object} project - Project entity.
 * @param {Object} task - Task entity.
 * @returns {Object} `{ harness, model, tier, alias, runnableType }`.
 ***/
export function taskRequirements(project = {}, task = {}) {
	const stages = Array.isArray(task.stages)
		? task.stages
		: Array.isArray(project?.stages)
			? project.stages
			: [];
	const stage =
		stages.find((s) => String(s?.id) === String(task.currentStageId)) ||
		stages[0] ||
		{};
	const type = String(stage.type || "agent").toLowerCase();
	const runnableType = type === "agent" || type === "review";

	// Same order as the embedded run path (`resolveHarnessName`): stage
	// override → project default → configured default → built-in. Dispatch
	// must demand exactly what the engine would run, or every default-harness
	// host misses every task (NO_HARNESS) while embedded runs them fine.
	const rawHarness = resolveHarnessName(project, { harnessName: stage.harness });

	let alias = null;
	let harness = rawHarness;
	if (rawHarness === ALIAS_HARNESS_ID) {
		const name =
			typeof stage.model === "string" && stage.model.trim()
				? stage.model.trim()
				: typeof project?.defaultModel === "string" && project.defaultModel.trim()
					? project.defaultModel.trim()
					: "";
		alias = name || "(blank)";
		harness = null;
	}

	const model =
		typeof stage.model === "string" && stage.model.trim() && rawHarness !== ALIAS_HARNESS_ID
			? stage.model.trim()
			: typeof project?.defaultModel === "string" && project.defaultModel.trim()
				? project.defaultModel.trim()
				: "";

	const explicitTier = [stage.tier, task.tier, task.requiredTier].find((t) =>
		/^T[0-3]$/.test(String(t || "").trim()),
	);
	const tier = explicitTier
		? String(explicitTier).trim()
		: runnableType
			? "T1"
			: "T0";

	return { harness, model, tier, alias, runnableType, stageId: stage.id ?? null };
}
