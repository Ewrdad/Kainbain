import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git } from "./exec.js";
import { _assertValidBranchName, isValidBranchName } from "./validation.js";
import { currentBranch, branchExists, hasCommits, isGitRepository } from "./status.js";
import { requireCleanWorkingTree } from "./workingTreeRecovery.js";
import { commitEngineSnapshots, isLiveTaskSnapshotPath } from "./commit.js";
import { GitError } from "./errors.js";

/***
 * MARK: commitSnapshotsBeforeSwitch
 * @description Commit-then-switch backstop shared by every branch switch
 *   below: the clean-tree guard deliberately ignores the engine's own
 *   snapshot paths (`docs/tasks/`, state dir) so mid-task report writes
 *   never block a hop — but git's own checkout safety does not ignore
 *   them, and trips on exactly our own just-written reports. Committing
 *   those snapshots onto the current branch (affinity-guarded) closes the
 *   gap; real dirt is never staged and still refuses loudly at the guard.
 *   Best-effort and warn-silent: the guard below owns real failures.
 ***/
async function commitSnapshotsBeforeSwitch(projectCwd, branch, current) {
	try {
		await commitEngineSnapshots(
			projectCwd,
			`KainBain: auto-commit engine snapshots before switching to '${branch}'`,
			{ expectedBranch: current || undefined },
		);
	} catch {
		// Best-effort: the clean-tree guard below owns real failures loudly.
	}
}

/***
 * MARK: checkoutBranch
 * @description Checks out an existing local branch. Idempotent: returns early
 *   (switched: false) when already on the branch. Refuses to run on a dirty
 *   working tree (GitDirtyTreeError) so uncommitted work is never carried or
 *   lost across branches.
 * @example await checkoutBranch('/repo', 'main') // throws GitDirtyTreeError when dirty
 * @param {string} projectCwd
 * @param {string} branch
 * @param {Object} [opts]
 * @param {boolean} [opts.checkClean=true] - Enforce the clean-tree guard.
 * @param {Object} [opts.project] - Project record; its `kainbainDirName`/`docsDirName`
 *   are threaded into the clean-tree guard.
 * @returns {Promise<{switched: boolean}>}
 ***/
export async function checkoutBranch(projectCwd, branch, opts = {}) {
	_assertValidBranchName(branch, "checkout");
	const current = await currentBranch(projectCwd);
	if (current === branch) return { switched: false };
	// Commit-then-switch: our own just-written snapshots must be committed
	// before git's checkout safety sees them (the guard below ignores them
	// by design). Real dirt is never staged and still refuses loudly.
	await commitSnapshotsBeforeSwitch(projectCwd, branch, current);
	if (opts.checkClean !== false) {
		await requireCleanWorkingTree(projectCwd, {
			...opts,
			context: `checkout of branch '${branch}'`,
		});
	}
	// Step 5 residue: the target branch may still track a live snapshot
	// from the dual-ownership era while this checkout holds the same path
	// as an untracked file (the untracked side always wins the migration —
	// the content is backend-regenerated store state). Move those files
	// aside across the checkout and restore them after: without this, git's
	// own untracked-overwrite safety blocks the switch even though the
	// clean-tree guard (correctly) ignores these paths.
	const aside = await moveAsideBlockingLiveSnapshots(projectCwd, branch, opts);
	try {
		await git(projectCwd, ["checkout", branch]);
	} finally {
		await restoreMovedAsideSnapshots(aside);
	}
	return { switched: true };
}

/***
 * MARK: moveAsideBlockingLiveSnapshots
 * @description Finds live task snapshots (`docs/tasks/<id>/task.md`) that
 *   the TARGET branch still tracks while this checkout holds as untracked
 *   files — the exact shape that makes git refuse a checkout with
 *   "untracked working tree files would be overwritten". Moves those
 *   files to a temp backup dir and returns a restore handle (null when
 *   nothing blocks). Only untracked-here files move: paths the current
 *   index tracks are git's normal checkout business and are left alone.
 * @example await moveAsideBlockingLiveSnapshots('/repo', 'main') => { cwd: '/repo', backupDir: '/tmp/...', moved: [...] } | null
 ***/
