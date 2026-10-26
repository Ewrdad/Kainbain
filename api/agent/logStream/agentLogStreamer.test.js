import { describe, it, expect } from "vitest";
import { createAgentLogStreamer } from "./agentLogStreamer.js";
import { AGENT_EVENT_NAMES } from "../sessionEvents.js";

/***
 * MARK: event builders
 * @description Small builders for normalized agent events, mirroring the
 *   payload shapes the engine consumes (sessionEvents.js vocabulary).
 ***/
const textDelta = (delta) => ({
	type: "assistant_delta",
	assistantMessageEvent: { type: "text_delta", delta },
});
const thinkingDelta = (delta) => ({
	type: "assistant_delta",
	assistantMessageEvent: { type: "thinking_delta", delta },
});
const ameEnd = (type) => ({
	type: "assistant_delta",
	assistantMessageEvent: { type },
});

/***
 * MARK: feedTwoTurnConversation
 * @description Feeds a realistic normalized sequence — two turns, each with
 *   assistant text, interleaved thinking, and a tool call with args, streamed
 *   output and a result; the second tool fails.
 ***/
function feedTwoTurnConversation(streamer) {
	// Turn 1: think, say, call a tool that succeeds.
	streamer.handleEvent({ type: "run_started" });
	streamer.handleEvent({
		type: "message_started",
		message: { role: "assistant", id: "m1" },
	});
	streamer.handleEvent(thinkingDelta("Let me inspect the repo."));
	streamer.handleEvent(ameEnd("thinking_end"));
	streamer.handleEvent(textDelta("I will read the config first."));
	streamer.handleEvent(textDelta(" Then run the tests."));
	streamer.handleEvent(ameEnd("text_end"));
	streamer.handleEvent({
		type: "tool_started",
		toolName: "read",
		toolCallId: "tc-1",
		args: { path: "config.json" },
	});
	streamer.handleEvent({ type: "tool_updated", partialResult: "line 1" });
	streamer.handleEvent({
		type: "tool_finished",
		toolName: "read",
		toolCallId: "tc-1",
		result: { content: [{ type: "text", text: "{ \"ok\": true }" }] },
		isError: false,
	});
	streamer.handleEvent({ type: "run_finished" });

	// Turn 2: say, call a tool that fails.
	streamer.handleEvent({ type: "run_started" });
	streamer.handleEvent(textDelta("Now writing the file."));
	streamer.handleEvent({
		type: "tool_started",
		toolName: "write",
		toolCallId: "tc-2",
		args: { path: "out.txt", content: "hi" },
	});
	streamer.handleEvent({
		type: "tool_finished",
		toolName: "write",
		toolCallId: "tc-2",
		result: "disk full",
		isError: true,
	});
	streamer.handleEvent({ type: "run_finished" });
}

describe("createAgentLogStreamer — harness run open/close lines", () => {
	const agyFacts = {
		harness: "antigravity",
		model: "gemini-3.8-flash-medium",
		effort: null,
		sandbox: false,
		skipPermissions: true,
	};

	it("opens an agy run with model, sandbox, and approval mode on the main feed", () => {
		const streamer = createAgentLogStreamer();
		const appended = streamer.handleEvent({
			type: "run_started",
			permissionMode: "always-proceed",
			conversationId: "9e15255c-3338",
			runFacts: agyFacts,
		});
		expect(appended).toHaveLength(1);
		expect(appended[0].text).toBe(
			"[AGY] run open: model=gemini-3.8-flash-medium sandbox=off approvals=auto permission_mode=always-proceed conversation=9e15255c",
		);
		expect(streamer.renderText()).toContain("[AGY] run open:");
	});

	it("closes an agy run with status, duration, and token usage", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({
			type: "run_started",
			runFacts: agyFacts,
		});
		const appended = streamer.handleEvent({
			type: "run_finished",
			status: "SUCCESS",
			durationSeconds: 17.4,
			usage: { input_tokens: 14019, output_tokens: 4, total_tokens: 14023 },
			runFacts: agyFacts,
		});
		// The result usage is recovered as a telemetry record AND the legacy
		// run-close line keeps rendering byte-identical on the main feed.
		expect(appended).toHaveLength(2);
		expect(appended[0].kind).toBe("telemetry");
		expect(appended[0].text).toBe("[USAGE] tokens=14019/4/14023");
		expect(appended[1].text).toBe(
			"[AGY] run done: status=SUCCESS in 17.4s · 14023 tokens",
		);
		// Telemetry never leaks into the narrative text view.
		expect(streamer.renderText()).toBe(
			"[AGY] run open: model=gemini-3.8-flash-medium sandbox=off approvals=auto\n[AGY] run done: status=SUCCESS in 17.4s · 14023 tokens",
		);
	});

	it("stays silent for runs without spawn facts (pi transcript shape unchanged)", () => {
		const streamer = createAgentLogStreamer();
		expect(streamer.handleEvent({ type: "run_started" })).toEqual([]);
		expect(streamer.handleEvent({ type: "run_finished" })).toEqual([]);
		expect(streamer.renderText()).toBe("");
	});
});

