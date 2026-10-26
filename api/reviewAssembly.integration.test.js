/***
 * MARK: reviewAssembly preservation integration tests
 * @description Proves the preserve-after-merge mechanism end-to-end against
 *   real temp git repositories: merging a task branch empties the live
 *   `main...kb/<id>` diff, while a frozen baseline keeps the review payload
 *   populated when the project opted in (and only then). Covers the
 *   fail-back → fix → re-merge reset story, the cumulative opt-out, the
 *   shallow/GC fallback, the deleted-branch case, and the byte-identical
 *   default payload.
 ***/
/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildTaskReview, resolveReviewBase } from "./reviewAssembly.js";

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

function rev(cwd, ref) {
	return git(cwd, "rev-parse", ref).trim();
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

function initRepo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-review-preserve-"));
	tempDirs.push(dir);
	git(dir, "init", "-b", "main");
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "app.txt"), "line 1\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
	return dir;
}

function commitFile(dir, branch, filename, content, message) {
	git(dir, "checkout", branch);
	fs.writeFileSync(path.join(dir, filename), content);
	git(dir, "add", "-A");
	git(dir, "commit", "-m", message);
	return rev(dir, branch);
}

function makeDeps(project, task) {
	return {
		projectStore: { getProject: () => project },
		taskStore: {
			getTask: () => task,
			updateTask: (pid, tid, updates) => Object.assign(task, updates),
			_recordHistory: (t, action) =>
				t.history.push({ timestamp: new Date().toISOString(), action }),
		},
		eventBridge: null,
	};
}

function makeTask(branch) {
	return {
		id: "task-1",
		projectId: "proj-1",
		branch,
		title: "Preserve test",
		status: "waiting_human",
		history: [],
	};
}

