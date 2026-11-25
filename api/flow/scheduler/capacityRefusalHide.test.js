import { expect, test, describe } from "vitest";
import {
	CAPACITY_REFUSAL_HIDE_MS,
	isCapacityRefusalHidden,
} from "./capacityRefusalHide.js";

/***
 * MARK: isCapacityRefusalHidden unit tests
 * @description The refusing-runner hide window (task 3b82f6ae q4): true
 *   only for the exact runner that refused, only inside
 *   CAPACITY_REFUSAL_HIDE_MS. Fail-open everywhere: other runners, an
 *   expired window, a missing refusal record, a missing/blank runner id,
 *   and garbage timestamps all read false — the hide is a preference,
 *   never a park.
 ***/
const NOW = Date.parse("2026-11-23T12:00:00.000Z");
const iso = (ms) => new Date(ms).toISOString();

const refusedBy = (runnerId, atMs = NOW) => ({
	lastCapacityRefusal: { runnerId, at: iso(atMs) },
});

describe("isCapacityRefusalHidden", () => {
	test("the hide window is ~2min", () => {
		expect(CAPACITY_REFUSAL_HIDE_MS).toBe(120_000);
	});

	test("hides from the refusing runner inside the window only", () => {
		const t = refusedBy("r1", NOW);
		expect(isCapacityRefusalHidden(t, "r1", NOW)).toBe(true);
		expect(isCapacityRefusalHidden(t, "r1", NOW + 1_000)).toBe(true);
		expect(isCapacityRefusalHidden(t, "r1", NOW + CAPACITY_REFUSAL_HIDE_MS - 1)).toBe(true);
		// At exactly the window edge the hide expires.
		expect(isCapacityRefusalHidden(t, "r1", NOW + CAPACITY_REFUSAL_HIDE_MS)).toBe(false);
		expect(isCapacityRefusalHidden(t, "r1", NOW + CAPACITY_REFUSAL_HIDE_MS + 1)).toBe(false);
	});

	test("never hides from a different runner", () => {
		const t = refusedBy("r1", NOW);
		expect(isCapacityRefusalHidden(t, "r2", NOW + 1_000)).toBe(false);
		expect(isCapacityRefusalHidden(t, "r1 ", NOW + 1_000)).toBe(false); // exact id match, no trimming tricks
	});

	test("fails open on missing data, blank runner id, and garbage", () => {
		expect(isCapacityRefusalHidden({}, "r1", NOW)).toBe(false);
		expect(isCapacityRefusalHidden(null, "r1", NOW)).toBe(false);
		expect(isCapacityRefusalHidden(refusedBy("r1"), null, NOW)).toBe(false);
		expect(isCapacityRefusalHidden(refusedBy("r1"), undefined, NOW)).toBe(false);
		expect(isCapacityRefusalHidden(refusedBy("r1"), "", NOW)).toBe(false);
		expect(isCapacityRefusalHidden(refusedBy("r1"), "   ", NOW)).toBe(false);
		// Garbage refusal timestamp collapses to the epoch → window long
		// expired → visible again (fail-open, never a park).
		expect(
			isCapacityRefusalHidden({ lastCapacityRefusal: { runnerId: "r1", at: "garbage" } }, "r1", NOW),
		).toBe(false);
		// A null runnerId inside the record never matches anyone.
		expect(
			isCapacityRefusalHidden({ lastCapacityRefusal: { runnerId: null, at: iso(NOW) } }, "r1", NOW),
		).toBe(false);
	});

	test("a garbage injected clock falls back to the wall clock (no NaN)", () => {
		const t = refusedBy("r1", Date.now());
		expect(isCapacityRefusalHidden(t, "r1", NaN)).toBe(true); // just refused
	});
});
