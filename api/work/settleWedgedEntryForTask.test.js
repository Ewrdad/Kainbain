import { describe, it, expect, vi } from "vitest";
import { settleWedgedEntryForTask } from "./settleWedgedEntryForTask.js";

describe("The Work: settleWedgedEntryForTask", () => {
	it("settles only when the task owns the live queue entry", () => {
		const eq = {
			activeEntry: { taskId: "t1" },
			settleActive: vi.fn(() => true),
		};
		const store = { executionQueue: eq };
		expect(settleWedgedEntryForTask(store, "t1", "boom")).toBe(true);
		expect(eq.settleActive).toHaveBeenCalledWith(expect.any(Error));
		expect(eq.settleActive.mock.calls[0][0].message).toBe("boom");

		const eq2 = { activeEntry: { taskId: "t2" }, settleActive: vi.fn(() => true) };
		expect(settleWedgedEntryForTask({ executionQueue: eq2 }, "t1")).toBe(false);
		expect(eq2.settleActive).not.toHaveBeenCalled();
	});

	it("returns false without throwing for missing or hostile input", () => {
		expect(settleWedgedEntryForTask(undefined, "t1")).toBe(false);
		expect(settleWedgedEntryForTask({ executionQueue: null }, "t1")).toBe(false);
		expect(settleWedgedEntryForTask({ executionQueue: { activeEntry: { taskId: "t1" } } }, "t1")).toBe(false);
		const eq = {
			activeEntry: { taskId: "t1" },
			settleActive: () => {
				throw new Error("down");
			},
		};
		expect(settleWedgedEntryForTask({ executionQueue: eq }, "t1")).toBe(false);
	});

	it("passes an Error through unchanged", () => {
		const err = new Error("already");
		const eq = { activeEntry: { taskId: "t1" }, settleActive: vi.fn(() => "ok") };
		expect(settleWedgedEntryForTask({ executionQueue: eq }, "t1", err)).toBe("ok");
		expect(eq.settleActive).toHaveBeenCalledWith(err);
	});
});
