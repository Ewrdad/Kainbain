import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentLogStreamer } from "./agentLogStreamer.js";
import { AGENT_EVENT_NAMES } from "../sessionEvents.js";
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

describe("parity contract — every AGENT_EVENT_NAMES entry maps to a structured record", () => {
	const MINIMAL_EVENT = {
		run_started: { type: "run_started" },
		assistant_delta: {
			type: "assistant_delta",
			assistantMessageEvent: { type: "text_delta", delta: "hi" },
		},
		message_started: { type: "message_started", message: { role: "assistant" } },
		tool_started: {
			type: "tool_started",
			toolName: "bash",
			toolCallId: "c-parity",
			args: { command: "ls" },
		},
		tool_updated: {
			type: "tool_updated",
			toolName: "bash",
			toolCallId: "c-parity",
			partialResult: "partial",
		},
		tool_finished: {
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "c-parity",
			result: "ok",
			durationMs: 212,
		},
		run_finished: { type: "run_finished" },
		run_error: { type: "run_error", error: { message: "boom" } },
		usage_updated: {
			type: "usage_updated",
			usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
		},
		session_meta: { type: "session_meta", model: "probe-model" },
		permission_requested: {
			type: "permission_requested",
			method: "bash",
			target: "ls",
		},
		permission_resolved: {
			type: "permission_resolved",
			method: "bash",
			target: "ls",
			decision: "allow",
		},
		plan_updated: { type: "plan_updated", steps: [{ title: "read" }] },
		reasoning_delta: { type: "reasoning_delta", delta: "hmm" },
		harness_log: { type: "harness_log", text: "[PROBE] hello" },
	};

	it("covers every name with no raw-lane leakage", () => {
		// The plan doc says "17" — the actual vocabulary is 15 (8 original
		// + 7 unified). This assertion pins the real count so a miscount
		// in either direction fails loudly.
		expect(AGENT_EVENT_NAMES).toHaveLength(15);
		for (const name of AGENT_EVENT_NAMES) {
			// eslint-disable-next-line security/detect-object-injection -- name comes from the frozen AGENT_EVENT_NAMES vocabulary
			expect(MINIMAL_EVENT[name], `missing fixture for '${name}'`).toBeDefined();
		}
		const streamer = createAgentLogStreamer();
		const emitted = [];
		for (const name of AGENT_EVENT_NAMES) {
			emitted.push(
				...streamer.handleEvent({
					// eslint-disable-next-line security/detect-object-injection -- name comes from the frozen AGENT_EVENT_NAMES vocabulary
					...MINIMAL_EVENT[name],
					// Track provenance per name without changing the payload
					// shape the processor reads.
					probeName: name,
				}),
			);
		}
		// Close the open text block ("hi") the way a run boundary would.
		emitted.push(
			...streamer.handleEvent({
				type: "assistant_delta",
				assistantMessageEvent: { type: "text_end" },
			}),
		);
		// Assert on the persisted snapshot (what the backend stores and the
		// UI renders as history), not just the per-call returns: the full
		// thinking block lands on the thinking feed at snapshot time while
		// the per-call return carries only its main-feed marker.
		const stored = streamer.snapshot().entries;
		const kinds = new Set(stored.map((e) => e.kind));
		for (const kind of [
			"assistant",
			"thinking",
			"tool",
			"error",
			"system",
			"telemetry",
			"permission",
			"plan",
		]) {
			expect(kinds, `missing canonical kind '${kind}'`).toContain(kind);
		}
		expect(stored.filter((e) => e.kind === "raw")).toHaveLength(0);
		const feeds = new Set(stored.flatMap((e) => e.feeds));
		for (const feed of ["main", "thinking", "tools", "telemetry"]) {
			expect(feeds, `missing feed '${feed}'`).toContain(feed);
		}
	});

	it("carries tool args, full results, and per-step timings", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent(MINIMAL_EVENT.tool_started);
		streamer.handleEvent(MINIMAL_EVENT.tool_updated);
		const emitted = streamer.handleEvent(MINIMAL_EVENT.tool_finished);
		const result = emitted.find((e) => e.text.startsWith("[RESULT]"));
		expect(result).toBeDefined();
		expect(result.text).toBe("[RESULT] ok (212ms)");
		expect(result.meta.durationMs).toBe(212);
		expect(result.tool).toMatchObject({ name: "bash", durationMs: 212 });
		const snapshot = streamer.snapshot().entries;
		const call = snapshot.find((e) => e.text.startsWith("[TOOL]"));
		expect(call.text).toContain("ls");
		expect(call.tool.args).toEqual({ command: "ls" });
		expect(call.meta.output).toContain("ok");
	});

	it("redacts secrets in tool args and results before persistence", () => {
		const streamer = createAgentLogStreamer();
		streamer.handleEvent({
			type: "tool_started",
			toolName: "bash",
			toolCallId: "c-redact",
			args: { command: "curl", apiKey: "supersecretvalue" },
		});
		const emitted = streamer.handleEvent({
			type: "tool_finished",
			toolName: "bash",
			toolCallId: "c-redact",
			result: "token: hunter2hunter",
		});
		const snapshot = streamer.snapshot().entries;
		const call = snapshot.find((e) => e.tool?.callId === "c-redact");
		expect(call.tool.args).toEqual({ command: "curl", apiKey: "[REDACTED]" });
		expect(call.meta.output).not.toContain("hunter2hunter");
		const result = emitted.find((e) => e.text.startsWith("[RESULT]"));
		expect(result.text).not.toContain("hunter2hunter");
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
