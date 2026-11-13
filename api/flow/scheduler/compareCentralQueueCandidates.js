import { isCentralQueueCandidateOverdue } from './isCentralQueueCandidateOverdue.js';
import {
	CENTRAL_QUEUE_ORDER_FURTHEST_ALONG,
} from './centralQueuePolicy.js';

/***
 * MARK: compareCentralQueueCandidates
 * @description The single comparator behind the central queue — used by both
 *   dispatch paths and the queue display so they can never disagree. Order:
 *   1. Overdue candidates (waiting past the ceiling) first, oldest first.
 *   2. Then, by mode:
 *      - "oldest-first" (default): oldest waiting first (enteredStageAt
 *        ascending); ties break to furthest-along AS A PERCENTAGE of the
 *        candidate's own pipeline (stageIndex / totalStages), then absolute
 *        stage index — so a long pipeline's mid-stage work no longer beats a
 *        short pipeline's nearly-done work.
 *      - "furthest-along" (legacy rollback): highest absolute stage index
 *        first, then oldest waiting — the pre-16d6fbd6 order.
 *   All fields are read defensively; corrupt timestamps collapse to the epoch.
 * @param {Object} a - Candidate ({ enteredStageAt, stageIndex, totalStages|stages }).
 * @param {Object} b - Candidate.
 * @param {{ order: string, maxWaitMs: number, now: number }} policy - Resolved policy.
 * @returns {number} Negative when a sorts before b.
 * @example compareCentralQueueCandidates({ enteredStageAt: 1, stageIndex: 0, totalStages: 2 }, { enteredStageAt: 2, stageIndex: 2, totalStages: 3 }, { order: "oldest-first", maxWaitMs: 0, now: 3 }) => -1
 ***/
export function compareCentralQueueCandidates(a, b, policy) {
	const toMs = (value) => {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		const parsed = new Date(value || 0).getTime();
		return Number.isFinite(parsed) ? parsed : 0;
	};
	const stageIndexOf = (c) =>
		typeof c?.stageIndex === 'number' && Number.isFinite(c.stageIndex) ? c.stageIndex : 0;
	const totalStagesOf = (c) => {
		const explicit = c?.totalStages;
		if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) {
			return explicit;
		}
		if (Array.isArray(c?.stages) && c.stages.length > 0) return c.stages.length;
		return 1;
	};
	// "Furthest along as a percentage": a task sitting AT its last stage is
	// 100% along, so progress counts the current stage: (index + 1) / total.
	const progressOf = (c) => (stageIndexOf(c) + 1) / totalStagesOf(c);

	const enteredA = toMs(a?.enteredStageAt);
	const enteredB = toMs(b?.enteredStageAt);

	const overdueA = isCentralQueueCandidateOverdue(a, policy);
	const overdueB = isCentralQueueCandidateOverdue(b, policy);
	if (overdueA !== overdueB) return overdueA ? -1 : 1;

	if (policy?.order === CENTRAL_QUEUE_ORDER_FURTHEST_ALONG) {
		if (stageIndexOf(b) !== stageIndexOf(a)) return stageIndexOf(b) - stageIndexOf(a);
		return enteredA - enteredB;
	}

	// Default oldest-first: the oldest waiting work runs next, wherever it
	// lives; furthest-along-as-a-percentage only breaks exact-age ties.
	// (Applies within the overdue bucket too, so overdue ties still prefer
	// the nearly-done work.)
	if (enteredA !== enteredB) return enteredA - enteredB;
	const progressDiff = progressOf(b) - progressOf(a);
	if (progressDiff !== 0) return progressDiff;
	return stageIndexOf(b) - stageIndexOf(a);
}
