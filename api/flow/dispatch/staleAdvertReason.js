/***
 * MARK: staleAdvertReason
 * @description Words one stale catalogue entry's `unavailableReason`: how
 *   many runners claim the id their own successful scans contradict, and
 *   which harness menu denies it. Stable singular/plural, capped nouns —
 *   the string is persisted per entry, never interpolated with ids.
 * @example staleAdvertReason('muse', 1) => '1 runner advertises this model but its latest successful muse scan did not list it — the runner model pin may be stale.'
 * @param {string} [harness] - Harness whose scan contradicts the claim.
 * @param {number} [claimantCount] - Runners contradicting themselves (>= 1).
 * @returns {string} Human-readable stale reason.
 ***/
export function staleAdvertReason(harness, claimantCount) {
	const menu = typeof harness === "string" && harness.trim() ? harness.trim().slice(0, 64) : "its harness";
	const count = Number.isInteger(claimantCount) && claimantCount > 0 ? claimantCount : 1;
	const head = count === 1
		? "1 runner advertises this model but its latest successful"
		: `${count} runners advertise this model but their latest successful`;
	return `${head} ${menu} scan did not list it — the runner model pin may be stale.`;
}
