// Domain: The Flow — the scheduler idles (not stops) when work runs out.
// Regression cover for: "queue freezes when it runs out of work". An empty
// queue must leave the engine idle with the scheduler polling, so newly
// created / resumed / retried / unblocked tasks dispatch without a manual kick.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";

const stages = [
	{ id: "1", name: "Work", type: "agent", failback: "start" },
	{ id: "2", name: "Gate", type: "human", failback: "any" },
];

function makeStore({ bridge, runners, queueEntryTimeoutMs } = {}) {
	const tempCwd = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-idle-test-"));
	const projectStore = {
		getProject: () => ({ id: "p1", name: "P1", stages, cwd: tempCwd }),
		listProjects: () => [{ id: "p1", name: "P1", stages, cwd: tempCwd }],
	};
	const store = new TaskStore({
		eventBridge: bridge || {},
		projectStore,
		...(queueEntryTimeoutMs != null ? { queueEntryTimeoutMs } : {}),
	});
	if (runners) {
		store.defaultAgentRunner = runners.agentRunner || null;
		store.defaultPromptEngine = runners.promptEngine || null;
	}
	return { store, tempCwd };
}

async function waitFor(fn, { timeoutMs = 30000, stepMs = 25 } = {}) {
	const start = Date.now();
	for (;;) {
		if (fn()) return true;
		if (Date.now() - start > timeoutMs) return false;
		await new Promise((r) => setTimeout(r, stepMs));
	}
}

