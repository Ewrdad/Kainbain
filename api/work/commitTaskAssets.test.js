/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { commitTaskAssets } from "./commitTaskAssets.js";
import { writeTaskAttachment } from "./taskAssets.js";

/***
 * MARK: commitTaskAssets tests
 * @description Ingest-time scoped commits: assets land on the task branch
 *   promptly, `task.md` and sibling work are never staged, wrong-branch
 *   checkouts refuse fail-closed, and every failure resolves (never throws).
 ***/
describe("commitTaskAssets", () => {
	const repos = [];
	afterEach(() => {
		for (const repo of repos.splice(0)) {
			try {
				fs.rmSync(repo, { recursive: true, force: true });
			} catch {
				// ignore cleanup error
			}
		}
	});

	const gitRepo = (taskId = "task-commit-1") => {
		const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-commit-assets-"));
		repos.push(repo);
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
		const taskDir = path.join(repo, "docs", "tasks", taskId);
		fs.mkdirSync(taskDir, { recursive: true });
		fs.writeFileSync(path.join(taskDir, "task.md"), "seed");
		fs.writeFileSync(path.join(repo, "README.md"), "seed");
		git(["add", "."]);
		git(["commit", "-qm", "seed"]);
		git(["checkout", "-qb", `kb/${taskId}`]);
		return { repo, git };
	};

	it("commits ingested assets on the task branch", async () => {
		const { repo } = gitRepo();
		writeTaskAttachment(repo, "task-commit-1", "out.log", Buffer.from("log"));
		const outcome = await commitTaskAssets({ projectCwd: repo, taskId: "task-commit-1" });
		expect(outcome).toMatchObject({ committed: true, reason: "committed" });
		expect(outcome.hash).toMatch(/^[0-9a-f]{40}$/);
		const log = execFileSync("git", ["log", "--format=%s", "-1"], {
			cwd: repo,
			encoding: "utf8",
		}).trim();
		expect(log).toContain("task-commit-1");
		const files = execFileSync("git", ["show", "--name-only", "--format=", "HEAD"], {
			cwd: repo,
			encoding: "utf8",
		})
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean);
		expect(files).toEqual(["docs/tasks/task-commit-1/assets/out.log"]);
		// Second call with nothing new is a clean no-op.
		expect(await commitTaskAssets({ projectCwd: repo, taskId: "task-commit-1" })).toEqual(
			{ committed: false, hash: null, reason: "clean" },
		);
	});

	it("never stages task.md or sibling work", async () => {
		const { repo } = gitRepo();
		writeTaskAttachment(repo, "task-commit-1", "out.log", Buffer.from("log"));
		fs.writeFileSync(
			path.join(repo, "docs", "tasks", "task-commit-1", "task.md"),
			"live store state",
		);
		fs.writeFileSync(path.join(repo, "README.md"), "sibling work");
		const outcome = await commitTaskAssets({
			projectCwd: repo,
			taskId: "task-commit-1",
			names: ["out.log"],
		});
		expect(outcome.committed).toBe(true);
		const status = execFileSync("git", ["status", "--porcelain"], {
			cwd: repo,
			encoding: "utf8",
		});
		expect(status).toContain("task.md");
		expect(status).toContain("README.md");
		expect(status).not.toContain("assets/out.log");
	});

	it("refuses fail-closed when the checkout is on another branch", async () => {
		const { repo, git } = gitRepo();
		writeTaskAttachment(repo, "task-commit-1", "out.log", Buffer.from("log"));
		git(["checkout", "-q", "main"]);
		const outcome = await commitTaskAssets({ projectCwd: repo, taskId: "task-commit-1" });
		expect(outcome).toEqual({ committed: false, hash: null, reason: "wrong-branch" });
		const status = execFileSync("git", ["status", "--porcelain"], {
			cwd: repo,
			encoding: "utf8",
		});
		expect(status).toContain("docs/tasks/task-commit-1/assets/");
	});

	it("honours an explicit branch and resolves instead of throwing", async () => {
		const { repo, git } = gitRepo();
		writeTaskAttachment(repo, "task-commit-1", "out.log", Buffer.from("log"));
		git(["checkout", "-qb", "feature/custom"]);
		const ok = await commitTaskAssets({
			projectCwd: repo,
			taskId: "task-commit-1",
			branch: "feature/custom",
		});
		expect(ok.committed).toBe(true);
		const plain = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-commit-plain-"));
		repos.push(plain);
		expect(await commitTaskAssets({ projectCwd: plain, taskId: "t1" })).toEqual({
			committed: false,
			hash: null,
			reason: "not-a-repo",
		});
		expect(await commitTaskAssets({ projectCwd: null, taskId: "t1" })).toEqual({
			committed: false,
			hash: null,
			reason: "invalid-location",
		});
	});
});
