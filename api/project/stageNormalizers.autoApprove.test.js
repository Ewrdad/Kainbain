import { describe, it, expect } from "vitest";
import { normalizeStage, normalizeStages } from "./stageNormalizers.js";

describe("normalizeStage autoApproveAfterMs", () => {
	it("leaves legacy stages without the field byte-identical", () => {
		const legacy = { id: "4", name: "Review Plan", type: "human", prompt: "x", paused: false, failback: "previous" };
		expect(normalizeStage({ ...legacy })).toEqual(legacy);
		const agent = { id: "1", name: "Idea", type: "agent", prompt: "y", paused: false, failback: "start" };
		expect(normalizeStage({ ...agent })).toEqual(agent);
	});

	it("coerces human duration strings to integer ms", () => {
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: "10 days" }).autoApproveAfterMs,
		).toBe(864000000);
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: "36 hours" }).autoApproveAfterMs,
		).toBe(129600000);
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: "1h 30m" }).autoApproveAfterMs,
		).toBe(5400000);
	});

	it("keeps integer ms values (bare numbers are milliseconds)", () => {
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: 864000000 }).autoApproveAfterMs,
		).toBe(864000000);
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: "60000" }).autoApproveAfterMs,
		).toBe(60000);
	});

	it("drops off-values to absent (off is canonical)", () => {
		for (const off of [0, "", null]) {
			const normalized = normalizeStage({ id: "4", type: "human", autoApproveAfterMs: off });
			expect("autoApproveAfterMs" in normalized).toBe(false);
		}
	});

	it("drops invalid values on load (tolerant read; the save boundary 400s)", () => {
		for (const bad of ["ten days", "10 lightyears", -5, Number.NaN, true, {}, []]) {
			const normalized = normalizeStage({ id: "4", type: "human", autoApproveAfterMs: bad });
			expect("autoApproveAfterMs" in normalized).toBe(false);
		}
	});

	it("does not enforce min/max at normalize time (short holds survive in memory)", () => {
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: 5000 }).autoApproveAfterMs,
		).toBe(5000);
		expect(
			normalizeStage({ id: "4", type: "human", autoApproveAfterMs: "30s" }).autoApproveAfterMs,
		).toBe(30000);
	});

	it("keeps the field on non-human stages (reorder-safe; only human acts on it)", () => {
		for (const type of ["agent", "ci", "merge"]) {
			expect(
				normalizeStage({ id: "1", type, autoApproveAfterMs: "10 days" }).autoApproveAfterMs,
			).toBe(864000000);
		}
	});

	it("normalizes lists and legacy aliases without disturbing the field", () => {
		const [review, agent] = normalizeStages([
			{ id: "4", type: "review", autoApproveAfterMs: "10 days" },
			{ id: "1", type: "agent" },
		]);
		expect(review.type).toBe("human");
		expect(review.autoApproveAfterMs).toBe(864000000);
		expect("autoApproveAfterMs" in agent).toBe(false);
	});
});
