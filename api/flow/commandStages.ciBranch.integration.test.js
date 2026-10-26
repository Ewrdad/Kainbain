/* eslint-disable security/detect-non-literal-fs-filename */
// Domain: The Flow — real-git integration for ci stages with a non-task
// runOnBranch. The unit suite pins the order and choice of git calls with
// mocks; these tests prove the checkout/restore contract against an actual
// git binary in throwaway temp repos (never the KainBain repo itself), using
// the injectable execRunner seam to observe the branch the command really
// sees. Skipped when git is unavailable.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
	gitAvailable,
	runGit,
	makeTmpBase,
	makeRepoTracker,
	initRepo,
} from "../test-helpers/tmpRepo.js";

const { runCommandStage } = await import("./commandStages.js");
const { currentBranch } = await import("../git.js");

function stubStore(overrides = {}) {
	return {
		eventBridge: null,
		getTask: () => null,
		updateTask: () => {},
		saveStageReport: vi.fn((_projectId, _taskId, report) => report),
		_saveTaskMarkdown: () => {},
		_isBranchModeEnabled: () => false,
		finalizeTaskBranch: vi.fn(() => ({ returnError: null })),
		advanceStage: () => {},
		handleStageFailure: async () => ({ status: "failed" }),
		...overrides,
	};
}

/** Runs `git rev-parse --abbrev-ref HEAD` in the resolved execution cwd. */
function branchProbeRunner(exitCode = 0) {
	return async (_command, opts) => {
		const stdout = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: opts.cwd,
		}).toString();
		return { exitCode, stdout, stderr: "" };
	};
}

function ciTask() {
	return {
		id: "task-1",
		projectId: "proj-1",
		branch: "kb/task-1",
		status: "in_stage",
		history: [],
		logEntries: [],
	};
}

const runOpts = (stage, overrides = {}) => ({
	stages: [stage],
	kind: "ci",
	label: "CI",
	logTag: "CI/CMD",
	reportTitle: "CI Stage Report",
	statusValue: "running_ci",
	defaultCommand: "git rev-parse --abbrev-ref HEAD",
	execRunner: branchProbeRunner(),
	...overrides,
});

