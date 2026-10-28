/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git tests for the source-of-truth sync: fetch + hard-reset of the
// local default branch to the remote tracking ref. Everything happens inside
// throwaway temp directories with a local bare remote — never the KainBain
// repo itself. Skipped when git is unavailable.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { syncDefaultBranchToRemote } = await import("./remote.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initBare(dir) {
	fs.mkdirSync(dir, { recursive: true });
	run(dir, "init", "--bare", "-b", "main");
}

function seedRemote(remoteDir, file, content) {
	const seed = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sync-seed-"));
	run(seed, "clone", remoteDir, ".");
	run(seed, "config", "user.email", "kainbain-test@example.com");
	run(seed, "config", "user.name", "KainBain Test");
	// A fresh bare remote has no HEAD yet: the first seed publishes it.
	try {
		run(seed, "checkout", "-B", "main", "origin/main");
	} catch {
		run(seed, "checkout", "-B", "main");
	}
	fs.writeFileSync(path.join(seed, file), content);
	run(seed, "add", "-A");
	run(seed, "commit", "-m", `seed ${file}`);
	run(seed, "push", "-u", "origin", "main");
	return seed;
}

function cloneRemote(remoteDir) {
	const work = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sync-work-"));
	run(work, "clone", remoteDir, ".");
	run(work, "config", "user.email", "kainbain-test@example.com");
	run(work, "config", "user.name", "KainBain Test");
	return work;
}

const tempDirs = [];
function track(dir) {
	tempDirs.push(dir);
	return dir;
}

beforeEach(() => {
	if (!gitAvailable) return;
	const remoteDir = track(fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sync-remote-")));
	initBare(remoteDir);
	track(seedRemote(remoteDir, "truth.txt", "remote truth v1\n"));
});

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

function remoteDirOf() {
	return tempDirs[0];
}

describe("syncDefaultBranchToRemote", () => {
	it("reports already-in-sync for a fresh clone", async () => {
		if (!gitAvailable) return;
		const work = track(cloneRemote(remoteDirOf()));
		const res = await syncDefaultBranchToRemote(work);
		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("already-in-sync");
		expect(res.mainBranch).toBe("main");
		expect(res.before).toBe(res.after);
	});

	it("hard-resets a behind main to the remote tip", async () => {
		if (!gitAvailable) return;
		const work = track(cloneRemote(remoteDirOf()));
		track(seedRemote(remoteDirOf(), "truth.txt", "remote truth v2\n"));
		const before = run(work, "rev-parse", "main").trim();
		const res = await syncDefaultBranchToRemote(work);
		expect(res.synced).toBe(true);
		expect(res.mainBranch).toBe("main");
		expect(res.before).toBe(before);
		expect(res.after).not.toBe(before);
		expect(run(work, "rev-parse", "main").trim()).toBe(res.after);
		expect(fs.readFileSync(path.join(work, "truth.txt"), "utf8")).toBe(
			"remote truth v2\n",
		);
	});

	it("discards tracked modifications on main and reports them", async () => {
		if (!gitAvailable) return;
		const work = track(cloneRemote(remoteDirOf()));
		fs.writeFileSync(path.join(work, "truth.txt"), "local operator edit\n");
		const res = await syncDefaultBranchToRemote(work);
		expect(res.synced).toBe(true);
		expect(res.discardedPaths).toBe(1);
		expect(res.detail).toMatch(/discarded 1 tracked path/);
		expect(run(work, "status", "--porcelain", "-uall").trim()).toBe("");
		expect(fs.readFileSync(path.join(work, "truth.txt"), "utf8")).toBe(
			"remote truth v1\n",
		);
	});

	it("orphans local-only commits and reports the ahead count", async () => {
		if (!gitAvailable) return;
		const work = track(cloneRemote(remoteDirOf()));
		fs.writeFileSync(path.join(work, "local-only.txt"), "never pushed\n");
		run(work, "add", "-A");
		run(work, "commit", "-m", "local-only commit");
		const res = await syncDefaultBranchToRemote(work);
		expect(res.synced).toBe(true);
		expect(res.ahead).toBe(1);
		expect(run(work, "rev-parse", "main").trim()).toBe(res.after);
		expect(fs.existsSync(path.join(work, "local-only.txt"))).toBe(false);
	});

	it("moves the main ref while checked out on a task branch", async () => {
		if (!gitAvailable) return;
		const work = track(cloneRemote(remoteDirOf()));
		track(seedRemote(remoteDirOf(), "truth.txt", "remote truth v2\n"));
		run(work, "checkout", "-b", "kb/task-1");
		fs.writeFileSync(path.join(work, "task-work.txt"), "task work\n");
		const res = await syncDefaultBranchToRemote(work);
		expect(res.synced).toBe(true);
		expect(run(work, "rev-parse", "main").trim()).toBe(res.after);
		expect(run(work, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("kb/task-1");
		expect(fs.readFileSync(path.join(work, "task-work.txt"), "utf8")).toBe(
			"task work\n",
		);
	});

	it("skips pure-local repositories without a remote", async () => {
		if (!gitAvailable) return;
		const local = track(fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sync-local-")));
		run(local, "init", "-b", "main");
		run(local, "config", "user.email", "kainbain-test@example.com");
		run(local, "config", "user.name", "KainBain Test");
		fs.writeFileSync(path.join(local, "file.txt"), "local\n");
		run(local, "add", "-A");
		run(local, "commit", "-m", "init");
		const res = await syncDefaultBranchToRemote(local);
		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("no-remote");
	});

	it("never throws when the fetch fails", async () => {
		if (!gitAvailable) return;
		const work = track(cloneRemote(remoteDirOf()));
		run(work, "remote", "set-url", "origin", "/nonexistent/kainbain-sync-remote.git");
		const res = await syncDefaultBranchToRemote(work);
		expect(res.synced).toBe(false);
		expect(res.skipped).toBe("fetch-failed");
	});
});
