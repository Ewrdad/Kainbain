// Domain: Watching The Work — per-harness reliability aggregation tests.
import { describe, it, expect } from "vitest";
import {
	computeHarnessReliability,
	RECENT_RELIABILITY_WINDOW_RUNS,
} from "./harnessReliability.js";

/***
 * MARK: reliabilityTaskStore
 * @description Minimal task-store double: canned projects and tasks, no disk.
 * @example reliabilityTaskStore([{ id: "p1", tasks: [{ reports: […] }] }]) => store
 * @param {Array<Object>} projects - Project shells (`{ id, cwd, tasks }`).
 * @returns {Object} Store double for computeHarnessReliability.
 ***/
function reliabilityTaskStore(projects) {
	return {
		projectStore: {
			listProjects: () => projects.map(({ id, cwd }) => ({ id, cwd })),
		},
		listTasks: (projectId) =>
			projects.find((p) => p.id === projectId)?.tasks || [],
	};
}

/***
 * MARK: attributedReport
 * @description Builds one attributed stage-report entry for fixtures.
 * @example attributedReport("pi", "none") => { harnessId: "pi", … }
 * @param {string} harnessId
 * @param {string} failureKind
 * @param {string} [createdAt]
 * @returns {Object} Report entry.
 ***/
function attributedReport(harnessId, failureKind, createdAt) {
	return {
		harnessId,
		failureKind,
		status: failureKind === "none" ? "PASSED" : "FAILED",
		createdAt: createdAt || "2026-10-01T10:00:00.000Z",
	};
}

/***
 * MARK: attributedSample
 * @description Builds one recorded reliability-sample entry for fixtures.
 * @example attributedSample("vibe", "none") => { harnessId: "vibe", … }
 * @param {string} harnessId
 * @param {string} failureKind
 * @param {number} [at]
 * @param {Object} [extra]
 * @returns {Object} Sample entry.
 ***/
function attributedSample(harnessId, failureKind, at, extra = {}) {
	return {
		harnessId,
		failureKind,
		at: at ?? Date.parse("2026-10-01T10:00:00.000Z"),
		...extra,
	};
}

