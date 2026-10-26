import { describe, it, expect, vi, beforeEach } from "vitest";

import {
	abortTask,
	followUpTask,
	killTaskProcess,
	registerChild,
	rejectTask,
	steerTask,
	unregisterChild,
} from "./taskControl.js";

function makeStore() {
	const maps = new Map();
	const store = {
		_activeChildren: new Map(),
		engineState: {
			status: "idle",
			activeTaskId: null,
			activeProjectId: null,
			activeProjectName: null,
			activeStageId: null,
			activeStageName: null,
			activeStageType: null,
		},
		eventBridge: { broadcastGlobal: vi.fn() },
		sessionStore: null,
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
		_recordTimelineWithDiffStat: vi.fn((t, entry) => {
			t.timeline = t.timeline || [];
			t.timeline.push(entry);
			return entry;
		}),
		_resetAutoIteration: vi.fn(),
		_saveTaskMarkdown: vi.fn(),
		saveStageReport: vi.fn(),
		failbackStage: vi.fn((pid, tid) => maps.get(pid)?.get(tid)),
		executeStage: vi.fn(async () => ({ ok: true })),
		setEngineState: vi.fn((patch) => Object.assign(store.engineState, patch)),
	};
	return store;
}

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		goal: "Do thing",
		body: "Do thing",
		status: "running_agent",
		currentStageId: "s-1",
		history: [],
		logEntries: [],
		...overrides,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("registerChild / unregisterChild", () => {
	it("registers children with numeric pids only", () => {
		const store = makeStore();
		registerChild(store, "t-1", { pid: 123, kill: vi.fn() });
		expect(store._activeChildren.get("t-1").pid).toBe(123);
		registerChild(store, "t-2", { kill: vi.fn() });
		registerChild(store, "t-3", null);
		registerChild(store, "t-4", undefined);
		expect(store._activeChildren.has("t-2")).toBe(false);
		expect(store._activeChildren.has("t-3")).toBe(false);
	});

	it("unregisters by task id", () => {
		const store = makeStore();
		registerChild(store, "t-1", { pid: 123 });
		unregisterChild(store, "t-1");
		expect(store._activeChildren.has("t-1")).toBe(false);
		expect(() => unregisterChild(store, "missing")).not.toThrow();
	});
});

describe("killTaskProcess", () => {
	it("returns false with no child or a pid-less child", () => {
		const store = makeStore();
		expect(killTaskProcess(store, "missing")).toBe(false);
		store._activeChildren.set("t-1", { kill: vi.fn() });
		expect(killTaskProcess(store, "t-1")).toBe(false);
	});

	it("falls back to child.kill and unregisters", () => {
		const store = makeStore();
		const kill = vi.fn();
		// Unkillable pid: process.kill on the negative pgid throws, so the
		// child fallback runs without signalling anything real.
		store._activeChildren.set("t-1", { pid: 987654321, kill });
		expect(killTaskProcess(store, "t-1")).toBe(true);
		expect(kill).toHaveBeenCalledWith("SIGKILL");
		expect(store._activeChildren.has("t-1")).toBe(false);
	});

	it("kills process group directly on POSIX when group kill succeeds", async () => {
		const { spawn } = await import("node:child_process");
		const child = spawn("sleep", ["30"], { detached: true });
		const fallbackKill = vi.spyOn(child, "kill");
		const store = makeStore();
		store._activeChildren.set("t-sleep", child);

		expect(killTaskProcess(store, "t-sleep")).toBe(true);
		expect(store._activeChildren.has("t-sleep")).toBe(false);
		// process.kill(-child.pid) succeeded, so fallback child.kill was not needed
		expect(fallbackKill).not.toHaveBeenCalled();
	});

	it("still unregisters when child.kill throws", () => {
		const store = makeStore();
		store._activeChildren.set("t-1", {
			pid: 987654321,
			kill: () => {
				throw new Error("gone");
			},
		});
		expect(killTaskProcess(store, "t-1")).toBe(true);
		expect(store._activeChildren.has("t-1")).toBe(false);
	});

	it("dispatches taskkill on Windows and unregisters", () => {
		const store = makeStore();
		const execFileSyncFn = vi.fn();
		store._activeChildren.set("t-win", { pid: 7777 });

		expect(killTaskProcess(store, "t-win", { platform: "win32", execFileSyncFn })).toBe(true);
		expect(execFileSyncFn).toHaveBeenCalledWith(
			"taskkill",
			["/PID", "7777", "/T", "/F"],
			expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }),
		);
		expect(store._activeChildren.has("t-win")).toBe(false);
	});
});

