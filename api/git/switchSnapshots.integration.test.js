/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git tests for commit-then-switch: the engine's own snapshot dirt
// (docs/tasks live state) must never trip a branch switch, while real dirt
// still refuses loudly. Throwaway temp dirs — never the KainBain repo.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const {
	checkoutBranch,
	ensureBranchCheckedOut,
	withCheckedOutBranch,
	returnToDefaultBranch,
	_moveAsideBlockingLiveSnapshots,
	_restoreMovedAsideSnapshots,
	_moveFileSafely,
} = await import("./branch.js");
const { commitEngineSnapshots } = await import("./commit.js");
const { GitDirtyTreeError, GitError } = await import("./errors.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-switch-"));
	run(dir, "init", "-b", "main");
	run(dir, "config", "user.email", "kainbain-test@example.com");
	run(dir, "config", "user.name", "KainBain Test");
	fs.mkdirSync(path.join(dir, "docs", "tasks", "t"), { recursive: true });
	fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "base snapshot\n");
	fs.writeFileSync(path.join(dir, "real.js"), "base code\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "base");
	run(dir, "checkout", "-b", "kb/t");
	return dir;
}

const tempDirs = [];

afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

describe("commit-then-switch (real git)", () => {
	let dir;
	beforeEach(() => {
		if (!gitAvailable) return;
		dir = initRepo();
		tempDirs.push(dir);
	});

	it("auto-commits snapshot dirt and switches", async () => {
		if (!gitAvailable) return;
		// Step 5: the live task.md snapshot is untracked (worktree content
		// preserved), while the report IS committed on the task branch.
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "new snapshot\n");
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "report.md"), "report\n");

		const res = await checkoutBranch(dir, "main");

		expect(res).toEqual({ switched: true });
		expect(run(dir, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
		expect(run(dir, "log", "-1", "--format=%s", "kb/t")).toContain("snapshots");
		expect(run(dir, "show", "kb/t:docs/tasks/t/report.md").trim()).toBe("report");
		expect(() => run(dir, "show", "kb/t:docs/tasks/t/task.md")).toThrow();
		expect(fs.readFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "utf8")).toBe("new snapshot\n");
	});

	it("moves aside every engine-owned untracked file the target tracks (not just task.md), leaving real files alone", async () => {
		if (!gitAvailable) return;
		// main tracks an engine-owned report AND a real source file; kb/t
		// holds both as untracked live copies (the shape that blocked the
		// pre-deploy sync's return to main on 2026-10-30 when the
		// commit-then-switch backstop failed on a concurrent HEAD move).
		run(dir, "checkout", "main");
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "report.md"), "main report\n");
		fs.writeFileSync(path.join(dir, "real2.js"), "main real\n");
		run(dir, "add", "-A");
		run(dir, "commit", "-m", "main report + real2");
		run(dir, "checkout", "kb/t");
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "report.md"), "live report\n");
		fs.writeFileSync(path.join(dir, "real2.js"), "live real\n");

		const aside = await _moveAsideBlockingLiveSnapshots(dir, "main");

		// The engine-owned report moved aside; the real file did not.
		expect(aside).not.toBeNull();
		expect(aside.moved.map((m) => m.rel)).toEqual(["docs/tasks/t/report.md"]);
		expect(fs.existsSync(path.join(dir, "docs", "tasks", "t", "report.md"))).toBe(false);
		expect(fs.readFileSync(path.join(dir, "real2.js"), "utf8")).toBe("live real\n");
		// The backup holds the live content for restore after checkout.
		expect(fs.readFileSync(aside.moved[0].backup, "utf8")).toBe("live report\n");
		// Cleanup.
		fs.rmSync(aside.backupDir, { recursive: true, force: true });
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "report.md"), "live report\n");
	});

	it("still refuses real dirt without committing anything", async () => {
		if (!gitAvailable) return;
		// Diverge the file first: identical content on both sides would let
		// git carry the modification across, which is not a refusal case.
		fs.writeFileSync(path.join(dir, "real.js"), "branch code\n");
		run(dir, "add", "-A");
		run(dir, "commit", "-m", "branch change");
		fs.writeFileSync(path.join(dir, "real.js"), "operator edit\n");
		const before = run(dir, "rev-list", "--count", "HEAD").trim();

		await expect(
			checkoutBranch(dir, "main", { recovery: "off" }),
		).rejects.toBeInstanceOf(GitDirtyTreeError);
		expect(run(dir, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("kb/t");
		expect(run(dir, "rev-list", "--count", "HEAD").trim()).toBe(before);
	});

	it("commitEngineSnapshots untracks task.md but still stages reports", async () => {
		if (!gitAvailable) return;
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "new snapshot\n");
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "report.md"), "report\n");
		fs.writeFileSync(path.join(dir, "real.js"), "operator edit\n");

		const res = await commitEngineSnapshots(dir, "snapshots");

		// Step 5: the report commits, the live snapshot leaves the tree
		// (its worktree content is preserved verbatim).
		expect(res.committed).toBe(true);
		expect(run(dir, "show", "HEAD:docs/tasks/t/report.md").trim()).toBe("report");
		expect(() => run(dir, "show", "HEAD:docs/tasks/t/task.md")).toThrow();
		expect(fs.readFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "utf8")).toBe("new snapshot\n");
		// The real edit is still uncommitted working-tree dirt.
		expect(run(dir, "status", "--porcelain")).toContain("real.js");
	});
});

