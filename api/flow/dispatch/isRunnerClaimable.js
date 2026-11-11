import { runnerMatches } from "./runnerMatches.js";

/***
 * MARK: isRunnerClaimable
 * @description Whether ANY active, fresh runner can claim a task with the
 *   given harness/model requirements right now. Scans the live registry
 *   through the same `runnerMatches` gate the dispatch poll uses, so the
 *   embedded fallback decision never disagrees with dispatch. Returns
 *   false when the registry is missing, empty, or no runner matches — in
 *   that case `executeStage` should fall back to embedded rather than
 *   parking the task forever behind a fleet that cannot serve it.
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