describe("reviewAssembly preserved diff after merge", () => {
	let dir;
	let project;
	let task;

	beforeEach(() => {
		dir = initRepo();
		git(dir, "checkout", "-b", "kb/task-1");
		project = { id: "proj-1", useBranches: true };
		task = makeTask("kb/task-1");
	});

	it("shows an empty live diff after merge when preservation is off", async () => {
		commitFile(dir, "kb/task-1", "feature.txt", "new stuff\n", "add feature");
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "kb/task-1", "-m", "merge feature");

		const review = await buildTaskReview(
			makeDeps(project, task),
			dir,
			"proj-1",
			"task-1",
		);
		expect(review.branchSupported).toBe(true);
		expect(review.files).toHaveLength(0);
		expect(review).not.toHaveProperty("preserved");
		expect(review).not.toHaveProperty("newSinceMerge");
	});

	it("keeps the merged change visible when preservation is on", async () => {
		const preMergeMain = rev(dir, "main");
		const headSha = commitFile(
			dir,
			"kb/task-1",
			"feature.txt",
			"new stuff\n",
			"add feature",
		);
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "kb/task-1", "-m", "merge feature");

		project.preserveReviewDiffAfterMerge = true;
		task.reviewBaseline = {
			baseSha: preMergeMain,
			headSha,
			mainSha: preMergeMain,
			mergedAt: new Date().toISOString(),
			stageId: "merge-1",
		};

		const review = await buildTaskReview(
			makeDeps(project, task),
			dir,
			"proj-1",
			"task-1",
		);
		expect(review.preserved).toBe(true);
		expect(review.files.map((f) => f.path)).toContain("feature.txt");
		expect(review.newSinceMerge).toBeNull();
		expect(review.reviewBaseline).toMatchObject({ baseSha: preMergeMain, headSha });
	});

	it("separates post-failback fix-ups into newSinceMerge", async () => {
		const preMergeMain = rev(dir, "main");
		const headSha = commitFile(
			dir,
			"kb/task-1",
			"feature.txt",
			"new stuff\n",
			"add feature",
		);
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "kb/task-1", "-m", "merge feature");

		project.preserveReviewDiffAfterMerge = true;
		task.reviewBaseline = {
			baseSha: preMergeMain,
			headSha,
			mainSha: preMergeMain,
			mergedAt: new Date().toISOString(),
			stageId: "merge-1",
		};

		// Fail-back: the fix lands on the task branch (engine re-checks it out).
		commitFile(dir, "kb/task-1", "fix.txt", "fix for review\n", "address feedback");

		const review = await buildTaskReview(
			makeDeps(project, task),
			dir,
			"proj-1",
			"task-1",
		);
		expect(review.preserved).toBe(true);
		// Primary payload is still the frozen merged change...
		expect(review.files.map((f) => f.path)).toContain("feature.txt");
		expect(review.files.map((f) => f.path)).not.toContain("fix.txt");
		// ...and only the response-to-failure work is in the second section.
		expect(review.newSinceMerge).not.toBeNull();
		expect(review.newSinceMerge.files.map((f) => f.path)).toEqual(["fix.txt"]);
	});

	it("shows only the latest pass after re-merge with a reset baseline", async () => {
		const preMergeMain = rev(dir, "main");
		commitFile(dir, "kb/task-1", "feature.txt", "new stuff\n", "add feature");
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "kb/task-1", "-m", "merge feature");

		project.preserveReviewDiffAfterMerge = true;
		// First pass baseline (reset-on-merge overwrites it on the next pass).
		task.reviewBaseline = {
			baseSha: preMergeMain,
			headSha: rev(dir, "kb/task-1"),
			mainSha: preMergeMain,
			mergedAt: new Date().toISOString(),
			stageId: "merge-1",
		};

		// Fail-back fix, then a second merge pass establishes a new baseline.
		const postMergeMain = rev(dir, "main");
		const fixHead = commitFile(
			dir,
			"kb/task-1",
			"fix.txt",
			"fix for review\n",
			"address feedback",
		);
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "kb/task-1", "-m", "merge fix");
		task.reviewBaseline = {
			baseSha: postMergeMain,
			headSha: fixHead,
			mainSha: postMergeMain,
			mergedAt: new Date().toISOString(),
			stageId: "merge-1",
		};

		const review = await buildTaskReview(
			makeDeps(project, task),
			dir,
			"proj-1",
			"task-1",
		);
		expect(review.preserved).toBe(true);
		expect(review.files.map((f) => f.path)).toEqual(["fix.txt"]);
		expect(review.newSinceMerge).toBeNull();
	});

	it("still renders the baseline when the task branch was deleted post-merge", async () => {
		const preMergeMain = rev(dir, "main");
		const headSha = commitFile(
			dir,
			"kb/task-1",
			"feature.txt",
			"new stuff\n",
			"add feature",
		);
		git(dir, "checkout", "main");
		git(dir, "merge", "--no-ff", "kb/task-1", "-m", "merge feature");
		git(dir, "branch", "-D", "kb/task-1");

		project.preserveReviewDiffAfterMerge = true;
		task.reviewBaseline = {
			baseSha: preMergeMain,
			headSha,
			mainSha: preMergeMain,
			mergedAt: new Date().toISOString(),
			stageId: "merge-1",
		};

		const review = await buildTaskReview(
			makeDeps(project, task),
			dir,
			"proj-1",
			"task-1",
		);
		expect(review.preserved).toBe(true);
		expect(review.files.map((f) => f.path)).toContain("feature.txt");
	});

	it("falls back to the live diff with a note when baseline SHAs are gone", async () => {
		commitFile(dir, "kb/task-1", "feature.txt", "new stuff\n", "add feature");
		project.preserveReviewDiffAfterMerge = true;
		task.reviewBaseline = {
			baseSha: "0".repeat(40),
			headSha: "1".repeat(40),
			mainSha: "0".repeat(40),
			mergedAt: new Date().toISOString(),
			stageId: "merge-1",
		};

		const review = await buildTaskReview(
			makeDeps(project, task),
			dir,
			"proj-1",
			"task-1",
		);
		expect(review.preserved).toBe(false);
		expect(review.preserveNote).toMatch(/live diff/);
		expect(review.files.map((f) => f.path)).toContain("feature.txt");
	});

	it("resolves the base branch and never the task branch itself", async () => {
		await expect(resolveReviewBase(dir, "kb/task-1")).resolves.toBe("main");
		await expect(resolveReviewBase(dir, "main")).resolves.not.toBe("main");
	});
});
