import { describe, it, expect } from "vitest";
import { createVibeStreamParser } from "./vibeStreamParser.js";

function messageRow(overrides = {}) {
	return JSON.stringify({
		id: "assistant-1",
		sessionId: "session-1",
		turnId: "turn-1",
		inputEntryId: "user-1",
		createdAt: 1700000000001,
		updatedAt: 1700000000001,
		generationStatus: "completed",
		relatedEntryId: null,
		type: "message",
		role: "assistant",
		content: [{ type: "text", text: "hi" }],
		source: "harness",
		userDisplayContent: null,
		...overrides,
	});
}

describe("vibe stream parser", () => {
	it("parses message rows with their role and content", () => {
		const parser = createVibeStreamParser();
		const rows = parser.push(`${messageRow()}\n`);
		expect(rows).toHaveLength(1);
		expect(rows[0].rowType).toBe("message");
		expect(rows[0].role).toBe("assistant");
		expect(rows[0].content).toEqual([{ type: "text", text: "hi" }]);
	});

	it("parses effect rows with tool detail and state", () => {
		const parser = createVibeStreamParser();
		const rows = parser.push(
			`${JSON.stringify({ id: "effect-1", type: "effect", title: "file_system.bash", detail: { toolName: "file_system.bash" }, state: { status: "completed", outputText: "hi\n" } })}\n`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].rowType).toBe("effect");
		expect(rows[0].detail.toolName).toBe("file_system.bash");
		expect(rows[0].state.status).toBe("completed");
	});

	it("parses reasoning rows without surfacing their text", () => {
		const parser = createVibeStreamParser();
		const rows = parser.push(
			`${JSON.stringify({ id: "reasoning-1", type: "reasoning", text: "private plan" })}\n`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].rowType).toBe("reasoning");
	});

	it("tolerates CRLF, blank lines, and noise lines", () => {
		const parser = createVibeStreamParser();
		const rows = parser.push(`NOT JSON\r\n\r\n${messageRow()}\r\n`);
		expect(rows).toHaveLength(1);
		expect(parser.stats().skippedNoise).toBe(1);
	});

	it("drops oversized lines and unknown row types without throwing", () => {
		const tiny = createVibeStreamParser({ maxLineBytes: 64 });
		const big = messageRow({ content: [{ type: "text", text: "x".repeat(200) }] });
		expect(tiny.push(`${big}\n`)).toEqual([]);
		expect(tiny.stats().droppedOversized).toBe(1);
		const parser = createVibeStreamParser();
		const unknown = parser.push(`${JSON.stringify({ type: "future.row" })}\n`);
		expect(unknown).toEqual([]);
		expect(parser.stats().droppedUnknown).toBe(1);
	});

	it("handles split chunks and flushes a final unterminated line", () => {
		const parser = createVibeStreamParser();
		const line = `${messageRow()}\n`;
		const first = parser.push(line.slice(0, 40));
		expect(first).toEqual([]);
		const rest = parser.push(line.slice(40));
		expect(rest).toHaveLength(1);
		expect(rest[0].rowType).toBe("message");
		const unterminated = createVibeStreamParser();
		expect(unterminated.push(messageRow())).toEqual([]);
		expect(unterminated.flush()).toHaveLength(1);
	});
});
