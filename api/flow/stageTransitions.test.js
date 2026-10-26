import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	advanceStage,
	completeTask,
	failbackStage,
	moveToStage,
	pauseTask,
	resumeTask,
	retryStage,
} from "./stageTransitions.js";

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human" },
	{ id: "s-3", name: "Integrate", type: "merge" },
];

function makeStore({ project = { id: "p-1", stages: STAGES } } = {}) {
	const maps = new Map();
	const store = {
		projectStore: { getProject: vi.fn(() => project) },
		engineState: {
			status: "idle",
			activeTaskId: null,
			activeProjectId: null,
			activeProjectName: null,
			activeStageId: null,
			activeStageName: null,
			activeStageType: null,
		},
		eventBridge: { broadcastGlobal: vi.fn(), emitProcessEvent: vi.fn() },
		sessionStore: null,
		_activeChildren: new Map(),
		defaultAgentRunner: null,
		defaultPromptEngine: null,
		getTask: (pid, tid) => maps.get(pid)?.get(tid),
		seed: (pid, task) => {
			if (!maps.has(pid)) maps.set(pid, new Map());
			maps.get(pid).set(task.id, task);
			return task;
		},
		_recordHistory: vi.fn((t, action, ts) => {
			t.history = t.history || [];
			t.history.push({ timestamp: ts, action });
		}),
		_recordTimelineWithDiffStat: vi.fn(),
		_resetAutoIteration: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		saveStageReport: vi.fn(),
		updateTask: vi.fn((pid, tid, updates) =>
			Object.assign(maps.get(pid).get(tid), updates),
		),
		executeStage: vi.fn(async () => ({ ok: true })),
		setEngineState: vi.fn((patch) => Object.assign(store.engineState, patch)),
	};
	return store;
}

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		status: "in_stage",
		currentStageId: "s-1",
		enteredStageAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		history: [],
		failureReason: null,
		lastError: null,
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("moveToStage", () => {
	it("returns null for unknown tasks", () => {
		expect(moveToStage(makeStore(), "p-1", "ghost", "s-2")).toBeNull();
	});

	it("moves to an agent stage with history and timeline", () => {
		const store = makeStore();
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-3", "Moved");
		expect(moved.currentStageId).toBe("s-3");
		expect(moved.status).toBe("in_stage");
		expect(moved.history.at(-1).action).toContain("Integrate");
		expect(store._recordTimelineWithDiffStat).toHaveBeenCalled();
		expect(store._saveTaskMarkdown).toHaveBeenCalled();
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith(
			"TASK_UPDATED",
			moved,
		);
		expect(store.eventBridge.emitProcessEvent).toHaveBeenCalledWith(
			"p-1",
			"stage:enter",
			expect.objectContaining({ taskId: "t-1", stageId: "s-3" }),
		);
	});

	it("clears the startup-recovery marker when the stage changes", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				resumedAfterInterruption: true,
				interruptedAt: "2026-10-08T09:00:00.000Z",
			}),
		);
		const moved = moveToStage(store, "p-1", "t-1", "s-3", "Moved");
		expect(moved.resumedAfterInterruption).toBe(false);
		expect(moved.interruptedAt).toBeNull();
	});

	it("parks human stages in waiting_human with a checkpoint event", () => {
		const store = makeStore();
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
		expect(store.eventBridge.emitProcessEvent).toHaveBeenCalledWith(
			"p-1",
			"stage:checkpoint_wait",
			expect.objectContaining({ stageId: "s-2" }),
		);
	});

	it("parks legacy review stages in waiting_human (normalized to human)", () => {
		const store = makeStore({
			project: {
				id: "p-1",
				stages: [
					{ id: "s-1", name: "Build", type: "agent" },
					{ id: "s-2", name: "Legacy Review", type: "review" },
				],
			},
		});
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
		expect(store.eventBridge.emitProcessEvent).toHaveBeenCalledWith(
			"p-1",
			"stage:checkpoint_wait",
			expect.objectContaining({ stageId: "s-2" }),
		);
	});

	it("treats mixed-case human types as human checkpoints", () => {
		const store = makeStore({
			project: {
				id: "p-1",
				stages: [
					{ id: "s-1", name: "Build", type: "agent" },
					{ id: "s-2", name: "Gate", type: "Human" },
				],
			},
		});
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
	});

	it("clears failure state and matches stages by name", () => {
		const store = makeStore();
		store.seed("p-1", task({ failureReason: "x", lastError: { message: "x" } }));
		const moved = moveToStage(store, "p-1", "t-1", "review");
		expect(moved.currentStageId).toBe("review");
		expect(moved.failureReason).toBeNull();
		expect(moved.lastError).toBeNull();
	});

	it("releases a checkpoint engine owner", () => {
		const store = makeStore();
		store.seed("p-1", task());
		store.engineState.status = "checkpoint";
		store.engineState.activeTaskId = "t-1";
		moveToStage(store, "p-1", "t-1", "s-1");
		expect(store.setEngineState).toHaveBeenCalledWith(
			expect.objectContaining({ status: "idle", activeTaskId: null }),
		);
	});

	it("re-points the engine's displayed stage when the owner moves (automatic advance)", () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "running_merge", currentStageId: "s-3" }));
		store.engineState = {
			status: "running",
			activeTaskId: "t-1",
			activeProjectId: "p-1",
			activeProjectName: "P1",
			activeStageId: "s-3",
			activeStageName: "Integrate",
			activeStageType: "merge",
		};
		moveToStage(store, "p-1", "t-1", "s-1", "Advanced");
		// The run is still in flight — only the displayed stage follows the task.
		expect(store.engineState.status).toBe("running");
		expect(store.engineState.activeTaskId).toBe("t-1");
		expect(store.engineState.activeStageId).toBe("s-1");
		expect(store.engineState.activeStageName).toBe("Build");
	});

	it("an operator move interrupts a live run and releases the engine", () => {
		const store = makeStore();
		const seeded = store.seed(
			"p-1",
			task({ status: "running_merge", currentStageId: "s-3" }),
		);
		store.engineState = {
			status: "running",
			activeTaskId: "t-1",
			activeProjectId: "p-1",
			activeProjectName: "P1",
			activeStageId: "s-3",
			activeStageName: "Integrate",
			activeStageType: "merge",
		};
		moveToStage(store, "p-1", "t-1", "s-1", "Moved", undefined, undefined, {
			operatorMove: true,
		});
		// Task parked at the destination, engine released — all surfaces agree.
		expect(seeded.currentStageId).toBe("s-1");
		expect(seeded.status).toBe("in_stage");
		expect(store.engineState.status).toBe("idle");
		expect(store.engineState.activeTaskId).toBeNull();
		expect(store.engineState.activeStageId).toBeNull();
		expect(store.engineState.activeStageName).toBeNull();
	});

	it("an operator move never touches another task's engine ownership", () => {
		const store = makeStore();
		store.seed("p-1", task());
		store.engineState = {
			status: "running",
			activeTaskId: "t-other",
			activeProjectId: "p-1",
			activeProjectName: "P1",
			activeStageId: "s-2",
			activeStageName: "Review",
			activeStageType: "human",
		};
		moveToStage(store, "p-1", "t-1", "s-1", "Moved", undefined, undefined, {
			operatorMove: true,
		});
		expect(store.engineState.status).toBe("running");
		expect(store.engineState.activeTaskId).toBe("t-other");
		expect(store.engineState.activeStageId).toBe("s-2");
	});

	it("an operator move releases the engine despite string/number id drift", () => {
		const store = makeStore();
		const seeded = store.seed(
			"p-1",
			task({ id: 42, status: "running_merge", currentStageId: "s-3" }),
		);
		// Persisted snapshot drifted to a string key while the record is numeric.
		store.engineState = {
			status: "running",
			activeTaskId: "42",
			activeProjectId: "p-1",
			activeProjectName: "P1",
			activeStageId: "s-3",
			activeStageName: "Integrate",
			activeStageType: "merge",
		};
		moveToStage(store, "p-1", 42, "s-1", "Moved", undefined, undefined, {
			operatorMove: true,
		});
		expect(seeded.currentStageId).toBe("s-1");
		expect(seeded.status).toBe("in_stage");
		expect(store.engineState.status).toBe("idle");
		expect(store.engineState.activeTaskId).toBeNull();
		expect(store.engineState.activeStageName).toBeNull();
	});

	it("works without a projectStore or bridge", () => {
		const store = makeStore({ project: null });
		store.projectStore = null;
		store.eventBridge = null;
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-9", "Moved", null);
		expect(moved.currentStageId).toBe("s-9");
		expect(moved.status).toBe("in_stage");
	});
});

