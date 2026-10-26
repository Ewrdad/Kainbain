/* eslint-disable security/detect-non-literal-fs-filename */
// WP5 regression suite: per-task workspace isolation, the dirty-tree
// recovery ladder, hardened lock reaping, and actionable merge diagnostics.
// Real git, throwaway temp directories only — never the KainBain repo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
	gitAvailable,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
	runGit,
	plantIndexLock,
} from "./test-helpers/tmpRepo.js";

const {
	requireCleanWorkingTree,
	assessDirtyTree,
	recoverDirtyTree,
	drainDirtyTreeRecoveries,
	formatDirtyTreeRecoveryNotice,
	mergeBranch,
	GitDirtyTreeError,
	GitMergeConflictError,
	buildGitConflictDiagnostics,
	maybeRecoverStaleLock,
	drainGitLockRecoveries,
	formatGitLockRecoveryNotice,
	ensureBranchCheckedOut,
	currentBranch,
	isMergeInProgress,
	countUniqueCommits,
} = await import("./git.js");
const { ensureTaskBranch } = await import("./work/taskBranches.js");
const { finalizeTaskBranch } = await import("./work/taskFinalize.js");
const {
	ensureTaskWorktree,
	WORKTREE_BASE_DIR,
	QUARANTINE_DIR,
} = await import("./work/taskWorkspace.js");
const {
	removeTaskWorktreeSync,
	reapOrphanedWorktreesSync,
} = await import("./work/taskLifecycle.js");
const { TaskStore } = await import("./taskStore.js");

/***
 * MARK: WP5 workspace isolation + recovery ladder regressions
 * @description Proves each WP5 success criterion against real repositories:
 *   quarantine absorption, ordered sweep/stash/report recovery, worktree
 *   sibling isolation, fail-closed lock reaping with verification basis, and
 *   SHA-carrying conflict diagnostics.
 ***/

const noLiveHolders = async () => ({ holders: [], inconclusive: false });

function makeStore(dir, projectOverrides = {}) {
	const project = {
		id: "p1",
		name: "P1",
		cwd: dir,
		useBranches: true,
		...projectOverrides,
	};
	const projectStore = { getProject: () => project };
	const store = new TaskStore({ eventBridge: {}, projectStore });
	return { store, project };
}

function makeTask(store, dir, goal = "wp5 test") {
	const task = store.createTask("p1", { goal, projectCwd: dir });
	task.branch = `kb/${task.id}`;
	return task;
}

/***
 * MARK: plantFailingPreCommitHook
 * @description Installs a pre-commit hook that always fails, so the pickup
 *   auto-commit cannot clean the tree. That makes the clean-tree guard's
 *   decision observable: the ladder stashes the tracked modification away,
 *   while a strict opt-out refuses the switch and leaves it in place.
 * @param {string} cwd - Repo working directory.
 * @returns {void}
 ***/
function plantFailingPreCommitHook(cwd) {
	const hookDir = path.join(cwd, ".git", "hooks");
	fs.mkdirSync(hookDir, { recursive: true });
	const hook = path.join(hookDir, "pre-commit");
	fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n");
	fs.chmodSync(hook, 0o755);
}