async function moveAsideBlockingLiveSnapshots(projectCwd, targetBranch, opts = {}) {
	let tracked;
	try {
		({ stdout: tracked } = await git(projectCwd, ["ls-tree", "-r", "--name-only", targetBranch]));
	} catch {
		return null;
	}
	const live = tracked
		.split("\n")
		.map((s) => s.trim())
		.filter((f) => f && isLiveTaskSnapshotPath(f, opts));
	if (live.length === 0) return null;
	let indexed;
	try {
		indexed = new Set(
			(await git(projectCwd, ["ls-files", "-z"])).stdout.split("\0").map((s) => s.trim()).filter(Boolean),
		);
	} catch {
		return null;
	}
	const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-snap-aside-"));
	const moved = [];
	for (const rel of live) {
		if (indexed.has(rel)) continue;
		const full = path.join(projectCwd, rel);
		let stat;
		try {
			stat = fs.statSync(full);
		} catch {
			continue;
		}
		if (!stat.isFile()) continue;
		try {
			const backup = path.join(backupDir, `${moved.length}.snapshot`);
			fs.renameSync(full, backup);
			moved.push({ rel, backup });
		} catch {
			// Best-effort per file; successfully moved files still restore.
		}
	}
	if (moved.length === 0) {
		fs.rmSync(backupDir, { recursive: true, force: true });
		return null;
	}
	return { cwd: projectCwd, backupDir, moved };
}

/***
 * MARK: restoreMovedAsideSnapshots
 * @description Restores files moved aside by moveAsideBlockingLiveSnapshots,
 *   overwriting the target branch's stale tracked copy with the newer
 *   backend-regenerated content (the backend re-saves task.md on every
 *   event, so the aside copy is authoritative). Never throws: leftovers
 *   are inert files the next save overwrites.
 * @example await restoreMovedAsideSnapshots(aside)
 ***/
async function restoreMovedAsideSnapshots(aside) {
	if (!aside) return;
	for (const { rel, backup } of aside.moved) {
		try {
			const full = path.join(aside.cwd, rel);
			fs.mkdirSync(path.dirname(full), { recursive: true });
			try {
				fs.rmSync(full, { force: true });
			} catch {
				// Fall through to the rename.
			}
			fs.renameSync(backup, full);
		} catch {
			// Inert leftover in the temp dir; the next save regenerates.
		}
	}
	try {
		fs.rmSync(aside.backupDir, { recursive: true, force: true });
	} catch {
		// Scratch dir only.
	}
}


/***
 * MARK: createBranch
 * @description Creates a local branch. Idempotent: resolves { created: false }
 *   (and does nothing) when the branch already exists — including a tolerant
 *   re-check for the checkout/b race between concurrent ensures.
 *   NOTE: does not switch branches; pair with checkoutBranch or use
 *   ensureBranchCheckedOut for the guarded combined flow.
 * @example await createBranch('/repo', 'kb/task') => { created: true }
 * @example await createBranch('/repo', 'kb/task', { startPoint: 'main' }) => { created: true }
 * @param {string} projectCwd
 * @param {string} branch
 * @param {Object} [opts]
 * @param {string} [opts.startPoint] - Ref the new branch points at
 *   (`git branch <name> <startPoint>`); defaults to the current HEAD. Must
 *   pass branch-name validation, which covers branch names, HEAD, and SHAs
 *   while excluding flag injection and rev-suffixes such as `~1`.
 * @returns {Promise<{created: boolean}>}
 ***/
export async function createBranch(projectCwd, branch, opts = {}) {
	_assertValidBranchName(branch, "create branch");
	const startPoint = opts?.startPoint;
	if (startPoint !== undefined && startPoint !== null) {
		_assertValidBranchName(startPoint, "create branch start-point");
	}
	if (await branchExists(projectCwd, branch)) return { created: false };
	try {
		await git(
			projectCwd,
			startPoint ? ["branch", branch, startPoint] : ["branch", branch],
		);
		return { created: true };
	} catch (e) {
		// Concurrent creators can race; tolerate "already exists" outcomes.
		if (await branchExists(projectCwd, branch)) return { created: false };
		throw e;
	}
}