describe("advanceStage", () => {
	it("returns null for unknown tasks", () => {
		expect(advanceStage(makeStore(), "p-1", "ghost", STAGES)).toBeNull();
	});

	it("never advances terminal tasks", () => {
		const store = makeStore();
		const done = store.seed("p-1", task({ status: "completed" }));
		expect(advanceStage(store, "p-1", "t-1", STAGES)).toBe(done);
		expect(done.currentStageId).toBe("s-1");
	});

	it("advances to the next stage", () => {
		const store = makeStore();
		store.seed("p-1", task());
		const moved = advanceStage(store, "p-1", "t-1", STAGES);
		expect(moved.currentStageId).toBe("s-2");
		expect(moved.status).toBe("waiting_human");
		expect(store.eventBridge.emitProcessEvent).toHaveBeenCalledWith(
			"p-1",
			"stage:complete",
			expect.objectContaining({ isTerminal: false }),
		);
	});

	it("resolves stages from the project when none are passed", () => {
		const store = makeStore();
		store.seed("p-1", task());
		expect(advanceStage(store, "p-1", "t-1").currentStageId).toBe("s-2");
	});

	it("resolves workflow stages for workflow tasks", () => {
		const wfStages = [
			{ id: "w-1", name: "One", type: "agent" },
			{ id: "w-2", name: "Two", type: "agent" },
		];
		const store = makeStore({
			project: { id: "p-1", stages: STAGES, workflows: [{ id: "wf-1", stages: wfStages }] },
		});
		store.seed("p-1", task({ workflowId: "wf-1", currentStageId: "w-1" }));
		expect(advanceStage(store, "p-1", "t-1").currentStageId).toBe("w-2");
	});

	it("sends unknown stages to the first stage", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "ghost" }));
		const moved = advanceStage(store, "p-1", "t-1", STAGES);
		expect(moved.currentStageId).toBe("s-1");
		expect(moved.history.at(-1).action).toContain("First Stage");
	});

	it("records a PASSED report when leaving a human stage", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-2", status: "waiting_human" }));
		const moved = advanceStage(store, "p-1", "t-1", STAGES);
		expect(store.saveStageReport).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ status: "PASSED" }),
		);
		expect(moved.currentStageId).toBe("s-3");
	});

	it("carries human review comments into the approval report and guidance", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-2", status: "waiting_human" }));
		advanceStage(store, "p-1", "t-1", STAGES, undefined, "/repo", {
			guidance: "Ship it",
			comments: [
				{
					filePath: "./docs/tasks/t-1/plan.md",
					scope: "line",
					line: 12,
					body: "Tighten the retry budget",
					author: "human",
				},
			],
		});
		const [, , report] = store.saveStageReport.mock.calls.at(-1);
		expect(report.content).toContain("# Human approval: Review");
		expect(report.content).toContain("## Review Comments");
		expect(report.content).toContain("Tighten the retry budget");
		expect(report.content).toContain("## Guidance");
		expect(report.content).toContain("Ship it");
	});

	it("writes a bare approval report when no review comments were left", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-2", status: "waiting_human" }));
		advanceStage(store, "p-1", "t-1", STAGES);
		const [, , report] = store.saveStageReport.mock.calls.at(-1);
		expect(report.content).toContain("# Human approval: Review");
		expect(report.content).not.toContain("## Review Comments");
	});

	it("records a PASSED report when leaving a legacy review stage", () => {
		const stages = [
			{ id: "s-1", name: "Build", type: "agent" },
			{ id: "s-2", name: "Legacy Review", type: "review" },
			{ id: "s-3", name: "Integrate", type: "merge" },
		];
		const store = makeStore({
			project: { id: "p-1", stages },
		});
		store.seed("p-1", task({ currentStageId: "s-2", status: "waiting_human" }));
		const moved = advanceStage(store, "p-1", "t-1", stages);
		expect(store.saveStageReport).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({
				status: "PASSED",
				stageId: "s-2",
			}),
		);
		expect(moved.currentStageId).toBe("s-3");
	});

	it("completes the task at the terminal stage", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-3" }));
		const done = advanceStage(store, "p-1", "t-1", STAGES);
		expect(done.status).toBe("completed");
		expect(store.eventBridge.emitProcessEvent).toHaveBeenCalledWith(
			"p-1",
			"stage:complete",
			expect.objectContaining({ isTerminal: true, pipelineFinished: true }),
		);
	});

	it("returns the task when no stages resolve", () => {
		const store = makeStore({ project: { id: "p-1", stages: [] } });
		const t = store.seed("p-1", task());
		expect(advanceStage(store, "p-1", "t-1", [])).toBe(t);
	});
});

