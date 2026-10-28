/***
 * MARK: Git barrel
 * @description Thin re-export barrel over `api/git/*.js`. Preserves the
 *   historical public surface of the git helper module so callers (flow engine,
 *   work modules, stores) need no import changes. Implementation lives in the
 *   command-family modules under `api/git/`.
 ***/

export {
	GitError,
	GitMergeConflictError,
	GitBranchMismatchError,
	GitDirtyTreeError,
} from "./git/errors.js";

export { isValidBranchName, redactCredentials } from "./git/validation.js";

export { git } from "./git/exec.js";

export {
	STALE_GIT_LOCK_AGE_MS,
	maybeRecoverStaleLock,
	drainGitLockRecoveries,
	formatGitLockRecoveryNotice,
} from "./git/staleLock.js";

export {
	isGitRepository,
	hasCommits,
	currentBranch,
	branchExists,
	countUniqueCommits,
	countBehindCommits,
	isMergeInProgress,
	resolveSha,
	diffRangeNumstat,
} from "./git/status.js";

export {
	DEFAULT_IGNORED_PATHS,
	getWorkingTreeStatus,
	isWorkingTreeClean,
} from "./git/workingTreeStatus.js";

export {
	SWEEPABLE_DIR_PREFIXES,
	SWEEPABLE_BASENAME_PATTERNS,
	assessDirtyTree,
	recoverDirtyTree,
	requireCleanWorkingTree,
	drainDirtyTreeRecoveries,
	formatDirtyTreeRecoveryNotice,
} from "./git/workingTreeRecovery.js";

export {
	checkoutBranch,
	createBranch,
	ensureBranchCheckedOut,
	defaultBranch,
	returnToDefaultBranch,
	deleteBranch,
	withCheckedOutBranch,
} from "./git/branch.js";

export {
	DEFAULT_GIT_AUTHOR_NAME,
	DEFAULT_GIT_AUTHOR_EMAIL,
	ensureGitIdentity,
	commitAllIfNeeded,
} from "./git/commit.js";

export {
	MERGE_STRATEGY,
	abortMerge,
	buildGitConflictDiagnostics,
	isRegeneratedSnapshotPath,
	mergeBranch,
	isBranchMergedInto,
	partitionMergeConflicts,
	resolveConflictsWithIncoming,
} from "./git/merge.js";

export {
	hasRemote,
	pushBranchIfRemote,
	syncDefaultBranchToRemote,
} from "./git/remote.js";