/***
 * MARK: isWorktreeLockError
 * @description Whether a checkout failure is git refusing because the branch
 *   is already checked out in a linked worktree (`fatal: '...' is already
 *   used by worktree at '...'`). Only this narrow shape qualifies — every
 *   other checkout failure propagates untouched.
 * @example isWorktreeLockError(new Error("fatal: 'kb/t' is already used by worktree at '/w'")) => true
 * @param {*} error - The caught checkout error.
 * @returns {boolean}
 ***/
export function isWorktreeLockError(error) {
	const msg = String(error?.message || error || "");
	return /already used by worktree/i.test(msg);
}

/***
 * MARK: findBranchWorktreeHolder
 * @description Parses `git worktree list --porcelain` for the linked worktree
 *   currently holding `branch`. Returns null when no holder exists or the
 *   worktree metadata cannot be read (fail closed: the caller rethrows the
 *   original checkout error).
 * @example await findBranchWorktreeHolder('/repo', 'kb/task-1') => { path, head, branch }
 * @param {string} projectCwd
 * @param {string} branch
 * @returns {Promise<{path: string, head: string|null, branch: string|null}|null>}
 ***/
export async function findBranchWorktreeHolder(projectCwd, branch) {
	let stdout;
	try {
		({ stdout } = await git(projectCwd, ["worktree", "list", "--porcelain"]));
	} catch {
		return null;
	}
	const want = `refs/heads/${branch}`;
	let current = null;
	const flush = () => {
		const hit =
			current && current.branch === want ? { ...current } : null;
		current = null;
		return hit;
	};
	for (const line of String(stdout || "").split("\n")) {
		if (line.startsWith("worktree ")) {
			current = { path: line.slice("worktree ".length).trim(), head: null, branch: null };
		} else if (line.startsWith("HEAD ")) {
			if (current) current.head = line.slice("HEAD ".length).trim() || null;
		} else if (line.startsWith("branch ")) {
			if (current) current.branch = line.slice("branch ".length).trim() || null;
		} else if (line === "" && current) {
			const hit = flush();
			if (hit) return hit;
		}
	}
	return flush();
}

/***
 * MARK: reconcileBranchWorktreeLock
 * @description Recovers a branch-held-by-worktree checkout block when it is
 *   provably safe, so a stale linked worktree (e.g. orphaned by an isolation
 *   mode change) fails one stage instead of burning the whole auto-iteration
 *   budget. Removal requires ALL of:
 *     - the holder path is still on disk (missing paths just need a prune),
 *     - the holder tree is fully clean (`status --porcelain -uall` empty),
 *     - the holder contains no ignored files (build outputs, `.env` files
 *       are invisible to porcelain and must never be swept),
 *     - the branch holds no commits ahead of its upstream (nothing unpushed
 *       to lose; branches without an upstream are treated as ahead-unknown
 *       and refused),
 *     - the holder HEAD still matches the branch tip (sanity).
 *   Anything else returns `{ recovered: false }` with the holder and reason
 *   so the caller throws an actionable error naming the exact removal
 *   command. Removing a worktree never deletes the branch or its commits —
 *   only the checkout directory goes — but uncommitted or ignored files in
 *   that directory would be lost, hence the checks above.
 * @example await reconcileBranchWorktreeLock('/repo', 'kb/task-1') => { recovered, holder, reason }
 * @param {string} projectCwd
 * @param {string} branch
 * @returns {Promise<{recovered: boolean, holder: string|null, reason: string|null, prunedStale?: boolean}>}
 ***/
