import { describe, it, expect } from "vitest";
import { resolveOnboardingChecklist, taskHasRun } from "./onboardingChecklist.js";

const FRESH_RUNNER = {
	hasFreshRunner: true,
	nextAction: "none",
	nextActionDetail: "Runner local-pi is connected.",
};
const NO_RUNNER = {
	hasFreshRunner: false,
	nextAction: "install-runner",
	nextActionDetail: "No Runner is registered yet.",
};

describe("taskHasRun", () => {
	it("is false for a freshly created task", () => {
		expect(taskHasRun({ reports: [], history: [{ action: "Created" }], status: "ready" })).toBe(
			false,
		);
	});

	it("is true once a report landed or the task moved", () => {
		expect(taskHasRun({ reports: [{ ok: true }], history: [{ action: "Created" }] })).toBe(true);
		expect(
			taskHasRun({ reports: [], history: [{ action: "Created" }, { action: "Advanced" }] }),
		).toBe(true);
	});

	it("tolerates malformed tasks", () => {
		expect(taskHasRun(null)).toBe(false);
		expect(taskHasRun({})).toBe(false);
	});
});

describe("resolveOnboardingChecklist", () => {
	it("starts with every step open on a fresh install", () => {
		const out = resolveOnboardingChecklist({
			runner: NO_RUNNER,
			projectCount: 0,
			taskCount: 0,
			hasRun: false,
		});
		expect(out.complete).toBe(false);
		expect(out.steps.map((s) => [s.id, s.done])).toEqual([
			["runner", false],
			["project", false],
			["run", false],
		]);
		expect(out.steps[0].detail).toContain("No Runner");
	});

	it("completes only when a runner is live, a project exists, and a task ran", () => {
		const out = resolveOnboardingChecklist({
			runner: FRESH_RUNNER,
			projectCount: 1,
			taskCount: 2,
			hasRun: true,
		});
		expect(out.complete).toBe(true);
		expect(out.steps.every((s) => s.done)).toBe(true);
	});

	it("keeps the run step open while tasks exist but none ran", () => {
		const out = resolveOnboardingChecklist({
			runner: FRESH_RUNNER,
			projectCount: 1,
			taskCount: 1,
			hasRun: false,
		});
		expect(out.complete).toBe(false);
		expect(out.steps.find((s) => s.id === "run").done).toBe(false);
	});

	it("tolerates missing inputs", () => {
		const out = resolveOnboardingChecklist({});
		expect(out.complete).toBe(false);
		expect(out.steps).toHaveLength(3);
	});
});
