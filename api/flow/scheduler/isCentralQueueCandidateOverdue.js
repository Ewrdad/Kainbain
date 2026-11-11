/***
 * MARK: isCentralQueueCandidateOverdue
 * @description Whether a queue candidate has waited past the central-queue
 *   starvation ceiling (`policy.maxWaitMs`). Overdue candidates jump ahead of
 *   everything not overdue, oldest first — the bounded worst-case wait. A
 *   disabled ceiling (0, legacy furthest-along mode) means nothing is ever
 *   overdue. Corrupt/missing timestamps read as epoch 0, i.e. maximally
 *   overdue, so one bad date can never hide a waiting task.
 * @param {Object} candidate - Queue candidate with `enteredStageAt`.
 * @param {{ maxWaitMs: number, now: number }} policy - Resolved central-queue policy.
 * @returns {boolean}
 * @example isCentralQueueCandidateOverdue({ enteredStageAt: 0 }, { maxWaitMs: 1000, now: 5000 }) => true
 ***/
export function isCentralQueueCandidateOverdue(candidate, policy) {
	const maxWaitMs = Number(policy?.maxWaitMs);
	if (!Number.isFinite(maxWaitMs) || maxWaitMs <= 0) return false;
	const now = Number(policy?.now);
	const enteredRaw = candidate?.enteredStageAt;
	const entered =
		typeof enteredRaw === 'number' && Number.isFinite(enteredRaw)
			? enteredRaw
			: new Date(enteredRaw || 0).getTime();
	const enteredMs = Number.isFinite(entered) ? entered : 0;
	const nowMs = Number.isFinite(now) ? now : Date.now();
	return nowMs - enteredMs > maxWaitMs;
}