export async function reconcileBranchWorktreeLock(projectCwd, branch) {
	const holder = await findBranchWorktreeHolder(projectCwd, branch);
	if (!holder) {
		return { recovered: false, holder: null, reason: "no linked worktree holds the branch" };
	}
	const holderPath = holder.path;
	try {
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- holderPath is git-resolved worktree metadata for this repo */
		if (!fs.existsSync(holderPath)) {
			await git(projectCwd, ["worktree", "prune"]);
			return { recovered: true, holder: holderPath, reason: null, prunedStale: true };
		}
		const [{ stdout: holderHead }, { stdout: branchTip }] = await Promise.all([
			git(holderPath, ["rev-parse", "HEAD"]),
			git(projectCwd, ["rev-parse", "--verify", branch]),
		]);
		if (holderHead.trim() !== branchTip.trim()) {
			return {
				recovered: false,
				holder: holderPath,
				reason: "holder HEAD does not match the branch tip — inspect it before removing",
			};
		}
		const { stdout: statusOut } = await git(holderPath, [
			"status",
			"--porcelain",
			"-uall",
		]);
		if (statusOut.trim() !== "") {
			const dirtyCount = statusOut.trim().split("\n").length;
			return {
				recovered: false,
				holder: holderPath,
				reason: `holds ${dirtyCount} uncommitted path(s) — commit, stash, or move that work first`,
			};
		}
		const { stdout: ignoredOut } = await git(holderPath, [
			"status",
			"--porcelain",
			"--ignored",
		]);
		const ignored = ignoredOut.split("\n").filter((l) => l.startsWith("!!"));
		if (ignored.length > 0) {
			return {
				recovered: false,
				holder: holderPath,
				reason: `holds ${ignored.length} ignored file(s) that removal would delete — clear it manually`,
			};
		}
		let ahead = -1;
		try {
			const { stdout: aheadOut } = await git(projectCwd, [
				"rev-list",
				"--count",
				`${branch}@{upstream}..${branch}`,
			]);
			ahead = Number.parseInt(aheadOut.trim(), 10);
		} catch {
			ahead = -1;
		}
		if (!Number.isFinite(ahead) || ahead < 0) {
			return {
				recovered: false,
				holder: holderPath,
				reason: "branch has no upstream — cannot prove nothing unpushed would be orphaned",
			};
		}
		if (ahead > 0) {
			return {
				recovered: false,
				holder: holderPath,
				reason: `holds ${ahead} unpushed commit(s) — push the branch first`,
			};
		}
		await git(projectCwd, ["worktree", "remove", holderPath]);
		try {
			await git(projectCwd, ["worktree", "prune"]);
		} catch {
			// Prune is hygiene; the remove already succeeded.
		}
		return { recovered: true, holder: holderPath, reason: null };
	} catch (error) {
		return {
			recovered: false,
			holder: holderPath,
			reason: `recovery probe failed: ${error?.message || error}`,
		};
	}
}

/***
 * MARK: ensureBranchCheckedOut
 * @description The single, guarded entrypoint used by the pipeline: makes sure
 *   `branch` exists locally and is the checked-out branch. Safety rules:
 *     - no-op when already on the branch (dirty trees allowed there, because
 *       agents legitimately edit files while working),
 *     - refuses to switch on a dirty working tree (GitDirtyTreeError),
 *     - recovers a branch-held-by-linked-worktree checkout block when the
 *       holder is provably safe to remove (clean, no ignored files, nothing
 *       unpushed); otherwise throws an actionable error naming the holder,
 *     - creates the missing branch pinned to `opts.baseBranch` (default
 *       branch) via an explicit start point when possible — never silently
 *       from the current HEAD when a base was requested; without a usable
 *       base it falls back to the current HEAD,
 *     - skips the clean-tree check on unborn repositories (no tracked files
 *       exist, so branch creation cannot lose anything).
 * @example const { created } = await ensureBranchCheckedOut(cwd, 'kb/task-1', { baseBranch: 'main' })
 * @param {string} projectCwd
 * @param {string} branch
 * @param {Object} [opts]
 * @param {string} [opts.baseBranch] - Preferred base for new branches (default branch).
 * @param {boolean} [opts.allowCreate=true] - Whether creation is allowed.
 * @param {string} [opts.taskId] - Owning task id for the ladder stash marker.
 * @param {string} [opts.recovery] - 'ladder' (default) or 'off' for the clean-tree guard.
 * @param {Object} [opts.project] - Project record; its `kainbainDirName`/`docsDirName`
 *   are threaded into the clean-tree guard so engine-owned state under a custom
 *   folder never counts as dirty.
 * @returns {Promise<{created: boolean, checkedOut: boolean, switched: boolean}>}
 ***/
