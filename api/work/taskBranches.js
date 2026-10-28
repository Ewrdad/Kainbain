// Domain: The Work — the branch belonging to a task.
import {
	currentBranch,
	defaultBranch,
	branchExists,
	commitAllIfNeeded,
	createBranch,
	drainDirtyTreeRecoveries,
	drainGitLockRecoveries,
	ensureBranchCheckedOut,
	formatDirtyTreeRecoveryNotice,
	formatGitLockRecoveryNotice,
	getWorkingTreeStatus,
	hasCommits,
	isGitRepository,
	isValidBranchName,
	resolveSha,
	syncDefaultBranchToRemote,
} from "../git.js";
import { ensureTaskWorktree } from "./taskWorkspace.js";
import { _appendProcessLog } from "../watch/index.js";

/** Prefix for per-task branches: 'kb/<taskId>'. */
export const TASK_BRANCH_PREFIX = "kb";

/***
 * MARK: taskBranchName
 * @description Derives the per-task branch name from a task id (e.g. 'kb/<taskId>').
 *   A task UUID only contains safe hex characters, so the output always passes
 *   git's branch-name validation.
 * @example taskBranchName('123e4567-e89b-...') => 'kb/123e4567-e89b-...'
 * @param {string} taskId
 * @returns {string}
 ***/
export function taskBranchName(taskId) {
	return `${TASK_BRANCH_PREFIX}/${String(taskId || "")}`;
}

/***
 * MARK: resolveTaskBranch
 * @description Returns a task's per-task branch name. Uses the persisted
 *   task.branch when present, otherwise derives 'kb/<taskId>'.
 * @example resolveTaskBranch(task) => 'kb/123e4567-...'
 * @param {Object} task
 * @returns {string}
 ***/
export function resolveTaskBranch(task) {
	if (task?.branch && typeof task.branch === "string") return task.branch;
	return taskBranchName(task?.id);
}

/***
 * MARK: isBranchModeEnabled
 * @description Whether per-task branch support is enabled for a project.
 *   Opt-in via project.useBranches; default off so existing projects keep
 *   their single-branch behaviour unchanged.
 * @example isBranchModeEnabled(projectStore, 'proj-1') => true
 * @param {Object} projectStore
 * @param {string} projectId
 * @returns {boolean}
 ***/
export function isBranchModeEnabled(projectStore, projectId) {
	return (
		projectStore &&
		typeof projectStore.getProject === "function" &&
		projectStore.getProject(projectId)?.useBranches === true
	);
}

/***
 * MARK: isReviewDiffPreserved
 * @description Whether the PR-review diff stays visible after a merge + deploy
 *   pass for a project. Opt-in via project.preserveReviewDiffAfterMerge;
 *   default off so existing projects keep the empty-after-merge behaviour.
 * @example isReviewDiffPreserved({ preserveReviewDiffAfterMerge: true }) => true
 * @param {Object} [project]
 * @returns {boolean}
 ***/
export function isReviewDiffPreserved(project) {
	return project?.preserveReviewDiffAfterMerge === true;
}

/***
 * MARK: shouldResetReviewBaseline
 * @description Whether each successful merge overwrites the preserved review
 *   baseline (so after fail-back → fix → re-merge the review shows only the
 *   latest pass). Default true; turning it off keeps the first baseline and
 *   later passes accumulate in the `newSinceMerge` section instead.
 * @example shouldResetReviewBaseline({}) => true
 * @param {Object} [project]
 * @returns {boolean}
 ***/
export function shouldResetReviewBaseline(project) {
	return project?.resetReviewBaselineOnMerge !== false;
}

/***
 * MARK: isWorktreeIsolationEnabled
 * @description Whether opt-in per-task git worktrees are enabled for a
 *   project (`workspaceIsolation: 'worktree'`). Default quarantine mode and
 *   'off' both resolve false: work stages share the primary checkout and
 *   rely on the dirty-tree ladder instead of filesystem isolation.
 * @example isWorktreeIsolationEnabled(taskStore, 'proj-1') => false
 * @param {Object} taskStore - TaskStore instance (carries `.projectStore`).
 * @param {string} projectId
 * @returns {boolean}
 ***/
export function isWorktreeIsolationEnabled(taskStore, projectId) {
	try {
		return (
			taskStore?.projectStore?.getProject?.(projectId)?.workspaceIsolation ===
			"worktree"
		);
	} catch {
		return false;
	}
}

