import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
	advanceStage,
	completeTask,
	failbackStage,
	moveToStage,
	pauseTask,
} from "./stageTransitions.js";
import { abortTask, rejectTask } from "./taskControl.js";
import {
	clearAlertSinks,
	registerAlertSink,
} from "../observability/alerts.js";

const HOLD_MS = 86400000; // 1 day

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human", autoApproveAfterMs: HOLD_MS },
	{ id: "s-3", name: "Done", type: "agent" },
];

const TERMINAL_HUMAN_STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Final Review", type: "human", autoApproveAfterMs: HOLD_MS },
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
		failbackStage: (pid, tid, stages, fid, bridge, cwd) =>
			failbackStage(store, pid, tid, stages, fid, bridge, cwd),
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
		autoApproveAt: null,
		autoApproveRemindedAt: null,
		...overrides,
	};
}

const flushAlerts = async () => {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
};

beforeEach(() => {
	vi.clearAllMocks();
	clearAlertSinks();
});

afterEach(() => {
	clearAlertSinks();
});

describe("auto-approve stamp on entry", () => {
	it("stamps autoApproveAt = enteredStageAt + hold exactly on human entry", () => {
		const store = makeStore();
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
		expect(typeof moved.autoApproveAt).toBe("string");
		expect(Date.parse(moved.autoApproveAt) - Date.parse(moved.enteredStageAt)).toBe(HOLD_MS);
		expect(moved.autoApproveRemindedAt).toBeNull();
	});

	it("clears the stamp when the human stage carries no hold", () => {
		const store = makeStore({
			project: {
				id: "p-1",
				stages: [
					{ id: "s-1", name: "Build", type: "agent" },
					{ id: "s-2", name: "Review", type: "human" },
				],
			},
		});
		store.seed(
			"p-1",
			task({ autoApproveAt: "2026-11-11T00:00:00.000Z", autoApproveRemindedAt: "x" }),
		);
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
		expect(moved.autoApproveAt).toBeNull();
		expect(moved.autoApproveRemindedAt).toBeNull();
	});

	it("clears the stamp on non-human destinations (even when the stage carries a hold)", () => {
		const store = makeStore();
		store.seed(
			"p-1",
			task({ autoApproveAt: "2026-11-11T00:00:00.000Z", autoApproveRemindedAt: "x" }),
		);
		const moved = moveToStage(store, "p-1", "t-1", "s-3", "Moved");
		expect(moved.status).toBe("in_stage");
		expect(moved.autoApproveAt).toBeNull();
		expect(moved.autoApproveRemindedAt).toBeNull();
	});

	it("stamps nothing for an invalid hold (tolerant entry)", () => {
		const store = makeStore({
			project: {
				id: "p-1",
				stages: [
					{ id: "s-1", name: "Build", type: "agent" },
					{ id: "s-2", name: "Review", type: "human", autoApproveAfterMs: "ten days" },
				],
			},
		});
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(moved.status).toBe("waiting_human");
		expect(moved.autoApproveAt).toBeNull();
	});

	it("accepts human duration strings on the stage (coerced at entry)", () => {
		const store = makeStore({
			project: {
				id: "p-1",
				stages: [
					{ id: "s-1", name: "Build", type: "agent" },
					{ id: "s-2", name: "Review", type: "human", autoApproveAfterMs: "10 days" },
				],
			},
		});
		store.seed("p-1", task());
		const moved = moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		expect(Date.parse(moved.autoApproveAt) - Date.parse(moved.enteredStageAt)).toBe(
			10 * 86400000,
		);
	});
});

