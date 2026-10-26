import { describe, it, expect } from "vitest";
import { EventBridge } from "./eventBridge.js";

/**
 * MARK: EventBridge unit tests
 * @description Verifies the WebSocket event fan-out: subscribe/unsubscribe,
 * the agent-event -> UI-action mapping, broadcasting to open sockets, and
 * session cleanup.
 */

function fakeSocket(readyState = 1) {
	const messages = [];
	return {
		readyState,
		messages,
		send: (data) => messages.push(data),
	};
}

describe("EventBridge", () => {
	it("subscribes a socket and records it for a session", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		expect(bridge.subscriptions.get("proj-1").has(socket)).toBe(true);
	});

	it("unsubscribe drops the socket and deletes the session entry when empty", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		bridge.unsubscribe("proj-1", socket);
		expect(bridge.subscriptions.has("proj-1")).toBe(false);
	});

	it("maps known agent, process, and stage events to the expected UI actions", () => {
		const bridge = new EventBridge();
		const cases = [
			["message_start", "MSG_START"],
			["message_update", "MSG_UPDATE"],
			["tool_execution_start", "TOOL_START"],
			["tool_execution_update", "TOOL_UPDATE"],
			["tool_execution_end", "TOOL_END"],
			["agent_end", "AGENT_DONE"],
			["streaming_update", "STREAMING_UPDATE"],
			// Process events
			["process:start", "PROCESS_START"],
			["process:stdout", "PROCESS_STDOUT"],
			["process:stderr", "PROCESS_STDERR"],
			["process:exit", "PROCESS_EXIT"],
			["process_stdout", "PROCESS_STDOUT"],
			// Stage transitions
			["stage:enter", "STAGE_ENTER"],
			["stage:checkpoint_wait", "STAGE_CHECKPOINT_WAIT"],
			["stage:complete", "STAGE_COMPLETE"],
			["stage:failback", "STAGE_FAILBACK"],
			["stage_complete", "STAGE_COMPLETE"],
		];
		for (const [event, action] of cases) {
			expect(bridge.mapEventToUIAction(event)).toBe(action);
		}
	});

	it("returns null for unknown events (no UI action)", () => {
		const bridge = new EventBridge();
		expect(bridge.mapEventToUIAction("mystery_event")).toBeNull();
	});

	it("handleAgentEvent broadcasts the mapped message to open sockets", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		bridge.handleAgentEvent("proj-1", "message_start", { id: "m1" });

		expect(socket.messages).toHaveLength(1);
		const parsed = JSON.parse(socket.messages[0]);
		expect(parsed.type).toBe("MSG_START");
		expect(parsed.sessionId).toBe("proj-1");
		expect(parsed.payload.id).toBe("m1");
		expect(parsed.timestamp).toBeTruthy();
	});

	it("emitProcessEvent broadcasts process streaming events to open sockets", async () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		await bridge.emitProcessEvent("proj-1", "process:stdout", {
			taskId: "t-1",
			chunk: "Building output...",
		});

		expect(socket.messages).toHaveLength(1);
		const parsed = JSON.parse(socket.messages[0]);
		expect(parsed.type).toBe("PROCESS_STDOUT");
		expect(parsed.sessionId).toBe("proj-1");
		expect(parsed.payload.chunk).toBe("Building output...");
	});

	it("broadcast sends typed payload directly to open sockets", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		bridge.broadcast("proj-1", "STAGE_CHECKPOINT_WAIT", {
			taskId: "t-1",
			message: "Awaiting human approval",
		});

		expect(socket.messages).toHaveLength(1);
		const parsed = JSON.parse(socket.messages[0]);
		expect(parsed.type).toBe("STAGE_CHECKPOINT_WAIT");
		expect(parsed.payload.message).toBe("Awaiting human approval");
	});

	it("does not send to sockets that are not OPEN", () => {
		const bridge = new EventBridge();
		const closedSocket = fakeSocket(3); // CLOSED
		bridge.subscribe("proj-1", closedSocket);
		bridge.handleAgentEvent("proj-1", "agent_end", {});
		expect(closedSocket.messages).toHaveLength(0);
	});

	it("does not broadcast unknown events", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		bridge.handleAgentEvent("proj-1", "unknown_event", {});
		expect(socket.messages).toHaveLength(0);
	});

	it("clearSession removes all subscriptions for a session", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);
		bridge.subscribe("proj-2", fakeSocket());
		bridge.clearSession("proj-1");
		expect(bridge.subscriptions.has("proj-1")).toBe(false);
		expect(bridge.subscriptions.has("proj-2")).toBe(true);
	});

	it("broadcastGlobal sends payload to all open sockets across all sessions", () => {
		const bridge = new EventBridge();
		const socketA = fakeSocket();
		const socketB = fakeSocket();
		bridge.subscribe("proj-1", socketA);
		bridge.subscribe("proj-2", socketB);

		bridge.broadcastGlobal("ENGINE_STATE", { status: "running", activeTaskId: "t1" });

		expect(socketA.messages).toHaveLength(1);
		expect(socketB.messages).toHaveLength(1);
		const parsedA = JSON.parse(socketA.messages[0]);
		expect(parsedA.type).toBe("ENGINE_STATE");
		expect(parsedA.payload.status).toBe("running");
	});

	it("emitSystemLog broadcasts [SYSTEM] logs and filters empty/whitespace messages", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		// Non-empty message
		bridge.emitSystemLog("proj-1", "[SYSTEM] Initializing agent session (harness: pi, Model: claude-3-7-sonnet)...", {
			taskId: "t-1",
		});
		expect(socket.messages).toHaveLength(1);
		const parsed = JSON.parse(socket.messages[0]);
		expect(parsed.type).toBe("PROCESS_STDOUT");
		expect(parsed.payload.chunk).toBe("[SYSTEM] Initializing agent session (harness: pi, Model: claude-3-7-sonnet)...");
		expect(parsed.payload.system).toBe(true);

		// Empty / whitespace messages should be dropped
		bridge.emitSystemLog("proj-1", "");
		bridge.emitSystemLog("proj-1", "   \n\t  ");
		bridge.emitSystemLog("proj-1", null);
		expect(socket.messages).toHaveLength(1);
	});

	it("handleAgentEvent for tool_execution_start emits structured [SYSTEM] tool invocation", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		bridge.handleAgentEvent("proj-1", "tool_execution_start", {
			toolName: "edit_file",
			args: { path: "api/taskStore.js" },
		});

		// 1 TOOL_START message + 1 PROCESS_STDOUT system log message
		expect(socket.messages).toHaveLength(2);
		const types = socket.messages.map((m) => JSON.parse(m).type);
		expect(types).toContain("TOOL_START");
		expect(types).toContain("PROCESS_STDOUT");

		const sysLog = socket.messages.map((m) => JSON.parse(m)).find((m) => m.type === "PROCESS_STDOUT");
		expect(sysLog.payload.chunk).toContain("[SYSTEM] Tool invocation: edit_file with arguments:");
		expect(sysLog.payload.chunk).toContain("api/taskStore.js");
	});

	it("emitProcessEvent drops empty and whitespace-only chunks", async () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		await bridge.emitProcessEvent("proj-1", "process:stdout", { chunk: "" });
		await bridge.emitProcessEvent("proj-1", "process:stdout", { chunk: "   \n " });
		expect(socket.messages).toHaveLength(0);

		await bridge.emitProcessEvent("proj-1", "process:stdout", { chunk: "Real output line" });
		expect(socket.messages).toHaveLength(1);
	});

	it("reuses a stable id across message_start/message_update/agent_end", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		bridge.handleAgentEvent("proj-1", "message_start", {
			message: { role: "assistant", content: [] },
		});
		bridge.handleAgentEvent("proj-1", "message_update", {
			assistantMessageEvent: { type: "text_delta", delta: "Hello" },
		});
		bridge.handleAgentEvent("proj-1", "message_update", {
			assistantMessageEvent: { type: "text_delta", delta: " world" },
		});
		bridge.handleAgentEvent("proj-1", "agent_end", {});

		const parsed = socket.messages.map((m) => JSON.parse(m));
		const ids = parsed.map((m) => m.payload.id);
		// All four events share one stable id.
		expect(new Set(ids).size).toBe(1);
		// The last (agent_end) clears the typing flag.
		expect(parsed.at(-1).payload.isTyping).toBe(false);
	});

	it("extracts streamed text from message_update deltas", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		bridge.handleAgentEvent("proj-1", "message_start", {
			message: { role: "assistant", content: [] },
		});
		bridge.handleAgentEvent("proj-1", "message_update", {
			assistantMessageEvent: { type: "text_delta", delta: "Reasoning" },
		});

		const update = socket.messages
			.map((m) => JSON.parse(m))
			.find((m) => m.type === "MSG_UPDATE");
		expect(update.payload.content).toBe("Reasoning");
	});

	it("skips message_start for user prompts (no blank placeholder)", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		bridge.handleAgentEvent("proj-1", "message_start", {
			message: { role: "user", content: "Do the thing" },
		});

		expect(socket.messages).toHaveLength(0);
	});

	it("reuses toolCallId across tool_execution_start/update/end and streams output", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		bridge.handleAgentEvent("proj-1", "tool_execution_start", {
			toolCallId: "call-1",
			toolName: "bash",
			args: { cmd: "ls" },
		});
		bridge.handleAgentEvent("proj-1", "tool_execution_update", {
			toolCallId: "call-1",
			toolName: "bash",
			partialResult: "file1\nfile2",
		});
		bridge.handleAgentEvent("proj-1", "tool_execution_end", {
			toolCallId: "call-1",
			toolName: "bash",
			result: { content: [{ type: "text", text: "done" }] },
			isError: false,
		});

		const parsed = socket.messages.map((m) => JSON.parse(m));
		const toolMsgs = parsed.filter((m) => m.type.startsWith("TOOL_"));
		const ids = toolMsgs.map((m) => m.payload.id);
		expect(new Set(ids).size).toBe(1);
		expect(ids[0]).toBe("call-1");

		const update = parsed.find((m) => m.type === "TOOL_UPDATE");
		expect(update.payload.log).toBe("file1\nfile2");

		const end = parsed.find((m) => m.type === "TOOL_END");
		expect(end.payload.finalOutput).toBe("done");
	});

	it("clearSession removes subscriptions and clears currentMessages cache", () => {
		const bridge = new EventBridge();
		const socket = fakeSocket();
		bridge.subscribe("proj-1", socket);

		// Populate currentMessages cache
		bridge.handleAgentEvent("proj-1", "message_start", {
			message: { role: "assistant", content: [] },
		});
		expect(bridge.currentMessages.has("proj-1")).toBe(true);
		expect(bridge.subscriptions.has("proj-1")).toBe(true);

		bridge.clearSession("proj-1");

		expect(bridge.subscriptions.has("proj-1")).toBe(false);
		expect(bridge.currentMessages.has("proj-1")).toBe(false);
	});

	it("handles multiple sessions created and cleared without lingering state", () => {
		const bridge = new EventBridge();
		for (let i = 0; i < 5; i++) {
			const sid = `sess-${i}`;
			const socket = fakeSocket();
			bridge.subscribe(sid, socket);
			bridge.handleAgentEvent(sid, "message_start", {
				message: { role: "assistant", content: [] },
			});
			expect(bridge.currentMessages.has(sid)).toBe(true);
			expect(bridge.subscriptions.has(sid)).toBe(true);
			bridge.clearSession(sid);
			expect(bridge.currentMessages.has(sid)).toBe(false);
			expect(bridge.subscriptions.has(sid)).toBe(false);
		}
		expect(bridge.subscriptions.size).toBe(0);
		expect(bridge.currentMessages.size).toBe(0);
	});
});