describe("createAgentLogStreamer — grouping", () => {
	it("produces one entry per semantic block, never per token", () => {
		const streamer = createAgentLogStreamer();

		// While streaming, deltas produce NO entries.
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent({
			type: "message_started",
			message: { role: "assistant" },
		});
		expect(streamer.handleEvent(textDelta("Hel"))).toEqual([]);
		expect(streamer.handleEvent(textDelta("lo wor"))).toEqual([]);
		expect(streamer.handleEvent(textDelta("ld"))).toEqual([]);

		// The block end flushes exactly ONE complete entry.
		const flushed = streamer.handleEvent(ameEnd("text_end"));
		expect(flushed).toHaveLength(1);
		expect(flushed[0]).toMatchObject({
			kind: "assistant",
			feed: "main",
			text: "Hello world",
			turn: 1,
		});
		expect(flushed[0].id).toBeGreaterThan(0);
		expect(typeof flushed[0].ts).toBe("string");
	});

	it("groups a two-turn conversation with correct turn numbers and tool correlation", () => {
		const streamer = createAgentLogStreamer();
		feedTwoTurnConversation(streamer);

		const { entries } = streamer.snapshot();
		const kinds = entries.map((e) => e.kind);

		// One entry per block: full think(1, thinking feed) + its collapsed
		// marker(1, main) + text(1) + tool(1) + result(1) + text(2) + tool(2)
		// + error(2). No token fragments anywhere.
		expect(kinds).toEqual([
			"thinking", // full block (thinking feed)
			"thinking", // collapsed marker (main feed)
			"assistant",
			"tool",
			"tool", // result
			"assistant",
			"tool",
			"error",
		]);

		const turns = entries.map((e) => e.turn);
		expect(turns).toEqual([1, 1, 1, 1, 1, 2, 2, 2]);

		const assistantEntry = entries[2];
		expect(assistantEntry.text).toBe("I will read the config first. Then run the tests.");
		expect(assistantEntry.meta.messageRole).toBe("assistant");

		const toolEntry = entries[3];
		expect(toolEntry.text).toBe('[TOOL] read({"path":"config.json"})');
		expect(toolEntry.meta).toMatchObject({
			toolName: "read",
			toolCallId: "tc-1",
			isError: false,
		});
		// Full args remain available to dedicated tools consumers.
		expect(toolEntry.meta.args).toEqual({ path: "config.json" });

		const resultEntry = entries[4];
		expect(resultEntry.text).toBe('[RESULT] { "ok": true }');
		expect(resultEntry.meta.toolCallId).toBe("tc-1");

		const errorEntry = entries[7];
		expect(errorEntry.text).toBe("[ERROR] Tool write failed: disk full");
		expect(errorEntry.kind).toBe("error");
		expect(errorEntry.meta.toolCallId).toBe("tc-2");
	});

	it("flushes open text when a tool call starts (no lost narrative)", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent(textDelta("Working on it"));
		// No text_end — the tool call itself must close the text block.
		const appended = streamer.handleEvent({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "tc-9",
			args: {},
		});
		expect(appended.map((e) => e.kind)).toEqual(["assistant", "tool"]);
		expect(appended[0].text).toBe("Working on it");
	});

	it("accumulates tool_updated output into the [RESULT] excerpt", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({ type: "tool_started", toolName: "bash", toolCallId: "t1", args: {} });
		streamer.handleEvent({ type: "tool_updated", partialResult: "build ok" });
		streamer.handleEvent({ type: "tool_updated", partialResult: "tests ok" });
		const emitted = streamer.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "t1",
			result: "",
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].text).toBe("[RESULT] build ok\ntests ok");
	});
});

