import { describe, it, expect, vi } from "vitest";
import { EventBridge } from "./eventBridge.js";

/**
 * MARK: EventBridge characterization tests
 * @description Pins the payload-shape handling of the event bridge that the
 *   harness-boundary refactor must preserve: extractToolOutput result-shape
 *   variants, stable-id reuse across an update-only stream, and user-message
 *   suppression. Black-box over broadcast socket messages only.
 */

function fakeSocket(readyState = 1) {
	const messages = [];
	return {
		readyState,
		messages,
		send: (data) => messages.push(data),
	};
}

/***
 * MARK: bridgeWithSocket
 * @description Creates a bridge with one subscribed open socket and returns both.
 ***/
function bridgeWithSocket() {
	const bridge = new EventBridge();
	const socket = fakeSocket();
	bridge.subscribe("proj-1", socket);
	return { bridge, socket };
}

describe("eventBridge characterization (extractToolOutput variants)", () => {
	it.each([
		["plain string result", { result: "plain text" }, "plain text"],
		["result.content as string", { result: { content: "string content" } }, "string content"],
		[
			"result.content as text blocks",
			{ result: { content: [{ type: "text", text: "one " }, { type: "text", text: "two" }] } },
			"one two",
		],
		["result.text", { result: { text: "text field" } }, "text field"],
		["partialResult precedence", { result: "ignored", partialResult: "streamed partial" }, "streamed partial"],
	])("extracts output from %s", (_label, payload, expected) => {
		const bridge = new EventBridge();
		expect(bridge.extractToolOutput(payload)).toBe(expected);
	});

	it("returns empty string for empty payloads and non-text blocks", () => {
		const bridge = new EventBridge();
		expect(bridge.extractToolOutput(null)).toBe("");
		expect(bridge.extractToolOutput({ result: { content: [{ type: "image", url: "x" }] } })).toBe("");
	});

	it("concatenates string entries inside result.content arrays", () => {
		const bridge = new EventBridge();
		expect(
			bridge.extractToolOutput({ result: { content: ["raw one", { type: "text", text: "raw two" }] } }),
		).toBe("raw oneraw two");
	});
});

describe("eventBridge characterization (stable ids)", () => {
	it("reuses one stable id across a message_update-only stream (no message_start)", () => {
		const { bridge, socket } = bridgeWithSocket();

		bridge.handleAgentEvent("proj-1", "message_update", {
			assistantMessageEvent: { delta: "first" },
		});
		bridge.handleAgentEvent("proj-1", "message_update", {
			assistantMessageEvent: { delta: "second" },
		});
		bridge.handleAgentEvent("proj-1", "agent_end", {});

		const parsed = socket.messages.map((m) => JSON.parse(m));
		const ids = parsed.map((m) => m.payload.id);
		expect(new Set(ids).size).toBe(1);
	});

	it("honors an explicit caller-supplied id on message_start", () => {
		const { bridge, socket } = bridgeWithSocket();

		bridge.handleAgentEvent("proj-1", "message_start", { id: "custom-1" });
		bridge.handleAgentEvent("proj-1", "message_update", { delta: "text" });

		const parsed = socket.messages.map((m) => JSON.parse(m));
		expect(parsed[0].payload.id).toBe("custom-1");
		expect(parsed[1].payload.id).toBe("custom-1");
	});
});

