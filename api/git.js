/***
 * MARK: Git helpers, one front door
 * @description One front door for the git command helpers in `api/git/*.js`:
 *   every helper is re-exported here under its own name, so callers (flow
 *   engine, work modules, stores) import from one place and need no import
 *   changes. Implementation lives in the command-family modules under
 *   `api/git/`.
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
	discardChangesOutsideDocs,
	isDocPath,
	isLiveTaskSnapshotPath,
	untrackLiveTaskSnapshots,
} from "./git/commit.js";

export {
	MERGE_STRATEGY,
	SQUASH_MERGE_STRATEGY,
	abortMerge,
	abortSquashMerge,
	buildGitConflictDiagnostics,
	buildSquashCommitMessage,
	findSquashCommit,
	isBranchContentLanded,
	isRegeneratedSnapshotPath,
	mergeBranch,
	squashMergeBranch,
	isBranchMergedInto,
	partitionMergeConflicts,
	resolveConflictsWithIncoming,
	syncBranchWithUpstream,
} from "./git/merge.js";

export {
	hasRemote,
	pushBranchIfRemote,
	syncDefaultBranchToRemote,
} from "./git/remote.js";
