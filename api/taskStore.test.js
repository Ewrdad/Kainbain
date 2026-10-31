/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	TaskStore,
	ExecutionQueue,
	generateStageReportContent,
	resolveStageLabel,
	resolveStageTimeout,
	isUnrecoverableError,
	isTransientInfrastructureError,
	_sanitizeTaskTitle,
	_appendProcessLog,
	renderLogEntriesText,
} from "./taskStore.js";
import { config } from "./config.js";
import { collectStageDurations } from "../frontend/src/components/workflow/stageDurations.js";
import { parseReportTimestamp } from "../shared/reportTimestamp.js";

/** Text view over a task's structured log entries, via the shared renderer —
 *  the post-collapse replacement for the removed `task.processLogs` string. */
const logText = (task) => renderLogEntriesText(task.logEntries);

// The git layer is fully mocked for the TaskStore test-suite: no test ever
// runs real git. Branch-stage behaviour is covered end-to-end (against real
// git) in git.integration.test.js. Pure message builders and read-only
// audit drains stay real: the diagnostics text they render is the contract
// under test, not git behavior.
vi.mock("./git.js", async () => {
	const actual = await vi.importActual("./git.js");
	class GitError extends Error {}
	class GitDirtyTreeError extends Error {
		constructor(message, opts = {}) {
			super(message);
			this.name = "GitDirtyTreeError";
			this.dirtyPaths = opts.dirtyPaths || [];
		}
	}
	class GitMergeConflictError extends Error {
		constructor(message, opts = {}) {
			super(message);
			this.name = "GitMergeConflictError";
			this.conflictedFiles = opts.conflictedFiles || [];
		}
	}
	return {
		GitError,
		GitDirtyTreeError,
		GitMergeConflictError,
		buildGitConflictDiagnostics: actual.buildGitConflictDiagnostics,
		buildSquashCommitMessage: actual.buildSquashCommitMessage,
		MERGE_STRATEGY: actual.MERGE_STRATEGY,
		SQUASH_MERGE_STRATEGY: actual.SQUASH_MERGE_STRATEGY,
		squashMergeBranch: vi.fn(async () => ({ committed: true, hash: "c".repeat(40) })),
		abortSquashMerge: vi.fn(async () => {}),
		deleteBranch: vi.fn(async () => ({ deleted: true })),
		findSquashCommit: vi.fn(async () => null),
		isBranchContentLanded: vi.fn(async () => false),
		isBranchMergedInto: vi.fn(async () => false),
		syncDefaultBranchToRemote: vi.fn(async () => ({ synced: false, skipped: "no-remote" })),
		partitionMergeConflicts: actual.partitionMergeConflicts,
		abortMerge: vi.fn(async () => {}),
		resolveConflictsWithIncoming: vi.fn(async () => []),
		drainDirtyTreeRecoveries: actual.drainDirtyTreeRecoveries,
		formatDirtyTreeRecoveryNotice: actual.formatDirtyTreeRecoveryNotice,
		drainGitLockRecoveries: actual.drainGitLockRecoveries,
		formatGitLockRecoveryNotice: actual.formatGitLockRecoveryNotice,
		isGitRepository: vi.fn(async () => true),
		hasCommits: vi.fn(async () => true),
		currentBranch: vi.fn(async () => "main"),
		defaultBranch: vi.fn(async () => "main"),
		branchExists: vi.fn(async () => true),
		ensureBranchCheckedOut: vi.fn(async () => ({
			created: false,
			checkedOut: true,
			switched: false,
		})),
		checkoutBranch: vi.fn(async () => ({ switched: true })),
		countUniqueCommits: vi.fn(async () => 2),
		requireCleanWorkingTree: vi.fn(async () => {}),
		commitAllIfNeeded: vi.fn(async () => ({ committed: false, hash: null })),
		mergeBranch: vi.fn(async () => ({ stdout: "merged", stderr: "" })),
		syncBranchWithUpstream: vi.fn(async () => ({
			synced: false,
			skipped: "no-remote",
			remote: "origin",
			branch: null,
			before: null,
			after: null,
			detail: null,
		})),
		hasRemote: vi.fn(async () => false),
		pushBranchIfRemote: vi.fn(async () => ({ pushed: false, skipped: "no-remote" })),
		returnToDefaultBranch: vi.fn(async () => ({ switched: false, branch: "main" })),
		resolveSha: vi.fn(async () => "a".repeat(40)),
		diffRangeNumstat: vi.fn(async () => ({ stdout: "", stderr: "", code: 0 })),
	};
});

import * as gitHelpers from "./git.js";

/**
 * MARK: TaskStore unit tests
 * @description Verifies discrete task lifecycle logic: creation, stage placement,
 * non-linear jumps, failback routing, human review rejection, markdown report storage,
 * and completion.
 */
const stages = [
	{ id: "1", name: "Idea", type: "agent", failback: "start", report: true },
	{ id: "2", name: "Plan", type: "agent", failback: "previous", report: true },
	{ id: "3", name: "Review", type: "human", failback: "any" },
	{ id: "4", name: "Ship", type: "agent", failback: "abort", report: true },
];

