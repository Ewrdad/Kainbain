/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	gitAvailable,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
	runGit,
	plantIndexLock,
} from "../test-helpers/tmpRepo.js";

const { ProjectStore } = await import("../projectStore.js");
const { TaskStore } = await import("../taskStore.js");
const { currentBranch } = await import("../git.js");

/***
 * MARK: retry-after-recovery integration test
 * @description End-to-end proof of the terminal-`failed` recovery path: a
 *   task parked as `failed` by an orphaned `.git/index.lock` comes back
 *   through `retryStage` once the stale lock is auto-cleared — the stage
 *   passes and the recovery is audited in task history. Throwaway temp
 *   repo only; no background servers.
 ***/

describe.skipIf(!gitAvailable)("retry recovers a lock-poisoned failed task", () => {
	let base;
	const repos = makeRepoTracker();
	let repo;
	let projectStore;
	let taskStore;
	const projectId = "recovery-proj";
	const stages = [
		{ id: "build", name: "Build", type: "agent", prompt: "Do the work" },
	];

	const agentRunner = async (prompt, { cwd }) => {
		fs.writeFileSync(path.join(cwd, "agent.txt"), "agent work\n");
		return "agent done";
	};

	beforeAll(async () => {
		base = makeTmpBase("kainbain-retry-recovery-");
		repo = repos.track(initRepo(path.join(base, "project")));
		// Engine artifacts stay out of the working tree, as in real projects.
		fs.writeFileSync(path.join(repo, ".gitignore"), "docs/tasks/\n.kainbain/\n");
		runGit(repo, "add", "-A");
		runGit(repo, "commit", "-m", "ignore engine artifacts");

		projectStore = new ProjectStore({
			projectsRoot: path.join(base, "projects-root"),
			notesRoot: path.join(base, "notes-root"),
			autoScan: false,
		});
		taskStore = new TaskStore({ projectStore, eventBridge: null });
		projectStore.projects.set(projectId, {
			id: projectId,
			name: "Recovery Project",
			cwd: repo,
			useBranches: true,
			stages,
		});
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("a failed task passes after retry clears the stale lock", async () => {
		const task = taskStore.createTask(projectId, {
			title: "Lock-poisoned work",
			goal: "Prove retry-after-recovery",
			stageId: "build",
			projectCwd: repo,
		});
		// Creating a task performs zero git work (deferred provisioning).
		expect(task.branch).toContain(task.id);

		// Simulate the parked incident state: terminal `failed` with the
		// lock text as the failure reason, plus an orphaned lock on disk.
		taskStore.updateTask(
			projectId,
			task.id,
			{
				status: "failed",
				failureReason:
					"git checkout main failed (exit 128): fatal: Unable to create " +
					`'${repo}/.git/index.lock': File exists.`,
			},
			repo,
		);
		const lockPath = plantIndexLock(repo, 120_000);
		expect(fs.existsSync(lockPath)).toBe(true);

		const retried = await taskStore.retryStage(projectId, task.id, {
			stages,
			projectCwd: repo,
			agentRunner,
		});

		// The single agent stage passes and the pipeline completes; the
		// orphan lock is gone and the tree is back on the default branch.
		expect(retried.status).toBe("completed");
		expect(fs.existsSync(lockPath)).toBe(false);
		expect(await currentBranch(repo)).toBe("main");
		expect(
			retried.history.some((h) =>
				String(h.action || "").includes("Recovered stale git lock"),
			),
		).toBe(true);
	});
});