describe("abortTask", () => {
	it("returns null for unknown tasks", () => {
		expect(abortTask(makeStore(), "p-1", "ghost")).toBeNull();
	});

	it("aborts the live run and resets an owned engine", () => {
		const store = makeStore();
		const abort = vi.fn();
		store.sessionStore = { get: () => ({ abort }) };
		store._activeChildren.set("t-1", { pid: 987654321, kill: vi.fn() });
		store.seed("p-1", task());
		store.engineState.status = "running";
		store.engineState.activeTaskId = "t-1";
		const aborted = abortTask(store, "p-1", "t-1", "/repo");
		expect(aborted.status).toBe("in_stage");
		expect(aborted.wasInterrupted).toBe(false);
		expect(abort).toHaveBeenCalled();
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", aborted);
		expect(store.setEngineState).toHaveBeenCalledWith(
			expect.objectContaining({ status: "idle", activeTaskId: null }),
		);
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_UPDATED", aborted);
	});

	it("leaves engine state alone for non-owned tasks", () => {
		const store = makeStore();
		store.seed("p-1", task());
		store.engineState.activeTaskId = "other";
		abortTask(store, "p-1", "t-1");
		expect(store.setEngineState).not.toHaveBeenCalled();
	});

	it("ignores session abort failures and works without a session store", () => {
		const store = makeStore();
		store.sessionStore = {
			get: () => {
				throw new Error("gone");
			},
		};
		store.seed("p-1", task());
		expect(abortTask(store, "p-1", "t-1").status).toBe("in_stage");
		const bare = makeStore();
		bare.seed("p-1", task());
		expect(abortTask(bare, "p-1", "t-1").status).toBe("in_stage");
	});

	it("skips abort when the session has no abort function", () => {
		const store = makeStore();
		store.sessionStore = { get: () => ({}) };
		store.seed("p-1", task());
		expect(abortTask(store, "p-1", "t-1").status).toBe("in_stage");
	});

	it("consumes any startup-recovery marker on abort", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({
				resumedAfterInterruption: true,
				interruptedAt: "2026-10-08T09:00:00.000Z",
			}),
		);
		const aborted = abortTask(store, "p-1", "t-1", "/repo");
		expect(aborted.status).toBe("in_stage");
		expect(aborted.resumedAfterInterruption).toBe(false);
		expect(aborted.interruptedAt).toBeNull();
		// The cleared marker is what reaches the persisted markdown.
		const persisted = store._saveTaskMarkdown.mock.calls.at(-1)[1];
		expect(persisted.resumedAfterInterruption).toBe(false);
	});
});

