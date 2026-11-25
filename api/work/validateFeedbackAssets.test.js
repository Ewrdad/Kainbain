/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateFeedbackForTask } from "./validateFeedbackAssets.js";

function taskRepoWith({ taskId, files = {} } = {}) {
	const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-feedback-val-"));
	const assetsDir = path.join(repo, "docs", "tasks", taskId, "assets");
	fs.mkdirSync(assetsDir, { recursive: true });
	for (const [name, bytes] of Object.entries(files)) {
		fs.writeFileSync(path.join(assetsDir, name), bytes);
	}
	return repo;
}

function gitRepoWithBranchAssets(taskId) {
	const repo = fs.mkdtempSync(
		path.join(os.tmpdir(), "kainbain-feedback-val-git-"),
	);
	const git = (args) =>
		execFileSync("git", args, {
			cwd: repo,
			stdio: "ignore",
			env: {
				...process.env,
				GIT_CONFIG_GLOBAL: os.devNull,
				GIT_CONFIG_SYSTEM: os.devNull,
			},
		});
	git(["init", "-q", "--initial-branch=main"]);
	git(["config", "user.email", "t@t.t"]);
	git(["config", "user.name", "t"]);
	git(["config", "commit.gpgsign", "false"]);
	const assetsDir = path.join(repo, "docs", "tasks", taskId, "assets");
	fs.mkdirSync(assetsDir, { recursive: true });
	fs.writeFileSync(path.join(assetsDir, "shot.png"), "branch-bytes");
	fs.writeFileSync(
		path.join(repo, "docs", "tasks", taskId, "task.md"),
		"x",
	);
	git(["add", "."]);
	git(["commit", "-qm", "seed"]);
	git(["checkout", "-qb", `kb/${taskId}`]);
	// Simulate the flap: another branch is checked out, so the worktree no
	// longer shows the task's assets.
	git(["checkout", "-q", "main"]);
	git(["rm", "-q", "-r", "--cached", `docs/tasks/${taskId}`]);
	fs.rmSync(path.join(repo, "docs", "tasks", taskId), {
		recursive: true,
		force: true,
	});
	git(["commit", "-qm", "flap away"]);
	return repo;
}

describe("validateFeedbackForTask", () => {
	it("passes healthy feedback with bytes on disk", () => {
		const repo = taskRepoWith({ taskId: "t1", files: { "a.png": "bytes" } });
		try {
			const decision = validateFeedbackForTask({
				projectCwd: repo,
				taskId: "t1",
				text: "Broken on save — see ![a](assets/a.png)",
			});
			expect(decision.ok).toBe(true);
			expect(decision.missing).toEqual([]);
			expect(decision.imageOnly).toBe(false);
			expect(decision.error).toBe("");
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("refuses dangling refs, naming the file and its expected path", () => {
		const repo = taskRepoWith({ taskId: "t1", files: { "kept.png": "b" } });
		try {
			const decision = validateFeedbackForTask({
				projectCwd: repo,
				taskId: "t1",
				text: "See ![gone](assets/gone.png) please take a look",
			});
			expect(decision.ok).toBe(false);
			expect(decision.missing).toEqual([
				{
					ref: "assets/gone.png",
					name: "gone.png",
					expectedPath: "docs/tasks/t1/assets/gone.png",
				},
			]);
			expect(decision.error).toContain("assets/gone.png");
			expect(decision.imageOnly).toBe(false);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("passes prosaic feedback with no refs at all", () => {
		const repo = taskRepoWith({ taskId: "t1" });
		try {
			expect(
				validateFeedbackForTask({
					projectCwd: repo,
					taskId: "t1",
					text: "Please add tests",
				}).ok,
			).toBe(true);
			expect(
				validateFeedbackForTask({ projectCwd: repo, taskId: "t1", text: "" }).ok,
			).toBe(true);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("refuses image-only drafts even when the bytes exist", () => {
		const repo = taskRepoWith({ taskId: "t1", files: { "a.png": "bytes" } });
		try {
			const decision = validateFeedbackForTask({
				projectCwd: repo,
				taskId: "t1",
				text: "![a](assets/a.png)",
			});
			expect(decision.ok).toBe(false);
			expect(decision.missing).toEqual([]);
			expect(decision.imageOnly).toBe(true);
			expect(decision.error).toContain("only images");
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("stays silent on drifted-but-servable refs (resolveAssetRef parity)", () => {
		const repo = taskRepoWith({ taskId: "t1", files: { "shot.png": "b" } });
		try {
			expect(
				validateFeedbackForTask({
					projectCwd: repo,
					taskId: "t1",
					text: "Compare ![a](assets/Shot.PNG) with main please",
				}).ok,
			).toBe(true);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("accepts branch-backed refs while a sibling branch is out (no flap block)", () => {
		const repo = gitRepoWithBranchAssets("task-flap");
		try {
			expect(
				fs.existsSync(
					path.join(
						repo,
						"docs",
						"tasks",
						"task-flap",
						"assets",
						"shot.png",
					),
				),
			).toBe(false);
			const decision = validateFeedbackForTask({
				projectCwd: repo,
				taskId: "task-flap",
				branch: "kb/task-flap",
				text: "Compare ![a](assets/shot.png) with main please",
			});
			expect(decision.missing).toEqual([]);
			expect(decision.ok).toBe(true);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("derives kb/<taskId> when the branch is not passed (curation parity)", () => {
		const repo = gitRepoWithBranchAssets("task-flap");
		try {
			const decision = validateFeedbackForTask({
				projectCwd: repo,
				taskId: "task-flap",
				text: "Compare ![a](assets/shot.png) with main please",
			});
			expect(decision.missing).toEqual([]);
			expect(decision.ok).toBe(true);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("keeps the refusal when the branch is unusable (never invents presence)", () => {
		const repo = taskRepoWith({ taskId: "t1" });
		try {
			const decision = validateFeedbackForTask({
				projectCwd: repo,
				taskId: "t1",
				branch: "../escape",
				text: "See ![gone](assets/gone.png) please",
			});
			expect(decision.ok).toBe(false);
			expect(decision.missing.map((entry) => entry.ref)).toEqual([
				"assets/gone.png",
			]);
		} finally {
			fs.rmSync(repo, { recursive: true, force: true });
		}
	});

	it("fails open on presence without a checkout, image-only still applies", () => {
		expect(
			validateFeedbackForTask({ text: "See ![a](assets/a.png) please take a look" })
				.ok,
		).toBe(true);
		const imageOnly = validateFeedbackForTask({
			text: "![a](assets/a.png)",
		});
		expect(imageOnly.ok).toBe(false);
		expect(imageOnly.imageOnly).toBe(true);
	});

	it("never throws on garbage input", () => {
		expect(validateFeedbackForTask().ok).toBe(true);
		expect(validateFeedbackForTask(null).ok).toBe(true);
		expect(validateFeedbackForTask("nope").ok).toBe(true);
		expect(validateFeedbackForTask({ text: null }).ok).toBe(true);
		expect(
			validateFeedbackForTask({ projectCwd: null, taskId: 42, text: 42 }).ok,
		).toBe(true);
		// Image-only still applies when presence cannot be verified.
		expect(validateFeedbackForTask(null).imageOnly).toBe(false);
		expect(
			validateFeedbackForTask({ text: "![a](assets/a.png)" }).imageOnly,
		).toBe(true);
	});
});
