/**
 * MARK: claimEligibleRunner
 * @description Whether one Runner registration can take ANY work right now:
 *   active status and not paused — the same two gates `runnerMatches`
 *   applies before per-task requirements. The fleet model catalogue counts
 *   only eligible Runners, so "available on N runners" always names
 *   Runners that could actually claim.
 * @example claimEligibleRunner({ status: 'active', paused: false }) => true
 * @param {Object} [record={}] - Runner record.
 * @returns {boolean} Eligibility.
 */
export function claimEligibleRunner(record = {}) {
	return record?.status === "active" && record?.paused !== true;
}
