/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// Real-git tests for snapshot-only merge healing: when a task-branch/main
// merge conflicts exclusively on engine-regenerated snapshots (task.md live
// state, review assets), the merge stage resolves them with the incoming
// task-branch version and finalizes. Genuine code conflicts must keep
// failing. Everything runs in throwaway temp dirs — never the KainBain repo.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { mergeBranch } = await import("./merge.js");
const { partitionMergeConflicts, resolveConflictsWithIncoming } =
	await import("./merge.js");
const { commitAllIfNeeded } = await import("./commit.js");
const { GitError } = await import("./errors.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-snapmerge-"));
	run(dir, "init", "-b", "main");
	run(dir, "config", "user.email", "kainbain-test@example.com");
	run(dir, "config", "user.name", "KainBain Test");
	fs.mkdirSync(path.join(dir, "docs", "tasks", "task-1", "assets"), { recursive: true });
	fs.writeFileSync(path.join(dir, "docs", "tasks", "task-1", "task.md"), "base snapshot\n");
	fs.writeFileSync(
		path.join(dir, "docs", "tasks", "task-1", "assets", "shot.png"),
		"base-png",
	);
	fs.writeFileSync(path.join(dir, "src-code.js"), "base code\n");
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "base");
	return dir;
}

/** Diverges main and kb/task-1 on the snapshot files only. */
function divergeSnapshotsOnly(dir) {
	run(dir, "checkout", "-b", "kb/task-1");
	fs.writeFileSync(
		path.join(dir, "docs", "tasks", "task-1", "task.md"),
		"branch snapshot\n",
	);
	fs.writeFileSync(
		path.join(dir, "docs", "tasks", "task-1", "assets", "shot.png"),
		"branch-png",
	);
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "branch snapshots");
	run(dir, "checkout", "main");
	fs.writeFileSync(path.join(dir, "docs", "tasks", "task-1", "task.md"), "main snapshot\n");
	fs.writeFileSync(
		path.join(dir, "docs", "tasks", "task-1", "assets", "shot.png"),
		"main-png",
	);
	run(dir, "add", "-A");
	run(dir, "commit", "-m", "main snapshots");
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

describe("snapshot-only merge healing (real git)", () => {
	let dir;
	beforeEach(() => {
		if (!gitAvailable) return;
		dir = initRepo();
		tempDirs.push(dir);
	});

	it("resolves snapshot conflicts with the incoming branch and finalizes", async () => {
		if (!gitAvailable) return;
		divergeSnapshotsOnly(dir);
		let conflict = null;
		try {
			await mergeBranch(dir, "kb/task-1", { abortOnConflict: false });
		} catch (e) {
			conflict = e;
		}
		expect(conflict).not.toBeNull();
		expect(conflict.conflictedFiles.sort()).toEqual(
			["docs/tasks/task-1/assets/shot.png", "docs/tasks/task-1/task.md"].sort(),
		);

		const { snapshots, blocking } = partitionMergeConflicts(conflict.conflictedFiles);
		expect(blocking).toEqual([]);
		expect(snapshots).toHaveLength(2);

		const resolved = await resolveConflictsWithIncoming(dir, snapshots);
		expect(resolved.sort()).toEqual(snapshots.sort());

		const commit = await commitAllIfNeeded(dir, "heal snapshots", {
			expectedBranch: "main",
		});
		expect(commit.committed).toBe(true);

		// The incoming (task-branch) versions won on both snapshot files.
		expect(
			fs.readFileSync(path.join(dir, "docs", "tasks", "task-1", "task.md"), "utf8"),
		).toBe("branch snapshot\n");
		expect(
			fs.readFileSync(
				path.join(dir, "docs", "tasks", "task-1", "assets", "shot.png"),
				"utf8",
			),
		).toBe("branch-png");
		// No merge left in progress.
		run(dir, "rev-parse", "--verify", "HEAD");
		expect(() => run(dir, "rev-parse", "--verify", "MERGE_HEAD")).toThrow();
	});

	it("refuses to resolve when a code file conflicts, then aborts cleanly", async () => {
		if (!gitAvailable) return;
		divergeSnapshotsOnly(dir);
		run(dir, "checkout", "kb/task-1");
		fs.writeFileSync(path.join(dir, "src-code.js"), "branch code\n");
		run(dir, "add", "-A");
		run(dir, "commit", "-m", "branch code");
		run(dir, "checkout", "main");
		fs.writeFileSync(path.join(dir, "src-code.js"), "main code\n");
		run(dir, "add", "-A");
		run(dir, "commit", "-m", "main code");

		let conflict = null;
		try {
			await mergeBranch(dir, "kb/task-1", { abortOnConflict: false });
		} catch (e) {
			conflict = e;
		}
		expect(conflict).not.toBeNull();
		const { blocking } = partitionMergeConflicts(conflict.conflictedFiles);
		expect(blocking).toContain("src-code.js");

		await expect(
			resolveConflictsWithIncoming(dir, conflict.conflictedFiles),
		).rejects.toBeInstanceOf(GitError);
	});
});