describe("TaskStore", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-taskstore-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	});

	it("round-trips structured report and transition durations through a fresh store", () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		const store = new TaskStore({ projectStore });
		const task = store.createTask("p1", { stageId: "1", projectCwd: tempCwd });
		task.enteredStageAt = new Date(Date.now() - 120000).toISOString();
		const report = store.saveStageReport("p1", task.id, { stageName: "Idea", stageId: "1", duration: 120, status: "PASSED", content: "# Report", projectCwd: tempCwd });
		expect(report).toMatchObject({ duration: 120, stageId: "1", status: "PASSED" });
		store.advanceStage("p1", task.id, stages, undefined, tempCwd);
		expect(task.timeline.at(-1)).toMatchObject({ stage: "Plan", durationStage: "Idea", durationStageId: "1" });
		expect(task.timeline.at(-1).durationSeconds).toBeGreaterThanOrEqual(120);
		const fresh = new TaskStore({ projectStore });
		fresh.scanTasks("p1", tempCwd);
		const loaded = fresh.getTask("p1", task.id);
		expect(loaded.reports[0]).toMatchObject({ duration: 120, stageId: "1", status: "PASSED", content: "# Report", durationStartedAt: report.durationStartedAt });
		expect(loaded.timeline).toEqual(task.timeline);
		loaded.enteredStageAt = new Date(Date.now() - 30000).toISOString();
		fresh.completeTask("p1", task.id, tempCwd);
		expect(loaded.timeline.at(-1).durationSeconds).toBeGreaterThanOrEqual(30);
	});

	it.each(["20260101-000010", "20260101T000010Z"])("attributes legacy disk-only reports by filename (%s), not last task update", (stamp) => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		const store = new TaskStore({ projectStore });
		const task = store.createTask("p1", { stageId: "2", projectCwd: tempCwd });
		const base = Date.parse(parseReportTimestamp(stamp)) - 10000;
		const at = (seconds) => new Date(base + seconds * 1000).toISOString();
		task.history = [
			{ action: "Created in stage 'Plan'", timestamp: at(0) },
			{ action: "Advanced to stage 'Review'", timestamp: at(30) },
			{ action: "Failed back to stage 'Plan'", timestamp: at(100) },
			{ action: "Completed", timestamp: at(200) },
		];
		task.updatedAt = at(200);
		store._saveTaskMarkdown(tempCwd, task);
		const filename = `plan-${stamp}.md`;
		fs.writeFileSync(path.join(tempCwd, "docs", "tasks", task.id, filename), "**Duration:** 10s");
		const fresh = new TaskStore({ projectStore });
		fresh.scanTasks("p1", tempCwd);
		const loaded = fresh.getTask("p1", task.id);
		expect(loaded.reports).toHaveLength(1);
		expect(loaded.reports[0]).toMatchObject({ stageSlug: "plan", createdAt: at(10) });
		expect(collectStageDurations(loaded, stages[1])).toEqual([10, 100]);
		// Reload must not migrate the markdown on disk.
		expect(fs.readFileSync(path.join(tempCwd, "docs", "tasks", task.id, filename), "utf8")).toBe("**Duration:** 10s");
	});

	it.each(["ci", "script", "deploy"])("counts a failed %s command and retry once per visit, including after reload", async (type) => {
		vi.useFakeTimers();
		const at = (seconds) => new Date(Date.UTC(2026, 0, 1) + seconds * 1000);
		try {
			vi.setSystemTime(at(0));
			const executionStages = [{ id: "run", name: "Run", type, command: "mock-only", failback: "start" }, { id: "done", name: "Done", type: "human" }];
			const projectStore = { getProject: () => ({ stages: executionStages, cwd: tempCwd, branchMode: false }) };
			const store = new TaskStore({ projectStore });
			const task = store.createTask("p1", { stageId: "run", projectCwd: tempCwd });
			const failback = store.failbackStage.bind(store);
			vi.spyOn(store, "failbackStage").mockImplementation((...args) => {
				vi.setSystemTime(at(61));
				return failback(...args);
			});
			const save = store.saveStageReport.bind(store);
			const spy = vi.spyOn(store, "saveStageReport").mockImplementation((...args) => {
				// The generic failure report is written after the failure history event,
				// in a different filename second from the original command report.
				if (task.reports.length === 1) vi.setSystemTime(at(60.1));
				return save(...args);
			});
			await store.executeStage("p1", task.id, {
				stages: executionStages, projectCwd: tempCwd,
				execRunner: async () => { vi.setSystemTime(at(59.99)); return { stdout: "failed command", stderr: "test failure", exitCode: 1 }; },
			});
			spy.mockRestore();
			expect(task.reports).toHaveLength(2);
			expect(new Set(task.reports.map((report) => report.filename)).size).toBe(2);
			expect(task.reports.map((report) => report.durationStartedAt)).toEqual([at(0).toISOString(), at(0).toISOString()]);
			vi.setSystemTime(at(61));
			task.status = "in_stage";
			await store.executeStage("p1", task.id, {
				stages: executionStages, projectCwd: tempCwd,
				execRunner: async () => { vi.setSystemTime(at(71)); return { stdout: "ok", stderr: "", exitCode: 0 }; },
			});
			const fresh = new TaskStore({ projectStore });
			fresh.scanTasks("p1", tempCwd);
			for (const subject of [task, fresh.getTask("p1", task.id)]) {
				expect(subject.reports.map((report) => report.durationStartedAt)).toEqual([
					at(0).toISOString(), at(0).toISOString(), at(61).toISOString(),
				]);
				const samples = collectStageDurations(subject, executionStages[0]);
				expect(samples).toHaveLength(2);
				expect(samples[0]).toBeCloseTo(59.99, 2);
				expect(samples[1]).toBe(10);
			}
		} finally {
			vi.restoreAllMocks();
			vi.useRealTimers();
		}
	});

	it("records human approval and failed execution durations without an agent", () => {
		const store = new TaskStore({ projectStore: {getProject: () => ({ stages, cwd: tempCwd })} });
		const task = store.createTask("p1", { stageId: "3", projectCwd: tempCwd });
		task.enteredStageAt = new Date(Date.now() - 60000).toISOString();
		store.advanceStage("p1", task.id, stages, undefined, tempCwd);
		expect(task.reports.at(-1)).toMatchObject({stageId: "3", status: "PASSED"});
		expect(task.reports.at(-1).duration).toBeGreaterThanOrEqual(60);
		task.enteredStageAt = new Date(Date.now() - 15000).toISOString();
		store.handleStageFailure("p1", task.id, stages[3], "Test failure", {stages, projectCwd: tempCwd, skipFailback: true});
		expect(task.reports.at(-1)).toMatchObject({stageId: "4", status: "FAILED"});
		expect(task.reports.at(-1).duration).toBeGreaterThanOrEqual(15);
	});

	it.each([undefined, "invalid", ""])("skips unmeasurable transition timestamps (%s)", (enteredStageAt) => {
		const store = new TaskStore();
		const task = store.createTask("p1", {stageId: "1"});
		task.enteredStageAt = enteredStageAt;
		store.completeTask("p1", task.id);
		expect(task.timeline.at(-1).durationSeconds).toBeUndefined();
		expect(task.timeline.at(-1).duration).toBe("--");
	});

	it.each(["ci", "script", "deploy", "agent"])("persists elapsed seconds for a mocked %s execution", async (type) => {
		const executionStages = [{id: "run", name: "Run", type, command: "mock-only", report: type === "agent"}, {id: "done", name: "Done", type: "human"}];
		const store = new TaskStore({projectStore: {getProject: () => ({stages: executionStages, cwd: tempCwd, branchMode: false})}});
		const task = store.createTask("p1", {stageId: "run", projectCwd: tempCwd});
		task.enteredStageAt = new Date(Date.now() - 45000).toISOString();
		await store.executeStage("p1", task.id, {
			stages: executionStages, projectCwd: tempCwd,
			execRunner: async () => ({stdout: "ok", stderr: "", exitCode: 0}),
			agentRunner: async () => "Completed successfully",
		});
		expect(task.reports.at(-1)).toMatchObject({stageId: "run", status: "PASSED"});
		expect(task.reports.at(-1).duration).toBeGreaterThanOrEqual(45);
		expect(task.timeline.at(-1).durationStageId).toBe("run");
	});

	it("_completeDeployStage is a legacy no-op (continuity moved to the plugin seam)", () => {
		// Deploy cross-restart reconciliation now lives in the
		// implementation-specific continuity plugin
		// (`api/continuity/kainbainSelfDeploy.js`). The generic store keeps
		// the method as a no-op so older callers do not throw.
		const store = new TaskStore();
		const task = store.createTask("p1", {stageId: "deploy", projectCwd: tempCwd});
		task.enteredStageAt = "2026-01-01T00:00:00Z";
		const deploy = {id: "deploy", name: "Deploy", type: "ci", command: "./deploy.sh --prod"};
		const result = store._completeDeployStage("p1", task.id, deploy, [deploy], tempCwd, {finishedAt: "2026-01-01T00:02:00Z", buildNumber: 1});
		expect(result).toBeNull();
		expect(task.reports).toHaveLength(0);
	});

	it("clamps clock skew and makes completion idempotent", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {stageId: "1"});
		task.enteredStageAt = new Date(Date.now() + 60000).toISOString();
		store.completeTask("p1", task.id);
		store.completeTask("p1", task.id);
		expect(task.timeline).toHaveLength(1);
		expect(task.timeline[0].durationSeconds).toBe(0);
	});

	it("creates a task in a given stage with title, goal, and history", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Feature API",
			goal: "Build endpoints",
			stageId: "1",
		});
		expect(task.id).toBeTruthy();
		expect(task.title).toBe("Feature API");
		expect(task.goal).toBe("Build endpoints");
		expect(task.currentStageId).toBe("1");
		expect(task.status).toBe("in_stage");
		expect(task.history.length).toBe(1);
	});

	it("isolates tasks per project", () => {
		const store = new TaskStore();
		const a = store.createTask("p1", { goal: "A", stageId: "1" });
		const b = store.createTask("p2", { goal: "B", stageId: "1" });
		expect(store.listTasks("p1").length).toBe(1);
		expect(store.listTasks("p2").length).toBe(1);
		expect(store.listTasks("p1")[0].id).toBe(a.id);
		expect(store.listTasks("p2")[0].id).toBe(b.id);
	});

	it("updates a task and deletes a task", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { title: "Old", goal: "Old goal" });
		const updated = store.updateTask("p1", task.id, {
			title: "New Title",
			goal: "New goal",
		});
		expect(updated.title).toBe("New Title");
		expect(updated.goal).toBe("New goal");

		expect(store.deleteTask("p1", task.id)).toBe(true);
		expect(store.getTask("p1", task.id)).toBeUndefined();
	});

	it("jumps a task to any stage (non-linear failback)", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Jump", stageId: "1" });
		const moved = store.moveToStage("p1", task.id, "3", "Jumped");
		expect(moved.currentStageId).toBe("3");
		expect(moved.history.some((h) => h.action.includes("Jumped"))).toBe(true);
	});

	it("advances a task to the next stage and stops at the end", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Advance", stageId: "2" });
		const next = store.advanceStage("p1", task.id, stages);
		expect(next.currentStageId).toBe("3");

		const last = store.moveToStage("p1", task.id, "4");
		const atEnd = store.advanceStage("p1", last.id, stages);
		expect(atEnd.currentStageId).toBe("4");
	});

	it("records a real timeline entry on every stage transition (G1)", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Timeline", stageId: "1" });
		const moved = store.moveToStage("p1", task.id, "2", "Advanced");
		expect(Array.isArray(moved.timeline)).toBe(true);
		expect(moved.timeline.length).toBeGreaterThanOrEqual(1);
		const lastEntry = moved.timeline[moved.timeline.length - 1];
		expect(lastEntry.stage).toBe("2");
		expect(lastEntry.status).toBe("Advanced");

		const done = store.completeTask("p1", task.id);
		const completeEntry = done.timeline[done.timeline.length - 1];
		expect(completeEntry.status).toBe("Completed");
	});

	it("routes failback via the stage's policy (any -> explicit target)", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Review fail", stageId: "3" });
		const failed = store.failbackStage("p1", task.id, stages, "1");
		expect(failed.currentStageId).toBe("1");
		expect(failed.status).toBe("in_stage");
	});

	it("routes failback to start for the start policy", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Start fail", stageId: "1" });
		const failed = store.failbackStage("p1", task.id, stages);
		expect(failed.currentStageId).toBe("1");
	});

	it("aborts a task under the abort failback policy", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Abort", stageId: "4" });
		const failed = store.failbackStage("p1", task.id, stages);
		expect(failed.status).toBe("failed");
	});

	it("rejects a task with human feedback and routes back to previous stage", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			goal: "Initial implementation",
			stageId: "3",
		});
		const rejected = store.rejectTask(
			"p1",
			task.id,
			stages,
			"Fix error handling",
		);
		expect(rejected.currentStageId).toBe("2"); // previous of stage 3 is stage 2
		expect(rejected.feedback).toBe("Fix error handling");
		expect(rejected.goal).toContain("Human Correction / Feedback");
		expect(rejected.goal).toContain("Fix error handling");
		expect(rejected.history.some((h) => h.action.includes("Rejected"))).toBe(
			true,
		);
	});

	it("saves timestamped markdown report to ./docs/tasks/<taskID>/ and retrieves reports", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			goal: "Reporting task",
			stageId: "2",
		});
		const report = store.saveStageReport("p1", task.id, {
			stageName: "Plan",
			content: "# Plan\nImplementation steps...",
			projectCwd: tempCwd,
		});

		expect(report.stageSlug).toBe("plan");
		expect(report.path).toContain(`./docs/tasks/${task.id}/plan-`);
		expect(task.outputReport).toBe(report.path);
		expect(task.reports.length).toBe(1);

		// Verify on disk
		const reportFiles = fs
			.readdirSync(path.join(tempCwd, "docs", "tasks", task.id))
			.filter((f) => f !== "task.md");
		expect(reportFiles.length).toBe(1);
		expect(reportFiles[0].startsWith("plan-")).toBe(true);

		const retrieved = store.getTaskReports("p1", task.id, tempCwd);
		expect(retrieved.length).toBe(1);
		expect(retrieved[0].path).toBe(report.path);
	});

	it("accumulates and returns reports for every stage across multiple stages (#17)", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			goal: "Multi-stage reporting task",
			stageId: "1",
		});

		// Save stage 1 report
		const rep1 = store.saveStageReport("p1", task.id, {
			stageName: "Idea",
			content: "# Idea Stage\nConceived feature.",
			projectCwd: tempCwd,
		});

		// Save stage 2 report
		const rep2 = store.saveStageReport("p1", task.id, {
			stageName: "Planning",
			content: "# Planning Stage\nStructured architecture.",
			projectCwd: tempCwd,
		});

		// Save stage 3 report
		const rep3 = store.saveStageReport("p1", task.id, {
			stageName: "Implementation",
			content: "# Implementation Stage\nCode written.",
			projectCwd: tempCwd,
		});

		expect(task.reports.length).toBe(3);
		expect(task.outputReport).toBe(rep3.path);

		const retrieved = store.getTaskReports("p1", task.id, tempCwd);
		expect(retrieved.length).toBe(3);

		const filenames = retrieved.map((r) => r.filename || r.name);
		expect(filenames.some((f) => f.startsWith("idea-"))).toBe(true);
		expect(filenames.some((f) => f.startsWith("planning-"))).toBe(true);
		expect(filenames.some((f) => f.startsWith("implementation-"))).toBe(true);

		const contents = retrieved.map((r) => r.content);
		expect(contents).toContain("# Idea Stage\nConceived feature.");
		expect(contents).toContain("# Planning Stage\nStructured architecture.");
		expect(contents).toContain("# Implementation Stage\nCode written.");
	});

	it("routes failback directly to a target stage ID configured in stage.failback", () => {
		const customStages = [
			{ id: "idea", name: "Idea", type: "agent", failback: "start" },
			{ id: "plan", name: "Plan", type: "agent", failback: "idea" },
			{ id: "code", name: "Code", type: "agent", failback: "idea" },
		];
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Code task", stageId: "code" });
		const failed = store.failbackStage("p1", task.id, customStages);
		expect(failed.currentStageId).toBe("idea");
	});

	it("executes human stage and emits stage:enter and stage:checkpoint_wait", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", { goal: "Review task", stageId: "3" });
		const result = await store.executeStage("p1", task.id, { stages });
		expect(result.status).toBe("waiting_human");
		expect(result.stageType).toBe("human");
		expect(task.status).toBe("waiting_human");

		expect(emitted.some((e) => e.eventName === "stage:checkpoint_wait")).toBe(
			true,
		);
		expect(logText(task)).toContain("[HUMAN]");
	});

	it("executes CI stage successfully, emits process events and stage:complete", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const ciStages = [
			{
				id: "ci-1",
				name: "CI Test",
				type: "ci",
				command: "echo test",
				failback: "previous",
			},
			{ id: "done", name: "Done", type: "agent", failback: "start" },
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", { goal: "CI task", stageId: "ci-1" });

		const mockRunner = async (cmd, { onStdout }) => {
			onStdout?.(`Output for ${cmd}`);
			return {
				stdout: `Output for ${cmd}`,
				stderr: "",
				exitCode: 0,
			};
		};

		const result = await store.executeStage("p1", task.id, {
			stages: ciStages,
			projectCwd: tempCwd,
			execRunner: mockRunner,
		});

		expect(result.status).toBe("passed");
		expect(result.exitCode).toBe(0);
		expect(task.currentStageId).toBe("done"); // auto-advanced
		expect(task.reports.length).toBe(1);

		expect(emitted.some((e) => e.eventName === "process:start")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:stdout")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:exit")).toBe(true);
		expect(emitted.some((e) => e.eventName === "stage:complete")).toBe(true);
		expect(logText(task)).toContain("[CI/CMD]");
	});

	it("executes CI stage failure, emits process:stderr and stage:failback", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const ciStages = [
			{ id: "dev", name: "Development", type: "agent", failback: "start" },
			{
				id: "ci-1",
				name: "CI Test",
				type: "ci",
				command: "npm test",
				failback: "dev",
			},
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", { goal: "CI task", stageId: "ci-1" });

		const mockRunner = async () => {
			const err = new Error("Command failed");
			err.code = 1;
			err.stdout = "";
			err.stderr = "SyntaxError in tests";
			throw err;
		};

		const result = await store.executeStage("p1", task.id, {
			stages: ciStages,
			projectCwd: tempCwd,
			execRunner: mockRunner,
		});

		expect(result.status).toBe("retrying");
		expect(result.exitCode).toBe(1);
		expect(task.currentStageId).toBe("dev"); // failed back to dev stage
		expect(task.status).toBe("in_stage"); // left for automatic re-execution

		expect(emitted.some((e) => e.eventName === "process:stderr")).toBe(true);
		expect(emitted.some((e) => e.eventName === "stage:failback")).toBe(true);
		expect(logText(task)).toContain("[ERROR]");
	});

	it("reports CI failure reason to the failback model's re-run prompt", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const stages = [
			{ id: "dev", name: "Development", type: "agent", failback: "start" },
			{
				id: "ci-1",
				name: "CI Test",
				type: "ci",
				command: "npm test",
				failback: "dev",
			},
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		store.startScheduler();
		const task = store.createTask("p1", { goal: "CI task", stageId: "ci-1" });

		const mockCiRunner = async () => {
			const err = new Error("Command failed");
			err.code = 1;
			err.stdout = "";
			err.stderr = "SyntaxError in tests: missing semicolon on line 42";
			throw err;
		};

		// 1. CI stage fails and routes the task back to the 'dev' stage.
		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			execRunner: mockCiRunner,
		});
		expect(task.currentStageId).toBe("dev");

		// 2. Scheduler re-runs the 'dev' agent stage. Capture the prompt that is
		//    handed to the model so we can assert the CI failure was surfaced.
		let reRunPrompt = null;
		const mockAgentRunner = async (prompt) => {
			reRunPrompt = prompt;
			return "# Stage Output\nFixed the code.";
		};

		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: mockAgentRunner,
		});

		// The re-run model must learn WHY the CI stage rejected the work.
		expect(reRunPrompt).toBeTruthy();
		expect(reRunPrompt).toContain("CI Test");
		expect(reRunPrompt).toContain("ci");
		expect(reRunPrompt).toContain(
			"SyntaxError in tests: missing semicolon on line 42",
		);
		store.stopScheduler();
	});

	it("executes a deploy-command CI stage successfully (exit 0), generates CI report, and advances", async () => {
		// A ci stage whose command runs the deploy script is an ordinary ci
		// stage: CI report, CI log tag, CI stage type.
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const deployStages = [
			{
				id: "deploy-1",
				name: "Production Deploy",
				type: "ci",
				command: "./deploy.sh --prod",
				failback: "previous",
			},
			{ id: "done", name: "Completed", type: "human", failback: "any" },
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			goal: "Deploy task",
			stageId: "deploy-1",
		});

		let executedCommand = null;
		const mockRunner = async (cmd) => {
			executedCommand = cmd;
			return {
				stdout: "Deploying build #B42... OK",
				stderr: "",
				exitCode: 0,
			};
		};

		const result = await store.executeStage("p1", task.id, {
			stages: deployStages,
			projectCwd: tempCwd,
			execRunner: mockRunner,
		});

		expect(result.status).toBe("passed");
		expect(result.exitCode).toBe(0);
		expect(result.stageType).toBe("ci");
		expect(executedCommand).toBe("./deploy.sh --prod");
		expect(task.currentStageId).toBe("done"); // auto-advanced
		expect(task.reports.length).toBe(1);
		expect(task.reports[0].content).toContain("# CI Stage Report");
		expect(task.reports[0].content).toContain("Deploying build #B42... OK");

		expect(emitted.some((e) => e.eventName === "process:start")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:stdout")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:exit")).toBe(true);
		expect(emitted.some((e) => e.eventName === "stage:complete")).toBe(true);
		expect(logText(task)).toContain("[CI/CMD]");
	});

	it("command stages pass the user session bus env to the spawned shell (systemd --user tooling)", async () => {
		// Regression: the sanitized env used to drop DBUS_SESSION_BUS_ADDRESS and
		// XDG_RUNTIME_DIR, which made the post-merge `./deploy.sh --prod` fail
		// instantly — its systemd-run re-exec could not connect to the user
		// scope bus. The spawned command must see the vars (preserved from the
		// runner env, or derived from the standard per-uid runtime dir).
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ eventName, payload });
			},
		};
		const envStages = [
			{
				id: "env-probe",
				name: "Env Probe",
				type: "ci",
				command:
					'printf "XDG=%s\\nDBUS=%s\\nTASK_ID=%s\\nPROJECT_CWD=%s\\n" "$XDG_RUNTIME_DIR" "$DBUS_SESSION_BUS_ADDRESS" "$TASK_ID" "$PROJECT_CWD"',
				failback: "previous",
			},
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			goal: "Env preservation probe",
			stageId: "env-probe",
		});

		const collectedStdout = () =>
			emitted
				.filter((e) => e.eventName === "process:stdout")
				.map((e) => e.payload.chunk)
				.join("");

		const savedXdg = process.env.XDG_RUNTIME_DIR;
		const savedBus = process.env.DBUS_SESSION_BUS_ADDRESS;
		try {
			// Phase 1 — fallback: neither var present in the runner env.
			delete process.env.XDG_RUNTIME_DIR;
			delete process.env.DBUS_SESSION_BUS_ADDRESS;
			const uid =
				typeof process.getuid === "function" ? process.getuid() : 1000;
			let result = await store.executeStage("p1", task.id, {
				stages: envStages,
				projectCwd: tempCwd,
			});
			expect(result.status).toBe("passed");
			let stdout = collectedStdout();
			expect(stdout).toContain(`XDG=/run/user/${uid}`);
			expect(stdout).toContain(`DBUS=unix:path=/run/user/${uid}/bus`);
			expect(stdout).toContain(`TASK_ID=${task.id}`);
			expect(stdout).toContain(`PROJECT_CWD=${tempCwd}`);

			// Phase 2 — passthrough: vars present in the runner env are preserved
			// verbatim instead of being overwritten by the derived fallback.
			process.env.XDG_RUNTIME_DIR = "/run/user/9999";
			process.env.DBUS_SESSION_BUS_ADDRESS = "unix:path=/run/user/9999/bus";
			emitted.length = 0;
			result = await store.executeStage("p1", task.id, {
				stages: envStages,
				projectCwd: tempCwd,
			});
			expect(result.status).toBe("passed");
			stdout = collectedStdout();
			expect(stdout).toContain("XDG=/run/user/9999");
			expect(stdout).toContain("DBUS=unix:path=/run/user/9999/bus");
		} finally {
			if (savedXdg === undefined) {
				delete process.env.XDG_RUNTIME_DIR;
			} else {
				process.env.XDG_RUNTIME_DIR = savedXdg;
			}
			if (savedBus === undefined) {
				delete process.env.DBUS_SESSION_BUS_ADDRESS;
			} else {
				process.env.DBUS_SESSION_BUS_ADDRESS = savedBus;
			}
		}
	});

	it("executes a deploy-command CI stage failure, triggers failback routing without crashing", async () => {
		// A failed deploy-command ci stage falls back to its configured
		// fallback stage exactly like any other ci stage.
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
			emitNotification: () => {},
			emitSystemLog: () => {},
		};
		const deployStages = [
			{ id: "verify", name: "Verification", type: "ci", failback: "start" },
			{
				id: "deploy-1",
				name: "Production Deploy",
				type: "ci",
				command: "./deploy.sh --prod",
				failback: "verify",
			},
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			goal: "Deploy task failure",
			stageId: "deploy-1",
		});

		const mockRunner = async () => {
			const err = new Error("Health check failed on production port");
			err.code = 2;
			err.stdout = "Service restart failed";
			err.stderr = "Health check timed out after 30s";
			throw err;
		};

		const result = await store.executeStage("p1", task.id, {
			stages: deployStages,
			projectCwd: tempCwd,
			execRunner: mockRunner,
		});

		expect(result.status).toBe("retrying");
		expect(result.exitCode).toBe(2);
		expect(result.stageType).toBe("ci");
		expect(task.currentStageId).toBe("verify"); // routed back to verify stage
		expect(task.status).toBe("in_stage"); // left for automatic re-execution

		expect(emitted.some((e) => e.eventName === "process:stderr")).toBe(true);
		expect(emitted.some((e) => e.eventName === "stage:failback")).toBe(true);
		expect(logText(task)).toContain("[CI/CMD]");
		expect(logText(task)).toContain("[ERROR]");
	});

	it("reconcileInterruptedDeploys delegates to lifecycle plugins (no-op without plugins)", async () => {
		// Cross-restart deploy reconciliation is implementation-specific
		// continuity: the generic store delegates to registered lifecycle
		// plugins via `runInterruptionReconcilePlugins`. With no plugins
		// installed (the generic-project default) it returns an empty list
		// and never touches task state — a deploy-command ci stage is an
		// ordinary ci stage that re-dispatches normally.
		const deployStages = [
			{
				id: "deploy-1",
				name: "Production Deploy",
				type: "ci",
				command: "./deploy.sh --prod",
				failback: "previous",
			},
			{ id: "done", name: "Completed", type: "human", failback: "any" },
		];
		const mockProjectStore = {
			listProjects: () => [{ id: "p1", cwd: tempCwd, stages: deployStages }],
			getProject: () => ({ id: "p1", cwd: tempCwd, stages: deployStages }),
		};
		const store = new TaskStore({ projectStore: mockProjectStore });
		const task = store.createTask("p1", {
			goal: "Deploy task",
			stageId: "deploy-1",
		});
		store.updateTask("p1", task.id, {
			status: "interrupted",
			wasInterrupted: true,
			enteredStageAt: new Date(Date.now() - 60000).toISOString(),
		});

		// Even with a deploy manager present, no plugin is registered so
		// nothing reconciles: the task stays interrupted for the ordinary
		// auto-resume path (ci stages are auto-resumable).
		store.deployManager = {
			readJson: () => ({
				status: "success",
				buildNumber: 42,
				startedAt: new Date(Date.now() - 50000).toISOString(),
				finishedAt: new Date(Date.now() - 10000).toISOString(),
			}),
		};

		const reconciled = await store.reconcileInterruptedDeploys();

		expect(reconciled).toEqual([]);
		const updated = store.getTask("p1", task.id);
		expect(updated.currentStageId).toBe("deploy-1"); // not advanced
		expect(updated.status).toBe("interrupted");
	});

	it("kills a running CI child process (and its process group) via killTaskProcess", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
			emitSystemLog: () => {},
			emitNotification: () => {},
		};
		const ciStages = [
			{
				id: "ci-1",
				name: "CI Long",
				type: "ci",
				command: "sleep 30",
				failback: "start",
			},
			{ id: "done", name: "Done", type: "human", failback: "any" },
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			goal: "CI long task",
			stageId: "ci-1",
		});

		// Run the CI stage in the background (it spawns a real `sleep 30`).
		const runPromise = store.executeStage("p1", task.id, {
			stages: ciStages,
			projectCwd: tempCwd,
		});

		// Wait for the child process to be registered.
		let child = null;
		for (let i = 0; i < 100; i++) {
			child = store._activeChildren.get(task.id);
			if (child) break;
			await new Promise((r) => setTimeout(r, 20));
		}
		expect(child).toBeTruthy();
		expect(typeof child.pid).toBe("number");

		// Kill it and verify the process group is gone.
		const killed = store.killTaskProcess(task.id);
		expect(killed).toBe(true);

		const result = await runPromise;
		// Killed by signal -> treated as a failure (exit 1), not a pass. With
		// auto-iteration enabled it is routed back and left for re-execution.
		expect(result.status).toBe("retrying");
		expect(result.exitCode).toBe(1);
	});

	it("executes agent stage and sets in_stage status with model", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const agentStages = [
			{
				id: "agent-1",
				name: "Idea Stage",
				type: "agent",
				prompt: "Brainstorm features",
				model: "gemini-2.5-pro",
				failback: "start",
			},
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			goal: "Agent task",
			stageId: "agent-1",
		});
		const result = await store.executeStage("p1", task.id, {
			stages: agentStages,
		});

		expect(result.status).toBe("in_stage");
		expect(result.stageType).toBe("agent");
		expect(result.model).toBe("gemini-2.5-pro");
		expect(emitted.some((e) => e.eventName === "stage:enter")).toBe(true);
		expect(logText(task)).toContain("[AGENT]");
	});

	describe("harness-aware session-init log", () => {
		/***
		 * Harness identity metadata (see api/agent/harnessContract.js) drives the
		 * session-init system log, so the engine never hard-codes a vendor name.
		 ***/
		function makeHarnessAwareStore(harnessOrStore) {
			const systemLogs = [];
			const mockBridge = {
				emitProcessEvent: () => {},
				emitSystemLog: (_projectId, message, payload) => {
					systemLogs.push({ message, payload });
				},
			};
			const sessionStore =
				harnessOrStore === undefined
					? null
					: harnessOrStore.hasOwnProperty("getHarness")
						? harnessOrStore
						: { getHarness: () => harnessOrStore };
			const store = new TaskStore({ eventBridge: mockBridge });
			if (sessionStore) store.sessionStore = sessionStore;
			return { store, systemLogs };
		}

		async function runAgentStage(store) {
			const agentStages = [
				{
					id: "agent-1",
					name: "Idea Stage",
					type: "agent",
					prompt: "Brainstorm features",
					model: "claude-3-7-sonnet",
					failback: "start",
				},
			];
			const task = store.createTask("p1", {
				goal: "Agent task",
				stageId: "agent-1",
			});
			// No agentRunner: the session-init log is still emitted before the
			// "No agentRunner available" fallback, which keeps the test focused
			// on the log prose without invoking any agent.
			return { task, result: await store.executeStage("p1", task.id, { stages: agentStages }) };
		}

		it("composes the session-init log from the harness's own identity metadata", async () => {
			const { store, systemLogs } = makeHarnessAwareStore({
				name: "pi",
				label: "Pi",
			});
			const { result } = await runAgentStage(store);

			expect(result.status).toBe("in_stage");
			const initLog = systemLogs.find((l) =>
				l.message.includes("Initializing agent session"),
			);
			expect(initLog).toBeDefined();
			expect(initLog.message).toBe(
				"[SYSTEM] Initializing agent session (harness: pi, Model: claude-3-7-sonnet)...",
			);
			// No vendor hard-code may appear in engine log prose.
			expect(initLog.message).not.toMatch(/Pi Agent session/);
			// The [SYSTEM] tag grammar and trailing Model: field are unchanged.
			expect(initLog.message).toMatch(/^\[SYSTEM\] /);
			expect(initLog.message).toContain("Model: claude-3-7-sonnet");
			expect(initLog.payload).toEqual({
				taskId: expect.any(String),
				stageId: "agent-1",
				model: "claude-3-7-sonnet",
			});
		});

		it("falls back to the neutral 'agent' label when no session store is wired", async () => {
			const { store, systemLogs } = makeHarnessAwareStore();
			await runAgentStage(store);

			const initLog = systemLogs.find((l) =>
				l.message.includes("Initializing agent session"),
			);
			expect(initLog.message).toBe(
				"[SYSTEM] Initializing agent session (harness: agent, Model: claude-3-7-sonnet)...",
			);
		});

		it("falls back to the neutral 'agent' label when the harness cannot be asked", async () => {
			const { store, systemLogs } = makeHarnessAwareStore({
				getHarness() {
					throw new Error("harness exploded");
				},
			});
			// A throwing harness must degrade the log wording, not crash the stage.
			await expect(runAgentStage(store)).resolves.toBeDefined();

			const initLog = systemLogs.find((l) =>
				l.message.includes("Initializing agent session"),
			);
			expect(initLog.message).toBe(
				"[SYSTEM] Initializing agent session (harness: agent, Model: claude-3-7-sonnet)...",
			);
		});
	});

	it("deduplicates rapid task creation with same idempotencyKey or identical fields", () => {
		const store = new TaskStore();
		const task1 = store.createTask("p1", {
			title: "Dedupe Title",
			goal: "Dedupe Goal",
			stageId: "1",
			idempotencyKey: "idem-123",
		});
		const task2 = store.createTask("p1", {
			title: "Dedupe Title",
			goal: "Dedupe Goal",
			stageId: "1",
			idempotencyKey: "idem-123",
		});
		expect(task1.id).toBe(task2.id);
		expect(store.listTasks("p1").length).toBe(1);

		// Deduplication without idempotencyKey within rapid window
		const task3 = store.createTask("p1", {
			title: "Window Dedupe",
			goal: "Window Goal",
			stageId: "1",
		});
		const task4 = store.createTask("p1", {
			title: "Window Dedupe",
			goal: "Window Goal",
			stageId: "1",
		});
		expect(task3.id).toBe(task4.id);
		expect(store.listTasks("p1").length).toBe(2);
	});

	it("persists task.md to disk on creation, transition, and completion", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Disk Task",
			goal: "Verify disk persistence",
			stageId: "1",
			workflowId: "wf-feature-1",
			projectCwd: tempCwd,
		});
		expect(task.workflowId).toBe("wf-feature-1");

		const taskMdPath = path.join(tempCwd, "docs", "tasks", task.id, "task.md");
		expect(fs.existsSync(taskMdPath)).toBe(true);
		let content = fs.readFileSync(taskMdPath, "utf8");
		expect(content).toContain(`id: "${task.id}"`);
		expect(content).toContain('workflowId: "wf-feature-1"');
		expect(content).toContain("Verify disk persistence");
		expect(content).toContain("Created and placed in stage '1'");

		// Advance and verify task.md updated
		store.advanceStage("p1", task.id, stages, undefined, tempCwd);
		content = fs.readFileSync(taskMdPath, "utf8");
		expect(content).toContain('currentStageId: "2"');
		expect(content).toContain('workflowId: "wf-feature-1"');
		expect(content).toContain("Advanced to stage '2'");

		// Complete and verify task.md updated
		store.completeTask("p1", task.id, tempCwd);
		content = fs.readFileSync(taskMdPath, "utf8");
		expect(content).toContain('status: "completed"');
		expect(content).toContain('workflowId: "wf-feature-1"');
	});

	it("rehydrates tasks and reports from disk via scanTasks", () => {
		const storeA = new TaskStore();
		const taskA = storeA.createTask("p1", {
			title: "Hydrate Me",
			goal: "Test scanning from disk",
			stageId: "2",
			projectCwd: tempCwd,
		});

		// Save a report
		storeA.saveStageReport("p1", taskA.id, {
			stageName: "Plan",
			content: "# Plan Report\nStep 1...",
			projectCwd: tempCwd,
		});

		// Create a completely new store instance with no in-memory state
		const storeB = new TaskStore();
		expect(storeB.getTask("p1", taskA.id)).toBeUndefined();

		const rehydrated = storeB.scanTasks("p1", tempCwd);
		expect(rehydrated.length).toBe(1);
		expect(rehydrated[0].id).toBe(taskA.id);
		expect(rehydrated[0].title).toBe("Hydrate Me");
		expect(rehydrated[0].goal).toBe("Test scanning from disk");
		expect(rehydrated[0].currentStageId).toBe("2");
		expect(rehydrated[0].reports.length).toBe(1);
		expect(rehydrated[0].reports[0].stageSlug).toBe("plan");

		// Retrieve reports with content
		const reports = storeB.getTaskReports("p1", taskA.id, tempCwd);
		expect(reports.length).toBe(1);
		expect(reports[0].content).toContain("# Plan Report");
	});

	it("executes agent stage with agentRunner, streams events, saves report, and auto-advances", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
		};
		const agentStages = [
			{
				id: "1",
				name: "Idea",
				type: "agent",
				prompt: "Generate feature idea",
				failback: "start",
				report: true,
			},
			{
				id: "2",
				name: "Plan",
				type: "agent",
				prompt: "Plan implementation",
				failback: "previous",
				report: true,
			},
		];
		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			goal: "Agent stage test",
			stageId: "1",
			projectCwd: tempCwd,
		});

		const mockAgentRunner = async (prompt, { onChunk }) => {
			onChunk("Thinking...");
			onChunk(" Generated spec.");
			return "# Stage Output\nIdea defined.";
		};

		const result = await store.executeStage("p1", task.id, {
			stages: agentStages,
			projectCwd: tempCwd,
			agentRunner: mockAgentRunner,
		});

		expect(result.status).toBe("passed");
		expect(result.stageType).toBe("agent");
		expect(result.output).toBe("# Stage Output\nIdea defined.");

		// Task should have auto-advanced to stage 2
		expect(task.currentStageId).toBe("2");
		expect(task.reports.length).toBe(1);
		expect(task.reports[0].stageSlug).toBe("idea");

		// Verify report file exists on disk with content
		const reports = store.getTaskReports("p1", task.id, tempCwd);
		expect(reports.length).toBe(1);
		expect(reports[0].content).toContain("# Stage Output");

		// Verify event sequence. Agent reasoning/tool chunks are streamed to the
		// UI through the structured MSG_UPDATE / TOOL_* events, so they must NOT
		// be re-emitted as raw process:stdout (that would duplicate every token
		// in the activity console). They still accumulate into the task's
		// structured logEntries for the stage report and per-task detail view.
		expect(emitted.some((e) => e.eventName === "stage:enter")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:start")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:stdout")).toBe(false);
		expect(emitted.some((e) => e.eventName === "process:exit")).toBe(true);
		expect(emitted.some((e) => e.eventName === "stage:complete")).toBe(true);
		expect(logText(task)).toContain("Thinking...");
		expect(logText(task)).toContain("Generated spec.");
	});

	it("completes a task", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Done", stageId: "1" });
		const done = store.completeTask("p1", task.id);
		expect(done.status).toBe("completed");
	});

	it("returns null for unknown tasks on transitions", () => {
		const store = new TaskStore();
		expect(store.advanceStage("p1", "nope", stages)).toBeNull();
		expect(store.completeTask("p1", "nope")).toBeNull();
		expect(store.deleteTask("p1", "nope")).toBe(false);
	});

	it("tracks global engine state transitions (idle -> running -> checkpoint -> paused)", async () => {
		const store = new TaskStore();
		expect(store.getEngineState().status).toBe("idle");

		const task = store.createTask("p1", { goal: "Engine test", stageId: "1" });
		const checkpointStages = [
			{ id: "1", name: "Review", type: "human", failback: "start" },
		];

		await store.executeStage("p1", task.id, { stages: checkpointStages });
		expect(store.getEngineState().status).toBe("checkpoint");
		expect(store.getEngineState().activeTaskId).toBe(task.id);

		// Moving task resets checkpoint state to idle
		store.moveToStage("p1", task.id, "1");
		expect(store.getEngineState().status).toBe("idle");
	});

	it("returns paused status and updates engine state when stage is paused", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Paused test", stageId: "p-stage" });
		const pausedStages = [
			{ id: "p-stage", name: "Paused Stage", type: "agent", paused: true },
		];

		const result = await store.executeStage("p1", task.id, { stages: pausedStages });
		expect(result.status).toBe("paused");
		expect(store.getEngineState().status).toBe("paused");
		expect(store.getEngineState().activeTaskId).toBe(task.id);
	});

	it("serializes agent stage execution globally across projects", async () => {
		const store = new TaskStore();
		const executionOrder = [];

		const taskA = store.createTask("p1", { goal: "Task A", stageId: "1" });
		const taskB = store.createTask("p2", { goal: "Task B", stageId: "1" });

		const agentStages = [
			{ id: "1", name: "Agent Stage", type: "agent", failback: "start" },
		];

		const runnerA = async () => {
			executionOrder.push("A_start");
			await new Promise((r) => setTimeout(r, 20));
			executionOrder.push("A_end");
			return "Output A";
		};

		const runnerB = async () => {
			executionOrder.push("B_start");
			await new Promise((r) => setTimeout(r, 10));
			executionOrder.push("B_end");
			return "Output B";
		};

		// Launch both simultaneously
		const promiseA = store.executeStage("p1", taskA.id, {
			stages: agentStages,
			agentRunner: runnerA,
		});
		const promiseB = store.executeStage("p2", taskB.id, {
			stages: agentStages,
			agentRunner: runnerB,
		});

		await Promise.all([promiseA, promiseB]);

		// Must execute strictly sequentially: A finishes before B starts
		expect(executionOrder).toEqual(["A_start", "A_end", "B_start", "B_end"]);
		expect(store.getEngineState().status).toBe("idle");
	});

	it("prioritizes high priority jobs ahead of waiting normal jobs without interrupting active job", async () => {
		const store = new TaskStore();
		const executionOrder = [];

		const taskA = store.createTask("p1", { goal: "Task A", stageId: "1" });
		const taskB = store.createTask("p1", { goal: "Task B", stageId: "1" });
		const taskC = store.createTask("p1", { goal: "Task C", stageId: "1" });

		const stages = [
			{ id: "1", name: "Agent Stage", type: "agent", failback: "start" },
		];

		const runnerA = async () => {
			executionOrder.push("A_start");
			await new Promise((r) => setTimeout(r, 30));
			executionOrder.push("A_end");
			return "Output A";
		};

		const runnerB = async () => {
			executionOrder.push("B_start");
			await new Promise((r) => setTimeout(r, 10));
			executionOrder.push("B_end");
			return "Output B";
		};

		const runnerC = async () => {
			executionOrder.push("C_start");
			await new Promise((r) => setTimeout(r, 10));
			executionOrder.push("C_end");
			return "Output C";
		};

		// Enqueue A (normal priority)
		const promiseA = store.executeStage("p1", taskA.id, {
			stages,
			agentRunner: runnerA,
			priority: "normal",
		});

		// Enqueue B (normal priority) while A is active
		const promiseB = store.executeStage("p1", taskB.id, {
			stages,
			agentRunner: runnerB,
			priority: "normal",
		});

		// Enqueue C ("Run Now" - high priority) while A is still active
		const promiseC = store.executeStage("p1", taskC.id, {
			stages,
			agentRunner: runnerC,
			priority: "high",
		});

		await Promise.all([promiseA, promiseB, promiseC]);

		// Execution order: A runs first (active), then C (high priority), then B (normal priority)
		expect(executionOrder).toEqual([
			"A_start",
			"A_end",
			"C_start",
			"C_end",
			"B_start",
			"B_end",
		]);
	});

	it("generates structured markdown report with summary of changes, modified files, and verification", () => {
		const task = { id: "t-1", title: "Add auth endpoint", goal: "Implement JWT" };
		const stage = { id: "code", name: "Coding Stage", type: "agent", model: "claude-3-7-sonnet" };
		const markdown = generateStageReportContent({
			task,
			stage,
			output: "Code written successfully",
			summary: "Added login and refresh tokens",
			modifiedFiles: ["api/auth.js", "api/auth.test.js"],
			status: "PASSED",
			duration: "2.4",
		});

		expect(markdown).toContain("# Stage Report: Coding Stage");
		expect(markdown).toContain("### Summary of Changes");
		expect(markdown).toContain("Added login and refresh tokens");
		expect(markdown).toContain("### Execution Output");
		expect(markdown).toContain("Code written successfully");
		expect(markdown).toContain("### Modified Files");
		expect(markdown).toContain("- `api/auth.js`");
		expect(markdown).toContain("- `api/auth.test.js`");
		expect(markdown).toContain("### Verification Status");
		expect(markdown).toContain("Stage execution completed successfully");
	});

	it("tags auto-generated reports and distinguishes manually-written ones (#auto-reports)", () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			goal: "Auto report tagging task",
			stageId: "1",
		});

		// Auto-generated content carries the marker -> auto: true
		const autoContent = generateStageReportContent({
			task,
			stage: { id: "1", name: "Idea", type: "agent" },
			summary: "Generated by engine",
		});
		const autoReport = store.saveStageReport("p1", task.id, {
			stageName: "Idea",
			content: autoContent,
			projectCwd: tempCwd,
		});
		expect(autoReport.auto).toBe(true);

		// Manual content (no marker) -> auto: false
		const manualReport = store.saveStageReport("p1", task.id, {
			stageName: "Notes",
			content: "# Manual notes",
			auto: false,
			projectCwd: tempCwd,
		});
		expect(manualReport.auto).toBe(false);

		// Marker survives rehydration from disk
		const rehydrated = store.getTaskReports("p1", task.id, tempCwd);
		const autoOnDisk = rehydrated.find((r) => r.stageName === "Idea");
		expect(autoOnDisk.auto).toBe(true);
	});

	it("executes agent stage with agentRunner output object, writes rich report, and auto-advances", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Rich Report Task",
			goal: "Test structured reports",
			stageId: "1",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "1", name: "Architect", type: "agent", failback: "start", report: true },
			{ id: "2", name: "Implement", type: "agent", failback: "1", report: true },
		];

		const runner = async () => {
			return {
				summary: "Designed component layout and props schema.",
				output: "Generated architectural diagram and contracts.",
				modifiedFiles: ["src/Layout.jsx", "src/types.d.ts"],
			};
		};

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: runner,
		});

		expect(result.status).toBe("passed");
		expect(result.summary).toBe("Designed component layout and props schema.");
		expect(result.modifiedFiles).toEqual(["src/Layout.jsx", "src/types.d.ts"]);
		expect(task.currentStageId).toBe("2");

		const reports = store.getTaskReports("p1", task.id, tempCwd);
		expect(reports.length).toBe(1);
		expect(reports[0].content).toContain("### Summary of Changes");
		expect(reports[0].content).toContain("Designed component layout and props schema.");
		expect(reports[0].content).toContain("- `src/Layout.jsx`");
		expect(reports[0].content).toContain("### Verification Status");
	});

	it("handles agent failure via handleStageFailure and routes to fallbackStageId with failure report", async () => {
		const emitted = [];
		const mockBridge = {
			emitProcessEvent: (projId, eventName, payload) => {
				emitted.push({ projId, eventName, payload });
			},
			emitSystemLog: (projId, msg, payload) => {
				emitted.push({ projId, eventName: "system:log", msg, payload });
			},
		};

		const store = new TaskStore({ eventBridge: mockBridge });
		const task = store.createTask("p1", {
			title: "Failing Agent Task",
			goal: "Test failure routing",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const runner = async () => {
			throw new Error("Implementation incomplete: missing tests");
		};

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: runner,
		});

		// With auto-iteration enabled (default), a failed stage is routed back to
		// its failback stage and left in_stage so the scheduler re-runs it, rather
		// than being parked as 'failed' waiting for a human.
		// (WP2: this is an ordinary logical failure. A context-overflow
		// error — e.g. the old "Out of tokens / context window exceeded"
		// text — now fails back with compaction hints instead of
		// auto-retrying, and is covered in taskErrors.taxonomy.test.js.)
		expect(result.status).toBe("retrying");
		expect(result.autoIteration).toBe(true);
		expect(result.attempt).toBe(1);
		expect(result.error).toContain("missing tests");
		expect(task.currentStageId).toBe("design"); // routed to fallbackStageId
		expect(task.status).toBe("in_stage"); // left for automatic re-execution
		expect(task.autoRetrying).toBe(true);
		expect(task.autoIterationCount).toBe(1);

		// Verify failure report generated on disk
		const reports = store.getTaskReports("p1", task.id, tempCwd);
		expect(reports.length).toBe(1);
		expect(reports[0].content).toContain("# Stage Report: Implementation");
		expect(reports[0].content).toContain("**Status:** FAILED");
		expect(reports[0].content).toContain("Implementation incomplete: missing tests");
		expect(reports[0].content).toContain("Triggered fallback routing");

		// Verify emitted events
		expect(emitted.some((e) => e.eventName === "process:stderr")).toBe(true);
		expect(emitted.some((e) => e.eventName === "process:exit" && e.payload.exitCode === 1)).toBe(true);
		expect(emitted.some((e) => e.eventName === "stage:failback" && e.payload.targetStageId === "design")).toBe(true);
	});

	it("parks a task as failed once the auto-iteration budget is exhausted", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Budget Exhaustion Task",
			goal: "Test loop prevention",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const runner = async () => {
			throw new Error("Persistent failure");
		};

		const originalMax = config.maxAutoIterations;
		config.maxAutoIterations = 2;
		try {
			// Attempt 1 and 2 stay within budget -> auto-retry.
			const r1 = await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(r1.status).toBe("retrying");
			expect(r1.attempt).toBe(1);
			expect(task.status).toBe("in_stage");

			const r2 = await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(r2.status).toBe("retrying");
			expect(r2.attempt).toBe(2);

			// Attempt 3 exceeds the budget -> parked as failed for human intervention.
			const r3 = await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(r3.status).toBe("failed");
			expect(task.status).toBe("failed");
			expect(task.autoRetrying).toBe(false);
			expect(task.autoIterationCount).toBe(3);
			expect(task.failureReason).toContain("Persistent failure");
		} finally {
			config.maxAutoIterations = originalMax;
		}
	});

	it("resets the auto-iteration budget on manual retry", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Retry Reset Task",
			goal: "Test budget reset on manual retry",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const runner = async () => {
			throw new Error("Persistent failure");
		};

		const originalMax = config.maxAutoIterations;
		config.maxAutoIterations = 1;
		try {
			// First failure consumes the budget (count 1 <= 1) -> auto-retry.
			await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.status).toBe("in_stage");
			expect(task.autoIterationCount).toBe(1);

			// Second failure exceeds the budget -> parked as failed.
			await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.status).toBe("failed");
			expect(task.autoIterationCount).toBe(2);

			// A manual retry resets the budget, so the next failure auto-retries again.
			await store.retryStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.autoIterationCount).toBe(1);
			expect(task.autoRetrying).toBe(true);
			expect(task.status).toBe("in_stage");
		} finally {
			config.maxAutoIterations = originalMax;
		}
	});

	it("restarts the transient-retry loop and the stage clock on manual retry", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Retry Transient Reset Task",
			goal: "Test transient and clock reset on manual retry",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const transientRunner = async () => {
			throw new Error("[Timeout Error] model connection timed out");
		};

		const originalTransient = config.maxTransientRetries;
		config.maxTransientRetries = 2;
		try {
			// Simulate a task parked after transient-budget exhaustion with a stale clock.
			task.status = "failed";
			task.infraRetryCount = 3;
			task.failureReason = "[Timeout Error] model connection timed out";
			task.enteredStageAt = "2026-01-01T00:00:00.000Z";
			task.timeInStage = 4567;

			// A manual retry restarts the transient loop from attempt 1, not at the cap.
			await store.retryStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: transientRunner,
			});
			expect(task.infraRetryCount).toBe(1);
			expect(task.autoRetrying).toBe(true);
			expect(task.status).toBe("in_stage");
			expect(task.timeInStage).toBe(0);
			expect(Date.parse(task.enteredStageAt)).toBeGreaterThan(
				Date.parse("2026-01-01T00:00:00.000Z"),
			);
		} finally {
			config.maxTransientRetries = originalTransient;
		}
	});

	it("does not reset budgets on plain execute", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Execute Keeps Counting Task",
			goal: "Prove execute continues the current budget instead of restarting it",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const runner = async () => {
			throw new Error("Persistent failure");
		};

		const originalMax = config.maxAutoIterations;
		config.maxAutoIterations = 10;
		try {
			// Mid-budget counters keep counting from their current values:
			// execute never restarts the budget (scheduler-safe).
			task.autoIterationCount = 2;
			task.infraRetryCount = 1;

			await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.autoIterationCount).toBe(3);
			expect(task.infraRetryCount).toBe(1);
			expect(task.status).toBe("in_stage");
		} finally {
			config.maxAutoIterations = originalMax;
		}
	});

	it("governs parking vs auto-retry from the project budget", async () => {
		const project = {
			id: "p1",
			name: "Budgeted Project",
			cwd: tempCwd,
			stages: [
				{ id: "design", name: "Design", type: "agent", failback: "start" },
				{
					id: "impl",
					name: "Implementation",
					type: "agent",
					fallbackStageId: "design",
				},
			],
			maxAutoIterations: 1,
		};
		const store = new TaskStore({
			projectStore: { getProject: () => project },
		});
		const task = store.createTask("p1", {
			title: "Project Budget Task",
			goal: "Prove the project budget parks the task",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const runner = async () => {
			throw new Error("Persistent failure");
		};

		const originalMax = config.maxAutoIterations;
		config.maxAutoIterations = 8;
		try {
			// First failure consumes the project budget (count 1 <= 1) -> auto-retry.
			await store.executeStage("p1", task.id, {
				stages: project.stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.status).toBe("in_stage");
			expect(task.autoIterationCount).toBe(1);

			// Second failure exceeds the project budget of 1 -> parked as failed,
			// even though the global budget (8) still has room.
			await store.executeStage("p1", task.id, {
				stages: project.stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.status).toBe("failed");
			expect(task.autoIterationCount).toBe(2);
		} finally {
			config.maxAutoIterations = originalMax;
		}
	});

	it("parks immediately when the project disables auto-iteration", async () => {
		const project = {
			id: "p1",
			name: "Manual Project",
			cwd: tempCwd,
			stages: [{ id: "impl", name: "Implementation", type: "agent" }],
			autoIterationEnabled: false,
		};
		const store = new TaskStore({
			projectStore: { getProject: () => project },
		});
		const task = store.createTask("p1", {
			title: "Project Opt-Out Task",
			goal: "Prove the project can disable auto-iteration",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const runner = async () => {
			throw new Error("Persistent failure");
		};

		const originalEnabled = config.autoIterationEnabled;
		config.autoIterationEnabled = true;
		try {
			await store.executeStage("p1", task.id, {
				stages: project.stages,
				projectCwd: tempCwd,
				agentRunner: runner,
			});
			expect(task.status).toBe("failed");
			expect(task.autoIterationCount || 0).toBe(0);
			expect(task.autoRetrying).toBe(false);
		} finally {
			config.autoIterationEnabled = originalEnabled;
		}
	});

	it("reinjects the parking failure into the prompt on manual retry after budget exhaustion", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Retry Reinjection Task",
			goal: "Prove the retry prompt carries the parking failure",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const parkingError = "Persistent failure: null pointer in impl";
		const failingRunner = async () => {
			throw new Error(parkingError);
		};

		const originalMax = config.maxAutoIterations;
		config.maxAutoIterations = 1;
		try {
			// First failure consumes the budget -> auto-retry.
			await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: failingRunner,
			});
			expect(task.status).toBe("in_stage");

			// Second failure exceeds the budget -> parked as failed with reason intact.
			await store.executeStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: failingRunner,
			});
			expect(task.status).toBe("failed");
			expect(task.failureReason).toContain(parkingError);

			// Manual retry must re-run with the parking failure reinjected.
			let capturedPrompt = null;
			const capturingRunner = async (prompt) => {
				capturedPrompt = prompt;
				return { output: "fixed", content: "fixed" };
			};
			await store.retryStage("p1", task.id, {
				stages,
				projectCwd: tempCwd,
				agentRunner: capturingRunner,
			});

			expect(capturedPrompt).toContain(parkingError);
			expect(capturedPrompt).toContain("MUST resolve these failures");
			// Single ownership: exactly one failure-details block (no double injection).
			expect(capturedPrompt.match(/# Failure Details/g) || []).toHaveLength(1);
			// The auto-iteration budget still resets on manual retry.
			expect(task.autoIterationCount).toBe(0);
		} finally {
			config.maxAutoIterations = originalMax;
		}
	});

	it("does not inject failure details on retry with no prior failure", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Clean Retry Task",
			goal: "Prove a clean retry prompt stays clean",
			stageId: "impl",
			projectCwd: tempCwd,
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		let capturedPrompt = null;
		const capturingRunner = async (prompt) => {
			capturedPrompt = prompt;
			return { output: "done", content: "done" };
		};
		await store.retryStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: capturingRunner,
		});

		// The succeeding runner runs the pipeline to completion; the point is the
		// prompt carried no failure block.
		expect(capturedPrompt).not.toContain("MUST resolve these failures");
		expect(capturedPrompt).not.toContain("# Failure Details");
	});

	it("preserves failureReason on resumeTask so the next run can reinject it", async () => {
		const store = new TaskStore();
		const stages = [
			{ id: "1", name: "Stage 1", type: "agent" },
			{ id: "2", name: "Stage 2", type: "agent" },
		];
		const task = store.createTask("p1", { goal: "Resumable Task", stageId: "1" });
		task.status = "failed";
		task.failureReason = "Resume me with context";
		task.lastError = { message: "Resume me with context", stageId: "1" };

		// No runner: resume resets counters and re-queues without consuming the reason.
		const resumed = await store.resumeTask("p1", task.id, { stages });
		expect(resumed.status).toBe("in_stage");
		expect(resumed.failureReason).toBe("Resume me with context");
		expect(resumed.lastError).toMatchObject({ message: "Resume me with context" });
	});

	it("strictly partitions tasks by workflowId in getTasks and listTasks", () => {
		const store = new TaskStore();
		const taskWf1A = store.createTask("p1", {
			title: "Wf1 Task A",
			goal: "Workflow 1 task",
			stageId: "1",
			workflowId: "wf-1",
		});
		const taskWf1B = store.createTask("p1", {
			title: "Wf1 Task B",
			goal: "Workflow 1 task B",
			stageId: "1",
			workflowId: "wf-1",
		});
		const taskWf2 = store.createTask("p1", {
			title: "Wf2 Task",
			goal: "Workflow 2 task",
			stageId: "1",
			workflowId: "wf-2",
		});

		expect(store.listTasks("p1").length).toBe(3);

		// getTasks filtered by workflowId
		const wf1Tasks = store.getTasks("p1", "wf-1");
		expect(wf1Tasks.length).toBe(2);
		expect(wf1Tasks.map((t) => t.id)).toEqual([taskWf1A.id, taskWf1B.id]);

		const wf2Tasks = store.getTasks("p1", "wf-2");
		expect(wf2Tasks.length).toBe(1);
		expect(wf2Tasks[0].id).toBe(taskWf2.id);

		// listTasks with workflowId
		expect(store.listTasks("p1", undefined, "wf-1").length).toBe(2);
		expect(store.listTasks("p1", undefined, "wf-2").length).toBe(1);
		expect(store.listTasks("p1", undefined, "wf-nonexistent").length).toBe(0);
	});

	it("guards executeStage against tasks blocked by unfinished dependencies", async () => {
		const store = new TaskStore();
		const blockerTask = store.createTask("p1", {
			title: "Prerequisite API",
			goal: "Build endpoints first",
			stageId: "1",
		});
		const blockedTask = store.createTask("p1", {
			title: "Dependent UI",
			goal: "Build frontend UI",
			stageId: "1",
			blockedBy: [blockerTask.id],
		});

		expect(store.isTaskBlocked("p1", blockedTask.id).blocked).toBe(true);
		expect(store.isTaskBlocked("p1", blockedTask.id).blockers).toEqual([blockerTask.id]);

		// Attempting to execute blocked task returns status 'blocked' without running
		const result = await store.executeStage("p1", blockedTask.id, { stages });
		expect(result.status).toBe("blocked");
		expect(result.blockers).toEqual([blockerTask.id]);

		// Completing the blocker unblocks the dependent task
		store.completeTask("p1", blockerTask.id);
		expect(store.isTaskBlocked("p1", blockedTask.id).blocked).toBe(false);

		// Now execution proceeds normally
		const executedResult = await store.executeStage("p1", blockedTask.id, { stages });
		expect(executedResult.status).toBe("in_stage");
	});

	it("schedules tasks using the 3 priority rules (follow-on, furthest right, oldest)", () => {
		const mockProjectStore = {
			listProjects: () => [{ id: "p1", cwd: tempCwd, stages }],
			getProject: () => ({ id: "p1", cwd: tempCwd, stages }),
		};
		const store = new TaskStore({ projectStore: mockProjectStore });

		// Task A: In stage 1 (Idea), updated 10 mins ago
		const taskA = store.createTask("p1", {
			title: "Task A",
			goal: "Idea stage",
			stageId: "1",
		});
		store.updateTask("p1", taskA.id, {
			enteredStageAt: new Date(Date.now() - 600000).toISOString(),
			updatedAt: new Date(Date.now() - 600000).toISOString(),
		});

		// Task B: In stage 2 (Plan - further right), updated 5 mins ago
		const taskB = store.createTask("p1", {
			title: "Task B",
			goal: "Plan stage",
			stageId: "2",
		});
		store.updateTask("p1", taskB.id, {
			enteredStageAt: new Date(Date.now() - 300000).toISOString(),
			updatedAt: new Date(Date.now() - 300000).toISOString(),
		});

		// Task C: In stage 1 (Idea), updated 20 mins ago (older than Task A)
		const taskC = store.createTask("p1", {
			title: "Task C",
			goal: "Old Idea",
			stageId: "1",
		});
		store.updateTask("p1", taskC.id, {
			enteredStageAt: new Date(Date.now() - 1200000).toISOString(),
			updatedAt: new Date(Date.now() - 1200000).toISOString(),
		});

		// Priority Rule 2 (Furthest right): Task B in Stage 2 should be picked first over Task A & C in Stage 1
		let candidate = store.findNextCandidateTask();
		expect(candidate.taskId).toBe(taskB.id);

		// Move Task B to completed
		store.completeTask("p1", taskB.id);

		// Between Task A and Task C (both in Stage 1), Priority Rule 3 (Oldest) picks Task C
		candidate = store.findNextCandidateTask();
		expect(candidate.taskId).toBe(taskC.id);

		// Priority Rule 1 (Follow-on): If lastCompletedTask is set to Task A, it takes highest priority
		store.lastCompletedTask = { projectId: "p1", taskId: taskA.id, timestamp: Date.now() };
		candidate = store.findNextCandidateTask();
		expect(candidate.taskId).toBe(taskA.id);
		expect(candidate.priorityReason).toBe("follow_on");
	});

	it("routes agent fail_stage per stage config failback, ignoring the agent's requested target", async () => {
		const store = new TaskStore();
		const wf = [
			{ id: "1", name: "Idea", type: "agent", failback: "start" },
			{ id: "2", name: "Plan", type: "agent", failback: "previous" },
			{ id: "3", name: "Review", type: "agent", failback: "1" },
			{ id: "4", name: "Ship", type: "human", failback: "previous" },
		];
		const task = store.createTask("p1", {
			title: "Review Task",
			goal: "AI Code Review",
			stageId: "3",
		});

		const agentRunnerWithFailStage = async () => {
			return {
				output: "Code does not meet security standards.",
				summary: "Missing input sanitization in user auth endpoint.",
				failed: true,
				failureReason: "Security vulnerabilities detected: missing input validation",
				// The agent requests a stage, but KainBain must IGNORE it and use
				// the stage config's failback ("1" for Review).
				fallbackStageId: "4",
			};
		};

		const result = await store.executeStage("p1", task.id, {
			stages: wf,
			agentRunner: agentRunnerWithFailStage,
		});

		expect(result.status).toBe("retrying");
		expect(result.error).toContain("Security vulnerabilities detected");
		// Stage config failback ("1" Idea) wins over the agent's request ("4" Ship).
		const updatedTask = store.getTask("p1", task.id);
		expect(updatedTask.currentStageId).toBe("1");
		expect(updatedTask.status).toBe("in_stage");
		expect(updatedTask.autoRetrying).toBe(true);

		// Stage report was saved
		const reports = store.getTaskReports("p1", task.id);
		expect(reports.length).toBeGreaterThan(0);
		expect(reports[0].content).toContain("FAILED");
		expect(reports[0].content).toContain("Security vulnerabilities detected");
	});

	it("skips stale duplicate stage executors so stages are not skipped", async () => {
		const store = new TaskStore();
		// Two agent stages then a terminal agent stage, so an over-dispatched
		// executor would otherwise double-run "Implement" and skip "Review".
		const wf = [
			{ id: "1", name: "Idea", type: "human", failback: "start" },
			{ id: "2", name: "Implement", type: "agent", failback: "previous" },
			{ id: "3", name: "Review", type: "agent", failback: "previous" },
			{ id: "4", name: "Ship", type: "human", failback: "previous" },
		];
		const task = store.createTask("p1", {
			title: "Stale Guard",
			goal: "Verify review runs",
			stageId: "2",
		});

		const dispatched = [];
		const agentRunner = async (prompt, { stage }) => {
			dispatched.push(stage.name);
			return { output: "done", summary: "done" };
		};

		// Two concurrent executors for the same task both capture stage "Implement"
		// (as the periodic scheduler, follow-on timer, and onIdle can do). The
		// second must be treated as stale and skipped so "Review" is not bypassed.
		const results = await Promise.all([
			store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner,
			}),
			store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner,
			}),
		]);

		expect(dispatched).toEqual(["Implement"]);
		expect(results.some((r) => r.status === "superseded")).toBe(true);
		// Task should land on Review, not skip it to Ship
		expect(store.getTask("p1", task.id).currentStageId).toBe("3");
	});

	it("stale CI executor is skipped when the task has already advanced", async () => {
		const store = new TaskStore();
		const wf = [
			{ id: "1", name: "Build", type: "ci", failback: "previous", command: "echo hi" },
			{ id: "2", name: "Ship", type: "human", failback: "previous" },
		];
		const task = store.createTask("p1", {
			goal: "ci",
			stageId: "1",
		});

		// Two concurrent executors capture stage "Build"; the first runs it and
		// advances to the human Ship stage, so the second must be superseded.
		const results = await Promise.all([
			store.executeStage("p1", task.id, {
				stages: wf,
				execRunner: async () => ({ code: 0 }),
			}),
			store.executeStage("p1", task.id, {
				stages: wf,
				execRunner: async () => ({ code: 0 }),
			}),
		]);
		expect(results.some((r) => r.status === "superseded")).toBe(true);
		// Should not double-advance past Ship
		expect(store.getTask("p1", task.id).currentStageId).toBe("2");
	});

	it("stale executor for the same stage still runs normally", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			goal: "normal",
			stageId: "2",
		});
		let ran = 0;
		const result = await store.executeStage("p1", task.id, {
			stages,
			agentRunner: async () => {
				ran += 1;
				return { output: "ok", summary: "" };
			},
		});
		expect(ran).toBe(1);
		expect(result.status).toBe("passed");
	});

	it("supports manual intervention: pauseTask, resumeTask, retryStage, abortTask", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Intervene Task", stageId: "1" });

		// Pause
		const paused = store.pauseTask("p1", task.id);
		expect(paused.status).toBe("paused");
		expect(paused.history.some((h) => h.action.includes("paused"))).toBe(true);

		// Resume
		const resumed = await store.resumeTask("p1", task.id);
		expect(resumed.status).toBe("in_stage");
		expect(resumed.wasInterrupted).toBe(false);

		// Abort
		const aborted = store.abortTask("p1", task.id);
		expect(aborted.status).toBe("in_stage");
		expect(aborted.history.some((h) => h.action.includes("aborted"))).toBe(true);

		// Retry re-dispatches with a freshly curated prompt (no override).
		const retried = await store.retryStage("p1", task.id);
		expect(retried.history.some((h) => h.action.includes("retried"))).toBe(true);
	});

	it("supports followUpTask and steerTask", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Follow up goal", stageId: "1" });

		let followUpCalled = false;
		const mockSession = {
			isStreaming: true,
			followUp: async (text) => {
				followUpCalled = true;
			},
			steer: async (text) => {},
		};

		await store.followUpTask("p1", task.id, "Follow up instructions", {
			session: mockSession,
		});
		expect(task.goal).toContain("Follow-up Guidance");
		expect(followUpCalled).toBe(true);

		await store.steerTask("p1", task.id, "Steer instructions", {
			session: mockSession,
		});
		expect(task.goal).toContain("Steering Guidance");
	});

	it("rehydrates interrupted tasks on startup scan and sets wasInterrupted flag", () => {
		const store = new TaskStore();
		const taskDir = path.join(tempCwd, "docs", "tasks", "task-recovered");
		fs.mkdirSync(taskDir, { recursive: true });

		const taskMd = [
			"---",
			'id: "task-recovered"',
			'projectId: "p1"',
			'status: "running_agent"',
			'currentStageId: "2"',
			"---",
			"# Goal",
			"Active task before server crash",
			"# History",
			"- 2026-08-22T12:00:00.000Z: Running stage 2",
		].join("\n");

		fs.writeFileSync(path.join(taskDir, "task.md"), taskMd, "utf8");

		const tasks = store.scanTasks("p1", tempCwd);
		const recovered = tasks.find((t) => t.id === "task-recovered");
		expect(recovered).toBeTruthy();
		expect(recovered.status).toBe("interrupted");
		expect(recovered.wasInterrupted).toBe(true);
		expect(recovered.history.some((h) => h.action.includes("recovered"))).toBe(true);
	});

	it("cancelProjectExecutions clears only the given project's queued jobs", async () => {
		const store = new TaskStore();
		const ran = [];
		let releaseFirst;
		const firstDone = new Promise((r) => (releaseFirst = r));
		let p2res;
		const p2Done = new Promise((r) => (p2res = r));

		// First job occupies the queue (never resolves until released), so the
		// two jobs enqueued after it stay pending rather than auto-draining.
		store.executionQueue.enqueue(async () => firstDone, { projectId: "p0" });
		store.executionQueue.enqueue(async () => {
			try {
				ran.push("p1");
				p2res("p1-ran");
			} catch {
				p2res("p1-err");
			}
		}, { projectId: "p1" });
		store.executionQueue.enqueue(async () => {
			try {
				ran.push("p2");
				p2res("p2-ran");
			} catch {
				p2res("p2-err");
			}
		}, { projectId: "p2" });

		expect(store.executionQueue.size).toBe(2);

		// Cancelling project 1 drops its pending job but leaves p2 untouched.
		store.cancelProjectExecutions("p1");
		expect(store.executionQueue.size).toBe(1);

		// Release the active job; only the surviving p2 pending job runs.
		releaseFirst();
		const ranProject = await p2Done;
		expect(ranProject).toBe("p2-ran");
		expect(ran).toEqual(["p2"]);
	});

	it("clear(projectId) with no project clears the whole queue", async () => {
		const store = new TaskStore();
		let release;
		const blocker = new Promise((r) => (release = r));
		store.executionQueue.enqueue(async () => blocker, { projectId: "p0" });
		store.executionQueue.enqueue(async () => 1, { projectId: "p1" });
		store.executionQueue.enqueue(async () => 2, { projectId: "p2" });
		expect(store.executionQueue.size).toBe(2);
		store.executionQueue.clear();
		expect(store.executionQueue.size).toBe(0);
		release();
		await store.executionQueue._drain();
	});

	describe("resolveStageTimeout & stage timeout override handling (#10)", () => {
		it("resolves stage.timeout when a positive number or numeric string is provided", () => {
			expect(resolveStageTimeout({ timeout: 45000 }, "agent")).toBe(45000);
			expect(resolveStageTimeout({ timeout: "120000" }, "ci")).toBe(120000);
			expect(resolveStageTimeout({ timeout: 900000 }, "ci")).toBe(900000);
			expect(resolveStageTimeout({ timeout: 15000 }, "custom")).toBe(15000);
		});

		it("falls back to default agentTimeoutMs (1800000 ms / 30 min) for agent / review stages without override", () => {
			expect(resolveStageTimeout({}, "agent")).toBe(config.agentTimeoutMs);
			expect(resolveStageTimeout({ type: "agent" })).toBe(config.agentTimeoutMs);
			expect(resolveStageTimeout({ type: "review" })).toBe(config.agentTimeoutMs);
			expect(resolveStageTimeout({ timeout: 0 }, "agent")).toBe(config.agentTimeoutMs);
			expect(resolveStageTimeout({ timeout: -500 }, "agent")).toBe(config.agentTimeoutMs);
			expect(resolveStageTimeout({ timeout: "" }, "agent")).toBe(config.agentTimeoutMs);
			expect(resolveStageTimeout({ timeout: null }, "agent")).toBe(config.agentTimeoutMs);
		});

		it("falls back to default ciTimeoutMs (600000 ms / 10 min) for ci / script stages without override", () => {
			expect(resolveStageTimeout({}, "ci")).toBe(config.ciTimeoutMs);
			expect(resolveStageTimeout({ type: "ci" })).toBe(config.ciTimeoutMs);
			expect(resolveStageTimeout({ type: "script" })).toBe(config.ciTimeoutMs);
			expect(resolveStageTimeout({ timeout: "" }, "ci")).toBe(config.ciTimeoutMs);
		});

		it("folds legacy deploy-typed stages into the CI timeout budget", () => {
			// The `deploy` type was removed: a deploy-typed stage is an
			// ordinary ci stage and uses ciTimeoutMs, not a deploy-specific
			// budget.
			expect(resolveStageTimeout({}, "deploy")).toBe(config.ciTimeoutMs);
			expect(resolveStageTimeout({ type: "deploy" })).toBe(config.ciTimeoutMs);
			expect(resolveStageTimeout({ timeout: null }, "deploy")).toBe(config.ciTimeoutMs);
		});

		it("falls back to 300000 ms for unknown stage types without override", () => {
			expect(resolveStageTimeout({}, "unknown_type")).toBe(300000);
		});

		it("respects custom cfg overrides passed to resolveStageTimeout", () => {
			const customCfg = {
				agentTimeoutMs: 2400000,
				ciTimeoutMs: 90000,
			};
			expect(resolveStageTimeout({}, "agent", customCfg)).toBe(2400000);
			expect(resolveStageTimeout({}, "ci", customCfg)).toBe(90000);
			// A deploy-typed stage folds to the ci budget (no deployTimeoutMs).
			expect(resolveStageTimeout({}, "deploy", customCfg)).toBe(90000);
		});

		it("passes resolved timeout to agentRunner in executeStage with and without stage override", async () => {
			const store = new TaskStore();
			const task1 = store.createTask("p1", { goal: "Agent default timeout", stageId: "agent-default" });
			const task2 = store.createTask("p1", { goal: "Agent custom timeout", stageId: "agent-custom" });

			const testStages = [
				{ id: "agent-default", name: "Default Agent", type: "agent" },
				{ id: "agent-custom", name: "Custom Agent", type: "agent", timeout: 42000 },
			];

			let capturedTimeout1 = null;
			const runner1 = async (prompt, opts) => {
				capturedTimeout1 = opts.timeout;
				return "Completed 1";
			};

			await store.executeStage("p1", task1.id, {
				stages: testStages,
				projectCwd: tempCwd,
				agentRunner: runner1,
			});
			expect(capturedTimeout1).toBe(config.agentTimeoutMs);

			let capturedTimeout2 = null;
			const runner2 = async (prompt, opts) => {
				capturedTimeout2 = opts.timeout;
				return "Completed 2";
			};

			await store.executeStage("p1", task2.id, {
				stages: testStages,
				projectCwd: tempCwd,
				agentRunner: runner2,
			});
			expect(capturedTimeout2).toBe(42000);
		});

		it("passes resolved timeout to execRunner for CI stages with and without stage override", async () => {
			const store = new TaskStore();
			const task1 = store.createTask("p1", { goal: "CI default timeout", stageId: "ci-default" });
			const task2 = store.createTask("p1", { goal: "CI custom timeout", stageId: "ci-custom" });

			const testStages = [
				{ id: "ci-default", name: "Default CI", type: "ci", command: "echo ci" },
				{ id: "ci-custom", name: "Custom CI", type: "ci", command: "echo ci", timeout: 15000 },
			];

			let capturedTimeout1 = null;
			const mockRunner1 = async (cmd, opts) => {
				capturedTimeout1 = opts.timeout;
				return { stdout: "ok", stderr: "", exitCode: 0 };
			};

			await store.executeStage("p1", task1.id, {
				stages: testStages,
				projectCwd: tempCwd,
				execRunner: mockRunner1,
			});
			expect(capturedTimeout1).toBe(config.ciTimeoutMs);

			let capturedTimeout2 = null;
			const mockRunner2 = async (cmd, opts) => {
				capturedTimeout2 = opts.timeout;
				return { stdout: "ok", stderr: "", exitCode: 0 };
			};

			await store.executeStage("p1", task2.id, {
				stages: testStages,
				projectCwd: tempCwd,
				execRunner: mockRunner2,
			});
			expect(capturedTimeout2).toBe(15000);
		});

		it("passes the CI timeout to execRunner for deploy-command stages with and without stage override", async () => {
			// A deploy-command ci stage uses the ordinary ci timeout budget.
			const store = new TaskStore();
			const task1 = store.createTask("p1", { goal: "Deploy default timeout", stageId: "deploy-default" });
			const task2 = store.createTask("p1", { goal: "Deploy custom timeout", stageId: "deploy-custom" });

			const testStages = [
				{ id: "deploy-default", name: "Default Deploy", type: "ci", command: "./deploy.sh --prod" },
				{ id: "deploy-custom", name: "Custom Deploy", type: "ci", command: "./deploy.sh --prod", timeout: 450000 },
			];

			let capturedTimeout1 = null;
			const mockRunner1 = async (cmd, opts) => {
				capturedTimeout1 = opts.timeout;
				return { stdout: "deployed", stderr: "", exitCode: 0 };
			};

			await store.executeStage("p1", task1.id, {
				stages: testStages,
				projectCwd: tempCwd,
				execRunner: mockRunner1,
			});
			expect(capturedTimeout1).toBe(config.ciTimeoutMs);

			let capturedTimeout2 = null;
			const mockRunner2 = async (cmd, opts) => {
				capturedTimeout2 = opts.timeout;
				return { stdout: "deployed", stderr: "", exitCode: 0 };
			};

			await store.executeStage("p1", task2.id, {
				stages: testStages,
				projectCwd: tempCwd,
				execRunner: mockRunner2,
			});
			expect(capturedTimeout2).toBe(450000);
		});
	});

	describe("getScheduledQueue", () => {
		it("excludes completed, done, failed, and human-review tasks from the queue (#29)", () => {
			const store = new TaskStore();
			const testStages = [
				{ id: "1", name: "Idea", type: "agent" },
				{ id: "2", name: "Review", type: "human" },
				{ id: "3", name: "CI", type: "ci" },
				{ id: "4", name: "Deploy", type: "deploy" },
			];

			// Mock projectStore on the store instance
			store.projectStore = {
				listProjects: () => [{ id: "p1", name: "Project 1", cwd: tempCwd, stages: testStages }],
			};

			// Create tasks in different states
			const tCompleted = store.createTask("p1", { goal: "Done Task", stageId: "4" });
			store.completeTask("p1", tCompleted.id);

			const tFailed = store.createTask("p1", { goal: "Failed Task", stageId: "3" });
			store.updateTask("p1", tFailed.id, { status: "failed", failureReason: "CI error" });

			const tHumanStage = store.createTask("p1", { goal: "Human Stage Task", stageId: "2" });
			const tWaitingHuman = store.createTask("p1", { goal: "Waiting Human Status Task", stageId: "1" });
			store.updateTask("p1", tWaitingHuman.id, { status: "waiting_human" });

			const tQueued1 = store.createTask("p1", { goal: "Automated Agent Task", stageId: "1" });
			const tQueued2 = store.createTask("p1", { goal: "Automated CI Task", stageId: "3" });

			const queue = store.getScheduledQueue("p1");

			// Should only include automated scheduled tasks (tQueued1 and tQueued2)
			const queueIds = queue.map((item) => item.id);
			expect(queueIds).toContain(tQueued1.id);
			expect(queueIds).toContain(tQueued2.id);
			expect(queueIds).not.toContain(tCompleted.id);
			expect(queueIds).not.toContain(tFailed.id);
			expect(queueIds).not.toContain(tHumanStage.id);
			expect(queueIds).not.toContain(tWaitingHuman.id);

			// Furthest along priority: Stage 3 (CI) should be ordered before Stage 1 (Agent)
			expect(queue[0].id).toBe(tQueued2.id);
			expect(queue[1].id).toBe(tQueued1.id);
			expect(queue[0].queueOrder).toBe(1);
			expect(queue[1].queueOrder).toBe(2);
		});

		it("filters by projectId when filterProjectId is provided", () => {
			const store = new TaskStore();
			const testStages = [{ id: "1", name: "Idea", type: "agent" }];

			store.projectStore = {
				listProjects: () => [
					{ id: "p1", name: "Project 1", cwd: tempCwd, stages: testStages },
					{ id: "p2", name: "Project 2", cwd: tempCwd, stages: testStages },
				],
			};

			const tP1 = store.createTask("p1", { goal: "Task P1", stageId: "1" });
			const tP2 = store.createTask("p2", { goal: "Task P2", stageId: "1" });

			const queueP1 = store.getScheduledQueue("p1");
			expect(queueP1.length).toBe(1);
			expect(queueP1[0].id).toBe(tP1.id);

			const queueP2 = store.getScheduledQueue("p2");
			expect(queueP2.length).toBe(1);
			expect(queueP2[0].id).toBe(tP2.id);
		});
	});

	describe("Failure Recovery & Transition Signals (#1, #2)", () => {
		it("clears failureReason and lastError when moving, advancing, or completing a failed task; retry preserves them until consumed", async () => {
			const store = new TaskStore();
			const testStages = [
				{ id: "1", name: "Stage 1", type: "agent" },
				{ id: "2", name: "Stage 2", type: "agent" },
			];

			const task = store.createTask("p1", { goal: "Failed Task", stageId: "1" });
			task.status = "failed";
			task.failureReason = "Runtime syntax error in stage 1";
			task.lastError = { message: "Runtime syntax error in stage 1", stageId: "1" };

			// 1. Moving to stage clears failure tags
			const moved = store.moveToStage("p1", task.id, "2");
			expect(moved.status).toBe("in_stage");
			expect(moved.failureReason).toBeNull();
			expect(moved.lastError).toBeNull();

			// Set back to failed
			task.status = "failed";
			task.failureReason = "Timeout error";
			task.lastError = { message: "Timeout error" };

			// 2. Retrying preserves failure tags until executeStage consumes them
			const retried = await store.retryStage("p1", task.id);
			expect(retried.status).toBe("in_stage");
			expect(retried.failureReason).toBe("Timeout error");
			expect(retried.lastError).toMatchObject({ message: "Timeout error" });

			// 2b. executeStage reinjects the preserved failure into the prompt, then clears it
			let capturedPrompt = null;
			await store.executeStage("p1", task.id, {
				stages: testStages,
				agentRunner: async (prompt) => {
					capturedPrompt = prompt;
					return { output: "recovered", content: "recovered" };
				},
			});
			expect(capturedPrompt).toContain("Timeout error");
			expect(capturedPrompt).toContain("MUST resolve these failures");
			const consumed = store.getTask("p1", task.id);
			expect(consumed.failureReason).toBeNull();
			expect(consumed.lastError).toBeNull();

			// Set back to failed
			task.status = "failed";
			task.failureReason = "Another failure";
			task.lastError = { message: "Another failure" };

			// 3. Completing task clears failure tags
			const completed = store.completeTask("p1", task.id);
			expect(completed.status).toBe("completed");
			expect(completed.failureReason).toBeNull();
			expect(completed.lastError).toBeNull();
		});

		it("broadcasts TASK_UPDATED on moveToStage / createTask and TASK_DELETED on deleteTask", () => {
			const updates = [];
			const deletes = [];
			const mockBridge = {
				emitProcessEvent: () => {},
				broadcastGlobal: (type, payload) => {
					if (type === "TASK_UPDATED") updates.push(payload);
					else if (type === "TASK_DELETED") deletes.push(payload);
				},
			};
			const store = new TaskStore({ eventBridge: mockBridge });

			const task = store.createTask("p1", { goal: "Live Move", stageId: "1" });
			expect(updates[0]).toMatchObject({ id: task.id, currentStageId: "1" });

			// Manual board move (drag-and-drop / moveTask) must broadcast.
			store.moveToStage("p1", task.id, "2", "Moved", mockBridge);
			expect(updates[updates.length - 1]).toMatchObject({
				id: task.id,
				currentStageId: "2",
			});

			// Stage advance (agent-driven) routes through moveToStage and broadcasts too.
			const stages = [
				{ id: "1", name: "Idea", type: "agent" },
				{ id: "2", name: "Review", type: "human" },
				{ id: "3", name: "Deploy", type: "deploy" },
			];
			store.advanceStage("p1", task.id, stages, mockBridge);
			expect(updates[updates.length - 1]).toMatchObject({
				id: task.id,
				currentStageId: "3",
				status: "in_stage",
			});

			// Deletion must broadcast so tabs remove the card.
			store.deleteTask("p1", task.id);
			expect(deletes).toContainEqual({ projectId: "p1", taskId: task.id });
		});

		it("emits stage:complete with transition message and nextStageName on advanceStage", () => {
			const emitted = [];
			const mockBridge = {
				emitProcessEvent: (proj, eventName, payload) => {
					emitted.push({ proj, eventName, payload });
				},
				broadcastGlobal: () => {},
			};
			const store = new TaskStore({ eventBridge: mockBridge });
			const testStages = [
				{ id: "1", name: "Idea", type: "agent" },
				{ id: "2", name: "Elaboration", type: "agent" },
				{ id: "3", name: "Deploy", type: "deploy" },
			];

			const task = store.createTask("p1", { goal: "Transition Task", stageId: "1" });

			// Advance from stage 1 to stage 2
			store.advanceStage("p1", task.id, testStages, mockBridge);
			const event1 = emitted.find((e) => e.eventName === "stage:complete" && e.payload.stageId === "1");
			expect(event1).toBeDefined();
			expect(event1.payload.nextStageName).toBe("Elaboration");
			expect(event1.payload.isTerminal).toBe(false);
			expect(event1.payload.message).toContain("complete — advancing to 'Elaboration'");

			// Advance from stage 2 to stage 3
			store.advanceStage("p1", task.id, testStages, mockBridge);
			const event2 = emitted.find((e) => e.eventName === "stage:complete" && e.payload.stageId === "2");
			expect(event2).toBeDefined();
			expect(event2.payload.nextStageName).toBe("Deploy");
			expect(event2.payload.isTerminal).toBe(false);

			// Advance from final stage (stage 3)
			store.advanceStage("p1", task.id, testStages, mockBridge);
			const event3 = emitted.find((e) => e.eventName === "stage:complete" && e.payload.stageId === "3");
			expect(event3).toBeDefined();
			expect(event3.payload.isTerminal).toBe(true);
			expect(event3.payload.pipelineFinished).toBe(true);
			expect(event3.payload.message).toContain("complete — pipeline finished");
		});

		it("identifies unrecoverable infrastructure and auth errors", () => {
			expect(isUnrecoverableError("[Authentication Error] 401 unauthorized")).toBe(true);
			expect(isUnrecoverableError("[Model Quota/Context Error] 429 rate limit")).toBe(true);
			// WP2: connection errors are transient ONLY, never unrecoverable.
			expect(isUnrecoverableError("[Model Connection Error] ECONNREFUSED")).toBe(false);
			expect(isTransientInfrastructureError("[Model Connection Error] ECONNREFUSED")).toBe(true);
			expect(isUnrecoverableError("Agent is already processing")).toBe(true);
			expect(isUnrecoverableError("you have reached your session usage limit")).toBe(true);
			expect(isUnrecoverableError("CI test failed: 2 tests broken")).toBe(false);
			expect(isUnrecoverableError("Security review rejected")).toBe(false);
		});

		it("does NOT auto-retry on unrecoverable infrastructure errors", async () => {
			const store = new TaskStore();
			const wf = [
				{ id: "1", name: "Idea", type: "agent", failback: "start" },
				{ id: "2", name: "Plan", type: "agent", failback: "previous" },
			];
			const task = store.createTask("p1", {
				title: "Quota Task",
				goal: "Do work",
				stageId: "2",
			});

			const runnerWithQuotaError = async () => {
				return {
					output: "[Model Quota/Context Error] 429: reached session usage limit",
					content: "[Model Quota/Context Error] 429: reached session usage limit",
					failed: true,
					failureReason: "[Model Quota/Context Error] 429: reached session usage limit",
					fallbackStageId: null,
				};
			};

			const result = await store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner: runnerWithQuotaError,
			});

			expect(result.status).toBe("failed");
			const updated = store.getTask("p1", task.id);
			expect(updated.status).toBe("failed");
			expect(updated.autoRetrying).toBe(false);
		});

		it("parks unrecoverable errors at the stage that failed (no failback)", async () => {
			const emitted = [];
			const mockBridge = {
				emitProcessEvent: (projId, eventName, payload) => {
					emitted.push({ projId, eventName, payload });
				},
				emitSystemLog: () => {},
				emitNotification: () => {},
			};
			const store = new TaskStore({ eventBridge: mockBridge });
			const wf = [
				{ id: "1", name: "Idea", type: "agent", failback: "start" },
				{ id: "2", name: "Plan", type: "agent", failback: "previous" },
			];
			const task = store.createTask("p1", {
				title: "Quota Task",
				goal: "Do work",
				stageId: "2",
			});

			const runnerWithQuotaError = async () => {
				return {
					output: "[Model Quota/Context Error] 429: reached session usage limit",
					content: "[Model Quota/Context Error] 429: reached session usage limit",
					failed: true,
					failureReason: "[Model Quota/Context Error] 429: reached session usage limit",
					fallbackStageId: null,
				};
			};

			const result = await store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner: runnerWithQuotaError,
			});

			expect(result.status).toBe("failed");
			const updated = store.getTask("p1", task.id);
			// No earlier stage can fix a quota error: the task stays where it
			// failed so a human can retry/resume exactly that stage.
			expect(updated.currentStageId).toBe("2");
			expect(updated.status).toBe("failed");
			expect(updated.failureReason).toContain("429");
			expect(
				emitted.some((e) => e.eventName === "stage:failback"),
			).toBe(false);
		});

		it("classifies transient infrastructure errors", () => {
			expect(
				isTransientInfrastructureError({
					failed: true,
					failureKind: "infrastructure",
				}),
			).toBe(true);
			expect(
				isTransientInfrastructureError(
					"[Model Connection Error] Unable to connect to model service: fetch failed",
				),
			).toBe(true);
			expect(
				isTransientInfrastructureError("[Agent Execution Error] 503 Internal server error"),
			).toBe(true);
			expect(isTransientInfrastructureError("503 Service Unavailable")).toBe(true);
			expect(isTransientInfrastructureError("socket hang up")).toBe(true);
			expect(
				isTransientInfrastructureError("[Timeout Error] Stage execution timed out"),
			).toBe(true);
			expect(
				isTransientInfrastructureError("[Agent Review Rejection] coverage too low"),
			).toBe(false);
			expect(isTransientInfrastructureError("CI test failed: 2 tests broken")).toBe(
				false,
			);
			expect(
				isTransientInfrastructureError(
					"[Model Quota/Context Error] 429 rate limit",
				),
			).toBe(false);
		});

		it("retries transient infrastructure failures in the SAME stage (no failback)", async () => {
			const emitted = [];
			const mockBridge = {
				emitProcessEvent: (projId, eventName, payload) => {
					emitted.push({ projId, eventName, payload });
				},
				emitSystemLog: () => {},
				emitNotification: () => {},
			};
			const store = new TaskStore({ eventBridge: mockBridge });
			const wf = [
				{ id: "5", name: "In Progress", type: "agent", failback: "start" },
				{
					id: "6",
					name: "Quick review",
					type: "agent",
					failback: "5",
					fallback: "5",
				},
			];
			const task = store.createTask("p1", {
				title: "Review Task",
				goal: "Review the change",
				stageId: "6",
			});

			// A review stage that loses its model connection: infrastructure, not
			// review feedback.
			const runnerWithBlip = async () => {
				return {
					output: "[Model Connection Error] Unable to connect to model service: 503 Internal server error",
					content: "[Model Connection Error] Unable to connect to model service: 503 Internal server error",
					failed: true,
					failureReason:
						"[Model Connection Error] Unable to connect to model service: 503 Internal server error",
					failureKind: "infrastructure",
					fallbackStageId: null,
				};
			};

			const result = await store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner: runnerWithBlip,
			});

			expect(result.status).toBe("retrying");
			expect(result.retrySameStage).toBe(true);
			expect(result.attempt).toBe(1);
			const updated = store.getTask("p1", task.id);
			// The stage pointer must not move: no failback to 'In Progress'.
			expect(updated.currentStageId).toBe("6");
			expect(updated.status).toBe("in_stage");
			expect(updated.autoRetrying).toBe(true);
			expect(updated.infraRetryCount).toBe(1);
			// The blip is not injected as failure feedback for the next attempt.
			expect(updated.failureReason).toBeNull();
			expect(updated.lastError).toBeNull();
			expect(
				emitted.some((e) => e.eventName === "stage:failback"),
			).toBe(false);
			expect(
				emitted.some(
					(e) =>
						e.eventName === "stage:retry" &&
						e.payload.sameStage === true &&
						e.payload.stageId === "6",
				),
			).toBe(true);
		});

		it("retries thrown transient errors (e.g. 503) in the same stage", async () => {
			const store = new TaskStore();
			const wf = [
				{ id: "5", name: "In Progress", type: "agent", failback: "start" },
				{ id: "6", name: "Quick review", type: "agent", failback: "5" },
			];
			const task = store.createTask("p1", {
				title: "Review Task",
				goal: "Review the change",
				stageId: "6",
			});

			const runnerThrowing503 = async () => {
				throw new Error("request failed with status 503 Service Unavailable");
			};

			const result = await store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner: runnerThrowing503,
			});

			expect(result.status).toBe("retrying");
			expect(result.retrySameStage).toBe(true);
			const updated = store.getTask("p1", task.id);
			expect(updated.currentStageId).toBe("6");
			expect(updated.status).toBe("in_stage");
		});

		it("still failbacks when the agent actively fails the stage", async () => {
			const emitted = [];
			const mockBridge = {
				emitProcessEvent: (projId, eventName, payload) => {
					emitted.push({ projId, eventName, payload });
				},
				emitSystemLog: () => {},
				emitNotification: () => {},
			};
			const store = new TaskStore({ eventBridge: mockBridge });
			const wf = [
				{ id: "5", name: "In Progress", type: "agent", failback: "start" },
				{ id: "6", name: "Quick review", type: "agent", failback: "5" },
			];
			const task = store.createTask("p1", {
				title: "Review Task",
				goal: "Review the change",
				stageId: "6",
			});

			const runnerWithRejection = async () => {
				return {
					output: "Review found missing tests.",
					content: "Review found missing tests.",
					failed: true,
					failureReason: "[Agent Review Rejection] Missing tests for the new flow",
					failureKind: "rejected",
					fallbackStageId: null,
				};
			};

			const result = await store.executeStage("p1", task.id, {
				stages: wf,
				agentRunner: runnerWithRejection,
			});

			expect(result.status).toBe("retrying");
			expect(result.retrySameStage).toBeUndefined();
			const updated = store.getTask("p1", task.id);
			expect(updated.currentStageId).toBe("5");
			expect(updated.failureReason).toContain("Missing tests");
			expect(
				emitted.some(
					(e) =>
						e.eventName === "stage:failback" &&
						e.payload.targetStageId === "5",
				),
			).toBe(true);
		});

		it("parks a task at the failing stage once the transient budget is exhausted", async () => {
			const store = new TaskStore();
			const wf = [
				{ id: "5", name: "In Progress", type: "agent", failback: "start" },
				{ id: "6", name: "Quick review", type: "agent", failback: "5" },
			];
			const task = store.createTask("p1", {
				title: "Flaky Review Task",
				goal: "Review the change",
				stageId: "6",
			});

			const runnerAlwaysBlipping = async () => {
				return {
					output: "fetch failed",
					content: "fetch failed",
					failed: true,
					failureReason: "fetch failed",
					failureKind: "infrastructure",
					fallbackStageId: null,
				};
			};

			const originalMax = config.maxTransientRetries;
			const originalCircuitThreshold = config.circuitInfraFailureThreshold;
			config.maxTransientRetries = 2;
			// This test proves the per-task transient budget parks a task after
			// exhausting; keep the Tier-5 trip sensor out of the way so the
			// parking path is exercised in isolation (the trip path has its own
			// suite in flow/circuitGate.test.js).
			config.circuitInfraFailureThreshold = 99;
			try {
				let result;
				for (let i = 0; i < 3; i++) {
					result = await store.executeStage("p1", task.id, {
						stages: wf,
						agentRunner: runnerAlwaysBlipping,
					});
					if (i < 2) expect(result.status).toBe("retrying");
				}
				expect(result.status).toBe("failed");
				const updated = store.getTask("p1", task.id);
				expect(updated.currentStageId).toBe("6");
				expect(updated.status).toBe("failed");
				expect(updated.failureReason).toContain("fetch failed");
				expect(updated.autoRetrying).toBe(false);
			} finally {
				config.maxTransientRetries = originalMax;
				config.circuitInfraFailureThreshold = originalCircuitThreshold;
			}
		});

		it("abortTask calls abort on the active project session in sessionStore", () => {
			let aborted = false;
			const mockSessionStore = {
				get: (projectId) => {
					if (projectId === "p1") {
						return {
							abort: () => {
								aborted = true;
							},
						};
					}
					return null;
				},
			};
			const store = new TaskStore();
			store.sessionStore = mockSessionStore;
			const task = store.createTask("p1", { goal: "Running task", stageId: "1" });
			store.updateTask("p1", task.id, { status: "running_agent" });

			store.abortTask("p1", task.id);
			expect(aborted).toBe(true);
			const updated = store.getTask("p1", task.id);
			expect(updated.status).toBe("in_stage");
		});

		it("correctly parses task markdown when goal contains markdown headers", () => {
			const store = new TaskStore();
			const markdown = [
				"---",
				'id: "t-header"',
				'projectId: "p1"',
				'title: "Task with headers"',
				'status: "in_stage"',
				"---",
				"# Goal",
				"# UI needs optimistic actions",
				"",
				"I am currently working on a feature with headings:",
				"## Details",
				"- Item 1",
				"- Item 2",
				"",
				"# History",
				"- 2026-08-28T07:45:42.125Z: Created and placed in stage 'Idea'",
			].join("\n");

			const parsed = store._parseTaskMarkdown(markdown, "t-header", "p1");
			expect(parsed.goal).toContain("# UI needs optimistic actions");
			expect(parsed.goal).toContain("## Details");
			expect(parsed.goal).toContain("- Item 1");
			expect(parsed.history).toHaveLength(1);
		});

		it("sanitizes task titles stripping markdown headers and quotes", () => {
			expect(_sanitizeTaskTitle('"# Add warning when typing"')).toBe(
				"Add warning when typing",
			);
			expect(_sanitizeTaskTitle("## Feature title with header")).toBe(
				"Feature title with header",
			);
			expect(_sanitizeTaskTitle('"Quoted title"')).toBe("Quoted title");
			expect(_sanitizeTaskTitle('"Unbalanced leading quote')).toBe(
				"Unbalanced leading quote",
			);
			expect(_sanitizeTaskTitle('Unbalanced trailing quote"')).toBe(
				"Unbalanced trailing quote",
			);
			expect(_sanitizeTaskTitle('"""Nested quotes"""')).toBe("Nested quotes");
			expect(_sanitizeTaskTitle('“Curly quotes”')).toBe("Curly quotes");
			expect(_sanitizeTaskTitle('"Title with\nnewlines"')).toBe(
				"Title with newlines",
			);
			expect(_sanitizeTaskTitle('""')).toBe("Untitled task");
			expect(_sanitizeTaskTitle(null)).toBe("Untitled task");
			expect(_sanitizeTaskTitle(undefined)).toBe("Untitled task");
		});

		it("sanitizes title when creating task or parsing markdown", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", {
				title: '"# Add warning when typing in an executing task goal"',
				goal: "Some goal text",
				stageId: "1",
			});
			expect(task.title).toBe(
				"Add warning when typing in an executing task goal",
			);
		});

		it("persists and rehydrates task timeline from markdown", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", {
				title: "Timeline Task",
				goal: "Verify timeline",
				stageId: "1",
			});
			store._recordTimeline(task, {
				stage: "1",
				status: "Advanced",
				duration: "2m",
				timestamp: "2026-09-10T12:00:00.000Z",
			});
			store._recordTimeline(task, {
				stage: "2",
				status: "Completed",
				duration: "5m",
				timestamp: "2026-09-10T12:05:00.000Z",
			});

			const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "kb-timeline-test-"));
			try {
				store._saveTaskMarkdown(scratch, task);
				const taskMdPath = path.join(scratch, "docs", "tasks", task.id, "task.md");
				expect(fs.existsSync(taskMdPath)).toBe(true);

				const content = fs.readFileSync(taskMdPath, "utf8");
				expect(content).toContain("# Timeline");
				expect(content).toContain("1 | Advanced | 2m");
				expect(content).toContain("2 | Completed | 5m");

				const parsed = store._parseTaskMarkdown(content, task.id, "p1");
				expect(parsed.timeline).toHaveLength(2);
				expect(parsed.timeline[0]).toEqual({
					stage: "1",
					status: "Advanced",
					duration: "2m",
					timestamp: "2026-09-10T12:00:00.000Z",
				});
				expect(parsed.timeline[1]).toEqual({
					stage: "2",
					status: "Completed",
					duration: "5m",
					timestamp: "2026-09-10T12:05:00.000Z",
				});
			} finally {
				fs.rmSync(scratch, { recursive: true, force: true });
			}
		});

		it("respects disabled option in startScheduler without running timer", () => {
			const store = new TaskStore();
			store.startScheduler({ disabled: true });
			expect(store.schedulerRunning).toBe(false);
			expect(store.schedulerTimer).toBeNull();
		});
	});
});


