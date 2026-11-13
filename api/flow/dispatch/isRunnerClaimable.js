import { runnerMatches } from "./runnerMatches.js";

/***
 * MARK: isRunnerClaimable
 * @description Whether ANY active, fresh runner can claim a task with the
 *   given harness/model requirements right now. Retained utility for
 *   dispatch capability checks and reporting; the `executeStage` defer
 *   gate no longer consumes it — since the embedded-fallback removal,
 *   runner-only mode is a hard defer and never runs a servable stage
 *   in-process, no matter what the fleet looks like right now. Scans
 *   the live registry through the same `runnerMatches` gate the dispatch
 *   poll uses. Returns false when the registry is missing, empty, or no
 *   runner matches.
 * @param {Object} runnerRegistry - Backend RunnerRegistry (records + isFresh).
 * @param {Object} req - Task requirements from `taskRequirements` (harness, model, tier, etc.).
 * @param {Object} [opts] - Passed to runnerMatches (`projectId`, staleAfterMs, etc.).
 * @returns {boolean} True when at least one runner could claim this task.
 * @example isRunnerClaimable(runnerRegistry, { harness: 'pi', model: 'm' }) => true
 ***/
export function isRunnerClaimable(runnerRegistry, req, opts = {}) {
	if (!runnerRegistry || typeof runnerRegistry.records !== "function") return false;
	try {
		const records = runnerRegistry.records();
		if (!Array.isArray(records) || records.length === 0) return false;
		return records.some((rec) => runnerMatches(rec, req, opts).ok);
	} catch {
		return false;
	}
}
