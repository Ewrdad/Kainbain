// Domain: The Flow — unit tests for Runner attribution on the Runner-report finish.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../../taskStore.js";
import { applyRunnerReport } from "./applyRunnerReport.js";

vi.mock("../../git.js", () => ({
	isGitRepository: async () => true,
	hasCommits: async () => true,
	currentBranch: async () => "main",
	defaultBranch: async () => "main",
	branchExists: async () => true,
	ensureBranchCheckedOut: async () => ({ created: false, checkedOut: true, switched: false }),
	checkoutBranch: async () => ({ switched: true }),
	requireCleanWorkingTree: async () => {},
	commitAllIfNeeded: async () => ({ committed: false, hash: null }),
	mergeBranch: async () => ({ stdout: "merged", stderr: "" }),
	syncBranchWithUpstream: async () => ({ synced: false, skipped: "no-remote" }),
	resolveSha: async () => "a".repeat(40),
	diffRangeNumstat: async () => ({ stdout: "", stderr: "", code: 0 }),
}));

const stages = [
	{ id: "design", name: "Design", type: "human" },
	{ id: "build", name: "Build", type: "agent", fallbackStageId: "design", report: true },
	{ id: "review", name: "Review", type: "human" },
];

describe("The Flow: applyRunnerReport Runner attribution", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-report-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	function makeStores() {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		return { store, projectStore };
	}

	it("records the Runner on the pass history entry and stage report", async () => {
		const { store, projectStore } = makeStores();
		const task = store.createTask("p1", {
			goal: "runner pass attribution",
			stageId: "build",
			projectCwd: tempCwd,
		});

		const result = await applyRunnerReport({
			store,
			projectStore,
			projectId: "p1",
			taskId: task.id,
			outcome: {
				status: "passed",
				output: "done",
				summary: "built it",
				modifiedFiles: [],
				harnessId: "pi",
				modelRef: "test-model",
				duration: "1.5",
				runnerId: "runner-alpha",
			},
		});

		expect(result.advanced).toBe(true);
		const completedEntry = task.history.find((entry) =>
			String(entry.action).includes("Agent stage completed"),
		);
		expect(completedEntry).toMatchObject({
			runnerId: "runner-alpha",
		});
		expect(task.reports.at(-1)).toMatchObject({
			status: "PASSED",
			runnerId: "runner-alpha",
		});
	});

	it("records the Runner on the Failed row and failure report", async () => {
		const { store, projectStore } = makeStores();
		const task = store.createTask("p1", {
			goal: "runner failure attribution",
			stageId: "build",
			projectCwd: tempCwd,
		});

		await applyRunnerReport({
			store,
			projectStore,
			projectId: "p1",
			taskId: task.id,
			outcome: {
				status: "failed",
				output: "traceback...",
				harnessId: "pi",
				modelRef: "test-model",
				failureKind: "rejected",
				failureReason: "agent gave up: tests failing",
				duration: "2.0",
				runnerId: "runner-alpha",
			},
		});

		const failedRow = task.timeline.find((entry) => entry.status === "Failed");
		expect(failedRow).toMatchObject({
			harnessId: "pi",
			modelRef: "test-model",
			runnerId: "runner-alpha",
		});
		expect(task.reports.at(-1)).toMatchObject({
			status: "FAILED",
			runnerId: "runner-alpha",
		});
	});
});