describe("Watching The Work: harness reliability", () => {
	it("counts clean runs as successes and infra runs as failures", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							attributedReport("pi", "none", "2026-10-01T10:00:00.000Z"),
							attributedReport("pi", "none", "2026-10-01T11:00:00.000Z"),
							attributedReport("pi", "infrastructure", "2026-10-01T12:00:00.000Z"),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability).toHaveLength(1);
		expect(reliability[0]).toMatchObject({
			harnessId: "pi",
			runs: 3,
			successes: 2,
			infraFailures: 1,
			excludedRejected: 0,
			successRate: 66.7,
			lastRunAt: "2026-10-01T12:00:00.000Z",
		});
	});

	it("excludes deliberate agent rejections from numerator and denominator", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							attributedReport("pi", "none"),
							attributedReport("pi", "rejected"),
							attributedReport("pi", "rejected"),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability[0]).toMatchObject({
			harnessId: "pi",
			runs: 1,
			successes: 1,
			infraFailures: 0,
			excludedRejected: 2,
			successRate: 100,
		});
	});

	it("ignores unattributed and legacy reports instead of misclassifying them", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							{ status: "PASSED", createdAt: "2026-10-01T10:00:00.000Z" },
							{ harnessId: "pi", status: "FAILED" },
							{ harnessId: "  ", failureKind: "none" },
							{ harnessId: "pi", failureKind: "exploded" },
							attributedReport("pi", "none"),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability).toHaveLength(1);
		expect(reliability[0]).toMatchObject({
			harnessId: "pi",
			runs: 1,
			successes: 1,
			successRate: 100,
		});
	});

	it("keeps unknown harness ids under their recorded id", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{ id: "t1", reports: [attributedReport("retired-harness", "none")] },
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability).toHaveLength(1);
		expect(reliability[0].harnessId).toBe("retired-harness");
	});

	it("aggregates across projects and reports a null rate with no counted runs", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [{ id: "t1", reports: [attributedReport("pi", "rejected")] }],
			},
			{
				id: "p2",
				tasks: [{ id: "t2", reports: [attributedReport("pi", "rejected")] }],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability).toHaveLength(1);
		expect(reliability[0]).toMatchObject({
			harnessId: "pi",
			runs: 0,
			excludedRejected: 2,
			successRate: null,
			lastRunAt: "2026-10-01T10:00:00.000Z",
		});
		expect(reliability[0].recent).toMatchObject({ runs: 0, successRate: null });
	});

	it("returns no entries when nothing is attributed yet", () => {
		const store = reliabilityTaskStore([
			{ id: "p1", tasks: [{ id: "t1", reports: [{ status: "PASSED" }] }] },
		]);

		expect(computeHarnessReliability(store)).toEqual([]);
	});

	it("computes the recent window over the latest attributed runs", () => {
		expect(RECENT_RELIABILITY_WINDOW_RUNS).toBe(10);
		const reports = [];
		for (let i = 0; i < 20; i += 1) {
			const at = new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString();
			// The 10 oldest runs failed; everything recent passed.
			reports.push(attributedReport("pi", i < 10 ? "infrastructure" : "none", at));
		}
		const store = reliabilityTaskStore([
			{ id: "p1", tasks: [{ id: "t1", reports }] },
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability[0]).toMatchObject({ runs: 20, successes: 10, successRate: 50 });
		expect(reliability[0].recent).toMatchObject({
			runs: 10,
			successes: 10,
			infraFailures: 0,
			successRate: 100,
		});
	});

	it("prefers reliability samples over reports for the same task", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							attributedSample("vibe", "none", Date.parse("2026-10-02T10:00:00.000Z")),
							attributedSample("vibe", "none", Date.parse("2026-10-02T11:00:00.000Z")),
							attributedSample("vibe", "infrastructure", Date.parse("2026-10-02T12:00:00.000Z")),
						],
						reports: [
							attributedReport("vibe", "none", "2026-10-01T10:00:00.000Z"),
							attributedReport("vibe", "infrastructure", "2026-10-01T11:00:00.000Z"),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		// Samples win: the task's reports are NOT double-counted on top.
		expect(reliability[0]).toMatchObject({
			harnessId: "vibe",
			runs: 3,
			successes: 2,
			infraFailures: 1,
		});
	});

	it("counts sample-driven runs from tasks without any reports", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							attributedSample("vibe", "none", 1),
							attributedSample("vibe", "none", 2),
							attributedSample("vibe", "none", 3),
							attributedSample("vibe", "none", 4),
							attributedSample("vibe", "infrastructure", 5, {
								atRaw: "2026-10-02T12:00:00.000Z",
							}),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability).toHaveLength(1);
		expect(reliability[0]).toMatchObject({
			harnessId: "vibe",
			runs: 5,
			successes: 4,
			infraFailures: 1,
			excludedRejected: 0,
			successRate: 80,
			lastRunAt: "2026-10-02T12:00:00.000Z",
		});
	});

	it("mixes sample tasks and report-only tasks across projects", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [attributedSample("vibe", "none", 1)],
					},
				],
			},
			{
				id: "p2",
				tasks: [
					{
						id: "t2",
						reports: [attributedReport("vibe", "infrastructure", "2026-10-01T10:00:00.000Z")],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability[0]).toMatchObject({
			harnessId: "vibe",
			runs: 2,
			successes: 1,
			infraFailures: 1,
			successRate: 50,
		});
	});

	it("excludes rejected samples and ignores unattributed ones", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							attributedSample("vibe", "none", 1),
							attributedSample("vibe", "rejected", 2),
							attributedSample("  ", "none", 3),
							attributedSample("vibe", undefined, 4),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability[0]).toMatchObject({
			harnessId: "vibe",
			runs: 1,
			successes: 1,
			excludedRejected: 1,
			successRate: 100,
		});
	});

	it("sorts entries by harness id for stable responses", () => {
		const store = reliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							attributedReport("pi", "none"),
							attributedReport("antigravity", "none"),
							attributedReport("custom", "infrastructure"),
						],
					},
				],
			},
		]);

		const reliability = computeHarnessReliability(store);

		expect(reliability.map((entry) => entry.harnessId)).toEqual([
			"antigravity",
			"custom",
			"pi",
		]);
	});
});
