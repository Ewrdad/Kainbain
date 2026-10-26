import { describe, it, expect } from "vitest";
import { translatePiEvent, PI_EVENT_TO_NORMALIZED } from "./piSessionEvents.js";
import { AGENT_EVENT_NAMES, isNormalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: piSessionEvents unit tests
 * @description Verifies the raw-pi-event → normalized-event translation for
 *   every pi event family and every payload-shape variant the engine's
 *   extractors (eventBridge.extractContent / extractToolOutput, agentRunner)
 *   read today. Pure-function tests: no I/O, no session, no harness.
 */

describe("PI_EVENT_TO_NORMALIZED", () => {
	it("maps every normalized name from at least one raw pi event", () => {
		const normalizedTargets = new Set(PI_EVENT_TO_NORMALIZED.values());
		// pi's raw vocabulary is the original 8 events. The unified-log
		// vocabulary added for other harnesses (usage_updated, session_meta,
		// permission_*, plan_updated, reasoning_delta, harness_log) rides on
		// the pi payloads that pi already emits (assistant message usage,
		// tool results) or is produced by those harnesses — it is not a
		// one-to-one rename of a raw pi event.
		const piCoreNames = new Set([
			"run_started",
			"assistant_delta",
			"message_started",
			"tool_started",
			"tool_updated",
			"tool_finished",
			"run_finished",
			"run_error",
		]);
		for (const name of AGENT_EVENT_NAMES) {
			if (!piCoreNames.has(name)) continue;
			expect(normalizedTargets.has(name)).toBe(true);
		}
	});

	it("contains only normalized targets", () => {
		for (const target of PI_EVENT_TO_NORMALIZED.values()) {
			expect(isNormalizedAgentEvent(target)).toBe(true);
		}
	});
});

describe("translatePiEvent — lifecycle events", () => {
	it("renames agent_start to run_started preserving payload", () => {
		expect(
			translatePiEvent({ type: "agent_start", model: { id: "m1" } }),
		).toEqual({ type: "run_started", model: { id: "m1" } });
	});

	it("renames turn_start to run_started preserving payload", () => {
		expect(translatePiEvent({ type: "turn_start" })).toEqual({ type: "run_started" });
	});

	it.each(["agent_end", "agent_settled", "turn_end"])(
		"renames %s to run_finished preserving payload",
		(rawName) => {
			expect(
				translatePiEvent({ type: rawName, messages: [] }),
			).toEqual({ type: "run_finished", messages: [] });
		},
	);
});

describe("translatePiEvent — assistant streaming events", () => {
	it("renames message_update to assistant_delta keeping every delta shape the engine reads", () => {
		expect(
			translatePiEvent({
				type: "message_update",
				assistantMessageEvent: { type: "text_delta", delta: "hello" },
			}),
		).toEqual({
			type: "assistant_delta",
			assistantMessageEvent: { type: "text_delta", delta: "hello" },
		});

		expect(translatePiEvent({ type: "message_update", delta: "bare" })).toEqual({
			type: "assistant_delta",
			delta: "bare",
		});

		expect(translatePiEvent({ type: "message_update", chunk: "chunked" })).toEqual({
			type: "assistant_delta",
			chunk: "chunked",
		});
	});

	it("keeps full message.content blocks on assistant_delta (frontend replaces wholesale)", () => {
		const message = {
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "hmm" },
				{ type: "text", text: "answer" },
			],
		};
		expect(translatePiEvent({ type: "message_update", message })).toEqual({
			type: "assistant_delta",
			message,
		});
	});

	it("renames message_start to message_started for assistant AND user roles (suppression stays consumer-side)", () => {
		const assistant = { message: { role: "assistant", content: [] } };
		expect(translatePiEvent({ type: "message_start", ...assistant })).toEqual({
			type: "message_started",
			...assistant,
		});

		const user = { message: { role: "user", content: "prompt" } };
		expect(translatePiEvent({ type: "message_start", ...user })).toEqual({
			type: "message_started",
			...user,
		});
	});
});

describe("translatePiEvent — tool events", () => {
	it("renames tool_execution_start keeping toolName, toolCallId and args variants", () => {
		const raw = {
			type: "tool_execution_start",
			toolCallId: "call-1",
			toolName: "edit",
			args: { path: "/a.ts" },
		};
		expect(translatePiEvent(raw)).toEqual({
			type: "tool_started",
			toolCallId: "call-1",
			toolName: "edit",
			args: { path: "/a.ts" },
		});

		// argument-shape variants seen by consumers (arguments / input / name)
		expect(translatePiEvent({ type: "tool_execution_start", name: "bash", arguments: { cmd: "ls" } })).toEqual({
			type: "tool_started",
			name: "bash",
			arguments: { cmd: "ls" },
		});
		expect(
			translatePiEvent({ type: "tool_execution_start", toolName: "read", input: { file_path: "/b" } }),
		).toEqual({
			type: "tool_started",
			toolName: "read",
			input: { file_path: "/b" },
		});
	});

	it("renames tool_execution_update keeping partialResult/delta streaming shapes", () => {
		expect(
			translatePiEvent({ type: "tool_execution_update", toolCallId: "c1", partialResult: "out" }),
		).toEqual({ type: "tool_updated", toolCallId: "c1", partialResult: "out" });

		expect(
			translatePiEvent({ type: "tool_execution_update", toolCallId: "c1", delta: "d" }),
		).toEqual({ type: "tool_updated", toolCallId: "c1", delta: "d" });
	});

	it.each([
		["plain string result", { result: "plain", isError: false }],
		["result.content string", { result: { content: "text" }, isError: false }],
		[
			"result.content text blocks",
			{ result: { content: [{ type: "text", text: "one" }] }, isError: false },
		],
		["isError flag", { result: { content: "boom" }, isError: true }],
		["error field", { error: "exploded", isError: true }],
	])("renames tool_execution_end keeping %s", (_label, payload) => {
		expect(translatePiEvent({ type: "tool_execution_end", toolName: "bash", ...payload })).toEqual({
			type: "tool_finished",
			toolName: "bash",
			...payload,
		});
	});
});

describe("translatePiEvent — error events", () => {
	it.each([
		["error", { error: { message: "bad" } }],
		["agent_error", { message: "unrecoverable" }],
	])("renames %s to run_error preserving payload", (rawName, payload) => {
		expect(translatePiEvent({ type: rawName, ...payload })).toEqual({
			type: "run_error",
			...payload,
		});
	});
});

describe("translatePiEvent — pass-through safety", () => {
	it.each([
		["null", null],
		["undefined", undefined],
		["a string", "not-an-event"],
	])("passes %s through untouched", (_label, raw) => {
		expect(translatePiEvent(raw)).toBe(raw);
	});

	it("passes events without a type through unchanged", () => {
		const raw = { delta: "no type" };
		expect(translatePiEvent(raw)).toBe(raw);
	});

	it.each([
		["engine-owned process events", "process:stdout"],
		["engine-owned stage events", "stage:enter"],
		["UI streaming events", "streaming_update"],
		["totally unknown", "something_new"],
	])("passes unknown '%s' (%s) through unchanged so the engine ignores them as before", (_label, rawName) => {
		const raw = { type: rawName, chunk: "x" };
		expect(translatePiEvent(raw)).toBe(raw);
	});

	it("is idempotent: translating an already-normalized event is a no-op", () => {
		const once = translatePiEvent({ type: "message_update", delta: "hi" });
		expect(translatePiEvent(once)).toBe(once);
	});
});