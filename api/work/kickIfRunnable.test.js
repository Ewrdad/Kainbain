import { describe, it, expect, vi } from "vitest";
import { kickIfRunnable } from "./kickIfRunnable.js";

describe("The Work: kickIfRunnable", () => {
	it("kicks the scheduler when a task is in_stage", () => {
		const store = { kickScheduler: vi.fn() };
		const task = { id: "t1", status: "in_stage" };
		expect(kickIfRunnable(store, task)).toBe(task);
		expect(store.kickScheduler).toHaveBeenCalled();
	});

	it("does nothing for non-runnable tasks", () => {
		const store = { kickScheduler: vi.fn() };
		expect(kickIfRunnable(store, { id: "t1", status: "completed" })).toMatchObject({ status: "completed" });
		expect(store.kickScheduler).not.toHaveBeenCalled();
		expect(kickIfRunnable(store, null)).toBeNull();
	});

	it("never throws when the scheduler is missing or throwing", () => {
		expect(() => kickIfRunnable({}, { status: "in_stage" })).not.toThrow();
		const store = { kickScheduler: () => { throw new Error("down"); } };
		expect(() => kickIfRunnable(store, { status: "in_stage" })).not.toThrow();
	});
});