/***
 * MARK: resolveDirtyTreeRecoveryMode
 * @description Resolves the dirty-tree guard mode for a project's work-stage
 *   pickup: `'ladder'` (default) runs the sweep → stash → report recovery
 *   ladder before parking, while `'off'` restores the legacy immediate
 *   refusal. The strict mode is selected by either opt-out flag —
 *   `dirtyTreeRecovery: 'off'` (recovery-specific) or
 *   `workspaceIsolation: 'off'` (legacy strict workspace) — so an operator
 *   who asked for the old behavior never gets auto-swept or auto-stashed.
 *   Never throws: a missing/throwing project store degrades to `'ladder'`.
 * @example resolveDirtyTreeRecoveryMode(store, 'proj-1') => 'ladder'
 * @param {Object} taskStore - TaskStore instance (carries `.projectStore`).
 * @param {string} projectId
 * @returns {'ladder'|'off'}
 ***/
export function resolveDirtyTreeRecoveryMode(taskStore, projectId) {
	try {
		const project = taskStore?.projectStore?.getProject?.(projectId);
		if (
			project?.workspaceIsolation === "off" ||
			project?.dirtyTreeRecovery === "off"
		) {
			return "off";
		}
	} catch {
		// Advisory lookup only: fall through to the default ladder.
	}
	return "ladder";
}

/***
 * MARK: isValidReviewBaseline
 * @description Whether a task's frozen review baseline is usable: both SHAs
 *   must be non-empty strings. Tolerates legacy tasks (absent baseline) and
 *   corrupt frontmatter (wrong shape) by resolving to false — the caller
 *   falls back to the live diff instead of hard-failing the review.
 * @example isValidReviewBaseline({ baseSha: 'a', headSha: 'b' }) => true
 * @param {unknown} baseline
 * @returns {boolean}
 ***/
export function isValidReviewBaseline(baseline) {
	if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
		return false;
	}
	const { baseSha, headSha } = baseline;
	return (
		typeof baseSha === "string" &&
		baseSha.trim() !== "" &&
		typeof headSha === "string" &&
		headSha.trim() !== ""
	);
}

/***
 * MARK: recordBranchHop
 * @description Appends one auditable branch-switch line to the task's history,
 *   process log, markdown, and the event bridge system log.
 * @private
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity.
 * @param {string} cwd - Project working directory.
 * @param {Object} bridge - Event bridge (may be undefined).
 * @param {string} detail - Human sentence describing the hop.
 * @returns {void}
 ***/
function recordBranchHop(taskStore, task, cwd, bridge, detail) {
	if (!Array.isArray(task.history)) {
		task.history = [];
	}
	task.history.push({
		timestamp: new Date().toISOString(),
		action: detail,
	});
	_appendProcessLog(task, `[GIT] ${detail}`);
	taskStore._saveTaskMarkdown(cwd, task);
	bridge?.emitSystemLog?.(
		task.projectId,
		`[GIT] Task #KB-${String(task.id).slice(0, 4).toUpperCase()}: ${detail}`,
		{ taskId: task.id },
	);
}

/***
 * MARK: reportStaleLockRecoveries
 * @description Drains this repository's journaled stale-lock recoveries
 *   (see `git()`) and writes each into the task's history + process log +
 *   system log, so an auto-cleared `.git/index.lock` is always auditable.
 *   No-op when nothing was recovered (the common case).
 * @private
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity.
 * @param {string} cwd - Project working directory.
 * @param {Object} bridge - Event bridge (may be undefined).
 * @returns {Promise<void>}
 ***/
async function reportStaleLockRecoveries(taskStore, task, cwd, bridge) {
	let recoveries = [];
	try {
		recoveries = (await drainGitLockRecoveries(cwd)) || [];
	} catch {
		return;
	}
	for (const entry of recoveries) {
		recordBranchHop(taskStore, task, cwd, bridge, formatGitLockRecoveryNotice(entry));
	}
}

/***
 * MARK: reportDirtyTreeRecoveries
 * @description Drains this repository's journaled dirty-tree ladder runs
 *   (see `recoverDirtyTree` in `api/git.js`) and writes each into the task's
 *   history + process log + system log, so every auto-sweep and marked
 *   stash (with its ref for Tier 1 resume) is always auditable. No-op when
 *   the ladder never acted (the common case).
 * @private
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity.
 * @param {string} cwd - Project working directory.
 * @param {Object} bridge - Event bridge (may be undefined).
 * @returns {Promise<void>}
 ***/
