/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { TaskStore } from "../taskStore.js";
import { SessionStore } from "../sessionStore.js";

/***
 * MARK: Stage execution reliability-sample tests
 * @description Pins the run-driven reliability model: EVERY agent stage
 *   dispatch records exactly one reliability sample on the task (success,
 *   infrastructure failure, or agent rejection), regardless of the
 *   report-file opt-in (`stage.report`) — the fix for frozen run counts on
 *   harnesses (vibe et al.) whose successful runs previously left no trace.
 *   Operator aborts are scheduled interventions and record nothing.
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

function makeStore({ stages = SAMPLE_STAGES } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-reliability-"));
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
		projectStore: { getProject: () => project, listProjects: () => [project] },
	});
	store.sessionStore = new SessionStore();
	return { store, dir, stages };
}

// NOTE: no `report: true` anywhere — success reports are opt-in, samples are not.
const SAMPLE_STAGES = [
	{
		id: "a1",
		name: "Work",
		type: "agent",
		prompt: "Do work",
		harness: "alias",
		model: "worker",
	},
];

function samplesOf(store, taskId) {
	const task = store.getTask("p1", taskId);
	return Array.isArray(task.reliabilitySamples) ? task.reliabilitySamples : [];
}

async function runStage(store, dir, stages, agentRunner, taskId) {
	return store.executeStage("p1", taskId, {
		stages,
		projectCwd: dir,
		agentRunner,
	});
}

describe("executeStage reliability samples", () => {
	it("records one success sample on a non-reporting stage (no report written)", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability success sample",
			stageId: "a1",
			projectCwd: dir,
		});

		await runStage(store, dir, stages, async () => ({
			output: "agent finished",
			harnessId: "antigravity",
			failureKind: "none",
		}), task.id);

		const samples = samplesOf(store, task.id);
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			harnessId: "antigravity",
			failureKind: "none",
			stageId: "a1",
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
		});
		expect(Number.isInteger(samples[0].at)).toBe(true);
		expect(typeof samples[0].atRaw).toBe("string");
		// The report opt-in stays untouched: no report, but a sample.
		expect(task.reports || []).toHaveLength(0);
	});

	it("records an infrastructure sample when the agent fails the stage", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability infra sample",
			stageId: "a1",
			projectCwd: dir,
		});

		await runStage(store, dir, stages, async () => ({
			output: "[Timeout Error] Stage execution timed out: boom",
			failed: true,
			failureReason: "[Timeout Error] Stage execution timed out: boom",
			failureKind: "infrastructure",
			harnessId: "antigravity",
		}), task.id);

		const samples = samplesOf(store, task.id);
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			harnessId: "antigravity",
			failureKind: "infrastructure",
			stageId: "a1",
			aliasName: "worker",
		});
	});

	it("records a rejected sample for deliberate agent stage-fails", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability rejected sample",
			stageId: "a1",
			projectCwd: dir,
		});

		await runStage(store, dir, stages, async () => ({
			output: "review complete",
			failed: true,
			failureReason: "[Agent Review Rejection] Does not meet the bar",
			failureKind: "rejected",
			harnessId: "antigravity",
		}), task.id);

		const samples = samplesOf(store, task.id);
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			harnessId: "antigravity",
			failureKind: "rejected",
			stageId: "a1",
		});
	});

	it("records an infrastructure sample when the runner throws a timeout", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability thrown sample",
			stageId: "a1",
			projectCwd: dir,
		});

		await runStage(store, dir, stages, async () => {
			throw new Error("[Timeout Error] Stage execution timed out: boom");
		}, task.id);

		const samples = samplesOf(store, task.id);
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			harnessId: "antigravity",
			failureKind: "infrastructure",
			stageId: "a1",
			aliasName: "worker",
			modelRef: "gemini-3.8-flash-low",
		});
	});

	it("records no sample for an operator abort", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability abort sample",
			stageId: "a1",
			projectCwd: dir,
		});

		await runStage(store, dir, stages, async () => {
			throw new Error("this operation was aborted by the operator");
		}, task.id);

		// Operator aborts are scheduled interventions, not reliability signal.
		expect(samplesOf(store, task.id)).toHaveLength(0);
	});

	it("counts every attempt in a transient retry ladder (2 infra + 1 success = 3 samples)", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability retry ladder",
			stageId: "a1",
			projectCwd: dir,
		});

		// Two transient blows-ups (each dispatch counts once), then a clean
		// success: the ladder must total exactly 3 samples, not 1 — the
		// frozen-run-count bug collapses retries behind a stage key. (A
		// third consecutive failure would trip the circuit breaker and
		// defer the next dispatch, so the ladder stays under its threshold.)
		for (let i = 0; i < 2; i += 1) {
			await runStage(store, dir, stages, async () => {
				throw new Error("[Timeout Error] Stage execution timed out: boom");
			}, task.id);
		}
		await runStage(store, dir, stages, async () => ({
			output: "agent finished",
			harnessId: "antigravity",
			failureKind: "none",
		}), task.id);

		const samples = samplesOf(store, task.id);
		expect(samples).toHaveLength(3);
		expect(samples.filter((s) => s.failureKind === "infrastructure")).toHaveLength(2);
		expect(samples.filter((s) => s.failureKind === "none")).toHaveLength(1);
	});

	it("attributes a plain-string runner result through the peeked harness fallback", async () => {
		const { store, dir, stages } = makeStore();
		const task = store.createTask("p1", {
			goal: "reliability string result",
			stageId: "a1",
			projectCwd: dir,
		});

		// Pre-contract runner: a bare string result carries no harnessId —
		// the run still attributes via the peeked alias resolution.
		await runStage(store, dir, stages, async () => "agent finished", task.id);

		const samples = samplesOf(store, task.id);
		expect(samples).toHaveLength(1);
		expect(samples[0]).toMatchObject({
			harnessId: "antigravity",
			failureKind: "none",
			stageId: "a1",
			aliasName: "worker",
		});
	});
});