// Regression for the branch-switch bug that stranded tasks 82e49a05
// (runner auto-update, Update stage) and 9d2b75a2 (runner/model autodetect,
// In Progress + catchup) on 2026-11-11: the primary checkout sits on a
// kb/* branch holding ANOTHER task's engine snapshot
// (docs/tasks/<other-id>/task.md) as an UNTRACKED file while main TRACKS
// it, so a raw `git checkout main` is refused by git's own
// untracked-overwrite safety. Every public branch-switch entry point must
// survive this conflicting state. Throwaway temp dirs — never the KainBain
// repo.
const OTHER_TASK = "d1e56caa-743e-49ee-9bc9-d8a7062a92bd";
const OTHER_SNAPSHOT = path.join("docs", "tasks", OTHER_TASK, "task.md");

/**
 * Builds the EXACT conflicting state: main tracks
 * docs/tasks/<other>/task.md (a merged task's snapshot), the working tree
 * is on kb/t, and the same path exists there as an untracked live copy.
 */
function initConflictingRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-conflict-"));
	run(dir, "init", "-b", "main");
	run(dir, "config", "user.email", "kainbain-test@example.com");
	run(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "real.js"), "base code\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "base");
	run(dir, "checkout", "-b", "kb/t");
	// A second task merges: main now tracks its live snapshot.
	run(dir, "checkout", "main");
	fs.mkdirSync(path.join(dir, "docs", "tasks", OTHER_TASK), { recursive: true });
	fs.writeFileSync(path.join(dir, OTHER_SNAPSHOT), "main snapshot\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "merge task d1e56caa");
	// Back on the task branch the engine wrote the same path as an
	// untracked live file — the conflicting state.
	run(dir, "checkout", "kb/t");
	fs.mkdirSync(path.join(dir, "docs", "tasks", OTHER_TASK), { recursive: true });
	fs.writeFileSync(path.join(dir, OTHER_SNAPSHOT), "live snapshot\n");
	return dir;
}

function headBranch(cwd) {
	return run(cwd, "rev-parse", "--abbrev-ref", "HEAD").trim();
}

