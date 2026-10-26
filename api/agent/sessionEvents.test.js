import { describe, it, expect } from "vitest";
import {
	AGENT_EVENT_NAMES,
	isNormalizedAgentEvent,
	normalizedAgentEvent,
} from "./sessionEvents.js";

/**
 * MARK: sessionEvents unit tests
 * @description Verifies the normalized agent-event vocabulary: the exhaustive
 *   name set, the membership check, and normalized event construction.
 */

describe("AGENT_EVENT_NAMES", () => {
	it("contains exactly the normalized vocabulary (the original pi 8 plus the additive unified-log names)", () => {
		expect(AGENT_EVENT_NAMES).toEqual([
			"run_started",
			"assistant_delta",
			"message_started",
			"tool_started",
			"tool_updated",
			"tool_finished",
			"run_finished",
			"run_error",
			"usage_updated",
			"session_meta",
			"permission_requested",
			"permission_resolved",
			"plan_updated",
			"reasoning_delta",
			"harness_log",
		]);
	});

	it("is frozen so the vocabulary cannot be mutated at runtime", () => {
		expect(Object.isFrozen(AGENT_EVENT_NAMES)).toBe(true);
	});
});

describe("isNormalizedAgentEvent", () => {
	it.each(AGENT_EVENT_NAMES)("accepts the normalized name '%s'", (name) => {
		expect(isNormalizedAgentEvent(name)).toBe(true);
	});

	it.each([
		["raw pi event names", "message_update"],
		["raw pi event names", "tool_execution_start"],
		["raw pi event names", "agent_start"],
		["engine-owned events", "process:stdout"],
		["engine-owned events", "stage:enter"],
		["unknown names", ""],
		["unknown names", "nonsense"],
		["non-strings", undefined],
		["non-strings", null],
	])("rejects %s ('%s')", (_label, name) => {
		expect(isNormalizedAgentEvent(name)).toBe(false);
	});
});

describe("normalizedAgentEvent", () => {
	it("builds an event object with the normalized name as the type discriminator", () => {
		expect(normalizedAgentEvent("assistant_delta", { delta: "hi" })).toEqual({
			type: "assistant_delta",
			delta: "hi",
		});
	});

	it("spreads tool payload fields through unchanged", () => {
		const args = { path: "/a.ts" };
		const result = { content: [{ type: "text", text: "ok" }] };
		expect(
			normalizedAgentEvent("tool_finished", {
				toolName: "edit",
				toolCallId: "call-1",
				args,
				result: undefined,
				isError: false,
			}),
		).toEqual({
			type: "tool_finished",
			toolName: "edit",
			toolCallId: "call-1",
			args,
			isError: false,
		});
	});

	it("drops any incoming raw type so the normalized name stays authoritative", () => {
		expect(normalizedAgentEvent("run_error", { type: "agent_error", error: "x" })).toEqual({
			type: "run_error",
			error: "x",
		});
	});

	it("defaults to an empty payload", () => {
		expect(normalizedAgentEvent("run_finished")).toEqual({ type: "run_finished" });
	});

	it("rejects names outside the normalized vocabulary", () => {
		expect(() => normalizedAgentEvent("message_update")).toThrow(
			/not a normalized agent event name/,
		);
	});
});