describe.skipIf(!gitAvailable)("runCommandStage ci run-on-branch (real git)", () => {
	let base;
	let repos;

	beforeAll(() => {
		base = makeTmpBase("kainbain-ci-branch-");
		repos = makeRepoTracker();
	});

	afterAll(() => {
		repos.cleanup();
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// best-effort
		}
	});

	/** main + release + feature branches, checked out on `feature`. */
	function featureRepo(name) {
		const cwd = initRepo(path.join(base, name), { initialBranch: "main" });
		runGit(cwd, "checkout", "-b", "release");
		runGit(cwd, "checkout", "-b", "feature");
		return repos.track(cwd);
	}

	function runStage(store, task, stage, overrides = {}) {
		store.getTask = () => task;
		return runCommandStage(store, "proj-1", "task-1", stage, {
			cwd: task.cwd,
			...runOpts(stage, overrides),
		});
	}

	it("runs primary-mode CI on the default branch and restores it afterwards", async () => {
		const cwd = featureRepo("primary-pass");
		const store = stubStore();
		const task = { ...ciTask(), cwd };

		const result = await runStage(store, task, {
			id: "ci-1",
			name: "Verify main",
			type: "ci",
			command: "git rev-parse --abbrev-ref HEAD",
			runOnBranch: "primary",
		});

		expect(result.status).toBe("passed");
		// The command really executed on the primary branch.
		expect(result.stdout.trim()).toBe("main");
		// The primary checkout was restored to the default branch.
		expect(await currentBranch(cwd)).toBe("main");
		// No task-branch finalize: a verification run must not commit/push.
		expect(store.finalizeTaskBranch).not.toHaveBeenCalled();
		// The report records the branch evidence.
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("**Branch:** main (primary)");
	});

	it("runs custom-mode CI on the named branch and restores it afterwards", async () => {
		const cwd = featureRepo("custom-pass");
		const store = stubStore();
		const task = { ...ciTask(), cwd };

		const result = await runStage(store, task, {
			id: "ci-1",
			name: "Verify release",
			type: "ci",
			command: "git rev-parse --abbrev-ref HEAD",
			runOnBranch: "custom",
			customBranch: "release",
		});

		expect(result.status).toBe("passed");
		expect(result.stdout.trim()).toBe("release");
		expect(await currentBranch(cwd)).toBe("main");
	});

	it("keeps task-mode CI on the current checkout with no branch switching", async () => {
		const cwd = featureRepo("task-mode");
		const store = stubStore();
		const task = { ...ciTask(), cwd };

		const result = await runStage(store, task, {
			id: "ci-1",
			name: "Verify task branch",
			type: "ci",
			command: "git rev-parse --abbrev-ref HEAD",
		});

		expect(result.status).toBe("passed");
		expect(result.stdout.trim()).toBe("feature");
		expect(await currentBranch(cwd)).toBe("feature");
	});

	it("refuses the switch and fails the stage when the tree is dirty", async () => {
		const cwd = featureRepo("dirty-tree");
		fs.writeFileSync(path.join(cwd, "README.md"), "# uncommitted work\n");
		const store = stubStore();
		const failures = [];
		store.handleStageFailure = async (_p, _t, _s, err) => {
			failures.push(err);
			return { status: "failed" };
		};
		let ran = false;
		const task = { ...ciTask(), cwd };

		const result = await runStage(store, task, {
			id: "ci-1",
			name: "Verify main",
			type: "ci",
			command: "git rev-parse --abbrev-ref HEAD",
			runOnBranch: "primary",
		}, { execRunner: async () => { ran = true; return { exitCode: 0, stdout: "", stderr: "" }; } });

		expect(result.status).toBe("failed");
		expect(ran).toBe(false);
		expect(failures[0].message).toContain("not clean");
		// No mutation: still on the original branch, work intact.
		expect(await currentBranch(cwd)).toBe("feature");
		expect(fs.readFileSync(path.join(cwd, "README.md"), "utf8")).toBe("# uncommitted work\n");
	});

	it("fails the stage before any checkout when the custom branch does not exist", async () => {
		const cwd = featureRepo("custom-missing");
		const store = stubStore();
		const failures = [];
		store.handleStageFailure = async (_p, _t, _s, err) => {
			failures.push(err);
			return { status: "failed" };
		};
		let ran = false;
		const task = { ...ciTask(), cwd };

		const result = await runStage(store, task, {
			id: "ci-1",
			name: "Verify ghost",
			type: "ci",
			command: "git rev-parse --abbrev-ref HEAD",
			runOnBranch: "custom",
			customBranch: "ghost/branch",
		}, { execRunner: async () => { ran = true; return { exitCode: 0, stdout: "", stderr: "" }; } });

		expect(result.status).toBe("failed");
		expect(ran).toBe(false);
		expect(failures[0].message).toContain("does not exist locally");
		expect(await currentBranch(cwd)).toBe("feature");
	});

	it("still restores the default branch after a failing primary-mode command", async () => {
		const cwd = featureRepo("primary-fail");
		const store = stubStore();
		store.handleStageFailure = async () => ({ status: "failed" });
		const task = { ...ciTask(), cwd };
		let seenBranch = null;

		const result = await runStage(store, task, {
			id: "ci-1",
			name: "Verify main",
			type: "ci",
			command: "false",
			runOnBranch: "primary",
		}, { execRunner: async (_c, opts) => {
			seenBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: opts.cwd }).toString().trim();
			return { exitCode: 1, stdout: "", stderr: "boom" };
		} });

		expect(result.status).toBe("failed");
		expect(seenBranch).toBe("main");
		expect(await currentBranch(cwd)).toBe("main");
	});
});
