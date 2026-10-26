import { git } from "./exec.js";
import { isValidBranchName } from "./validation.js";
import { GitError } from "./errors.js";

/***
 * MARK: isGitRepository
 * @description Whether the directory is a git work tree.
 * @example await isGitRepository('/path/to/repo') => true
 * @param {string} projectCwd
 * @returns {Promise<boolean>}
 ***/
export async function isGitRepository(projectCwd) {
	try {
		await git(projectCwd, ["rev-parse", "--inside-work-tree"]);
		return true;
	} catch {
		return false;
	}
}


/***
 * MARK: hasCommits
 * @description Whether the repository has at least one commit (HEAD resolves).
 *   Freshly provisioned KainBain projects run `git init` only, so merge/commit
 *   operations must fail with a clear message on unborn repositories.
 * @example await hasCommits('/path/to/repo') => true
 * @param {string} projectCwd
 * @returns {Promise<boolean>}
 ***/
export async function hasCommits(projectCwd) {
	try {
		await git(projectCwd, ["rev-parse", "--verify", "HEAD"]);
		return true;
	} catch {
		return false;
	}
}


/***
 * MARK: currentBranch
 * @description Returns the checked-out branch name (e.g. 'kb/<taskId>'). The
 *   literal 'HEAD' is returned for detached or unborn repositories.
 * @example await currentBranch('/repo') => 'main'
 * @param {string} projectCwd
 * @returns {Promise<string>}
 ***/
export async function currentBranch(projectCwd) {
	const { stdout } = await git(projectCwd, [
		"rev-parse",
		"--abbrev-ref",
		"HEAD",
	]);
	return stdout.trim();
}


/***
 * MARK: branchExists
 * @description Whether a local branch with the given name exists. Invalid
 *   branch names are reported as non-existent.
 * @example await branchExists('/repo', 'kb/123') => true
 * @param {string} projectCwd
 * @param {string} branch
 * @returns {Promise<boolean>}
 ***/
export async function branchExists(projectCwd, branch) {
	if (!isValidBranchName(branch)) return false;
	try {
		await git(projectCwd, ["rev-parse", "--verify", `refs/heads/${branch}`]);
		return true;
	} catch {
		return false;
	}
}


/***
 * MARK: countUniqueCommits
 * @description Counts commits on `branch` that are not reachable from `base`
 *   (`git rev-list --count base..branch`). The merge stage uses it to refuse
 *   merging a task branch that carries no work of its own: without this, an
 *   agent that produced nothing still "merges" trivially and the pipeline
 *   completes an empty task. Invalid names fail closed with a GitError.
 * @example await countUniqueCommits('/repo', 'main', 'kb/123') => 2
 * @param {string} projectCwd
 * @param {string} base - Integration branch (usually the default branch).
 * @param {string} branch - Task branch to measure.
 * @returns {Promise<number>} Commits unique to `branch` (>= 0).
 ***/
export async function countUniqueCommits(projectCwd, base, branch) {
	if (!isValidBranchName(base) || !isValidBranchName(branch)) {
		throw new GitError("countUniqueCommits requires valid branch names");
	}
	const { stdout } = await git(projectCwd, [
		"rev-list",
		"--count",
		`${base}..${branch}`,
	]);
	const count = Number.parseInt(String(stdout).trim(), 10);
	if (!Number.isInteger(count) || count < 0) {
		throw new GitError(
			`countUniqueCommits got an unparseable count for '${base}..${branch}'`,
		);
	}
	return count;
}


/***
 * MARK: countBehindCommits
 * @description Counts commits on `base` that `branch` does not contain
 *   (`git rev-list --count branch..base`) — how far behind the default
 *   branch the task branch is. The merge stage uses it as a warning-only
 *   staleness signal: gates run against the merged tree, so a branch based
 *   long ago can fail for reasons unrelated to the task. Never refuses the
 *   merge; callers log the divergence and proceed. Invalid names or an
 *   unparseable count throw a GitError (callers treat a failed read as "no
 *   signal", never as a merge failure).
 * @example await countBehindCommits('/repo', 'main', 'kb/123') => 15
 * @param {string} projectCwd
 * @param {string} base - Integration branch (usually the default branch).
 * @param {string} branch - Task branch to measure.
 * @returns {Promise<number>} Commits on base missing from branch (>= 0).
 ***/
export async function countBehindCommits(projectCwd, base, branch) {
	if (!isValidBranchName(base) || !isValidBranchName(branch)) {
		throw new GitError("countBehindCommits requires valid branch names");
	}
	const { stdout } = await git(projectCwd, [
		"rev-list",
		"--count",
		`${branch}..${base}`,
	]);
	const count = Number.parseInt(String(stdout).trim(), 10);
	if (!Number.isInteger(count) || count < 0) {
		throw new GitError(
			`countBehindCommits got an unparseable count for '${branch}..${base}'`,
		);
	}
	return count;
}


/***
 * MARK: isMergeInProgress
 * @description Whether a merge is already in progress (MERGE_HEAD exists) —
 *   e.g. a previous merge failed without aborting. A new merge must not be
 *   started while this marker exists; the caller should abort or resolve first.
 * @example await isMergeInProgress('/repo') => false
 * @param {string} projectCwd
 * @returns {Promise<boolean>}
 ***/
export async function isMergeInProgress(projectCwd) {
	try {
		await git(projectCwd, ["rev-parse", "--verify", "MERGE_HEAD"]);
		return true;
	} catch {
		return false;
	}
}


/***
 * MARK: resolveSha
 * @description Resolves any ref (branch, HEAD, tag) to its full SHA using
 *   `git rev-parse`. Never throws for lock recovery; callers should expect
 *   a GitError on an unknown ref.
 * @example await resolveSha('/repo', 'HEAD') => 'abc123...'
 * @param {string} cwd - Project working directory.
 * @param {string} ref - Ref to resolve.
 * @returns {Promise<string>} Full SHA.
 ***/
export async function resolveSha(cwd, ref) {
	if (typeof ref !== "string" || !ref.trim() || ref.trim().startsWith("-")) {
		throw new GitError("resolveSha requires a non-flag ref");
	}
	const { stdout } = await git(cwd, ["rev-parse", String(ref)]);
	return stdout.trim();
}


/***
 * MARK: diffRangeNumstat
 * @description Thin wrapper around `git diff --numstat` for an explicit
 *   two-dot commit range. Returns the same { stdout, stderr, code } shape
 *   as `git()` so callers can parse it with `parseNumstatStdout`.
 * @example await diffRangeNumstat('/repo', baseSha, headSha) => { stdout, stderr, code }
 * @param {string} cwd
 * @param {string} fromSha
 * @param {string} toSha
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 ***/
export async function diffRangeNumstat(cwd, fromSha, toSha, opts = {}) {
	return await git(
		cwd,
		["diff", "--numstat", "--no-color", `${fromSha}..${toSha}`],
		opts,
	);
}

