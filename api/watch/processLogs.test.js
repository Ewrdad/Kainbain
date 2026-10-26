import { describe, it, expect } from "vitest";

import { config } from "../config.js";
import {
	_appendLogEntries,
	_appendProcessLog,
	_logEntriesForFeed,
	_replaceLogEntries,
	parseLegacyProcessLogText,
	renderLogEntriesText,
} from "./processLogs.js";

const MAX = config.logEntriesMaxCount;

function entry(overrides = {}) {
	return {
		id: "log-1",
		ts: new Date().toISOString(),
		feed: "main",
		feeds: ["main"],
		kind: "assistant",
		turn: null,
		text: "[AGENT] hello",
		meta: {},
		...overrides,
	};
}

describe("_appendProcessLog tag grammar", () => {
	it.each([
		["[TOOL] bash(ls)", "tool", "tools"],
		["[RESULT] ok", "tool", "tools"],
		["[THINKING] hmm", "thinking", "thinking"],
		["[ERROR] boom", "error", "main"],
		["[FAIL] nope", "error", "main"],
		["[STDERR]\nerror line", "error", "main"],
		["[STDOUT]\n[AGENT] reasoning", "assistant", "main"],
		["[INFO] note", "system", "main"],
		["[SYSTEM] note", "system", "main"],
		["[GIT] switched", "system", "main"],
		["[CI] passed", "system", "main"],
		["[CI/CMD] ran", "system", "main"],
		["[HUMAN] hi", "system", "main"],
		["[WARN] careful", "system", "main"],
		["[AGENT] reasoning", "assistant", "main"],
		["plain narrative text", "assistant", "main"],
	])("maps %j to kind=%s feed=%s", (chunk, kind, feed) => {
		const task = { logEntries: [] };
		_appendProcessLog(task, chunk);
		expect(task.logEntries).toHaveLength(1);
		expect(task.logEntries[0]).toMatchObject({ kind, feed, text: chunk });
		expect(task.logEntries[0].feeds).toEqual([feed]);
	});

	it("only the first line decides the kind", () => {
		const task = { logEntries: [] };
		_appendProcessLog(task, "[TOOL] run\n[THINKING] stray");
		expect(task.logEntries[0]).toMatchObject({ kind: "tool", feed: "tools" });
	});

	it("trims the chunk and ignores empty input", () => {
		const task = { logEntries: [] };
		_appendProcessLog(task, "  [INFO] spaced  ");
		expect(task.logEntries[0].text).toBe("[INFO] spaced");
		_appendProcessLog(task, "");
		_appendProcessLog(task, null);
		_appendProcessLog(task, undefined);
		expect(task.logEntries).toHaveLength(1);
	});

	it("ignores a nullish task", () => {
		expect(() => _appendProcessLog(null, "[INFO] x")).not.toThrow();
		expect(() => _appendProcessLog(undefined, "[INFO] x")).not.toThrow();
	});

	it("initialises logEntries when missing", () => {
		const task = {};
		_appendProcessLog(task, "[INFO] x");
		expect(task.logEntries).toHaveLength(1);
	});
});

describe("_appendLogEntries", () => {
	it("appends entries and skips falsy ones", () => {
		const task = { logEntries: [entry({ id: "a" })] };
		_appendLogEntries(task, [null, entry({ id: "b" }), undefined]);
		expect(task.logEntries.map((e) => e.id)).toEqual(["a", "b"]);
	});

	it("is a no-op for nullish task or non-array input", () => {
		expect(() => _appendLogEntries(null, [entry()])).not.toThrow();
		const task = { logEntries: [] };
		_appendLogEntries(task, null);
		_appendLogEntries(task, "nope");
		expect(task.logEntries).toHaveLength(0);
	});

	it("caps growth with a single eviction marker", () => {
		const task = { logEntries: [] };
		_appendLogEntries(
			task,
			Array.from({ length: MAX + 5 }, (_, i) => entry({ id: `e-${i}` })),
		);
		expect(task.logEntries).toHaveLength(MAX);
		expect(task.logEntries[0].meta.evictedCount).toBe(6);
		expect(task.logEntries[0].text).toContain("evicted");
	});

	it("updates the existing marker instead of stacking markers", () => {
		const task = { logEntries: [] };
		_appendLogEntries(
			task,
			Array.from({ length: MAX + 1 }, (_, i) => entry({ id: `e-${i}` })),
		);
		const firstCount = task.logEntries[0].meta.evictedCount;
		_appendLogEntries(task, [entry({ id: "late" })]);
		expect(task.logEntries).toHaveLength(MAX);
		expect(task.logEntries.filter((e) => e.meta?.evictedCount !== undefined)).toHaveLength(1);
		expect(task.logEntries[0].meta.evictedCount).toBeGreaterThan(firstCount);
	});
});

