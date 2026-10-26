import { config } from "../../../config.js";
import { transientRetryDefaults } from "../tables/transientRetryDefaults.js";
import { resolveProjectCount } from "./resolveProjectCount.js";
import { sanitizeBudgetCount } from "./sanitizeBudgetCount.js";

/***
 * MARK: resolveTransientBudget
 * @description Resolves the Tier-2 same-stage retry budget together with its
 *   source layer (stage `maxTransientRetries` > project
 *   `maxTransientRetries` > global config). Same precedence as
 *   `resolveMaxTransientRetries`, which stays the numeric entry point; this
 *   is the auditable variant whose `source` is surfaced in stage reports
 *   and retry timeline entries (deliverable 3).
 * @example resolveTransientBudget({ maxTransientRetries: 3 }, {}) => { maxAttempts: 3, source: "stage" }
 * @param {Object} [stage]
 * @param {Object} [project]
 * @returns {{ maxAttempts: number, source: "stage"|"project"|"global" }}
 ***/
export function resolveTransientBudget(stage, project) {
	const stageBudget = stage ? sanitizeBudgetCount(stage.maxTransientRetries) : undefined;
	if (stageBudget !== undefined) {
		return { maxAttempts: stageBudget, source: "stage" };
	}
	const projectBudget = resolveProjectCount(project, "maxTransientRetries");
	if (projectBudget !== undefined) {
		return { maxAttempts: projectBudget, source: "project" };
	}
	return {
		maxAttempts: sanitizeBudgetCount(config.maxTransientRetries) ?? transientRetryDefaults.maxAttempts,
		source: "global",
	};
}
