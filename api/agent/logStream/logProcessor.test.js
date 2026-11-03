import { describe, it, expect } from "vitest";
import { createLogProcessor } from "./logProcessor.js";

/**
 * MARK: logProcessor unit tests
 * @description Verifies the unified processing layer: the new normalized
 *   event vocabulary becomes canonical records (telemetry, permission, plan,
 *   reasoning, harness-log, raw lanes), usage riding on legacy payloads is
 *   recovered, and lane budgets bound growth with explicit eviction markers.
 */

const textDelta = (delta) => ({
	type: "assistant_delta",
	assistantMessageEvent: { type: "text_delta", delta },
});
const textEnd = () => ({
	type: "assistant_delta",
	assistantMessageEvent: { type: "text_end" },
});

describe("createLogProcessor — telemetry lane", () => {
	it("turns usage_updated into a telemetry record", () => {
		const processor = createLogProcessor();
		const emitted = processor.handleEvent({
			type: "usage_updated",
			usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500 },
			model: "pi:sonnet",
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].kind).toBe("telemetry");
		expect(emitted[0].feed).toBe("telemetry");
		expect(emitted[0].text).toBe("[USAGE] tokens=1200/300/1500");
		expect(emitted[0].usage).toEqual({
			inputTokens: 1200,
			outputTokens: 300,
			totalTokens: 1500,
		});
	});

	it("recovers usage riding on run_finished (agy result usage)", () => {
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		const emitted = processor.handleEvent({
			type: "run_finished",
			usage: { input_tokens: 10, output_tokens: 5 },
		});
		expect(emitted.map((e) => e.kind)).toEqual(["telemetry"]);
		expect(emitted[0].text).toBe("[USAGE] tokens=10/5/15");
	});

	it("recovers usage riding on assistant_delta (pi message usage)", () => {
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		const emitted = processor.handleEvent({
			type: "assistant_delta",
			assistantMessageEvent: { type: "text_delta", delta: "hi" },
			usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
		});
		expect(emitted.map((e) => e.kind)).toEqual(["telemetry"]);
	});

	it("suppresses duplicate telemetry for the same usage payload", () => {
		const processor = createLogProcessor();
		const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
		const first = processor.handleEvent({ type: "usage_updated", usage });
		const second = processor.handleEvent({ type: "usage_updated", usage });
		expect(first).toHaveLength(1);
		expect(second).toEqual([]);
	});

	it("ignores empty usage payloads", () => {
		const processor = createLogProcessor();
		expect(processor.handleEvent({ type: "usage_updated", usage: {} })).toEqual([]);
		expect(processor.handleEvent({ type: "usage_updated" })).toEqual([]);
	});

	it("caps telemetry records at the lane budget", () => {
		const processor = createLogProcessor({ telemetryMaxCount: 2 });
		for (let i = 0; i < 4; i++) {
			processor.handleEvent({
				type: "usage_updated",
				usage: { inputTokens: i + 1, outputTokens: 0, totalTokens: i + 1 },
			});
		}
		expect(
			processor.entries.filter((e) => e.kind === "telemetry"),
		).toHaveLength(2);
	});
});

describe("createLogProcessor — session/permission/plan/harness-log lanes", () => {
	it("turns session_meta into a session line", () => {
		const processor = createLogProcessor();
		const emitted = processor.handleEvent({
			type: "session_meta",
			model: "gemini-3",
			sandbox: true,
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].kind).toBe("system");
		expect(emitted[0].text).toBe("[INFO] session: model=gemini-3 sandbox=on");
	});

	it("ignores session_meta with no usable fields", () => {
		const processor = createLogProcessor();
		expect(processor.handleEvent({ type: "session_meta" })).toEqual([]);
	});

	it("turns permission request/resolution into audit lines", () => {
		const processor = createLogProcessor();
		const requested = processor.handleEvent({
			type: "permission_requested",
			method: "bash",
			target: "rm -rf /tmp/x",
		});
		expect(requested[0].kind).toBe("permission");
		expect(requested[0].text).toBe("[PERM] request bash rm -rf /tmp/x");
		const resolved = processor.handleEvent({
			type: "permission_resolved",
			method: "bash",
			target: "rm -rf /tmp/x",
			decision: "deny",
		});
		expect(resolved[0].text).toBe("[PERM] deny: bash rm -rf /tmp/x");
	});

	it("turns plan_updated into a plan line", () => {
		const processor = createLogProcessor();
		const emitted = processor.handleEvent({
			type: "plan_updated",
			steps: [{ title: "read" }, { title: "fix" }],
		});
		expect(emitted[0].kind).toBe("plan");
		expect(emitted[0].text).toBe("[PLAN] 2 steps: read — fix");
	});

	it("routes harness_log prose into system entries", () => {
		const processor = createLogProcessor();
		const emitted = processor.handleEvent({
			type: "harness_log",
			text: "[VIBE] spawn: vibe --prompt",
		});
		expect(emitted[0].kind).toBe("system");
		expect(emitted[0].text).toBe("[VIBE] spawn: vibe --prompt");
		expect(processor.handleEvent({ type: "harness_log", text: "  " })).toEqual([]);
	});
});