describe("failbackStage", () => {
	it("returns null for unknown tasks", () => {
		expect(failbackStage(makeStore(), "p-1", "ghost", STAGES)).toBeNull();
	});

	it("never fails back terminal tasks", () => {
		const store = makeStore();
		const done = store.seed("p-1", task({ status: "failed", currentStageId: "s-3" }));
		expect(failbackStage(store, "p-1", "t-1", STAGES)).toBe(done);
		expect(done.currentStageId).toBe("s-3");
	});

	it("honours an explicit fallback stage id", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-3" }));
		const moved = failbackStage(store, "p-1", "t-1", STAGES, "s-1");
		expect(moved.currentStageId).toBe("s-1");
		expect(moved.history.at(-1).action).toContain("Failed back");
	});

	it("routes 'start' policy to the first stage", () => {
		const stages = STAGES.map((s) =>
			s.id === "s-3" ? { ...s, failback: "start" } : s,
		);
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-3" }));
		expect(failbackStage(store, "p-1", "t-1", stages).currentStageId).toBe("s-1");
	});

	it("fails the task on 'abort' policy", () => {
		const stages = STAGES.map((s) =>
			s.id === "s-3" ? { ...s, failback: "abort" } : s,
		);
		const store = makeStore();
		const t = store.seed("p-1", task({ currentStageId: "s-3" }));
		failbackStage(store, "p-1", "t-1", stages);
		expect(t.status).toBe("failed");
		expect(t.history.at(-1).action).toContain("Aborted by failback policy");
	});

	it("steps to the previous stage and clamps at the first", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-3" }));
		expect(failbackStage(store, "p-1", "t-1", STAGES).currentStageId).toBe("s-2");
		store.seed("p-1", task({ id: "t-2", currentStageId: "s-1" }));
		expect(failbackStage(store, "p-1", "t-2", STAGES).currentStageId).toBe("s-1");
	});

	it("routes named stage policies and falls back to previous on unknown names", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-3" }));
		const named = STAGES.map((s) =>
			s.id === "s-3" ? { ...s, failback: "Build" } : s,
		);
		expect(failbackStage(store, "p-1", "t-1", named).currentStageId).toBe("s-1");
		store.seed("p-1", task({ id: "t-2", currentStageId: "s-3" }));
		const bogus = STAGES.map((s) =>
			s.id === "s-3" ? { ...s, failback: "nope" } : s,
		);
		expect(failbackStage(store, "p-1", "t-2", bogus).currentStageId).toBe("s-2");
	});

	it("resolves stages from the project and returns the task when nothing resolves", () => {
		const store = makeStore({ project: { id: "p-1", stages: [] } });
		const t = store.seed("p-1", task());
		expect(failbackStage(store, "p-1", "t-1", [])).toBe(t);
	});

	it("resolves workflow stages from the project when none are passed", () => {
		const wfStages = [
			{ id: "w-1", name: "One", type: "agent" },
			{ id: "w-2", name: "Two", type: "agent" },
		];
		const store = makeStore({
			project: { id: "p-1", stages: STAGES, workflows: [{ id: "wf-1", stages: wfStages }] },
		});
		store.seed("p-1", task({ workflowId: "wf-1", currentStageId: "w-2" }));
		expect(failbackStage(store, "p-1", "t-1", []).currentStageId).toBe("w-1");
	});

	it("passes through an 'any' fallback id", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "s-3" }));
		expect(failbackStage(store, "p-1", "t-1", STAGES, "any").currentStageId).toBe("any");
	});
});

