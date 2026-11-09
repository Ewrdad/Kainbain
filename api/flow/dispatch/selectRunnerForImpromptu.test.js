import { expect, test, describe } from "vitest";
import { selectRunnerForImpromptu } from "./selectRunnerForImpromptu.js";

/***
 * MARK: selectRunnerForImpromptu Tests
 * @description Verifies impromptu T0 runner selection (ADR 0014): the shared
 *   `runnerMatches` gates apply (active, fresh, harness, model, tier T0),
 *   then the impromptu-only gates — the operator `runsImpromptu` switch, the
 *   pinned-runner override, and the live-lease exclusion — with a
 *   deterministic lowest-runnerId pick.
 ***/
describe("selectRunnerForImpromptu", () => {
	const at = 1_000_000;
	const record = (over = {}) => ({
		runnerId: "r1",
		status: "active",
		lastSeenAt: new Date(at).toISOString(),
		facts: { versions: { protocol: "v1" } },
		capabilities: {
			harnesses: [{ id: "pi", version: "1.2.3" }],
			models: ["m1"],
			tiers: ["T0", "T1"],
			runnable: true,
			diskHeadroomMb: 512,
			versions: { protocol: "v1" },
		},
		...over,
	});

	test("matches a fully capable runner and requires tier T0", () => {
		const picked = selectRunnerForImpromptu([record()], { harness: "pi", projectId: "p1" }, { now: at });
		expect(picked.record.runnerId).toBe("r1");
		expect(picked.reason).toBe("MATCH");
		// A runner without T0 cannot serve impromptu work, even when it
		// serves every other tier.
		const noT0 = record({
			capabilities: {
				harnesses: [{ id: "pi", version: "1.2.3" }],
				models: ["m1"],
				tiers: ["T1"],
				runnable: true,
				versions: { protocol: "v1" },
			},
		});
		expect(
			selectRunnerForImpromptu([noT0], { harness: "pi" }, { now: at }).record,
		).toBe(null);
		expect(
			selectRunnerForImpromptu([noT0], { harness: "pi" }, { now: at }).misses,
		).toEqual({ r1: "TIER_CEILING" });
	});

	test("picks the lowest runnerId deterministically", () => {
		const picked = selectRunnerForImpromptu(
			[record({ runnerId: "r9" }), record({ runnerId: "r2" })],
			{ harness: "pi" },
			{ now: at },
		);
		expect(picked.record.runnerId).toBe("r2");
	});

	test("refuses runners whose operator switched impromptu off", () => {
		const off = record({ operatorConfig: { jobTypes: { runsImpromptu: false } } });
		const refused = selectRunnerForImpromptu([off], { harness: "pi" }, { now: at });
		expect(refused.record).toBe(null);
		expect(refused.misses).toEqual({ r1: "JOB_TYPE_DISABLED" });
		// Missing or malformed switches fail open (legacy behaviour).
		expect(
			selectRunnerForImpromptu([record()], { harness: "pi" }, { now: at }).record.runnerId,
		).toBe("r1");
		expect(
			selectRunnerForImpromptu(
				[record({ operatorConfig: { jobTypes: { runsImpromptu: true } } })],
				{ harness: "pi" },
				{ now: at },
			).record.runnerId,
		).toBe("r1");
	});

	test("delivers pinned jobs only to the pinned runner", () => {
		const picked = selectRunnerForImpromptu(
			[record({ runnerId: "r1" }), record({ runnerId: "r2" })],
			{ harness: "pi", pinnedRunnerId: "r2" },
			{ now: at },
		);
		expect(picked.record.runnerId).toBe("r2");
		const missed = selectRunnerForImpromptu(
			[record({ runnerId: "r1" })],
			{ harness: "pi", pinnedRunnerId: "ghost" },
			{ now: at },
		);
		expect(missed.record).toBe(null);
		expect(missed.misses).toEqual({ r1: "PIN_MISMATCH" });
	});

	test("excludes runners holding a live task lease", () => {
		const refused = selectRunnerForImpromptu(
			[record({ runnerId: "r1" })],
			{ harness: "pi" },
			{ now: at, busyRunnerIds: ["r1"] },
		);
		expect(refused.record).toBe(null);
		expect(refused.misses).toEqual({ r1: "BUSY_TASK_LEASE" });
		// …but an idle sibling still serves.
		const picked = selectRunnerForImpromptu(
			[record({ runnerId: "r1" }), record({ runnerId: "r2" })],
			{ harness: "pi" },
			{ now: at, busyRunnerIds: ["r1"] },
		);
		expect(picked.record.runnerId).toBe("r2");
	});

	test("inherits the shared gates (harness, model, freshness, scope)", () => {
		const cases = [
			[{ harness: "codex" }, {}, "NO_HARNESS"],
			[{ model: "m9" }, {}, "NO_MODEL"],
			[{}, { lastSeenAt: new Date(at - 61_000).toISOString() }, "STALE_HEARTBEAT"],
			[{}, { status: "pending" }, "NOT_ACTIVE"],
			[{}, { paused: true }, "PAUSED"],
		];
		for (const [jobOver, recOver, reason] of cases) {
			const verdict = selectRunnerForImpromptu(
				[record(recOver)],
				{ harness: "pi", projectId: "p1", ...jobOver },
				{ now: at },
			);
			expect(verdict.record).toBe(null);
			expect(verdict.misses.r1).toBe(reason);
		}
		// Operator project scope binds impromptu like any other work.
		const scoped = selectRunnerForImpromptu(
			[record({ operatorConfig: { projectScope: ["other"] } })],
			{ harness: "pi", projectId: "p1" },
			{ now: at },
		);
		expect(scoped.record).toBe(null);
		expect(scoped.misses.r1).toBe("PROJECT_SCOPE");
	});

	test("returns an empty miss map when the fleet is empty", () => {
		expect(selectRunnerForImpromptu([], { harness: "pi" }, { now: at })).toEqual({
			record: null,
			misses: {},
		});
	});
});