/***
 * MARK: TaskStore per-task branch support & merge stage tests
 * @description Verifies the per-task branch feature (opt-in via project.useBranches)
 * and the 'merge' stage: branch provisioning, guarded checkouts, git-only merge
 * into main, conflict failback with the canonical message, and
 * dirty-tree / missing-branch refusals. All git interactions are mocked.
 ***/
describe("TaskStore branch support & merge stage", () => {
	let tempCwd;

	const resetGitMocks = () => {
		vi.clearAllMocks();
		gitHelpers.isGitRepository.mockResolvedValue(true);
		gitHelpers.hasCommits.mockResolvedValue(true);
		gitHelpers.currentBranch.mockResolvedValue("main");
		gitHelpers.defaultBranch.mockResolvedValue("main");
		gitHelpers.branchExists.mockResolvedValue(true);
		gitHelpers.ensureBranchCheckedOut.mockResolvedValue({
			created: false,
			checkedOut: true,
			switched: false,
		});
		gitHelpers.checkoutBranch.mockResolvedValue({ switched: true });
		gitHelpers.countUniqueCommits.mockResolvedValue(2);
		gitHelpers.requireCleanWorkingTree.mockResolvedValue(undefined);
		gitHelpers.commitAllIfNeeded.mockResolvedValue({ committed: false, hash: null });
		gitHelpers.mergeBranch.mockResolvedValue({ stdout: "merged", stderr: "" });
		gitHelpers.squashMergeBranch.mockResolvedValue({ committed: true, hash: "c".repeat(40) });
		gitHelpers.hasRemote.mockResolvedValue(false);
		gitHelpers.pushBranchIfRemote.mockResolvedValue({ pushed: false, skipped: "no-remote" });
		gitHelpers.returnToDefaultBranch.mockResolvedValue({ switched: false, branch: "main" });
	};

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-branch-test-"));
		resetGitMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	});

	const branchStore = () =>
		new TaskStore({
			projectStore: {
				getProject: () => ({ useBranches: true, cwd: tempCwd }),
			},
		});

	it("createTask derives and persists task.branch when branch mode is on (provisioning issued at create)", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Branchy work",
			stageId: "1",
			projectCwd: tempCwd,
		});
		expect(task.branch).toBe(`kb/${task.id}`);
		// Provisioning is issued during createTask (unawaited, so POST
		// /tasks stays instant). Its git ops serialize with a running
		// stage's branch ops via the per-repo mutex inside api/git.js —
		// creation can never collide on .git/index.lock.
		await new Promise((r) => setImmediate(r));
		expect(gitHelpers.ensureBranchCheckedOut).toHaveBeenCalled();
		expect(
			task.history.some((h) =>
				String(h.action || "").includes("first work-stage pickup"),
			),
		).toBe(false);
	});

	it("createTask does not touch git when branch mode is off (default)", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			goal: "Legacy work",
			stageId: "1",
			projectCwd: tempCwd,
		});
		expect(task.branch).toBeUndefined();
		// Give the (never scheduled) fire-and-forget a beat.
		await new Promise((r) => setImmediate(r));
		expect(gitHelpers.ensureBranchCheckedOut).not.toHaveBeenCalled();
	});

	it("executeStage checks out the task branch before an agent stage and passes branch context", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Branchy work",
			stageId: "1",
			projectCwd: tempCwd,
		});
		const stages = [{ id: "1", name: "Dev", type: "agent" }];
		let capturedOpts = null;
		let capturedPrompt = null;
		const agentRunner = async (_prompt, opts) => {
			capturedOpts = opts;
			capturedPrompt = _prompt;
			return "work done";
		};

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});

		expect(result.status).toBe("passed");
		// Branch was ensured before the agent ran.
		expect(gitHelpers.ensureBranchCheckedOut).toHaveBeenCalledWith(
			tempCwd,
			task.branch,
			expect.anything(),
		);
		// The agent knows its branch and is told not to self-integrate.
		expect(capturedOpts.branch).toBe(task.branch);
		expect(capturedPrompt).toContain("# Git Context");
		expect(capturedPrompt).toContain(task.branch);
		expect(capturedPrompt).toContain("merge stage integrates");
		// After success the engine finalises: commit → push-if-remote → default.
		// The return stays strict (recovery off): dirt after the commit step
		// means the commit failed, and that must refuse loudly, never stash.
		expect(gitHelpers.pushBranchIfRemote).toHaveBeenCalledWith(tempCwd, task.branch);
		expect(gitHelpers.returnToDefaultBranch).toHaveBeenCalledWith(tempCwd, {
			recovery: "off",
		});
	});

	it("dirty working tree fails the stage loudly instead of switching branches", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Branchy work",
			stageId: "1",
			projectCwd: tempCwd,
		});
		gitHelpers.ensureBranchCheckedOut.mockRejectedValue(
			new gitHelpers.GitDirtyTreeError(
				"Working tree is not clean (refusing checkout of branch 'kb/x'): code.js",
				{ dirtyPaths: ["code.js"] },
			),
		);
		const stages = [
			{ id: "1", name: "Dev", type: "agent", failback: "start" },
		];
		let agentRan = false;
		const agentRunner = async () => {
			agentRan = true;
			return "should not happen";
		};

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner,
		});

		expect(agentRan).toBe(false);
		expect(result.status).toMatch(/failed|retrying/);
		expect(task.failureReason).toContain("not clean");
		expect(agentRunner && gitHelpers.squashMergeBranch).not.toHaveBeenCalled();
	});

	it("merge stage merges the task branch into main and never runs a command", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Merge me",
			stageId: "merge-1",
			projectCwd: tempCwd,
		});
		const stages = [
			{ id: "dev", name: "Dev", type: "agent", failback: "start" },
			{
				id: "merge-1",
				name: "Merge to Main",
				type: "merge",
				command: "echo post-merge-ran",
				failback: "dev",
			},
		];
		gitHelpers.currentBranch.mockResolvedValue("kb/task-one");
		gitHelpers.commitAllIfNeeded.mockResolvedValue({ committed: true, hash: "abc1234" });

		const executed = [];
		const execRunner = async (cmd) => {
			executed.push(cmd);
			return { stdout: "post-merge-ran", stderr: "", exitCode: 0 };
		};

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			execRunner,
		});

		expect(result.status).toBe("passed");
		expect(result.stageType).toBe("merge");
		// The merge stage is git-only: a carried command is ignored, never run.
		expect(executed).toEqual([]);

		// Task branch was committed, main checked out, then merged.
		expect(gitHelpers.commitAllIfNeeded).toHaveBeenCalled();
		expect(gitHelpers.checkoutBranch).toHaveBeenCalledWith(tempCwd, "main", {
			recovery: "off",
		});
		expect(gitHelpers.squashMergeBranch).toHaveBeenCalledWith(tempCwd, task.branch, { commitMessage: expect.stringContaining(`Kainbain-Task: ${task.id}`) });

		// Audit: history + report + logs record the merge and the auto-commit.
		const mergedActions = task.history
			.map((h) => h.action)
			.filter((a) => a.includes("Squash-merged task branch"));
		expect(mergedActions.length).toBeGreaterThan(0);
		expect(logText(task)).toContain("[MERGE]");
		expect(logText(task)).toContain("Auto-committed");
		const report = task.reports.at(-1);
		expect(report.content).toContain("# Merge Stage Report");
		// Last stage → task completes.
		expect(task.status).toBe("completed");
	});

	it("merge conflict aborts (no post-merge command) and fails back with the canonical message", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Conflict me",
			stageId: "merge-1",
			projectCwd: tempCwd,
		});
		const stages = [
			{ id: "dev", name: "Dev", type: "agent", failback: "start" },
			{
				id: "merge-1",
				name: "Merge to Main",
				type: "merge",
				command: "echo should-not-run",
				failback: "dev",
			},
		];
		gitHelpers.squashMergeBranch.mockRejectedValue(
			new gitHelpers.GitMergeConflictError(
				"Merge conflict: please resolve all merge conflicts with main",
				{ conflictedFiles: ["src/app.js"] },
			),
		);
		const executed = [];
		const execRunner = async (cmd) => {
			executed.push(cmd);
			return { stdout: "", stderr: "", exitCode: 0 };
		};

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			execRunner,
		});

		// Standard failback machinery: routed back to the 'dev' stage.
		expect(task.currentStageId).toBe("dev");
		expect(result.status).toMatch(/failed|retrying/);
		// Canonical lead preserved; the structured Tier 3 diagnostics block
		// (WP5) follows it with SHAs, strategy, and the file list.
		expect(task.failureReason).toContain(
			"Merge conflict: please resolve all merge conflicts with main",
		);
		expect(task.failureReason).toContain("Git conflict diagnostics:");
		expect(task.failureReason).toContain("src/app.js");
		expect(task.failureReason).toContain("Strategy:");
		// The conflicted merge aborted BEFORE any post-merge command ran.
		expect(executed).toEqual([]);
		expect(task.status).not.toBe("completed");
	});

	it("dirty working tree refuses the pre-merge branch switch (no lost work)", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Dirty merge",
			stageId: "merge-1",
			projectCwd: tempCwd,
		});
		const stages = [
			{ id: "dev", name: "Dev", type: "agent", failback: "start" },
			{ id: "merge-1", name: "Merge to Main", type: "merge", failback: "dev" },
		];
		gitHelpers.requireCleanWorkingTree.mockRejectedValue(
			new gitHelpers.GitDirtyTreeError(
				"Working tree is not clean (refusing switching to task branch 'kb/x'): work.js",
				{ dirtyPaths: ["work.js"] },
			),
		);
		const executed = [];
		const execRunner = async (cmd) => {
			executed.push(cmd);
			return { stdout: "", stderr: "", exitCode: 0 };
		};

		await store.executeStage("p1", task.id, { stages, projectCwd: tempCwd, execRunner });

		expect(gitHelpers.squashMergeBranch).not.toHaveBeenCalled();
		expect(executed).toEqual([]);
		expect(task.currentStageId).toBe("dev");
		expect(task.failureReason).toContain("not clean");
	});

	it("missing task branch fails the merge stage with an actionable message", async () => {
		const store = branchStore();
		const task = store.createTask("p1", {
			goal: "Nothing to merge",
			stageId: "merge-1",
			projectCwd: tempCwd,
		});
		const stages = [
			{ id: "dev", name: "Dev", type: "agent", failback: "start" },
			{ id: "merge-1", name: "Merge to Main", type: "merge", failback: "dev" },
		];
		gitHelpers.branchExists.mockResolvedValue(false);

		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			execRunner: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
		});

		expect(task.failureReason).toContain("does not exist");
		expect(task.currentStageId).toBe("dev");
	});

	it("merge stage without branch mode still merges the derived branch (kb/<taskId>)", async () => {
		const store = new TaskStore(); // branch mode OFF
		const task = store.createTask("p1", {
			goal: "Derived merge",
			stageId: "merge-1",
			projectCwd: tempCwd,
		});
		const stages = [
			{ id: "merge-1", name: "Merge to Main", type: "merge", failback: "abort" },
		];
		const executed = [];
		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			execRunner: async (cmd) => {
				executed.push(cmd);
				return { stdout: "ok", stderr: "", exitCode: 0 };
			},
		});

		expect(result.status).toBe("passed");
		// The merge stage operates on the derived task branch even without the flag.
		expect(gitHelpers.squashMergeBranch).toHaveBeenCalledWith(
			tempCwd,
			`kb/${task.id}`,
			{ commitMessage: expect.stringContaining(`Kainbain-Task: ${task.id}`) },
		);
		// Git-only merge: no command is ever dispatched.
		expect(executed).toEqual([]);
	});

	it("resolveStageTimeout maps merge to the merge timeout config", () => {
		expect(resolveStageTimeout({ type: "merge" }, "merge")).toBe(config.mergeTimeoutMs);
		expect(resolveStageTimeout({ type: "merge", timeout: 12345 }, "merge")).toBe(12345);
	});

	describe("Log storage bounding (entries are the single storage path)", () => {
		it("stores each chunk as one structured entry with no rendered text copy", () => {
			const task = {};
			_appendProcessLog(task, "[INFO] boot");

			expect(task.logEntries.map((e) => e.text)).toEqual(["[INFO] boot"]);
			// The rendered-text copy is gone: nothing appends to or stores a
			// `processLogs` string.
			expect(task).not.toHaveProperty("processLogs");
			// Every text need renders from entries through the shared helper.
			expect(renderLogEntriesText(task.logEntries)).toBe("[INFO] boot");
		});

		it("keeps entries bounded by config.logEntriesMaxCount as chunks accumulate", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", { goal: "Log stream test", stageId: "1" });

			for (let i = 0; i < config.logEntriesMaxCount + 10; i++) {
				_appendProcessLog(task, `Step ${i}: ${"X".repeat(50)}`);
				expect(task.logEntries.length).toBeLessThanOrEqual(config.logEntriesMaxCount);
			}

			const texts = task.logEntries.map((e) => e.text);
			// The most recent chunk survives; growth stays bounded.
			expect(texts.at(-1)).toContain("Step 509");
			expect(texts.some((t) => t.includes("Step 0:"))).toBe(false);
		});

		it("appendProcessLog method on TaskStore appends one structured entry per chunk", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", { goal: "Store method test", stageId: "1" });

			store.appendProcessLog("p1", task.id, "Initial log line");
			expect(task.logEntries.map((e) => e.text)).toEqual(["Initial log line"]);

			store.appendProcessLog("p1", task.id, "Second log line");
			expect(task.logEntries.map((e) => e.text)).toEqual([
				"Initial log line",
				"Second log line",
			]);
		});
	});

	describe("Task log feed contract (getTaskLogFeed)", () => {
		function feedTask() {
			const store = new TaskStore();
			const task = store.createTask("p1", { goal: "Feed contract", stageId: "1" });
			_appendProcessLog(task, "[AGENT] narrative");
			_appendProcessLog(task, "[THINKING] hidden deliberation");
			_appendProcessLog(task, "[TOOL] bash(\"ls\")");
			return { store, task };
		}

		it("serves each feed as structured entries", () => {
			const { store, task } = feedTask();
			for (const feed of ["main", "thinking", "tools"]) {
				const payload = store.getTaskLogFeed("p1", task.id, { feed, format: "entries" });
				expect(payload).toMatchObject({ taskId: task.id, feed, format: "entries" });
			}
			const main = store.getTaskLogFeed("p1", task.id, { feed: "main" });
			expect(main.entries.map((e) => e.text)).toEqual(["[AGENT] narrative"]);
			const thinking = store.getTaskLogFeed("p1", task.id, { feed: "thinking" });
			expect(thinking.entries.map((e) => e.text)).toEqual(["[THINKING] hidden deliberation"]);
			const tools = store.getTaskLogFeed("p1", task.id, { feed: "tools" });
			expect(tools.entries.map((e) => e.text)).toEqual(['[TOOL] bash("ls")']);
		});

		it("serves each feed as a derived text view (never stored)", () => {
			const { store, task } = feedTask();
			expect(store.getTaskLogFeed("p1", task.id, { feed: "main", format: "text" }).text).toBe("[AGENT] narrative");
			expect(store.getTaskLogFeed("p1", task.id, { feed: "thinking", format: "text" }).text).toBe("[THINKING] hidden deliberation");
			expect(store.getTaskLogFeed("p1", task.id, { feed: "tools", format: "text" }).text).toBe('[TOOL] bash("ls")');
			// The task still carries no rendered text copy.
			expect(task).not.toHaveProperty("processLogs");
		});

		it("falls back to parsing legacy processLogs text for pre-migration tasks", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", { goal: "Legacy feed", stageId: "1" });
			task.processLogs = "[INFO] boot\n[TOOL] bash(\"ls\")\n[TOOL] bash(\"ls\")\n[RESULT] ok";
			delete task.logEntries;

			const tools = store.getTaskLogFeed("p1", task.id, { feed: "tools" });
			expect(tools.entries.map((e) => e.text)).toEqual(['[TOOL] bash("ls")', "[RESULT] ok"]);
			expect(tools.entries[0].kind).toBe("tool");

			const text = store.getTaskLogFeed("p1", task.id, { feed: "tools", format: "text" });
			expect(text.text).toBe('[TOOL] bash("ls")\n[RESULT] ok');
		});

		it("returns null for an unknown task", () => {
			const store = new TaskStore();
			expect(store.getTaskLogFeed("p1", "nope", {})).toBeNull();
		});
	});

	describe("Structured log entries (task.logEntries)", () => {
		it("mirrors process log chunks into structured entries with the tag grammar", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", { goal: "Entry mirror test", stageId: "1" });

			_appendProcessLog(task, "[INFO] Booting stage");
			_appendProcessLog(task, "[TOOL] bash(\"npm test\")");
			_appendProcessLog(task, "[ERROR] tests failed");
			_appendProcessLog(task, "Plain assistant narrative");

			expect(task.logEntries.map((e) => e.kind)).toEqual([
				"system",
				"tool",
				"error",
				"assistant",
			]);
			expect(task.logEntries[1]).toMatchObject({
				feed: "tools",
				feeds: ["tools"],
				text: '[TOOL] bash("npm test")',
			});
			expect(task.logEntries.every((e) => e.id && e.ts)).toBe(true);
		});

		it("caps task.logEntries to config.logEntriesMaxCount with an eviction marker", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", { goal: "Entry cap test", stageId: "1" });

			const entryCount = config.logEntriesMaxCount + 25;
			for (let i = 0; i < entryCount; i++) {
				_appendProcessLog(task, `[INFO] entry ${i}`);
			}

			expect(task.logEntries.length).toBe(config.logEntriesMaxCount);
			const marker = task.logEntries[0];
			expect(marker.kind).toBe("system");
			expect(marker.meta.evictedCount).toBe(26);
			expect(marker.text).toContain("26 earlier log entries evicted");
			// The most recent entries survive.
			expect(task.logEntries.at(-1).text).toBe(`[INFO] entry ${entryCount - 1}`);
		});

		it("replaces the agent stage's synthesized entries with the runner's structured entries", async () => {
			const store = new TaskStore();
			const task = store.createTask("p1", {
				goal: "Structured entries test",
				stageId: "1",
				projectCwd: tempCwd,
			});
			const agentStages = [
				{ id: "1", name: "Idea", type: "agent", prompt: "Generate", failback: "start" },
			];

			const structuredEntries = [
				{ id: 1, ts: "t", feed: "main", feeds: ["main"], kind: "system", turn: 1, text: "[AGENT] reasoning…", meta: {} },
				{ id: 2, ts: "t", feed: "main", feeds: ["main"], kind: "assistant", turn: 1, text: "The plan.", meta: {} },
				{ id: 3, ts: "t", feed: "tools", feeds: ["main", "tools"], kind: "tool", turn: 1, text: "[TOOL] read(\"x\")", meta: { toolCallId: "tc-1" } },
			];
			const mockAgentRunner = async (prompt, { onChunk }) => {
				onChunk("[TOOL] read(\"x\")");
				onChunk("raw narrative fragment");
				return { output: "done", logEntries: structuredEntries };
			};

			await store.executeStage("p1", task.id, {
				stages: agentStages,
				projectCwd: tempCwd,
				agentRunner: mockAgentRunner,
			});

			// The synthesized onChunk entries were replaced by the structured ones
			// (the pre-stage dispatch line stays ahead of them).
			expect(task.logEntries).toHaveLength(4);
			expect(task.logEntries[3].meta.toolCallId).toBe("tc-1");
			expect(task.logEntries[2].text).toBe("The plan.");
			// The derived text view still carries the streamed blocks.
			expect(logText(task)).toContain('[TOOL] read("x")');
		});

		it("keeps synthesized entries when a legacy string runner returns no logEntries", async () => {
			const store = new TaskStore();
			const task = store.createTask("p1", {
				goal: "Legacy runner test",
				stageId: "1",
				projectCwd: tempCwd,
			});
			const agentStages = [
				{ id: "1", name: "Idea", type: "agent", prompt: "Generate", failback: "start" },
			];

			const mockAgentRunner = async (prompt, { onChunk }) => {
				onChunk("[AGENT] Working");
				return "plain string result";
			};

			await store.executeStage("p1", task.id, {
				stages: agentStages,
				projectCwd: tempCwd,
				agentRunner: mockAgentRunner,
			});

			expect(task.logEntries.some((e) => e.text === "[AGENT] Working")).toBe(true);
		});
	});

	describe("Log entries markdown round-trip", () => {
		it("serializes only # Log Entries (no rendered text section) and reparses it", () => {
			const store = new TaskStore();
			const task = store.createTask("p1", {
				goal: "Round trip test",
				stageId: "1",
				projectCwd: tempCwd,
			});
			task.logEntries = [
				{ id: 1, ts: "2026-01-01T00:00:00.000Z", feed: "main", feeds: ["main"], kind: "assistant", turn: 1, text: "narrative line", meta: {} },
				{ id: 2, ts: "2026-01-01T00:00:01.000Z", feed: "tools", feeds: ["main", "tools"], kind: "tool", turn: 1, text: "[TOOL] write(\"a\")", meta: { toolCallId: "tc-9" } },
			];
			store._saveTaskMarkdown(tempCwd, task);

			const raw = fs.readFileSync(path.join(tempCwd, "docs", "tasks", task.id, "task.md"), "utf8");
			expect(raw).toContain("# Log Entries");
			// The rendered `# Process Logs` section is no longer written: the
			// structured entries are the single persisted log representation.
			expect(raw).not.toContain("# Process Logs");

			const reparsed = store._parseTaskMarkdown(raw, task.id, "p1");
			expect(reparsed.logEntries).toHaveLength(2);
			expect(reparsed.logEntries[1]).toMatchObject({
				kind: "tool",
				meta: { toolCallId: "tc-9" },
			});
			// The parsed task carries no rendered text copy either.
			expect(reparsed).not.toHaveProperty("processLogs");
		});

		it("synthesizes entries from a legacy markdown file with only # Process Logs", () => {
			const store = new TaskStore();
			const legacy = [
				"---",
				"id: legacy-1",
				"projectId: p1",
				"title: Legacy Task",
				"status: in_stage",
				"---",
				"",
				"# Goal",
				"Old goal",
				"",
				"# Process Logs",
				"[AGENT] old narrative",
				"[TOOL] write(\"x\")",
			].join("\n");

			const parsed = store._parseTaskMarkdown(legacy, "legacy-1", "p1");
			// Legacy text is converted to entries at load (the single storage
			// path) and never carried as text on the task.
			expect(parsed.logEntries.map((e) => e.text)).toEqual([
				"[AGENT] old narrative",
				"[TOOL] write(\"x\")",
			]);
			expect(parsed.logEntries[1].kind).toBe("tool");
			expect(parsed).not.toHaveProperty("processLogs");
		});

		it("tolerates a corrupt # Log Entries section and falls back to the legacy text", () => {
			const store = new TaskStore();
			const corrupt = [
				"---",
				"id: corrupt-1",
				"projectId: p1",
				"title: Corrupt Task",
				"status: in_stage",
				"---",
				"",
				"# Goal",
				"Goal",
				"",
				"# Process Logs",
				"[INFO] log text",
				"",
				"# Log Entries",
				"```json",
				"{ this is not valid json",
				"```",
			].join("\n");

			const parsed = store._parseTaskMarkdown(corrupt, "corrupt-1", "p1");
			expect(parsed.logEntries.map((e) => e.text)).toEqual(["[INFO] log text"]);
			expect(parsed).not.toHaveProperty("processLogs");
		});

		it("prefers the structured section over legacy text when both exist", () => {
			const store = new TaskStore();
			const both = [
				"---",
				"id: both-1",
				"projectId: p1",
				"title: Both Task",
				"status: in_stage",
				"---",
				"",
				"# Goal",
				"Goal",
				"",
				"# Process Logs",
				"[INFO] stale text",
				"",
				"# Log Entries",
				"```json",
				JSON.stringify([
					{ id: 1, ts: "2026-01-01T00:00:00.000Z", feed: "main", feeds: ["main"], kind: "assistant", turn: 1, text: "structured entry", meta: {} },
				]),
				"```",
			].join("\n");

			const parsed = store._parseTaskMarkdown(both, "both-1", "p1");
			expect(parsed.logEntries.map((e) => e.text)).toEqual(["structured entry"]);
		});
	});
});


	it("parks a task as failed after the default budget of 8 auto-iterations is exhausted (R1b)", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", {
			title: "Default Budget Test",
			goal: "Verify default auto-iteration limit",
			stageId: "impl",
		});

		const stages = [
			{ id: "design", name: "Design", type: "agent", failback: "start" },
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				fallbackStageId: "design",
			},
		];

		const runner = async () => {
			throw new Error("Persistent failure");
		};

		// No override of config.maxAutoIterations.
		expect(config.maxAutoIterations).toBe(8);

		for (let i = 0; i < 8; i++) {
			const res = await store.executeStage("p1", task.id, {
				stages,
				agentRunner: runner,
			});
			expect(res.status).toBe("retrying");
		}

		// 9th attempt should park it as failed.
		const finalRes = await store.executeStage("p1", task.id, {
			stages,
			agentRunner: runner,
		});
		expect(finalRes.status).toBe("failed");
		expect(task.status).toBe("failed");
		expect(task.autoIterationCount).toBe(9);
	});

