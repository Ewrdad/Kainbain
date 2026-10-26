import { describe, it, expect, vi, afterEach } from "vitest";
import { WorkflowRegistry } from "./workflowRegistry.js";

/**
 * MARK: WorkflowRegistry unit tests
 * @description Verifies run registration, listing, and the TTL sweep that
 * prevents the registry from growing unboundedly.
 */
describe("WorkflowRegistry", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts a run and lists it", () => {
		const registry = new WorkflowRegistry();
		const run = registry.start({ workflowId: "wf-1", projectId: "proj-1" });
		expect(run.id).toBeTruthy();
		expect(run.workflowId).toBe("wf-1");
		expect(run.projectId).toBe("proj-1");
		expect(run.status).toBe("In Progress");
		expect(registry.list()).toHaveLength(1);
	});

	it("assigns a unique id to each run", () => {
		const registry = new WorkflowRegistry();
		const a = registry.start({ workflowId: "wf-1", projectId: "proj-1" });
		const b = registry.start({ workflowId: "wf-2", projectId: "proj-1" });
		expect(a.id).not.toBe(b.id);
		expect(registry.list()).toHaveLength(2);
	});

	it("sweeps runs older than the TTL", () => {
		vi.useFakeTimers();
		const registry = new WorkflowRegistry();
		registry.start({ workflowId: "old", projectId: "proj-1" });

		// Advance past the 24h TTL and run the sweep.
		vi.advanceTimersByTime(25 * 60 * 60 * 1000);
		registry.startCleanup();
		vi.advanceTimersByTime(60 * 60 * 1000);

		expect(registry.list()).toHaveLength(0);
	});

	it("keeps runs younger than the TTL", () => {
		vi.useFakeTimers();
		const registry = new WorkflowRegistry();
		registry.start({ workflowId: "fresh", projectId: "proj-1" });

		// Advance only a short time, well under the TTL.
		vi.advanceTimersByTime(60 * 1000);
		registry.startCleanup();
		vi.advanceTimersByTime(60 * 60 * 1000);

		expect(registry.list()).toHaveLength(1);
	});
});
