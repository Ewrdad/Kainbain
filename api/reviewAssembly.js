/***
 * MARK: reviewAssembly
 * @description Assembles the complete MR-style review payload for a task:
 *   branch metadata, merge-base diff, commit list, ahead/behind counts, and
 *   sidecar review comments. Implements the plan's D2 snapshot rule (a
 *   checkpoint commit is only made when the shared worktree is on the task
 *   branch) and never checks out or mutates refs to compute a diff.
 * @example buildTaskReview({ projectStore, taskStore }, cwd, 'proj-1', 'task-1')
 ***/

import {
	diffFiles,
	diffFilePatch,
	diffCommitList,
	revCount,
	resolveSha,
} from "./reviewDiff.js";
import {
	isGitRepository,
	hasCommits,
	branchExists,
	currentBranch,
	isWorkingTreeClean,
	commitAllIfNeeded,
	defaultBranch,
	drainGitLockRecoveries,
	formatGitLockRecoveryNotice,
} from "./git.js";
import { config } from "./config.js";
import {
	isReviewDiffPreserved,
	isValidReviewBaseline,
} from "./work/taskBranches.js";

/***
 * MARK: emptyReview
 * @description Builds the documented empty-state payload (plan §4.2) used when
 *   branch support is off, the repo is missing or unborn, or the task branch
 *   does not exist yet. Always HTTP 200 with `branchSupported`/`reason` so the
 *   UI can render an explanatory empty state instead of an error.
 * @param {Object} task
 * @param {Object} extra - { branchSupported, reason, baseBranch }
 * @returns {Object} Empty review payload.
 ***/
function emptyReview(task, { branchSupported, reason, baseBranch = null }) {
	return {
		task,
		branch: task?.branch || null,
		baseBranch,
		baseSha: null,
		headSha: null,
		behindBy: 0,
		aheadBy: 0,
		uncommittedChanges: false,
		branchSupported: Boolean(branchSupported),
		reason: reason || null,
		commits: [],
		files: [],
		comments: [],
	};
}

/***
 * MARK: resolveReviewBase
 * @description Resolves the default branch to diff the task branch against.
 *   Guards the unborn-repo anomaly where defaultBranch() falls back to the
 *   current branch — never treats the task branch itself as the base (the
 *   diff would be empty and self-referential). Returns null when no base
 *   branch is available.
 * @example await resolveReviewBase('/repo', 'kb/task-1') => 'main'
 * @param {string} projectCwd - Managed project working directory.
 * @param {string} taskBranch - The task's branch name.
 * @returns {Promise<string|null>} Base branch name, or null.
 ***/
export async function resolveReviewBase(projectCwd, taskBranch) {
	let baseBranch = null;
	try {
		const resolved = await defaultBranch(projectCwd);
		if (resolved && resolved !== taskBranch) {
			baseBranch = resolved;
		}
	} catch {
		baseBranch = null;
	}
	return baseBranch;
}

/***
 * MARK: loadDiffSection
 * @description Computes one self-contained diff section between two refs:
 *   merge-base file list with per-file patches (size-capped), commit list
 *   (newest-first, D8), and ahead/behind counts. Works with branch names and
 *   with frozen SHAs alike; a single unreadable patch never sinks the
 *   section. Read-only w.r.t. git refs.
 * @example await loadDiffSection('/repo', 'main', 'kb/t1') => { files, commits, behindBy, aheadBy }
 * @param {string} projectCwd - Managed project working directory.
 * @param {string} base - Base ref or SHA.
 * @param {string} head - Head ref or SHA.
 * @returns {Promise<{files: Array, commits: Array, behindBy: number, aheadBy: number}>}
 ***/
async function loadDiffSection(projectCwd, base, head) {
	// Compute the diff, commit list (newest-first, D8), and divergence counts.
	const [filesRaw, commits, counts] = await Promise.all([
		diffFiles(projectCwd, base, head),
		diffCommitList(projectCwd, base, head),
		revCount(projectCwd, base, head),
	]);

	const files = await Promise.all(
		filesRaw.map(async (file) => {
			if (file.binary) {
				return { ...file, diff: null, tooLarge: false };
			}
			try {
				const diff = await diffFilePatch(projectCwd, base, head, file.path);
				const tooLarge = diff.length > config.reviewDiffMaxBytes;
				return { ...file, diff: tooLarge ? null : diff, tooLarge };
			} catch {
				// A single unreadable patch must not sink the whole review.
				return { ...file, diff: null, tooLarge: false };
			}
		}),
	);

	return { files, commits, behindBy: counts.behind, aheadBy: counts.ahead };
}

