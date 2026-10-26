import { config } from "../../../config.js";
import { transientRetryDefaults } from "../tables/transientRetryDefaults.js";
import { resolveProjectCount } from "./resolveProjectCount.js";
import { sanitizeBudgetCount } from "./sanitizeBudgetCount.js";

/***
 * MARK: resolveMaxTransientRetries
 * @description Resolves the same-stage retry budget for transient
 *   infrastructure failures: an explicit per-stage `maxTransientRetries`
 *   wins, then the project's `maxTransientRetries`, otherwise the global
 *   config default. A value of 0 disables transient retries (the task is
 *   parked immediately).
 * @example resolveMaxTransientRetries(undefined, { maxTransientRetries: 2 }) => 2
 * @param {Object} [stage]
 * @param {Object} [project]
 * @returns {number}
 ***/
export function resolveMaxTransientRetries(stage, project) {
	const stageBudget = stage ? sanitizeBudgetCount(stage.maxTransientRetries) : undefined;
	if (stageBudget !== undefined) {
		return stageBudget;
	}
	const projectBudget = resolveProjectCount(project, "maxTransientRetries");
	if (projectBudget !== undefined) {
		return projectBudget;
	}
	return sanitizeBudgetCount(config.maxTransientRetries) ?? transientRetryDefaults.maxAttempts;
}