describe("auto-approve stamp cleared on every exit", () => {
	function seededHumanStore(stages = STAGES) {
		const store = makeStore({ project: { id: "p-1", stages } });
		store.seed("p-1", task());
		moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		const parked = store.getTask("p-1", "t-1");
		expect(parked.status).toBe("waiting_human");
		expect(parked.autoApproveAt).toBeTypeOf("string");
		return store;
	}

	it("manual advance clears the stamp", () => {
		const store = seededHumanStore();
		const advanced = advanceStage(store, "p-1", "t-1", STAGES, undefined, "/repo", {});
		expect(advanced.currentStageId).toBe("s-3");
		expect(advanced.autoApproveAt).toBeNull();
		expect(advanced.autoApproveRemindedAt).toBeNull();
	});

	it("advance out of a final human stage completes with the stamp cleared", () => {
		const store = seededHumanStore(TERMINAL_HUMAN_STAGES);
		const done = advanceStage(store, "p-1", "t-1", TERMINAL_HUMAN_STAGES, undefined, "/repo", {});
		expect(done.status).toBe("completed");
		expect(done.autoApproveAt).toBeNull();
		expect(done.autoApproveRemindedAt).toBeNull();
	});

	it("failback clears the stamp", () => {
		const store = seededHumanStore();
		const failed = failbackStage(store, "p-1", "t-1", STAGES, null, undefined, "/repo");
		expect(failed.currentStageId).toBe("s-1");
		expect(failed.autoApproveAt).toBeNull();
	});

	it("failback with the abort policy fails with the stamp cleared", () => {
		const store = seededHumanStore();
		const failed = failbackStage(store, "p-1", "t-1", STAGES, "abort", undefined, "/repo");
		expect(failed.status).toBe("failed");
		expect(failed.autoApproveAt).toBeNull();
		expect(failed.autoApproveRemindedAt).toBeNull();
	});

	it("operator move clears the stamp", () => {
		const store = seededHumanStore();
		const moved = moveToStage(store, "p-1", "t-1", "s-1", "Moved", undefined, "/repo", {
			operatorMove: true,
		});
		expect(moved.currentStageId).toBe("s-1");
		expect(moved.autoApproveAt).toBeNull();
	});

	it("operator jump clears the stamp", () => {
		const store = seededHumanStore();
		const moved = moveToStage(store, "p-1", "t-1", "s-3", "Jumped", undefined, "/repo", {
			operatorMove: true,
		});
		expect(moved.currentStageId).toBe("s-3");
		expect(moved.autoApproveAt).toBeNull();
	});

	it("pause clears the stamp", () => {
		const store = seededHumanStore();
		const paused = pauseTask(store, "p-1", "t-1", "/repo");
		expect(paused.status).toBe("paused");
		expect(paused.autoApproveAt).toBeNull();
		expect(paused.autoApproveRemindedAt).toBeNull();
	});

	it("abort clears the stamp", () => {
		const store = seededHumanStore();
		const aborted = abortTask(store, "p-1", "t-1", "/repo");
		expect(aborted.status).toBe("in_stage");
		expect(aborted.autoApproveAt).toBeNull();
		expect(aborted.autoApproveRemindedAt).toBeNull();
	});

	it("complete clears the stamp", () => {
		const store = seededHumanStore();
		const done = completeTask(store, "p-1", "t-1", "/repo");
		expect(done.status).toBe("completed");
		expect(done.autoApproveAt).toBeNull();
		expect(done.autoApproveRemindedAt).toBeNull();
	});

	it("reject (failback with feedback) clears the stamp", () => {
		const store = seededHumanStore();
		const rejected = rejectTask(store, "p-1", "t-1", STAGES, "needs work", undefined, "/repo", []);
		expect(rejected.autoApproveAt).toBeNull();
		expect(rejected.autoApproveRemindedAt).toBeNull();
	});

	it("failback INTO a configured human stage stamps a fresh visit", () => {
		const stages = [
			{ id: "s-1", name: "Build", type: "agent" },
			{ id: "s-2", name: "Review", type: "human", autoApproveAfterMs: HOLD_MS },
			{ id: "s-3", name: "Polish", type: "agent" },
		];
		const store = makeStore({ project: { id: "p-1", stages } });
		store.seed("p-1", task({ currentStageId: "s-3" }));
		const failed = failbackStage(store, "p-1", "t-1", stages, "s-2", undefined, "/repo");
		expect(failed.currentStageId).toBe("s-2");
		expect(failed.status).toBe("waiting_human");
		expect(Date.parse(failed.autoApproveAt) - Date.parse(failed.enteredStageAt)).toBe(HOLD_MS);
	});
});

