/* eslint-disable security/detect-non-literal-fs-filename */
import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { eventBridge } from "../eventBridge.js";
import { taskStore } from "../taskStore.js";

// Isolation: temp roots are installed by ../isolatedTestRoots.js, which MUST
// stay the first import — the config loader snapshots process.env at first
// evaluation. This suite registers a "Review Fixture" project per test (cwd
// already under the OS tmpdir); without throwaway roots each registration
// leaks a notes dir into the live SilverBullet notes space, because DELETE
// /projects only drops the in-memory entry.

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/**
 * MARK: Review API Integration Tests
 * @description Verifies the MR-style review endpoints against a real fixture
 *   git repo: diff assembly (files/counts/commits/ahead-behind), the D2
 *   snapshot rule, empty states (D7), comment CRUD with sidecar persistence,
 *   REVIEW_UPDATED broadcasts, and injection/anchor validation.
 */
describe("Review API Integration", () => {
	beforeAll(async () => {
		await app.ready();
	});

	let testRoot;
	let createdProjects = [];

	async function makeProject({ useBranches = true } = {}) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-review-route-"));
		testRoot = dir;
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: `Review Fixture ${Date.now()}-${createdProjects.length}`, cwd: dir, useBranches, gitUrl: "https://git.example.com/team/fixture.git" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		createdProjects.push(project.id);
		return project;
	}

	async function makeTask(projectId) {
		const res = await app.inject({
			method: "POST",
			url: "/tasks",
			payload: { projectId, title: "Review me", goal: "Build a reviewable change" },
		});
		expect(res.statusCode).toBe(200);
		return JSON.parse(res.payload);
	}

	/**
	 * Sets up a fixture repo: initial commit on main, then a task branch with
	 * a known change. Mirrors what the engine does with useBranches projects.
	 */
	function seedFixtureRepo(projectCwd, taskId, branchName) {
		const git = (args, opts = {}) =>
			spawnSync("git", args, { cwd: projectCwd, encoding: "utf8", ...opts });

		// createProject git-inits with the host's default branch name; pin the
		// unborn HEAD to main so the fixture matches the engine's expectations.
		git(["symbolic-ref", "HEAD", "refs/heads/main"]);

		// Initial commit on main
		fs.writeFileSync(path.join(projectCwd, "README.md"), "# Fixture\n");
		git(["add", "."]);
		git(["commit", "-m", "initial commit"]);

		// Task branch with two commits (ordering + diff coverage)
		git(["checkout", "-b", branchName]);
		fs.mkdirSync(path.join(projectCwd, "src"), { recursive: true });
		fs.writeFileSync(path.join(projectCwd, "src", "auth.js"), "const a = 1;\nconst b = 2;\n");
		fs.writeFileSync(path.join(projectCwd, "src", "util.js"), "export const u = () => 1;\n");
		git(["add", "."]);
		git(["commit", "-m", "commit 1"]);
		fs.writeFileSync(path.join(projectCwd, "src", "auth.js"), "const a = 1;\nconst b = 2;\nconst c = 3;\n");
		git(["add", "."]);
		git(["commit", "-m", "commit 2"]);
		return branchName;
	}

	beforeEach(() => {
		testRoot = undefined;
	});

	afterEach(() => {
		if (testRoot) {
			fs.rmSync(testRoot, { recursive: true, force: true });
		}
	});

	afterAll(async () => {
		// Clean up projects so the shared app singleton stays small.
		for (const id of createdProjects) {
			await app.inject({ method: "DELETE", url: `/projects/${id}` }).catch(() => {});
		}
	});

	it("GET review returns the diff for a task branch: files, counts, commits newest-first, ahead/behind", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		// Point the task at its branch the way the engine does.
		const patchRes = await app.inject({
			method: "PATCH",
			url: `/tasks/${task.id}`,
			payload: { projectId: project.id, branch },
		});
		expect(patchRes.statusCode).toBe(200);

		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const review = JSON.parse(res.payload);

		expect(review.branch).toBe(branch);
		expect(review.branchSupported).toBe(true);
		expect(review.baseBranch).toBe("main");
		expect(review.baseSha).toBeTruthy();
		expect(review.headSha).toBeTruthy();
		expect(review.aheadBy).toBe(2);
		expect(review.behindBy).toBe(0);

		const paths = review.files.map((f) => f.path);
		expect(paths).toContain("src/auth.js");
		expect(paths).toContain("src/util.js");
		const auth = review.files.find((f) => f.path === "src/auth.js");
		expect(auth.status).toBe("added");
		// Merge-base diff main...branch: commit 1 adds 2 lines, commit 2 adds 1.
		expect(auth.additions).toBe(3);
		expect(auth.deletions).toBe(0);
		expect(auth.diff).toContain("@@");

		// D8: newest-first commit list
		expect(review.commits).toHaveLength(2);
		expect(review.commits[0].message).toContain("commit 2");
		expect(review.commits[1].message).toContain("commit 1");
	});

	it("GET review records a D2 snapshot commit when the worktree is dirty ON the task branch", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		// Leave dirty work on the task branch (agent crashed mid-work).
		spawnSync("git", ["checkout", branch], { cwd: project.cwd });
		fs.writeFileSync(path.join(project.cwd, "src", "late.js"), "late work\n");

		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const review = JSON.parse(res.payload);

		// Snapshot committed: the late file is part of the review.
		const paths = review.files.map((f) => f.path);
		expect(paths).toContain("src/late.js");

		// History entry recorded like other transitions.
		const taskRes = await app.inject({
			method: "GET",
			url: `/tasks/${task.id}?projectId=${project.id}`,
		});
		const updated = JSON.parse(taskRes.payload);
		const histText = (updated.history || []).map((h) => h.action || h.message || "").join(" | ");
		expect(histText).toContain("checkpoint commit before human review");

		// The snapshot commit is the tip of the branch — nothing dirty remains.
		const status = spawnSync("git", ["status", "--porcelain"], { cwd: project.cwd, encoding: "utf8" });
		expect(status.stdout.trim()).toBe("");
	});

	it("GET review flags uncommittedChanges when the tree is dirty OFF the task branch and never checks out", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		// Switch back to main; the shared worktree belongs to "another task" now.
		spawnSync("git", ["checkout", "main"], { cwd: project.cwd, encoding: "utf8" });
		// Dirty the tracked file on main.
		fs.appendFileSync(path.join(project.cwd, "README.md"), "someone else\n");
		const beforeBranch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: project.cwd,
			encoding: "utf8",
		}).stdout.trim();

		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		const review = JSON.parse(res.payload);
		expect(review.uncommittedChanges).toBe(true);

		// Review must be read-only w.r.t. refs: still on main.
		const afterBranch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: project.cwd,
			encoding: "utf8",
		}).stdout.trim();
		expect(afterBranch).toBe(beforeBranch);
		expect(afterBranch).toBe("main");
	});

	it("GET review returns a documented empty state when branch support is off", async () => {
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);

		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const review = JSON.parse(res.payload);
		expect(review.branchSupported).toBe(false);
		expect(review.reason).toBeTruthy();
		expect(review.files).toEqual([]);
		expect(review.commits).toEqual([]);
	});

	it("GET review returns a documented empty state when the task branch does not exist yet", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);

		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(200);
		const review = JSON.parse(res.payload);
		expect(review.branchSupported).toBe(true);
		expect(review.reason).toBeTruthy();
		expect(review.files).toEqual([]);
	});

	it("GET review returns 404 for an unknown task", async () => {
		const project = await makeProject();
		const res = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/nope/review?projectId=${project.id}`,
		});
		expect(res.statusCode).toBe(404);
	});

	it("POST comment creates a file-scope comment and broadcasts REVIEW_UPDATED", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		const spy = vi.spyOn(eventBridge, "broadcastGlobal");
		const res = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
			payload: {
				scope: "file",
				filePath: "src/auth.js",
				headSha: "abc123",
				body: "Please split this module up",
			},
		});
		expect(res.statusCode).toBe(200);
		const comment = JSON.parse(res.payload);
		expect(comment.id).toMatch(/^rc-/);
		expect(comment.scope).toBe("file");
		expect(comment.resolved).toBe(false);

		expect(spy).toHaveBeenCalledWith(
			"REVIEW_UPDATED",
			expect.objectContaining({ taskId: task.id, type: "comment_added", comment }),
		);
		spy.mockRestore();

		// GET review includes the comment
		const reviewRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		const review = JSON.parse(reviewRes.payload);
		expect(review.comments).toHaveLength(1);
		expect(review.comments[0].id).toBe(comment.id);
	});

	it("POST comment creates a line-scope comment anchored to a line and side", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		const res = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
			payload: {
				scope: "line",
				filePath: "src/auth.js",
				line: 3,
				side: "right",
				headSha: "abc123",
				lineText: "const c = 3;",
				body: "Use a config table instead",
			},
		});
		expect(res.statusCode).toBe(200);
		const comment = JSON.parse(res.payload);
		expect(comment.line).toBe(3);
		expect(comment.side).toBe("right");
		expect(comment.lineText).toBe("const c = 3;");
	});

	it("POST comment rejects unknown filePath, over-long body, bad scope, and line comments without a line", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });
		const url = `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`;

		const unknown = await app.inject({
			method: "POST",
			url,
			payload: { scope: "file", filePath: "not/in/diff.js", body: "hi" },
		});
		expect(unknown.statusCode).toBe(400);
		expect(JSON.parse(unknown.payload).error).toContain("Unknown filePath");

		const tooLong = await app.inject({
			method: "POST",
			url,
			payload: { scope: "file", filePath: "src/auth.js", body: "x".repeat(4001) },
		});
		expect(tooLong.statusCode).toBe(400);

		const badScope = await app.inject({
			method: "POST",
			url,
			payload: { scope: "hunk", filePath: "src/auth.js", body: "x" },
		});
		expect(badScope.statusCode).toBe(400);

		const noLine = await app.inject({
			method: "POST",
			url,
			payload: { scope: "line", filePath: "src/auth.js", body: "x" },
		});
		expect(noLine.statusCode).toBe(400);
	});

	it("GET review returns task reports and accepts comments on report files even when a diff exists", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		// Generate a stage report for the task
		const report = taskStore.saveStageReport(project.id, task.id, {
			stageName: "Planning",
			stageId: "plan-1",
			status: "PASSED",
			content: "# Plan\nLine 1\nLine 2",
			projectCwd: project.cwd,
		});
		expect(report).toBeDefined();

		const reviewRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		expect(reviewRes.statusCode).toBe(200);
		const review = JSON.parse(reviewRes.payload);
		expect(Array.isArray(review.reports)).toBe(true);
		expect(review.reports.some((r) => r.path === report.path || r.filename === report.filename)).toBe(true);

		// Comment on the report file should succeed despite not being in git diff
		const commentRes = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
			payload: {
				scope: "line",
				filePath: report.path,
				line: 2,
				body: "Consider step 2 detail",
			},
		});
		expect(commentRes.statusCode).toBe(200);
		const comment = JSON.parse(commentRes.payload);
		expect(comment.filePath).toBe(report.path);
		expect(comment.line).toBe(2);
	});

	it("accepts report comments in an empty-state review and across ./ and bare path spellings", async () => {
		// Centralised-docs scenario: reports live outside the repo, so there is
		// no diff to anchor to — the reports themselves are the review surface.
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);
		const report = taskStore.saveStageReport(project.id, task.id, {
			stageName: "Planning",
			stageId: "plan-1",
			status: "PASSED",
			content: "# Plan\nLine 1\nLine 2",
			projectCwd: project.cwd,
		});
		expect(report).toBeDefined();

		const reviewRes = await app.inject({
			method: "GET",
			url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
		});
		expect(reviewRes.statusCode).toBe(200);
		const review = JSON.parse(reviewRes.payload);
		expect(review.branchSupported).toBe(false);
		expect(review.files).toEqual([]);
		expect(review.reports.some((r) => r.path === report.path)).toBe(true);

		// Both the `./`-prefixed and bare spellings anchor to the same report.
		for (const filePath of [report.path, report.path.replace(/^\.\//, "")]) {
			const res = await app.inject({
				method: "POST",
				url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
				payload: {
					scope: "line",
					filePath,
					line: 2,
					body: `note for ${filePath}`,
				},
			});
			expect(res.statusCode).toBe(200);
			expect(JSON.parse(res.payload).filePath).toBe(filePath);
		}
	});

	it("rejects report-anchored line comments outside the report's line range", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		const report = taskStore.saveStageReport(project.id, task.id, {
			stageName: "Planning",
			stageId: "plan-1",
			status: "PASSED",
			content: "# Plan\nLine 1\nLine 2",
			projectCwd: project.cwd,
		});
		const url = `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`;

		// 3 content lines: line 0 and line 4 can never render, so they fail loudly.
		for (const line of [0, 4, 999]) {
			const res = await app.inject({
				method: "POST",
				url,
				payload: { scope: "line", filePath: report.path, line, body: `orphan ${line}` },
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).error).toContain("outside this report");
		}

		// Boundary lines still anchor, in both path spellings.
		for (const [filePath, line] of [
			[report.path, 1],
			[report.path, 3],
			[report.path.replace(/^\.\//, ""), 3],
		]) {
			const res = await app.inject({
				method: "POST",
				url,
				payload: { scope: "line", filePath, line, body: `edge ${line}` },
			});
			expect(res.statusCode).toBe(200);
		}

		// File-scope comments stay allowed regardless of line counts.
		const fileRes = await app.inject({
			method: "POST",
			url,
			payload: { scope: "file", filePath: report.path, body: "whole-report note" },
		});
		expect(fileRes.statusCode).toBe(200);
	});

	it("rejects bare-filename anchors when the report has a full path", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		const report = taskStore.saveStageReport(project.id, task.id, {
			stageName: "Planning",
			stageId: "plan-1",
			status: "PASSED",
			content: "# Plan\nLine 1",
			projectCwd: project.cwd,
		});
		const res = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
			payload: { scope: "file", filePath: report.filename, body: "bare name" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toContain("Unknown filePath");
	});

	it("preserved review after merge shows the merged change plus fix-ups, and fix-up files accept comments", async () => {
		const project = await makeProject();
		const task = await makeTask(project.id);
		const branch = `kb/${task.id}`;
		seedFixtureRepo(project.cwd, task.id, branch);
		await app.inject({ method: "PATCH", url: `/tasks/${task.id}`, payload: { projectId: project.id, branch } });

		// Opt in to preservation through the project PATCH body (passthrough).
		const flagRes = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { preserveReviewDiffAfterMerge: true },
		});
		expect(flagRes.statusCode).toBe(200);
		expect(JSON.parse(flagRes.payload).preserveReviewDiffAfterMerge).toBe(true);

		const git = (args) =>
			spawnSync("git", args, { cwd: project.cwd, encoding: "utf8" });
		git(["config", "user.email", "kainbain-test@example.com"]);
		git(["config", "user.name", "KainBain Test"]);
		// Commit the settings write the way the engine's auto-commit would,
		// so it does not leak into the fix-up diff below.
		git(["checkout", branch]);
		git(["add", "."]);
		git(["commit", "-m", "save project settings"]);
		const preMergeMain = git(["rev-parse", "main"]).stdout.trim();
		const headSha = git(["rev-parse", branch]).stdout.trim();
		git(["checkout", "main"]);
		git(["merge", "--no-ff", branch, "-m", "merge feature"]);

		// The merge stage freezes these SHAs on the task (data-only, no ref).
		taskStore.updateTask(
			project.id,
			task.id,
			{
				reviewBaseline: {
					baseSha: preMergeMain,
					headSha,
					mainSha: preMergeMain,
					mergedAt: new Date().toISOString(),
					stageId: "merge-1",
				},
			},
			project.cwd,
		);

		// Fail-back fix-up lands on the task branch.
		git(["checkout", branch]);
		fs.writeFileSync(path.join(project.cwd, "src", "fix.js"), "export const fix = 1;\n");
		git(["add", "."]);
		git(["commit", "-m", "address feedback"]);

		const review = JSON.parse(
			(
				await app.inject({
					method: "GET",
					url: `/projects/${project.id}/tasks/${task.id}/review?projectId=${project.id}`,
				})
			).payload,
		);
		expect(review.preserved).toBe(true);
		expect(review.files.map((f) => f.path)).toContain("src/auth.js");
		expect(review.newSinceMerge.files.map((f) => f.path)).toEqual(["src/fix.js"]);

		// A comment on the fix-up file is accepted (not "Unknown filePath").
		const commentRes = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
			payload: { scope: "file", filePath: "src/fix.js", body: "fix looks good" },
		});
		expect(commentRes.statusCode).toBe(200);
	});

	it("POST comment rejects injection-shaped filePaths in empty-state reviews", async () => {
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);

		// Empty-state review (branch support off): file comments allowed on
		// repo-relative paths, but injection attempts must be rejected.
		for (const filePath of ["--upload-pack", "../escape.md", "/etc/passwd", "main:steal.md"]) {
			const res = await app.inject({
				method: "POST",
				url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
				payload: { scope: "file", filePath, body: "hello" },
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).error).toContain("repo-relative");
		}

		const ok = await app.inject({
			method: "POST",
			url: `/projects/${project.id}/tasks/${task.id}/review/comments?projectId=${project.id}`,
			payload: { scope: "file", filePath: "docs/plan.md", body: "Consider splitting section 2" },
		});
		expect(ok.statusCode).toBe(200);
	});

	it("PATCH comment updates body/resolved; PATCH unknown comment 404s", async () => {
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);
		const base = `/projects/${project.id}/tasks/${task.id}`;

		const created = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: `${base}/review/comments?projectId=${project.id}`,
					payload: { scope: "file", filePath: "docs/plan.md", body: "first" },
				})
			).payload,
		);

		const patched = await app.inject({
			method: "PATCH",
			url: `${base}/review/comments/${created.id}?projectId=${project.id}`,
			payload: { body: "revised", resolved: true },
		});
		expect(patched.statusCode).toBe(200);
		const updated = JSON.parse(patched.payload);
		expect(updated.body).toBe("revised");
		expect(updated.resolved).toBe(true);

		const missing = await app.inject({
			method: "PATCH",
			url: `${base}/review/comments/rc-nope?projectId=${project.id}`,
			payload: { resolved: true },
		});
		expect(missing.statusCode).toBe(404);
	});

	it("POST reply appends to the thread; unknown comment 404s", async () => {
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);
		const base = `/projects/${project.id}/tasks/${task.id}`;

		const created = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: `${base}/review/comments?projectId=${project.id}`,
					payload: { scope: "file", filePath: "docs/plan.md", body: "question" },
				})
			).payload,
		);

		const replyRes = await app.inject({
			method: "POST",
			url: `${base}/review/comments/${created.id}/replies?projectId=${project.id}`,
			payload: { body: "answer" },
		});
		expect(replyRes.statusCode).toBe(200);

		const sidecar = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, "docs", "tasks", task.id, "review-comments.json"),
				"utf8",
			),
		);
		expect(sidecar.comments[0].replies).toHaveLength(1);
		expect(sidecar.comments[0].replies[0].body).toBe("answer");

		const missing = await app.inject({
			method: "POST",
			url: `${base}/review/comments/rc-nope/replies?projectId=${project.id}`,
			payload: { body: "x" },
		});
		expect(missing.statusCode).toBe(404);
	});

	it("DELETE comment removes it from the sidecar; unknown comment 404s", async () => {
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);
		const base = `/projects/${project.id}/tasks/${task.id}`;

		const created = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: `${base}/review/comments?projectId=${project.id}`,
					payload: { scope: "file", filePath: "docs/plan.md", body: "to delete" },
				})
			).payload,
		);

		const del = await app.inject({
			method: "DELETE",
			url: `${base}/review/comments/${created.id}?projectId=${project.id}`,
		});
		expect(del.statusCode).toBe(200);
		const sidecar = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, "docs", "tasks", task.id, "review-comments.json"),
				"utf8",
			),
		);
		expect(sidecar.comments).toHaveLength(0);

		const missing = await app.inject({
			method: "DELETE",
			url: `${base}/review/comments/${created.id}?projectId=${project.id}`,
		});
		expect(missing.statusCode).toBe(404);
	});

	it("broadcasts REVIEW_UPDATED with the right type on update/reply/delete", async () => {
		const project = await makeProject({ useBranches: false });
		const task = await makeTask(project.id);
		const base = `/projects/${project.id}/tasks/${task.id}`;

		const created = JSON.parse(
			(
				await app.inject({
					method: "POST",
					url: `${base}/review/comments?projectId=${project.id}`,
					payload: { scope: "file", filePath: "docs/plan.md", body: "note" },
				})
			).payload,
		);

		const spy = vi.spyOn(eventBridge, "broadcastGlobal");

		await app.inject({
			method: "PATCH",
			url: `${base}/review/comments/${created.id}?projectId=${project.id}`,
			payload: { resolved: true },
		});
		await app.inject({
			method: "POST",
			url: `${base}/review/comments/${created.id}/replies?projectId=${project.id}`,
			payload: { body: "reply" },
		});
		await app.inject({
			method: "DELETE",
			url: `${base}/review/comments/${created.id}?projectId=${project.id}`,
		});

		const types = spy.mock.calls.map(([, payload]) => payload.type);
		expect(types).toContain("comment_updated");
		expect(types).toContain("reply_added");
		expect(types).toContain("comment_deleted");
		spy.mockRestore();
	});
});