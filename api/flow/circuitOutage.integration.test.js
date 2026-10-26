/* eslint-disable security/detect-non-literal-fs-filename */
// Domain: The Flow — Tier-5 gateway-outage integration proof (WP1 acceptance).
//
// Simulates a provider-gateway outage across a queue of tasks and proves the
// F-21 cascade is gone: the engine trips, ZERO tasks are parked `failed`, and
// every retry budget is byte-identical. Uses a throwaway temp project (no git,
// no servers) and a threshold of 1 so the outage is detected on the first
// failure — the strongest possible budget-preservation claim.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.KAINBAIN_CIRCUIT_INFRA_FAILURE_THRESHOLD = "1";

const { ProjectStore } = await import("../projectStore.js");
const { TaskStore } = await import("../taskStore.js");
const { isTripped, loadCircuitState, resetEngine } = await import(
	"./circuitBreaker.js"
);

const STAGES = [
	{ id: "build", name: "Build", type: "agent", prompt: "Do the work" },
];

describe("Tier-5 gateway outage containment", () => {
	let base;
	let cwd;
	let projectStore;
	let taskStore;
	const projectId = "outage-proj";

	const failingGatewayRunner = async () => {
		throw new Error("ECONNREFUSED 127.0.0.1:4000 — provider gateway down");
	};

	beforeAll(() => {
		base = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-outage-"));
		cwd = path.join(base, "project");
		fs.mkdirSync(cwd, { recursive: true });
		projectStore = new ProjectStore({
			projectsRoot: path.join(base, "projects-root"),
			notesRoot: path.join(base, "notes-root"),
			autoScan: false,
		});
		taskStore = new TaskStore({ projectStore, eventBridge: null });
		projectStore.projects.set(projectId, {
			id: projectId,
			name: "Outage Project",
			cwd,
			useBranches: false,
			stages: STAGES,
		});
	});

	afterAll(() => {
		try {
			fs.rmSync(base, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	it("trips the engine, parks zero tasks and preserves every budget", async () => {
		const tasks = ["alpha", "beta", "gamma"].map((title) =>
			taskStore.createTask(projectId, {
				title,
				goal: `Prove outage containment (${title})`,
				stageId: "build",
				projectCwd: cwd,
			}),
		);
		// Baseline budgets before the outage.
		const before = tasks.map((t) => ({
			id: t.id,
			infra: t.infraRetryCount || 0,
			auto: t.autoIterationCount || 0,
		}));

		// Drive the scheduler through the outage. The first dispatch fails
		// with an infrastructure error and trips containment; every later tick
		// must defer.
		await taskStore.scheduleTick({ agentRunner: failingGatewayRunner });
		await taskStore.scheduleTick({ agentRunner: failingGatewayRunner });
		await taskStore.scheduleTick({ agentRunner: failingGatewayRunner });

		expect(isTripped(taskStore)).toBe(true);
		expect(taskStore.circuitState.source).toBe("auto:infra");
		expect(taskStore.schedulerStats.deferredTripped).toBeGreaterThanOrEqual(2);

		// Zero parked failures, all still runnable, every budget identical.
		for (const t of tasks) {
			const live = taskStore.getTask(projectId, t.id);
			expect(live.status).toBe("in_stage");
			expect(live.failureReason).toBeFalsy();
			expect(live.lastError).toBeFalsy();
		}
		const after = tasks.map((t) => ({
			id: t.id,
			infra: taskStore.getTask(projectId, t.id).infraRetryCount || 0,
			auto: taskStore.getTask(projectId, t.id).autoIterationCount || 0,
		}));
		expect(after).toEqual(before);
		expect(taskStore.getScheduledQueue(projectId).every((i) => i.status !== "failed")).toBe(
			true,
		);
	});

	it("the trip survives a store reload (durable containment)", () => {
		const reloaded = { engineState: {}, schedulerStats: {}, eventBridge: null };
		loadCircuitState(reloaded);
		expect(isTripped(reloaded)).toBe(true);
	});

	it("operator reset lifts containment and dispatch resumes", async () => {
		resetEngine(taskStore, { reason: "gateway recovered", source: "manual" });
		expect(isTripped(taskStore)).toBe(false);
		const passingRunner = async () => "recovered";
		const result = await taskStore.scheduleTick({ agentRunner: passingRunner });
		expect(result?.status).toBe("passed");
	});
});
