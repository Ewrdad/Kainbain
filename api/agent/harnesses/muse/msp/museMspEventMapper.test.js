import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMuseMspEventMapper } from "./museMspEventMapper.js";
import { parseMuseMspModels } from "./museMspModelCatalog.js";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");

function readFixtureLines(name) {
	return fs
		.readFileSync(path.join(FIXTURES, name), "utf8")
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line));
}

function itemEvent(item) {
	return { item, sessionId: "s1", viewCursor: "v1" };
}

describe("museMspEventMapper", () => {
	it("maps the echo spine to normalized events and settles on turn/completed", () => {
		const mapper = createMuseMspEventMapper({ runFacts: { transport: "msp" } });
		mapper.beginTurn({ prompt: "hello" });

		expect(mapper.map("turn/started", { turnId: "t1" }).map((e) => e.type)).toEqual([
			"run_started",
		]);
		expect(
			mapper
				.map("item/started", itemEvent({ itemId: "m1", kind: "agentMessage" }))
				.map((e) => e.type),
		).toEqual(["message_started"]);
		const delta = mapper.map("item/delta", { itemId: "m1", delta: "echo: hello", field: "text" });
		expect(delta).toHaveLength(1);
		expect(delta[0]).toMatchObject({
			type: "assistant_delta",
			delta: "echo: hello",
			assistantMessageEvent: { type: "text_delta" },
		});
		expect(
			mapper.map("item/completed", itemEvent({ itemId: "m1", kind: "agentMessage", text: "echo: hello" })),
		).toEqual([]);
		const finished = mapper.map("turn/completed", { turnId: "t1", terminal: "completed" });
		expect(finished[0]).toMatchObject({ type: "run_finished", status: "completed", response: "echo: hello" });
	});

	it("maps a failed turn to run_error and a cancelled turn to interrupted", () => {
		const mapper = createMuseMspEventMapper();
		const failed = mapper.map("turn/completed", {
			terminal: "failed",
			error: { message: "model exploded" },
		});
		expect(failed[0]).toMatchObject({ type: "run_error", error: "model exploded" });

		const cancelled = mapper.map("turn/completed", { terminal: "cancelled" });
		expect(cancelled[0]).toMatchObject({ type: "run_finished", status: "aborted", interrupted: true });
	});

	it("maps toolCall items to tool_started/updated/finished and ignores reminderChild noise", () => {
		const mapper = createMuseMspEventMapper();
		const started = mapper.map(
			"item/started",
			itemEvent({ itemId: "tc1", kind: "toolCall", tool: "shell", callId: "call_1", args: "{}" }),
		);
		expect(started[0]).toMatchObject({ type: "tool_started", toolName: "shell", toolCallId: "call_1" });

		// visibleOutput streams via the "output" field (schema SS4.5.4).
		const updated = mapper.map("item/delta", { itemId: "tc1", delta: "partial", field: "output" });
		expect(updated[0]).toMatchObject({ type: "tool_updated", toolName: "shell", partialResult: "partial" });

		const finished = mapper.map(
			"item/completed",
			itemEvent({ itemId: "tc1", kind: "toolCall", tool: "shell", status: "failed", failureReason: "boom" }),
		);
		expect(finished[0]).toMatchObject({ type: "tool_finished", isError: true, error: "boom" });

		expect(
			mapper.map("item/started", itemEvent({ itemId: "r1", kind: "reminderChild", status: "failed" })),
		).toEqual([]);
	});

	it("maps reasoning deltas to thinking deltas (field \"text\" or absent)", () => {
		const mapper = createMuseMspEventMapper();
		mapper.map("item/started", itemEvent({ itemId: "rs1", kind: "reasoning" }));
		const delta = mapper.map("item/delta", { itemId: "rs1", delta: "pondering", field: "text" });
		expect(delta[0].assistantMessageEvent.type).toBe("thinking_delta");
		const absent = mapper.map("item/delta", { itemId: "rs1", delta: "more" });
		expect(absent[0].assistantMessageEvent.type).toBe("thinking_delta");
	});

	it("is field-strict: only the documented stream fields map to output", () => {
		const mapper = createMuseMspEventMapper();
		mapper.map("item/started", itemEvent({ itemId: "m1", kind: "agentMessage" }));
		mapper.map("item/started", itemEvent({ itemId: "tc1", kind: "toolCall", tool: "shell" }));
		mapper.map("item/started", itemEvent({ itemId: "rs1", kind: "reasoning" }));
		// agentMessage text on the tool field, tool output on the text field,
		// and the legacy reasoning field all yield NO event (forward tolerance).
		expect(mapper.map("item/delta", { itemId: "m1", delta: "x", field: "output" })).toEqual([]);
		expect(mapper.map("item/delta", { itemId: "tc1", delta: "x", field: "text" })).toEqual([]);
		expect(mapper.map("item/delta", { itemId: "rs1", delta: "x", field: "summary.0" })).toEqual([]);
		expect(mapper.map("item/delta", { itemId: "unknown-item", delta: "x", field: "text" })).toEqual([]);
		expect(mapper.map("item/delta", { itemId: "m1", delta: "", field: "text" })).toEqual([]);
		expect(mapper.stats().ignoredByDesign).toBe(5);
		// ...while the documented shapes still map.
		expect(mapper.map("item/delta", { itemId: "m1", delta: "hi" })[0].type).toBe("assistant_delta");
		expect(mapper.map("item/delta", { itemId: "tc1", delta: "out", field: "output" })[0].type).toBe(
			"tool_updated",
		);
	});

	it("classifies toolCall completion by status: inProgress/completed are not errors", () => {
		const mapper = createMuseMspEventMapper();
		mapper.map("item/started", itemEvent({ itemId: "t1", kind: "toolCall", tool: "shell", callId: "c1" }));
		const inProgress = mapper.map(
			"item/completed",
			itemEvent({ itemId: "t1", kind: "toolCall", status: "inProgress", visibleOutput: "partial" }),
		);
		expect(inProgress[0]).toMatchObject({ type: "tool_finished", isError: false, result: "partial" });

		mapper.map("item/started", itemEvent({ itemId: "t2", kind: "toolCall", tool: "shell", callId: "c2" }));
		const completed = mapper.map(
			"item/completed",
			itemEvent({ itemId: "t2", kind: "toolCall", status: "completed", visibleOutput: "done" }),
		);
		expect(completed[0]).toMatchObject({ type: "tool_finished", isError: false, error: null });

		// An unknown terminal status is terminal-unknown: never reads as success.
		mapper.map("item/started", itemEvent({ itemId: "t3", kind: "toolCall", tool: "shell", callId: "c3" }));
		const unknown = mapper.map(
			"item/completed",
			itemEvent({ itemId: "t3", kind: "toolCall", status: "exploded" }),
		);
		expect(unknown[0]).toMatchObject({ type: "tool_finished", isError: true });

		// A failureReason alone also fails the call.
		mapper.map("item/started", itemEvent({ itemId: "t4", kind: "toolCall", tool: "shell", callId: "c4" }));
		const reasoned = mapper.map(
			"item/completed",
			itemEvent({ itemId: "t4", kind: "toolCall", status: "completed", failureReason: "denied" }),
		);
		expect(reasoned[0]).toMatchObject({ type: "tool_finished", isError: true, error: "denied" });
	});

	it("keeps the LAST non-empty completed agentMessage as the turn response", () => {
		const mapper = createMuseMspEventMapper();
		mapper.map("turn/started", { turnId: "t1" });
		mapper.map("item/started", itemEvent({ itemId: "m1", kind: "agentMessage" }));
		mapper.map("item/completed", itemEvent({ itemId: "m1", kind: "agentMessage", text: "first answer" }));
		mapper.map("item/started", itemEvent({ itemId: "m2", kind: "agentMessage" }));
		mapper.map("item/completed", itemEvent({ itemId: "m2", kind: "agentMessage", text: "final answer" }));
		let finished = mapper.map("turn/completed", { turnId: "t1", terminal: "completed" });
		expect(finished[0].response).toBe("final answer");

		// An empty completed text never clobbers the last real answer.
		mapper.map("turn/started", { turnId: "t2" });
		mapper.map("item/started", itemEvent({ itemId: "m3", kind: "agentMessage" }));
		mapper.map("item/completed", itemEvent({ itemId: "m3", kind: "agentMessage", text: "kept" }));
		mapper.map("item/started", itemEvent({ itemId: "m4", kind: "agentMessage" }));
		mapper.map("item/completed", itemEvent({ itemId: "m4", kind: "agentMessage", text: "" }));
		finished = mapper.map("turn/completed", { turnId: "t2", terminal: "completed" });
		expect(finished[0].response).toBe("kept");
	});

	it("maps an unknown terminal value to run_error (fail loud, never guess)", () => {
		const mapper = createMuseMspEventMapper();
		const exploded = mapper.map("turn/completed", { terminal: "exploded", error: { message: "host bug" } });
		expect(exploded[0]).toMatchObject({ type: "run_error", error: "host bug" });
		const bare = mapper.map("turn/completed", { terminal: "mystery" });
		expect(bare[0]).toMatchObject({ type: "run_error", error: "muse turn failed" });
	});

	it("captures live usage telemetry", () => {
		const mapper = createMuseMspEventMapper();
		mapper.map("session/tokenUsage", { promptTokens: 5, totalTokens: 9 });
		mapper.map("session/contextUsage", { usedTokens: 12, windowTokens: 100, pressure: "normal" });
		const usage = mapper.getUsage();
		expect(usage.tokenUsage.totalTokens).toBe(9);
		expect(usage.getContextUsage()).toEqual({ current: 12, limit: 100 });
	});

	it("tolerates unknown notifications and counts them", () => {
		const mapper = createMuseMspEventMapper();
		expect(mapper.map("some/futureEvent", {})).toEqual([]);
		expect(mapper.map("session/statusChanged", {})).toEqual([]);
		expect(mapper.stats().ignoredUnknown).toBe(1);
		expect(mapper.stats().ignoredByDesign).toBe(1);
	});
});

describe("museMspEventMapper — captured echo transcripts (drift guard)", () => {
	it("maps the REAL 1.4.9 turn transcript to the expected spine", () => {
		const mapper = createMuseMspEventMapper();
		mapper.beginTurn({ prompt: "Say hello in 3 words" });
		const types = [];
		for (const frame of readFixtureLines("msp-turn.echo.jsonl")) {
			if (typeof frame.method !== "string") continue;
			if (frame.id !== undefined && frame.id !== null) continue; // server→client request
			for (const event of mapper.map(frame.method, frame.params)) types.push(event.type);
		}
		expect(types).toContain("run_started");
		expect(types).toContain("message_started");
		expect(types).toContain("assistant_delta");
		expect(types).toContain("run_finished");
	});

	it("parses the captured real model/list fixture", () => {
		const result = JSON.parse(
			fs.readFileSync(path.join(FIXTURES, "msp-model-list.json"), "utf8"),
		);
		const models = parseMuseMspModels(result);
		expect(models.length).toBeGreaterThan(0);
		expect(models[0].id).toMatch(/^muse-/);
		expect(models[0].key).toContain("muse::");
	});
});
