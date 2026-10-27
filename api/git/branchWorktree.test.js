import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ensureBranchCheckedOut,
	findBranchWorktreeHolder,
	isWorktreeLockError,
	reconcileBranchWorktreeLock,
} from "./branch.js";
import { GitError } from "./errors.js";

/***
 * MARK: branch worktree-lock recovery tests
 * @description Real-git coverage for the branch-held-by-linked-worktree
 *   recovery: a stale worktree (orphaned e.g. by an isolation mode change)
 *   blocking `git checkout` is removed when provably safe — clean tree, no
 *   ignored files, nothing unpushed — and refused with an actionable error
 *   otherwise. Uses throwaway repos under the OS temp dir; no mocks.
 ***/

function git(dir, args) {
	return execFileSync("git", args, { cwd: dir, stdio: "pipe" }).toString();
}

function initRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wt-main-"));
	git(dir, ["init", "-q", "-b", "main"]);
	git(dir, ["config", "user.email", "t@t.t"]);
	git(dir, ["config", "user.name", "t"]);
	fs.writeFileSync(path.join(dir, "f.txt"), "x\n");
	git(dir, ["add", "."]);
	git(dir, ["commit", "-qm", "init"]);
	return dir;
}

describe("isWorktreeLockError", () => {
	it("matches only the already-used-by-worktree shape", () => {
		expect(
			isWorktreeLockError(
				new Error("fatal: 'kb/t1' is already used by worktree at '/w'"),
			),
		).toBe(true);
		expect(isWorktreeLockError(new Error("some other failure"))).toBe(false);
		expect(isWorktreeLockError(null)).toBe(false);
	});
});

describe("findBranchWorktreeHolder", () => {
	let repo;
	beforeEach(() => {
		repo = initRepo();
	});
	afterEach(() => {
		fs.rmSync(repo, { recursive: true, force: true });
	});

	it("returns null when no worktree holds the branch", async () => {
		await expect(findBranchWorktreeHolder(repo, "kb/t1")).resolves.toBeNull();
	});

	it("finds the holder among several worktrees", async () => {
		git(repo, ["branch", "kb/t1"]);
		git(repo, ["branch", "kb/other"]);
		const wt1 = path.join(path.dirname(repo), `kb-wt-hold-${process.pid}-1`);
		const wt2 = path.join(path.dirname(repo), `kb-wt-hold-${process.pid}-2`);
		try {
			git(repo, ["worktree", "add", wt1, "kb/t1"]);
			git(repo, ["worktree", "add", wt2, "kb/other"]);
			const holder = await findBranchWorktreeHolder(repo, "kb/t1");
			expect(holder?.path).toBe(wt1);
			expect(holder?.branch).toBe("refs/heads/kb/t1");
		} finally {
			fs.rmSync(wt1, { recursive: true, force: true });
			fs.rmSync(wt2, { recursive: true, force: true });
		}
	});
});

describe("reconcileBranchWorktreeLock + ensureBranchCheckedOut", () => {
	let repo;
	let origin;
	beforeEach(() => {
		repo = initRepo();
		origin = fs.mkdtempSync(path.join(os.tmpdir(), "kb-wt-origin-"));
		git(origin, ["init", "-q", "--bare"]);
		git(repo, ["remote", "add", "origin", origin]);
		git(repo, ["push", "-q", "origin", "HEAD:main"]);
	});
	afterEach(() => {
		fs.rmSync(repo, { recursive: true, force: true });
		fs.rmSync(origin, { recursive: true, force: true });
	});

	let holderSeq = 0;
	const holders = [];
	function holderFor(branch) {
		holderSeq += 1;
		const wt = path.join(
			path.dirname(repo),
			`kb-wt-${process.pid}-${holderSeq}-${branch.replaceAll("/", "-")}`,
		);
		git(repo, ["worktree", "add", wt, branch]);
		holders.push(wt);
		return wt;
	}
	afterEach(() => {
		for (const wt of holders.splice(0)) {
			fs.rmSync(wt, { recursive: true, force: true });
		}
	});

	it("removes a clean, synced holder and checks out the branch", async () => {
		git(repo, ["checkout", "-qb", "kb/t1"]);
		git(repo, ["push", "-q", "-u", "origin", "kb/t1"]);
		git(repo, ["checkout", "-q", "main"]);
		const wt = holderFor("kb/t1");

		const outcome = await ensureBranchCheckedOut(repo, "kb/t1");
		expect(outcome.checkedOut).toBe(true);
		expect(outcome.worktreeRecoveredFrom).toBe(wt);
		expect(fs.existsSync(wt)).toBe(false);
		expect(git(repo, ["branch", "--show-current"]).trim()).toBe("kb/t1");
	});

	it("prunes stale metadata when the holder directory is gone", async () => {
		git(repo, ["checkout", "-qb", "kb/t1"]);
		git(repo, ["push", "-q", "-u", "origin", "kb/t1"]);
		git(repo, ["checkout", "-q", "main"]);
		const wt = holderFor("kb/t1");
		fs.rmSync(wt, { recursive: true, force: true });

		const recovery = await reconcileBranchWorktreeLock(repo, "kb/t1");
		expect(recovery.recovered).toBe(true);
		expect(recovery.prunedStale).toBe(true);
		const outcome = await ensureBranchCheckedOut(repo, "kb/t1");
		expect(outcome.checkedOut).toBe(true);
	});

	it("refuses a holder with uncommitted work and keeps it intact", async () => {
		git(repo, ["checkout", "-qb", "kb/t1"]);
		git(repo, ["push", "-q", "-u", "origin", "kb/t1"]);
		git(repo, ["checkout", "-q", "main"]);
		const wt = holderFor("kb/t1");
		fs.writeFileSync(path.join(wt, "wip.txt"), "uncommitted\n");

		await expect(ensureBranchCheckedOut(repo, "kb/t1")).rejects.toBeInstanceOf(
			GitError,
		);
		await expect(ensureBranchCheckedOut(repo, "kb/t1")).rejects.toThrow(
			/uncommitted path/,
		);
		expect(fs.existsSync(wt)).toBe(true);
	});

	it("refuses a holder with ignored files the checkout would delete", async () => {
		git(repo, ["checkout", "-qb", "kb/t1"]);
		fs.writeFileSync(path.join(repo, ".gitignore"), "build.out\n");
		git(repo, ["add", ".gitignore"]);
		git(repo, ["commit", "-qm", "ignore build output"]);
		git(repo, ["push", "-q", "-u", "origin", "kb/t1"]);
		git(repo, ["checkout", "-q", "main"]);
		const wt = holderFor("kb/t1");
		fs.writeFileSync(path.join(wt, "build.out"), "artifact\n");

		await expect(ensureBranchCheckedOut(repo, "kb/t1")).rejects.toThrow(
			/ignored file/,
		);
		expect(fs.existsSync(path.join(wt, "build.out"))).toBe(true);
	});

	it("refuses a holder whose branch is ahead of upstream", async () => {
		git(repo, ["checkout", "-qb", "kb/t1"]);
		git(repo, ["push", "-q", "-u", "origin", "kb/t1"]);
		git(repo, ["checkout", "-q", "main"]);
		const wt = holderFor("kb/t1");
		fs.writeFileSync(path.join(wt, "ahead.txt"), "unpushed\n");
		git(wt, ["add", "."]);
		git(wt, ["commit", "-qm", "unpushed work"]);

		await expect(ensureBranchCheckedOut(repo, "kb/t1")).rejects.toThrow(
			/unpushed commit/,
		);
		expect(fs.existsSync(wt)).toBe(true);
	});
});
