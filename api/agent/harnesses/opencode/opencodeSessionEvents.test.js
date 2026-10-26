import { describe, it, expect } from "vitest";
import {
	OPENCODE_EVENT_TO_NORMALIZED,
	translateOpencodeEvent,
} from "./opencodeSessionEvents.js";
import { AGENT_EVENT_NAMES, isNormalizedAgentEvent } from "../../sessionEvents.js";

/**
 * MARK: opencodeSessionEvents tests
 * @description Verifies the pure Opencode-SSE → normalized-event translation:
 *   every raw event type the harness can receive is either mapped to exactly
 *   one normalized event with the payload fields the engine reads, or declined
 *   (null). Raw Opencode event names must never leak past the boundary.
 */

describe("OPENCODE_EVENT_TO_NORMALIZED rename table", () => {
	it("contains only normalized target names", () => {
		for (const target of OPENCODE_EVENT_TO_NORMALIZED.values()) {
			expect(
				isNormalizedAgentEvent(target),
				`${target} is not in AGENT_EVENT_NAMES`,
			).toBe(true);
		}
	});

	it("maps session.idle to run_finished", () => {
		expect(OPENCODE_EVENT_TO_NORMALIZED.get("session.idle")).toBe("run_finished");
	});

	it("maps session.error to run_error", () => {
		expect(OPENCODE_EVENT_TO_NORMALIZED.get("session.error")).toBe("run_error");
	});
});

describe("translateOpencodeEvent — session lifecycle events", () => {
	it("maps session.idle to run_finished", () => {
		const event = translateOpencodeEvent({
			type: "session.idle",
			properties: { sessionID: "ses-1" },
		});
		expect(event).toEqual({ type: "run_finished", sessionID: "ses-1" });
	});

	it("maps session.error to run_error preserving the error payload", () => {
		const event = translateOpencodeEvent({
			type: "session.error",
			properties: {
				sessionID: "ses-1",
				error: { name: "ProviderAuthError", message: "bad key" },
			},
		});
		expect(event.type).toBe("run_error");
		expect(event.error).toEqual({ name: "ProviderAuthError", message: "bad key" });
	});

	it("maps session.status busy to run_started", () => {
		const event = translateOpencodeEvent({
			type: "session.status",
			properties: { sessionID: "ses-1", status: { type: "busy" } },
		});
		expect(event).toEqual({ type: "run_started" });
	});

	it("declines session.status retry (transient, must not fail the run)", () => {
		const event = translateOpencodeEvent({
			type: "session.status",
			properties: {
				sessionID: "ses-1",
				status: { type: "retry", attempt: 2, message: "rate limited", next: 42 },
			},
		});
		expect(event).toBeNull();
	});

	it("declines session.status idle (run_finished comes from session.idle)", () => {
		const event = translateOpencodeEvent({
			type: "session.status",
			properties: { sessionID: "ses-1", status: { type: "idle" } },
		});
		expect(event).toBeNull();
	});

	it("declines session.created, session.updated and session.deleted", () => {
		expect(
			translateOpencodeEvent({ type: "session.created", properties: { info: { id: "s" } } }),
		).toBeNull();
		expect(
			translateOpencodeEvent({ type: "session.updated", properties: { info: { id: "s" } } }),
		).toBeNull();
		expect(
			translateOpencodeEvent({ type: "session.deleted", properties: { info: { id: "s" } } }),
		).toBeNull();
	});

	it("declines session.compacted (no compact capability in the engine vocabulary)", () => {
		expect(
			translateOpencodeEvent({ type: "session.compacted", properties: { sessionID: "s" } }),
		).toBeNull();
	});
});