describe("rejectTask", () => {
	const STAGES = [{ id: "s-1", name: "Build", type: "agent" }];

	it("returns null for unknown tasks", () => {
		expect(rejectTask(makeStore(), "p-1", "ghost", STAGES, "no")).toBeNull();
	});

	it("records feedback, appends to the goal, and fails back", () => {
		const store = makeStore();
		const t = store.seed("p-1", task());
		rejectTask(store, "p-1", "t-1", STAGES, "  try again  ", undefined, "/repo");
		expect(t.feedback).toBe("try again");
		expect(t.goal).toContain("## Human Correction / Feedback");
		expect(t.goal).toContain("try again");
		expect(t.history.at(-1).action).toContain("Rejected by human review");
		expect(t.logEntries.at(-1).text).toContain("[HUMAN] Rejected by human review");
		expect(store.saveStageReport).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ status: "FAILED" }),
		);
		expect(store.failbackStage).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			STAGES,
			null,
			store.eventBridge,
			"/repo",
		);
	});

	it("appends review comments to the rejection report when feedback is freehand", () => {
		const store = makeStore();
		store.seed("p-1", task());
		rejectTask(store, "p-1", "t-1", STAGES, "Try again", undefined, "/repo", [
			{
				filePath: "./docs/tasks/t-1/plan.md",
				scope: "line",
				line: 4,
				body: "Add a rollback step",
			},
		]);
		const [, , report] = store.saveStageReport.mock.calls.at(-1);
		expect(report.content).toContain("# Human rejection");
		expect(report.content).toContain("Try again");
		expect(report.content).toContain("## Review Comments");
		expect(report.content).toContain("Add a rollback step");
	});

	it("does not duplicate comments the fail draft already carries", () => {
		const store = makeStore();
		store.seed("p-1", task());
		rejectTask(
			store,
			"p-1",
			"t-1",
			STAGES,
			"## Review comments\n- `./docs/tasks/t-1/plan.md`:L4 — Add a rollback step",
			undefined,
			"/repo",
			[
				{
					filePath: "./docs/tasks/t-1/plan.md",
					scope: "line",
					line: 4,
					body: "Add a rollback step",
				},
			],
		);
		const [, , report] = store.saveStageReport.mock.calls.at(-1);
		expect((report.content.match(/## Review [Cc]omments/g) || []).length).toBe(1);
	});

	it("records a Failed timeline row carrying the rejection reason", () => {
		const store = makeStore();
		const t = store.seed("p-1", task());
		rejectTask(store, "p-1", "t-1", STAGES, "  try again  ", undefined, "/repo");
		expect(store._recordTimelineWithDiffStat).toHaveBeenCalledWith(
			t,
			expect.objectContaining({
				stage: "Build",
				status: "Failed",
				reason: "try again",
				stageId: "s-1",
				stageName: "Build",
			}),
			"/repo",
			expect.anything(),
		);
		// The Failed row lands before the failback transition runs, so the
		// timeline reads rejection first, fallback move second.
		expect(
			store._recordTimelineWithDiffStat.mock.invocationCallOrder[0],
		).toBeLessThan(store.failbackStage.mock.invocationCallOrder[0]);
	});

	it("handles empty feedback without touching the goal", () => {
		const store = makeStore();
		const t = store.seed("p-1", task());
		rejectTask(store, "p-1", "t-1", STAGES, "   ");
		expect(t.feedback).toBe("");
		expect(t.goal).toBe("Do thing");
		expect(t.history.at(-1).action).toContain("No feedback");
	});

	it("falls back to the stage id when the stage is unknown", () => {
		const store = makeStore();
		store.seed("p-1", task({ currentStageId: "ghost" }));
		rejectTask(store, "p-1", "t-1", STAGES, "no");
		expect(store.saveStageReport).toHaveBeenCalledWith(
			"p-1",
			"t-1",
			expect.objectContaining({ stageName: "ghost" }),
		);
	});

	it("keeps the rejection as failure context on the failed-back task", () => {
		const store = makeStore();
		const t = store.seed("p-1", task({ status: "waiting_human" }));
		// The real failback clears failure context on transition (moveToStage).
		store.failbackStage.mockImplementationOnce(() => {
			t.status = "in_stage";
			t.failureReason = null;
			t.lastError = null;
			return t;
		});
		const result = rejectTask(
			store,
			"p-1",
			"t-1",
			STAGES,
			"  try again  ",
			undefined,
			"/repo",
		);
		expect(result).toBe(t);
		// Agent-ready for the next pickup, not parked as failed.
		expect(t.status).toBe("in_stage");
		expect(t.failureReason).toBe("try again");
		expect(t.lastError).toMatchObject({
			message: "try again",
			stageId: "s-1",
			stageName: "Build",
			stageType: "agent",
			failureKind: "rejected",
		});
		expect(typeof t.lastError.timestamp).toBe("string");
		// The rejection is re-applied after the failback runs, so the final
		// save carries the settled failure context.
		expect(store._saveTaskMarkdown).toHaveBeenCalledWith("/repo", t);
		expect(
			store.failbackStage.mock.invocationCallOrder[0],
		).toBeLessThan(store._saveTaskMarkdown.mock.invocationCallOrder.at(-1));
	});

	it("falls back to a generic reason when feedback and stage are unknown", () => {
		const store = makeStore();
		const t = store.seed("p-1", task({ currentStageId: "ghost" }));
		rejectTask(store, "p-1", "t-1", STAGES, "   ");
		expect(t.failureReason).toBe("No feedback");
		expect(t.lastError).toMatchObject({
			message: "No feedback",
			stageType: "human",
			failureKind: "rejected",
		});
	});
});

describe("followUpTask", () => {
	it("returns null for unknown tasks", async () => {
		await expect(followUpTask(makeStore(), "p-1", "ghost", "hi")).resolves.toBeNull();
	});

	it("returns the task untouched for blank prompts", async () => {
		const store = makeStore();
		const t = store.seed("p-1", task());
		await expect(followUpTask(store, "p-1", "t-1", "   ")).resolves.toBe(t);
		expect(store.executeStage).not.toHaveBeenCalled();
	});

	it("forwards to a streaming session", async () => {
		const store = makeStore();
		const session = { isStreaming: true, followUp: vi.fn(async () => {}) };
		store.seed("p-1", task());
		await followUpTask(store, "p-1", "t-1", "more detail", { session });
		expect(session.followUp).toHaveBeenCalledWith("more detail");
		expect(store.executeStage).not.toHaveBeenCalled();
		const t = store.getTask("p-1", "t-1");
		expect(t.goal).toContain("## Follow-up Guidance");
	});

	it("dispatches execution for parked tasks when the session is idle", async () => {
		const store = makeStore();
		const agentRunner = vi.fn();
		for (const status of ["interrupted", "in_stage", "waiting_human"]) {
			const t = store.seed("p-1", task({ id: `t-${status}`, status }));
			await followUpTask(store, "p-1", t.id, "go", { agentRunner });
			expect(store.executeStage).toHaveBeenCalledWith(
				"p-1",
				t.id,
				expect.objectContaining({ priority: "high", agentRunner }),
			);
		}
	});

	it("does not dispatch for settled tasks without a streaming session", async () => {
		const store = makeStore();
		store.seed("p-1", task({ status: "completed" }));
		await followUpTask(store, "p-1", "t-1", "go", { agentRunner: vi.fn() });
		expect(store.executeStage).not.toHaveBeenCalled();
	});
});

describe("steerTask", () => {
	it("returns null for unknown tasks", async () => {
		await expect(steerTask(makeStore(), "p-1", "ghost", "left")).resolves.toBeNull();
	});

	it("returns the task untouched for blank guidance", async () => {
		const store = makeStore();
		const t = store.seed("p-1", task());
		await expect(steerTask(store, "p-1", "t-1", "  ")).resolves.toBe(t);
	});

	it("appends guidance and steers the live session", async () => {
		const store = makeStore();
		const session = { steer: vi.fn(async () => {}) };
		store.seed("p-1", task());
		const steered = await steerTask(store, "p-1", "t-1", "go left", { session });
		expect(steered.goal).toContain("## Steering Guidance");
		expect(steered.goal).toContain("go left");
		expect(session.steer).toHaveBeenCalledWith("go left");
		expect(store.eventBridge.broadcastGlobal).toHaveBeenCalledWith("TASK_UPDATED", steered);
	});

	it("works without a session", async () => {
		const store = makeStore();
		store.seed("p-1", task());
		const steered = await steerTask(store, "p-1", "t-1", "go left");
		expect(steered.goal).toContain("go left");
	});
});
