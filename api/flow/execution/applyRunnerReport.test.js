// Domain: The Flow — unit tests for Runner attribution on the Runner-report finish.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../../taskStore.js";
import { applyRunnerReport } from "./applyRunnerReport.js";
import { isGitFailureParked } from "../scheduler/isGitFailureParked.js";
import { isSchedulerRunnable } from "../scheduler/isSchedulerRunnable.js";

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

	it("old-runner compat: failed outcomes without gitFailure carry no gitDiagnostics", async () => {
		const { store, projectStore } = makeStoresWith(stages);
		const task = store.createTask("p1", {
			goal: "old runner omits gitFailure",
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
				failureKind: "rejected",
				failureReason: "agent gave up",
				duration: "2.0",
				runnerId: "runner-old",
			},
		});
		expect(task.lastError).toBeDefined();
		expect(task.lastError).not.toHaveProperty("gitDiagnostics");
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

describe("The Flow: applyRunnerReport structured git failures", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kb-runner-gitfailure-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const HOOK_OUTPUT = [
		"binary-guard check FAILED (3 corrupt binaries):",
		"  docs/tasks/t1/assets/a.png: expected magic 89504e47, found efbfbd",
		"  docs/tasks/t1/assets/b.png: expected magic 89504e47, found efbfbd",
		"  shot.png: expected magic 89504e47, found efbfbd",
	].join("\n");

	const gitFailure = () => ({
		kind: "hook-rejected",
		phase: "stage-commit",
		command: "git commit -m kb/t1 build: Runner runner-alpha stage output",
		exitCode: 1,
		hookName: "pre-commit",
		files: ["docs/tasks/t1/assets/a.png", "docs/tasks/t1/assets/b.png", "shot.png"],
		hookOutput: HOOK_OUTPUT,
		remedy: "Re-capture each corrupt file, then retry the stage.",
		summary: "Commit blocked by pre-commit hook: 3 corrupt files",
		truncatedFiles: false,
		truncatedOutput: false,
	});

	function makeStores() {
		const processEvents = [];
		const bridge = {
			emitProcessEvent: (projectId, event, payload) => {
				processEvents.push({ event, payload });
			},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: bridge,
			projectStore: { getProject: () => ({ stages, cwd: tempCwd }) },
		});
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		return { store, projectStore, processEvents };
	}

	it("persists the envelope as gitDiagnostics and replaces the stale error", async () => {
		const { store, projectStore } = makeStores();
		const task = store.createTask("p1", {
			goal: "hook-rejected stage commit",
			stageId: "build",
			projectCwd: tempCwd,
		});
		// A stale error from an earlier human rejection (the incident's
		// misleading UI state): the new failure must replace it.
		task.failureReason = "Cant see settings in the Ui";
		task.lastError = { message: "Cant see settings in the Ui", failureKind: "rejected" };

		await applyRunnerReport({
			store,
			projectStore,
			projectId: "p1",
			taskId: task.id,
			outcome: {
				status: "failed",
				output: "",
				harnessId: "pi",
				failureKind: "commit-failed",
				failureReason: "Commit blocked by pre-commit hook: 3 corrupt files",
				duration: "4.0",
				runnerId: "runner-alpha",
				gitFailure: gitFailure(),
			},
		});

		expect(task.failureReason).toBe("Commit blocked by pre-commit hook: 3 corrupt files");
		expect(task.lastError).toMatchObject({
			message: "Commit blocked by pre-commit hook: 3 corrupt files",
			failureKind: "commit-failed",
			gitDiagnostics: {
				kind: "hook-rejected",
				phase: "stage-commit",
				hookName: "pre-commit",
				exitCode: 1,
				files: ["docs/tasks/t1/assets/a.png", "docs/tasks/t1/assets/b.png", "shot.png"],
			},
		});
		expect(task.lastError.gitDiagnostics.remedy).toContain("Re-capture");
		expect(task.lastError.stdout).toContain("binary-guard check FAILED");
		// Logical failback (actionable feedback), never a transient retry.
		expect(task.lastError.classification).toMatchObject({ kind: "logical", signal: "commit-failed", retryable: false });
	});

	it("renders hook detail into the timeline row, history, failure report, and process:exit", async () => {
		const { store, projectStore, processEvents } = makeStores();
		const task = store.createTask("p1", {
			goal: "hook failure surfaces everywhere",
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
				output: "",
				harnessId: "pi",
				failureKind: "commit-failed",
				failureReason: "Commit blocked by pre-commit hook: 3 corrupt files",
				duration: "4.0",
				runnerId: "runner-alpha",
				gitFailure: gitFailure(),
			},
		});

		const failedRow = task.timeline.find((entry) => entry.status === "Failed");
		expect(failedRow).toBeDefined();
		expect(failedRow.reason).toContain("Commit blocked by pre-commit hook");
		expect(failedRow.stdout || "").toContain("binary-guard check FAILED");
		const actions = task.history.map((entry) => entry.action).join("\n");
		expect(actions).toMatch(/Stage failed in 'Build'/);
		const report = task.reports.at(-1);
		expect(report.status).toBe("FAILED");
		expect(report.filename).toContain("-failure-");
		expect(report.failureKind).toBe("commit-failed");
		expect(report.content).toContain("binary-guard check FAILED");
		expect(report.content).toContain("shot.png");
		const exit = processEvents.find((entry) => entry.event === "process:exit");
		expect(exit).toBeDefined();
		expect(exit.payload).toMatchObject({ status: "failed", taskId: task.id });
	});

	it("drops a malformed gitFailure but still records the stage failure", async () => {
		const { store, projectStore } = makeStores();
		const task = store.createTask("p1", {
			goal: "malformed payload degrades",
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
				output: "some output",
				harnessId: "pi",
				failureKind: "commit-failed",
				failureReason: "Commit blocked by pre-commit hook",
				duration: "4.0",
				runnerId: "runner-alpha",
				gitFailure: "hook-rejected",
			},
		});

		expect(task.failureReason).toBe("Commit blocked by pre-commit hook");
		expect(task.lastError).not.toHaveProperty("gitDiagnostics");
		expect(task.lastError.stdout).toContain("some output");
	});

	it("parks after three consecutive same-signature failures on one stage", async () => {
		// Single-stage pipeline: failback stays in place, so the streak
		// accumulates on the current stage instead of walking back.
		const soloStages = [{ id: "build", name: "Build", type: "agent", report: true }];
		const quietBridge = {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const store = new TaskStore({
			eventBridge: quietBridge,
			projectStore: { getProject: () => ({ stages: soloStages, cwd: tempCwd }) },
		});
		const projectStore = { getProject: () => ({ stages: soloStages, cwd: tempCwd }) };
		const task = store.createTask("p1", {
			goal: "three strikes park",
			stageId: "build",
			projectCwd: tempCwd,
		});
		const failedOutcome = () => ({
			status: "failed",
			output: "",
			harnessId: "pi",
			failureKind: "commit-failed",
			failureReason: "Commit blocked by pre-commit hook: 3 corrupt files",
			duration: "4.0",
			runnerId: "runner-alpha",
			gitFailure: gitFailure(),
		});

		await applyRunnerReport({ store, projectStore, projectId: "p1", taskId: task.id, outcome: failedOutcome() });
		expect(task.gitFailureStreak).toMatchObject({ stageId: "build", count: 1 });
		expect(isGitFailureParked(task)).toBe(false);

		await applyRunnerReport({ store, projectStore, projectId: "p1", taskId: task.id, outcome: failedOutcome() });
		expect(task.gitFailureStreak.count).toBe(2);
		expect(isGitFailureParked(task)).toBe(false);

		await applyRunnerReport({ store, projectStore, projectId: "p1", taskId: task.id, outcome: failedOutcome() });
		expect(task.gitFailureStreak.count).toBe(3);
		expect(isGitFailureParked(task)).toBe(true);
		expect(isSchedulerRunnable(task, { type: "agent" })).toBe(false);
		const parkLine = task.history.find((entry) =>
			String(entry.action).includes("auto-dispatch paused"),
		);
		expect(parkLine).toBeDefined();

		// A pass ends the episode: the streak clears and dispatch resumes.
		await applyRunnerReport({
			store,
			projectStore,
			projectId: "p1",
			taskId: task.id,
			outcome: {
				status: "passed",
				output: "fixed the PNGs",
				harnessId: "pi",
				duration: "9.0",
				runnerId: "runner-alpha",
			},
		});
		expect(task).not.toHaveProperty("gitFailureStreak");
		expect(isGitFailureParked(task)).toBe(false);
	});
});