export async function ensureBranchCheckedOut(projectCwd, branch, opts = {}) {
	_assertValidBranchName(branch, "ensureBranchCheckedOut");
	const repo = await isGitRepository(projectCwd);
	if (!repo) {
		throw new GitError(
			`'${projectCwd}' is not a git repository — cannot use branches. Enable git for this project or turn off branch support.`,
		);
	}

	const current = await currentBranch(projectCwd).catch(() => null);
	if (current && current === branch) {
		return { created: false, checkedOut: true, switched: false };
	}

	// Commit-then-switch backstop (see checkoutBranch): snapshot dirt must
	// be committed before either the checkout guard or git's own safety.
	await commitSnapshotsBeforeSwitch(projectCwd, branch, current);

	if (await branchExists(projectCwd, branch)) {
		if (current !== "HEAD" || (await hasCommits(projectCwd))) {
			await requireCleanWorkingTree(projectCwd, {
				...opts,
				context: `checkout of branch '${branch}'`,
			});
		}
		try {
			await git(projectCwd, ["checkout", branch]);
		} catch (checkoutError) {
			if (!isWorktreeLockError(checkoutError)) throw checkoutError;
			const recovery = await reconcileBranchWorktreeLock(projectCwd, branch);
			if (!recovery.recovered) {
				throw new GitError(
					`Branch '${branch}' is already checked out in linked worktree '${recovery.holder || "unknown"}'` +
						`${recovery.reason ? ` (${recovery.reason})` : ""}` +
						`. Remove that worktree ('git worktree remove ${recovery.holder || "<path>"}') or move its work, then retry. ` +
						`Original error: ${checkoutError?.message || checkoutError}`,
				);
			}
			await git(projectCwd, ["checkout", branch]);
			return {
				created: false,
				checkedOut: true,
				switched: true,
				worktreeRecoveredFrom: recovery.holder,
			};
		}
		return { created: false, checkedOut: true, switched: true };
	}

	if (opts.allowCreate === false) {
		throw new GitError(
			`Branch '${branch}' does not exist and branch creation is disabled — nothing to check out.`,
		);
	}

	// Unborn repos have no tracked work to preserve; skipping the strict guard
	// here is what makes fresh KainBain projects usable at all.
	if (await hasCommits(projectCwd)) {
		await requireCleanWorkingTree(projectCwd, {
			...opts,
			context: `creation of branch '${branch}'`,
		});
	}

	const base = opts.baseBranch;
	const pinnedBase =
		base && isValidBranchName(base) && (await branchExists(projectCwd, base))
			? base
			: null;
	if (pinnedBase) {
		try {
			await git(projectCwd, ["checkout", pinnedBase]);
		} catch (checkoutError) {
			// The base exists but cannot be checked out (worktree lock,
			// corrupt ref): NEVER silently branch from the current HEAD —
			// that would base this task on another task's unmerged work.
			// Pin the start point explicitly instead; if pinning fails,
			// fail loudly with the base recorded.
			let pinnedCreation = null;
			try {
				pinnedCreation = await createBranch(projectCwd, branch, {
					startPoint: pinnedBase,
				});
			} catch {
				throw new GitError(
					`Could not base branch '${branch}' on '${pinnedBase}': checkout of the base failed (${checkoutError?.message || checkoutError}) and pinning the start point failed too. Resolve the base branch before retrying.`,
				);
			}
			await git(projectCwd, ["checkout", branch]);
			return {
				created: pinnedCreation?.created === true,
				checkedOut: true,
				switched: true,
			};
		}
	}
	try {
		if (pinnedBase) {
			// Explicit start point: the branch is pinned to the base even if
			// the checkout above raced or the HEAD moved underneath us. Honor
			// createBranch's own idempotence (a concurrent creator reporting
			// `created: false`) instead of claiming we created it.
			const { created } = await createBranch(projectCwd, branch, {
				startPoint: pinnedBase,
			});
			await git(projectCwd, ["checkout", branch]);
			return { created, checkedOut: true, switched: true };
		}
		await git(projectCwd, ["checkout", "-b", branch]);
		return { created: true, checkedOut: true, switched: true };
	} catch (e) {
		// Tolerate the create/checkout race (branch appeared in between).
		if (await branchExists(projectCwd, branch)) {
			await git(projectCwd, ["checkout", branch]);
			return { created: false, checkedOut: true, switched: true };
		}
		throw e;
	}
}


