/***
 * MARK: GitError
 * @description Typed error for a failed git command. Carries the exit code,
 *   argument array, and captured stdout/stderr for diagnostics and stage
 *   failure reports.
 * @example try { await git(cwd, ["status"]) } catch (e) { if (e instanceof GitError) ... }
 ***/
export class GitError extends Error {
	constructor(message, { code, args, stdout, stderr } = {}) {
		super(message);
		this.name = "GitError";
		this.code = typeof code === "number" ? code : null;
		this.args = Array.isArray(args) ? args : [];
		this.stdout = typeof stdout === "string" ? stdout : "";
		this.stderr = typeof stderr === "string" ? stderr : "";
	}
}


/***
 * MARK: GitMergeConflictError
 * @description Typed error raised when `git merge` cannot complete because of
 *   conflicts. The conflicting tree is rolled back (git merge --abort) unless
 *   explicitly disabled, so the caller fails the stage with a half-clean tree.
 ***/
export class GitMergeConflictError extends GitError {
	constructor(
		message,
		{ conflictedFiles, sourceSha, targetSha, baseSha, strategy, ...rest } = {},
	) {
		super(message, rest);
		this.name = "GitMergeConflictError";
		this.conflictedFiles = Array.isArray(conflictedFiles) ? conflictedFiles : [];
		if (typeof sourceSha === "string" && sourceSha) this.sourceSha = sourceSha;
		if (typeof targetSha === "string" && targetSha) this.targetSha = targetSha;
		if (typeof baseSha === "string" && baseSha) this.baseSha = baseSha;
		if (typeof strategy === "string" && strategy) this.strategy = strategy;
	}
}


/***
 * MARK: GitBranchMismatchError
 * @description Typed error raised when a commit is attempted with an explicit
 *   `expectedBranch` affinity and the working tree is checked out elsewhere.
 *   KainBain tasks share one primary checkout, so a concurrent task can move
 *   `HEAD` between a stage's own checkout and its auto-commit; committing
 *   without this guard would land task A's in-flight files on task B's
 *   branch (the 2026-10-12 cross-task branch-bleed incident, where task
 *   `2e6a3521`'s auto-commit landed on `kb/04170d74` and produced a spurious
 *   merge conflict in `TaskReviewPage.jsx`). Callers pass `expectedBranch`
 *   only at points where the branch is a hard precondition, and decide
 *   themselves whether a mismatch is fatal or a warn-only skip.
 * @example try { await commitAllIfNeeded(cwd, 'msg', { expectedBranch: 'kb/1' }) } catch (e) { e instanceof GitBranchMismatchError }
 ***/
export class GitBranchMismatchError extends GitError {
	constructor(message, { expectedBranch, actualBranch, ...rest } = {}) {
		super(message, rest);
		this.name = "GitBranchMismatchError";
		this.expectedBranch =
			typeof expectedBranch === "string" ? expectedBranch : null;
		this.actualBranch =
			typeof actualBranch === "string" ? actualBranch : null;
	}
}


/***
 * MARK: GitDirtyTreeError
 * @description Typed error raised when a branch switch is requested while the
 *   working tree has uncommitted (non-ignored) changes. Prevents losing work.
 *   `dirtyPaths` lists the offending entries for the operator.
 ***/
export class GitDirtyTreeError extends GitError {
	constructor(message, { dirtyPaths, recoveryAttempts, ...rest } = {}) {
		super(message, rest);
		this.name = "GitDirtyTreeError";
		this.dirtyPaths = Array.isArray(dirtyPaths) ? dirtyPaths : [];
		this.recoveryAttempts = Array.isArray(recoveryAttempts)
			? recoveryAttempts
			: [];
	}
}