describe("branch switches in the conflicting state (real git)", () => {
	let dir;
	beforeEach(() => {
		if (!gitAvailable) return;
		dir = initConflictingRepo();
		tempDirs.push(dir);
	});

	it("reproduces the original failure: raw git checkout main is refused", () => {
		if (!gitAvailable) return;
		expect(headBranch(dir)).toBe("kb/t");
		let failure = null;
		try {
			run(dir, "checkout", "main");
		} catch (e) {
			failure = e;
		}
		expect(failure).not.toBeNull();
		expect(String(failure.stderr || failure.message)).toMatch(
			/untracked working tree files would be overwritten/i,
		);
		expect(headBranch(dir)).toBe("kb/t");
	});

	it("checkoutBranch switches to main and restores the live snapshot", async () => {
		if (!gitAvailable) return;
		const res = await checkoutBranch(dir, "main");
		expect(res).toEqual({ switched: true });
		expect(headBranch(dir)).toBe("main");
		// The live (newer) content wins over main's stale tracked copy.
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("ensureBranchCheckedOut switches an existing branch to main (the shape that failed 82e49a05/9d2b75a2)", async () => {
		if (!gitAvailable) return;
		const res = await ensureBranchCheckedOut(dir, "main");
		expect(res).toMatchObject({ created: false, checkedOut: true, switched: true });
		expect(headBranch(dir)).toBe("main");
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("ensureBranchCheckedOut creates a missing branch pinned to main through the protected path", async () => {
		if (!gitAvailable) return;
		const res = await ensureBranchCheckedOut(dir, "kb/new", { baseBranch: "main" });
		expect(res).toMatchObject({ created: true, checkedOut: true, switched: true });
		expect(headBranch(dir)).toBe("kb/new");
		// Pinned to main, not to the current HEAD.
		expect(run(dir, "rev-parse", "kb/new").trim()).toBe(run(dir, "rev-parse", "main").trim());
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("withCheckedOutBranch runs fn on main (Update-stage shape) despite the conflict", async () => {
		if (!gitAvailable) return;
		let seenBranch = null;
		const result = await withCheckedOutBranch(dir, "main", async () => {
			seenBranch = headBranch(dir);
			return "update-done";
		});
		expect(result).toBe("update-done");
		expect(seenBranch).toBe("main");
		expect(headBranch(dir)).toBe("main");
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("withCheckedOutBranch on a CI branch restores the default branch afterwards", async () => {
		if (!gitAvailable) return;
		run(dir, "branch", "kb/ci", "main");
		let seenBranch = null;
		await withCheckedOutBranch(dir, "kb/ci", async () => {
			seenBranch = headBranch(dir);
		});
		expect(seenBranch).toBe("kb/ci");
		// Restore hopped back to the default branch through the same
		// protected path.
		expect(headBranch(dir)).toBe("main");
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("returnToDefaultBranch lands on main from the conflicting kb/t (catchup/finalize shape)", async () => {
		if (!gitAvailable) return;
		const res = await returnToDefaultBranch(dir, { recovery: "off" });
		expect(res).toEqual({ switched: true, branch: "main" });
		expect(headBranch(dir)).toBe("main");
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("a REAL untracked file tracked by main still blocks the switch loudly", async () => {
		if (!gitAvailable) return;
		// main also tracks a real source file; kb/t holds both it and the
		// engine snapshot as untracked live copies.
		await checkoutBranch(dir, "main");
		fs.writeFileSync(path.join(dir, "real2.js"), "main real\n");
		run(dir, "add", "-A");
		run(dir, "commit", "-m", "main real2");
		await checkoutBranch(dir, "kb/t");
		fs.mkdirSync(path.join(dir, "docs", "tasks", OTHER_TASK), { recursive: true });
		fs.writeFileSync(path.join(dir, OTHER_SNAPSHOT), "live snapshot\n");
		fs.writeFileSync(path.join(dir, "real2.js"), "live real\n");

		// The move-aside only ever touches ENGINE-OWNED paths, so the real
		// untracked file still refuses the switch at the clean-tree guard.
		await expect(checkoutBranch(dir, "main", { recovery: "off" })).rejects.toBeInstanceOf(
			GitDirtyTreeError,
		);
		await expect(ensureBranchCheckedOut(dir, "main")).rejects.toBeInstanceOf(GitDirtyTreeError);
		// Nothing was switched or committed.
		expect(headBranch(dir)).toBe("kb/t");
		expect(fs.readFileSync(path.join(dir, "real2.js"), "utf8")).toBe("live real\n");
	});

	it("migration: after one round trip through main, main no longer tracks the snapshot and even a raw checkout succeeds", async () => {
		if (!gitAvailable) return;
		// Land on main (move-aside), which leaves the live copy as tracked
		// dirt on main; the next pre-switch commit untracks it there.
		await checkoutBranch(dir, "main");
		await checkoutBranch(dir, "kb/t");
		// main's tree no longer carries the snapshot.
		expect(run(dir, "ls-tree", "main", "--", OTHER_SNAPSHOT).trim()).toBe("");
		// A raw checkout (no move-aside) can no longer be blocked by it.
		run(dir, "checkout", "main");
		expect(headBranch(dir)).toBe("main");
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");
	});

	it("a symlinked live snapshot is moved aside and restored too (lstat, not stat)", async () => {
		if (!gitAvailable) return;
		// A symlink at the conflicting path would still block git's
		// checkout safety; statSync would follow (or skip a broken) link,
		// lstat moves the link itself.
		// The link target lives OUTSIDE the repo: inside docs/tasks/ the
		// snapshot backstop would commit it onto kb/t and the checkout to
		// main would remove it, dangling the restored link.
		const real = path.join(os.tmpdir(), `kainbain-link-target-${process.pid}-${Date.now()}.txt`);
		fs.writeFileSync(real, "live via link\n");
		fs.rmSync(path.join(dir, OTHER_SNAPSHOT));
		fs.symlinkSync(real, path.join(dir, OTHER_SNAPSHOT));

		const res = await checkoutBranch(dir, "main");

		expect(res).toEqual({ switched: true });
		expect(headBranch(dir)).toBe("main");
		expect(fs.lstatSync(path.join(dir, OTHER_SNAPSHOT)).isSymbolicLink()).toBe(true);
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live via link\n");
	});

	it("a FAILED switch (branch held by a linked worktree) still restores the live snapshot", async () => {
		if (!gitAvailable) return;
		const holder = path.join(
			os.tmpdir(),
			`kainbain-holder-${process.pid}-${Date.now()}`,
		);
		run(dir, "worktree", "add", holder, "main");
		tempDirs.push(holder);

		// The checkout is refused (worktree lock) and recovery refuses too
		// (no upstream to prove nothing unpushed is orphaned): the switch
		// must fail loudly AND the moved-aside live file must be back.
		await expect(ensureBranchCheckedOut(dir, "main")).rejects.toBeInstanceOf(GitError);
		expect(headBranch(dir)).toBe("kb/t");
		expect(fs.readFileSync(path.join(dir, OTHER_SNAPSHOT), "utf8")).toBe("live snapshot\n");

		run(dir, "worktree", "remove", holder);
	});
});

// Fail-safe unit-level checks for the move-aside plumbing itself: the
// backup/restore must survive cross-filesystem temp dirs (EXDEV) and must
// never delete the live file when a move-back fails.
describe("move-aside/restore fail-safe (real fs)", () => {
	let dir;
	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-aside-"));
		tempDirs.push(dir);
	});

	it("_moveFileSafely falls back to copy when rename fails across filesystems (EXDEV)", () => {
		const src = path.join(dir, "src.txt");
		const dest = path.join(dir, "dest.txt");
		fs.writeFileSync(src, "live content\n");
		fs.writeFileSync(dest, "old tracked copy\n");
		const renameSpy = vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
			const err = new Error("cross-device link not permitted");
			err.code = "EXDEV";
			throw err;
		});
		try {
			_moveFileSafely(src, dest);
		} finally {
			renameSpy.mockRestore();
		}
		// The destination holds the moved content and the source is gone;
		// no staging leftovers remain.
		expect(fs.readFileSync(dest, "utf8")).toBe("live content\n");
		expect(fs.existsSync(src)).toBe(false);
		expect(fs.readdirSync(dir).sort()).toEqual(["dest.txt"]);
	});

	it("_moveFileSafely leaves both files untouched when the move is impossible", () => {
		const src = path.join(dir, "src.txt");
		fs.writeFileSync(src, "live content\n");
		// Dest parent is a FILE: both rename and copy-then-rename must fail.
		const dest = path.join(dir, "blocker", "dest.txt");
		fs.writeFileSync(path.join(dir, "blocker"), "not a dir\n");
		expect(() => _moveFileSafely(src, dest)).toThrow();
		// The source survives — a failed move-aside must never lose content.
		expect(fs.readFileSync(src, "utf8")).toBe("live content\n");
	});

	it("_restoreMovedAsideSnapshots never deletes the target when the backup is gone", async () => {
		const target = path.join(dir, "docs", "tasks", "t", "task.md");
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, "checked-out copy\n");
		const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-restore-"));
		tempDirs.push(backupDir);

		await _restoreMovedAsideSnapshots({
			cwd: dir,
			backupDir,
			moved: [{ rel: "docs/tasks/t/task.md", backup: path.join(backupDir, "missing.snapshot") }],
		});

		// The target keeps its content — restore is never destructive.
		expect(fs.readFileSync(target, "utf8")).toBe("checked-out copy\n");
	});

	it("_restoreMovedAsideSnapshots overwrites the stale tracked copy with the live backup", async () => {
		const target = path.join(dir, "docs", "tasks", "t", "task.md");
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(target, "stale main copy\n");
		const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-restore-"));
		tempDirs.push(backupDir);
		const backup = path.join(backupDir, "0.snapshot");
		fs.writeFileSync(backup, "live content\n");

		await _restoreMovedAsideSnapshots({
			cwd: dir,
			backupDir,
			moved: [{ rel: "docs/tasks/t/task.md", backup }],
		});

		expect(fs.readFileSync(target, "utf8")).toBe("live content\n");
		expect(fs.existsSync(backupDir)).toBe(false);
	});
});