describe.skipIf(!gitAvailable)("quarantine isolation (default mode)", () => {
	let base;
	const repos = makeRepoTracker();

	beforeAll(() => {
		base = makeTmpBase("kainbain-wp5-quarantine-");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	it("stray files under quarantine/worktree drop zones never block the guard", async () => {
		const cwd = repos.track(initRepo(path.join(base, "quarantine-ok")));
		fs.mkdirSync(path.join(cwd, QUARANTINE_DIR), { recursive: true });
		fs.mkdirSync(path.join(cwd, WORKTREE_BASE_DIR), { recursive: true });
		fs.writeFileSync(
			path.join(cwd, QUARANTINE_DIR, "task-a-scratch.json"),
			'{"partial": true}\n',
		);
		fs.writeFileSync(
			path.join(cwd, WORKTREE_BASE_DIR, "stale-probe"),
			"probe\n",
		);

		await expect(
			requireCleanWorkingTree(cwd, { context: "test" }),
		).resolves.toMatchObject({ clean: true });
		const hop = await ensureBranchCheckedOut(cwd, "kb/other", {
			baseBranch: "main",
		});
		expect(hop.switched).toBe(true);
		expect(await currentBranch(cwd)).toBe("kb/other");
	});

	it("sweeps engine debris and passes while leaving user files reported", async () => {
		const cwd = repos.track(initRepo(path.join(base, "sweep")));
		fs.writeFileSync(path.join(cwd, "crash.tmp"), "debris\n");
		fs.writeFileSync(path.join(cwd, ".DS_Store"), "debris\n");

		const assessment = await assessDirtyTree(cwd);
		expect(assessment.clean).toBe(false);
		expect(assessment.sweepablePaths).toEqual(
			expect.arrayContaining(["crash.tmp", ".DS_Store"]),
		);
		expect(assessment.blockingPaths).toEqual([]);

		const guard = await requireCleanWorkingTree(cwd, { context: "test" });
		expect(guard.clean).toBe(true);
		expect(guard.recoveryAttempts.some((a) => a.step === "sweep")).toBe(true);
		expect(fs.existsSync(path.join(cwd, "crash.tmp"))).toBe(false);
		expect(fs.existsSync(path.join(cwd, ".DS_Store"))).toBe(false);
	});

	it("stashes tracked sibling modifications with a task marker and proceeds", async () => {
		const cwd = repos.track(initRepo(path.join(base, "stash")));
		fs.writeFileSync(path.join(cwd, "code.js"), "let x = 1;\n");
		runGit(cwd, "add", "-A");
		runGit(cwd, "commit", "-m", "base");
		await ensureBranchCheckedOut(cwd, "kb/task-a", { baseBranch: "main" });
		// Sibling task A leaves a tracked modification behind.
		fs.writeFileSync(path.join(cwd, "code.js"), "let x = 2;\n");

		// Task B pickup is not blocked: the ladder preserves the work in a
		// marked stash and the switch proceeds.
		const hop = await ensureBranchCheckedOut(cwd, "kb/task-b", {
			baseBranch: "main",
			taskId: "task-b",
		});
		expect(hop.switched).toBe(true);
		expect(await currentBranch(cwd)).toBe("kb/task-b");
		expect(runGit(cwd, "stash", "list")).toContain("kainbain-task-task-b");

		// The ladder run is journaled for Tier 1 resume (stash ref + trail).
		const journaled = await drainDirtyTreeRecoveries(cwd);
		expect(journaled.length).toBeGreaterThan(0);
		const run = journaled.find((e) => e.taskId === "task-b");
		expect(run.recovered).toBe(true);
		expect(run.stashRef).toBeTruthy();
		expect(run.recoveryAttempts.some((a) => a.step === "stash")).toBe(true);
		expect(formatDirtyTreeRecoveryNotice(run)).toContain("stashed to");
	});

	it("refuses untracked user files with exact paths and the ladder trail", async () => {
		const cwd = repos.track(initRepo(path.join(base, "refuse")));
		await ensureBranchCheckedOut(cwd, "kb/task-a", { baseBranch: "main" });
		fs.writeFileSync(path.join(cwd, "sibling-notes.txt"), "stray\n");

		let caught = null;
		try {
			await requireCleanWorkingTree(cwd, { context: "test" });
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(GitDirtyTreeError);
		expect(caught.dirtyPaths).toContain("sibling-notes.txt");
		expect(Array.isArray(caught.recoveryAttempts)).toBe(true);
		expect(String(caught.message)).toContain("sibling-notes.txt");
		// Nothing acted, so nothing journals — and the file is untouched.
		expect(await drainDirtyTreeRecoveries(cwd)).toEqual([]);
		expect(fs.readFileSync(path.join(cwd, "sibling-notes.txt"), "utf8")).toBe(
			"stray\n",
		);
		// The branch switch is refused too, and the tree stays put.
		await expect(
			ensureBranchCheckedOut(cwd, "kb/task-b", { baseBranch: "main" }),
		).rejects.toBeInstanceOf(GitDirtyTreeError);
		expect(await currentBranch(cwd)).toBe("kb/task-a");
	});

	it("recoverDirtyTree reports the ordered ladder on unrecoverable trees", async () => {
		const cwd = repos.track(initRepo(path.join(base, "ladder-report")));
		fs.writeFileSync(path.join(cwd, "code.js"), "let x = 1;\n");
		runGit(cwd, "add", "-A");
		runGit(cwd, "commit", "-m", "base");
		fs.writeFileSync(path.join(cwd, "leftover.tmp"), "debris\n");
		fs.writeFileSync(path.join(cwd, "code.js"), "let x = 2;\n");
		fs.writeFileSync(path.join(cwd, "user-notes.txt"), "keep me\n");

		const result = await recoverDirtyTree(cwd, { taskId: "task-9" });
		expect(result.recovered).toBe(false);
		expect(result.dirtyPaths).toEqual(["user-notes.txt"]);
		expect(result.recoveryAttempts.map((a) => a.step)).toEqual([
			"sweep",
			"stash",
		]);
		expect(result.stashRef).toBeTruthy();
		expect(fs.existsSync(path.join(cwd, "leftover.tmp"))).toBe(false);
		expect(fs.existsSync(path.join(cwd, "user-notes.txt"))).toBe(true);
	});

	it("ladder mode stashes a tracked modification the auto-commit could not clean", async () => {
		const cwd = repos.track(initRepo(path.join(base, "ladder-auto")));
		fs.writeFileSync(path.join(cwd, "code.js"), "let x = 1;\n");
		runGit(cwd, "add", "-A");
		runGit(cwd, "commit", "-m", "base");
		plantFailingPreCommitHook(cwd);
		fs.writeFileSync(path.join(cwd, "code.js"), "let x = 2;\n");
		const { store } = makeStore(cwd, { useBranches: false });
		const task = makeTask(store, cwd, "ladder auto");

		const outcome = await store.ensureTaskBranch(task, cwd);
		expect(outcome.switched).toBe(true);
		expect(await currentBranch(cwd)).toBe(task.branch);
		expect(runGit(cwd, "stash", "list")).toContain(
			`kainbain-task-${task.id}`,
		);
	});

	for (const flag of [
		{ workspaceIsolation: "off" },
		{ dirtyTreeRecovery: "off" },
	]) {
		it(`strict opt-out ${JSON.stringify(flag)} refuses the dirty tree instead of stashing`, async () => {
			const label = Object.keys(flag)[0];
			const cwd = repos.track(initRepo(path.join(base, `strict-${label}`)));
			fs.writeFileSync(path.join(cwd, "code.js"), "let x = 1;\n");
			runGit(cwd, "add", "-A");
			runGit(cwd, "commit", "-m", "base");
			plantFailingPreCommitHook(cwd);
			fs.writeFileSync(path.join(cwd, "code.js"), "let x = 2;\n");
			const { store } = makeStore(cwd, { useBranches: false, ...flag });
			const task = makeTask(store, cwd, `strict ${label}`);

			let caught = null;
			try {
				await store.ensureTaskBranch(task, cwd);
			} catch (err) {
				caught = err;
			}
			expect(caught).toBeInstanceOf(GitDirtyTreeError);
			expect(caught.recoveryAttempts).toEqual([]);
			// Refused loudly: the modification is untouched and never stashed.
			expect(fs.readFileSync(path.join(cwd, "code.js"), "utf8")).toBe(
				"let x = 2;\n",
			);
			expect(runGit(cwd, "stash", "list").trim()).toBe("");
			expect(await currentBranch(cwd)).toBe("main");
		});
	}
});

describe.skipIf(!gitAvailable)("hardened lock reaping", () => {
	let base;
	const repos = makeRepoTracker();

	beforeAll(() => {
		base = makeTmpBase("kainbain-wp5-lock-");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	it("reaps a stale worktree lock with an ownership verification basis", async () => {
		const cwd = repos.track(initRepo(path.join(base, "wt-lock")));
		runGit(cwd, "branch", "kb/wt-1");
		execFileSync("git", ["worktree", "add", "./wt-1", "kb/wt-1"], { cwd });
		const worktreeDir = path.join(cwd, "wt-1");
		try {
			// The worktree carries a `.git` FILE (not a directory): the
			// lock lives in the linked gitdir, and the reaper must find it
			// there instead of misreporting a missing git dir.
			expect(fs.statSync(path.join(worktreeDir, ".git")).isFile()).toBe(true);
			const gitdir = fs
				.readFileSync(path.join(worktreeDir, ".git"), "utf8")
				.match(/^gitdir:\s*(.+)$/m)[1]
				.trim();
			const resolvedGitdir = path.resolve(worktreeDir, gitdir);
			const lockPath = path.join(resolvedGitdir, "index.lock");
			fs.writeFileSync(lockPath, "");
			const past = new Date(Date.now() - 120_000);
			fs.utimesSync(lockPath, past, past);

			const result = await maybeRecoverStaleLock(worktreeDir, {
				listLiveGitProcesses: noLiveHolders,
			});
			expect(result.recovered).toBe(true);
			expect(result.reason).toBe("stale-recovered");
			expect(result.lockPath).toBe(lockPath);
			expect(result.verificationBasis).toContain("holder scan clear");
			expect(result.verificationBasis).toContain("120s");
			expect(fs.existsSync(lockPath)).toBe(false);
		} finally {
			try {
				execFileSync("git", ["worktree", "remove", "--force", "wt-1"], { cwd });
			} catch {
				// best-effort teardown
			}
		}
	});

	it("never deletes fresh, live-held, or inconclusive locks", async () => {
		const cwd = repos.track(initRepo(path.join(base, "lock-refusals")));

		const fresh = plantIndexLock(cwd, 0);
		const freshRes = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: noLiveHolders,
		});
		expect(freshRes.recovered).toBe(false);
		expect(freshRes.reason).toBe("fresh-lock");
		expect(freshRes.verificationBasis).toContain("threshold");
		expect(fs.existsSync(fresh)).toBe(true);
		fs.rmSync(fresh, { force: true });

		const held = plantIndexLock(cwd, 120_000);
		const heldRes = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: async () => ({
				holders: [{ pid: 12345, command: "git status" }],
				inconclusive: false,
			}),
		});
		expect(heldRes.recovered).toBe(false);
		expect(heldRes.reason).toBe("live-holder");
		expect(fs.existsSync(held)).toBe(true);
		fs.rmSync(held, { force: true });

		const murky = plantIndexLock(cwd, 120_000);
		const murkyRes = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: async () => ({ holders: [], inconclusive: true }),
		});
		expect(murkyRes.recovered).toBe(false);
		expect(murkyRes.reason).toBe("unknown-holder");
		expect(murkyRes.verificationBasis).toContain("inconclusive");
		expect(fs.existsSync(murky)).toBe(true);
		fs.rmSync(murky, { force: true });
	});

	it("journals recoveries with age and verification basis for audit", async () => {
		const cwd = repos.track(initRepo(path.join(base, "lock-journal")));
		plantIndexLock(cwd, 90_000);
		const result = await maybeRecoverStaleLock(cwd, {
			listLiveGitProcesses: noLiveHolders,
		});
		expect(result.recovered).toBe(true);

		const journaled = await drainGitLockRecoveries(cwd);
		expect(journaled.length).toBe(1);
		expect(journaled[0].verificationBasis).toContain("holder scan clear");
		expect(journaled[0].ageMs).toBeGreaterThanOrEqual(90_000);
		expect(
			formatGitLockRecoveryNotice(journaled[0]),
		).toContain("[verification:");
		// Drained entries do not repeat.
		expect(await drainGitLockRecoveries(cwd)).toEqual([]);
	});
});