/***
 * MARK: defaultBranch
 * @description Resolves the project's default (integration) branch with a
 *   layered fallback chain so repos configured as 'master' (or without any
 *   remote) keep working:
 *     1. refs/remotes/origin/HEAD symbolic ref,
 *     2. local 'main' branch,
 *     3. local 'master' branch,
 *     4. the currently checked-out branch,
 *     5. the supplied fallback (default 'main').
 * @example await defaultBranch('/repo') => 'master'
 * @param {string} projectCwd
 * @returns {Promise<string>}
 ***/
export async function defaultBranch(projectCwd, opts = {}) {
	try {
		const { stdout } = await git(projectCwd, [
			"symbolic-ref",
			"refs/remotes/origin/HEAD",
		]);
		const branch = stdout.replace("refs/remotes/origin/", "").trim();
		if (isValidBranchName(branch)) return branch;
	} catch {
		// No origin HEAD configured (e.g. fresh local repo) — try known names.
	}
	try {
		await git(projectCwd, ["rev-parse", "--verify", "refs/heads/main"]);
		return "main";
	} catch {
		// fall through
	}
	try {
		await git(projectCwd, ["rev-parse", "--verify", "refs/heads/master"]);
		return "master";
	} catch {
		// fall through
	}
	try {
		const current = await currentBranch(projectCwd);
		if (current && current !== "HEAD" && isValidBranchName(current))
			return current;
	} catch {
		// fall through
	}
	return opts.fallback || "main";
}


/***
 * MARK: returnToDefaultBranch
 * @description Checks out the project's default branch (resolved by
 *   defaultBranch). Idempotent no-op when already there. Refuses on a dirty
 *   working tree (GitDirtyTreeError) — callers finalize (commit first) so the
 *   return lands clean, and a blocked return fails loudly instead of leaving
 *   the tree stranded on a task branch.
 * @example await returnToDefaultBranch('/repo') => { switched: true, branch: 'main' }
 * @param {string} projectCwd - Working directory for the command.
 * @param {Object} [opts]
 * @param {string} [opts.fallback] - Fallback default-branch name.
 * @param {boolean} [opts.checkClean=true] - Enforce the clean-tree guard.
 * @param {string} [opts.recovery] - 'ladder' or 'off' for the clean-tree guard.
 * @returns {Promise<{switched: boolean, branch: string}>}
 ***/
export async function returnToDefaultBranch(projectCwd, opts = {}) {
	const fallback = typeof opts.fallback === "string" ? opts.fallback : undefined;
	const def = await defaultBranch(projectCwd, fallback ? { fallback } : {});
	const current = await currentBranch(projectCwd).catch(() => null);
	if (current && current === def) return { switched: false, branch: def };
	const checkoutOpts = { checkClean: opts.checkClean };
	if (opts.taskId) checkoutOpts.taskId = opts.taskId;
	if (opts.recovery) checkoutOpts.recovery = opts.recovery;
	const result = await checkoutBranch(projectCwd, def, checkoutOpts);
	return { switched: result.switched, branch: def };
}


/***
 * MARK: deleteBranch
 * @description Deletes a local branch (with -D; branch support is engine-owned
 *   so a forced delete is acceptable). Used for optional cleanup after a
 *   successful merge. Refuses silently-unsafe names via validation.
 * @example await deleteBranch('/repo', 'kb/task-1') => { deleted: true }
 * @param {string} projectCwd
 * @param {string} branch
 * @returns {Promise<{deleted: boolean}>}
 ***/