/***
 * MARK: Stage history human-readable labels
 * @description Verifies that task history, timeline, and process-log entries
 * record the human-readable stage name (quoted) instead of the positional
 * stage id, since stage ids/order can change while a task is in flight.
 * Legacy id fallbacks are preserved wherever stages cannot be resolved
 * (e.g. no projectStore attached) and persisted entries are never rewritten.
 ***/
describe("Stage history human-readable labels", () => {
	let tempCwd;

	const labelStages = [
		{ id: "1", name: "Idea", type: "agent", failback: "start" },
		{ id: "2", name: "Technical Elab", type: "agent", failback: "previous" },
		{ id: "3", name: "Plan", type: "agent", failback: "previous" },
		{ id: "4", name: "Deploy", type: "deploy", failback: "previous" },
	];

	const mockLabelProjectStore = {
		listProjects: () => [{ id: "p1", cwd: tempCwd, stages: labelStages }],
		getProject: () => ({ id: "p1", cwd: tempCwd, stages: labelStages }),
	};

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-label-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	});

	describe("resolveStageLabel", () => {
		it("resolves a stage id to its human-readable name", () => {
			expect(resolveStageLabel("1", labelStages)).toBe("Idea");
			expect(resolveStageLabel("4", labelStages)).toBe("Deploy");
		});

		it("resolves a stage name case-insensitively to the canonical name", () => {
			expect(resolveStageLabel("technical elab", labelStages)).toBe(
				"Technical Elab",
			);
			expect(resolveStageLabel("IDEA", labelStages)).toBe("Idea");
		});

		it("returns an unknown reference unchanged", () => {
			expect(resolveStageLabel("42", labelStages)).toBe("42");
			expect(resolveStageLabel("Mystery", labelStages)).toBe("Mystery");
		});

		it("returns 'unknown' for an empty or absent reference", () => {
			expect(resolveStageLabel("", labelStages)).toBe("unknown");
			expect(resolveStageLabel(undefined, labelStages)).toBe("unknown");
			expect(resolveStageLabel(null, labelStages)).toBe("unknown");
		});

		it("returns the reference unchanged when no stages are available", () => {
			expect(resolveStageLabel("1", [])).toBe("1");
			expect(resolveStageLabel("1", undefined)).toBe("1");
		});
	});

	it("records the stage name when creating a task with a resolvable stage", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const task = store.createTask("p1", {
			title: "Named Creation",
			goal: "Creation should use the stage name",
			stageId: "1",
		});
		expect(task.history[0].action).toBe("Created and placed in stage 'Idea'");
		expect(task.history[0].action).not.toContain("stage 1");
	});

	it("keeps the plain 'Created' action when a task has no stage", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const task = store.createTask("p1", {
			title: "No Stage Creation",
			goal: "Creation without a stage",
		});
		expect(task.history[0].action).toBe("Created");
	});

	it("records stage names in history, timeline, and process log when moving a task", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const task = store.createTask("p1", {
			title: "Move Me",
			goal: "Move should use stage names",
			stageId: "1",
		});
		const moved = store.moveToStage("p1", task.id, "2", "Moved");

		expect(moved.history[moved.history.length - 1].action).toBe(
			"Moved to stage 'Technical Elab'",
		);
		const lastTimeline = moved.timeline[moved.timeline.length - 1];
		expect(lastTimeline.stage).toBe("Technical Elab");
		expect(lastTimeline.status).toBe("Moved");
		expect(logText(moved)).toContain(
			"[INFO] Moved from stage 'Idea' to stage 'Technical Elab'",
		);
	});

	it("records the next stage name when advancing a task", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const task = store.createTask("p1", {
			title: "Advance Me",
			goal: "Advance should use stage names",
			stageId: "2",
			projectCwd: tempCwd,
		});
		const advanced = store.advanceStage(
			"p1",
			task.id,
			labelStages,
			undefined,
			tempCwd,
		);

		expect(advanced.history[advanced.history.length - 1].action).toBe(
			"Advanced to stage 'Plan'",
		);
		const lastTimeline = advanced.timeline[advanced.timeline.length - 1];
		expect(lastTimeline.stage).toBe("Plan");
		expect(lastTimeline.status).toBe("Advanced");
	});

	it("records the current stage name in the completion timeline", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const task = store.createTask("p1", {
			title: "Complete Me",
			goal: "Completion should use the stage name",
			stageId: "2",
		});
		const completed = store.completeTask("p1", task.id);

		const lastTimeline = completed.timeline[completed.timeline.length - 1];
		expect(lastTimeline.stage).toBe("Technical Elab");
		expect(lastTimeline.status).toBe("Completed");
	});

	it("keeps the 'Final Stage' timeline fallback when no stage is set", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const task = store.createTask("p1", {
			title: "Final Stage Fallback",
			goal: "Completion without a stage",
		});
		const completed = store.completeTask("p1", task.id);

		const lastTimeline = completed.timeline[completed.timeline.length - 1];
		expect(lastTimeline.stage).toBe("Final Stage");
	});

	it("records the failing stage name in the failure history", () => {
		const store = new TaskStore({
			eventBridge: { emitProcessEvent: () => {} },
			projectStore: mockLabelProjectStore,
		});
		const task = store.createTask("p1", {
			title: "Fail Me",
			goal: "Failure should use the stage name",
			stageId: "4",
		});
		store.handleStageFailure(
			"p1",
			task.id,
			labelStages[3],
			new Error("boom"),
			{ stages: labelStages, projectCwd: tempCwd },
		);

		expect(task.history[1].action).toBe("Stage failed in 'Deploy': boom");
	});

	it("resolves the interrupted stage name during recovery when stages are resolvable", () => {
		const store = new TaskStore({ projectStore: mockLabelProjectStore });
		const taskId = "recovery-label-task";
		const taskDir = path.join(tempCwd, "docs", "tasks", taskId);
		fs.mkdirSync(taskDir, { recursive: true });
		fs.writeFileSync(
			path.join(taskDir, "task.md"),
			[
				"---",
				`id: "${taskId}"`,
				'projectId: "p1"',
				'title: "Recovery Label"',
				'status: "running_agent"',
				'currentStageId: "1"',
				'workflowId: "wf-default"',
				"---",
				"# Goal",
				"Recovery should use the stage name",
				"",
			].join("\n"),
			"utf8",
		);

		const rehydrated = store.scanTasks("p1", tempCwd);
		const task = rehydrated.find((t) => t.id === taskId);
		expect(task.wasInterrupted).toBe(true);
		expect(
			task.history.some((h) =>
				h.action.includes("interrupted at stage 'Idea'"),
			),
		).toBe(true);
	});

	it("falls back to the raw stage id during recovery when stages cannot be resolved", () => {
		const store = new TaskStore();
		const taskId = "recovery-fallback-task";
		const taskDir = path.join(tempCwd, "docs", "tasks", taskId);
		fs.mkdirSync(taskDir, { recursive: true });
		fs.writeFileSync(
			path.join(taskDir, "task.md"),
			[
				"---",
				`id: "${taskId}"`,
				'projectId: "p1"',
				'title: "Recovery Fallback"',
				'status: "running_agent"',
				'currentStageId: "1"',
				'workflowId: "wf-default"',
				"---",
				"# Goal",
				"Recovery falls back to the id",
				"",
			].join("\n"),
			"utf8",
		);

		const rehydrated = store.scanTasks("p1", tempCwd);
		const task = rehydrated.find((t) => t.id === taskId);
		expect(task.wasInterrupted).toBe(true);
		expect(
			task.history.some((h) => h.action.includes("interrupted at stage '1'")),
		).toBe(true);
	});
});

