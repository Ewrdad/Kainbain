// Domain: The Flow — pure routing resolvers decide retries, delays, and
// budgets without touching the store, so they are pinned by unit tests.
import { describe, it, expect } from "vitest";
import { trimLogExcerpt } from "./trimLogExcerpt.js";
import { excerptLog } from "./excerptLog.js";
import { failureLogExcerptLimit } from "../tables/failureLogExcerptLimit.js";
import { computeRetryDelay } from "./computeRetryDelay.js";
import { resolveRetryDelayConfig } from "./resolveRetryDelayConfig.js";
import { harnessBlipSignalFor } from "./harnessBlipSignalFor.js";
import { collectRetryableText } from "./collectRetryableText.js";
import { resolveRetryable } from "./resolveRetryable.js";
import { sanitizeBudgetCount } from "./sanitizeBudgetCount.js";
import { resolveProjectCount } from "./resolveProjectCount.js";
import { classificationMetaOf } from "./classificationMetaOf.js";

describe("trimLogExcerpt", () => {
	it("passes short logs through unchanged", () => {
		expect(trimLogExcerpt("a\nb", 10)).toBe("a\nb");
	});
	it("keeps the tail of long logs", () => {
		expect(trimLogExcerpt("head\ntail", 4)).toBe("tail");
	});
	it("returns empty string for blank and non-string input", () => {
		expect(trimLogExcerpt("   ")).toBe("");
		expect(trimLogExcerpt(null)).toBe("");
		expect(trimLogExcerpt(undefined)).toBe("");
	});
});

describe("excerptLog", () => {
	it("passes short logs through unchanged", () => {
		expect(excerptLog("a\nb", 10)).toBe("a\nb");
	});
	it("returns empty string for blank and non-string input", () => {
		expect(excerptLog("  ")).toBe("");
		expect(excerptLog(null)).toBe("");
	});
	it("never exceeds the budget on long logs", () => {
		const long = `Error: boom\n${"frame\n".repeat(500)}final diagnostic`;
		const out = excerptLog(long);
		expect(out.length).toBeLessThanOrEqual(failureLogExcerptLimit);
		expect(out).toContain("final diagnostic");
	});
});

describe("computeRetryDelay", () => {
	const linear = { baseMs: 2000, capMs: 30000, jitterMs: 0, strategy: "linear" };
	const expo = { baseMs: 2000, capMs: 60000, jitterMs: 0, strategy: "exponential" };
	it("reproduces the legacy linear sequence exactly", () => {
		expect(computeRetryDelay(1, linear)).toBe(2000);
		expect(computeRetryDelay(3, linear)).toBe(6000);
	});
	it("doubles per attempt for exponential", () => {
		expect(computeRetryDelay(1, expo)).toBe(2000);
		expect(computeRetryDelay(3, expo)).toBe(8000);
	});
	it("caps at capMs", () => {
		expect(computeRetryDelay(99, expo)).toBe(60000);
	});
	it("clamps attempts below 1 up to the first delay", () => {
		expect(computeRetryDelay(0, linear)).toBe(2000);
		expect(computeRetryDelay(-4, linear)).toBe(2000);
	});
	it("applies symmetric jitter around the nominal delay", () => {
		const cfg = { baseMs: 2000, capMs: 60000, jitterMs: 1000, strategy: "exponential" };
		expect(computeRetryDelay(1, cfg, () => 0.5)).toBe(2000);
		expect(computeRetryDelay(1, cfg, () => 0)).toBe(1000);
		expect(computeRetryDelay(1, cfg, () => 1)).toBe(3000);
	});
});

describe("resolveRetryDelayConfig", () => {
	it("explicit overrides win", () => {
		expect(resolveRetryDelayConfig({ baseMs: 100 }).baseMs).toBe(100);
	});
	it("rejects non-finite and negative overrides", () => {
		expect(resolveRetryDelayConfig({ baseMs: NaN }).baseMs).toBe(2000);
		expect(resolveRetryDelayConfig({ baseMs: -5 }).baseMs).toBe(2000);
	});
	it("falls back to exponential for unknown strategies", () => {
		expect(resolveRetryDelayConfig({ strategy: "nope" }).strategy).toBe("exponential");
	});
});

describe("harnessBlipSignalFor", () => {
	it("flags malformed harness JSON", () => {
		expect(harnessBlipSignalFor("harness output was malformed JSON")).toBe("harness-json-blip");
	});
	it("returns null for non-blips and non-strings", () => {
		expect(harnessBlipSignalFor("ordinary assertion failure")).toBeNull();
		expect(harnessBlipSignalFor(null)).toBeNull();
		expect(harnessBlipSignalFor("")).toBeNull();
	});
});

describe("collectRetryableText", () => {
	it("joins message, stderr, and stdout", () => {
		expect(collectRetryableText(new Error("msg"))).toBe("msg");
		expect(collectRetryableText({ message: "a", stderr: "b" })).toBe("a\nb");
	});
	it("passes strings through and blanks anything else", () => {
		expect(collectRetryableText("raw")).toBe("raw");
		expect(collectRetryableText(null)).toBe("");
		expect(collectRetryableText(undefined)).toBe("");
	});
});

describe("resolveRetryable", () => {
	it("retries transient infrastructure errors", () => {
		expect(resolveRetryable(new Error("socket hang up")).retryable).toBe(true);
	});
	it("retries harness blips", () => {
		const r = resolveRetryable(new Error("harness output was malformed JSON"));
		expect(r.retryable).toBe(true);
		expect(r.signal).toBe("harness-json-blip");
	});
	it("never retries auth failures, even with blip wording nearby", () => {
		expect(resolveRetryable(new Error("401 unauthorized")).retryable).toBe(false);
	});
	it("never retries plain logical failures", () => {
		expect(resolveRetryable(new Error("assertion failed: expected x")).retryable).toBe(false);
	});
});

describe("sanitizeBudgetCount", () => {
	it("floors and clamps", () => {
		expect(sanitizeBudgetCount(3.5)).toBe(3);
		expect(sanitizeBudgetCount(-1)).toBe(0);
		expect(sanitizeBudgetCount("invalid")).toBeUndefined();
		expect(sanitizeBudgetCount(NaN)).toBeUndefined();
	});
});

describe("resolveProjectCount", () => {
	it("reads finite numeric budgets, floored", () => {
		expect(resolveProjectCount({ maxAutoIterations: 3 }, "maxAutoIterations")).toBe(3);
		expect(resolveProjectCount({ maxAutoIterations: "many" }, "maxAutoIterations")).toBeUndefined();
		expect(resolveProjectCount(null, "maxAutoIterations")).toBeUndefined();
		expect(resolveProjectCount({ maxAutoIterations: -2 }, "maxAutoIterations")).toBe(0);
	});
});

describe("classificationMetaOf", () => {
	it("shapes the audited kind/signal/retryable triple", () => {
		const { classificationMeta } = classificationMetaOf("fetch failed");
		expect(classificationMeta.kind).toBe("transient");
		expect(typeof classificationMeta.signal).toBe("string");
		expect(typeof classificationMeta.retryable).toBe("boolean");
	});
});