describe("createAgentLogStreamer — thinking", () => {
	it("routes thinking to the thinking feed and collapses it on main by default", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent(thinkingDelta("secret reasoning step one."));
		streamer.handleEvent(thinkingDelta(" step two."));
		streamer.handleEvent(textDelta("Visible narrative."));
		streamer.handleEvent(ameEnd("done"));

		const { entries, feeds } = streamer.snapshot();

		// Thinking feed carries the FULL block; main feed only the marker.
		expect(feeds.thinking).toHaveLength(1);
		expect(feeds.thinking[0].text).toContain("secret reasoning step one. step two.");
		expect(feeds.main.map((e) => e.text)).toEqual([
			"[THINKING] (36 chars)",
			"Visible narrative.",
		]);

		const marker = entries.find((e) => e.meta.collapsed);
		expect(marker.meta.charCount).toBe(36);
		expect(marker.kind).toBe("thinking");
		// The marker links to its full thinking block for inline expansion.
		const fullEntry = entries.find((e) => e.feed === "thinking");
		expect(marker.meta.fullTextId).toBe(fullEntry.id);

		// The combined rendered text shows the marker, never the raw thinking.
		const rendered = streamer.renderText();
		expect(rendered).toContain("[THINKING] (36 chars)");
		expect(rendered).not.toContain("secret reasoning");
	});

	it("renders full thinking on main when hideThinking is false", () => {
		const streamer = createAgentLogStreamer({ hideThinking: false });
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent(thinkingDelta("open reasoning."));
		streamer.handleEvent(ameEnd("thinking_end"));

		const { feeds } = streamer.snapshot();
		expect(feeds.main.map((e) => e.text)).toEqual(["open reasoning."]);
		expect(streamer.renderText()).toContain("open reasoning.");
		// No collapsed marker is created.
		expect(streamer.snapshot().entries.some((e) => e.meta.collapsed)).toBe(false);
	});
});

describe("createAgentLogStreamer — errors", () => {
	it("marks tool errors on main and flags the tool entry", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "t9",
			args: { command: "npm test" },
		});
		streamer.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "t9",
			result: "exit 1",
			isError: true,
		});

		const { entries, feeds } = streamer.snapshot();
		expect(entries).toHaveLength(2);
		// The [TOOL] call line lives on main too; the failure is elevated there.
		expect(feeds.main.map((e) => e.kind)).toEqual(["tool", "error"]);
		expect(feeds.main[1].text).toBe("[ERROR] Tool bash failed: exit 1");
		expect(feeds.tools[0].meta.isError).toBe(true);
		// Failed tools emit no [RESULT] line.
		expect(feeds.tools.some((e) => e.text.startsWith("[RESULT]"))).toBe(false);
	});

	it("logs run_error on the main feed", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({ type: "run_started" });
		const emitted = streamer.handleEvent({
			type: "run_error",
			error: new Error("connection reset"),
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].kind).toBe("error");
		expect(emitted[0].text).toBe("[ERROR] connection reset");
		expect(emitted[0].feed).toBe("main");
	});
});

