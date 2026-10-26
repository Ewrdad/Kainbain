import { describe, it, expect } from "vitest";
import {
	boundRawSource,
	fidelityForKind,
	isKnownFidelity,
	makeLogRecord,
	normalizeRecord,
	RECORD_LIMITS,
	scrubSecrets,
	stripAnsiText,
	KNOWN_RECORD_FEEDS,
	KNOWN_RECORD_KINDS,
} from "./logRecord.js";

/**
 * MARK: logRecord unit tests
 * @description Verifies the canonical record module: defaults, monotonic
 *   seq, fidelity derivation, secret scrubbing, raw bounding, and legacy
 *   upgrade at read time.
 */

describe("RECORD_LIMITS", () => {
	it("is frozen with the lane budgets", () => {
		expect(Object.isFrozen(RECORD_LIMITS)).toBe(true);
		expect(RECORD_LIMITS.telemetryMaxCount).toBe(100);
		expect(RECORD_LIMITS.rawMaxCount).toBe(50);
		expect(RECORD_LIMITS.rawMaxBytes).toBe(8192);
	});

	it("exposes the full kind/feed vocabularies", () => {
		expect([...KNOWN_RECORD_KINDS]).toEqual([
			"assistant",
			"thinking",
			"tool",
			"error",
			"system",
			"telemetry",
			"permission",
			"plan",
			"raw",
		]);
		expect([...KNOWN_RECORD_FEEDS]).toEqual([
			"main",
			"thinking",
			"tools",
			"telemetry",
			"raw",
		]);
	});
});

describe("makeLogRecord", () => {
	it("fills defaults for a minimal partial", () => {
		const record = makeLogRecord({ kind: "assistant", text: "hi" });
		expect(record.feed).toBe("main");
		expect(record.feeds).toEqual(["main"]);
		expect(record.turn).toBe(1);
		expect(record.meta).toEqual({});
		expect(record.fidelity).toBe("exact");
		expect(typeof record.ts).toBe("string");
	});

	it("derives feeds from feed and fidelity from kind", () => {
		expect(makeLogRecord({ kind: "tool", feed: "tools", text: "x" }).feeds).toEqual([
			"tools",
		]);
		expect(makeLogRecord({ kind: "tool", text: "x" }).fidelity).toBe("normalized");
		expect(makeLogRecord({ kind: "system", text: "x" }).fidelity).toBe(
			"synthesized",
		);
	});

	it("passes typed fields through only when set", () => {
		const bare = makeLogRecord({ kind: "assistant", text: "hi" });
		expect("usage" in bare).toBe(false);
		expect("evidence" in bare).toBe(false);
		expect("tool" in bare).toBe(false);
		const typed = makeLogRecord({
			kind: "telemetry",
			text: "u",
			usage: { inputTokens: 1 },
			harnessId: "pi",
			seq: 7,
			blockId: "b1",
		});
		expect(typed.usage).toEqual({ inputTokens: 1 });
		expect(typed.harnessId).toBe("pi");
		expect(typed.seq).toBe(7);
		expect(typed.blockId).toBe("b1");
	});

	it("falls back to main/system for unknown feed/kind", () => {
		const record = makeLogRecord({ kind: "nope", feed: "nope", text: "x" });
		expect(record.kind).toBe("system");
		expect(record.feed).toBe("main");
	});

	it("degrades nullish and non-object partials instead of throwing", () => {
		for (const hostile of [null, undefined, "text", 42, ["kind"]]) {
			const record = makeLogRecord(hostile);
			expect(record.kind).toBe("system");
			expect(record.feed).toBe("main");
			expect(record.feeds).toEqual(["main"]);
			expect(record.meta).toEqual({});
		}
	});

	it("rejects array meta and clamps hostile turns", () => {
		expect(makeLogRecord({ kind: "assistant", meta: ["x"] }).meta).toEqual({});
		expect(makeLogRecord({ turn: 0 }).turn).toBe(1);
		expect(makeLogRecord({ turn: -2 }).turn).toBe(1);
		expect(makeLogRecord({ turn: NaN }).turn).toBe(1);
		expect(makeLogRecord({ turn: 2.7 }).turn).toBe(2);
		expect(makeLogRecord({ turn: 3 }).turn).toBe(3);
	});

	it("falls back to the kind-derived fidelity for unknown values", () => {
		expect(makeLogRecord({ kind: "assistant", fidelity: "bogus" }).fidelity).toBe(
			"exact",
		);
		expect(
			makeLogRecord({ kind: "assistant", fidelity: "normalized" }).fidelity,
		).toBe("normalized");
	});

	it("validates fidelity markers", () => {
		expect(isKnownFidelity("exact")).toBe(true);
		expect(isKnownFidelity("normalized")).toBe(true);
		expect(isKnownFidelity("synthesized")).toBe(true);
		expect(isKnownFidelity("bogus")).toBe(false);
		expect(isKnownFidelity(null)).toBe(false);
	});
});

