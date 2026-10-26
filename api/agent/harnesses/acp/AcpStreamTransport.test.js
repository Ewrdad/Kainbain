import { describe, it, expect } from "vitest";
import { createAcpFrameParser, encodeAcpFrame } from "./AcpStreamTransport.js";

/**
 * MARK: AcpStreamTransport tests
 * @description Pure framing tests (no I/O, no clock): line splitting across
 *   chunk boundaries, CRLF/blank/noise tolerance, the oversized-line cap
 *   tripping incrementally, and flush() collecting a final unterminated line.
 */

describe("AcpStreamTransport framing", () => {
	it("round-trips one frame per line", () => {
		const parser = createAcpFrameParser();
		const frames = parser.push(
			`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" })}\n`,
		);
		expect(frames).toEqual([{ jsonrpc: "2.0", id: 1, method: "initialize" }]);
	});

	it("splits frames spread across chunk boundaries", () => {
		const parser = createAcpFrameParser();
		const line = `${JSON.stringify({ jsonrpc: "2.0", id: 7, result: { ok: true } })}\n`;
		const cut = Math.floor(line.length / 2);
		expect(parser.push(line.slice(0, cut))).toEqual([]);
		expect(parser.push(line.slice(cut))).toEqual([{ jsonrpc: "2.0", id: 7, result: { ok: true } }]);
	});

	it("tolerates CRLF, blank lines, and non-JSON noise without throwing", () => {
		const parser = createAcpFrameParser();
		const frames = parser.push(
			'{"jsonrpc":"2.0","id":1,"result":{}}\r\n\nsome stderr that leaked into stdout\n{"jsonrpc":"2.0","method":"session/update"}\n',
		);
		expect(frames).toHaveLength(2);
		expect(parser.stats()).toMatchObject({ lines: 4, frames: 2, skippedNoise: 1 });
	});

	it("skips non-object JSON values (arrays, scalars)", () => {
		const parser = createAcpFrameParser();
		expect(parser.push('[1,2]\n"str"\n42\n')).toEqual([]);
		expect(parser.stats().skippedNoise).toBe(3);
	});

	it("drops oversized lines incrementally and stays in sync", () => {
		const parser = createAcpFrameParser({ maxLineBytes: 64 });
		// The cap trips on the partial line — the whole 1 KiB line is never buffered.
		expect(parser.push("x".repeat(1024))).toEqual([]);
		// Its terminator arrives: counted once, framing re-syncs.
		expect(parser.push("\n")).toEqual([]);
		expect(parser.push('{"jsonrpc":"2.0"}\n')).toEqual([{ jsonrpc: "2.0" }]);
		expect(parser.stats().droppedOversized).toBe(1);
		expect(parser.stats().frames).toBe(1);
	});

	it("flush() collects a final unterminated line", () => {
		const parser = createAcpFrameParser();
		const line = '{"jsonrpc":"2.0","id":3}';
		expect(parser.push(line.slice(0, 10))).toEqual([]);
		expect(parser.push(line.slice(10))).toEqual([]);
		expect(parser.flush()).toEqual([{ jsonrpc: "2.0", id: 3 }]);
		expect(parser.flush()).toEqual([]);
	});

	it("encodeAcpFrame produces newline-terminated wire lines", () => {
		const frame = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
		expect(encodeAcpFrame(frame)).toBe(`${JSON.stringify(frame)}\n`);
	});
});
