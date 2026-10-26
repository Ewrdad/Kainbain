import { describe, it, expect } from "vitest";
import { createAcpEventMapper } from "./AcpEventMapper.js";

/**
 * MARK: AcpEventMapper tests
 * @description Pure notification→event mapping (no I/O): chunk/tool/plan
 *   updates map to the normalized vocabulary, unknown updates are ignored,
 *   and prompt stop reasons settle terminally (unexpected reasons error).
 */

describe("AcpEventMapper updates", () => {
	it("announces message_started once, then streams assistant deltas", () => {
		const mapper = createAcpEventMapper();
		const first = mapper.mapUpdate({
			update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } },
		});
		expect(first.map((e) => e.type)).toEqual(["message_started", "assistant_delta"]);
		expect(first[1]).toMatchObject({
			delta: "Hello",
			assistantMessageEvent: { type: "text_delta", delta: "Hello" },
		});

		const second = mapper.mapUpdate({
			update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " again" } },
		});
		expect(second.map((e) => e.type)).toEqual(["assistant_delta"]);

		mapper.resetTurn();
		const next = mapper.mapUpdate({
			update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "New turn" } },
		});
		expect(next.map((e) => e.type)).toEqual(["message_started", "assistant_delta"]);
	});

	it("accepts bare-string chunk content", () => {
		const mapper = createAcpEventMapper();
		const events = mapper.mapUpdate({
			update: { sessionUpdate: "agent_message_chunk", content: "raw text" },
		});
		expect(events.map((e) => e.type)).toEqual(["message_started", "assistant_delta"]);
		expect(events[1].delta).toBe("raw text");
	});

	it("maps the tool_call start/update/end triplet", () => {
		const mapper = createAcpEventMapper();
		const started = mapper.mapUpdate({
			update: {
				sessionUpdate: "tool_call",
				toolCallId: "t-1",
				title: "Write file",
				kind: "start",
				input: { path: "a.js" },
			},
		});
		expect(started).toHaveLength(1);
		expect(started[0]).toMatchObject({
			type: "tool_started",
			toolName: "Write file",
			toolCallId: "t-1",
			args: { path: "a.js" },
		});

		const updated = mapper.mapUpdate({
			update: { sessionUpdate: "tool_call", toolCallId: "t-1", title: "Write file", kind: "update", output: "half" },
		});
		expect(updated[0]).toMatchObject({ type: "tool_updated", partialResult: "half" });

		const finished = mapper.mapUpdate({
			update: { sessionUpdate: "tool_call", toolCallId: "t-1", title: "Write file", kind: "end", output: "done" },
		});
		expect(finished[0]).toMatchObject({
			type: "tool_finished",
			result: "done",
			isError: false,
		});
	});

	it("reports tool errors with their message", () => {
		const mapper = createAcpEventMapper();
		const [finished] = mapper.mapUpdate({
			update: {
				sessionUpdate: "tool_call",
				toolCallId: "t-9",
				kind: "end",
				error: { message: "disk full" },
			},
		});
		expect(finished).toMatchObject({ type: "tool_finished", isError: true, error: "disk full" });
	});

	it("maps plan updates to a single message_started per turn", () => {
		const mapper = createAcpEventMapper();
		const first = mapper.mapUpdate({ update: { sessionUpdate: "plan", entries: [] } });
		expect(first.map((e) => e.type)).toEqual(["message_started"]);
		expect(mapper.mapUpdate({ update: { sessionUpdate: "plan" } })).toEqual([]);
	});

	it("ignores unknown updates and malformed notifications (forward tolerance)", () => {
		const mapper = createAcpEventMapper();
		expect(mapper.mapUpdate({ update: { sessionUpdate: "warp_drive" } })).toEqual([]);
		expect(mapper.mapUpdate({})).toEqual([]);
		expect(mapper.mapUpdate(null)).toEqual([]);
	});
});

describe("AcpEventMapper usage extraction", () => {
	it("maps a usage_update to the vendor-neutral telemetry record", () => {
		const mapper = createAcpEventMapper();
		const usage = mapper.extractUsage({
			sessionUpdate: "usage_update",
			used: 1200,
			size: 200000,
			cost: { amount: 0.012, currency: "USD" },
			_meta: {
				steps: 2,
				promptTokens: 900,
				completionTokens: 300,
				cachedTokens: 128,
				totalTokens: 1200,
				tokensPerSecond: 42.5,
				lastTurnDuration: 3.5,
				lastTurnTotalTokens: 1200,
			},
		});
		expect(usage).toEqual({
			contextTokensUsed: 1200,
			contextWindowSize: 200000,
			costUsd: 0.012,
			steps: 2,
			promptTokens: 900,
			completionTokens: 300,
			cachedTokens: 128,
			totalTokens: 1200,
			tokensPerSecond: 42.5,
			lastTurnDuration: 3.5,
			lastTurnTotalTokens: 1200,
		});
	});

	it("keeps agent-omitted counters undefined instead of guessing", () => {
		const mapper = createAcpEventMapper();
		const usage = mapper.extractUsage({ sessionUpdate: "usage_update", used: 5, size: 10 });
		expect(usage).toEqual({
			contextTokensUsed: 5,
			contextWindowSize: 10,
			costUsd: undefined,
			steps: undefined,
			promptTokens: undefined,
			completionTokens: undefined,
			cachedTokens: undefined,
			totalTokens: undefined,
			tokensPerSecond: undefined,
			lastTurnDuration: undefined,
			lastTurnTotalTokens: undefined,
		});
	});

	it("returns null for non-usage updates, malformed shapes, and empty rows", () => {
		const mapper = createAcpEventMapper();
		expect(mapper.extractUsage({ sessionUpdate: "agent_message_chunk", content: { text: "hi" } })).toBeNull();
		expect(mapper.extractUsage(null)).toBeNull();
		expect(mapper.extractUsage({ sessionUpdate: "usage_update" })).toBeNull();
		expect(
			mapper.extractUsage({ sessionUpdate: "usage_update", cost: { amount: "n/a" } }),
		).toBeNull();
	});
});

describe("AcpEventMapper prompt results", () => {
	it("settles end_turn as run_finished", () => {
		const mapper = createAcpEventMapper();
		expect(mapper.mapPromptResult({ stopReason: "end_turn" })).toEqual([
			{ type: "run_finished", status: "end_turn", stopReason: "end_turn" },
		]);
	});

	it("settles cancelled as an interrupted run_finished (never an error)", () => {
		const mapper = createAcpEventMapper();
		const [event] = mapper.mapPromptResult({ stopReason: "cancelled" });
		expect(event).toMatchObject({ type: "run_finished", interrupted: true });
	});

	it("turns any other stop reason into run_error", () => {
		const mapper = createAcpEventMapper();
		const [event] = mapper.mapPromptResult({ stopReason: "max_tokens" });
		expect(event.type).toBe("run_error");
		expect(event.error).toContain("max_tokens");
	});
});
