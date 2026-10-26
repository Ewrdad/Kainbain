import { describe, it, expect } from "vitest";
import { createAgyEventMapper } from "./agyEventMapper.js";
import { AGENT_EVENT_NAMES, isNormalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: agyEventMapper tests
 * @description Table-driven coverage of the full agy→normalized mapping: one
 *   case per row of the mapping table (init→run_started, agent_response
 *   deltas→message_started/assistant_delta, tool ACTIVE/DONE→tool_started/
 *   tool_updated/tool_finished, result→run_finished/run_error), plus the
 *   boundary guarantee that NO raw agy event name ever leaks.
 */

/** Feeds rows through a fresh mapper and returns the flattened normalized events. */
function mapRows(rows) {
	const mapper = createAgyEventMapper();
	const events = [];
	for (const row of rows) events.push(...mapper.map(row));
	return events;
}

/** Builds a parsed row the way the stream parser would (mapper input shape). */
function row(event, { payload = {}, conversationId = null, stepIndex = null, state = null, stepType = null } = {}) {
	return { event, payload, conversationId, stepIndex, state, stepType };
}

describe("agy event mapper — mapping table", () => {
	it("maps init to run_started with model/permission/tools meta", () => {
		const [event] = createAgyEventMapper().map(
			row("init", {
				payload: {
					cwd: "/workspace",
					tools: ["read_file", "run_command"],
					permission_mode: "request-review",
					model: "gemini-3.1-pro-high",
				},
				conversationId: "conv-1",
			}),
		);
		expect(event).toEqual({
			type: "run_started",
			model: "gemini-3.1-pro-high",
			permissionMode: "request-review",
			tools: ["read_file", "run_command"],
			conversationId: "conv-1",
		});
	});

	it("carries spawn run facts on run_started and run_finished for the transcript", () => {
		const runFacts = {
			harness: "antigravity",
			model: "gemini-3.8-flash-medium",
			effort: null,
			sandbox: false,
			skipPermissions: true,
		};
		const mapper = createAgyEventMapper({ runFacts });
		const [started] = mapper.map(
			row("init", {
				payload: { permission_mode: "always-proceed", tools: [] },
				conversationId: "conv-9",
			}),
		);
		expect(started.type).toBe("run_started");
		expect(started.runFacts).toEqual(runFacts);
		expect(started.runFacts).not.toBe(runFacts);
		const [finished] = mapper.map(
			row("result", {
				payload: { status: "SUCCESS", duration_seconds: 1.5 },
				conversationId: "conv-9",
			}),
		);
		expect(finished.type).toBe("run_finished");
		expect(finished.runFacts).toEqual(runFacts);
	});

	it("emits message_started once per agent_response step, before its first delta", () => {
		const events = createAgyEventMapper().map(
			row("step_update", {
				stepIndex: 2,
				state: "ACTIVE",
				stepType: "agent_response",
				payload: { text_delta: "Hello" },
			}),
		);
		expect(events.map((event) => event.type)).toEqual(["message_started", "assistant_delta"]);
		expect(events[0].message).toEqual({ role: "assistant" });
		expect(events[1].delta).toBe("Hello");
		// The protocol tag lets the log streamer buffer text blocks properly.
		expect(events[1].assistantMessageEvent).toEqual({ type: "text_delta", delta: "Hello" });
	});

	it("emits message_started only once across multiple ACTIVE rows of one step", () => {
		const mapper = createAgyEventMapper();
		mapper.map(row("step_update", { stepIndex: 2, state: "ACTIVE", stepType: "agent_response", payload: { text_delta: "a" } }));
		const second = mapper.map(row("step_update", { stepIndex: 2, state: "ACTIVE", stepType: "agent_response", payload: { text_delta: "b" } }));
		expect(second.map((event) => event.type)).toEqual(["assistant_delta"]);
		const done = mapper.map(row("step_update", { stepIndex: 2, state: "DONE", stepType: "agent_response" }));
		// DONE carries no trailing delta → no further events for this step.
		expect(done).toEqual([]);
	});

	it("maps the first tool ACTIVE to tool_started and further ACTIVEs to tool_updated", () => {
		const mapper = createAgyEventMapper();
		const started = mapper.map(
			row("step_update", {
				stepIndex: 3,
				state: "ACTIVE",
				stepType: "tool",
				payload: { tool_info: { name: "run_command", parameters: { command: "npm test" } } },
			}),
		);
		expect(started).toEqual([
			{
				type: "tool_started",
				toolName: "run_command",
				toolCallId: "3",
				args: { command: "npm test" },
			},
		]);
		const updated = mapper.map(
			row("step_update", {
				stepIndex: 3,
				state: "ACTIVE",
				stepType: "tool",
				payload: { tool_info: { name: "run_command", output: "Tests: 8 " } },
			}),
		);
		expect(updated).toEqual([
			{
				type: "tool_updated",
				toolName: "run_command",
				toolCallId: "3",
				partialResult: "Tests: 8 ",
			},
		]);
	});

	it("maps the tool DONE to tool_finished with result/isError/error", () => {
		const mapper = createAgyEventMapper();
		mapper.map(row("step_update", { stepIndex: 3, state: "ACTIVE", stepType: "tool", payload: { tool_info: { name: "run_command" } } }));
		const events = mapper.map(
			row("step_update", {
				stepIndex: 3,
				state: "DONE",
				stepType: "tool",
				payload: {
					tool_info: {
						name: "run_command",
						output: "Tests: 8 passed",
						error: { type: "exit_code", message: "1 test failed" },
					},
				},
			}),
		);
		expect(events).toEqual([
			{
				type: "tool_finished",
				toolName: "run_command",
				toolCallId: "3",
				result: "Tests: 8 passed",
				isError: true,
				error: "1 test failed",
			},
		]);
	});

	it("synthesizes a tool_started when DONE arrives without a prior ACTIVE", () => {
		const events = createAgyEventMapper().map(
			row("step_update", {
				stepIndex: 5,
				state: "DONE",
				stepType: "tool",
				payload: { tool_info: { name: "write_file", output: "ok" } },
			}),
		);
		expect(events.map((event) => event.type)).toEqual(["tool_started", "tool_finished"]);
	});

	it("surfaces user_input, checkpoint and unknown step types as harness_log lines", () => {
		const mapper = createAgyEventMapper();
		const [userInput] = mapper.map(
			row("step_update", { stepIndex: 1, state: "ACTIVE", stepType: "user_input" }),
		);
		expect(userInput.type).toBe("harness_log");
		expect(userInput.text).toBe("[AGY] user input (step 1)");
		const [checkpoint] = mapper.map(
			row("step_update", { stepIndex: 9, state: "DONE", stepType: "checkpoint" }),
		);
		expect(checkpoint.type).toBe("harness_log");
		expect(checkpoint.text).toBe("[AGY] checkpoint (step 9)");
		const [future] = mapper.map(
			row("step_update", { stepIndex: 10, state: "ACTIVE", stepType: "some_future_step" }),
		);
		expect(future.type).toBe("harness_log");
		expect(future.text).toBe("[AGY] some_future_step (step 10)");
		// Repeats of the same step stay silent; tool-less tool steps stay silent.
		expect(
			mapper.map(row("step_update", { stepIndex: 1, state: "ACTIVE", stepType: "user_input" })),
		).toEqual([]);
		expect(mapper.map(row("step_update", { stepIndex: 11, state: "ACTIVE", stepType: "tool" }))).toEqual([]); // no tool_info
	});

	it("maps a SUCCESS result to run_finished with usage meta", () => {
		const [event] = createAgyEventMapper().map(
			row("result", {
				payload: {
					status: "SUCCESS",
					response: "done",
					duration_seconds: 3.2,
					usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 },
				},
				conversationId: "conv-1",
			}),
		);
		expect(event.type).toBe("run_finished");
		expect(event.status).toBe("SUCCESS");
		expect(event.usage.total_tokens).toBe(165);
		expect(event.durationSeconds).toBe(3.2);
		expect(event.conversationId).toBe("conv-1");
		expect(event.interrupted).toBeUndefined();
	});

	it("maps INTERRUPTED/CANCELED results to run_finished (never an error)", () => {
		for (const status of ["INTERRUPTED", "CANCELED"]) {
			const [event] = createAgyEventMapper().map(row("result", { payload: { status } }));
			expect(event.type).toBe("run_finished");
			expect(event.interrupted).toBe(true);
			expect(event.status).toBe(status);
		}
	});

	it("maps non-SUCCESS results to run_error with the CLI error message", () => {
		const [errorEvent] = createAgyEventMapper().map(
			row("result", { payload: { status: "ERROR", error: "Model quota exceeded" } }),
		);
		expect(errorEvent).toEqual({ type: "run_error", error: "Model quota exceeded" });

		const [fallback] = createAgyEventMapper().map(row("result", { payload: { status: "INVALID" } }));
		expect(fallback).toEqual({ type: "run_error", error: "agy run failed with status INVALID" });
	});

	it("returns no events for null/garbage rows", () => {
		const mapper = createAgyEventMapper();
		expect(mapper.map(null)).toEqual([]);
		expect(mapper.map(undefined)).toEqual([]);
		expect(mapper.map({})).toEqual([]);
	});

	it("only ever emits names from the normalized vocabulary (raw agy names never leak)", () => {
		const mapper = createAgyEventMapper();
		const rows = [
			row("init", { payload: { model: "m" }, conversationId: "c" }),
			row("step_update", { stepIndex: 1, state: "ACTIVE", stepType: "agent_response", payload: { text_delta: "x" } }),
			row("step_update", { stepIndex: 2, state: "ACTIVE", stepType: "tool", payload: { tool_info: { name: "t" } } }),
			row("step_update", { stepIndex: 2, state: "DONE", stepType: "tool", payload: { tool_info: { name: "t" } } }),
			row("result", { payload: { status: "SUCCESS" }, conversationId: "c" }),
			row("result", { payload: { status: "ERROR", error: "e" }, conversationId: "c" }),
		];
		const emitted = [];
		for (const parsed of rows) emitted.push(...mapper.map(parsed));
		for (const event of emitted) {
			expect(isNormalizedAgentEvent(event.type)).toBe(true);
			expect(AGENT_EVENT_NAMES).toContain(event.type);
		}
		const rawAgyNames = ["init", "step_update", "result"];
		for (const event of emitted) {
			expect(rawAgyNames).not.toContain(event.type);
		}
	});
});