describe("completeTask", () => {
	it("returns null for unknown tasks and is idempotent", () => {
		const store = makeStore();
		expect(completeTask(store, "p-1", "ghost")).toBeNull();
		const done = store.seed("p-1", task({ status: "completed" }));
		expect(completeTask(store, "p-1", "t-1")).toBe(done);
	});

	it("completes with history, timeline, and broadcast", () => {
		const store = makeStore();
		const t = store.seed("p-1", task({ failureReason: "x" }));
		const done = completeTask(store, "p-1", "t-1");
		expect(done.status).toBe("completed");
		expect(done.failureReason).toBeNull();
		expect(done.history.at(-1).action).toBe("Completed");
		expect(store._recordTimelineWithDiffStat).toHaveBeenCalledWith(
			done,
			expect.objectContaining({ status: "Completed" }),
			undefined,
			expect.anything(),
		);
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_UPDATED", done);
		expect(t).toBe(done);
	});

	it("stops the live run and aborts the session when completing mid-run", () => {
		const store = makeStore();
		const abort = vi.fn();
		store.sessionStore = { get: () => ({ abort }) };
		store._activeChildren.set("t-1", { pid: 987654321, kill: vi.fn() });
		store.seed("p-1", task());
		store.engineState.status = "running";
		store.engineState.activeTaskId = "t-1";
		completeTask(store, "p-1", "t-1");
		expect(abort).toHaveBeenCalled();
		expect(store.engineState.status).toBe("idle");
		expect(store._activeChildren.has("t-1")).toBe(false);
	});

	it("ignores session abort failures", () => {
		const store = makeStore();
		store.sessionStore = {
			get: () => {
				throw new Error("gone");
			},
		};
		store.seed("p-1", task());
		expect(completeTask(store, "p-1", "t-1").status).toBe("completed");
	});
});

