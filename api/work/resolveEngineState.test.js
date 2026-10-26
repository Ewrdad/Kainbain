import { describe, it, expect, vi } from "vitest";
import { resolveEngineState } from "./resolveEngineState.js";

describe("The Work: resolveEngineState", () => {
	it("returns a shallow snapshot of raw engine state when nothing else is available", () => {
		const store = { engineState: { status: "idle", activeTaskId: null, updatedAt: "x" } };
		const snapshot = resolveEngineState(store);
		expect(snapshot.status).toBe("idle");
		expect(snapshot.activeTask).toBeNull();
		expect(snapshot.openQueueDepth).toBe(0);
	});

	it("never throws on null or broken stores", () => {
		expect(() => resolveEngineState(null)).not.toThrow();
		expect(() => resolveEngineState({ engineState: { status: "idle" }, executionQueue: { isRunning: true } })).not.toThrow();
	});

	it("includes execution queue and busyWhileIdle signals", () => {
		const store = {
			engineState: { status: "idle", activeTaskId: null },
			executionQueue: { isRunning: true, size: 2, activeStartedAt: 5 },
			tasksByProject: new Map(),
			projectStore: { getProject: vi.fn() },
		};
		const snapshot = resolveEngineState(store);
		expect(snapshot.executionQueue).toMatchObject({ isRunning: true, size: 2, activeStartedAt: 5 });
		expect(snapshot.busyWhileIdle).toBe(true);
	});
});
