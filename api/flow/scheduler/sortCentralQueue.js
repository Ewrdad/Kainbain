import { compareCentralQueueCandidates } from './compareCentralQueueCandidates.js';
import { resolveCentralQueuePolicy } from './centralQueuePolicy.js';

/***
 * MARK: sortCentralQueue
 * @description Sorts queue candidates into central dispatch order using the
 *   shared comparator and policy. This is THE seam both dispatch paths
 *   (embedded scheduler, runner fleet scan) and the queue display sort
 *   through. Returns a new array; the input is not mutated. Explicit opts
 *   (`order`, `maxWaitMs`, `now`) override config; omitted opts resolve from
 *   the loaded config, so production callers can pass nothing.
 * @param {Array<Object>} candidates - Candidates with enteredStageAt/stageIndex/totalStages.
 * @param {Object} [opts] - Passed to `resolveCentralQueuePolicy`.
 * @returns {Array<Object>} New array in dispatch order.
 * @example sortCentralQueue([{ enteredStageAt: 2, stageIndex: 1, totalStages: 2 }, { enteredStageAt: 1, stageIndex: 0, totalStages: 3 }]) => [{ enteredStageAt: 1, … }, …]
 ***/
export function sortCentralQueue(candidates, opts = {}) {
	const policy = resolveCentralQueuePolicy(opts);
	const list = Array.isArray(candidates) ? candidates : [];
	return [...list].sort((a, b) => compareCentralQueueCandidates(a, b, policy));
}
