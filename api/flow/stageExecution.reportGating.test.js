/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";

/***
 * MARK: Stage success-report gating contract
 * @description Pins the opt-in reporting contract for agent stages:
 *   by default a successful agent stage writes NO report at all (neither
 *   the prompt instruction nor the engine's structured save fire). Only
 *   stages that opt in — via `stage.report: true` or the `stage-report`
 *   skill attachment — get exactly one structured PASSED report. Failure
 *   reports are unaffected and always written (with a `-failure-` filename
 *   infix) so every stage failure leaves a trace.
 ***/

function git(cwd, ...args) {
	return execFileSync("git", args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
	}).toString();
}

const tempDirs = [];
afterEach(() => {
	while (tempDirs.length > 0) {
		const dir = tempDirs.pop();
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore teardown errors
		}
	}
});

function makeStore() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-report-gating-"));
	tempDirs.push(dir);
	git(dir, "init", "-b", "master");
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
	const project = { id: "p1", name: "P1", cwd: dir, useBranches: false };
	const projectStore = { getProject: () => project };
	const store = new TaskStore({
		eventBridge: {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		},
		projectStore,
	});
	return { store, dir };
}

const SUCCESS_RUNNER = async () => ({
	output: "work done",
	summary: "work done successfully",
	harnessId: "pi",
	failureKind: "none",
	modifiedFiles: [],
});

const FAILING_RUNNER = async () => ({
	output: "boom",
	failed: true,
	failureReason: "boom: stage failed",
	failureKind: "rejected",
	harnessId: "pi",
});

describe("executeStage success-report gating", () => {
	it("writes NO report by default when an agent stage succeeds", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "default off",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: [{ id: "a1", name: "Work", type: "agent", prompt: "Do work" }],
			projectCwd: dir,
			agentRunner: SUCCESS_RUNNER,
		});

		expect(result.status).toBe("passed");
		const reports = store.getTaskReports("p1", task.id, dir);
		expect(reports).toHaveLength(0);
		expect(task.reports).toHaveLength(0);
		expect(task.outputReport || "").toBe("");
	});

	it("writes exactly one PASSED report when the stage opts in via `report: true`", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "opt in via report flag",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: [
				{ id: "a1", name: "Work", type: "agent", prompt: "Do work", report: true },
			],
			projectCwd: dir,
			agentRunner: SUCCESS_RUNNER,
		});

		expect(result.status).toBe("passed");
		const reports = store.getTaskReports("p1", task.id, dir);
		expect(reports).toHaveLength(1);
		expect(reports[0].status).toBe("PASSED");
		expect(reports[0].filename).toMatch(/^work-\d{8}-\d{6}\.md$/);
		expect(reports[0].content).toContain("# Stage Report");
	});

	it("writes exactly one PASSED report when the stage attaches the `stage-report` skill", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "opt in via skill",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: [
				{
					id: "a1",
					name: "Work",
					type: "agent",
					prompt: "Do work",
					skills: [{ name: "stage-report" }],
				},
			],
			projectCwd: dir,
			agentRunner: SUCCESS_RUNNER,
		});

		expect(result.status).toBe("passed");
		const reports = store.getTaskReports("p1", task.id, dir);
		expect(reports).toHaveLength(1);
		expect(reports[0].status).toBe("PASSED");
	});

	it("does not count an unrelated skill attachment as a reporting opt-in", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "unrelated skill is not reporting",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: [
				{
					id: "a1",
					name: "Work",
					type: "agent",
					prompt: "Do work",
					skills: [{ name: "stage-verdict" }],
				},
			],
			projectCwd: dir,
			agentRunner: SUCCESS_RUNNER,
		});

		expect(result.status).toBe("passed");
		expect(store.getTaskReports("p1", task.id, dir)).toHaveLength(0);
	});

	it("always writes a FAILED report with the `-failure-` filename infix, regardless of opt-in", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "failures still leave a trace",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: [
				{ id: "a1", name: "Work", type: "agent", prompt: "Do work", failback: "start" },
			],
			projectCwd: dir,
			agentRunner: FAILING_RUNNER,
		});

		expect(result.status).toBe("retrying");
		const reports = store.getTaskReports("p1", task.id, dir);
		expect(reports.length).toBeGreaterThan(0);
		const failureReports = reports.filter((r) => r.status === "FAILED");
		expect(failureReports.length).toBeGreaterThan(0);
		for (const failureReport of failureReports) {
			expect(failureReport.filename).toMatch(/^work-failure-\d{8}-\d{6}\.md$/);
			expect(failureReport.content.toUpperCase()).toContain("FAILED");
		}
	});

	it("failure report uses the `-failure-` infix even when the stage opted in", async () => {
		const { store, dir } = makeStore();
		const task = store.createTask("p1", {
			goal: "opted-in failure naming",
			stageId: "a1",
			projectCwd: dir,
		});

		const result = await store.executeStage("p1", task.id, {
			stages: [
				{
					id: "a1",
					name: "Work",
					type: "agent",
					prompt: "Do work",
					failback: "start",
					report: true,
				},
			],
			projectCwd: dir,
			agentRunner: FAILING_RUNNER,
		});

		expect(result.status).toBe("retrying");
		const reports = store.getTaskReports("p1", task.id, dir);
		const failureReports = reports.filter((r) => r.status === "FAILED");
		expect(failureReports.length).toBeGreaterThan(0);
		for (const failureReport of failureReports) {
			expect(failureReport.filename).toMatch(/^work-failure-\d{8}-\d{6}\.md$/);
		}
	});
});
