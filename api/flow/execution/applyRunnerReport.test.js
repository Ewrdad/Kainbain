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

describe("The Flow: applyRunnerReport verdict double-check (old-Runner protection)", () => {
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

	const FAIL_BLOCK =
		"KAINBAIN_VERDICT: FAIL\nKAINBAIN_REASON: canary test red\nKAINBAIN_FIX: pause the stage in spec setup";

	function makeStoresWith(stageList) {
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages: stageList, cwd: tempCwd }) },
		});
		const projectStore = { getProject: () => ({ stages: stageList, cwd: tempCwd }) };
		return { store, projectStore };
	}

	it("B1: passed + well-formed FAIL on an agent stage fails back with rejected", async () => {
		const { store, projectStore } = makeStoresWith(stages);
		const task = store.createTask("p1", {
			goal: "old runner missed the FAIL block",
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
				output: `Deep review complete.\n${FAIL_BLOCK}`,
				harnessId: "pi",
				duration: "1.5",
				runnerId: "runner-old",
			},
		});

		// Routed through routeStageError (failback per stage config), not advanced.
		expect(result.advanced).not.toBe(true);
		expect(task.currentStageId).toBe("design");
		expect(task.reports.at(-1)).toMatchObject({ status: "FAILED" });
		expect(task.failureReason || "").toContain("canary test red");
		expect(task.failureReason || "").toContain("Fix guidance:");
		expect(task.lastError).toMatchObject({ failureKind: "rejected" });
		// The passed-path "none" sample is never recorded for a failed-back
		// stage (the repro symptom: failureKind "none" + advance).
		expect(
			(task.reliabilitySamples ?? []).some((s) => s.failureKind === "none"),
		).toBe(false);
	});

	it("B2: passed + reasonless FAIL still advances (fail-open preserved)", async () => {
		const { store, projectStore } = makeStoresWith(stages);
		const task = store.createTask("p1", {
			goal: "reasonless FAIL passes open",
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
				output: "Something is wrong.\nKAINBAIN_VERDICT: FAIL",
				harnessId: "pi",
				duration: "1.5",
				runnerId: "runner-old",
			},
		});

		expect(result.advanced).toBe(true);
		expect(task.currentStageId).toBe("review");
	});

	it("B3: passed + FAIL block on human and CI stages advances unaffected", async () => {
		// Human stage.
		const { store, projectStore } = makeStoresWith(stages);
		const humanTask = store.createTask("p1", {
			goal: "human stage ignores verdicts",
			stageId: "design",
			projectCwd: tempCwd,
		});
		const humanResult = await applyRunnerReport({
			store,
			projectStore,
			projectId: "p1",
			taskId: humanTask.id,
			outcome: {
				status: "passed",
				output: FAIL_BLOCK,
				harnessId: "pi",
				duration: "1.5",
				runnerId: "runner-old",
			},
		});
		expect(humanResult.advanced).toBe(true);
		expect(humanTask.currentStageId).toBe("build");

		// CI stage.
		const ciStages = [
			{ id: "build", name: "Build", type: "agent", report: true },
			{ id: "verify", name: "Verify", type: "ci", command: "npm test" },
			{ id: "review", name: "Review", type: "human" },
		];
		const ciStores = makeStoresWith(ciStages);
		const ciTask = ciStores.store.createTask("p1", {
			goal: "ci stage ignores verdicts",
			stageId: "verify",
			projectCwd: tempCwd,
		});
		const ciResult = await applyRunnerReport({
			store: ciStores.store,
			projectStore: ciStores.projectStore,
			projectId: "p1",
			taskId: ciTask.id,
			outcome: {
				status: "passed",
				output: FAIL_BLOCK,
				harnessId: "pi",
				duration: "1.5",
				runnerId: "runner-old",
			},
		});
		expect(ciResult.advanced).toBe(true);
		expect(ciTask.currentStageId).toBe("review");
	});
});