export async function deleteBranch(projectCwd, branch) {
	_assertValidBranchName(branch, "deleteBranch");
	if (!(await branchExists(projectCwd, branch))) return { deleted: false };
	await git(projectCwd, ["branch", "-D", branch]);
	return { deleted: true };
}


/***
 * MARK: withCheckedOutBranch
 * @description Runs `fn` on an existing `branch` inside the primary checkout,
 *   then restores the project's default branch on every exit path (success,
 *   command failure, timeout, thrown runner). Commit-then-switch first: the
 *   engine's own snapshot dirt (`docs/tasks/`, state dir — ignored by the
 *   guard but not by git) auto-commits onto the current branch so our own
 *   just-written reports can never trip the switch. Guards second: real
 *   dirt refuses the switch (recovery off — uncommitted work is never
 *   stashed or lost by an execution helper). No checkout happens when
 *   `branch` is falsy or already current, so callers can use it unconditionally.
 *   Failure contract: a failed RESTORE always wins over a failed `fn` — the
 *   checkout being stranded on `branch` is the operator-actionable state — but
 *   the original error message is folded into the thrown GitError so neither
 *   failure can mask the other. Nothing is force-cleaned: a stranded checkout
 *   is left for a human (EscalationLadder Step 7), never auto-repaired.
 * @example await withCheckedOutBranch('/repo', 'main', async () => runTests())
 * @param {string} projectCwd - Primary checkout to switch.
 * @param {string|null} branch - Branch to run on (falsy runs `fn` as-is).
 * @param {Function} fn - Async callback executed on the target branch.
 * @param {Object} [opts]
 * @param {string} [opts.context] - Human string for the clean-tree guard.
 * @param {string} [opts.fallback] - Fallback default-branch name.
 * @param {string} [opts.taskId] - Owning task id for guard markers.
 * @returns {Promise<*>} Whatever `fn` resolved with.
 * @throws {GitError} Invalid branch name, dirty tree (refused switch), failed
 *   checkout, failed restore, or the original `fn` error re-thrown unchanged
 *   after a clean restore.
 ***/
export async function withCheckedOutBranch(projectCwd, branch, fn, opts = {}) {
	if (!branch) {
		return await fn();
	}
	_assertValidBranchName(branch, "withCheckedOutBranch");

	const def = await defaultBranch(projectCwd, opts.fallback ? { fallback: opts.fallback } : {});
	const current = await currentBranch(projectCwd).catch(() => null);

	if (current === branch) {
		return await fn();
	}

	const context = opts.context || `execution on branch '${branch}'`;
	const cleanOpts = { context, recovery: "off" };
	if (opts.taskId) cleanOpts.taskId = opts.taskId;
	await requireCleanWorkingTree(projectCwd, cleanOpts);

	const switchOpts = { checkClean: false, recovery: "off" };
	if (opts.taskId) switchOpts.taskId = opts.taskId;
	await checkoutBranch(projectCwd, branch, switchOpts);

	// Capture (never swallow) the fn error so the restore below can run on
	// the failure path too; a failed restore wins over it because a checkout
	// left on `branch` is the state an operator must act on, but the original
	// message rides along so nothing is masked.
	let fnError = null;
	let result;
	try {
		result = await fn();
	} catch (err) {
		fnError = err;
	}

	if (branch !== def) {
		try {
			const restoreOpts = { recovery: "off" };
			if (opts.fallback) restoreOpts.fallback = opts.fallback;
			if (opts.taskId) restoreOpts.taskId = opts.taskId;
			await returnToDefaultBranch(projectCwd, restoreOpts);
		} catch (restoreErr) {
			throw new GitError(
				`Could not return to the default branch '${def}' after running on '${branch}': ${restoreErr.message || restoreErr}` +
					(fnError
						? ` (the command on '${branch}' had already failed: ${fnError.message || fnError})`
						: ""),
			);
		}
	}

	if (fnError) {
		throw fnError;
	}
	return result;
}