/***
 * MARK: Legacy stage history compatibility
 * @description Guards the append-only audit contract: task.md entries written
 * before stage names were recorded (bare numeric ids, unquoted) must still
 * parse byte-identically and are never rewritten on disk.
 ***/
describe("Legacy stage history compatibility", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-legacy-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup errors
		}
	});

	it("still parses legacy unquoted stage history and timeline entries verbatim", () => {
		const store = new TaskStore();
		const legacyMarkdown = [
			"---",
			'id: "legacy-task"',
			'projectId: "p1"',
			'title: "Legacy Task"',
			'status: "in_stage"',
			'currentStageId: "2"',
			"---",
			"# Goal",
			"Legacy entries must keep parsing",
			"",
			"# History",
			"- 2026-08-28T07:45:42.125Z: Created and placed in stage 1",
			"- 2026-08-28T07:46:12.125Z: Advanced to stage 2",
			"",
			"# Timeline",
			"- 2026-08-28T07:46:12.125Z: 1 | Advanced | 2m",
			"",
		].join("\n");

		const taskDir = path.join(tempCwd, "docs", "tasks", "legacy-task");
		fs.mkdirSync(taskDir, { recursive: true });
		fs.writeFileSync(path.join(taskDir, "task.md"), legacyMarkdown, "utf8");

		const originalContent = fs.readFileSync(
			path.join(taskDir, "task.md"),
			"utf8",
		);
		const rehydrated = store.scanTasks("p1", tempCwd);
		const task = rehydrated.find((t) => t.id === "legacy-task");

		// Legacy entries are read verbatim, never rewritten (append-only audit)
		expect(task.history).toHaveLength(2);
		expect(task.history[0].action).toBe("Created and placed in stage 1");
		expect(task.history[1].action).toBe("Advanced to stage 2");
		expect(task.timeline).toHaveLength(1);
		expect(task.timeline[0]).toEqual({
			stage: "1",
			status: "Advanced",
			duration: "2m",
			timestamp: "2026-08-28T07:46:12.125Z",
		});
		expect(fs.readFileSync(path.join(taskDir, "task.md"), "utf8")).toBe(
			originalContent,
		);
	});

	// --- Harness-scoped model keys: stored references keep dispatching ---
	it("dispatches a stage with a stored legacy provider::id model through the real runner without data migration", async () => {
		const { createAgentRunner } = await import("./agentRunner.js");

		// The pi harness session contract surface (mocked): the snapshot is
		// tagged harness-scoped (as listModels now emits) and reports the
		// owning harness id.
		const glm = {
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
			key: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			harness: "pi",
		};
		const mockSession = {
			harnessId: "pi",
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
			subscribe: () => () => {},
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [glm],
		};
		// The REAL runner: the stored reference must survive the round-trip
		// taskStore → agentRunner → harness and switch to the right model.
		const realRunner = createAgentRunner({
			getOrCreateSession: async () => mockSession,
		});

		const legacyStages = [
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				failback: "previous",
				// Stored BEFORE harness-scoped keys existed: legacy 2-part form.
				model: "ollama-cloud-direct::glm-5.3-flash:cloud",
			},
		];
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Model task", stageId: "impl" });

		await store.executeStage("p1", task.id, {
			stages: legacyStages,
			projectCwd: tempCwd,
			agentRunner: realRunner,
		});

		// The stored legacy key switched the session to the exact model —
		// no stored data was rewritten to make that happen.
		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
		expect(logText(task)).not.toContain("is not available");
	});

	it("dispatches a stage with a stored canonical harness::provider::id model", async () => {
		const { createAgentRunner } = await import("./agentRunner.js");

		const glm = {
			provider: "ollama-cloud-direct",
			id: "glm-5.3-flash:cloud",
			key: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			harness: "pi",
		};
		const mockSession = {
			harnessId: "pi",
			prompt: vi.fn().mockResolvedValue("done"),
			messages: [{ role: "assistant", content: "done" }],
			subscribe: () => () => {},
			getActiveModel: async () => ({
				provider: "ollama-cloud",
				id: "deepseek-v4-flash:0731-cloud",
			}),
			switchModel: vi.fn().mockResolvedValue(glm),
			listModels: async () => [glm],
		};
		const realRunner = createAgentRunner({
			getOrCreateSession: async () => mockSession,
		});

		const canonicalStages = [
			{
				id: "impl",
				name: "Implementation",
				type: "agent",
				failback: "start",
				model: "pi::ollama-cloud-direct::glm-5.3-flash:cloud",
			},
		];
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Canonical model", stageId: "impl" });

		await store.executeStage("p1", task.id, {
			stages: canonicalStages,
			projectCwd: tempCwd,
			agentRunner: realRunner,
		});

		expect(mockSession.switchModel).toHaveBeenCalledWith(glm);
	});
});

