/***
 * MARK: GIT_FAILURE_KINDS
 * @description Taxonomy of structured git failures carried on
 *   `GitFailureDetails.kind` (and therefore on
 *   `lastError.gitDiagnostics.kind`). `hook-rejected` (a repo hook such as
 *   the pre-commit binary guard refused the commit) and `commit-failed` (a
 *   commit the parser cannot attribute to a hook) are produced by the
 *   runner's git layer; `merge-conflict` is shared with the existing
 *   backend merge diagnostics (`api/git/merge.js`); `push-failed` and
 *   `auth-failed` are reserved for the push/network/auth follow-up and
 *   have no producer yet.
 * @example GIT_FAILURE_KINDS.HOOK_REJECTED => 'hook-rejected'
 ***/
export const GIT_FAILURE_KINDS = Object.freeze({
	HOOK_REJECTED: "hook-rejected",
	COMMIT_FAILED: "commit-failed",
	MERGE_CONFLICT: "merge-conflict",
	PUSH_FAILED: "push-failed",
	AUTH_FAILED: "auth-failed",
});

/***
 * MARK: GIT_FAILURE_PHASES
 * @description Where in the runner lifecycle a git failure struck, carried
 *   on `GitFailureDetails.phase`: `worktree-setup` (prepareWorkdir outside
 *   the recovery commit), `recovery` (the recovery/residue commit itself),
 *   `stage-commit` (the stage-end commit/merge/push), or `merge` (the
 *   leased integration merge).
 * @example GIT_FAILURE_PHASES.RECOVERY => 'recovery'
 ***/
export const GIT_FAILURE_PHASES = Object.freeze({
	WORKTREE_SETUP: "worktree-setup",
	RECOVERY: "recovery",
	STAGE_COMMIT: "stage-commit",
	MERGE: "merge",
});

/***
 * MARK: GIT_FAILURE_LIMITS
 * @description Transport-safety caps applied by
 *   `buildGitFailureDetails`: hook output stays small enough to ride
 *   beside the 20k completion-output cap, and the file list stays short
 *   enough to render. Truncation is always marked (see the `truncated*`
 *   envelope flags) so a capped payload never reads as complete.
 * @example GIT_FAILURE_LIMITS.hookOutput => 8000
 ***/
export const GIT_FAILURE_LIMITS = Object.freeze({
	hookOutput: 8000,
	files: 50,
	command: 500,
	remedy: 2000,
	summary: 300,
});

/***
 * MARK: GIT_FAILURE_PARK_AFTER
 * @description Consecutive deterministic git failures on the same
 *   task+stage after which the backend parks the task for the operator
 *   instead of auto-resuming/re-dispatching it (see
 *   `api/flow/scheduler/isGitFailureParked.js`). Three strikes: the first
 *   attempts let an agent stage see the structured error and fix it, while
 *   a poisoned tree stops consuming runs after that. An operator
 *   resume/retry/move clears the streak.
 * @example GIT_FAILURE_PARK_AFTER => 3
 ***/
export const GIT_FAILURE_PARK_AFTER = 3;
