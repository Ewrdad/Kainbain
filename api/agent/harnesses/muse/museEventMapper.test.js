import { describe, it, expect } from "vitest";
import { createMuseEventMapper } from "./museEventMapper.js";

function row(payloadType, payload = {}) {
	return { payloadType, payload };
}

describe("muse event mapper (corrected mappings F-01/F-02)", () => {
	it("maps run.lifecycle.started to run_started", () => {
		const mapper = createMuseEventMapper();
		const events = mapper.map(row("run.lifecycle.started", { prompt: "hi" }));
		expect(events.map((e) => e.type)).toEqual(["run_started"]);
	});

	it("maps run.output.delta to message_started + assistant_delta with the protocol tag", () => {
		const mapper = createMuseEventMapper();
		const events = mapper.map(row("run.output.delta", { text: "hello" }));
		expect(events.map((e) => e.type)).toEqual([
			"message_started",
			"assistant_delta",
		]);
		expect(events[1].delta).toBe("hello");
		expect(events[1].assistantMessageEvent).toEqual({
			type: "text_delta",
			delta: "hello",
		});
		// Second delta in the same run does not re-announce the message.
		expect(
			mapper.map(row("run.output.delta", { text: " world" })).map((e) => e.type),
		).toEqual(["assistant_delta"]);
	});

	it("maps run.terminal.completed to run_finished with the final text", () => {
		const mapper = createMuseEventMapper();
		const events = mapper.map(
			row("run.terminal.completed", { terminal: "completed", text: "final" }),
		);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("run_finished");
		expect(events[0].response).toBe("final");
	});

	it("maps run.terminal.failed to run_error with the reason", () => {
		const mapper = createMuseEventMapper();
		const events = mapper.map(
			row("run.terminal.failed", { terminal: "failed", reason: "nope" }),
		);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("run_error");
		expect(events[0].error).toBe("nope");
	});

	it("ignores transient task/runtime/session lifecycles by design (F-01)", () => {
		const mapper = createMuseEventMapper();
		for (const ignored of [
			"runtime.command.accepted",
			"session.run.linked",
			"turn.input.user",
			"task.lifecycle.tool_output_ref",
			"task.lifecycle.proposed",
			"task.lifecycle.status",
		]) {
			expect(mapper.map(row(ignored, {}))).toEqual([]);
		}
		expect(mapper.stats().ignoredByDesign).toBeGreaterThan(0);
	});

	it("surfaces run.model.configured as session_meta", () => {
		const mapper = createMuseEventMapper();
		const events = mapper.map(
			row("run.model.configured", {
				model_id: "muse-spark-1.3-contributor",
				provider_id: "meta",
			}),
		);
		expect(events.map((e) => e.type)).toEqual(["session_meta"]);
		expect(events[0].model).toBe("meta/muse-spark-1.3-contributor");
	});

	it("surfaces terminal task lifecycles as harness_log lines (never run errors)", () => {
		const mapper = createMuseEventMapper();
		const completed = mapper.map(
			row("task.lifecycle.completed", {
				event: { kind: "completed", task_id: "01a0aa39-28f1" },
			}),
		);
		expect(completed.map((e) => e.type)).toEqual(["harness_log"]);
		expect(completed[0].text).toBe("[muse] task completed (01a0aa39)");
		// A task.lifecycle.failed inside a successful run is NOT a run error.
		const failed = mapper.map(
			row("task.lifecycle.failed", {
				event: { kind: "failed", task_id: "01a0aa39-28f1" },
			}),
		);
		expect(failed.map((e) => e.type)).toEqual(["harness_log"]);
		expect(failed[0].text).toBe("[muse] task failed (01a0aa39)");
	});

	it("ignores non-tool side-effect intents (reminders, model calls)", () => {
		const mapper = createMuseEventMapper();
		expect(
			mapper.map(
				row("task.lifecycle.side_effect_intent", {
					event: { kind: "side_effect_intent", operation: "reminder.child_run" },
				}),
			),
		).toEqual([]);
		expect(
			mapper.map(
				row("task.lifecycle.side_effect_intent", {
					event: { kind: "side_effect_intent", operation: "model.meta.response" },
				}),
			),
		).toEqual([]);
	});

	it("maps tool intent -> started, output -> updated, result -> finished", () => {
		const mapper = createMuseEventMapper();
		const started = mapper.map(
			row("task.lifecycle.side_effect_intent", {
				event: {
					kind: "side_effect_intent",
					operation: "tool:write_file",
					task_id: "task-1",
				},
			}),
		);
		expect(started.map((e) => e.type)).toEqual(["tool_started"]);
		expect(started[0].toolName).toBe("write_file");

		const updated = mapper.map(
			row("task.lifecycle.output", {
				task_id: "task-1",
				event: { kind: "output", chunk: "wrote 2 bytes", final_result: false },
			}),
		);
		expect(updated.map((e) => e.type)).toEqual(["tool_updated"]);
		expect(updated[0].partialResult).toBe("wrote 2 bytes");

		const finished = mapper.map(
			row("tool.result", {
				kind: "tool_result",
				call_id: "call_1",
				text: "wrote 2 bytes to hi.txt",
				correlation_facts: "{'outcome': 'success', 'tool_name': 'write_file'}",
			}),
		);
		expect(finished.map((e) => e.type)).toEqual(["tool_finished"]);
		expect(finished[0].toolName).toBe("write_file");
		expect(finished[0].result).toContain("wrote 2 bytes");
	});

	it("finishes an orphan tool.result with the facts-derived name", () => {
		const mapper = createMuseEventMapper();
		const finished = mapper.map(
			row("tool.result", {
				kind: "tool_result",
				call_id: "call_9",
				text: "done",
				edit_facts: "{'tool_name': 'run_shell'}",
			}),
		);
		expect(finished[0].type).toBe("tool_finished");
		expect(finished[0].toolName).toBe("run_shell");
	});

	it("tolerates unknown payload types (forward tolerance)", () => {
		const mapper = createMuseEventMapper();
		expect(mapper.map(row("future.new.payload", {}))).toEqual([]);
		expect(mapper.map(null)).toEqual([]);
		expect(mapper.stats().ignoredUnknown).toBe(2);
	});
});
