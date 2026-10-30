import { expect, test, describe } from "vitest";
import { runnerMatches } from "./runnerMatches.js";

/***
 * MARK: runnerMatches Tests
 * @description Verifies each gate (status, pause, freshness, protocol,
 *   runnable, harness, model, tier ceiling, disk floor) and that alias
 *   requirements miss loudly until WP-3.2.
 ***/
describe("runnerMatches", () => {
	const record = (over = {}) => ({
		status: "active",
		lastSeenAt: new Date(1_000_000).toISOString(),
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
	const at = 1_000_000;

	test("matches a fully capable runner", () => {
		expect(
			runnerMatches(record(), { harness: "pi", model: "m1", tier: "T1" }, { now: at }),
		).toEqual({ ok: true, reason: "MATCH" });
	});

	test("rejects each gate with its own reason", () => {
		const cases = [
			[{ status: "pending" }, {}, "NOT_ACTIVE"],
			[{ paused: true }, {}, "PAUSED"],
			[{ lastSeenAt: new Date(at - 61_000).toISOString() }, {}, "STALE_HEARTBEAT"],
			[{ capabilities: { runnable: false, versions: { protocol: "v1" } } }, {}, "NOT_RUNNABLE"],
			[{ facts: { versions: { protocol: "v0" } }, capabilities: { versions: { protocol: "v0" } } }, {}, "PROTOCOL_SKEW"],
			[{}, { alias: "fast" }, "ALIAS_UNRESOLVED"],
			[{}, { harness: "codex" }, "NO_HARNESS"],
			[{}, { model: "m9" }, "NO_MODEL"],
			[{}, { tier: "T2" }, "TIER_CEILING"],
			[{ capabilities: { versions: { protocol: "v1" }, diskHeadroomMb: 10 } }, {}, "DISK_LOW"],
		];
		for (const [over, req, reason] of cases) {
			expect(runnerMatches(record(over), req, { now: at }).reason).toBe(reason);
		}
	});

	test("empty model requirement needs no offering", () => {
		expect(runnerMatches(record(), { harness: "pi", tier: "T0" }, { now: at }).ok).toBe(true);
	});

	test("deploy-command requirements match like any other ci stage (no host-command gate)", () => {
		expect(runnerMatches(record(), { hostCommand: false, harness: "pi", tier: "T0" }, { now: at }).ok).toBe(true);
		// The retired hostCommand flag is ignored when present on legacy records.
		expect(runnerMatches(record(), { hostCommand: true, harness: "pi", tier: "T0" }, { now: at }).ok).toBe(true);
	});

	test("Q4: a runner that did not advertise the required model refuses (NO_MODEL), leaving it for another runner", () => {
		const kimiOnly = record({
			capabilities: {
				harnesses: [{ id: "pi", version: "1.2.3" }],
				models: ["kimi-k3:cloud"],
				tiers: ["T0", "T1"],
				runnable: true,
				diskHeadroomMb: 512,
				versions: { protocol: "v1" },
			},
		});
		const req = { harness: "pi", model: "gpt-oss:120b-cloud", tier: "T0" };
		expect(runnerMatches(kimiOnly, req, { now: at }).reason).toBe("NO_MODEL");
		const gptOnly = record({
			capabilities: {
				harnesses: [{ id: "pi", version: "1.2.3" }],
				models: ["gpt-oss:120b-cloud"],
				tiers: ["T0", "T1"],
				runnable: true,
				diskHeadroomMb: 512,
				versions: { protocol: "v1" },
			},
		});
		expect(runnerMatches(gptOnly, req, { now: at })).toEqual({ ok: true, reason: "MATCH" });
	});

	test("a resolved alias object matches on its concrete harness/model", () => {
		expect(
			runnerMatches(
				record(),
				{ harness: "pi", model: "m1", tier: "T1", alias: { name: "fast", targetIndex: 0 } },
				{ now: at },
			),
		).toEqual({ ok: true, reason: "MATCH" });
	});

	test("operator tool filter refuses filtered-out harnesses only", () => {
		// The UI only offers advertised tools as checkboxes, so the filter
		// is always a subset of advertised: both tools offered, one filtered.
		const filtered = record({
			capabilities: {
				harnesses: [{ id: "pi" }, { id: "codex" }],
				models: ["m1"],
				tiers: ["T1"],
				runnable: true,
				versions: { protocol: "v1" },
			},
			operatorConfig: {
				displayName: null,
				availableTools: ["pi"],
				jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
				directories: { masterDir: "", worktreeDir: "" },
				projectScope: null,
			},
		});
		expect(runnerMatches(filtered, { harness: "pi", tier: "T1" }, { now: at }).ok).toBe(true);
		expect(runnerMatches(filtered, { harness: "codex", tier: "T1" }, { now: at }).reason).toBe(
			"TOOL_DISABLED",
		);
	});

	test("operator job switches refuse their kinds and fail open when unset", () => {
		const noCi = record({
			operatorConfig: {
				jobTypes: { runsCi: false, runsMerges: true, runsImpromptu: true },
			},
		});
		expect(runnerMatches(noCi, { kind: "ci", tier: "T0" }, { now: at }).reason).toBe(
			"JOB_TYPE_DISABLED",
		);
		expect(runnerMatches(noCi, { kind: "merge", tier: "T0" }, { now: at }).ok).toBe(true);
		const noMerges = record({
			operatorConfig: { jobTypes: { runsCi: true, runsMerges: false, runsImpromptu: true } },
		});
		expect(runnerMatches(noMerges, { kind: "merge", tier: "T0" }, { now: at }).reason).toBe(
			"JOB_TYPE_DISABLED",
		);
		// No operatorConfig at all keeps the legacy behaviour (serves everything).
		expect(runnerMatches(record(), { kind: "ci", tier: "T0" }, { now: at }).ok).toBe(true);
		expect(runnerMatches(record(), { harness: "codex", tier: "T1" }, { now: at }).reason).toBe(
			"NO_HARNESS",
		);
	});

	test("operator project scope constrains by project id and fails open", () => {
		const scoped = record({ operatorConfig: { projectScope: ["p1"] } });
		expect(
			runnerMatches(scoped, { kind: "agent", tier: "T1" }, { now: at, projectId: "p1" }).ok,
		).toBe(true);
		expect(
			runnerMatches(scoped, { kind: "agent", tier: "T1" }, { now: at, projectId: "p2" }).reason,
		).toBe("PROJECT_SCOPE");
		// Unknown project id on the candidate never strands a scoped runner silently.
		expect(
			runnerMatches(scoped, { kind: "agent", tier: "T1" }, { now: at }).reason,
		).toBe("PROJECT_SCOPE");
		// Null scope serves every project, including unknown ones.
		expect(
			runnerMatches(record(), { kind: "agent", tier: "T1" }, { now: at, projectId: "p9" }).ok,
		).toBe(true);
	});
});
