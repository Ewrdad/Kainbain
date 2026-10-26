#!/usr/bin/env node
/**
 * MARK: mock-agy.mjs
 * @description A deterministic mock of the `agy` (Antigravity) CLI used by the
 *   antigravity harness tests — no real CLI install, no network, no model
 *   credentials required. It speaks the `--output-format stream-json` wire
 *   format documented at antigravity.google/docs/cli/headless:
 *
 *     {"event":"init",        "conversation_id", "init": {...}}
 *     {"event":"step_update", "conversation_id", "step_index", "state", "step_type", "text_delta"?, "tool_info"?}
 *     {"event":"result",      "conversation_id", "status", "response", "error"?, "duration_seconds", "usage"}
 *
 *   Behavior is selected with environment variables (they flow through the
 *   harness's child-env allowlist because they are AGY_-prefixed):
 *
 *     AGY_MOCK_MODE         success (default) | error | auth | crash | hang | utf8split
 *     AGY_MOCK_MODELS_MODE  success (default) | hang | auth | error | unparseable | empty — behavior of the `models` subcommand
 *     AGY_MOCK_FIXTURE      path to a .ndjson fixture to replay verbatim
 *     AGY_MOCK_CHUNK_DELAY_MS  delay between stdout writes (default 0)
 *     AGY_MOCK_ARGV_LOG     when set, the received argv is appended (JSON line)
 *                           so tests can assert the exact spawn arguments
 *
 *   Safety mirror: the mock accepts `--dangerously-skip-permissions` (the
 *   harness passes it by operator-chosen default) and reports
 *   `permission_mode: "always-proceed"` when it does, mirroring the real CLI
 *   — tests assert the harness surfaces the effective approval mode.
 */

import fs from "node:fs";

const FORBIDDEN_FLAG = "--dangerously-skip-permissions";
const MODELS_LIST = [
	"gemini-3.8-flash-high    Fast everyday reasoning model",
	"gemini-3.1-pro-high      Most capable reasoning model",
	"claude-sonnet-4-6        Anthropic Claude Sonnet 4.6",
].join("\n");

const argv = process.argv.slice(2);

function writeLine(line) {
	// Synchronous writes so per-line delays reach the reader incrementally.
	fs.writeSync(1, `${line}\n`);
}

function sleep(ms) {
	if (ms <= 0) return;
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Approval-mode mirror: the bypass flag flips the reported permission mode. */
const skipPermissions = argv.includes(FORBIDDEN_FLAG);
const mockPermissionMode = skipPermissions ? "always-proceed" : "request-review";

/** `agy models` subcommand: print the fixture model list, or reproduce one
 *  deterministic failure mode (AGY_MOCK_MODELS_MODE) so every discovery
 *  failure class is reproducible without a real CLI install:
 *  `hang` (never answers — the discovery watchdog must kill us),
 *  `auth` (exit 1 with the login hint on stderr),
 *  `error` (exit 1 with a generic failure on stderr),
 *  `unparseable` (exit 0 with prose but zero recognizable slugs),
 *  `empty` (exit 0 with no output at all). */
if (argv[0] === "models" && process.env.AGY_MOCK_MODELS_MODE === "hang") {
	// Produce nothing and never exit: an interval keeps the loop alive and the
	// never-resolving await stops execution before the prompt-stream code.
	setInterval(() => {}, 60_000);
	await new Promise(() => {});
}
if (argv[0] === "models") {
	const modelsMode = process.env.AGY_MOCK_MODELS_MODE || "success";
	if (modelsMode === "auth") {
		fs.writeSync(
			2,
			"error: authentication required. Run `agy auth login` first.\n",
		);
		process.exit(1);
	}
	if (modelsMode === "error") {
		fs.writeSync(2, "mock-agy: simulated models failure\n");
		process.exit(1);
	}
	if (modelsMode === "unparseable") {
		// Prose shaped like a status page: no token looks like a versioned
		// model slug (no separator, no digit), so the parser yields zero models.
		process.stdout.write(
			"Available models:\n\nComing soon in this region\nPlease try again later\n",
		);
		process.exit(0);
	}
	if (modelsMode === "empty") {
		process.exit(0);
	}
	process.stdout.write(`${MODELS_LIST}\n`);
	process.exit(0);
}

const chunkDelay = Number(process.env.AGY_MOCK_CHUNK_DELAY_MS || 0) || 0;
if (process.env.AGY_MOCK_ARGV_LOG) {
	try {
		fs.appendFileSync(process.env.AGY_MOCK_ARGV_LOG, `${JSON.stringify(argv)}\n`);
	} catch {
		// Diagnostic logging must never break the mock.
	}
}

function flagValue(name) {
	const index = argv.indexOf(name);
	if (index === -1 || index + 1 >= argv.length) return null;
	return argv[index + 1];
}

const prompt =
	flagValue("-p") ?? flagValue("--prompt") ?? flagValue("--print") ?? "";
const model = flagValue("--model");
const conversationId = flagValue("--conversation") || "mock-conv-1";
const mode = process.env.AGY_MOCK_MODE || "success";
const fixturePath = process.env.AGY_MOCK_FIXTURE || null;

/** Replay a captured-shaped fixture verbatim; exit non-zero when it ends in a non-SUCCESS result. */
function replayFixture() {
	const text = fs.readFileSync(fixturePath, "utf8");
	let status = "SUCCESS";
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed?.event === "result") status = parsed.status ?? "SUCCESS";
		} catch {
			// Fixture lines are trusted to be valid JSON; ignore parse noise.
		}
	}
	const lines = text.endsWith("\n") ? text.slice(0, -1) : text;
	for (const line of lines.split("\n")) {
		writeLine(line);
		sleep(chunkDelay);
	}
	process.exit(status === "SUCCESS" ? 0 : 1);
}