describe("automated advance attribution", () => {
	const firedAt = "2026-11-11T00:01:30.000Z";

	function automatedReview(parked) {
		return {
			automated: true,
			autoApproveAt: parked.autoApproveAt,
			firedAt,
			durationMs: HOLD_MS,
		};
	}

	it("writes the automatic audit line, report, timeline badge, and alert", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (payload) => { sent.push(payload); return { delivered: true }; } });
		const store = makeStore({ project: { id: "p-1", stages: STAGES } });
		store.seed("p-1", task());
		moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		const parked = store.getTask("p-1", "t-1");
		// Snapshot: the advance below mutates this same object in place.
		const heldSince = parked.enteredStageAt;
		const deadline = parked.autoApproveAt;
		clearAlertSinks();
		registerAlertSink({ name: "test", send: async (payload) => { sent.push(payload); return { delivered: true }; } });
		sent.length = 0;

		const advanced = advanceStage(store, "p-1", "t-1", STAGES, undefined, "/repo", automatedReview(parked));
		await flushAlerts();

		expect(advanced.currentStageId).toBe("s-3");
		expect(advanced.autoApproveAt).toBeNull();
		const audit = advanced.history.find((h) => h.action.includes("Auto-approved after"));
		expect(audit).toBeDefined();
		expect(audit.action).toContain("1 day");
		expect(audit.action).toContain("(automatic)");
		expect(audit.action).toContain(`held since ${heldSince}`);
		expect(audit.action).toContain(`deadline ${deadline}`);
		expect(audit.action).toContain(`fired ${firedAt}`);
		expect(advanced.history.at(-1).action).toBe("Advanced to stage 'Done' (automatic)");

		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.status).toBe("PASSED");
		expect(report.content).toContain("# Human approval (automatic): Review");
		expect(report.content).toContain("auto-approve timer after 1 day");

		const arrival = store._recordTimelineWithDiffStat.mock.calls.at(-1)[1];
		expect(arrival).toMatchObject({
			stage: "Done",
			status: "Advanced",
			automated: true,
			autoApproveAt: deadline,
			autoApproveFiredAt: firedAt,
		});

		const fired = sent.filter((p) => p.event === "task.auto_approve");
		expect(fired).toHaveLength(1);
		expect(fired[0].severity).toBe("info");
		expect(fired[0].error.message).toContain("1 day");
	});

	it("badges the terminal row when the final stage auto-approves", async () => {
		const store = makeStore({ project: { id: "p-1", stages: TERMINAL_HUMAN_STAGES } });
		store.seed("p-1", task());
		moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		const parked = store.getTask("p-1", "t-1");
		const deadline = parked.autoApproveAt;
		const done = advanceStage(store, "p-1", "t-1", TERMINAL_HUMAN_STAGES, undefined, "/repo", automatedReview(parked));
		expect(done.status).toBe("completed");
		const terminal = store._recordTimelineWithDiffStat.mock.calls.at(-1)[1];
		expect(terminal).toMatchObject({
			status: "Completed",
			automated: true,
			autoApproveAt: deadline,
			autoApproveFiredAt: firedAt,
		});
	});

	it("ignores the automated marker on non-human exits", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (payload) => { sent.push(payload); return { delivered: true }; } });
		const store = makeStore({ project: { id: "p-1", stages: STAGES } });
		store.seed("p-1", task({ currentStageId: "s-1" }));
		const advanced = advanceStage(store, "p-1", "t-1", STAGES, undefined, "/repo", {
			automated: true,
			autoApproveAt: "2026-11-11T00:00:00.000Z",
			firedAt,
			durationMs: HOLD_MS,
		});
		await flushAlerts();
		expect(advanced.currentStageId).toBe("s-2");
		expect(advanced.history.some((h) => h.action.includes("automatic"))).toBe(false);
		expect(store.saveStageReport).not.toHaveBeenCalled();
		expect(sent.filter((p) => p.event === "task.auto_approve")).toHaveLength(0);
		// …but the genuine human entry still stamped the deadline.
		expect(typeof advanced.autoApproveAt).toBe("string");
	});

	it("manual advances stay byte-identical (no automatic text, no alert)", async () => {
		const sent = [];
		registerAlertSink({ name: "test", send: async (payload) => { sent.push(payload); return { delivered: true }; } });
		const store = makeStore({ project: { id: "p-1", stages: STAGES } });
		store.seed("p-1", task());
		moveToStage(store, "p-1", "t-1", "s-2", "Moved");
		sent.length = 0;
		const advanced = advanceStage(store, "p-1", "t-1", STAGES, undefined, "/repo", { guidance: "ship it" });
		await flushAlerts();
		expect(advanced.history.at(-1).action).toBe("Advanced to stage 'Done'");
		expect(advanced.history.some((h) => h.action.includes("automatic"))).toBe(false);
		const report = store.saveStageReport.mock.calls[0][2];
		expect(report.content).toContain("# Human approval: Review");
		expect(report.content).not.toContain("automatic");
		const arrival = store._recordTimelineWithDiffStat.mock.calls.at(-1)[1];
		expect(arrival.automated).toBeUndefined();
		expect(sent.filter((p) => p.event === "task.auto_approve")).toHaveLength(0);
	});
});
