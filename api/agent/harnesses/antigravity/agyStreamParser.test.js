import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgyStreamParser, AGY_STREAM_EVENT_NAMES } from "./agyStreamParser.js";

/**
 * MARK: agyStreamParser tests
 * @description Proves the incremental NDJSON parser: chunk-boundary splitting
 *   (no event ever lost), CRLF tolerance, blank/noise lines skipped without
 *   throwing, oversized-line drop, and that every fixture round-trips to the
 *   expected parsed rows. Fixtures mirror the documented stream-JSON shapes
 *   (antigravity.google/docs/cli/headless); when a real agy is available the
 *   fixtures can be re-captured and re-diffed as an extra conformance check.
 */

const FIXTURES_DIR = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"fixtures",
);

/** Reads a fixture as a string. */
function readFixture(name) {
	/* eslint-disable security/detect-non-literal-fs-filename -- fixture paths are compile-time constants in this module */
	return fs.readFileSync(path.join(FIXTURES_DIR, `${name}.ndjson`), "utf8");
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/** Parses a full fixture text through push+flush and returns the rows. */
function parseFixture(name) {
	const parser = createAgyStreamParser();
	const rows = [];
	rows.push(...parser.push(readFixture(name)));
	rows.push(...parser.flush());
	return rows;
}

/** Feeds a text in fixed-size chunks (including sub-line sizes). */
function parseInChunks(text, chunkSize) {
	const parser = createAgyStreamParser();
	const rows = [];
	for (let i = 0; i < text.length; i += chunkSize) {
		rows.push(...parser.push(text.slice(i, i + chunkSize)));
	}
	rows.push(...parser.flush());
	return rows;
}

describe("agy stream parser", () => {
	it("exposes exactly the documented agy event discriminators", () => {
		expect([...AGY_STREAM_EVENT_NAMES]).toEqual(["init", "step_update", "result"]);
	});

	it("parses the success fixture into typed rows in order", () => {
		const rows = parseFixture("success");
		expect(rows.map((row) => row.event)).toEqual([
			"init",
			"step_update",
			"step_update",
			"step_update",
			"step_update",
			"result",
		]);
		const init = rows[0];
		expect(init.conversationId).toBe("conv-success-1");
		expect(init.payload.permission_mode).toBe("request-review");
		expect(init.payload.model).toBe("gemini-3.8-flash-high");
		const delta = rows[2];
		expect(delta.stepType).toBe("agent_response");
		expect(delta.stepIndex).toBe(2);
		expect(delta.state).toBe("ACTIVE");
		expect(delta.payload.text_delta).toBe("Plan: ");
		const result = rows.at(-1);
		expect(result.payload.status).toBe("SUCCESS");
		expect(result.payload.response).toBe("Plan: write the harness");
		expect(result.payload.usage.total_tokens).toBe(165);
	});

	it("never loses an event split across chunk boundaries", () => {
		const text = readFixture("success");
		for (const chunkSize of [1, 7, 64, 1024]) {
			const rows = parseInChunks(text, chunkSize);
			expect(rows.map((row) => row.event)).toEqual([
				"init",
				"step_update",
				"step_update",
				"step_update",
				"step_update",
				"result",
			]);
		}
	});

	it("tolerates CRLF line endings", () => {
		const parser = createAgyStreamParser();
		const events = parser.push('{"event":"init","conversation_id":"c1","init":{"cwd":"/w"}}\r\n');
		expect(events).toHaveLength(1);
		expect(events[0].event).toBe("init");
	});

	it("skips blank lines, garbage lines and non-object JSON without throwing", () => {
		const parser = createAgyStreamParser();
		const events = parser.push(
			[
				"",
				"   ",
				"[gyd] WARNING: something non-json",
				"42",
				"[1, 2, 3]",
				'{"not":"an agy event"}',
				'{"event":"telemetry","ok":true}',
				'{"event":"result","conversation_id":"c9","status":"SUCCESS","response":"ok"}',
			].join("\n") + "\n",
		);
		expect(events).toHaveLength(1);
		expect(events[0].event).toBe("result");
		const stats = parser.stats();
		// Blank lines are silently skipped (uncounted); noise and non-object JSON
		// are counted separately from unknown event types.
		expect(stats.skippedNoise).toBe(3); // warning line, 42, [1,2,3]
		expect(stats.droppedUnknown).toBe(2); // no-discriminator object, telemetry
	});

	it("round-trips every fixture (noise fixture survives the noise)", () => {
		const toolRows = parseFixture("tool-call");
		expect(toolRows.filter((row) => row.stepType === "tool")).toHaveLength(4);
		expect(toolRows.at(-1).payload.status).toBe("SUCCESS");

		const errorRows = parseFixture("error-status");
		expect(errorRows.at(-1).payload.status).toBe("ERROR");
		expect(errorRows.at(-1).payload.error).toBe("Model quota exceeded");

		const noiseRows = parseFixture("noise-lines");
		// The valid events survive the interleaved noise in order.
		expect(noiseRows.map((row) => row.event)).toEqual(["init", "step_update", "result"]);
		expect(noiseRows.at(-1).event).toBe("result");
		expect(noiseRows.at(0).event).toBe("init");
	});

	it("parses the partial-lines fixture including a final line without a newline", () => {
		const rows = parseFixture("partial-lines");
		expect(rows.map((row) => row.event)).toEqual(["init", "step_update", "step_update", "step_update", "result"]);
		// The final line has NO trailing newline — only flush() completes it.
		expect(rows.at(-1).payload.status).toBe("SUCCESS");
	});

	it("survives arbitrary chunk splits of the partial-lines fixture", () => {
		const text = readFixture("partial-lines");
		for (const chunkSize of [3, 11, 100]) {
			const rows = parseInChunks(text, chunkSize);
			expect(rows.map((row) => row.event)).toEqual(["init", "step_update", "step_update", "step_update", "result"]);
		}
	});

	it("drops a single oversized line without unbounded buffering", () => {
		const parser = createAgyStreamParser({ maxLineBytes: 256 });
		const oversized = `{"event":"result","payload":"${"x".repeat(4096)}"}\n`;
		const events = parser.push(oversized);
		expect(events).toHaveLength(0);
		// Framing stays in sync: the next line still parses.
		const after = parser.push('{"event":"result","conversation_id":"c2","status":"SUCCESS"}\n');
		expect(after).toHaveLength(1);
		expect(parser.stats().droppedOversized).toBe(1);
	});

	it("drops an oversized line even when it never terminates within one push", () => {
		const parser = createAgyStreamParser({ maxLineBytes: 64 });
		// First push: giant line without newline (must not grow the buffer).
		expect(parser.push(`{"junk":"${"y".repeat(500)}`)).toEqual([]);
		// Termination arrives later; the oversized line is dropped, not parsed.
		expect(parser.push(' more"\n{"event":"init"}\n')).toEqual([
			expect.objectContaining({ event: "init" }),
		]);
	});

	it("merges nested payload keys over flat fields", () => {
		const parser = createAgyStreamParser();
		const [init] = parser.push('{"event":"init","init":{"permission_mode":"request-review"},"conversation_id":"c1"}\n');
		expect(init.payload.permission_mode).toBe("request-review");
	});

	it("parses a 512KB line delivered in 64KB chunks well under a time budget (no quadratic buffering)", () => {
		// Regression guard: push() used to buffer character-by-character with a
		// per-char byteLength — quadratic in line size (512KB took ~75s and froze
		// the event loop). Real tool_info.output reaches hundreds of KB.
		const bigLine =
			JSON.stringify({
				event: "step_update",
				conversation_id: "c",
				step_index: 1,
				state: "ACTIVE",
				step_type: "agent_response",
				text_delta: "x".repeat(512 * 1024),
			}) + "\n";
		const parser = createAgyStreamParser(); // default 1MiB cap: the line PARSES
		const started = performance.now();
		const rows = [];
		for (let i = 0; i < bigLine.length; i += 64 * 1024) {
			rows.push(...parser.push(bigLine.slice(i, i + 64 * 1024)));
		}
		rows.push(...parser.flush());
		const elapsedMs = performance.now() - started;
		expect(rows).toHaveLength(1);
		expect(rows[0].payload.text_delta).toHaveLength(512 * 1024);
		expect(elapsedMs).toBeLessThan(500); // linear impl: ~ms; quadratic: tens of seconds
	});

	it("drops a 2MiB oversized line streamed in 64KB chunks quickly and in sync", () => {
		// The size cap must trip INCREMENTALLY on the partial line (the moment
		// the accumulated bytes exceed it) — never after buffering the whole line.
		const parser = createAgyStreamParser(); // default 1MiB cap
		const chunk = "z".repeat(64 * 1024);
		const started = performance.now();
		let events = [];
		for (let i = 0; i < 32; i += 1) {
			// 32 × 64KB = 2MiB on ONE line; the newline arrives only at the end.
			events = events.concat(parser.push(i === 31 ? `${chunk}\n` : chunk));
		}
		events = events.concat(parser.push('{"event":"init"}\n'));
		const elapsedMs = performance.now() - started;
		expect(events.map((row) => row.event)).toEqual(["init"]); // oversized line dropped, framing in sync
		expect(parser.stats().droppedOversized).toBe(1);
		expect(elapsedMs).toBeLessThan(500);
	});

	it("keeps buffer growth bounded by the cap for an unterminated oversized line", () => {
		const parser = createAgyStreamParser({ maxLineBytes: 1024 });
		// Feed 100 × 10KB with no newline: nothing parsed, nothing retained.
		for (let i = 0; i < 100; i += 1) {
			expect(parser.push("y".repeat(10 * 1024))).toEqual([]);
		}
		const stats = parser.stats();
		expect(stats.lines).toBe(0);
		expect(stats.droppedOversized).toBe(0); // counted only at the terminator/flush
		// The terminator finally arrives: exactly one oversized drop, framing syncs.
		expect(parser.push("tail\n{\"event\":\"init\"}\n").map((row) => row.event)).toEqual(["init"]);
		expect(parser.stats().droppedOversized).toBe(1);
	});
});

/** Helper: asserts the noise fixture's row list (keeps the test above readable). */
function noiseRows(rows) {
	expect(rows.map((row) => row.event)).toEqual(["init", "step_update", "result"]);
}