import { describe, it, expect } from "vitest";
import {
	AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS,
	AUTO_APPROVE_MAX_MS,
	AUTO_APPROVE_MIN_MS,
	assertValidStageAutoApproves,
	collectInvalidStageAutoApproves,
	formatAutoApproveDuration,
	isAutoApproveReminderDue,
	isAutoApproveStampDue,
	parseAutoApproveDuration,
	resolveAutoApproveAt,
	resolveAutoApproveReminderLeadMs,
	validateAutoApproveDuration,
} from "../shared/autoApproveDuration.js";

describe("parseAutoApproveDuration", () => {
	it.each([
		["10 days", 10 * 86400000],
		["36 hours", 36 * 3600000],
		["1 week", 604800000],
		["2 weeks", 2 * 604800000],
		["90m", 90 * 60000],
		["90 minutes", 90 * 60000],
		["1h 30m", 5400000],
		["1 day 12 hours", 129600000],
		["500ms", 500],
		["1 millisecond", 1],
		["2 seconds", 2000],
		["1 sec", 1000],
		["3 secs", 3000],
		["5 mins", 5 * 60000],
		["2 hrs", 2 * 3600000],
		["1.5h", 5400000],
		["  10 DAYS  ", 10 * 86400000],
		["1W", 604800000],
	])("parses %j as %d ms", (input, expected) => {
		expect(parseAutoApproveDuration(input)).toBe(expected);
	});

	it("reads bare numbers as milliseconds (the stage.timeout convention)", () => {
		expect(parseAutoApproveDuration(60000)).toBe(60000);
		expect(parseAutoApproveDuration("60000")).toBe(60000);
		expect(parseAutoApproveDuration("  1500  ")).toBe(1500);
	});

	it("rounds fractional input UP, never down (never-early)", () => {
		expect(parseAutoApproveDuration(1.2)).toBe(2);
		expect(parseAutoApproveDuration("1.2")).toBe(2);
		expect(parseAutoApproveDuration("0.5ms")).toBe(1);
		expect(parseAutoApproveDuration("1.0001s")).toBe(1001);
	});

	it("reads absent/empty/zero as off (null)", () => {
		for (const off of [undefined, null, "", "   ", 0, 0.0]) {
			expect(parseAutoApproveDuration(off)).toBeNull();
		}
	});

	it("reads garbage, negatives, and non-scalars as null", () => {
		for (const bad of [
			"ten days",
			"10 days ish",
			"days 10",
			"10 lightyears",
			"1x",
			"-5",
			-100,
			Number.NaN,
			Number.POSITIVE_INFINITY,
			true,
			{},
			[],
			"0 days",
			"x".repeat(129),
		]) {
			expect(parseAutoApproveDuration(bad)).toBeNull();
		}
	});
});

describe("formatAutoApproveDuration", () => {
	it.each([
		[864000000, "10 days"],
		[129600000, "36 hours"],
		[5400000, "90 minutes"],
		[61000, "61 seconds"],
		[1000, "1 second"],
		[60000, "1 minute"],
		[3600000, "1 hour"],
		[86400000, "1 day"],
		[604800000, "1 week"],
		[250, "250 milliseconds"],
	])("formats %d ms as %j", (ms, expected) => {
		expect(formatAutoApproveDuration(ms)).toBe(expected);
	});

	it("returns null for non-positive input", () => {
		for (const bad of [0, -5, Number.NaN, "60", undefined]) {
			expect(formatAutoApproveDuration(bad)).toBeNull();
		}
	});
});

describe("validateAutoApproveDuration", () => {
	it("accepts absent/off values and in-range holds", () => {
		for (const ok of [undefined, null, "", "   ", 0, "0", 60000, "10 days", "60s", "365 days"]) {
			expect(validateAutoApproveDuration(ok)).toBeNull();
		}
	});

	it("flags garbage as UNPARSEABLE", () => {
		for (const bad of ["ten days", "10 lightyears", -5, "-5", Number.NaN, true, {}, "0 days"]) {
			expect(validateAutoApproveDuration(bad)).toBe("UNPARSEABLE");
		}
	});

	it("flags out-of-range holds", () => {
		expect(validateAutoApproveDuration("30s")).toBe("TOO_SHORT");
		expect(validateAutoApproveDuration(59000)).toBe("TOO_SHORT");
		expect(validateAutoApproveDuration("400 days")).toBe("TOO_LONG");
		expect(validateAutoApproveDuration("366 days")).toBe("TOO_LONG");
	});

	it("honours override bounds", () => {
		expect(validateAutoApproveDuration("30s", { minMs: 1000 })).toBeNull();
		expect(validateAutoApproveDuration("400 days", { maxMs: Number.MAX_SAFE_INTEGER })).toBeNull();
	});
});

describe("collectInvalidStageAutoApproves / assertValidStageAutoApproves", () => {
	it("ignores absent stages and absent/off values", () => {
		expect(collectInvalidStageAutoApproves(undefined)).toEqual([]);
		expect(collectInvalidStageAutoApproves([{ id: "s1" }, { id: "s2", autoApproveAfterMs: null }])).toEqual([]);
		expect(collectInvalidStageAutoApproves([{ id: "s1", autoApproveAfterMs: 0 }])).toEqual([]);
		expect(assertValidStageAutoApproves(undefined)).toBeNull();
		expect(assertValidStageAutoApproves([{ id: "s1", autoApproveAfterMs: "10 days" }])).toBeNull();
	});

	it("reports one problem per invalid stage", () => {
		expect(
			collectInvalidStageAutoApproves([
				{ id: "s1", autoApproveAfterMs: "10 days" },
				{ id: "s2", autoApproveAfterMs: "only" },
				{ id: "s3", autoApproveAfterMs: "30s" },
			]),
		).toEqual([
			{ index: 1, stageId: "s2", problem: "UNPARSEABLE" },
			{ index: 2, stageId: "s3", problem: "TOO_SHORT" },
		]);
	});

	it("returns a 400-shaped payload when invalid", () => {
		const err = assertValidStageAutoApproves([{ id: "s1", autoApproveAfterMs: "nope" }]);
		expect(err.error).toContain("autoApproveAfterMs");
		expect(err.details).toHaveLength(1);
	});
});