/***
 * MARK: buildPreservedReview
 * @description Assembles the preserved-diff review payload: the frozen
 *   `baseSha...headSha` baseline diff as the primary payload, plus a
 *   separate live `newSinceMerge` section when post-merge fix-up work exists
 *   (never a silently merged union). When the baseline SHAs no longer
 *   resolve (shallow clone/GC), falls back to the live diff with a
 *   `preserveNote` instead of hard-failing. `live` is null when the task
 *   branch itself is gone — the frozen baseline still renders, which is the
 *   point of preserving it.
 ***/
async function buildPreservedReview({
	deps,
	projectId,
	taskId,
	projectCwd,
	task,
	taskBranch,
	baseBranch,
	baseline,
	live,
	uncommittedChanges,
	snapshotCommitted,
}) {
	let frozen = null;
	try {
		frozen = await loadDiffSection(projectCwd, baseline.baseSha, baseline.headSha);
	} catch {
		frozen = null;
	}

	if (snapshotCommitted) {
		deps.eventBridge?.broadcastGlobal?.("REVIEW_UPDATED", {
			projectId,
			taskId,
			type: "snapshot",
		});
	}

	if (!frozen) {
		// Baseline SHAs unresolvable — fall back to the live diff with a
		// reason note so the review never hard-fails.
		if (live) {
			return {
				task,
				branch: taskBranch,
				baseBranch,
				baseSha: live.baseSha,
				headSha: live.headSha,
				behindBy: live.behindBy,
				aheadBy: live.aheadBy,
				uncommittedChanges,
				branchSupported: true,
				reason: null,
				commits: live.commits,
				files: live.files,
				comments: [], // Filled by the route from the sidecar store
				preserved: false,
				preserveNote:
					"The preserved merge diff is unavailable (history pruned); showing the live diff instead.",
			};
		}
		return emptyReview(task, {
			branchSupported: true,
			reason: "The agent has not created any changes on the task branch yet",
			baseBranch,
		});
	}

	const hasNew =
		live && (live.files.length > 0 || live.commits.length > 0);
	return {
		task,
		branch: taskBranch,
		baseBranch,
		baseSha: baseline.baseSha,
		headSha: baseline.headSha,
		behindBy: frozen.behindBy,
		aheadBy: frozen.aheadBy,
		uncommittedChanges,
		branchSupported: true,
		reason: null,
		commits: frozen.commits,
		files: frozen.files,
		comments: [], // Filled by the route from the sidecar store
		preserved: true,
		reviewBaseline: { ...baseline },
		newSinceMerge: hasNew
			? {
					files: live.files,
					commits: live.commits,
					behindBy: live.behindBy,
					aheadBy: live.aheadBy,
				}
			: null,
	};
}

/***
 * MARK: buildTaskReview
 * @description Gathers the git state for the task branch vs the repo's default
 *   branch: checkpoint snapshot (D2), merge-base diff files with per-file
 *   patches (size-capped), commit list (newest-first, D8), ahead/behind counts.
 *   Read-only w.r.t. refs — the only mutation is the idempotent snapshot
 *   commit when the worktree sits on the task branch and is dirty.
 * @example buildTaskReview(deps, project.cwd, 'proj-1', 'task-1') => { ...review }
 * @param {Object} deps - { projectStore, taskStore, eventBridge? }
 * @param {string} projectCwd - Managed project working directory.
 * @param {string} projectId
 * @param {string} taskId
 * @returns {Promise<Object>} Review payload per plan §4.2.
 ***/