describe("createLogProcessor — reasoning lane", () => {
	it("buffers reasoning_delta into the thinking block", () => {
		const processor = createLogProcessor({ hideThinking: false });
		processor.handleEvent({ type: "run_started" });
		expect(processor.handleEvent({ type: "reasoning_delta", delta: "hmm " })).toEqual(
			[],
		);
		expect(
			processor.handleEvent({ type: "reasoning_delta", delta: "thinking" }),
		).toEqual([]);
		expect(processor.handleEvent(textDelta("answer"))).toEqual([]);
		const flushed = processor.handleEvent(textEnd());
		expect(flushed.map((e) => e.kind)).toEqual(["thinking", "assistant"]);
		expect(flushed[0].text).toBe("hmm thinking");
		expect(flushed[1].text).toBe("answer");
	});
});

describe("createLogProcessor — raw lane", () => {
	it("captures unknown events with bounded scrubbed evidence", () => {
		const processor = createLogProcessor();
		const emitted = processor.handleEvent({
			type: "mystery.wire",
			secret: "Bearer abcdef1234567890",
		});
		expect(emitted).toHaveLength(1);
		const [record] = emitted;
		expect(record.kind).toBe("raw");
		expect(record.feed).toBe("raw");
		expect(record.feeds).toEqual(["raw"]);
		expect(record.text).toBe("[RAW] mystery.wire: unmapped");
		expect(record.evidence.reason).toBe("unmapped");
		expect(record.evidence.wireType).toBe("mystery.wire");
		expect(record.evidence.sourceEvent).toContain("[REDACTED]");
		expect(record.evidence.sourceEvent).not.toContain("abcdef1234567890");
	});

	it("caps raw source bytes", () => {
		const processor = createLogProcessor({ rawMaxBytes: 32 });
		const [record] = processor.handleEvent({
			type: "big.wire",
			blob: "x".repeat(5000),
		});
		expect(record.evidence.sourceEvent.length).toBeLessThanOrEqual(33);
	});

	it("evicts raw overflow under an explicit raw marker", () => {
		const processor = createLogProcessor({ rawMaxCount: 2, maxEntries: 500 });
		for (let i = 0; i < 4; i++) {
			processor.handleEvent({ type: `wire.${i}` });
		}
		const raw = processor.entries.filter((e) => e.kind === "raw");
		expect(raw).toHaveLength(2);
		expect(raw.map((e) => e.evidence.wireType)).toEqual(["wire.2", "wire.3"]);
		const marker = processor.entries.find((e) => e.meta.rawEvictedCount);
		expect(marker.text).toBe("[INFO] (2 earlier raw entries evicted)");
		expect(marker.feed).toBe("raw");
	});
});

