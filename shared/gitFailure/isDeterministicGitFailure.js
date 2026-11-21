import { GIT_FAILURE_KINDS } from "./gitFailureKinds.js";

/***
 * MARK: isDeterministicGitFailure
 * @description Whether a git failure kind is deterministic: re-running the
 *   same command on the same tree fails the same way, so the runner must
 *   report it once and never rethrow (rethrowing crash-loops under
 *   `Restart=always`). True for hook rejections, plain commit failures,
 *   and merge conflicts; false for the reserved push/auth kinds (which may
 *   be transient) and for anything unknown. Accepts a kind string or a
 *   details object carrying `.kind`.
 * @example isDeterministicGitFailure('hook-rejected') => true
 * @example isDeterministicGitFailure({ kind: 'push-failed' }) => false
 * @param {string|Object} [input] - Failure kind or details object.
 * @returns {boolean} True when the failure must report-and-return.
 ***/
export function isDeterministicGitFailure(input = "") {
	const kind = typeof input === "string" ? input : input?.kind;
	return (
		kind === GIT_FAILURE_KINDS.HOOK_REJECTED ||
		kind === GIT_FAILURE_KINDS.COMMIT_FAILED ||
		kind === GIT_FAILURE_KINDS.MERGE_CONFLICT
	);
}