async function reportDirtyTreeRecoveries(taskStore, task, cwd, bridge) {
	let recoveries = [];
	try {
		recoveries = (await drainDirtyTreeRecoveries(cwd)) || [];
	} catch {
		return;
	}
	for (const entry of recoveries) {
		recordBranchHop(
			taskStore,
			task,
			cwd,
			bridge,
			formatDirtyTreeRecoveryNotice(entry),
		);
	}
}

/***
 * MARK: syncMainToRemoteBestEffort
 * @description Best-effort source-of-truth sync shared by every operation
 *   that switches branches: fetches the remote and hard-resets the local
 *   default branch to it (see syncDefaultBranchToRemote). A moved ref is
 *   journaled into task history + process log + system log with its
 *   before/after SHAs (orphaned local commits stay recoverable via reflog);
 *   fetch/ref failures only leave a process-log warning and never fail the
 *   calling stage. Never throws.
 * @example await syncMainToRemoteBestEffort(store, task, '/repo', bridge, 'task-branch pickup') => { synced: true, ... }
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity.
 * @param {string} cwd - Project working directory.
 * @param {Object} [bridge] - Event bridge (may be undefined).
 * @param {string} [context] - Human operation name for audit lines (e.g. 'task-branch pickup').
 * @returns {Promise<Object|null>} Sync result, or null when sync itself errored unexpectedly.
 ***/
export async function syncMainToRemoteBestEffort(
	taskStore,
	task,
	cwd,
	bridge,
	context,
) {
	const label =
		typeof context === "string" && context.trim() ? context.trim() : "operation";
	try {
		const res = await syncDefaultBranchToRemote(cwd);
		if (!res) return null;
		const short = (sha) =>
			typeof sha === "string" && sha ? sha.slice(0, 7) : "unknown";
		if (res.synced) {
			const orphan =
				typeof res.ahead === "number" && res.ahead > 0
					? ` (orphaned ${res.ahead} local commit(s) ahead of remote ${short(res.before)}; prior state in reflog)`
					: "";
			const discarded = res.detail ? ` ${res.detail}` : "";
			recordBranchHop(
				taskStore,
				task,
				cwd,
				bridge,
				`Synced default branch '${res.mainBranch}' to '${res.remote}/${res.mainBranch}' before ${label} (${short(res.before)} → ${short(res.after)})${orphan}${discarded}`,
			);
		} else if (res.skipped === "fetch-failed" || res.skipped === "ref-update-failed") {
			_appendProcessLog(
				task,
				`[WARN] Main-branch sync before ${label} skipped (${res.skipped}${res.detail ? `: ${res.detail}` : ""}) — continuing with local state`,
			);
		}
		return res;
	} catch (e) {
		try {
			_appendProcessLog(
				task,
				`[WARN] Main-branch sync before ${label} errored (${e?.message || e}) — continuing with local state`,
			);
		} catch {
			// Audit is best-effort; the operation continues regardless.
		}
		return null;
	}
}


/***
 * MARK: ensureTaskBranch
 * @description Safely makes sure the task's branch exists and is checked out
 *   in the project working directory. Work stages only — human review stages
 *   must use ensureTaskBranchRef (create-only, never checks out) instead.
 *   Idempotent (no-op when already on the branch); refuses to switch on a
 *   dirty working tree (GitDirtyTreeError); creates the missing branch from
 *   the default branch. Every work-stage pickup passes through the default
 *   branch first — even when the task branch already exists — so the start
 *   state never depends on where the previous stage left the tree, and
 *   operators can pause mid-pipeline to hand-edit the default branch.
 *   Records what it did in the task's process logs and history so operators
 *   can audit branch switches between tasks.
 * @example await ensureTaskBranch(taskStore, task, '/repo') => { created, switched, branch }
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity (branch resolved from it).
 * @param {string} [projectCwd] - Project working directory.
 * @param {Object} [opts]
 * @param {Object} [opts.bridge] - Event bridge override.
 * @returns {Promise<{created: boolean, switched: boolean, branch: string}|null>} null when cwd cannot be resolved.
 ***/
