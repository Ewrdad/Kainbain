/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";
import { SessionStore } from "../sessionStore.js";

/***
 * MARK: Stage execution alias-attribution tests
 * @description Pins the per-alias reliability attribution plumbing: agent
 *   runs through a RESOLVED alias record aliasName + modelRef + targetIndex
 *   on their stage reports (success, infrastructure-failure, and
 *   agent-chosen-failure alike), while runs through an UNRESOLVABLE alias
 *   (project-default fallback) record no alias attribution — the fallback
 *   run is never credited to the named alias.
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

function makeAliasStore() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-attribution-"));
	tempDirs.push(dir);
	fs.mkdirSync(dir, { recursive: true });
	git(dir, "init", "-b", "master");
	git(dir, "config", "user.email", "kainbain-test@example.com");
	git(dir, "config", "user.name", "KainBain Test");
	fs.writeFileSync(path.join(dir, "README.md"), "# init\n");
	git(dir, "add", "-A");
	git(dir, "commit", "-m", "init");
	const project = {
		id: "p1",
		name: "P1",
		cwd: dir,
		useBranches: false,
		harness: "pi",
		defaultModel: "llama-cloud-direct::glm-5.3-flash:cloud",
		modelAliases: [
			{ name: "worker", harness: "antigravity", model: "gemini-3.8-flash-low" },
		],
	};
	const store = new TaskStore({
		eventBridge: {
			emitProcessEvent: () => {},
			emitSystemLog: () => {},
			emitNotification: () => {},
		},
		projectStore: { getProject: () => project },
	});
	store.sessionStore = new SessionStore();
	return { store, dir };
}

const ALIAS_STAGES = [
	{
		id: "a1",
		name: "Work",
		type: "agent",
		prompt: "Do work",
		harness: "alias",
		model: "worker",
		// Opt into reporting so the success report (and its alias attribution)
		// is still written — success reports are opt-in since the auto-report
		// cleanup; these tests pin the attribution fields on the report.
		report: true,
	},
];

function lastReport(store, projectId, taskId) {
	const task = store.getTask(projectId, taskId);
	expect(Array.isArray(task.reports) && task.reports.length > 0).toBe(true);
	return task.reports[task.reports.length - 1];
}

describe("executeStage alias attribution", () => {
	it("records alias attribution on the success report", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "alias attribution success",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => ({
				output: "agent finished",
				harnessId: "antigravity",
				failureKind: "none",
			}),
		});

		const report = lastReport(store, "p1", task.id);
		expect(report.status).toBe("PASSED");
		expect(report.harnessId).toBe("antigravity");
		expect(report.failureKind).toBe("none");
		expect(report.aliasName).toBe("worker");
		expect(report.modelRef).toBe("gemini-3.8-flash-low");
		expect(Number.isInteger(report.targetIndex) && report.targetIndex >= 0).toBe(true);
	});

	it("records alias attribution on the infrastructure-failure attempt report", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "alias attribution infra failure",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => ({
				output: "[Timeout Error] Stage execution timed out: boom",
				failed: true,
				failureReason: "[Timeout Error] Stage execution timed out: boom",
				failureKind: "infrastructure",
				harnessId: "antigravity",
			}),
		});

		const report = lastReport(store, "p1", task.id);
		expect(report.failureKind).toBe("infrastructure");
		expect(report.harnessId).toBe("antigravity");
		expect(report.aliasName).toBe("worker");
		expect(report.modelRef).toBe("gemini-3.8-flash-low");
		expect(Number.isInteger(report.targetIndex) && report.targetIndex >= 0).toBe(true);
	});

	it("records alias attribution on the agent-chosen failure report", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "alias attribution rejected failure",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => ({
				output: "review complete",
				failed: true,
				failureReason: "[Agent Review Rejection] Does not meet the bar",
				failureKind: "rejected",
				harnessId: "antigravity",
			}),
		});

		const report = lastReport(store, "p1", task.id);
		expect(report.status).toBe("FAILED");
		expect(report.failureKind).toBe("rejected");
		expect(report.aliasName).toBe("worker");
		expect(report.modelRef).toBe("gemini-3.8-flash-low");
	});

	it("records alias attribution when the runner throws a transient infrastructure error", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "alias attribution thrown timeout",
			stageId: "a1",
			projectCwd: dir,
		});

		// Loop-guard aborts, timeouts and connectivity blows up surface as
		// THROWN errors (no runner result): the attempt must still count
		// against the alias target instead of vanishing from the rate.
		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => {
				throw new Error("[Timeout Error] Stage execution timed out: boom");
			},
		});

		const report = lastReport(store, "p1", task.id);
		expect(report.status).toBe("FAILED");
		expect(report.failureKind).toBe("infrastructure");
		expect(report.harnessId).toBe("antigravity");
		expect(report.aliasName).toBe("worker");
		expect(report.modelRef).toBe("gemini-3.8-flash-low");
		expect(Number.isInteger(report.targetIndex) && report.targetIndex >= 0).toBe(true);
	});

	it("keeps alias attribution without inventing a kind when the runner throws an unexpected error", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "alias attribution unexpected throw",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => {
				throw new Error("kaboom: something unclassifiable broke");
			},
		});

		// The run truthfully records WHICH alias threw, but claims no
		// outcome kind — the rate ignores kindless reports rather than
		// guessing.
		const report = lastReport(store, "p1", task.id);
		expect(report.status).toBe("FAILED");
		expect(report.failureKind).toBeUndefined();
		expect(report.aliasName).toBe("worker");
		expect(report.modelRef).toBe("gemini-3.8-flash-low");
	});

	it("leaves fallback runs unattributed when the alias does not resolve", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "alias attribution miss",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: [
				{
					id: "a1",
					name: "Work",
					type: "agent",
					prompt: "Do work",
					harness: "alias",
					model: "ghost",
					report: true,
				},
			],
			projectCwd: dir,
			agentRunner: async () => ({
				output: "agent finished",
				harnessId: "pi",
				failureKind: "none",
			}),
		});

		const report = lastReport(store, "p1", task.id);
		expect(report.status).toBe("PASSED");
		expect(report.aliasName).toBeUndefined();
		expect(report.modelRef).toBeUndefined();
		expect(report.targetIndex).toBeUndefined();
	});
});

describe("executeStage timeline run attribution", () => {
	it("stamps the resolved choice on task.currentRunAttribution at dispatch", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "pending attribution",
			stageId: "a1",
			projectCwd: dir,
		});
		let pendingAtDispatch = undefined;

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async (prompt, { onChunk }) => {
				// Mid-run: dispatch has stamped the pending choice, the
				// transition that would consume it has not run yet.
				pendingAtDispatch = store.getTask("p1", task.id).currentRunAttribution;
				onChunk?.("running");
				return {
					output: "agent finished",
					harnessId: "antigravity",
					failureKind: "none",
				};
			},
		});

		expect(pendingAtDispatch).toEqual({
			stageId: "a1",
			harnessId: "antigravity",
			modelRef: "gemini-3.8-flash-low",
			aliasName: "worker",
			targetIndex: 0,
		});
	});

	it("consumes the pending choice on the Completed row (same values as the report)", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "completed row attribution",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => ({
				output: "agent finished",
				harnessId: "antigravity",
				failureKind: "none",
			}),
		});

		const after = store.getTask("p1", task.id);
		const completedRow = (after.timeline || []).find(
			(entry) => entry.status === "Completed",
		);
		expect(completedRow).toBeTruthy();
		const report = lastReport(store, "p1", task.id);
		expect(completedRow.harnessId).toBe(report.harnessId);
		expect(completedRow.modelRef).toBe(report.modelRef);
		expect(completedRow.aliasName).toBe(report.aliasName);
		expect(completedRow.targetIndex).toBe(report.targetIndex);
		// Consumed by the terminal row: nothing left pending.
		expect(after.currentRunAttribution).toBeNull();
	});

	it("stamps the Failed outcome row but leaves the failback arrival row blank", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "failure row attribution",
			stageId: "a1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => ({
				output: "review complete",
				failed: true,
				failureReason: "[Agent Review Rejection] Does not meet the bar",
				failureKind: "rejected",
				harnessId: "antigravity",
			}),
		});

		const after = store.getTask("p1", task.id);
		const failedRow = (after.timeline || []).find(
			(entry) => entry.status === "Failed",
		);
		expect(failedRow).toBeTruthy();
		expect(failedRow).toMatchObject({
			harnessId: "antigravity",
			modelRef: "gemini-3.8-flash-low",
			aliasName: "worker",
			targetIndex: 0,
		});
		// The failback arrival row is a DIFFERENT stage's row: it must stay
		// blank — the failing run's badge belongs to the Failed row (the
		// failing stage's own row), never to the row the task failed back
		// into (which may be a human checkpoint).
		const arrivalRow = (after.timeline || []).find(
			(entry) => entry.status === "Moved",
		);
		expect(arrivalRow).toBeTruthy();
		expect(arrivalRow.harnessId).toBeUndefined();
		expect(arrivalRow.modelRef).toBeUndefined();
		expect(arrivalRow.aliasName).toBeUndefined();
		expect(arrivalRow.targetIndex).toBeUndefined();
		expect(after.currentRunAttribution).toBeNull();
	});

	it("stamps the arrival row into the run's own stage at dispatch (not the next stage's)", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "arrival row stamping",
			stageId: "a1",
			projectCwd: dir,
		});
		// Seed the history the way transitions write it: an older arrival
		// into another stage, then the arrival into THIS run's stage.
		const seeded = store.getTask("p1", task.id);
		seeded.timeline = [
			{ stage: "Plan", status: "Advanced", duration: "1s", timestamp: "t0" },
			{ stage: "Work", status: "Advanced", duration: "2s", timestamp: "t1" },
		];

		await store.executeStage("p1", task.id, {
			stages: ALIAS_STAGES,
			projectCwd: dir,
			agentRunner: async () => ({
				output: "agent finished",
				harnessId: "antigravity",
				failureKind: "none",
			}),
		});

		const after = store.getTask("p1", task.id);
		const workArrival = (after.timeline || []).find(
			(entry) => entry.stage === "Work" && entry.status === "Advanced",
		);
		expect(workArrival).toBeTruthy();
		// The badge names the run of the stage the row is headed with.
		expect(workArrival).toMatchObject({
			harnessId: "antigravity",
			modelRef: "gemini-3.8-flash-low",
			aliasName: "worker",
		});
		// Other stages' rows are never touched.
		const planArrival = (after.timeline || []).find(
			(entry) => entry.stage === "Plan",
		);
		expect(planArrival.harnessId).toBeUndefined();
		expect(planArrival.modelRef).toBeUndefined();
	});

	it("re-stamps the arrival row with the latest attempt's choice on re-dispatch", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "re-dispatch re-stamp",
			stageId: "a1",
			projectCwd: dir,
		});
		const seeded = store.getTask("p1", task.id);
		seeded.timeline = [
			{ stage: "Work", status: "Advanced", duration: "1s", timestamp: "t0" },
		];

		const run = (harnessId) =>
			store.executeStage("p1", task.id, {
				stages: ALIAS_STAGES,
				projectCwd: dir,
				agentRunner: async () => ({
					output: "agent finished",
					harnessId,
					failureKind: "none",
				}),
			});

		await run("antigravity");
		let after = store.getTask("p1", task.id);
		let workArrival = after.timeline.find((entry) => entry.stage === "Work");
		expect(workArrival.harnessId).toBe("antigravity");

		await run("antigravity");
		after = store.getTask("p1", task.id);
		workArrival = after.timeline.find((entry) => entry.stage === "Work");
		expect(workArrival.harnessId).toBe("antigravity");
	});

	it("never stamps a human checkpoint's arrival row (no agent dispatch)", async () => {
		const { store, dir } = makeAliasStore();
		const HUMAN_STAGES = [
			{ id: "h1", name: "Review plan", type: "human" },
		];
		const task = store.createTask("p1", {
			goal: "human stage stays blank",
			stageId: "h1",
			projectCwd: dir,
		});
		const seeded = store.getTask("p1", task.id);
		seeded.timeline = [
			{ stage: "Review plan", status: "Advanced", duration: "1s", timestamp: "t0" },
		];

		await store.executeStage("p1", task.id, {
			stages: HUMAN_STAGES,
			projectCwd: dir,
			agentRunner: async () => {
				throw new Error("human stages must never dispatch an agent");
			},
		});

		const after = store.getTask("p1", task.id);
		expect(after.status).toBe("waiting_human");
		const row = (after.timeline || []).find(
			(entry) => entry.stage === "Review plan",
		);
		expect(row.harnessId).toBeUndefined();
		expect(row.modelRef).toBeUndefined();
		expect(row.aliasName).toBeUndefined();
		expect(row.targetIndex).toBeUndefined();
	});

	it("leaves ci stage runs unattributed (no pending choice, blank rows)", async () => {
		const { store, dir } = makeAliasStore();
		const task = store.createTask("p1", {
			goal: "ci stage attribution",
			stageId: "c1",
			projectCwd: dir,
		});

		await store.executeStage("p1", task.id, {
			stages: [{ id: "c1", name: "CI", type: "ci", command: "true" }],
			projectCwd: dir,
			execRunner: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
		});

		const after = store.getTask("p1", task.id);
		// Never set by the command path: null here is the terminal row's
		// unconditional clear, undefined if no transition ran — both mean
		// "no agent run pending".
		expect(after.currentRunAttribution ?? undefined).toBeUndefined();
		for (const row of after.timeline || []) {
			expect(row.harnessId).toBeUndefined();
			expect(row.modelRef).toBeUndefined();
			expect(row.aliasName).toBeUndefined();
			expect(row.targetIndex).toBeUndefined();
		}
	});
});
