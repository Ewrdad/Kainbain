import { describe, expect, it } from "vitest";
import {
	normalizeProjectRetrySettings,
	normalizeRetryCount,
	normalizeRetryEnabled,
	normalizeTimeoutMs,
	RETRY_SETTING_KEYS,
} from "./retrySettings.js";

describe("normalizeRetryCount", () => {
	it("floors finite numbers and clamps negatives to disabled", () => {
		expect(normalizeRetryCount(2.9)).toBe(2);
		expect(normalizeRetryCount(-4)).toBe(0);
		expect(normalizeRetryCount("3")).toBe(3);
	});

	it("returns undefined for follow-the-default inputs", () => {
		expect(normalizeRetryCount("many")).toBeUndefined();
		expect(normalizeRetryCount(null)).toBeUndefined();
		expect(normalizeRetryCount("")).toBeUndefined();
		expect(normalizeRetryCount(undefined)).toBeUndefined();
		expect(normalizeRetryCount(Number.NaN)).toBeUndefined();
		expect(normalizeRetryCount(Number.POSITIVE_INFINITY)).toBeUndefined();
	});
});

describe("normalizeTimeoutMs", () => {
	it("floors positive finite timeouts", () => {
		expect(normalizeTimeoutMs(123.9)).toBe(123);
		expect(normalizeTimeoutMs("5000")).toBe(5000);
	});

	it("returns undefined so invalid input can never zero a stage", () => {
		expect(normalizeTimeoutMs(0)).toBeUndefined();
		expect(normalizeTimeoutMs(-10)).toBeUndefined();
		expect(normalizeTimeoutMs("fast")).toBeUndefined();
		expect(normalizeTimeoutMs(null)).toBeUndefined();
	});
});

describe("normalizeRetryEnabled", () => {
	it("keeps explicit booleans and defers everything else", () => {
		expect(normalizeRetryEnabled(false)).toBe(false);
		expect(normalizeRetryEnabled(true)).toBe(true);
		expect(normalizeRetryEnabled("no")).toBeUndefined();
		expect(normalizeRetryEnabled(1)).toBeUndefined();
	});
});

describe("normalizeProjectRetrySettings", () => {
	it("normalizes only the keys the source carries", () => {
		expect(normalizeProjectRetrySettings({ maxAutoIterations: 2.9, name: "P" })).toEqual({
			maxAutoIterations: 2,
		});
	});

	it("returns empty for missing or non-object sources", () => {
		expect(normalizeProjectRetrySettings()).toEqual({});
		expect(normalizeProjectRetrySettings(null)).toEqual({});
		expect(normalizeProjectRetrySettings("nope")).toEqual({});
	});

	it("normalizes the legacy deployTimeoutMs key when a persisted file carries it", () => {
		expect(normalizeProjectRetrySettings({ deployTimeoutMs: 1500.9 })).toEqual({
			deployTimeoutMs: 1500,
		});
	});

	it("is idempotent: normalizing twice changes nothing", () => {
		const once = normalizeProjectRetrySettings({
			maxAutoIterations: 2.9,
			ciTimeoutMs: 100.7,
			autoIterationEnabled: false,
		});
		expect(normalizeProjectRetrySettings(once)).toEqual(once);
	});
});

describe("RETRY_SETTING_KEYS", () => {
	it("retry keys include maxAutoIterations", () => {
		expect(RETRY_SETTING_KEYS).toContain("maxAutoIterations");
	});
});
