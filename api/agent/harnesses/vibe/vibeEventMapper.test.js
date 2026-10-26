import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createVibeEventMapper, vibeAssistantText, vibeToolInfo } from "./vibeEventMapper.js";
import { createVibeStreamParser } from "./vibeStreamParser.js";

const VIBE_DIR = path.dirname(fileURLToPath(import.meta.url));

function replayFixture(fixtureName) {
	const parser = createVibeStreamParser();
	const mapper = createVibeEventMapper();
	const text = fs.readFileSync(path.join(VIBE_DIR, "fixtures", fixtureName), "utf8");
	const events = [];
	for (const line of text.split("\n")) {
		if (!line.trim()) continue;
		for (const row of parser.push(`${line}\n`)) {
			events.push(...mapper.map(row));
		}
	}
	for (const row of parser.flush()) events.push(...mapper.map(row));
	return { events, types: events.map((event) => event.type), stats: parser.stats() };
}

describe("vibe event mapper", () => {
	it("maps an assistant message row to message_started + assistant_delta", () => {
		const mapper = createVibeEventMapper();
		const events = mapper.map({
			rowType: "message",
			role: "assistant",
			content: [{ type: "text", text: "PROBE-OK" }],
		});
		expect(events.map((event) => event.type)).toEqual([
			"message_started",
			"assistant_delta",
		]);
		expect(events[1].delta).toBe("PROBE-OK");
		expect(events[1].assistantMessageEvent).toEqual({
			type: "text_delta",
			delta: "PROBE-OK",
		});
		// One message_started per run, however many assistant rows follow.
		const second = mapper.map({
			rowType: "message",
			role: "assistant",
			content: [{ type: "text", text: "more" }],
		});
		expect(second.map((event) => event.type)).toEqual(["assistant_delta"]);
	});

	it("ignores the user prompt echo by design", () => {
		const mapper = createVibeEventMapper();
		expect(
			mapper.map({ rowType: "message", role: "user", content: [{ type: "text", text: "hi" }] }),
		).toEqual([]);
		expect(mapper.stats().ignoredByDesign).toBe(1);
	});

	it("streams reasoning rows into the thinking lane instead of dropping them", () => {
		const mapper = createVibeEventMapper();
		const events = mapper.map({ rowType: "reasoning", text: "private plan" });
		expect(events.map((event) => event.type)).toEqual(["reasoning_delta"]);
		expect(events[0].delta).toBe("private plan");
	});

	it("falls back to content text for reasoning rows without a text field", () => {
		const mapper = createVibeEventMapper();
		const events = mapper.map({
			rowType: "reasoning",
			content: [{ type: "text", text: "fallback thought" }],
		});
		expect(events.map((event) => event.type)).toEqual(["reasoning_delta"]);
		expect(events[0].delta).toBe("fallback thought");
	});

	it("ignores empty reasoning rows by design", () => {
		const mapper = createVibeEventMapper();
		expect(mapper.map({ rowType: "reasoning" })).toEqual([]);
		expect(mapper.stats().ignoredByDesign).toBe(1);
	});

	it("maps a settled effect row to tool_started + tool_finished", () => {
		const mapper = createVibeEventMapper();
		const events = mapper.map({
			rowType: "effect",
			id: "effect-1",
			title: "file_system.bash",
			detail: { toolName: "file_system.bash" },
			state: { status: "completed", outputText: "hi\n" },
		});
		expect(events.map((event) => event.type)).toEqual(["tool_started", "tool_finished"]);
		expect(events[0].toolName).toBe("file_system.bash");
		expect(events[0].toolCallId).toBe("effect-1");
		expect(events[1].result).toBe("hi\n");
		expect(events[1].isError).toBe(false);
	});

	it("marks failed tool effects as errors and falls back to the title", () => {
		const mapper = createVibeEventMapper();
		const events = mapper.map({
			rowType: "effect",
			id: "effect-9",
			title: "file_system.read",
			detail: {},
			state: { status: "failed", outputText: "no such file" },
		});
		expect(events.map((event) => event.type)).toEqual(["tool_started", "tool_finished"]);
		expect(events[0].toolName).toBe("file_system.read");
		expect(events[1].isError).toBe(true);
		expect(events[1].error).toContain("no such file");
	});

	it("leaves non-terminal effect states open without finishing", () => {
		const mapper = createVibeEventMapper();
		const events = mapper.map({
			rowType: "effect",
			id: "effect-running",
			title: "file_system.bash",
			detail: { toolName: "file_system.bash" },
			state: { status: "running" },
		});
		expect(events.map((event) => event.type)).toEqual(["tool_started"]);
		expect(mapper.stats().openTools).toBe(1);
	});

	it("tolerates unknown row types without throwing", () => {
		const mapper = createVibeEventMapper();
		expect(mapper.map({ rowType: "future.row" })).toEqual([]);
		expect(mapper.map(null)).toEqual([]);
		expect(mapper.stats().ignoredUnknown).toBe(2);
	});

	it("carries run facts into run_started", () => {
		const mapper = createVibeEventMapper({
			runFacts: { harness: "vibe", autoApprove: true },
		});
		const events = mapper.startRun();
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("run_started");
		expect(events[0].runFacts).toEqual({ harness: "vibe", autoApprove: true });
	});

	it("joins multi-block assistant text and skips non-text blocks", () => {
		expect(
			vibeAssistantText({
				content: [
					{ type: "text", text: "a" },
					{ type: "image", text: "ignored" },
					{ type: "text", text: "b" },
				],
			}),
		).toBe("ab");
		expect(vibeAssistantText({ content: null })).toBe("");
	});

	it("extracts tool identity with title fallback", () => {
		expect(
			vibeToolInfo({ title: "t", detail: null, state: { status: "completed" } }).name,
		).toBe("t");
		expect(vibeToolInfo({}).name).toBe("tool");
	});
});

describe("vibe real fixtures (wire-shape drift guard)", () => {
	it("text-only fixture replays to run_started-free assistant deltas", () => {
		const { types, stats } = replayFixture("streaming.text-only.jsonl");
		// The user echo produces no events; the assistant row produces the pair.
		expect(types).toEqual(["message_started", "assistant_delta"]);
		expect(stats.droppedUnknown).toBe(0);
	});

	it("tool-call fixture replays the tool before the answer (wire order)", () => {
		const { types } = replayFixture("streaming.tool-call.jsonl");
		// Wire order is user → effect → assistant: the tool settles before
		// the first assistant row announces message_started.
		expect(types).toEqual([
			"tool_started",
			"tool_finished",
			"message_started",
			"assistant_delta",
		]);
	});

	it("drift fails loudly: a renamed row type drops the tool events", () => {
		const parser = createVibeStreamParser();
		const mapper = createVibeEventMapper();
		const types = [];
		const text = fs.readFileSync(
			path.join(VIBE_DIR, "fixtures", "streaming.tool-call.jsonl"),
			"utf8",
		);
		for (const line of text.replaceAll('"effect"', '"effect2"').split("\n")) {
			if (!line.trim()) continue;
			for (const row of parser.push(`${line}\n`)) {
				for (const event of mapper.map(row)) types.push(event.type);
			}
		}
		expect(types).not.toContain("tool_started");
		expect(parser.stats().droppedUnknown).toBe(1);
	});
});