describe("scheduler idles instead of freezing when work runs out", () => {
	let stores = [];
	afterEach(() => {
		for (const { store, tempCwd } of stores) {
			try {
				store.stopScheduler();
			} catch {
				// ignore teardown errors
			}
			try {
				fs.rmSync(tempCwd, { recursive: true, force: true });
			} catch {
				// ignore teardown errors
			}
		}
		stores = [];
	});
	const track = (entry) => {
		stores.push(entry);
		return entry.store;
	};

	it("drains to idle, then a newly created runnable task dispatches without a manual kick", async () => {
		const entry = makeStore({
			runners: { agentRunner: async () => "# out\nDid work." },
		});
		const s = track(entry);
		s.startScheduler({ intervalMs: 50, agentRunner: async () => "# out\nDid work." });

		const first = s.createTask("p1", { goal: "first", stageId: "1", projectCwd: entry.tempCwd });
		await s.executeStage("p1", first.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => "# out\nDid work.",
		});
		s.completeTask("p1", first.id, entry.tempCwd);
		await new Promise((r) => setTimeout(r, 150));

		expect(s.executionQueue.size).toBe(0);
		expect(s.executionQueue.isRunning).toBe(false);
		expect(s.getEngineState().status).toBe("idle");
		expect(s.schedulerRunning).toBe(true);

		const next = s.createTask("p1", {
			goal: "second",
			stageId: "1",
			projectCwd: entry.tempCwd,
		});
		const pickedUp = await waitFor(
			() => s.getTask("p1", next.id)?.status !== "in_stage",
		);
		expect(pickedUp).toBe(true);
	});

	it("engine returns to idle even when the state broadcast throws mid-dispatch", async () => {
		const entry = makeStore({
			bridge: {
				emitSystemLog: () => {},
				emitProcessEvent: () => {},
				emitNotification: () => {},
				broadcastGlobal: (type) => {
					if (type === "ENGINE_STATE") throw new Error("dead socket");
				},
			},
		});
		const s = track(entry);
		const task = s.createTask("p1", { goal: "x", stageId: "1", projectCwd: entry.tempCwd });
		const result = await s.executeStage("p1", task.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => "# out\nok",
		});
		expect(result?.status).toBe("passed");
		expect(s.getEngineState().status).toBe("idle");

		const followUp = s.createTask("p1", {
			goal: "y",
			stageId: "1",
			projectCwd: entry.tempCwd,
		});
		const ticked = await s.scheduleTick({ agentRunner: async () => "# out\nok" });
		expect(ticked?.status).toBe("passed");
		expect(s.getTask("p1", followUp.id)?.status).not.toBe("in_stage");
	});

	it("a paused stage on one task does not clobber another task's running engine state", async () => {
		const entry = makeStore();
		const s = track(entry);
		const running = s.createTask("p1", { goal: "A", stageId: "1", projectCwd: entry.tempCwd });
		let release;
		const gate = new Promise((res) => {
			release = res;
		});
		const flight = s.executeStage("p1", running.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => {
				await gate;
				return "# out\nA done";
			},
		});
		const inFlight = await waitFor(
			() =>
				s.getEngineState().status === "running" &&
				s.getEngineState().activeTaskId === running.id,
		);
		expect(inFlight).toBe(true);

		const pausedStages = [{ id: "1", name: "W", type: "agent", paused: true }];
		const other = s.createTask("p1", { goal: "B", stageId: "1", projectCwd: entry.tempCwd });
		const pausedResult = await s.executeStage("p1", other.id, {
			stages: pausedStages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => "# out\nB",
		});
		expect(pausedResult?.status).toBe("paused");
		expect(s.getEngineState().status).toBe("running");
		expect(s.getEngineState().activeTaskId).toBe(running.id);

		release();
		await flight;
		expect(s.getEngineState().status).toBe("idle");
	});

	it("finishing a run clears a stale paused engine state when the task moved on", async () => {
		const entry = makeStore();
		const s = track(entry);
		const task = s.createTask("p1", { goal: "P", stageId: "1", projectCwd: entry.tempCwd });
		let release;
		const gate = new Promise((res) => {
			release = res;
		});
		const flight = s.executeStage("p1", task.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => {
				await gate;
				return "# out\ndone";
			},
		});
		const inFlight = await waitFor(() => s.getEngineState().status === "running");
		expect(inFlight).toBe(true);
		s.pauseTask("p1", task.id, entry.tempCwd);
		expect(s.getEngineState().status).toBe("paused");
		release();
		await flight;
		// The run advanced the task past the pause; the engine must not keep
		// advertising a stale "paused" owner after the drain.
		expect(s.getTask("p1", task.id)?.status).not.toBe("paused");
		expect(s.getEngineState().status).toBe("idle");
		expect(s.getEngineState().activeTaskId).toBe(null);
	});

	it("creating a runnable task kicks the scheduler promptly even with a long interval", async () => {
		const agentRunner = async () => "# out\nDid work.";
		const entry = makeStore({ runners: { agentRunner } });
		const s = track(entry);
		s.startScheduler({ intervalMs: 15000, agentRunner });
		const task = s.createTask("p1", { goal: "kicked", stageId: "1", projectCwd: entry.tempCwd });
		const pickedUp = await waitFor(
			() => s.getTask("p1", task.id)?.status !== "in_stage",
			{ timeoutMs: 8000 },
		);
		expect(pickedUp).toBe(true);
	});

	it("a hung run is force-settled, routed to retry, and the queue keeps dispatching", async () => {
		const entry = makeStore({ queueEntryTimeoutMs: 60 });
		const s = track(entry);
		const stallPushes = [];
		s.notifySchedulerStall = async (detail) => {
			stallPushes.push(detail);
			return { delivered: 1 };
		};
		const hung = s.createTask("p1", { goal: "hung", stageId: "1", projectCwd: entry.tempCwd });
		const result = await s.executeStage("p1", hung.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: () => new Promise(() => {}),
		});
		// The timeout path rescued the occupant instead of parking behind it.
		expect(result?.queueEntryTimeout).toBe(true);
		expect(s.executionQueue.isRunning).toBe(false);
		expect(s.getEngineState().status).toBe("idle");
		expect(s.schedulerStats.stallRecoveries).toBe(1);
		expect(stallPushes).toHaveLength(1);
		expect(stallPushes[0]).toMatchObject({ taskId: hung.id, reason: "entry-timeout" });
		const parked = s.getTask("p1", hung.id);
		expect(parked.status).toBe("in_stage");
		expect(parked.autoRetrying).toBe(true);
		// The queue kept working: fresh work dispatches normally afterwards.
		const next = s.createTask("p1", {
			goal: "next",
			stageId: "1",
			projectCwd: entry.tempCwd,
		});
		const ok = await s.executeStage("p1", next.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => "# out\nDid work.",
		});
		expect(ok?.status).toBe("passed");
	});

	it("aborting a hung run unparks the queue immediately", async () => {
		const entry = makeStore();
		const s = track(entry);
		const hung = s.createTask("p1", { goal: "hung", stageId: "1", projectCwd: entry.tempCwd });
		const flight = s.executeStage("p1", hung.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: () => new Promise(() => {}),
		});
		const settled = flight.then(
			() => "resolved",
			(err) => err,
		);
		const inFlight = await waitFor(
			() => s.getEngineState().status === "running" && s.executionQueue.isRunning,
		);
		expect(inFlight).toBe(true);
		const aborted = s.abortTask("p1", hung.id, entry.tempCwd);
		expect(aborted?.status).toBe("in_stage");
		expect(s.executionQueue.isRunning).toBe(false);
		expect(s.getEngineState().status).toBe("idle");
		const outcome = await settled;
		expect(outcome).toBeInstanceOf(Error);
		expect(outcome.message).toMatch(/aborted by operator/);
		// The queue kept working: fresh work dispatches normally afterwards.
		const next = s.createTask("p1", {
			goal: "next",
			stageId: "1",
			projectCwd: entry.tempCwd,
		});
		const ok = await s.executeStage("p1", next.id, {
			stages,
			projectCwd: entry.tempCwd,
			agentRunner: async () => "# out\nDid work.",
		});
		expect(ok?.status).toBe("passed");
	});

	it("exposes a stuck queue distinctly while the engine reads idle", async () => {
		const entry = makeStore();
		const s = track(entry);
		// Production default: the settle guarantee is armed (15 min), and the
		// per-store override from the timeout test above does not leak here.
		expect(s.executionQueue.activeTimeoutMs).toBe(900000);
		const pending = s.executionQueue.enqueue(() => new Promise(() => {}), { taskId: "ghost" });
		pending.catch(() => {});
		expect(s.executionQueue.isRunning).toBe(true);
		const snapshot = s.getEngineState();
		expect(snapshot.status).toBe("idle");
		expect(snapshot.executionQueue).toMatchObject({ isRunning: true, size: 0 });
		expect(snapshot.busyWhileIdle).toBe(true);
		// Settling is owner-checked: another task's entry is never touched.
		expect(s.settleWedgedEntryForTask("someone-else")).toBe(false);
		expect(s.executionQueue.isRunning).toBe(true);
		expect(s.settleWedgedEntryForTask("ghost")).toBe(true);
		await expect(pending).rejects.toThrow();
		expect(s.getEngineState().busyWhileIdle).toBe(false);
	});

	it("scheduleTick records outcome telemetry instead of failing silently", async () => {
		const entry = makeStore();
		const s = track(entry);
		expect(s.schedulerStats).toBeDefined();
		const before = s.schedulerStats.ticks;
		const none = await s.scheduleTick();
		expect(none).toBe(null);
		expect(s.schedulerStats.ticks).toBe(before + 1);
		expect(s.schedulerStats.idleNoCandidate).toBe(1);
		expect(s.schedulerStats.lastOutcome).toBe("no-candidate-idle");

		s.setEngineState({ status: "running", activeTaskId: "t-busy" });
		const busy = await s.scheduleTick();
		expect(busy).toBe(null);
		expect(s.schedulerStats.skippedBusy).toBe(1);
		expect(s.schedulerStats.lastOutcome).toBe("skipped-busy");
		s.setEngineState({ status: "idle", activeTaskId: null });

		const task = s.createTask("p1", { goal: "z", stageId: "1", projectCwd: entry.tempCwd });
		const dispatched = await s.scheduleTick({ agentRunner: async () => "# out\nok" });
		expect(dispatched?.status).toBe("passed");
		expect(s.schedulerStats.dispatched).toBe(1);
		expect(s.schedulerStats.lastOutcome).toBe("dispatched");
		expect(s.schedulerStats.lastDispatchAt).toBeTruthy();
		expect(s.getTask("p1", task.id)?.status).not.toBe("in_stage");
	});
});
