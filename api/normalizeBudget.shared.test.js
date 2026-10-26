import { describe, it, expect } from "vitest";
import { normalizeBudget } from "../shared/toolLogFormat/normalizeBudget.js";

describe("normalizeBudget", () => {
	it("floors positive finite numbers", () => {
		expect(normalizeBudget(10.9, 99)).toBe(10);
		expect(normalizeBudget(7, 99)).toBe(7);
	});
	it("falls back for non-positive or non-numeric input", () => {
		expect(normalizeBudget(0, 99)).toBe(99);
		expect(normalizeBudget(-3, 99)).toBe(99);
		expect(normalizeBudget(Number.NaN, 99)).toBe(99);
		expect(normalizeBudget(Number.POSITIVE_INFINITY, 99)).toBe(99);
		expect(normalizeBudget("10", 99)).toBe(99);
		expect(normalizeBudget(undefined, 99)).toBe(99);
	});
});