export async function buildTaskReview(deps, projectCwd, projectId, taskId) {
	const { projectStore, taskStore } = deps;
	const project = projectStore.getProject(projectId);
	const task = taskStore.getTask(projectId, taskId);

	if (!project || !task) {
		const err = new Error("Project or task not found");
		err.statusCode = 404;
		throw err;
	}

	const repoExists = await isGitRepository(projectCwd);
	if (!project.useBranches || !repoExists) {
		// D7: branch support off or no repo — documented empty state, not an error.
		return emptyReview(task, {
			branchSupported: false,
			reason: repoExists
				? "Branch support is disabled for this project"
				: "This project is not a git repository",
		});
	}
	if (!(await hasCommits(projectCwd))) {
		// Unborn repo: nothing to review yet.
		return emptyReview(task, {
			branchSupported: true,
			reason: "Repository has no commits yet",
		});
	}

	const taskBranch = task.branch;
	const baseline = isValidReviewBaseline(task.reviewBaseline)
		? task.reviewBaseline
		: null;
	const branchKnown =
		taskBranch && (await branchExists(projectCwd, taskBranch));
	if (!branchKnown) {
		// The frozen baseline still renders when the task branch itself is
		// gone (e.g. deleted post-merge) — that is the point of preserving
		// it. Without preservation, today's empty state applies unchanged.
		if (isReviewDiffPreserved(project) && baseline) {
			const baseBranch = await resolveReviewBase(projectCwd, taskBranch);
			let uncommittedChanges = false;
			try {
				uncommittedChanges = !(await isWorkingTreeClean(projectCwd, {
					ignorePaths: [],
				}));
			} catch {
				uncommittedChanges = false;
			}
			return buildPreservedReview({
				deps,
				projectId,
				taskId,
				projectCwd,
				task,
				taskBranch,
				baseBranch,
				baseline,
				live: null,
				uncommittedChanges,
				snapshotCommitted: false,
			});
		}
		return emptyReview(task, {
			branchSupported: true,
			reason: "The agent has not created any changes on the task branch yet",
		});
	}

	// D2 snapshot rule: only when the shared worktree is ON the task branch.
	// The engine auto-commits at stage boundaries, but the agent (or a prior
	// crash) can leave uncommitted work; a checkpoint commit gives the review
	// everything that would merge plus a stable headSha for comment anchoring.
	let uncommittedChanges = false;
	let snapshotCommitted = false;
	const current = await currentBranch(projectCwd);
	if (current === taskBranch) {
		if (!(await isWorkingTreeClean(projectCwd, { ignorePaths: [] }))) {
			const snapshotMessage = `KainBain (task ${taskId}): checkpoint commit before human review`;
			// Affinity guard: `current` was read just above, but a concurrent
			// task could still have moved the shared checkout since. Refuse to
			// snapshot onto a sibling branch; skip the checkpoint instead.
			let committed = false;
			try {
				const snapshotResult = await commitAllIfNeeded(
					projectCwd,
					snapshotMessage,
					{ expectedBranch: taskBranch },
				);
				committed = snapshotResult.committed === true;
			} catch (snapshotError) {
				taskStore._recordHistory(
					task,
					`Warning: review snapshot commit skipped (${
						snapshotError?.message || snapshotError
					})`,
				);
			}
			if (committed) {
				snapshotCommitted = true;
				// Record the snapshot in task history like other transitions (D2).
				taskStore._recordHistory(task, snapshotMessage);
				taskStore.updateTask(
					projectId,
					taskId,
					{ history: task.history },
					projectCwd,
				);
			}
			// Audit any stale lock the gated snapshot op auto-cleared.
			try {
				const snapshotRecoveries = (await drainGitLockRecoveries(projectCwd)) || [];
				for (const entry of snapshotRecoveries) {
					taskStore._recordHistory(task, formatGitLockRecoveryNotice(entry));
				}
				if (snapshotRecoveries.length > 0) {
					taskStore.updateTask(
						projectId,
						taskId,
						{ history: task.history },
						projectCwd,
					);
				}
			} catch {
				// Audit is best-effort; the snapshot above already succeeded.
			}
		}
	} else {
		// Another task owns the worktree right now; surface the dirtiness so the
		// reviewer knows the shared tree is mid-something, but never check out.
		uncommittedChanges = !(await isWorkingTreeClean(projectCwd, {
			ignorePaths: [],
		}));
	}

	// Resolve the base branch (never the task branch itself).
	const baseBranch = await resolveReviewBase(projectCwd, taskBranch);
	if (!baseBranch) {
		return emptyReview(task, {
			branchSupported: true,
			reason: "No base branch available to diff against yet",
		});
	}

	const baseSha = await resolveSha(projectCwd, baseBranch).catch(() => null);
	const headSha = await resolveSha(projectCwd, taskBranch).catch(() => null);
	if (!baseSha || !headSha) {
		return emptyReview(task, {
			branchSupported: true,
			reason: "Could not resolve the review refs",
		});
	}

	const live = {
		...(await loadDiffSection(projectCwd, baseBranch, taskBranch)),
		baseSha,
		headSha,
	};

	// Preserved-diff rule: the frozen baseline is the primary payload and
	// post-merge fix-ups render as a separate `newSinceMerge` section.
	// Without preservation (or without a baseline) the payload below is
	// byte-identical to the pre-feature shape.
	if (isReviewDiffPreserved(project) && baseline) {
		return buildPreservedReview({
			deps,
			projectId,
			taskId,
			projectCwd,
			task,
			taskBranch,
			baseBranch,
			baseline,
			live,
			uncommittedChanges,
			snapshotCommitted,
		});
	}

	if (snapshotCommitted) {
		deps.eventBridge?.broadcastGlobal?.("REVIEW_UPDATED", {
			projectId,
			taskId,
			type: "snapshot",
		});
	}

	return {
		task,
		branch: taskBranch,
		baseBranch,
		baseSha,
		headSha,
		behindBy: live.behindBy,
		aheadBy: live.aheadBy,
		uncommittedChanges,
		branchSupported: true,
		reason: null,
		commits: live.commits,
		files: live.files,
		comments: [], // Filled by the route from the sidecar store
	};
}