export async function ensureTaskBranch(taskStore, task, projectCwd, opts = {}) {
	if (!task) return null;
	const cwd = taskStore._resolveProjectCwd(task.projectId, projectCwd);
	if (!cwd) return null;
	const bridge = opts.bridge || taskStore.eventBridge;
	// Project record for the clean-tree guard / worktree base: a custom
	// `kainbainDirName` must be ignored exactly like the `.kainbain` default, or
	// the engine's own state folder reads as dirty and blocks branch switches.
	const project = taskStore?.projectStore?.getProject?.(task.projectId) || null;
	const branch = resolveTaskBranch(task);

	// Opt-in per-task worktrees (workspaceIsolation: 'worktree'): the task
	// branch is provisioned as a ref on the primary checkout (never checked
	// out there — sibling work keeps running undisturbed) and stages execute
	// inside the isolated worktree dir. Stray files in the worktree can never
	// block sibling tasks because no two tasks share a tree.
	if (isWorktreeIsolationEnabled(taskStore, task.projectId)) {
		let repo = false;
		try {
			repo = await isGitRepository(cwd);
		} catch {
			repo = false;
		}
		if (repo) {
			// Source-of-truth sync before provisioning: the primary
			// checkout's default branch tracks the remote, so worktree bases
			// never start from stale main-side state.
			await syncMainToRemoteBestEffort(
				taskStore,
				task,
				cwd,
				bridge,
				"task worktree provisioning",
			);
			const baseBranch = await defaultBranch(cwd).catch(() => null);
			let created = false;
			try {
				if (
					baseBranch &&
					isValidBranchName(baseBranch) &&
					(await branchExists(cwd, baseBranch).catch(() => false))
				) {
					created = (await createBranch(cwd, branch, { startPoint: baseBranch }))
						.created;
				} else {
					created = (await createBranch(cwd, branch)).created;
				}
			} catch {
				created = false;
			}
			const worktreeDir = await ensureTaskWorktree(cwd, task, branch, {
				project,
			});
			recordBranchHop(
				taskStore,
				task,
				cwd,
				bridge,
				`Provisioned isolated worktree for task branch '${branch}' at '${worktreeDir}'${baseBranch ? ` (from '${baseBranch}')` : ""}`,
			);
			task.branch = branch;
			taskStore._saveTaskMarkdown(cwd, task);
			await reportDirtyTreeRecoveries(taskStore, task, cwd, bridge);
			await reportStaleLockRecoveries(taskStore, task, cwd, bridge);
			return { created, checkedOut: true, switched: false, branch, worktreeDir };
		}
		// Non-repo checkouts fall through to the shared path so the
		// not-a-git-repository error still surfaces exactly as before.
	}

	const before = await currentBranch(cwd).catch(() => null);
	const baseBranch = await defaultBranch(cwd).catch(() => null);
	// Strict workspace/recovery opt-outs (`workspaceIsolation: 'off'` or
	// `dirtyTreeRecovery: 'off'`) disable the ladder: the switch refuses a
	// dirty tree immediately instead of sweeping/stashing it away.
	const recovery = resolveDirtyTreeRecoveryMode(taskStore, task.projectId);

	// Source-of-truth sync on every pickup: the remote owns the default
	// branch, so fetch and hard-reset it before any hop. Stale main-side
	// state (operator edits, unpushed auto-commits) can never dirty-tree
	// block the switch after this — only genuinely precious untracked files
	// (which reset never deletes) still report loudly.
	await syncMainToRemoteBestEffort(
		taskStore,
		task,
		cwd,
		bridge,
		"task-branch pickup",
	);

	// If we are about to switch branches and the current branch is dirty,
	// auto-commit the current branch's work first so cross-task switching
	// does not block with GitDirtyTreeError.
	if (before && before !== branch) {
		try {
			await commitAllIfNeeded(
				cwd,
				`KainBain: auto-commit pending work on '${before}' before switching to '${branch}'`,
				{ expectedBranch: before },
			);
		} catch {
			// Non-fatal: ensureBranchCheckedOut will guard if it still cannot be checked out
		}
	}

	// Default-first pickup: when the task branch already exists and the tree
	// sits anywhere else (another task branch, a stale checkout), return to
	// the default branch before switching to the task branch. Skipped when
	// already on the default or task branch, or when either ref is missing
	// (unborn repos, unknown defaults) — the final ensure below owns those.
	let hoppedViaDefault = false;
	if (
		before &&
		baseBranch &&
		before !== branch &&
		before !== baseBranch
	) {
		const taskBranchKnown = await branchExists(cwd, branch).catch(() => false);
		const defaultKnown = await branchExists(cwd, baseBranch).catch(() => false);
		if (taskBranchKnown && defaultKnown) {
			const hop = await ensureBranchCheckedOut(cwd, baseBranch, {
				taskId: task.id,
				recovery,
				project,
			});
			if (hop.created || hop.switched) {
				hoppedViaDefault = true;
				recordBranchHop(
					taskStore,
					task,
					cwd,
					bridge,
					`Returned to default branch '${baseBranch}' before picking up task branch '${branch}' (was on '${before}')`,
				);
			}
		}
	}

	const outcome = await ensureBranchCheckedOut(cwd, branch, {
		baseBranch,
		taskId: task.id,
		recovery,
		project,
	});
	if (outcome.created || outcome.switched) {
		const switchedFrom = hoppedViaDefault ? baseBranch : before || "unknown";
		const detail = outcome.created
			? `Created and checked out task branch '${branch}'${baseBranch ? ` from '${baseBranch}'` : ""}`
			: `Checked out task branch '${branch}' (was on '${switchedFrom}')`;
		recordBranchHop(taskStore, task, cwd, bridge, detail);
	}
	if (outcome.worktreeRecoveredFrom) {
		recordBranchHop(
			taskStore,
			task,
			cwd,
			bridge,
			`Recovered stale linked worktree at '${outcome.worktreeRecoveredFrom}' holding '${branch}' (clean, nothing unpushed) and checked out '${branch}'`,
		);
	}
	// Ensure task.branch is set on the entity itself if it was derived
	task.branch = branch;
	taskStore._saveTaskMarkdown(cwd, task);
	await reportDirtyTreeRecoveries(taskStore, task, cwd, bridge);
	await reportStaleLockRecoveries(taskStore, task, cwd, bridge);
	return { ...outcome, branch };
}

