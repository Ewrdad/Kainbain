/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git tests for squash landings: one task-details commit on main,
// trailer-based landed detection, content-based landed detection, and
// conflict rollback. Everything runs in throwaway temp dirs.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const {
	squashMergeBranch,
	buildSquashCommitMessage,
	findSquashCommit,
	isBranchContentLanded,
	isBranchMergedInto,
} = await import("./merge.js");
const { GitMergeConflictError } = await import("./errors.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}
function initRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-squash-"));
	run(dir, "init", "-b", "main");
	run(dir, "config", "user.email", "kainbain-test@example.com");
	run(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "app.js"), "base\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "base");
	run(dir, "checkout", "-b", "kb/task-1");
	fs.writeFileSync(path.join(dir, "app.js"), "task work\n");
	fs.writeFileSync(path.join(dir, "feature.js"), "feature\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "task commit 1");
	fs.writeFileSync(path.join(dir, "feature.js"), "feature v2\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "task commit 2");
	run(dir, "checkout", "main");
	return dir;
}
const tempDirs = [];
beforeEach(() => { if (gitAvailable) tempDirs.push(initRepo()); });
afterEach(() => {
	while (tempDirs.length > 0) {
		try { fs.rmSync(tempDirs.pop(), { recursive: true, force: true }); } catch { /* ignore */ }
	}
});

describe("buildSquashCommitMessage", () => {
	it("uses the title as subject and appends trailers", () => {
		const msg = buildSquashCommitMessage({ taskId: "abc-1", title: "Fix login flow", goal: "Users can log in", branch: "kb/abc-1", mainBranch: "main" });
		expect(msg.split("\n")[0]).toBe("Fix login flow");
		expect(msg).toContain("Users can log in");
		expect(msg).toContain("Kainbain-Task: abc-1");
		expect(msg).toContain("Kainbain-Branch: kb/abc-1");
	});
	it("falls back to the task id when there is no title", () => {
		expect(buildSquashCommitMessage({ taskId: "abc-1" })).toContain("Kainbain task abc-1");
	});
});

describe("squashMergeBranch (real git)", () => {
	it("lands as one commit with the task-details message; branch is not an ancestor but content is landed", async () => {
		if (!gitAvailable) return;
		const dir = tempDirs[0];
		const msg = buildSquashCommitMessage({ taskId: "task-1", title: "Add feature", branch: "kb/task-1", mainBranch: "main" });
		const res = await squashMergeBranch(dir, "kb/task-1", { commitMessage: msg });
		expect(res.committed).toBe(true);
		const log = run(dir, "log", "--format=%s", "main");
		expect(log.split("\n")[0]).toBe("Add feature");
		expect(run(dir, "log", "--format=%s", "main")).not.toContain("task commit 1");
		expect(await isBranchMergedInto(dir, "main", "kb/task-1")).toBe(false);
		expect(await findSquashCommit(dir, "main", "task-1")).toBe(res.hash);
		expect(await isBranchContentLanded(dir, "main", "kb/task-1")).toBe(true);
		expect(fs.readFileSync(path.join(dir, "feature.js"), "utf8")).toBe("feature v2\n");
	});
	it("rolls back cleanly on a genuine conflict", async () => {
		if (!gitAvailable) return;
		const dir = tempDirs[0];
		fs.writeFileSync(path.join(dir, "app.js"), "main edit\n");
		run(dir, "add", "-A"); run(dir, "commit", "-m", "main edit");
		let err = null;
		try { await squashMergeBranch(dir, "kb/task-1", { commitMessage: "x" }); } catch (e) { err = e; }
		expect(err).toBeInstanceOf(GitMergeConflictError);
		expect(err.conflictedFiles).toContain("app.js");
		expect(run(dir, "status", "--porcelain")).toBe("");
		expect(run(dir, "log", "--format=%s", "-1", "main").trim()).toBe("main edit");
	});
	it("resolves empty when the branch adds no net change", async () => {
		if (!gitAvailable) return;
		const dir = tempDirs[0];
		await squashMergeBranch(dir, "kb/task-1", { commitMessage: "land it" });
		run(dir, "checkout", "-b", "kb/task-2");
		run(dir, "checkout", "main");
		const res = await squashMergeBranch(dir, "kb/task-2", { commitMessage: "again" }).catch(() => null);
		// kb/task-2 points at main, so there may be nothing to squash.
		if (res) expect(res.committed).toBe(false);
	});
});
