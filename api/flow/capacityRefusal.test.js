import { expect, test, describe } from "vitest";
import {
	CAPACITY_REFUSAL_REASON_PREFIX,
	isCapacityRefusalReason,
} from "./capacityRefusal.js";

describe("isCapacityRefusalReason", () => {
	test("matches the wire prefix exactly", () => {
		expect(
			isCapacityRefusalReason(
				"Runner workdir unavailable: Worktree cap reached (~5)",
			),
		).toBe(true);
		expect(isCapacityRefusalReason(CAPACITY_REFUSAL_REASON_PREFIX)).toBe(true);
	});

	test("tolerates leading/trailing whitespace", () => {
		expect(isCapacityRefusalReason("  Runner workdir unavailable: full\n")).toBe(
			true,
		);
	});

	test("rejects null, empty, non-string, and other reasons", () => {
		expect(isCapacityRefusalReason(null)).toBe(false);
		expect(isCapacityRefusalReason(undefined)).toBe(false);
		expect(isCapacityRefusalReason("")).toBe(false);
		expect(isCapacityRefusalReason("   ")).toBe(false);
		expect(isCapacityRefusalReason(42)).toBe(false);
		expect(isCapacityRefusalReason({})).toBe(false);
		expect(isCapacityRefusalReason("Runner crashed: OOM")).toBe(false);
	});

	test("does not match when the prefix appears mid-string", () => {
		expect(
			isCapacityRefusalReason(
				"Runner died: Runner workdir unavailable: Worktree cap reached",
			),
		).toBe(false);
	});
});
