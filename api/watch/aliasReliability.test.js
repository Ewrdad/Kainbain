// Domain: Watching The Work — per-alias reliability aggregation tests.
import { describe, it, expect } from "vitest";
import {
	computeAliasReliability,
} from "./aliasReliability.js";
import { RECENT_RELIABILITY_WINDOW_RUNS } from "./reliabilityShared.js";

/***
 * MARK: aliasReliabilityTaskStore
 * @description Minimal task-store double: canned projects and tasks, no disk.
 * @example aliasReliabilityTaskStore([{ id: "p1", tasks: [{ reports: […] }] }]) => store
 * @param {Array<Object>} projects - Project shells (`{ id, cwd, tasks }`).
 * @returns {Object} Store double for computeAliasReliability.
 ***/
function aliasReliabilityTaskStore(projects) {
	return {
		projectStore: {
			listProjects: () => projects.map(({ id, cwd }) => ({ id, cwd })),
		},
		listTasks: (projectId) =>
			projects.find((p) => p.id === projectId)?.tasks || [],
	};
}

/***
 * MARK: aliasReport
 * @description Builds one alias-attributed stage-report entry for fixtures.
 * @example aliasReport("worker", "pi", "google::m", "none") => { aliasName: "worker", … }
 ***/
function aliasReport(aliasName, harnessId, modelRef, failureKind, createdAt) {
	return {
		aliasName,
		harnessId,
		modelRef,
		failureKind,
		status: failureKind === "none" ? "PASSED" : "FAILED",
		createdAt: createdAt || "2026-10-01T10:00:00.000Z",
	};
}

/***
 * MARK: aliasSample
 * @description Builds one alias-attributed reliability-sample entry for fixtures.
 * @example aliasSample("worker", "pi", "google::m", "none") => { aliasName: "worker", … }
 ***/
function aliasSample(aliasName, harnessId, modelRef, failureKind, at, extra = {}) {
	return {
		aliasName,
		harnessId,
		modelRef,
		failureKind,
		at: at ?? Date.parse("2026-10-01T10:00:00.000Z"),
		...extra,
	};
}