/***
 * MARK: ensureTaskBranchRef
 * @description Human-review git policy: makes sure the task's branch REF
 *   exists WITHOUT checking it out. The single seam every human review
 *   operation (checkpoint entry, approval) routes through. Guarantees:
 *     - never switches branches, commits, pushes, merges, or deletes;
 *     - never invokes the clean-tree guard, so dirty trees and operators
 *       sitting on another branch never error;
 *     - creates the missing ref from the default branch tip (falling back
 *       to HEAD), so later work stages have a branch to pick up;
 *     - defers with a process-log warning — never throws — when creation is
 *       impossible (non-repo, unborn repo, invalid name, git failure), so a
 *       human checkpoint always parks or advances;
 *     - clears a stale `task.branchProvisionError` once the ref is known to
 *       exist, so an earlier defer never misleads operators after recovery.
 *   Reviewer edits made during `waiting_human` stay uncommitted in the tree:
 *   agent/CI work stages sweep them up via the existing ensureTaskBranch
 *   auto-commit, while the merge stage loudly refuses a dirty tree until
 *   the operator commits. The audit line records how many uncommitted
 *   paths were left behind.
 * @example await ensureTaskBranchRef(taskStore, task, '/repo', { stageName: 'Review' }) => { created, branch }
 * @param {Object} taskStore - TaskStore instance.
 * @param {Object} task - The task entity (branch resolved from it).
 * @param {string} [projectCwd] - Project working directory.
 * @param {Object} [opts]
 * @param {Object} [opts.bridge] - Event bridge override.
 * @param {string} [opts.stageName] - Human stage name for audit messages.
 * @param {string} [opts.stageId] - Human stage id fallback for audit messages.
 * @returns {Promise<{created: boolean, existed: boolean, deferred: string|null, checkedOut: boolean, switched: boolean, branch: string, startPoint: string|null}|null>} null when task is missing or cwd cannot be resolved.
 ***/
