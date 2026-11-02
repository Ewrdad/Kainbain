import { describe, it, expect } from "vitest";
import { didFailbackMoveStages } from "./didFailbackMoveStages.js";

/***
 * MARK: didFailbackMoveStages tests
 * @description Verifies the failback-destination compare that classifies
 *   a re-run as cross-stage iteration (moved) vs same-stage retry.
 ***/
describe("didFailbackMoveStages", () => {
	it("is true when the failback moved to a different stage", () => {
		expect(didFailbackMoveStages({ currentStageId: "1" }, { id: "2" })).toBe(true);
		expect(didFailbackMoveStages({ currentStageId: "prev" }, { id: "failed" })).toBe(true);
	});

	it("is false when the failback landed on the same stage (first-stage fallback)", () => {
		expect(didFailbackMoveStages({ currentStageId: "1" }, { id: "1" })).toBe(false);
	});

	it("compares ids as strings (numeric vs string ids still match)", () => {
		expect(didFailbackMoveStages({ currentStageId: 2 }, { id: "2" })).toBe(false);
		expect(didFailbackMoveStages({ currentStageId: "3" }, { id: 2 })).toBe(true);
	});

	it("is false when the failed stage is unknown (never claims a move)", () => {
		expect(didFailbackMoveStages({ currentStageId: "1" }, null)).toBe(false);
		expect(didFailbackMoveStages({ currentStageId: "1" }, undefined)).toBe(false);
		expect(didFailbackMoveStages({ currentStageId: "1" }, {})).toBe(false);
		expect(didFailbackMoveStages({ currentStageId: "1" }, { id: null })).toBe(false);
	});

	it("treats an empty currentStageId as moved (cannot prove same-stage)", () => {
		expect(didFailbackMoveStages(null, { id: "2" })).toBe(true);
		expect(didFailbackMoveStages(undefined, { id: "2" })).toBe(true);
		expect(didFailbackMoveStages({}, { id: "2" })).toBe(true);
	});

	it("is false when both sides are emptyish", () => {
		expect(didFailbackMoveStages(null, null)).toBe(false);
		expect(didFailbackMoveStages({}, {})).toBe(false);
	});
});