describe.skipIf(!gitAvailable)("actionable merge conflict diagnostics", () => {
	let base;
	const repos = makeRepoTracker();

	beforeAll(() => {
		base = makeTmpBase("kainbain-wp5-conflict-");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	function conflictingRepo(name) {
		const cwd = repos.track(initRepo(path.join(base, name)));
		fs.writeFileSync(path.join(cwd, "file.txt"), "shared base\n");
		runGit(cwd, "add", "-A");
		runGit(cwd, "commit", "-m", "base file");
		runGit(cwd, "branch", "kb/feat");
		fs.writeFileSync(path.join(cwd, "file.txt"), "main side\n");
		runGit(cwd, "commit", "-am", "main change");
		runGit(cwd, "checkout", "kb/feat");
		fs.writeFileSync(path.join(cwd, "file.txt"), "feat side\n");
		runGit(cwd, "commit", "-am", "feat change");
		runGit(cwd, "checkout", "main");
		return cwd;
	}

	it("carries conflicted files, source/target SHAs, and strategy", async () => {
		const cwd = conflictingRepo("conflict-shas");
		let caught = null;
		try {
			await mergeBranch(cwd, "kb/feat");
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(GitMergeConflictError);
		expect(caught.conflictedFiles).toEqual(["file.txt"]);
		for (const sha of [caught.sourceSha, caught.targetSha, caught.baseSha]) {
			expect(sha).toMatch(/^[0-9a-f]{40}$/);
		}
		expect(caught.strategy).toContain("merge --no-edit");
		// The tree is rolled back: no half-merged state leaks to the caller.
		expect(await isMergeInProgress(cwd)).toBe(false);
		expect(await currentBranch(cwd)).toBe("main");

		const { block, diagnostics } = buildGitConflictDiagnostics({
			taskBranch: "kb/feat",
			mainBranch: "main",
			sourceSha: caught.sourceSha,
			targetSha: caught.targetSha,
			baseSha: caught.baseSha,
			strategy: caught.strategy,
			conflictedFiles: caught.conflictedFiles,
		});
		expect(block).toContain(caught.sourceSha);
		expect(block).toContain(caught.targetSha);
		expect(block).toContain(caught.baseSha);
		expect(block).toContain("file.txt");
		expect(diagnostics.conflictedFiles).toEqual(["file.txt"]);
	});
});

describe.skipIf(!gitAvailable)("per-task worktree isolation", () => {
	let base;
	const repos = makeRepoTracker();

	beforeAll(() => {
		base = makeTmpBase("kainbain-wp5-worktree-");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	function worktreeRepo(name) {
		const cwd = repos.track(initRepo(path.join(base, name)));
		const { store } = makeStore(cwd, { workspaceIsolation: "worktree" });
		return { cwd, store };
	}

	it("provisions one isolated tree per task; sibling strays never cross", async () => {
		const { cwd, store } = worktreeRepo("siblings");
		const taskA = makeTask(store, cwd, "task A work");
		const taskB = makeTask(store, cwd, "task B work");

		const pickupA = await ensureTaskBranch(store, taskA, cwd);
		const pickupB = await ensureTaskBranch(store, taskB, cwd);
		expect(pickupA.worktreeDir).toBeTruthy();
		expect(pickupB.worktreeDir).toBeTruthy();
		expect(pickupA.worktreeDir).not.toBe(pickupB.worktreeDir);
		expect(fs.statSync(path.join(pickupA.worktreeDir, ".git")).isFile()).toBe(
			true,
		);
		expect(await currentBranch(pickupA.worktreeDir)).toBe(taskA.branch);

		// Task A leaves a stray file in its own tree.
		fs.writeFileSync(
			path.join(pickupA.worktreeDir, "a-stray.txt"),
			"task A debris\n",
		);
		// Task B pickup proceeds, and the primary checkout never moves.
		const repickupB = await ensureTaskBranch(store, taskB, cwd);
		expect(repickupB.worktreeDir).toBe(pickupB.worktreeDir);
		expect(await currentBranch(cwd)).toBe("main");
		expect(runGit(cwd, "status", "--porcelain")).not.toContain("a-stray");
		// The strays stay per-task: B's tree is clean of A's debris.
		expect(
			runGit(pickupB.worktreeDir, "status", "--porcelain"),
		).not.toContain("a-stray");
	});

	it("finalises inside the worktree and leaves the primary on default", async () => {
		const { cwd, store } = worktreeRepo("finalise");
		const task = makeTask(store, cwd, "worktree work");
		const pickup = await ensureTaskBranch(store, task, cwd);
		fs.writeFileSync(
			path.join(pickup.worktreeDir, "feature.js"),
			"export const feature = true;\n",
		);

		const summary = await finalizeTaskBranch(store, task, cwd, {
			stageName: "Plan",
		});
		expect(summary.worktreeDir).toBe(pickup.worktreeDir);
		expect(summary.committed).toBe(true);
		expect(summary.returnError).toBeNull();
		expect(await currentBranch(cwd)).toBe("main");
		// The work landed on the task branch ref (visible from primary).
		expect(runGit(cwd, "log", "--oneline", task.branch)).toContain(
			"auto-commit work after stage",
		);
	});

	it("falls back to the primary checkout when no worktree exists", async () => {
		const { cwd, store } = worktreeRepo("fallback");
		const task = makeTask(store, cwd, "no worktree yet");
		const { resolveTaskCwd } = await import("./work/taskWorkspace.js");
		expect(await resolveTaskCwd(store, task, cwd)).toBe(cwd);
	});

	it("provisions worktrees under a custom state folder, not the default", async () => {
		const cwd = repos.track(initRepo(path.join(base, "custom-state")));
		const { store } = makeStore(cwd, {
			workspaceIsolation: "worktree",
			kainbainDirName: ".kb",
		});
		const task = makeTask(store, cwd, "custom state worktree");
		const pickup = await ensureTaskBranch(store, task, cwd);
		expect(pickup.worktreeDir).toBe(
			path.join(cwd, ".kb", "worktrees", String(task.id)),
		);
		expect(fs.existsSync(pickup.worktreeDir)).toBe(true);
		expect(fs.existsSync(path.join(cwd, ".kainbain"))).toBe(false);

		// resolveTaskCwd must agree on the custom base on the ensure path
		// too (it provisions the same worktree instead of a default one).
		const { resolveTaskCwd } = await import("./work/taskWorkspace.js");
		const other = makeTask(store, cwd, "second custom task");
		const resolved = await resolveTaskCwd(store, other, cwd, { ensure: true });
		expect(resolved).toBe(
			path.join(cwd, ".kb", "worktrees", String(other.id)),
		);
		expect(fs.existsSync(path.join(cwd, ".kainbain"))).toBe(false);
	});

	it("deletes the worktree with the task and reaps terminal orphans on scan", async () => {
		const { cwd, store } = worktreeRepo("reap");
		const taskGone = makeTask(store, cwd, "deleted soon");
		const gonePickup = await ensureTaskBranch(store, taskGone, cwd);
		expect(fs.existsSync(gonePickup.worktreeDir)).toBe(true);

		const { deleteTask } = await import("./work/taskLifecycle.js");
		deleteTask(store, "p1", taskGone.id, cwd);
		expect(fs.existsSync(gonePickup.worktreeDir)).toBe(false);

		// Orphan scan: a completed task's tree is reaped; an active task's
		// tree and failed tasks' trees are kept.
		const taskActive = makeTask(store, cwd, "still running");
		const activePickup = await ensureTaskBranch(store, taskActive, cwd);
		const taskDone = makeTask(store, cwd, "already landed");
		const donePickup = await ensureTaskBranch(store, taskDone, cwd);
		taskDone.status = "completed";
		const orphanDir = path.join(cwd, WORKTREE_BASE_DIR, "missing-task");
		fs.mkdirSync(orphanDir, { recursive: true });

		const map = new Map([
			[taskActive.id, taskActive],
			[taskDone.id, taskDone],
		]);
		const reaped = reapOrphanedWorktreesSync(cwd, map);
		expect(reaped).toEqual(
			expect.arrayContaining(["missing-task", taskDone.id]),
		);
		expect(reaped).not.toContain(taskActive.id);
		expect(fs.existsSync(activePickup.worktreeDir)).toBe(true);
		expect(fs.existsSync(donePickup.worktreeDir)).toBe(false);

		// The async orphan reaper agrees on the leftovers.
		const { reapOrphanedWorktrees } = await import("./work/taskWorkspace.js");
		expect(
			await reapOrphanedWorktrees(cwd, new Set([taskActive.id])),
		).toEqual([]);
		expect(removeTaskWorktreeSync(cwd, "never-existed")).toBe(false);
	});
});

describe.skipIf(!gitAvailable)("zero unique commits fast path", () => {
	let base;
	const repos = makeRepoTracker();

	beforeAll(() => {
		base = makeTmpBase("kainbain-wp5-ghost-");
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	});

	it("never merges a zero-change branch and never commits engine files as task work", async () => {
		const cwd = repos.track(initRepo(path.join(base, "ghost")));
		// Production topology: `<cwd>/docs` is a gitignored symlink to a
		// notes space OUTSIDE the repo, so the engine ledger (task.md,
		// stage reports) never enters the git tree. Mirror that here —
		// with in-repo docs the pre-merge auto-commit would manufacture a
		// commit from the ledger itself (observed red: unique count 1 and
		// a "commit task work before merge" commit on an empty branch).
		fs.writeFileSync(path.join(cwd, ".gitignore"), "/docs\n");
		runGit(cwd, "add", "-A");
		runGit(cwd, "commit", "-m", "ignore host-local docs link");
		const outsideDocs = path.join(base, "ghost-docs");
		fs.mkdirSync(outsideDocs, { recursive: true });
		fs.symlinkSync(outsideDocs, path.join(cwd, "docs"));
		const { store } = makeStore(cwd);
		const task = makeTask(store, cwd, "empty work");
		task.history.push({
			timestamp: new Date().toISOString(),
			action: "Agent stage completed: Plan",
		});
		task.currentStageId = "merge-1";
		// Work stages created the branch but produced no commits: the
		// empty branch points at the main tip, so the real unique-commit
		// count is zero (and — as in production — ancestry alone calls an
		// untouched branch "landed").
		runGit(cwd, "branch", task.branch);
		const mainSha = runGit(cwd, "rev-parse", "main").trim();

		const { executeMergeStage, buildGhostTaskDiagnostic } = await import(
			"./flow/commandStages.js"
		);
		const mergeStage = { id: "merge-1", name: "Merge", type: "merge" };
		const result = await executeMergeStage(store, {
			projectId: "p1",
			taskId: task.id,
			stage: mergeStage,
			stages: [
				{ id: "plan-1", name: "Plan", type: "agent" },
				mergeStage,
			],
			cwd,
			execRunner: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
		});

		// The fast path decides on real work only: the engine ledger the
		// stage itself wrote (docs/tasks/) must not be manufactured into a
		// task commit, and no merge of an empty branch is ever attempted.
		expect(await countUniqueCommits(cwd, "main", task.branch)).toBe(0);
		expect(runGit(cwd, "rev-parse", "main").trim()).toBe(mainSha);
		expect(runGit(cwd, "log", "--all", "--oneline")).not.toContain(
			"commit task work before merge",
		);
		expect(runGit(cwd, "status", "--porcelain").trim()).toBe("");
		// The landed re-entry skips the duplicate merge — never a
		// "Merged task branch" record.
		expect(result.status).toBe("passed");
		expect(
			task.history.some((h) => String(h.action).includes("already landed")),
		).toBe(true);
		expect(
			task.history.some((h) =>
				String(h.action).startsWith("Merged task branch"),
			),
		).toBe(false);

		// The ghost diagnostic names the same empty branch for Tier 3.
		const ghost = buildGhostTaskDiagnostic({
			branch: task.branch,
			mainBranch: "main",
			task,
		});
		expect(ghost.diagnostics).toMatchObject({
			kind: "ghost-task",
			branch: task.branch,
			mainBranch: "main",
			uniqueCommits: 0,
		});
		expect(ghost.message).toContain(task.branch);
		expect(typeof ghost.diagnostics.lastWorkStageOutcome).toBe("string");
	});
});