describe("createAgentLogStreamer — robustness", () => {
	it("ignores null events and empty deltas", () => {
		const streamer = createAgentLogStreamer();
		expect(streamer.handleEvent(null)).toEqual([]);
		expect(
			streamer.handleEvent({
				type: "assistant_delta",
				assistantMessageEvent: { type: "text_delta", delta: "" },
			}),
		).toEqual([]);
		expect(streamer.handleEvent(textDelta("   "))).toEqual([]);
		expect(streamer.handleEvent({ type: "message_started", message: { role: "user" } })).toEqual(
			[],
		);
		expect(streamer.snapshot().entries).toEqual([]);
	});

	it("captures unknown events into the bounded raw lane instead of dropping them", () => {
		const streamer = createAgentLogStreamer();
		const emitted = streamer.handleEvent({
			type: "process:stdout",
			chunk: "hello",
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].kind).toBe("raw");
		expect(emitted[0].feed).toBe("raw");
		expect(emitted[0].text).toBe("[RAW] process:stdout: unmapped");
		expect(emitted[0].evidence.wireType).toBe("process:stdout");
		expect(emitted[0].evidence.reason).toBe("unmapped");
		// The raw lane never leaks into the narrative text view.
		expect(streamer.renderText()).toBe("");
		expect(streamer.renderFeed("raw")).toBe("[RAW] process:stdout: unmapped");
	});

	it("treats bare deltas (no assistantMessageEvent) as text", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent({ type: "assistant_delta", delta: "legacy " });
		streamer.handleEvent({ type: "assistant_delta", chunk: "delta" });
		streamer.handleEvent({ type: "run_finished" });
		expect(streamer.renderText()).toBe("legacy delta");
	});

	it("handles every normalized event name without crashing", () => {
		const streamer = createAgentLogStreamer();
		for (const name of AGENT_EVENT_NAMES) {
			expect(() => streamer.handleEvent({ type: name })).not.toThrow();
		}
	});
});

describe("createAgentLogStreamer — caps and eviction", () => {
	it("evicts the oldest entries under an updating marker when maxEntries is exceeded", () => {
		const streamer = createAgentLogStreamer({ maxEntries: 3 });
		streamer.handleEvent({ type: "run_started" });
		for (let i = 0; i < 5; i++) {
			streamer.handleEvent(textDelta(`block ${i}`));
			streamer.handleEvent(ameEnd("text_end"));
		}

		const { entries } = streamer.snapshot();
		// 5 blocks + 1 marker, capped at 3.
		expect(entries).toHaveLength(3);
		expect(entries[0].kind).toBe("system");
		expect(entries[0].text).toBe("[INFO] (3 earlier log entries evicted)");
		expect(entries[0].meta.evictedCount).toBe(3);
		expect(entries.slice(1).map((e) => e.text)).toEqual(["block 3", "block 4"]);
	});

	it("updates the same eviction marker on repeated eviction", () => {
		const streamer = createAgentLogStreamer({ maxEntries: 2 });
		streamer.handleEvent({ type: "run_started" });
		for (const block of ["first", "second", "third"]) {
			streamer.handleEvent(textDelta(block));
			streamer.handleEvent(ameEnd("text_end"));
		}

		const { entries } = streamer.snapshot();
		expect(entries).toHaveLength(2);
		expect(entries[0].text).toBe("[INFO] (2 earlier log entries evicted)");
		const markerCount = entries.filter((e) => e.kind === "system" && e.meta.evictedCount).length;
		expect(markerCount).toBe(1);
	});

	it("does not cap entry text when maxEntryBytes is 0 (default)", () => {
		const streamer = createAgentLogStreamer();
		const longText = "x".repeat(50_000);
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent(textDelta(longText));
		streamer.handleEvent(ameEnd("text_end"));
		expect(streamer.renderText()).toBe(longText);
	});

	it("caps entry text when maxEntryBytes is set", () => {
		const streamer = createAgentLogStreamer({ maxEntryBytes: 10 });
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent(textDelta("abcdefghijklmnop"));
		streamer.handleEvent(ameEnd("text_end"));
		expect(streamer.renderText()).toBe("abcdefghij…");
	});
});

describe("createAgentLogStreamer — feeds", () => {
	it("consumeFeed hands each entry to exactly one consumer per feed", () => {
		const streamer = createAgentLogStreamer();
		feedTwoTurnConversation(streamer);

		const firstConsume = streamer.consumeFeed("thinking");
		expect(firstConsume).toHaveLength(1);
		expect(firstConsume[0].kind).toBe("thinking");

		// Same feed again: drained.
		expect(streamer.consumeFeed("thinking")).toEqual([]);

		// Other feeds are independent.
		const toolsFirst = streamer.consumeFeed("tools");
		expect(toolsFirst.map((e) => e.kind)).toEqual(["tool", "tool", "tool"]);
		expect(streamer.consumeFeed("tools")).toEqual([]);
	});

	it("delivers new entries to a drained feed on the next consume", () => {
		const streamer = createAgentLogStreamer();
		expect(streamer.consumeFeed("main")).toEqual([]);
		streamer.handleEvent({ type: "run_started" });
		streamer.handleEvent(textDelta("hello"));
		streamer.handleEvent(ameEnd("text_end"));
		const delivered = streamer.consumeFeed("main");
		expect(delivered.map((e) => e.text)).toEqual(["hello"]);
	});

	it("throws for unknown feeds", () => {
		const streamer = createAgentLogStreamer();
		expect(() => streamer.consumeFeed("nope")).toThrow(/Unknown log feed/);
		expect(() => streamer.renderFeed("nope")).toThrow(/Unknown log feed/);
	});
});