if (fixturePath) {
	replayFixture();
}

/** Synthesized success stream (default). */
function successStream() {
	writeLine(
		JSON.stringify({
			event: "init",
			conversation_id: conversationId,
			init: {
				cwd: process.cwd(),
				tools: ["read_file", "write_file", "run_command"],
				permission_mode: mockPermissionMode,
				model: model || "gemini-3.8-flash-high",
			},
		}),
	);
	sleep(chunkDelay);
	const response = `Mock reply: ${prompt}`;
	const deltas = response.match(/.{1,12}/gs) || [response];
	let stepIndex = 2;
	deltas.forEach((delta) => {
		writeLine(
			JSON.stringify({
				event: "step_update",
				conversation_id: conversationId,
				step_index: stepIndex,
				state: "ACTIVE",
				step_type: "agent_response",
				text_delta: delta,
			}),
		);
		sleep(chunkDelay);
	});
	writeLine(
		JSON.stringify({
			event: "step_update",
			conversation_id: conversationId,
			step_index: stepIndex,
			state: "DONE",
			step_type: "agent_response",
		}),
	);
	sleep(chunkDelay);
	writeLine(
		JSON.stringify({
			event: "result",
			conversation_id: conversationId,
			status: "SUCCESS",
			response,
			duration_seconds: 0.1,
			num_turns: 1,
			usage: {
				input_tokens: 100,
				output_tokens: 20,
				thinking_tokens: 0,
				cache_read_tokens: 0,
				total_tokens: 120,
			},
		}),
	);
	process.exit(0);
}

/** Multi-byte UTF-8 line deliberately split mid-character across raw stdout
 *  writes: exercises the harness's StringDecoder (chunk-boundary corruption). */
function utf8SplitStream() {
	writeLine(
		JSON.stringify({
			event: "init",
			conversation_id: conversationId,
			init: {
				cwd: process.cwd(),
				tools: [],
				permission_mode: "request-review",
				model: model || null,
			},
		}),
	);
	sleep(chunkDelay);
	const text = "héllo 日本語 🚀 done";
	const line = JSON.stringify({
		event: "step_update",
		conversation_id: conversationId,
		step_index: 2,
		state: "ACTIVE",
		step_type: "agent_response",
		text_delta: text,
	});
	const bytes = Buffer.from(`${line}\n`, "utf8");
	// Split right after the lead byte of the first multi-byte char ('é' =
	// 0xC3 0xA9 — the first byte >= 0x80 in this ASCII-framed JSON line), with
	// a real delay so the reader observes TWO separate chunks.
	const leadByteIndex = bytes.indexOf(Buffer.from([0xc3]));
	fs.writeSync(1, bytes.subarray(0, leadByteIndex + 1));
	sleep(60);
	fs.writeSync(1, bytes.subarray(leadByteIndex + 1));
	sleep(chunkDelay);
	writeLine(
		JSON.stringify({
			event: "result",
			conversation_id: conversationId,
			status: "SUCCESS",
			response: text,
			duration_seconds: 0.1,
			num_turns: 1,
			usage: {
				input_tokens: 10,
				output_tokens: 5,
				thinking_tokens: 0,
				cache_read_tokens: 0,
				total_tokens: 15,
			},
		}),
	);
	process.exit(0);
}

/** Result status ERROR with the documented error envelope; non-zero exit. */
function errorStream() {
	writeLine(
		JSON.stringify({
			event: "init",
			conversation_id: conversationId,
			init: {
				cwd: process.cwd(),
				tools: [],
				permission_mode: mockPermissionMode,
				model: model || null,
			},
		}),
	);
	writeLine(
		JSON.stringify({
			event: "step_update",
			conversation_id: conversationId,
			step_index: 2,
			state: "ACTIVE",
			step_type: "agent_response",
			text_delta: "Partial output before the failure.",
		}),
	);
	writeLine(
		JSON.stringify({
			event: "result",
			conversation_id: conversationId,
			status: "ERROR",
			error: "Model quota exceeded",
			response: "",
			duration_seconds: 0.2,
			num_turns: 1,
			usage: {
				input_tokens: 10,
				output_tokens: 2,
				thinking_tokens: 0,
				cache_read_tokens: 0,
				total_tokens: 12,
			},
		}),
	);
	process.exit(1);
}

switch (mode) {
	case "error":
		errorStream();
		break;
	case "utf8split":
		utf8SplitStream();
		break;
	case "auth":
		fs.writeSync(
			2,
			"error: authentication required. Run `agy auth login` first.\n",
		);
		process.exit(1);
		break;
	case "crash":
		writeLine(
			JSON.stringify({
				event: "init",
				conversation_id: conversationId,
				init: {
					cwd: process.cwd(),
					tools: [],
					permission_mode: mockPermissionMode,
					model: model || null,
				},
			}),
		);
		writeLine(
			JSON.stringify({
				event: "step_update",
				conversation_id: conversationId,
				step_index: 2,
				state: "ACTIVE",
				step_type: "agent_response",
				text_delta: "Starting up…",
			}),
		);
		sleep(chunkDelay);
		fs.writeSync(2, "mock-agy: simulated hard crash (no result line follows)\n");
		process.exit(1);
		break;
	case "hang":
		// Produce nothing and never exit; the engine's watchdog or abort must
		// SIGTERM/SIGKILL us. SIGTERM default action terminates this process.
		setInterval(() => {}, 60_000);
		break;
	default:
		successStream();
		break;
}
