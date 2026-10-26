import { describe, it, expect } from "vitest";
import { createMuseStreamParser } from "./museStreamParser.js";

function envelope(payloadType, payload = {}, recordType = "event") {
	return JSON.stringify({
		schema_version: 1,
		sequence: 1,
		record_type: recordType,
		durability: "durable",
		payload_type: payloadType,
		payload,
	});
}

describe("muse stream parser", () => {
	it("parses payload_type rows (keyed on payload_type, not record_type)", () => {
		const parser = createMuseStreamParser();
		// run.output.delta arrives as record_type "status" — a record_type
		// filter would drop it (F-02). The parser must keep it.
		const rows = parser.push(
			`${envelope("run.output.delta", { text: "hi" }, "status")}\n`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].payloadType).toBe("run.output.delta");
		expect(rows[0].payload.text).toBe("hi");
	});

	it("tolerates CRLF, blank lines, and noise lines", () => {
		const parser = createMuseStreamParser();
		const rows = parser.push(
			`NOT JSON\r\n\r\n${envelope("run.lifecycle.started", { kind: "run_started" })}\r\n`,
		);
		expect(rows).toHaveLength(1);
		expect(parser.stats().skippedNoise).toBe(1);
	});

	it("drops oversized lines and unknown payload types without throwing", () => {
		const tiny = createMuseStreamParser({ maxLineBytes: 64 });
		const big = envelope("run.output.delta", { text: "x".repeat(200) });
		expect(tiny.push(`${big}\n`)).toEqual([]);
		expect(tiny.stats().droppedOversized).toBe(1);
		const parser = createMuseStreamParser();
		const unknown = parser.push(
			`${envelope("future.new.payload", {})}\n`,
		);
		expect(unknown).toEqual([]);
		expect(parser.stats().droppedUnknown).toBe(1);
	});

	it("handles split chunks and flushes a final unterminated line", () => {
		const parser = createMuseStreamParser();
		const line = envelope("run.terminal.completed", { text: "done" });
		const half = Math.floor(line.length / 2);
		expect(parser.push(line.slice(0, half))).toEqual([]);
		const rows = parser.push(`${line.slice(half)}\n`);
		expect(rows).toHaveLength(1);
		expect(rows[0].payloadType).toBe("run.terminal.completed");
		const tail = parser.push(envelope("run.lifecycle.started", {}));
		expect(tail).toEqual([]);
		expect(parser.flush()).toHaveLength(1);
	});
});
