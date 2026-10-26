import { describe, expect, it } from "vitest";
import {
	parseResultEnvelope,
	summarizePermission,
	summarizePlan,
	summarizeRaw,
	summarizeToolResult,
	summarizeToolStart,
	summarizeUsage,
} from "../shared/toolLogFormat.js";
import {
	ENVELOPE_FIXTURES,
	PERMISSION_SUMMARY_FIXTURES,
	PLAN_SUMMARY_FIXTURES,
	RAW_SUMMARY_FIXTURES,
	TOOL_RESULT_FIXTURES,
	TOOL_START_FIXTURES,
	USAGE_SUMMARY_FIXTURES,
} from "../shared/toolLogFormat.fixtures.js";

// MARK: toolLogFormat golden tests (api side)
// The agent log streamer renders [TOOL]/[RESULT] lines from the same shared
// rule table as the frontend console. This suite asserts the identical
// golden corpus as `frontend/src/context/toolLogFormat.test.js` so the api
// import of `shared/toolLogFormat.js` is covered and the two sides cannot
// drift. Fine-grained fallback guarantees live on the frontend side; here we
// pin the corpus plus the never-throw contract the streamer relies on.

describe("summarizeToolResult golden corpus (api)", () => {
	for (const fixture of TOOL_RESULT_FIXTURES) {
		it(fixture.name, () => {
			expect(
				summarizeToolResult(fixture.tool, fixture.input, fixture.options),
			).toBe(fixture.expected);
		});
	}
});

describe("summarizeToolStart golden corpus (api)", () => {
	for (const fixture of TOOL_START_FIXTURES) {
		it(fixture.name, () => {
			expect(
				summarizeToolStart(fixture.tool, fixture.input, fixture.options),
			).toBe(fixture.expected);
		});
	}
});

describe("parseResultEnvelope golden corpus (api)", () => {
	for (const fixture of ENVELOPE_FIXTURES) {
		it(fixture.name, () => {
			const parsed = parseResultEnvelope(fixture.input, fixture.options?.maxLength);
			if (fixture.expectedKind === null) {
				expect(parsed).toBeNull();
			} else {
				expect(parsed?.kind).toBe(fixture.expectedKind);
				expect(parsed?.summary).toBe(fixture.expectedSummary);
				expect(parsed?.detail).toBe(fixture.expectedDetail);
			}
		});
	}
});

describe("unified-lane golden corpus (api)", () => {
	for (const fixture of USAGE_SUMMARY_FIXTURES) {
		it(`usage: ${fixture.name}`, () => {
			expect(summarizeUsage(fixture.input)).toBe(fixture.expected);
		});
	}
	for (const fixture of PERMISSION_SUMMARY_FIXTURES) {
		it(`permission: ${fixture.name}`, () => {
			expect(summarizePermission(fixture.input)).toBe(fixture.expected);
		});
	}
	for (const fixture of PLAN_SUMMARY_FIXTURES) {
		it(`plan: ${fixture.name}`, () => {
			expect(summarizePlan(fixture.input)).toBe(fixture.expected);
		});
	}
	for (const fixture of RAW_SUMMARY_FIXTURES) {
		it(`raw: ${fixture.name}`, () => {
			expect(summarizeRaw(fixture.input)).toBe(fixture.expected);
		});
	}
});

describe("never-throw contract (api)", () => {
	it("summarizers survive hostile inputs without throwing", () => {
		const circular = { self: null };
		circular.self = circular;
		const hostile = [
			undefined,
			null,
			0,
			true,
			circular,
			'{"unclosed": true',
			"x".repeat(100_000),
		];
		for (const input of hostile) {
			expect(() =>
				summarizeToolResult("bash", input, { maxLength: 600 }),
			).not.toThrow();
			expect(() =>
				summarizeToolStart("bash", input, { maxLength: 400 }),
			).not.toThrow();
			expect(() => parseResultEnvelope(input, 600)).not.toThrow();
		}
	});
});
