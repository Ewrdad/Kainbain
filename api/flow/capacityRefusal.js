/***
 * MARK: CAPACITY_REFUSAL_REASON_PREFIX
 * @description Wire prefix a Runner puts on an interrupt when it refuses
 *   work because its workdir/worktree cap is reached
 *   (`runner/daemon.js`, WORKTREE_CAP_REACHED): infra exhaustion, not a
 *   task or runner fault. The ledger matches the TRIMMED reason against
 *   this prefix to keep capacity refusals out of the runner-death count
 *   (task 3b82f6ae).
 * @example CAPACITY_REFUSAL_REASON_PREFIX => "Runner workdir unavailable:"
 ***/
export const CAPACITY_REFUSAL_REASON_PREFIX = "Runner workdir unavailable:";

/***
 * MARK: isCapacityRefusalReason
 * @description Whether an interrupt reason is a capacity refusal (a Runner
 *   that is simply full) rather than a death/crash. True iff the trimmed
 *   reason starts with CAPACITY_REFUSAL_REASON_PREFIX; null, empty,
 *   non-string, and other reasons (including crash reasons) are false, as
 *   is a reason that merely contains the prefix later in the string.
 * @param {*} reason - Raw interrupt reason from the Runner wire.
 * @returns {boolean}
 * @example isCapacityRefusalReason("Runner workdir unavailable: Worktree cap reached (~5)") => true
 * @example isCapacityRefusalReason("  Runner workdir unavailable: full ") => true
 * @example isCapacityRefusalReason("Runner crashed: Runner workdir unavailable: x") => false
 * @example isCapacityRefusalReason(null) => false
 ***/
export function isCapacityRefusalReason(reason) {
	if (typeof reason !== "string") return false;
	const trimmed = reason.trim();
	return trimmed.startsWith(CAPACITY_REFUSAL_REASON_PREFIX);
}