/***
 * MARK: reliability attribution tests
 * @description Proves each agent run records its harness and outcome kind on
 *   the stage report: clean runs store `failureKind: "none"`, deliberate
 *   agent rejections store `"rejected"`, and infrastructure breakdowns store
 *   `"infrastructure"` — including transient same-stage retries, where the
 *   failed attempt still counts. Unattributed runs (legacy runners without
 *   the fields) keep the old report shape with no extra entries.
 ***/
describe("TaskStore reliability attribution", () => {
	let tempCwd;

	beforeEach(() => {
		tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-reliability-test-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempCwd, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("records the harness and clean outcome on a passed agent report", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Idea defined.",
				failed: false,
				failureKind: "none",
				harnessId: "pi",
				modifiedFiles: [],
			}),
		});

		expect(result.status).toBe("passed");
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "PASSED",
			harnessId: "pi",
			failureKind: "none",
		});
	});

	it("records deliberate agent rejections with the rejected kind", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Needs rework.",
				failed: true,
				failureReason: "[Agent Review Rejection] The plan is incomplete",
				failureKind: "rejected",
				harnessId: "custom",
				modifiedFiles: [],
			}),
		});

		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "FAILED",
			harnessId: "custom",
			failureKind: "rejected",
		});
	});

	it("records the failed attempt of a transient infrastructure retry", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "[Timeout Error] Stage execution timed out",
				failed: true,
				failureReason: "[Timeout Error] Stage execution timed out",
				failureKind: "infrastructure",
				harnessId: "pi",
				modifiedFiles: [],
			}),
		});

		expect(result.status).toBe("retrying");
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "FAILED",
			harnessId: "pi",
			failureKind: "infrastructure",
		});
	});

	it("leaves unattributed transient retries without a new report", async () => {
		const store = new TaskStore();
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "socket hang up",
				failed: true,
				failureReason: "socket hang up",
				modifiedFiles: [],
			}),
		});

		expect(result.status).toBe("retrying");
		expect(task.reports).toHaveLength(0);
	});

	it("falls back to the resolved harness when the session reported none", async () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd, harness: "pi" }) };
		const store = new TaskStore({ projectStore });
		store.sessionStore = {
			resolveDisplayTarget: () => ({ harnessName: "pi" }),
		};
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Idea defined.",
				failed: false,
				failureKind: "none",
				modifiedFiles: [],
			}),
		});

		expect(result.status).toBe("passed");
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "PASSED",
			harnessId: "pi",
			failureKind: "none",
		});
	});

	it("prefers the reported harness over the fallback resolution", async () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd, harness: "pi" }) };
		const store = new TaskStore({ projectStore });
		store.sessionStore = {
			resolveDisplayTarget: () => ({ harnessName: "pi" }),
		};
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Idea defined.",
				failed: false,
				failureKind: "none",
				harnessId: "muse",
				modifiedFiles: [],
			}),
		});

		expect(task.reports[0]).toMatchObject({
			harnessId: "muse",
			failureKind: "none",
		});
	});

	it("carries the fallback into failure routing for rejected runs", async () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd, harness: "pi" }) };
		const store = new TaskStore({ projectStore });
		store.sessionStore = {
			resolveDisplayTarget: () => ({ harnessName: "pi" }),
		};
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Needs rework.",
				failed: true,
				failureReason: "[Agent Review Rejection] The plan is incomplete",
				failureKind: "rejected",
				modifiedFiles: [],
			}),
		});

		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).toMatchObject({
			status: "FAILED",
			harnessId: "pi",
			failureKind: "rejected",
		});
	});

	it("never records a fallback outside the harness registry", async () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		const store = new TaskStore({ projectStore });
		store.sessionStore = {
			resolveDisplayTarget: () => ({ harnessName: "__injected__" }),
		};
		const task = store.createTask("p1", { goal: "Reliability", stageId: "1" });

		const result = await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Idea defined.",
				failed: false,
				failureKind: "none",
				modifiedFiles: [],
			}),
		});

		expect(result.status).toBe("passed");
		expect(task.reports).toHaveLength(1);
		expect(task.reports[0]).not.toHaveProperty("harnessId");
	});

	it("round-trips attribution through a fresh store reload", async () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		const store = new TaskStore({ projectStore });
		const task = store.createTask("p1", {
			goal: "Reliability",
			stageId: "1",
			projectCwd: tempCwd,
		});

		await store.executeStage("p1", task.id, {
			stages,
			projectCwd: tempCwd,
			agentRunner: async () => ({
				output: "Idea defined.",
				failed: false,
				failureKind: "none",
				harnessId: "pi",
				modifiedFiles: [],
			}),
		});

		const fresh = new TaskStore({ projectStore });
		fresh.scanTasks("p1", tempCwd);
		const loaded = fresh.getTask("p1", task.id);
		expect(loaded.reports[0]).toMatchObject({
			status: "PASSED",
			harnessId: "pi",
			failureKind: "none",
		});
	});

	it("round-trips per-alias attribution through a fresh store reload", async () => {
		const projectStore = { getProject: () => ({ stages, cwd: tempCwd }) };
		const store = new TaskStore({ projectStore });
		const task = store.createTask("p1", {
			goal: "Reliability",
			stageId: "1",
			projectCwd: tempCwd,
		});

		store.saveStageReport("p1", task.id, {
			stageName: "Work",
			stageId: "1",
			status: "FAILED",
			content: "# report",
			projectCwd: tempCwd,
			harnessId: "pi",
			failureKind: "infrastructure",
			aliasName: "worker",
			modelRef: "google::m1",
			targetIndex: 0,
		});

		const fresh = new TaskStore({ projectStore });
		fresh.scanTasks("p1", tempCwd);
		const loaded = fresh.getTask("p1", task.id);
		expect(loaded.reports[0]).toMatchObject({
			harnessId: "pi",
			failureKind: "infrastructure",
			aliasName: "worker",
			modelRef: "google::m1",
			targetIndex: 0,
		});
	});
});