describe("translateOpencodeEvent — message.updated", () => {
	it("maps a still-streaming assistant message to message_started", () => {
		const info = {
			id: "msg-1",
			role: "assistant",
			sessionID: "ses-1",
			modelID: "mock-model",
			providerID: "mock-provider",
			time: { created: 1 },
		};
		const event = translateOpencodeEvent({
			type: "message.updated",
			properties: { info },
		});
		expect(event.type).toBe("message_started");
		expect(event.message).toEqual(info);
	});

	it("declines a completed assistant message without counters (completion is session.idle's job)", () => {
		const event = translateOpencodeEvent({
			type: "message.updated",
			properties: {
				info: { id: "msg-1", role: "assistant", time: { created: 1, completed: 2 } },
			},
		});
		expect(event).toBeNull();
	});

	it("recovers telemetry from a completed assistant message with tokens", () => {
		const event = translateOpencodeEvent({
			type: "message.updated",
			properties: {
				info: {
					id: "msg-1",
					role: "assistant",
					time: { created: 1, completed: 2 },
					modelID: "gpt-5",
					providerID: "openai",
					cost: 0.01,
					tokens: {
						input: 100,
						output: 20,
						reasoning: 5,
						cache: { read: 10, write: 0 },
					},
				},
			},
		});
		expect(event.type).toBe("usage_updated");
		expect(event.usage).toEqual({
			inputTokens: 100,
			outputTokens: 20,
			cachedTokens: 10,
			totalTokens: 120,
			costUsd: 0.01,
		});
		expect(event.model).toBe("openai/gpt-5");
	});

	it("declines user message updates", () => {
		const event = translateOpencodeEvent({
			type: "message.updated",
			properties: { info: { id: "msg-0", role: "user", time: { created: 1 } } },
		});
		expect(event).toBeNull();
	});
});

describe("translateOpencodeEvent — message.part.updated", () => {
	it("maps a text delta to assistant_delta with the pi-ai text_delta protocol", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: { id: "prt-1", type: "text", text: "Hello", sessionID: "s", messageID: "m" },
				delta: "Hello",
			},
		});
		expect(event.type).toBe("assistant_delta");
		expect(event.delta).toBe("Hello");
		expect(event.assistantMessageEvent).toEqual({
			type: "text_delta",
			delta: "Hello",
		});
	});

	it("maps a reasoning delta to a thinking_delta assistant delta", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: { id: "prt-2", type: "reasoning", text: "thinking", sessionID: "s", messageID: "m" },
				delta: "thinking",
			},
		});
		expect(event.type).toBe("assistant_delta");
		expect(event.assistantMessageEvent).toEqual({
			type: "thinking_delta",
			delta: "thinking",
		});
	});

	it("emits a text_end marker for a finished text part without a delta", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: {
					id: "prt-1",
					type: "text",
					text: "Hello",
					time: { start: 1, end: 2 },
					sessionID: "s",
					messageID: "m",
				},
			},
		});
		expect(event.type).toBe("assistant_delta");
		expect(event.assistantMessageEvent).toEqual({ type: "text_end" });
	});

	it("declines a text part snapshot that has neither delta nor completion", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: { id: "prt-1", type: "text", text: "partial", sessionID: "s", messageID: "m" },
			},
		});
		expect(event).toBeNull();
	});

	it("maps a pending tool part to tool_started with toolName/toolCallId/args", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: {
					id: "prt-3",
					type: "tool",
					callID: "call-1",
					tool: "bash",
					state: { status: "pending", input: { command: "ls" }, raw: "" },
				},
			},
		});
		expect(event).toEqual({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "call-1",
			args: { command: "ls" },
		});
	});

	it("maps a running tool part to tool_started", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: {
					id: "prt-3",
					type: "tool",
					callID: "call-1",
					tool: "bash",
					state: { status: "running", input: { command: "ls" }, time: { start: 1 } },
				},
			},
		});
		expect(event.type).toBe("tool_started");
	});

	it("maps a completed tool part to tool_finished with the output as result", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: {
					id: "prt-3",
					type: "tool",
					callID: "call-1",
					tool: "bash",
					state: {
						status: "completed",
						input: { command: "ls" },
						output: "file.txt",
						title: "ls",
						metadata: {},
						time: { start: 1, end: 2 },
					},
				},
			},
		});
		expect(event).toEqual({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "call-1",
			args: { command: "ls" },
			result: "file.txt",
			isError: false,
		});
	});

	it("maps an errored tool part to a failed tool_finished with isError", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: {
					id: "prt-3",
					type: "tool",
					callID: "call-1",
					tool: "bash",
					state: {
						status: "error",
						input: { command: "ls" },
						error: "permission denied",
						time: { start: 1, end: 2 },
					},
				},
			},
		});
		expect(event.type).toBe("tool_finished");
		expect(event.isError).toBe(true);
		expect(event.error).toBe("permission denied");
	});

	it("declines non-text, non-tool parts (files, snapshots, agent parts…)", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: { part: { id: "prt-4", type: "file", mime: "text/plain" } },
		});
		expect(event).toBeNull();
	});

	it("declines a part payload that is missing", () => {
		expect(
			translateOpencodeEvent({ type: "message.part.updated", properties: {} }),
		).toBeNull();
	});
});

