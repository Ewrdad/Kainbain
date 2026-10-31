/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

// End-to-end proof of the per-task branch lifecycle against a real git binary
// with a real file remote: pickup (default → task) → work → commit → push →
// return to default, for agent, CI, merge, and deploy stages. Human stages
// (checkpoint + approval) never touch the tree: they only ensure the
// task-branch ref exists, so reviewer edits stay uncommitted until the
// operator commits them (the merge stage loudly refuses a dirty tree).
// Everything happens inside throwaway temp directories — never
// the KainBain repo itself, and no background servers are started.
let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { ProjectStore } = await import("../projectStore.js");
const { TaskStore } = await import("../taskStore.js");
const { currentBranch } = await import("../git.js");
const { registerTaskFlowRoutes } = await import("./taskFlowRoutes.js");

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function porcelain(cwd) {
	return execFileSync("git", ["status", "--porcelain"], {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

describe.skipIf(!gitAvailable)("task branch lifecycle end to end", () => {
	let base;
	let repo;
	let remoteDir;
	let projectStore;
	let taskStore;
	let projectId;
	let task;
	let stages;

	const agentRunner = async (prompt, { cwd }) => {
		fs.writeFileSync(path.join(cwd, "agent.txt"), "agent work\n");
		return "agent done";
	};
	const ciRunner = async (command, { cwd }) => {
		fs.writeFileSync(path.join(cwd, "ci.txt"), "ci output\n");
		return { exitCode: 0, stdout: "ci ok", stderr: "" };
	};
	const mergeRunner = async () => ({ exitCode: 0, stdout: "merged", stderr: "" });
	const deployRunner = async (command, { cwd }) => {
		fs.writeFileSync(path.join(cwd, "deploy.txt"), "deploy output\n");
		return { exitCode: 0, stdout: "deployed", stderr: "" };
	};

	beforeAll(async () => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-lifecycle-"));
		repo = path.join(base, "project");
		fs.mkdirSync(repo, { recursive: true });
		run(repo, "init", "-b", "main");
		run(repo, "config", "user.email", "kainbain-test@example.com");
		run(repo, "config", "user.name", "KainBain Test");
		// Engine artifacts stay out of the working tree, as in real projects.
		fs.writeFileSync(path.join(repo, ".gitignore"), "docs/tasks/\n.kainbain/\n");
		fs.writeFileSync(path.join(repo, "README.md"), "# init\n");
		run(repo, "add", "-A");
		run(repo, "commit", "-m", "init");

		// File remote standing in for `origin`.
		remoteDir = path.join(base, "origin.git");
		run(base, "init", "--bare", "origin.git");
		run(repo, "remote", "add", "origin", remoteDir);

		projectStore = new ProjectStore({
			projectsRoot: path.join(base, "projects-root"),
			notesRoot: path.join(base, "notes-root"),
			autoScan: false,
		});
		taskStore = new TaskStore({ projectStore, eventBridge: null });

		stages = [
			{ id: "build", name: "Build", type: "agent", prompt: "Do the work" },
			{ id: "verify", name: "Verify", type: "ci", command: "make verify" },
			{ id: "review", name: "Review", type: "human" },
			{ id: "integrate", name: "Integrate", type: "merge" },
			{ id: "release", name: "Release", type: "deploy", command: "./deploy.sh" },
		];
		projectId = "lifecycle-proj";
		projectStore.projects.set(projectId, {
			id: projectId,
			name: "Lifecycle Project",
			cwd: repo,
			useBranches: true,
			stages,
		});

		task = taskStore.createTask(projectId, {
			title: "Lifecycle work",
			goal: "Prove the branch lifecycle",
			stageId: "build",
			projectCwd: repo,
		});
		await taskStore.ensureTaskBranch(task, repo);
	});

	afterAll(() => {
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("agent stage: default → task → commit → push → default", async () => {
		const result = await taskStore.executeStage(projectId, task.id, {
			stages,
			projectCwd: repo,
			agentRunner,
		});

		expect(result.status).toBe("passed");
		expect(await currentBranch(repo)).toBe("main");
		// Work was committed on the task branch and pushed to the remote.
		expect(run(repo, "log", "--oneline", task.branch)).toContain(
			"auto-commit work after stage 'Build'",
		);
		expect(run(remoteDir, "log", "--oneline", `refs/heads/${task.branch}`)).toContain(
			"auto-commit work after stage 'Build'",
		);
		// The operator can pause here and hand-edit the default branch.
		expect(porcelain(repo)).toBe("");
		expect(
			task.history.some((h) => h.action.includes("Returned to default branch")),
		).toBe(true);
	});

	it("CI stage: default → task → commit → push → default", async () => {
		const result = await taskStore.executeStage(projectId, task.id, {
			stages,
			projectCwd: repo,
			execRunner: ciRunner,
		});

		expect(result.status).toBe("passed");
		expect(task.currentStageId).toBe("review");
		expect(await currentBranch(repo)).toBe("main");
		expect(run(repo, "log", "--oneline", task.branch)).toContain(
			"auto-commit work after stage 'Verify'",
		);
		expect(run(remoteDir, "log", "--oneline", `refs/heads/${task.branch}`)).toContain(
			"auto-commit work after stage 'Verify'",
		);
		expect(porcelain(repo)).toBe("");
	});

	it("human stage: checkpoint ensures the ref without touching the tree", async () => {
		const result = await taskStore.executeStage(projectId, task.id, {
			stages,
			projectCwd: repo,
		});

		expect(result.status).toBe("waiting_human");
		// Still on the default branch: no checkout, commit, push, or return.
		expect(await currentBranch(repo)).toBe("main");
		expect(porcelain(repo)).toBe("");
		// The ref exists (rev-parse --verify throws when it does not).
		expect(
			run(repo, "rev-parse", "--verify", `refs/heads/${task.branch}`).trim(),
		).toMatch(/^[0-9a-f]{40}$/);
	});

	it("human approval: leaves the tree untouched, edits stay uncommitted", async () => {
		// The human edits while the checkpoint is open.
		fs.writeFileSync(path.join(repo, "human.txt"), "human edit\n");

		const routes = new Map();
		const fakeApp = {
			post: (routePath, handler) => {
				routes.set(routePath, handler);
			},
			get: (routePath, handler) => {
				routes.set(routePath, handler);
			},
		};
		await registerTaskFlowRoutes(fakeApp, {
			resolveAndGuardProject: () => projectId,
			projectStore,
			taskStore,
			promptEngine: { curatePrompt: () => "curated" },
		});
		const advance = routes.get("/tasks/:id/advance");
		expect(advance).toBeTypeOf("function");

		let sent = null;
		const reply = { status: () => ({ send: (body) => { sent = body; } }) };
		await advance(
			{ body: { projectId }, params: { id: task.id } },
			reply,
		);
		expect(sent).toBeNull();

		const updated = taskStore.getTask(projectId, task.id);
		expect(updated.currentStageId).toBe("integrate");
		// Never left the default branch; the human edit is still uncommitted.
		expect(await currentBranch(repo)).toBe("main");
		expect(porcelain(repo)).toContain("human.txt");
		// No approval commit exists locally or on the remote.
		expect(run(repo, "log", "--oneline", task.branch)).not.toContain(
			"auto-commit work after stage 'Review'",
		);
		expect(
			run(remoteDir, "log", "--oneline", `refs/heads/${task.branch}`),
		).not.toContain("auto-commit work after stage 'Review'");
	});

	it("merge stage: integrates, ends on default, pushes default", async () => {
		// Human checkpoints never commit, and the merge stage loudly refuses
		// a dirty tree — so the operator commits their checkpoint edits first,
		// exactly as the refusal message instructs.
		run(repo, "add", "human.txt");
		run(repo, "commit", "-m", "operator: checkpoint edits");

		const result = await taskStore.executeStage(projectId, task.id, {
			stages,
			projectCwd: repo,
			execRunner: mergeRunner,
		});

		expect(result.status).toBe("passed");
		expect(await currentBranch(repo)).toBe("main");
		const mainContent = run(repo, "log", "--oneline", "main");
		// Squash landing: main's log is the changelog — one commit carrying
		// the task title, never the task branch's own commit subjects.
		expect(mainContent).toContain("Lifecycle work");
		expect(mainContent).not.toContain("auto-commit work after stage 'Build'");
		expect(run(repo, "log", "--format=%B", "-5", "main")).toContain("Kainbain-Task:");
		expect(fs.readFileSync(path.join(repo, "agent.txt"), "utf8")).toContain(
			"agent work",
		);
		expect(fs.readFileSync(path.join(repo, "human.txt"), "utf8")).toContain(
			"human edit",
		);
		// The integrated default branch was published to the remote.
		const remoteMain = run(remoteDir, "log", "--oneline", "refs/heads/main");
		expect(remoteMain).toContain("Lifecycle work");
		expect(remoteMain).not.toContain("auto-commit work after stage 'Review'");
		const updated = taskStore.getTask(projectId, task.id);
		expect((updated.logEntries || []).map((e) => e.text).join("\n")).toContain(
			"Pushed 'main' to remote after merge",
		);
	});

	it("deploy stage: runs as an ordinary CI stage (default → task → commit → push → default)", async () => {
		const result = await taskStore.executeStage(projectId, task.id, {
			stages,
			projectCwd: repo,
			execRunner: deployRunner,
		});

		expect(result.status).toBe("passed");
		expect(await currentBranch(repo)).toBe("main");
		// The deploy command runs on the task branch as an ordinary CI stage,
		// auto-commits, pushes, and returns to main.
		expect(run(repo, "log", "--oneline", task.branch)).toContain(
			"auto-commit work after stage 'Release'",
		);
		expect(run(remoteDir, "log", "--oneline", `refs/heads/${task.branch}`)).toContain(
			"auto-commit work after stage 'Release'",
		);
		expect(porcelain(repo)).toBe("");
		expect(taskStore.getTask(projectId, task.id).status).toBe("completed");
	});
});
