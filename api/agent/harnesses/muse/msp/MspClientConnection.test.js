import { describe, it, expect, vi } from "vitest";
import {
	MspClientConnection,
	createMspFrameParser,
	encodeMspFrame,
	MSP_CLOSED_CODE,
	MSP_TIMEOUT_CODE,
} from "./MspClientConnection.js";

/** Builds a connection whose sent lines are captured, plus a reply helper. */
function makeConnection() {
	const sent = [];
	const notifications = [];
	const requests = [];
	const conn = new MspClientConnection({
		sendLine: (line) => sent.push(line),
		onNotification: (method, params) => notifications.push({ method, params }),
		onRequest: async (method, params) => {
			requests.push({ method, params });
			return { result: { handled: true } };
		},
	});
	return { conn, sent, notifications, requests, parsed: () => sent.map((l) => JSON.parse(l)) };
}

describe("MspClientConnection", () => {
	it("encodes params-free frames without a null params member", () => {
		expect(encodeMspFrame({ jsonrpc: "2.0", method: "initialized", params: {} })).toBe(
			'{"jsonrpc":"2.0","method":"initialized"}\n',
		);
	});

	it("attaches a UUIDv7 commandId only to commands", () => {
		const { conn, parsed } = makeConnection();
		void conn.request("turn/start", { sessionId: "s1" }, { command: true });
		void conn.request("model/list", {}, {});
		const frames = parsed();
		expect(frames[0].params.commandId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		);
		// An empty params object is dropped entirely on the wire.
		expect(frames[1].params).toBeUndefined();
	});

	it("resolves a request with the host result and rejects on error", async () => {
		const { conn, parsed } = makeConnection();
		const ok = conn.request("model/list", {});
		conn.handleLine({ jsonrpc: "2.0", id: parsed()[0].id, result: { models: [] } });
		await expect(ok).resolves.toEqual({ models: [] });

		const failing = conn.request("turn/start", {});
		conn.handleLine({
			jsonrpc: "2.0",
			id: parsed()[1].id,
			error: { code: -32030, message: "already_terminal" },
		});
		await expect(failing).rejects.toThrow(/already_terminal/);
	});

	it("times out a request and rejects every pending request on close", async () => {
		vi.useFakeTimers();
		try {
			const { conn } = makeConnection();
			const timedOut = conn.request("turn/start", {}, { timeoutMs: 50 });
			vi.advanceTimersByTime(60);
			await expect(timedOut).rejects.toMatchObject({ code: MSP_TIMEOUT_CODE });

			const pending = conn.request("turn/start", {});
			conn.close("host died");
			await expect(pending).rejects.toMatchObject({ code: MSP_CLOSED_CODE });
		} finally {
			vi.useRealTimers();
		}
	});

	it("answers server→client requests while notifications stream", async () => {
		const { conn, sent, notifications, requests } = makeConnection();
		conn.handleLine({
			jsonrpc: "2.0",
			id: "srv-1",
			method: "approval/request",
			params: { approvalId: "a1" },
		});
		conn.handleLine({ jsonrpc: "2.0", method: "item/delta", params: { delta: "x" } });
		await vi.waitFor(() => expect(sent.length).toBe(1));
		expect(requests[0].method).toBe("approval/request");
		expect(notifications).toHaveLength(1);
		expect(JSON.parse(sent[0]).result).toEqual({ handled: true });
	});

	it("answers a request with method-not-found when no handler exists", async () => {
		const sent = [];
		const conn = new MspClientConnection({ sendLine: (line) => sent.push(line) });
		conn.handleLine({ jsonrpc: "2.0", id: "srv-2", method: "mystery", params: {} });
		await vi.waitFor(() => expect(sent.length).toBe(1));
		expect(JSON.parse(sent[0]).error.code).toBe(-32601);
	});

	it("counts and ignores malformed frames", () => {
		const { conn } = makeConnection();
		conn.handleLine(null);
		conn.handleLine({ jsonrpc: "2.0" });
		expect(conn.counters.ignored).toBe(1);
	});
});

describe("createMspFrameParser", () => {
	it("frames split lines and skips noise without throwing", () => {
		const parser = createMspFrameParser();
		expect(parser.push('{"a":1}\n{"b":')).toEqual([{ a: 1 }]);
		expect(parser.push('2}\nnot json\n{"c":3}\r\n')).toEqual([{ b: 2 }, { c: 3 }]);
		expect(parser.flush()).toEqual([]);
	});

	it("collects a trailing unterminated frame on flush", () => {
		const parser = createMspFrameParser();
		expect(parser.push('{"d":4}')).toEqual([]);
		expect(parser.flush()).toEqual([{ d: 4 }]);
	});

	it("discards an oversized line without buffering it whole and keeps framing", () => {
		const parser = createMspFrameParser({ maxLineBytes: 64 });
		const huge = `{"big":"${"x".repeat(500)}"}`;
		expect(parser.push(huge)).toEqual([]);
		expect(parser.push("\n")).toEqual([]);
		// The next well-formed line still parses: framing stayed in sync.
		expect(parser.push('{"ok":true}\n')).toEqual([{ ok: true }]);
	});
});
