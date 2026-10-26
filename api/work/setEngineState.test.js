import { describe, it, expect, vi } from "vitest";
import { setEngineState } from "./setEngineState.js";

describe("The Work: setEngineState", () => {
	it("merges updates, stamps updatedAt, broadcasts, and returns a snapshot", () => {
		const broadcastGlobal = vi.fn();
		const store = {
			engineState: { status: "idle", activeTaskId: null, updatedAt: "old" },
			eventBridge: { broadcastGlobal },
			projectStore: null,
			tasksByProject: new Map(),
			executionQueue: { isRunning: false, size: 0, activeStartedAt: null },
			getEngineState() {
				return { ...this.engineState, activeTask: null };
			},
		};
		const result = setEngineState(store, { status: "running", activeTaskId: "t1" });
		expect(store.engineState.status).toBe("running");
		expect(store.engineState.activeTaskId).toBe("t1");
		expect(store.engineState.updatedAt).not.toBe("old");
		expect(broadcastGlobal).toHaveBeenCalledWith("ENGINE_STATE", expect.objectContaining({ status: "running" }));
		expect(result).toMatchObject({ status: "running" });
	});

	it("never throws when the event bridge throws", () => {
		const store = {
			engineState: { status: "idle" },
			eventBridge: { broadcastGlobal: () => { throw new Error("boom"); } },
			getEngineState() { return { status: "idle" }; },
		};
		expect(() => setEngineState(store, { status: "running" })).not.toThrow();
	});

	it("works without an event bridge", () => {
		const store = {
			engineState: { status: "idle" },
			getEngineState() { return { ...this.engineState }; },
		};
		const result = setEngineState(store, { status: "running" });
		expect(result.status).toBe("running");
	});
});