describe("Watching The Work: alias reliability", () => {
	it("buckets runs per alias and per model+harness target", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							aliasReport("worker", "pi", "google::m", "none", "2026-10-01T10:00:00.000Z"),
							aliasReport("worker", "pi", "google::m", "none", "2026-10-01T11:00:00.000Z"),
							aliasReport("worker", "pi", "google::m", "infrastructure", "2026-10-01T12:00:00.000Z"),
							aliasReport("worker", "antigravity", "google::g", "none", "2026-10-01T13:00:00.000Z"),
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 4,
			successes: 3,
			infraFailures: 1,
			excludedRejected: 0,
			successRate: 75,
		});
		expect(aliases[0].targets).toHaveLength(2);
		expect(aliases[0].targets[0]).toMatchObject({
			harness: "antigravity",
			model: "google::g",
			runs: 1,
			successes: 1,
			successRate: 100,
		});
		expect(aliases[0].targets[1]).toMatchObject({
			harness: "pi",
			model: "google::m",
			runs: 3,
			successes: 2,
			infraFailures: 1,
			successRate: 66.7,
		});
	});

	it("excludes deliberate agent rejections from numerator and denominator", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							aliasReport("worker", "pi", "google::m", "none"),
							aliasReport("worker", "pi", "google::m", "rejected"),
							aliasReport("worker", "pi", "google::m", "rejected"),
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 1,
			successes: 1,
			infraFailures: 0,
			excludedRejected: 2,
			successRate: 100,
		});
		expect(aliases[0].targets[0]).toMatchObject({
			runs: 1,
			excludedRejected: 2,
			successRate: 100,
		});
	});

	it("scopes stats to the requested project (no cross-project leaks)", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{ id: "t1", reports: [aliasReport("worker", "pi", "google::m", "none")] },
				],
			},
			{
				id: "p2",
				tasks: [
					{
						id: "t2",
						reports: [
							aliasReport("worker", "pi", "google::m", "infrastructure"),
							aliasReport("worker", "pi", "google::m", "infrastructure"),
							aliasReport("other", "pi", "google::m", "none"),
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 1,
			successes: 1,
			infraFailures: 0,
			successRate: 100,
		});
	});

	it("returns null for an unknown project", () => {
		const store = aliasReliabilityTaskStore([
			{ id: "p1", tasks: [{ id: "t1", reports: [] }] },
		]);

		expect(computeAliasReliability(store, "ghost")).toBeNull();
	});

	it("returns an empty list when the project has no attributed runs", () => {
		const store = aliasReliabilityTaskStore([
			{ id: "p1", tasks: [{ id: "t1", reports: [{ status: "PASSED" }] }] },
		]);

		expect(computeAliasReliability(store, "p1")).toEqual([]);
	});

	it("ignores unattributed, legacy, and unknown-kind reports", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							{ status: "PASSED", createdAt: "2026-10-01T10:00:00.000Z" },
							// No alias: fell back to the project default, never
							// credited to the named alias.
							{ harnessId: "pi", modelRef: "google::m", failureKind: "none" },
							// No harness: no model+harness target to credit.
							{ aliasName: "worker", modelRef: "google::m", failureKind: "none" },
							{ aliasName: "  ", harnessId: "pi", failureKind: "none" },
							{ aliasName: "worker", harnessId: "pi", failureKind: "exploded" },
							aliasReport("worker", "pi", "google::m", "none"),
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 1,
			successes: 1,
			successRate: 100,
		});
	});

	it("groups harness-managed runs under a blank model", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							{ aliasName: "cli", harnessId: "muse", failureKind: "none" },
							{ aliasName: "cli", harnessId: "muse", modelRef: "  ", failureKind: "infrastructure" },
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0].targets).toHaveLength(1);
		expect(aliases[0].targets[0]).toMatchObject({
			harness: "muse",
			model: "",
			runs: 2,
			successes: 1,
			infraFailures: 1,
			successRate: 50,
		});
	});

	it("computes the recent window over the latest attributed runs", () => {
		expect(RECENT_RELIABILITY_WINDOW_RUNS).toBe(10);
		const reports = [];
		for (let i = 0; i < 20; i += 1) {
			const at = new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString();
			// The 10 oldest runs failed; everything recent passed.
			reports.push(aliasReport("worker", "pi", "google::m", i < 10 ? "infrastructure" : "none", at));
		}
		const store = aliasReliabilityTaskStore([
			{ id: "p1", tasks: [{ id: "t1", reports }] },
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases[0]).toMatchObject({ runs: 20, successes: 10, successRate: 50 });
		expect(aliases[0].recent).toMatchObject({
			runs: 10,
			successes: 10,
			infraFailures: 0,
			successRate: 100,
		});
	});

	it("fails safe on a bogus recent-window override", () => {
		const reports = [
			aliasReport("worker", "pi", "google::m", "infrastructure", "2026-10-01T10:00:00.000Z"),
			aliasReport("worker", "pi", "google::m", "none", "2026-10-01T11:00:00.000Z"),
			aliasReport("worker", "pi", "google::m", "none", "2026-10-01T12:00:00.000Z"),
		];
		const store = aliasReliabilityTaskStore([
			{ id: "p1", tasks: [{ id: "t1", reports }] },
		]);

		// Non-finite windows fall back to the shared default: all 3 runs recent.
		for (const recentWindowRuns of [NaN, Infinity, undefined]) {
			const aliases = computeAliasReliability(store, "p1", { recentWindowRuns });
			expect(aliases[0].recent).toMatchObject({ runs: 3, successes: 2 });
		}
		// A finite window keeps the latest N runs (latest first: 2 clean).
		expect(
			computeAliasReliability(store, "p1", { recentWindowRuns: 1 })[0].recent,
		).toMatchObject({ runs: 1, successes: 1 });
		// Fractions floor instead of slicing a partial run.
		expect(
			computeAliasReliability(store, "p1", { recentWindowRuns: 1.9 })[0].recent,
		).toMatchObject({ runs: 1 });
		// A negative window clamps to an honest empty recent (never NaN).
		const negative = computeAliasReliability(store, "p1", { recentWindowRuns: -5 })[0].recent;
		expect(negative).toMatchObject({ runs: 0, successes: 0, successRate: null });
	});

	it("prefers reliability samples over reports for the same task", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							aliasSample("worker", "vibe", "mistral::large", "none", 1),
							aliasSample("worker", "vibe", "mistral::large", "none", 2),
							],
							reports: [
								aliasReport("worker", "vibe", "mistral::large", "infrastructure"),
							],
						},
					{
						id: "t2",
						reports: [aliasReport("worker", "vibe", "mistral::large", "none")],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		// t1's samples win (2 runs, no infra failure double-count); t2 has no
		// samples so its report still counts.
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 3,
			successes: 3,
			infraFailures: 0,
			successRate: 100,
		});
	});

	it("buckets sample-driven runs per alias target", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							aliasSample("worker", "vibe", "mistral::large", "none", 1),
							aliasSample("worker", "vibe", "mistral::large", "none", 2),
							aliasSample("worker", "vibe", "mistral::large", "none", 3),
							aliasSample("worker", "vibe", "mistral::large", "none", 4),
							aliasSample("worker", "vibe", "mistral::large", "infrastructure", 5, {
								atRaw: "2026-10-02T12:00:00.000Z",
							}),
						],
						},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 5,
			successes: 4,
			infraFailures: 1,
			successRate: 80,
			lastRunAt: "2026-10-02T12:00:00.000Z",
		});
		expect(aliases[0].targets).toHaveLength(1);
		expect(aliases[0].targets[0]).toMatchObject({
				harness: "vibe",
				model: "mistral::large",
			runs: 5,
			successes: 4,
			successRate: 80,
		});
	});

	it("ignores samples without alias attribution (fallback runs stay uncredited)", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reliabilitySamples: [
							aliasSample("worker", "vibe", "mistral::large", "none", 1),
							// Unresolvable-alias fallback run: harness-attributed but
							// never credited to the named alias.
							{ harnessId: "pi", failureKind: "none", at: 2 },
							{ aliasName: "  ", harnessId: "pi", failureKind: "none", at: 3 },
							aliasSample("worker", "  ", "mistral::large", "none", 4),
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases).toHaveLength(1);
		expect(aliases[0]).toMatchObject({
			aliasName: "worker",
			runs: 1,
			successes: 1,
		});
	});

	it("sorts aliases by name and targets by harness+model", () => {
		const store = aliasReliabilityTaskStore([
			{
				id: "p1",
				tasks: [
					{
						id: "t1",
						reports: [
							aliasReport("worker", "pi", "google::m", "none"),
							aliasReport("review", "muse", "", "none"),
							aliasReport("worker", "antigravity", "google::g", "none"),
						],
					},
				],
			},
		]);

		const aliases = computeAliasReliability(store, "p1");

		expect(aliases.map((entry) => entry.aliasName)).toEqual(["review", "worker"]);
		expect(
			aliases[1].targets.map((target) => `${target.harness}::${target.model}`),
		).toEqual(["antigravity::google::g", "pi::google::m"]);
	});
});
