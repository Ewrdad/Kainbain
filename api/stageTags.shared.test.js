import { describe, it, expect } from "vitest";
import {
	STAGE_TAG_MAX_COUNT,
	STAGE_TAG_MAX_LENGTH,
	availableStageTags,
	normalizeStageTag,
	normalizeStageTags,
	stageHasTag,
	stageMatchesTags,
	stageTagKey,
} from "../shared/stageTags.js";

describe("normalizeStageTag", () => {
	it("trims and collapses whitespace", () => {
		expect(normalizeStageTag("  Front  End  ")).toBe("Front End");
	});
	it("rejects non-strings, empties, commas, and overlong tags", () => {
		expect(normalizeStageTag(null)).toBeNull();
		expect(normalizeStageTag("   ")).toBeNull();
		expect(normalizeStageTag("a,b")).toBeNull();
		expect(normalizeStageTag("x".repeat(STAGE_TAG_MAX_LENGTH + 1))).toBeNull();
		expect(normalizeStageTag("x".repeat(STAGE_TAG_MAX_LENGTH))).toBe(
			"x".repeat(STAGE_TAG_MAX_LENGTH),
		);
	});
});

describe("normalizeStageTags", () => {
	it("keeps legacy objects without tags byte-identical", () => {
		expect(normalizeStageTags(undefined)).toBeUndefined();
		expect(normalizeStageTags(null)).toBeUndefined();
	});
	it("dedupes case-insensitively and caps the count", () => {
		expect(normalizeStageTags(["Dev", "dev", "QA"])).toEqual(["Dev", "QA"]);
		expect(normalizeStageTags("a, b ,a")).toEqual(["a", "b"]);
		expect(normalizeStageTags(new Set(["x", "X", "y"]))).toEqual(["x", "y"]);
		const many = Array.from({ length: STAGE_TAG_MAX_COUNT + 5 }, (_, i) => `t${i}`);
		expect(normalizeStageTags(many)).toHaveLength(STAGE_TAG_MAX_COUNT);
	});
});

describe("stageTagKey / stageHasTag / stageMatchesTags", () => {
	it("keys are trimmed and lowercased", () => {
		expect(stageTagKey("  PO ")).toBe("po");
		expect(stageTagKey(42)).toBe("");
	});
	it("matches tags case-insensitively", () => {
		expect(stageHasTag({ tags: ["Dev"] }, "dev")).toBe(true);
		expect(stageHasTag({ tags: ["Dev"] }, "qa")).toBe(false);
		expect(stageHasTag({}, "dev")).toBe(false);
		expect(stageHasTag({ tags: ["Dev"] }, "")).toBe(false);
	});
	it("matches any/all filter modes, empty filter matches all", () => {
		const stage = { tags: ["Dev", "QA"] };
		expect(stageMatchesTags(stage, [])).toBe(true);
		expect(stageMatchesTags(stage, ["qa"])).toBe(true);
		expect(stageMatchesTags(stage, ["qa", "po"])).toBe(true);
		expect(stageMatchesTags(stage, ["qa", "po"], "all")).toBe(false);
		expect(stageMatchesTags(stage, ["dev", "qa"], "all")).toBe(true);
		expect(stageMatchesTags(stage, "qa,po")).toBe(true);
		expect(stageMatchesTags(stage, new Set(["po"]))).toBe(false);
	});
});

describe("availableStageTags", () => {
	it("extracts unique tags sorted case-insensitively", () => {
		const stages = [{ tags: ["QA", "dev"] }, { tags: ["Dev", "po"] }, {}];
		expect(availableStageTags(stages)).toEqual(["dev", "po", "QA"]);
		expect(availableStageTags(null)).toEqual([]);
	});
});
