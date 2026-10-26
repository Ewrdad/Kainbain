import { expect, test, describe, beforeEach } from "vitest";
import { SteerStore } from "./steerStore.js";

/***
 * MARK: SteerStore Unit Tests
 * @description Verifies the D5 steer queue (ADR 0011): queue/ack round
 *   trip, read-only pulls, exactly-once acks, loud unknown-steer and
 *   over-long-text rejections (never silent truncation or phantom
 *   receipts).
 ***/
describe("SteerStore", () => {
	let steers;
	beforeEach(() => {
		steers = new SteerStore();
	});

	test("queues, pulls read-only, and acks exactly once", () => {
		const { steerId } = steers.queue({ taskId: "t1", executionId: "e1", text: "hold on" });
		expect(typeof steerId).toBe("string");
		expect(steers.pendingFor("e1")).toHaveLength(1);
		// Pulls never drain: only ack removes.
		expect(steers.pendingFor("e1")).toHaveLength(1);
		const receipt = steers.ack("e1", steerId, { ok: true, detail: "delivered" });
		expect(receipt).toMatchObject({ steerId, ok: true, detail: "delivered" });
		expect(steers.pendingFor("e1")).toHaveLength(0);
		expect(steers.receiptsFor("e1")).toHaveLength(1);
		// Second ack of the same steer is unknown, never a duplicate receipt.
		expect(() => steers.ack("e1", steerId, { ok: true })).toThrowError(/Unknown steer/);
		expect(steers.receiptsFor("e1")).toHaveLength(1);
	});

	test("rejects blank, over-long, and unkeyed steers loudly", () => {
		expect(() => steers.queue({ taskId: "t", executionId: "e", text: "  " })).toThrowError(
			/non-blank/,
		);
		expect(() =>
			steers.queue({ taskId: "t", executionId: "e", text: "x".repeat(4001) }),
		).toThrowError(/exceeds 4000/);
		expect(() => steers.queue({ executionId: "e", text: "hi" })).toThrowError(/taskId/);
		expect(() => steers.ack("nope", "nope", { ok: true })).toThrowError(/Unknown steer/);
	});
});