describe("resolveAutoApproveAt", () => {
	it("stamps enteredStageAt + duration exactly", () => {
		expect(resolveAutoApproveAt("2026-11-01T00:00:00.000Z", 86400000)).toBe(
			"2026-11-02T00:00:00.000Z",
		);
	});

	it("falls back to now when the entry timestamp is missing (fail-safe direction)", () => {
		const now = Date.parse("2026-11-01T00:00:00.000Z");
		expect(resolveAutoApproveAt(undefined, 1000, now)).toBe("2026-11-01T00:00:01.000Z");
		expect(resolveAutoApproveAt("not-a-date", 1000, now)).toBe("2026-11-01T00:00:01.000Z");
	});

	it("returns null for off/invalid durations", () => {
		for (const bad of [0, -5, Number.NaN, undefined, "60"]) {
			expect(resolveAutoApproveAt("2026-11-01T00:00:00.000Z", bad)).toBeNull();
		}
	});
});

describe("isAutoApproveStampDue (the never-early predicate)", () => {
	const stamp = "2026-11-02T00:00:00.000Z";
	const stampMs = Date.parse(stamp);

	it("fires at the stamp and after, never 1ms before", () => {
		expect(isAutoApproveStampDue(stamp, stampMs - 1)).toBe(false);
		expect(isAutoApproveStampDue(stamp, stampMs)).toBe(true);
		expect(isAutoApproveStampDue(stamp, stampMs + 1)).toBe(true);
	});

	it("fails closed on missing/unparseable stamps", () => {
		for (const bad of [undefined, null, "", "not-a-date", 12345]) {
			expect(isAutoApproveStampDue(bad, stampMs)).toBe(false);
		}
	});
});

describe("resolveAutoApproveReminderLeadMs", () => {
	it("caps long holds at the configured lead and halves short ones", () => {
		expect(resolveAutoApproveReminderLeadMs(10 * 86400000, 86400000)).toBe(86400000);
		expect(resolveAutoApproveReminderLeadMs(60000, 86400000)).toBe(30000);
		expect(resolveAutoApproveReminderLeadMs(10000, 86400000)).toBe(5000);
	});

	it("defaults to 24h when unconfigured and disables on 0", () => {
		expect(AUTO_APPROVE_DEFAULT_REMINDER_LEAD_MS).toBe(86400000);
		expect(resolveAutoApproveReminderLeadMs(10 * 86400000)).toBe(86400000);
		expect(resolveAutoApproveReminderLeadMs(10 * 86400000, 0)).toBeNull();
		expect(resolveAutoApproveReminderLeadMs(60000, 0)).toBeNull();
	});

	it("never reminds for invalid holds", () => {
		expect(resolveAutoApproveReminderLeadMs(0, 1000)).toBeNull();
		expect(resolveAutoApproveReminderLeadMs(-5, 1000)).toBeNull();
		expect(resolveAutoApproveReminderLeadMs(undefined, 1000)).toBeNull();
	});
});

describe("isAutoApproveReminderDue", () => {
	const stamp = "2026-11-02T00:00:00.000Z";
	const stampMs = Date.parse(stamp);
	const lead = 3600000;

	it("fires only inside the lead window", () => {
		const task = { autoApproveAt: stamp };
		expect(isAutoApproveReminderDue(task, lead, stampMs - lead - 1)).toBe(false);
		expect(isAutoApproveReminderDue(task, lead, stampMs - lead)).toBe(true);
		expect(isAutoApproveReminderDue(task, lead, stampMs - 1)).toBe(true);
	});

	it("never fires twice, overdue, disabled, or unstamped", () => {
		expect(
			isAutoApproveReminderDue(
				{ autoApproveAt: stamp, autoApproveRemindedAt: "2026-11-01T23:00:00.000Z" },
				lead,
				stampMs - 1,
			),
		).toBe(false);
		expect(isAutoApproveReminderDue({ autoApproveAt: stamp }, lead, stampMs)).toBe(false);
		expect(isAutoApproveReminderDue({ autoApproveAt: stamp }, lead, stampMs + 1000)).toBe(false);
		expect(isAutoApproveReminderDue({ autoApproveAt: stamp }, 0, stampMs - 1)).toBe(false);
		expect(isAutoApproveReminderDue({ autoApproveAt: stamp }, null, stampMs - 1)).toBe(false);
		expect(isAutoApproveReminderDue({ autoApproveAt: null }, lead, stampMs - 1)).toBe(false);
		expect(isAutoApproveReminderDue(null, lead, stampMs - 1)).toBe(false);
	});

	it("pins the min/max bounds", () => {
		expect(AUTO_APPROVE_MIN_MS).toBe(60000);
		expect(AUTO_APPROVE_MAX_MS).toBe(365 * 24 * 60 * 60 * 1000);
	});
});