describe("eventBridge characterization (normalized vocabulary)", () => {
	it.each([
		["message_started", "MSG_START"],
		["assistant_delta", "MSG_UPDATE"],
		["tool_started", "TOOL_START"],
		["tool_updated", "TOOL_UPDATE"],
		["tool_finished", "TOOL_END"],
		["run_finished", "AGENT_DONE"],
	])("maps normalized '%s' to %s", (normalized, uiAction) => {
		const bridge = new EventBridge();
		expect(bridge.mapEventToUIAction(normalized)).toBe(uiAction);
	});

	it.each(["run_started", "run_error"])(
		"leaves normalized '%s' unmapped exactly like its legacy counterpart",
		(normalized) => {
			const bridge = new EventBridge();
			expect(bridge.mapEventToUIAction(normalized)).toBeNull();
		},
	);

	it("delivers the SAME payloads for normalized and legacy event names", async () => {
		// Bridges mint stream ids as `msg-<n>-<Date.now()>`. Two independent
		// bridges can straddle a millisecond boundary and mint different suffixes,
		// so freeze the clock: the comparison must verify payload equivalence
		// between the legacy and normalized paths, not wall-clock timing.
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			await compareLegacyAndNormalizedPayloads();
		} finally {
			vi.useRealTimers();
		}
	});

	/***
	 * MARK: compareLegacyAndNormalizedPayloads
	 * @description Drives the same assistant stream through two fresh bridges —
	 *   one via legacy raw pi event names, one via the normalized vocabulary —
	 *   and asserts both sockets received identical typed payloads.
	 ***/
	async function compareLegacyAndNormalizedPayloads() {
		const legacy = new EventBridge();
		const normalized = new EventBridge();
		const legacySocket = fakeSocket();
		const normalizedSocket = fakeSocket();
		legacy.subscribe("p1", legacySocket);
		normalized.subscribe("p1", normalizedSocket);

		const legacyStream = [
			["message_start", { message: { role: "assistant", content: [] } }],
			["message_update", { assistantMessageEvent: { delta: "hello" } }],
			["agent_end", {}],
		];
		const normalizedStream = [
			["message_started", { message: { role: "assistant", content: [] } }],
			["assistant_delta", { assistantMessageEvent: { delta: "hello" } }],
			["run_finished", {}],
		];
		for (const [name, payload] of legacyStream) {
			await legacy.handleAgentEvent("p1", name, payload);
		}
		for (const [name, payload] of normalizedStream) {
			await normalized.handleAgentEvent("p1", name, payload);
		}

		const stripTimestamp = (m) => {
			const parsed = JSON.parse(m);
			return { type: parsed.type, payload: parsed.payload };
		};
		expect(legacySocket.messages.map(stripTimestamp)).toEqual(
			normalizedSocket.messages.map(stripTimestamp),
		);
	}

	it("suppresses user-role message_started like legacy message_start", () => {
		const { bridge, socket } = bridgeWithSocket();

		bridge.handleAgentEvent("proj-1", "message_started", {
			message: { role: "user", content: "prompt" },
		});

		expect(socket.messages).toHaveLength(0);
	});

	it("emits the structured tool invocation system log for normalized tool_started", () => {
		const { bridge, socket } = bridgeWithSocket();

		bridge.handleAgentEvent("proj-1", "tool_started", {
			toolCallId: "c1",
			toolName: "edit",
			args: { path: "/a.ts" },
		});

		const parsed = socket.messages.map((m) => JSON.parse(m));
		const systemLog = parsed.find((m) => m.type === "PROCESS_STDOUT");
		expect(systemLog?.payload?.log).toContain("Tool invocation: edit");
	});
});

describe("eventBridge characterization (user message suppression)", () => {
	it("suppresses user-role message_start but keeps the assistant stream flowing", () => {
		const { bridge, socket } = bridgeWithSocket();

		bridge.handleAgentEvent("proj-1", "message_start", {
			message: { role: "user", content: "prompt" },
		});
		bridge.handleAgentEvent("proj-1", "message_start", {
			message: { role: "assistant", content: [] },
		});
		bridge.handleAgentEvent("proj-1", "message_update", {
			assistantMessageEvent: { delta: "answer" },
		});

		const parsed = socket.messages.map((m) => JSON.parse(m));
		// user message_start dropped; assistant start + update delivered.
		expect(parsed).toHaveLength(2);
		expect(parsed[0].type).toBe("MSG_START");
		expect(parsed[1].type).toBe("MSG_UPDATE");
		expect(parsed[1].payload.content).toBe("answer");
	});
});