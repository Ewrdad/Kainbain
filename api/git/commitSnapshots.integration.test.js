/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git regression test (2026-11-03: a merge dropped 10 tasks): the
// finalize/merge auto-commit (`git add -A`) must never record a live task
// snapshot (`docs/tasks/<id>/task.md`) — neither its worktree deletion nor
// its modification. Recorded snapshot deletions propagate through the next
// merge onto main and the tasks vanish from the board. Throwaway temp
// dirs — never the KainBain repo.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { commitAllIfNeeded } = await import("./commit.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-commit-snap-"));
	run(dir, "init", "-b", "main");
	run(dir, "config", "user.email", "kainbain-test@example.com");
	run(dir, "config", "user.name", "KainBain Test");
	fs.mkdirSync(path.join(dir, "docs", "tasks", "t"), { recursive: true });
	fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "base snapshot\n");
	fs.writeFileSync(path.join(dir, "real.js"), "base code\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "base");
	return dir;
}

function committedFiles(cwd) {
	return run(cwd, "show", "--name-only", "--format=", "HEAD")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
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

describe("commitAllIfNeeded live snapshots (real git)", () => {
	let dir;
	beforeEach(() => {
		if (!gitAvailable) return;
		dir = initRepo();
		tempDirs.push(dir);
	});

	it("commits real work but never a snapshot deletion", async () => {
		if (!gitAvailable) return;
		fs.rmSync(path.join(dir, "docs", "tasks", "t", "task.md"));
		fs.writeFileSync(path.join(dir, "real.js"), "changed code\n");

		const res = await commitAllIfNeeded(dir, "stage work");

		expect(res.committed).toBe(true);
		const files = committedFiles(dir);
		expect(files).toContain("real.js");
		expect(files).not.toContain(path.join("docs", "tasks", "t", "task.md"));
		// The worktree deletion is left alone (the engine regenerates live
		// snapshots); what matters is it was never RECORDED.
		expect(fs.existsSync(path.join(dir, "docs", "tasks", "t", "task.md"))).toBe(false);
	});

	it("is a no-op when only snapshots are dirty", async () => {
		if (!gitAvailable) return;
		fs.writeFileSync(path.join(dir, "docs", "tasks", "t", "task.md"), "new snapshot\n");

		const res = await commitAllIfNeeded(dir, "stage work");

		expect(res.committed).toBe(false);
		expect(run(dir, "rev-list", "--count", "HEAD").trim()).toBe("1");
	});
});
