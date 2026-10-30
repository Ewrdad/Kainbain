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
});