describe("pauseTask", () => {
	it("returns null for unknown tasks and ignores terminal tasks", () => {
		const store = makeStore();
		expect(pauseTask(store, "p-1", "ghost")).toBeNull();
		const done = store.seed("p-1", task({ status: "completed" }));
		expect(pauseTask(store, "p-1", "t-1")).toBe(done);
	});

	it("pauses and keeps engine ownership for the live task", () => {
		const store = makeStore();
		store.seed("p-1", task());
		store.engineState.status = "running";
		store.engineState.activeTaskId = "t-1";
		const paused = pauseTask(store, "p-1", "t-1");
		expect(paused.status).toBe("paused");
		expect(store.setEngineState).toHaveBeenCalledWith(
			expect.objectContaining({ status: "paused", activeTaskId: "t-1" }),
		);
	});

	it("pauses without touching engine state for idle tasks", () => {
		const store = makeStore();
		store.seed("p-1", task());
		expect(pauseTask(store, "p-1", "t-1").status).toBe("paused");
		expect(store.setEngineState).not.toHaveBeenCalled();
	});

	it("pauseTask consumes any startup-recovery marker", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				resumedAfterInterruption: true,
				interruptedAt: "2026-10-08T09:00:00.000Z",
			}),
		);
		const paused = pauseTask(store, "p-1", "t-1");
		expect(paused.status).toBe("paused");
		expect(paused.resumedAfterInterruption).toBe(false);
		expect(paused.interruptedAt).toBeNull();
	});
});

describe("resumeTask / retryStage", () => {
	it("return null for unknown tasks", async () => {
		const store = makeStore();
		await expect(resumeTask(store, "p-1", "ghost")).resolves.toBeNull();
		await expect(retryStage(store, "p-1", "ghost")).resolves.toBeNull();
	});

	it("resumeTask resets state and dispatches execution", async () => {
		const store = makeStore();
		const agentRunner = vi.fn();
		store.seed("p-1", task({ status: "paused", wasInterrupted: true }));
		const resumed = await resumeTask(store, "p-1", "t-1", {
			stages: STAGES,
			agentRunner,
		});
		expect(resumed.status).toBe("in_stage");
		expect(resumed.wasInterrupted).toBe(false);
		expect(store._resetAutoIteration).toHaveBeenCalled();
		expect(store.executeStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ priority: "high", agentRunner }),
		);
	});

	it("resumeTask consumes any startup-recovery marker", async () => {
		const store = makeStore();
		const agentRunner = vi.fn();
		store.seed(
			"p-1",
			task({
				status: "paused",
				resumedAfterInterruption: true,
				interruptedAt: "2026-10-08T09:00:00.000Z",
			}),
		);
		const resumed = await resumeTask(store, "p-1", "t-1", {
			stages: STAGES,
			agentRunner,
		});
		expect(resumed.resumedAfterInterruption).toBe(false);
		expect(resumed.interruptedAt).toBeNull();
		// The marker reached the persisted markdown in its cleared state.
		const persisted = store._saveTaskMarkdown.mock.calls.at(-1)[1];
		expect(persisted.resumedAfterInterruption).toBe(false);
	});

	it("retryStage consumes any startup-recovery marker", async () => {
		const store = makeStore();
		const agentRunner = vi.fn();
		store.seed(
			"p-1",
			task({
				status: "failed",
				failureReason: "boom",
				resumedAfterInterruption: true,
				interruptedAt: "2026-10-08T09:00:00.000Z",
			}),
		);
		const retried = await retryStage(store, "p-1", "t-1", {
			stages: STAGES,
			agentRunner,
		});
		expect(retried.resumedAfterInterruption).toBe(false);
		expect(retried.interruptedAt).toBeNull();
	});

	it("resumeTask skips dispatch without an agent runner", async () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "paused" }));
		const resumed = await resumeTask(store, "p-1", "t-1", { stages: STAGES });
		expect(resumed.status).toBe("in_stage");
		expect(store.executeStage).not.toHaveBeenCalled();
	});

	it("retryStage re-enters the stage and dispatches", async () => {
		const store = makeStore();
		const agentRunner = vi.fn();
		store.seed("p-1", task({ status: "failed", failureReason: "boom" }));
		const retried = await retryStage(store, "p-1", "t-1", {
			stages: STAGES,
			agentRunner,
		});
		expect(retried.status).toBe("in_stage");
		expect(retried.failureReason).toBe("boom");
		expect(store.executeStage).toHaveBeenCalledTimes(1);
	});

	it("retryStage skips dispatch without an agent runner", async () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "failed" }));
		expect((await retryStage(store, "p-1", "t-1")).status).toBe("in_stage");
		expect(store.executeStage).not.toHaveBeenCalled();
	});
});

