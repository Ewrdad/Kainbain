import { config } from "../../../config.js";
import { resolveProjectCount } from "./resolveProjectCount.js";
import { sanitizeBudgetCount } from "./sanitizeBudgetCount.js";

/***
 * MARK: resolveMaxAutoIterations
 * @description Resolves the automatic-iteration budget for a stage: an explicit
 *   per-stage `maxRetries` wins, then the project's `maxAutoIterations`,
 *   otherwise the global config default. A value of 0 disables auto-iteration.
 * @example resolveMaxAutoIterations(undefined, { maxAutoIterations: 3 }) => 3
 * @param {Object} [stage]
 * @param {Object} [project]
 * @returns {number}
 ***/
export function resolveMaxAutoIterations(stage, project) {
	const stageBudget = stage ? sanitizeBudgetCount(stage.maxRetries) : undefined;
	if (stageBudget !== undefined) {
		return stageBudget;
	}
	const projectBudget = resolveProjectCount(project, "maxAutoIterations");
	if (projectBudget !== undefined) {
		return projectBudget;
	}
	return config.maxAutoIterations;
}
