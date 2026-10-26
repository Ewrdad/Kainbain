/**
 * @fileoverview Tests for the codex event mapper.
 *   Exercises the wire→normalized vocabulary mapping against fixtures only;
 *   no real codex binary is spawned. Every emitted event must belong to the
 *   engine's normalized vocabulary (AGENT_EVENT_NAMES) — raw wire names never
 *   leak past the harness boundary.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createCodexEventMapper } from "./codexEventMapper.js";
import { isNormalizedAgentEvent } from "../../sessionEvents.js";

describe("codexEventMapper", () => {
	let mapper;

	beforeEach(() => {
		mapper = createCodexEventMapper();
	});

	it("exports a factory returning { map, stats }", () => {
		expect(typeof createCodexEventMapper).toBe("function");
		expect(typeof mapper.map).toBe("function");
		expect(typeof mapper.stats).toBe("function");
	});

	it("emits only normalized-vocabulary events", () => {
		const rows = [
			{ type: "status", message: "Working" },
			{ type: "output", text: "hi" },
			{ type: "error", message: "boom" },
			{ type: "permission_request", requestId: "r1" },
			{ type: "telemetry", usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 } },
			{ type: "telemetry", event: "heartbeat" },
			{ type: "session", conversationId: "c1" },
			{ type: "model_list", models: [] },
			{ type: "cancel" },
			"[codex] plain log line",
			'{"type":"output","text":"json line"}',
		];
		for (const row of rows) {
			for (const event of mapper.map(row)) {
				expect(isNormalizedAgentEvent(event.type)).toBe(true);
			}
		}
	});

	it("announces message_started once, then streams assistant deltas", () => {
		const first = mapper.map({ type: "output", text: "hello" });
		expect(first.map((e) => e.type)).toEqual(["message_started", "assistant_delta"]);
		expect(first[1].delta).toBe("hello");

		const second = mapper.map({ type: "output", text: " world" });
		expect(second.map((e) => e.type)).toEqual(["assistant_delta"]);
	});

	it("accepts the kind discriminator and content payload alias", () => {
		const events = mapper.map({ kind: "output", content: "alias" });
		expect(events.map((e) => e.type)).toContain("assistant_delta");
		expect(events.at(-1).delta).toBe("alias");
	});

	it("maps errors to run_error without throwing on missing fields", () => {
		const events = mapper.map({ type: "error" });
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("run_error");
		expect(typeof events[0].error).toBe("string");
	});

	it("auto-approves permission requests as an audited pair (YOLO)", () => {
		const events = mapper.map({
			type: "permission_request",
			requestId: "req_123",
			method: "write",
			target: "/tmp/f",
		});
		expect(events.map((e) => e.type)).toEqual([
			"permission_requested",
			"permission_resolved",
		]);
		expect(events[1].decision).toBe("allow");
		expect(events[1].requestId).toBe("req_123");
	});

	it("assigns deterministic permission ids when the wire omits them", () => {
		const first = createCodexEventMapper().map({ type: "permission_request" });
		const second = createCodexEventMapper().map({ type: "permission_request" });
		expect(first[1].requestId).toBe(second[1].requestId);
		expect(first[1].requestId).toMatch(/^codex-perm-\d+$/);
	});

	it("maps token telemetry to usage_updated and other telemetry to harness_log", () => {
		const usage = mapper.map({
			type: "telemetry",
			usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			model: "codex-mini",
		});
		expect(usage).toHaveLength(1);
		expect(usage[0].type).toBe("usage_updated");
		expect(usage[0].usage.totalTokens).toBe(15);

		const other = mapper.map({ type: "telemetry", event: "heartbeat" });
		expect(other[0].type).toBe("harness_log");
	});

	it("maps session/resume rows to session_meta carrying the conversation id", () => {
		const events = mapper.map({ type: "resume", sessionId: "conv-9" });
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("session_meta");
		expect(events[0].conversationId).toBe("conv-9");
	});

	it("keeps model listings and acks visible as harness_log (never fabricated output)", () => {
		const models = mapper.map({ type: "model_list", models: [{ id: "a" }] });
		expect(models[0].type).toBe("harness_log");
		expect(models[0].text).toContain("1");
	});

	it("preserves non-JSON log lines verbatim in harness_log", () => {
		const events = mapper.map("[Codex] Starting up...");
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("harness_log");
		expect(events[0].text).toContain("[Codex] Starting up...");
		expect(events[0].tag).toBe("[codex]");
	});

	it("parses JSON string rows", () => {
		const events = mapper.map('{"type":"output","text":"json line"}');
		expect(events.map((e) => e.type)).toContain("assistant_delta");
	});

	it("never throws and emits nothing for unknown or garbage input", () => {
		for (const row of [
			null,
			undefined,
			42,
			[],
			"",
			"   ",
			{ unknown: "payload" },
			{ type: "future-kind" },
			{ type: "output" },
			{ type: "session" },
		]) {
			expect(() => mapper.map(row)).not.toThrow();
			expect(mapper.map(row)).toEqual([]);
		}
	});

	it("accounts mapped vs ignored rows in stats()", () => {
		mapper.map({ type: "output", text: "hi" });
		mapper.map({ type: "nope" });
		const stats = mapper.stats();
		expect(stats.mapped).toBeGreaterThan(0);
		expect(stats.ignoredUnknown).toBeGreaterThan(0);
	});
});