describe("createAgentLogStreamer — rendering", () => {
	it("renderText preserves the legacy tag grammar and keeps tools+main interleaved", () => {
		const streamer = createAgentLogStreamer();
		feedTwoTurnConversation(streamer);
		const lines = streamer.renderText().split("\n");

		expect(lines).toEqual([
			"[THINKING] (24 chars)",
			"I will read the config first. Then run the tests.",
			'[TOOL] read({"path":"config.json"})',
			'[RESULT] { "ok": true }',
			"Now writing the file.",
			'[TOOL] write({"path":"out.txt","content":"hi"})',
			"[ERROR] Tool write failed: disk full",
		]);
	});

	it("renderFeed returns only that feed's entries", () => {
		const streamer = createAgentLogStreamer();
		feedTwoTurnConversation(streamer);
		expect(streamer.renderFeed("tools").split("\n")).toEqual([
			'[TOOL] read({"path":"config.json"})',
			'[RESULT] { "ok": true }',
			'[TOOL] write({"path":"out.txt","content":"hi"})',
		]);
		expect(streamer.renderFeed("thinking")).toContain("Let me inspect the repo.");
		expect(streamer.renderFeed("main")).toContain("[THINKING]");
	});

	it("summarizes long tool args on the [TOOL] line but keeps full args in meta", () => {
		const streamer = createAgentLogStreamer({ toolArgsMaxLength: 20 });
		streamer.handleEvent({
			type: "tool_started",
			toolName: "write",
			toolCallId: "t1",
			args: { path: "a-very-long-file-name-that-exceeds-the-limit.js", content: "x" },
		});
		const [entry] = streamer.snapshot().entries;
		expect(entry.text.startsWith("[TOOL] write(")).toBe(true);
		// Args are summarized inline (ellipsis inside the parens)…
		expect(entry.text).toContain("…");
		expect(entry.text.length).toBeLessThan(45);
		// …while the full args stay available in meta for dedicated consumers.
		expect(entry.meta.args.path).toBe("a-very-long-file-name-that-exceeds-the-limit.js");
	});

	it("collapses long tool args to the primary argument on the [TOOL] line", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "t1",
			args: { command: "npm run test:frontend", cwd: "/repo", env: "x".repeat(500) },
		});
		const [entry] = streamer.snapshot().entries;
		expect(entry.text).toBe("[TOOL] bash(npm run test:frontend …)");
	});

	it("summarizes a harness envelope on the [RESULT] line instead of a severed JSON head", () => {
		const streamer = createAgentLogStreamer({ resultMaxLength: 80 });
		streamer.handleEvent({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "t1",
			args: { command: "npm run test:frontend" },
		});
		const emitted = streamer.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "t1",
			result:
				'{"chunk_id": "exec-17-1", "command": "npm run test:frontend", ' +
				'"output": "Test Files  12 passed (12)\\n      Tests  148 passed (148)", ' +
				'"exit_code": 0, "description": "Run frontend tests"}',
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].text).toBe(
			"[RESULT] $ npm run test:frontend (exit 0): Tests  148 passed (148)",
		);
	});

	it("supports runner-emitted system lines via streamer.system", () => {
		const streamer = createAgentLogStreamer();
		const entry = streamer.system("[AGENT] Agent reasoning with model deepseek…");
		expect(entry.kind).toBe("system");
		expect(entry.feed).toBe("main");
		expect(streamer.renderText()).toContain("[AGENT] Agent reasoning with model deepseek…");
		// Empty system lines are ignored.
		expect(streamer.system("   ")).toBeNull();
	});
});