describe("_replaceLogEntries", () => {
	it("replaces the tail from startIndex", () => {
		const task = {
			logEntries: [entry({ id: "keep" }), entry({ id: "drop-1" }), entry({ id: "drop-2" })],
		};
		_replaceLogEntries(task, 1, [entry({ id: "new" })]);
		expect(task.logEntries.map((e) => e.id)).toEqual(["keep", "new"]);
	});

	it("clamps negative and over-long start indexes", () => {
		const task = { logEntries: [entry({ id: "a" })] };
		_replaceLogEntries(task, -5, [entry({ id: "b" })]);
		expect(task.logEntries.map((e) => e.id)).toEqual(["b"]);
		_replaceLogEntries(task, 99, [entry({ id: "c" })]);
		expect(task.logEntries.map((e) => e.id)).toEqual(["b", "c"]);
	});

	it("is a no-op for nullish task or non-array entries", () => {
		expect(() => _replaceLogEntries(null, 0, [entry()])).not.toThrow();
		const task = { logEntries: [entry({ id: "a" })] };
		_replaceLogEntries(task, 0, null);
		expect(task.logEntries.map((e) => e.id)).toEqual(["a"]);
	});

	it("initialises logEntries when missing", () => {
		const task = {};
		_replaceLogEntries(task, 0, [entry({ id: "a" })]);
		expect(task.logEntries.map((e) => e.id)).toEqual(["a"]);
	});
});

describe("_logEntriesForFeed", () => {
	function tasked() {
		return {
			logEntries: [
				entry({ id: "m", feed: "main", feeds: ["main"], text: "[AGENT] m" }),
				entry({ id: "t", feed: "thinking", feeds: ["thinking"], text: "[THINKING] t" }),
				entry({ id: "x", feed: "tools", feeds: ["tools"], text: "[TOOL] x" }),
			],
		};
	}

	it("returns only the requested feed", () => {
		expect(_logEntriesForFeed(tasked(), "main").map((e) => e.id)).toEqual(["m"]);
		expect(_logEntriesForFeed(tasked(), "thinking").map((e) => e.id)).toEqual(["t"]);
		expect(_logEntriesForFeed(tasked(), "tools").map((e) => e.id)).toEqual(["x"]);
	});

	it("returns [] for an unknown feed", () => {
		expect(_logEntriesForFeed(tasked(), "nope")).toEqual([]);
	});

	it("supports legacy feed-string entries without a feeds array", () => {
		const task = { logEntries: [{ ...entry({ id: "s" }), feeds: undefined, feed: "tools" }] };
		expect(_logEntriesForFeed(task, "tools").map((e) => e.id)).toEqual(["s"]);
	});

	it("falls back to legacy processLogs text when no structured entries exist", () => {
		const task = { logEntries: [], processLogs: "[INFO] a\n[TOOL] b" };
		const main = _logEntriesForFeed(task, "main");
		expect(main.map((e) => e.text)).toEqual(["[INFO] a"]);
		expect(_logEntriesForFeed(task, "tools").map((e) => e.text)).toEqual(["[TOOL] b"]);
	});

	it("returns [] when the task has no logs at all", () => {
		expect(_logEntriesForFeed({}, "main")).toEqual([]);
		expect(_logEntriesForFeed(null, "main")).toEqual([]);
	});

	it("caps the returned feed", () => {
		const task = {
			logEntries: Array.from({ length: MAX + 10 }, (_, i) =>
				entry({ id: `e-${i}` }),
			),
		};
		expect(_logEntriesForFeed(task, "main")).toHaveLength(MAX);
	});
});

describe("parseLegacyProcessLogText", () => {
	it("returns [] for blank or non-string input", () => {
		expect(parseLegacyProcessLogText("")).toEqual([]);
		expect(parseLegacyProcessLogText("   \n  ")).toEqual([]);
		expect(parseLegacyProcessLogText(null)).toEqual([]);
		expect(parseLegacyProcessLogText(undefined)).toEqual([]);
		expect(parseLegacyProcessLogText(42)).toEqual([]);
	});

	it("drops blank lines and dedupes consecutive duplicates", () => {
		const parsed = parseLegacyProcessLogText("[INFO] a\n\n[INFO] a\n[TOOL] b");
		expect(parsed.map((e) => e.text)).toEqual(["[INFO] a", "[TOOL] b"]);
	});

	it("keeps non-consecutive repeats", () => {
		const parsed = parseLegacyProcessLogText("[INFO] a\n[TOOL] b\n[INFO] a");
		expect(parsed.map((e) => e.text)).toEqual(["[INFO] a", "[TOOL] b", "[INFO] a"]);
	});
});

describe("renderLogEntriesText", () => {
	function tasked() {
		return [
			entry({ id: "m", feed: "main", feeds: ["main"], text: "[AGENT] m" }),
			entry({ id: "t", feed: "thinking", feeds: ["thinking"], text: "[THINKING] t" }),
			entry({ id: "x", feed: "tools", feeds: ["tools"], text: "[TOOL] x" }),
		];
	}

	it("renders the combined main+tools narrative by default", () => {
		expect(renderLogEntriesText(tasked())).toBe("[AGENT] m\n[TOOL] x");
	});

	it("renders only the requested feed when given", () => {
		expect(renderLogEntriesText(tasked(), { feed: "tools" })).toBe("[TOOL] x");
		expect(renderLogEntriesText(tasked(), { feed: "thinking" })).toBe("[THINKING] t");
	});

	it("handles empty, non-array, and falsy entries", () => {
		expect(renderLogEntriesText([])).toBe("");
		expect(renderLogEntriesText(null)).toBe("");
		expect(renderLogEntriesText(undefined)).toBe("");
		expect(renderLogEntriesText([null, entry({ text: "[AGENT] ok" })])).toBe("[AGENT] ok");
	});

	it("supports entries carrying only a feed string", () => {
		const entries = [{ ...entry({ text: "[TOOL] s" }), feeds: undefined, feed: "tools" }];
		expect(renderLogEntriesText(entries, { feed: "tools" })).toBe("[TOOL] s");
		expect(renderLogEntriesText(entries)).toBe("[TOOL] s");
	});
});
