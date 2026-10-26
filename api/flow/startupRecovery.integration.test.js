/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

const { ProjectStore } = await import("../projectStore.js");
const { TaskStore } = await import("../taskStore.js");

/***
 * MARK: startup-recovery integration test
 * @description End-to-end proof that a restart picks up straight where it
 *   left off: a task stranded mid-stage by a `kill -9` (orphaned
 *   `running_agent`, shutdown hook never ran) and one left as `interrupted`
 *   by SIGTERM both auto-resume through `performStartupRecovery` and run to
 *   completion exactly once — no duplicate stage execution, no human resume
 *   click. Throwaway temp repo only; no background servers or ports.
 ***/
describe.skipIf(!gitAvailable)("startup recovery resumes interrupted work", () => {
	let base;
	let repo;
	let projectStore;
	const projectId = "startup-recovery-proj";
	const stages = [
		{ id: "build", name: "Build", type: "agent", prompt: "Do the work" },
	];
	let runCount = 0;

	const agentRunner = async (prompt, { cwd }) => {
		runCount += 1;
		fs.writeFileSync(
			path.join(cwd, "agent.txt"),
			`agent work run ${runCount}\n`,
		);
		return "agent done";
	};

	function run(cwd, ...args) {
		execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
	}

	function freshStore() {
		const store = new TaskStore({ projectStore, eventBridge: null });
		projectStore.projects.set(projectId, {
			id: projectId,
			name: "Startup Recovery Project",
			cwd: repo,
			useBranches: true,
			stages,
		});
		return store;
	}

	async function waitFor(taskStore, taskId, { timeoutMs = 30000 } = {}) {
		const started = Date.now();
		for (;;) {
			const current = taskStore.getTask(projectId, taskId);
			if (current?.status === "completed") return current;
			if (Date.now() - started > timeoutMs) {
				throw new Error(
					`timed out waiting for ${taskId} (status: ${current?.status})`,
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-startup-recovery-"));
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

		projectStore = new ProjectStore({
			projectsRoot: path.join(base, "projects-root"),
			notesRoot: path.join(base, "notes-root"),
			autoScan: false,
		});
	});

	beforeEach(() => {
		const tasksDir = path.join(repo, "docs", "tasks");
		if (fs.existsSync(tasksDir)) {
			fs.rmSync(tasksDir, { recursive: true, force: true });
		}
	});

	afterAll(() => {
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("a kill -9 orphan (running_agent, hook never ran) resumes and runs once", async () => {
		const bootOne = freshStore();
		const created = bootOne.createTask(projectId, {
			title: "Kill -9 victim",
			goal: "Prove kill -9 recovery",
			stageId: "build",
			projectCwd: repo,
		});
		// Crash between dispatch and shutdown hook: the task file says
		// `running_agent`, nothing marked it interrupted.
		const stranded = bootOne.getTask(projectId, created.id);
		stranded.status = "running_agent";
		bootOne._saveTaskMarkdown(repo, stranded);
		bootOne.stopScheduler();

		// "Restart": a brand-new store (idle engine, fresh stats) re-reads the
		// same project directory from disk, exactly like a rebooted server.
		const bootTwo = freshStore();
		bootTwo.scanTasks(projectId, repo);
		expect(bootTwo.getTask(projectId, created.id).status).toBe("interrupted");

		const before = runCount;
		const recovery = await bootTwo.performStartupRecovery({
			agentRunner,
		});
		try {
			expect(recovery.autoResumed).toEqual([
				{ projectId, taskId: created.id },
			]);
			const finished = await waitFor(bootTwo, created.id);
			expect(finished.status).toBe("completed");
			// The scheduler's own tick dispatched the resumed stage exactly
			// once — startup recovery never calls executeStage itself.
			expect(runCount - before).toBe(1);
			expect(
				finished.history.some((h) =>
					String(h.action || "").includes("Auto-resumed after server restart"),
				),
			).toBe(true);
		} finally {
			bootTwo.stopScheduler();
		}
	});

	it("a SIGTERM interruption resumes and runs once", async () => {
		const bootOne = freshStore();
		const created = bootOne.createTask(projectId, {
			title: "SIGTERM victim",
			goal: "Prove SIGTERM recovery",
			stageId: "build",
			projectCwd: repo,
		});
		// Graceful shutdown hook output: `interrupted` + flag, persisted.
		const parked = bootOne.getTask(projectId, created.id);
		parked.status = "interrupted";
		parked.wasInterrupted = true;
		bootOne._saveTaskMarkdown(repo, parked);
		bootOne.stopScheduler();

		const bootTwo = freshStore();
		bootTwo.scanTasks(projectId, repo);
		expect(bootTwo.getTask(projectId, created.id).status).toBe("interrupted");

		const before = runCount;
		const recovery = await bootTwo.performStartupRecovery({
			agentRunner,
		});
		try {
			expect(recovery.autoResumed).toEqual([
				{ projectId, taskId: created.id },
			]);
			const finished = await waitFor(bootTwo, created.id);
			expect(finished.status).toBe("completed");
			expect(runCount - before).toBe(1);
		} finally {
			bootTwo.stopScheduler();
		}
	});
});
