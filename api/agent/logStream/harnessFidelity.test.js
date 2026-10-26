import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentLogStreamer } from "./agentLogStreamer.js";
import { translatePiEvent } from "../harnesses/pi/piSessionEvents.js";
import { translateOpencodeEvent } from "../harnesses/opencode/opencodeSessionEvents.js";
import { createVibeEventMapper } from "../harnesses/vibe/vibeEventMapper.js";
import { createVibeStreamParser } from "../harnesses/vibe/vibeStreamParser.js";
import { vibeExportToUsage } from "../harnesses/vibe/vibeHarness.js";
import { readVibeExport } from "../harnesses/vibe/vibePermissions.js";
import { createAgyEventMapper } from "../harnesses/antigravity/agyEventMapper.js";
import { createAgyStreamParser } from "../harnesses/antigravity/agyStreamParser.js";
import { createMuseEventMapper } from "../harnesses/muse/museEventMapper.js";
import { createReferenceMockSession } from "../harnesses/mock/mockHarness.js";

/**
 * MARK: harnessFidelity (parity gate)
 * @description The enforcement that no harness silently loses data: per
 *   harness, a recorded fixture run must produce canonical records for every
 *   capability the harness advertises (text, thinking/reasoning, tool,
 *   telemetry, session/permission/plan/harness-log), and known wire shapes
 *   must never land in the raw lane with reason "unmapped".
 *
 *   This gate replays parser fixtures and SDK-verified payloads through each
 *   harness's own mapper into the unified log processor — the same path a
 *   live stage run takes (mapper → normalized events → processor → records).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIBE_FIXTURES = path.join(HERE, "..", "harnesses", "vibe", "fixtures");
const AGY_FIXTURES = path.join(HERE, "..", "harnesses", "antigravity", "fixtures");

function streamThroughMapper(events, streamer) {
	const emitted = [];
	for (const event of events) emitted.push(...streamer.handleEvent(event));
	emitted.push(...streamer.handleEvent({ type: "run_finished" }));
	return streamer.snapshot().entries;
}

function kinds(entries) {
	return entries.map((e) => e.kind);
}

describe("harness fidelity gate — pi (baseline)", () => {
	it("carries text, thinking, tools and recovers usage riding the payload", () => {
		const streamer = createAgentLogStreamer();
		const raw = [
			{ type: "message_start", message: { role: "assistant" } },
			{
				type: "message_update",
				assistantMessageEvent: { type: "text_delta", delta: "answer" },
			},
			{
				type: "message_update",
				assistantMessageEvent: { type: "thinking_delta", delta: "hmm" },
			},
			{
				type: "message_update",
				assistantMessageEvent: { type: "text_end" },
				usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			},
			{ type: "tool_execution_start", toolName: "bash", toolCallId: "c1", args: {} },
			{ type: "tool_execution_end", toolName: "bash", toolCallId: "c1", result: "ok" },
		].map(translatePiEvent);
		const entries = streamThroughMapper(raw, streamer);
		expect(kinds(entries)).toContain("assistant");
		expect(kinds(entries)).toContain("thinking");
		expect(kinds(entries)).toContain("tool");
		expect(kinds(entries)).toContain("telemetry");
		expect(entries.filter((e) => e.kind === "raw")).toHaveLength(0);
	});
});

describe("harness fidelity gate — opencode", () => {
	it("recovers step-finish tokens, completed-message telemetry and permissions", () => {
		const streamer = createAgentLogStreamer();
		const raw = [
			{
				type: "message.part.updated",
				properties: {
					part: {
						type: "step-finish",
						reason: "stop",
						cost: 0.02,
						tokens: { input: 50, output: 10, reasoning: 0, cache: { read: 0, write: 0 } },
					},
				},
			},
			{
				type: "permission.updated",
				properties: { id: "p1", type: "bash", pattern: "ls", title: "List" },
			},
			{
				type: "permission.replied",
				properties: { sessionID: "s", permissionID: "p1", response: "allow" },
			},
			{
				type: "message.updated",
				properties: {
					info: {
						role: "assistant",
						time: { created: 1, completed: 2 },
						modelID: "m",
						providerID: "p",
						cost: 0.01,
						tokens: { input: 5, output: 5, reasoning: 0, cache: { read: 0, write: 0 } },
					},
				},
			},
		].map(translateOpencodeEvent);
		expect(raw.every(Boolean)).toBe(true);
		const entries = streamThroughMapper(raw, streamer);
		expect(kinds(entries)).toContain("telemetry");
		expect(kinds(entries)).toContain("permission");
		expect(entries.filter((e) => e.kind === "raw")).toHaveLength(0);
	});
});

describe("harness fidelity gate — vibe", () => {
	it("streams reasoning fixture rows into thinking and the export into telemetry", () => {
		const parser = createVibeStreamParser();
		const mapper = createVibeEventMapper();
		const streamer = createAgentLogStreamer({ hideThinking: false });
		for (const event of mapper.startRun()) streamer.handleEvent(event);
		const rows = [
			...parser.push(
				'{"type":"reasoning","id":"r1","text":"private plan"}\n',
			),
			...parser.push(
				'{"type":"message","role":"assistant","content":[{"type":"text","text":"answer"}]}\n',
			),
		];
		const events = rows.flatMap((row) => mapper.map(row));
		expect(events.map((e) => e.type)).toContain("reasoning_delta");
		for (const event of events) streamer.handleEvent(event);
		// Close the open text block the way a run boundary would.
		streamer.handleEvent({
			type: "assistant_delta",
			assistantMessageEvent: { type: "text_end" },
		});
		// The real export fixture (snake_case wire) normalizes through the
		// production path (readVibeExport → vibeExportToUsage → usage_updated).
		const exportDir = fs.mkdtempSync(
			path.join(fs.realpathSync("/tmp"), "kainbain-fidelity-"),
		);
		try {
			fs.copyFileSync(
				path.join(VIBE_FIXTURES, "export.finished.json"),
				path.join(exportDir, "export.json"),
			);
			const record = readVibeExport(exportDir);
			expect(record.usage.inputTokens).toBe(8646);
			const usage = vibeExportToUsage(record);
			expect(usage.totalTokens).toBe(8652);
			expect(usage.costUsd).toBeCloseTo(0.0121, 4);
			streamer.handleEvent({ type: "usage_updated", usage });
		} finally {
			fs.rmSync(exportDir, { recursive: true, force: true });
		}
		const entries = streamer.snapshot().entries;
		expect(kinds(entries)).toContain("thinking");
		expect(kinds(entries)).toContain("assistant");
		expect(kinds(entries)).toContain("telemetry");
		expect(entries.filter((e) => e.kind === "raw")).toHaveLength(0);
	});
});

describe("harness fidelity gate — antigravity", () => {
	it("surfaces user_input/checkpoint rows and result usage from the success fixture", () => {
		const parser = createAgyStreamParser();
		const mapper = createAgyEventMapper();
		const streamer = createAgentLogStreamer();
		const text = fs.readFileSync(path.join(AGY_FIXTURES, "success.ndjson"), "utf8");
		const events = [];
		for (const line of text.split("\n")) {
			if (!line.trim()) continue;
			for (const row of parser.push(`${line}\n`)) events.push(...mapper.map(row));
		}
		const types = events.map((e) => e.type);
		expect(types).toContain("harness_log");
		for (const event of events) streamer.handleEvent(event);
		const entries = streamer.snapshot().entries;
		expect(entries.some((e) => e.text.startsWith("[AGY] user input"))).toBe(true);
		expect(entries.filter((e) => e.kind === "raw")).toHaveLength(0);
	});
});

describe("harness fidelity gate — muse", () => {
	it("surfaces model config and terminal task lifecycles", () => {
		const mapper = createMuseEventMapper();
		const streamer = createAgentLogStreamer();
		const events = [
			...mapper.map({
				payloadType: "run.model.configured",
				payload: { model_id: "muse-spark-1.3-contributor", provider_id: "meta" },
			}),
			...mapper.map({
				payloadType: "task.lifecycle.completed",
				payload: { event: { kind: "completed", task_id: "01a0aa39-28f1" } },
			}),
			...mapper.map({
				payloadType: "run.output.delta",
				payload: { text: "hi" },
			}),
		];
		expect(events.map((e) => e.type)).toEqual([
			"session_meta",
			"harness_log",
			"message_started",
			"assistant_delta",
		]);
		for (const event of events) streamer.handleEvent(event);
		streamer.handleEvent({
			type: "assistant_delta",
			assistantMessageEvent: { type: "text_end" },
		});
		const entries = streamer.snapshot().entries;
		expect(kinds(entries)).toContain("system");
		expect(kinds(entries)).toContain("assistant");
		expect(entries.filter((e) => e.kind === "raw")).toHaveLength(0);
	});
});

describe("harness fidelity gate — mock (full-lane coverage)", () => {
	it("one prompt run produces every canonical kind", async () => {
		const session = createReferenceMockSession({ harnessId: "mock" });
		const streamer = createAgentLogStreamer({ hideThinking: false });
		const unsub = session.subscribe((event) => streamer.handleEvent(event));
		await session.prompt("fidelity probe");
		unsub();
		const entries = streamer.snapshot().entries;
		for (const kind of [
			"assistant",
			"thinking",
			"system",
			"telemetry",
			"permission",
			"plan",
		]) {
			expect(kinds(entries), `missing canonical kind '${kind}'`).toContain(kind);
		}
		expect(entries.filter((e) => e.kind === "raw")).toHaveLength(0);
	});
});