describe("fidelityForKind", () => {
	it("marks verbatim blocks exact, summaries normalized, status synthesized", () => {
		expect(fidelityForKind("assistant")).toBe("exact");
		expect(fidelityForKind("thinking")).toBe("exact");
		expect(fidelityForKind("tool")).toBe("normalized");
		expect(fidelityForKind("error")).toBe("synthesized");
		expect(fidelityForKind("system")).toBe("synthesized");
	});
});

describe("stripAnsiText / scrubSecrets / boundRawSource", () => {
	it("strips ANSI escapes", () => {
		expect(stripAnsiText("\u001b[32mok\u001b[0m")).toBe("ok");
		expect(stripAnsiText("plain")).toBe("plain");
		expect(stripAnsiText(null)).toBe("");
	});

	it("redacts bearer tokens and api keys", () => {
		expect(scrubSecrets("Bearer abcdef1234567890")).toBe("Bearer [REDACTED]");
		expect(scrubSecrets("api_key=abcdef1234567890")).toBe("api_key=[REDACTED]");
		expect(scrubSecrets("nothing secret here")).toBe("nothing secret here");
		expect(scrubSecrets(null)).toBe("");
	});

	it("bounds raw sources with an ellipsis", () => {
		const long = "x".repeat(9000);
		const bounded = boundRawSource({ blob: long }, 100);
		expect(bounded.length).toBeLessThanOrEqual(101);
		expect(bounded.endsWith("…")).toBe(true);
	});

	it("never throws on hostile payloads", () => {
		const circular = { self: null };
		circular.self = circular;
		expect(() => boundRawSource(circular)).not.toThrow();
		expect(() => boundRawSource(undefined)).not.toThrow();
	});
});

describe("normalizeRecord", () => {
	it("upgrades a legacy entry at read time", () => {
		const upgraded = normalizeRecord({
			id: 1,
			ts: "2026-01-01T00:00:00.000Z",
			feed: "main",
			kind: "assistant",
			turn: 2,
			text: "hi",
			meta: {},
		});
		expect(upgraded.feeds).toEqual(["main"]);
		expect(upgraded.fidelity).toBe("exact");
		expect(upgraded.text).toBe("hi");
		expect(upgraded.turn).toBe(2);
	});

	it("derives feeds from feed when feeds is missing", () => {
		const upgraded = normalizeRecord({ kind: "tool", feed: "tools", text: "x" });
		expect(upgraded.feeds).toEqual(["tools"]);
	});

	it("keeps canonical typed fields intact", () => {
		const upgraded = normalizeRecord({
			kind: "telemetry",
			feed: "telemetry",
			feeds: ["telemetry"],
			text: "[USAGE] tokens=1/2/3",
			usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
		});
		expect(upgraded.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
	});

	it("degrades nullish input to an empty system record", () => {
		expect(normalizeRecord(null).kind).toBe("system");
		expect(normalizeRecord(undefined).text).toBe("");
	});
});