describe("createLogProcessor — canonical record fields", () => {
	it("stamps monotonic seq, blockIds and fidelity on records", () => {
		const processor = createLogProcessor({ harnessId: "pi" });
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent(textDelta("hello"));
		const [textEntry] = processor.handleEvent(textEnd());
		expect(textEntry.seq).toBe(1);
		expect(textEntry.blockId).toMatch(/^b\d+$/);
		expect(textEntry.fidelity).toBe("exact");
		expect(textEntry.harnessId).toBe("pi");
		const [toolEntry] = processor.handleEvent({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "c1",
			args: { command: "ls" },
		});
		expect(toolEntry.seq).toBe(2);
		expect(toolEntry.blockId).not.toBe(textEntry.blockId);
		expect(toolEntry.tool).toMatchObject({ callId: "c1", name: "bash" });
	});

	it("strips ANSI from stored text", () => {
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent(textDelta("\u001b[32mok\u001b[0m"));
		const [entry] = processor.handleEvent(textEnd());
		expect(entry.text).toBe("ok");
	});

	it("drops malformed events instead of throwing", () => {
		const processor = createLogProcessor();
		for (const hostile of [null, undefined, "text", 42, {}, { type: 42 }]) {
			expect(processor.handleEvent(hostile)).toEqual([]);
		}
		expect(processor.entries).toHaveLength(0);
	});

	it("still records an orphan tool result with no tool_started", () => {
		const processor = createLogProcessor();
		const [result] = processor.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "c1",
			result: "done",
		});
		expect(result.kind).toBe("tool");
		expect(result.text).toContain("[RESULT]");
		const [error] = processor.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			result: "boom",
			isError: true,
		});
		expect(error.kind).toBe("error");
		expect(processor.handleEvent({ type: "tool_updated", partialResult: "x" })).toEqual(
			[],
		);
	});

	it("holds the total cap with one updating eviction marker", () => {
		const processor = createLogProcessor({ maxEntries: 5 });
		for (let i = 0; i < 10; i++) processor.system(`line ${i}`);
		expect(processor.entries).toHaveLength(5);
		expect(processor.entries[0].text).toBe(
			"[INFO] (6 earlier log entries evicted)",
		);
		expect(processor.entries[0].meta).toEqual({ evictedCount: 6 });
		expect(processor.entries.at(-1).text).toBe("line 9");
	});

	it("preserves the legacy entry shape for the original events", () => {
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent(textDelta("legacy delta"));
		const [entry] = processor.handleEvent(textEnd());
		expect(entry.kind).toBe("assistant");
		expect(entry.feed).toBe("main");
		expect(entry.feeds).toEqual(["main"]);
		expect(entry.turn).toBe(1);
		expect(entry.text).toBe("legacy delta");
		expect(entry.meta).toEqual({ messageRole: "assistant" });
	});
});

describe("createLogProcessor — namespaced entry ids", () => {
	it("keeps numeric ids by default", () => {
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent(textDelta("x"));
		const [entry] = processor.handleEvent(textEnd());
		expect(entry.id).toBe(1);
	});

	it("prefixes ids and keeps thinking links inside the namespace", () => {
		const processor = createLogProcessor({ idPrefix: "exec-A:" });
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent({ type: "reasoning_delta", delta: "hmm" });
		const [marker] = processor.handleEvent(textEnd());
		expect(marker.meta.collapsed).toBe(true);
		expect(marker.id).toBe("exec-A:2");
		expect(marker.meta.fullTextId).toBe("exec-A:1");
		const full = processor.entries.find((e) => e.id === marker.meta.fullTextId);
		expect(full?.text).toBe("hmm");
	});

	it("keeps two processors' ids disjoint on one task", () => {
		const first = createLogProcessor({ idPrefix: "A:" });
		const second = createLogProcessor({ idPrefix: "B:" });
		for (const processor of [first, second]) {
			processor.handleEvent({ type: "run_started" });
			processor.handleEvent(textDelta("x"));
			processor.handleEvent(textEnd());
		}
		const ids = [...first.entries, ...second.entries].map((e) => e.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("createLogProcessor — unserializable errors", () => {
	it("renders a circular tool error instead of throwing", () => {
		const circular = { code: "E_FAIL" };
		circular.self = circular;
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent({ type: "tool_started", toolName: "bash", toolCallId: "c1", args: {} });
		const emitted = processor.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "c1",
			error: circular,
		});
		expect(emitted).toHaveLength(1);
		expect(emitted[0].kind).toBe("error");
		expect(emitted[0].text).toBe("[ERROR] Tool bash failed: [object Object]");
	});

	it("renders Error instances as Name: message", () => {
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent({ type: "tool_started", toolName: "bash", toolCallId: "c1", args: {} });
		const emitted = processor.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "c1",
			error: new Error("disk full"),
		});
		expect(emitted[0].text).toBe("[ERROR] Tool bash failed: Error: disk full");
	});

	it("degrades a value that defeats both JSON and String", () => {
		const nasty = { code: 1 };
		nasty.self = nasty;
		nasty.toString = () => {
			throw new Error("bad toString");
		};
		const processor = createLogProcessor();
		processor.handleEvent({ type: "run_started" });
		processor.handleEvent({ type: "tool_started", toolName: "bash", toolCallId: "c1", args: {} });
		const emitted = processor.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "c1",
			error: nasty,
		});
		expect(emitted[0].text).toBe("[ERROR] Tool bash failed: [unserializable]");
	});

	it("renders run_error objects as JSON without throwing", () => {
		const processor = createLogProcessor();
		const [entry] = processor.handleEvent({ type: "run_error", error: { code: 7 } });
		expect(entry.kind).toBe("error");
		expect(entry.text).toBe('[ERROR] {"code":7}');
	});
});