describe("timeline run attribution", () => {
	const ATTRIBUTION = {
		stageId: "s-1",
		harnessId: "pi",
		modelRef: "mistral::large",
		aliasName: "worker",
		targetIndex: 0,
	};

	function lastTimelineEntry(store) {
		expect(store._recordTimelineWithDiffStat).toHaveBeenCalled();
		return store._recordTimelineWithDiffStat.mock.calls.at(-1)[1];
	}

	it("leaves the arrival row blank even when a pending run matches the from stage", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentRunAttribution: ATTRIBUTION }));
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		const entry = lastTimelineEntry(store);
		expect(entry.durationStageId).toBe("s-1");
		// Arrival rows are never stamped here: a row's badge must describe
		// the run of the stage the row is headed with, and that stamp
		// happens at the destination's agent dispatch.
		expect(entry.harnessId).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
		// Consumed: a later move must never inherit the previous run's model.
		expect(moved.currentRunAttribution).toBeNull();
	});

	it("leaves the arrival row blank when the pending run belongs to another stage", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({ currentRunAttribution: { ...ATTRIBUTION, stageId: "s-9" } }),
		);
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		const entry = lastTimelineEntry(store);
		expect(entry.harnessId).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
		expect(moved.currentRunAttribution).toBeNull();
	});

	it("leaves the arrival row blank with no pending run (human / operator arrivals)", () => {
		const store = makeStore();
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
		const entry = lastTimelineEntry(store);
		expect(entry.harnessId).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
	});

	it("never stamps an agent run's badge on a human checkpoint's arrival row", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentRunAttribution: ATTRIBUTION }));
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Advanced");
		expect(moved.status).toBe("waiting_human");
		const entry = lastTimelineEntry(store);
		expect(entry.status).toBe("Advanced");
		// 'Review' (s-2) is a human stage: no agent run may ever be
		// attributed to its row, even though the run that caused the
		// transition just finished in the agent stage s-1.
		expect(entry.harnessId).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
	});

	it("stamps the Completed row with the pending run's choice and consumes it", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentRunAttribution: ATTRIBUTION }));
		const done = completeTask(store, "p-1", "t-1");
		const entry = lastTimelineEntry(store);
		expect(entry.status).toBe("Completed");
		expect(entry.durationStageId).toBe("s-1");
		expect(entry).toMatchObject({
			harnessId: "pi",
			modelRef: "mistral::large",
			aliasName: "worker",
			targetIndex: 0,
		});
		expect(done.currentRunAttribution).toBeNull();
	});

	it("keeps the Completed row blank without a matching pending run", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({ currentRunAttribution: { ...ATTRIBUTION, stageId: "s-3" } }),
		);
		const done = completeTask(store, "p-1", "t-1");
		const entry = lastTimelineEntry(store);
		expect(entry.harnessId).toBeUndefined();
		expect(entry.modelRef).toBeUndefined();
		expect(entry.aliasName).toBeUndefined();
		expect(entry.targetIndex).toBeUndefined();
		expect(done.currentRunAttribution).toBeNull();
	});
});