export async function ensureTaskBranchRef(taskStore, task, projectCwd, opts = {}) {
	if (!task) return null;
	const cwd = taskStore._resolveProjectCwd(task.projectId, projectCwd);
	if (!cwd) return null;
	const bridge = opts.bridge || taskStore.eventBridge;
	const branch = resolveTaskBranch(task);
	const checkpointLabel = opts.stageName || opts.stageId;
	const checkpoint = checkpointLabel
		? `human checkpoint '${checkpointLabel}'`
		: "human checkpoint";

	const defer = (reason) => {
		task.branchProvisionError = reason;
		const detail = `Warning: task-branch ref provisioning deferred (${reason})`;
		if (!Array.isArray(task.history)) {
			task.history = [];
		}
		task.history.push({ timestamp: new Date().toISOString(), action: detail });
		_appendProcessLog(task, `[WARN] Task-branch ref provisioning deferred: ${reason}`);
		taskStore._saveTaskMarkdown(cwd, task);
		return {
			created: false,
			existed: false,
			deferred: reason,
			checkedOut: false,
			switched: false,
			branch,
			startPoint: null,
		};
	};

	if (!isValidBranchName(branch)) {
		return defer(`invalid task-branch name '${branch}'`);
	}
	let repo = false;
	try {
		repo = await isGitRepository(cwd);
	} catch {
		repo = false;
	}
	if (!repo) {
		return defer("not a git repository");
	}
	// Persist the branch name on the entity when it was derived (mirrors
	// ensureTaskBranch); the recordBranchHop saves below persist it.
	task.branch = branch;

	let remainder = "working-tree state unknown";
	try {
		const { dirtyPaths } = await getWorkingTreeStatus(cwd, { ignorePaths: [] });
		remainder =
			dirtyPaths.length === 0
				? "working tree clean"
				: `leaving ${dirtyPaths.length} uncommitted path${dirtyPaths.length === 1 ? "" : "s"} in the tree for the next work stage`;
	} catch {
		// Best-effort audit fragment only; the ref work below still runs.
	}

	let exists = false;
	try {
		exists = await branchExists(cwd, branch);
	} catch {
		exists = false;
	}
	if (exists) {
		// The ref exists, so any earlier provisioning failure is spent.
		delete task.branchProvisionError;
		recordBranchHop(
			taskStore,
			task,
			cwd,
			bridge,
			`Task-branch ref '${branch}' already exists — no checkout performed (${checkpoint}; ${remainder})`,
		);
		await reportStaleLockRecoveries(taskStore, task, cwd, bridge);
		let startSha = null;
		try {
			startSha = await resolveSha(cwd, branch);
		} catch {
			try {
				startSha = await resolveSha(cwd, "HEAD");
			} catch {
				startSha = null;
			}
		}
		if (startSha) {
			task.humanCheckpointStartSha = startSha;
		}
		return {
			created: false,
			existed: true,
			deferred: null,
			checkedOut: false,
			switched: false,
			branch,
			startPoint: null,
			startSha,
		};
	}

	// Resolve the start-point WITHOUT switching: prefer the default branch
	// tip, fall back to HEAD, defer on unborn repositories (no commit to
	// point the ref at).
	let startPoint = null;
	let from = null;
	const baseBranch = await defaultBranch(cwd).catch(() => null);
	if (baseBranch && isValidBranchName(baseBranch)) {
		const baseKnown = await branchExists(cwd, baseBranch).catch(() => false);
		if (baseKnown) {
			startPoint = baseBranch;
			from = `'${baseBranch}'`;
		}
	}
	if (!startPoint) {
		const commits = await hasCommits(cwd).catch(() => false);
		if (!commits) {
			return defer("repository has no commits yet");
		}
		startPoint = "HEAD";
		from = "HEAD";
	}
	let created = false;
	try {
		const res = await createBranch(cwd, branch, { startPoint });
		created = res?.created === true;
	} catch (e) {
		return defer(`could not create from ${from} (${e?.message || e})`);
	}
	// The ref is now known to exist, so any earlier provisioning failure is spent.
	delete task.branchProvisionError;
	await reportStaleLockRecoveries(taskStore, task, cwd, bridge);
	recordBranchHop(
		taskStore,
		task,
		cwd,
		bridge,
		created
			? `Created task-branch ref '${branch}' from ${from} without checkout (${checkpoint}; ${remainder})`
			: `Task-branch ref '${branch}' already exists (created concurrently) — no checkout performed (${checkpoint}; ${remainder})`,
	);
	let startSha = null;
	try {
		startSha = await resolveSha(cwd, branch);
	} catch {
		try {
			startSha = await resolveSha(cwd, "HEAD");
		} catch {
			startSha = null;
		}
	}
	if (startSha) {
		task.humanCheckpointStartSha = startSha;
	}
	return {
		created,
		existed: !created,
		deferred: null,
		checkedOut: false,
		switched: false,
		branch,
		startPoint,
		startSha,
	};
}