describe("translateOpencodeEvent — permission and step-finish telemetry", () => {
	it("maps permission.updated to a permission_requested audit event", () => {
		const event = translateOpencodeEvent({
			type: "permission.updated",
			properties: {
				id: "perm-1",
				type: "bash",
				pattern: "rm -rf /tmp/x",
				title: "Run rm",
				sessionID: "s",
				messageID: "m",
			},
		});
		expect(event.type).toBe("permission_requested");
		expect(event.method).toBe("bash");
		expect(event.target).toBe("rm -rf /tmp/x");
		expect(event.permissionId).toBe("perm-1");
	});

	it("maps permission.replied to a permission_resolved audit event", () => {
		const event = translateOpencodeEvent({
			type: "permission.replied",
			properties: { sessionID: "s", permissionID: "perm-1", response: "allow" },
		});
		expect(event.type).toBe("permission_resolved");
		expect(event.decision).toBe("allow");
		expect(event.target).toBe("perm-1");
	});

	it("maps a step-finish part to usage_updated with tokens and cost", () => {
		const event = translateOpencodeEvent({
			type: "message.part.updated",
			properties: {
				part: {
					id: "prt-9",
					type: "step-finish",
					reason: "stop",
					cost: 0.02,
					tokens: { input: 50, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
					sessionID: "s",
					messageID: "m",
				},
			},
		});
		expect(event.type).toBe("usage_updated");
		expect(event.usage.totalTokens).toBe(60);
		expect(event.usage.costUsd).toBe(0.02);
	});

	it("declines a step-finish part without counters", () => {
		expect(
			translateOpencodeEvent({
				type: "message.part.updated",
				properties: { part: { type: "step-finish", reason: "stop" } },
			}),
		).toBeNull();
	});
});

describe("translateOpencodeEvent — unmapped raw events decline", () => {
	it("declines bookkeeping and UI events the engine has no use for", () => {
		const declined = [
			"message.removed",
			"message.part.removed",
			"file.edited",
			"file.watcher.updated",
			"todo.updated",
			"command.executed",
			"installation.updated",
			"lsp.client.diagnostics",
			"server.connected",
			"pty.exited",
			"tui.toast.show",
		];
		for (const type of declined) {
			expect(translateOpencodeEvent({ type, properties: {} })).toBeNull();
		}
	});

	it("declines completely unknown event names", () => {
		expect(translateOpencodeEvent({ type: "brand.new.event", properties: {} })).toBeNull();
	});
});

describe("translateOpencodeEvent — malformed input", () => {
	it("declines null, undefined, primitives and objects without a type", () => {
		expect(translateOpencodeEvent(null)).toBeNull();
		expect(translateOpencodeEvent(undefined)).toBeNull();
		expect(translateOpencodeEvent("session.idle")).toBeNull();
		expect(translateOpencodeEvent(42)).toBeNull();
		expect(translateOpencodeEvent({})).toBeNull();
		expect(translateOpencodeEvent({ properties: {} })).toBeNull();
	});

	it("tolerates missing properties on mapped events", () => {
		const event = translateOpencodeEvent({ type: "session.idle" });
		expect(event.type).toBe("run_finished");
	});
});

describe("translateOpencodeEvent — boundary guarantee", () => {
	it("every returned event type belongs to the normalized vocabulary", () => {
		const rawEvents = [
			{ type: "session.idle", properties: {} },
			{ type: "session.error", properties: { error: { message: "x" } } },
			{ type: "session.status", properties: { status: { type: "busy" } } },
			{
				type: "message.updated",
				properties: { info: { role: "assistant", time: {} } },
			},
			{
				type: "message.part.updated",
				properties: { part: { type: "text", text: "a" }, delta: "a" },
			},
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "tool",
						callID: "c",
						tool: "t",
						state: { status: "completed", output: "o", title: "", metadata: {}, input: {} },
					},
				},
			},
		];
		for (const raw of rawEvents) {
			const event = translateOpencodeEvent(raw);
			if (event === null) continue;
			expect(AGENT_EVENT_NAMES).toContain(event.type);
		}
	});

	it("never returns an event whose type is a raw Opencode event name", () => {
		const rawNames = [
			"session.idle",
			"session.error",
			"session.status",
			"message.updated",
			"message.part.updated",
		];
		for (const rawName of rawNames) {
			const event = translateOpencodeEvent({ type: rawName, properties: {} });
			if (event === null) continue;
			expect(event.type).not.toBe(rawName);
		}
	});
});