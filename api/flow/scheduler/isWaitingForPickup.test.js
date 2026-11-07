import { describe, it, expect, vi } from "vitest";
import { isWaitingForPickup } from "./isWaitingForPickup.js";

const STAGES = [
	{ id: "s-1", name: "Build", type: "agent" },
	{ id: "s-2", name: "Review", type: "human" },
	{ id: "s-3", name: "Integrate", type: "merge" },
];

function task(overrides = {}) {
	return {
		id: "t-1",
		projectId: "p-1",
		status: "in_stage",
		currentStageId: "s-1",
		...overrides,
	};
}

function makeStore({
	stages = STAGES,
	engineState = {},
	blocked = false,
	claimed = false,
} = {}) {
	const project = { id: "p-1", name: "P", cwd: "/repo", stages };
	const store = {
		engineState: { status: "idle", activeTaskId: null, ...engineState },
		projectStore: {
			listProjects: () => [project],
			getProject: (id) => (id === "p-1" ? project : null),
		},
		isTaskBlocked: () => ({
			blocked,
			blockers: blocked ? ["base"] : [],
			hasCycle: false,
		}),
		claimStore: {
			describe: () => (claimed ? { runnerId: "r-1" } : null),
		},
		getEngineState: () => store.engineState,
	};
	return store;
}

