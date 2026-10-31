/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

const { checkoutBranch, _moveAsideBlockingLiveSnapshots } = await import("./branch.js");
const { commitEngineSnapshots } = await import("./commit.js");
const { GitDirtyTreeError } = await import("./errors.js");

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