describe("isWaitingForPickup eligibility", () => {
	it("accepts an in_stage task on an automated, unpaused, unblocked, unclaimed stage", () => {
		expect(isWaitingForPickup(task(), { store: makeStore() })).toBe(true);
	});

	it.each(["completed", "done", "failed", "cancelled"])(
		"rejects terminal status %s",
		(status) => {
			expect(
				isWaitingForPickup(task({ status }), { store: makeStore() }),
			).toBe(false);
		},
	);

	it.each([
		"paused",
		"advancing",
		"checkpoint",
		"idle",
		"running_agent",
		"running_ci",
		"running_merge",
		"running_deploy",
	])("rejects non-waiting status %s", (status) => {
		expect(
			isWaitingForPickup(task({ status }), { store: makeStore() }),
		).toBe(false);
	});

	it("rejects waiting_human tasks and tasks sitting on a human stage", () => {
		const store = makeStore();
		expect(
			isWaitingForPickup(task({ status: "waiting_human" }), { store }),
		).toBe(false);
		expect(
			isWaitingForPickup(task({ currentStageId: "s-2" }), { store }),
		).toBe(false);
	});

	it("rejects blocked tasks", () => {
		expect(
			isWaitingForPickup(task(), { store: makeStore({ blocked: true }) }),
		).toBe(false);
	});

	it("rejects tasks claimed by a live runner lease", () => {
		expect(
			isWaitingForPickup(task(), { store: makeStore({ claimed: true }) }),
		).toBe(false);
	});

	it("rejects the active engine owner while the engine is running", () => {
		const store = makeStore({
			engineState: { status: "running", activeTaskId: "t-1" },
		});
		expect(isWaitingForPickup(task(), { store })).toBe(false);
	});

	it("rejects the active engine owner while the engine is advancing", () => {
		const store = makeStore({
			engineState: { status: "advancing", activeTaskId: "t-1" },
		});
		expect(isWaitingForPickup(task(), { store })).toBe(false);
	});

	it("keeps a non-owner waiting while the engine runs another task", () => {
		const store = makeStore({
			engineState: { status: "running", activeTaskId: "t-other" },
		});
		expect(isWaitingForPickup(task(), { store })).toBe(true);
	});

	it("rejects tasks on a paused stage", () => {
		const store = makeStore({
			stages: [{ id: "s-1", name: "Build", type: "agent", paused: true }],
		});
		expect(isWaitingForPickup(task(), { store })).toBe(false);
	});

	it("rejects interrupted tasks that are not auto-resumable", () => {
		const store = makeStore();
		// Human stage: never auto-resumes.
		expect(
			isWaitingForPickup(
				task({ status: "interrupted", currentStageId: "s-2" }),
				{ store },
			),
		).toBe(false);
		// Merge stage without rehydration markers: parked for the operator.
		expect(
			isWaitingForPickup(
				task({ status: "interrupted", currentStageId: "s-3" }),
				{ store },
			),
		).toBe(false);
		// Blocked interruptions stay parked.
		expect(
			isWaitingForPickup(task({ status: "interrupted" }), {
				store: makeStore({ blocked: true }),
			}),
		).toBe(false);
	});

	it("accepts interrupted tasks that are auto-resumable", () => {
		expect(
			isWaitingForPickup(task({ status: "interrupted" }), {
				store: makeStore(),
			}),
		).toBe(true);
	});

	it("rejects tasks whose stage no longer resolves", () => {
		const store = makeStore();
		expect(
			isWaitingForPickup(task({ currentStageId: "ghost" }), { store }),
		).toBe(false);
	});

	it("rejects tasks whose project cannot be resolved", () => {
		const store = makeStore();
		expect(
			isWaitingForPickup(task({ projectId: "missing" }), { store }),
		).toBe(false);
	});

	it("never throws and resolves unreadable input to false", () => {
		expect(isWaitingForPickup(null, { store: makeStore() })).toBe(false);
		expect(isWaitingForPickup(undefined, {})).toBe(false);
		expect(isWaitingForPickup(task(), {})).toBe(false);
		expect(isWaitingForPickup(task(), { store: null })).toBe(false);
		expect(isWaitingForPickup("t-1", { store: makeStore() })).toBe(false);
		const hostile = {
			get projectStore() {
				throw new Error("down");
			},
			get engineState() {
				throw new Error("down");
			},
			isTaskBlocked: () => {
				throw new Error("down");
			},
			claimStore: {
				describe: () => {
					throw new Error("down");
				},
			},
			getEngineState: () => {
				throw new Error("down");
			},
		};
		expect(isWaitingForPickup(task(), { store: hostile })).toBe(false);
	});

	it("honours explicit context injections without touching the store", () => {
		const store = {
			projectStore: {
				getProject: vi.fn(() => {
					throw new Error("must not be called");
				}),
			},
			isTaskBlocked: vi.fn(() => {
				throw new Error("must not be called");
			}),
			claimStore: {
				describe: vi.fn(() => {
					throw new Error("must not be called");
				}),
			},
			getEngineState: vi.fn(() => {
				throw new Error("must not be called");
			}),
		};
		expect(
			isWaitingForPickup(task(), {
				store,
				project: { id: "p-1", stages: STAGES },
				stage: STAGES[0],
				blocked: false,
				claimed: false,
				engineState: { status: "idle", activeTaskId: null },
			}),
		).toBe(true);
		expect(store.projectStore.getProject).not.toHaveBeenCalled();
		expect(store.isTaskBlocked).not.toHaveBeenCalled();
		expect(store.claimStore.describe).not.toHaveBeenCalled();
		expect(store.getEngineState).not.toHaveBeenCalled();
	});

	it("honours an injected blocked/claimed verdict over the store", () => {
		const store = makeStore();
		expect(
			isWaitingForPickup(task(), { store, blocked: true }),
		).toBe(false);
		expect(
			isWaitingForPickup(task(), { store, claimed: true }),
		).toBe(false);
	});

	it("treats a missing claim store as not claimed", () => {
		const store = makeStore();
		delete store.claimStore;
		expect(isWaitingForPickup(task(), { store })).toBe(true);
	});

	it("treats a missing block checker as not blocked", () => {
		const store = makeStore();
		delete store.isTaskBlocked;
		expect(isWaitingForPickup(task(), { store })).toBe(true);
	});

	it("reads the raw engine field and never calls getEngineState when it is present", () => {
		// getEngineState derives openQueueDepth through this very predicate,
		// so calling it from here would recurse forever.
		const store = makeStore({
			engineState: { status: "running", activeTaskId: "t-1" },
		});
		store.getEngineState = vi.fn(() => {
			throw new Error("must not recurse into the snapshot");
		});
		expect(isWaitingForPickup(task(), { store })).toBe(false);
		expect(store.getEngineState).not.toHaveBeenCalled();
	});

	it("falls back to getEngineState only when no raw engine field exists", () => {
		const store = makeStore();
		delete store.engineState;
		store.getEngineState = () => ({ status: "running", activeTaskId: "t-1" });
		expect(isWaitingForPickup(task(), { store })).toBe(false);
	});

	it("supports a resolveStagesForTask injection seam", () => {
		const store = makeStore();
		const resolveStagesForTask = vi.fn(() => STAGES);
		expect(
			isWaitingForPickup(task(), { store, resolveStagesForTask }),
		).toBe(true);
		expect(resolveStagesForTask).toHaveBeenCalled();
	});

	it("never triggers a disk rescan while resolving", () => {
		const store = makeStore();
		store.listTasks = vi.fn(() => {
			throw new Error("must stay a read-only in-memory scan");
		});
		expect(isWaitingForPickup(task(), { store })).toBe(true);
		expect(store.listTasks).not.toHaveBeenCalled();
	});
});
