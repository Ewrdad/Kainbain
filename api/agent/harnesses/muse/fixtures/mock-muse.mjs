#!/usr/bin/env node
/**
 * MARK: mock-muse.mjs
 * @description A deterministic mock of the Muse Code CLI (`muse exec`)
 *   used by the muse harness tests — no real CLI install, no network, no
 *   model credentials required. It speaks the `muse exec --json` envelope
 *   wire format (one JSON object per line, with a `payload_type`
 *   discriminator — see api/agent/harnesses/muse/museStreamParser.js):
 *
 *     {"payload_type":"run.lifecycle.started", "payload": {...}}
 *     {"payload_type":"run.output.delta",      "payload": {"text": ...}}
 *     {"payload_type":"run.terminal.completed","payload": {"terminal": "completed", "text": ...}}
 *     {"payload_type":"run.terminal.failed",   "payload": {"terminal": "failed", "reason": ...}}
 *
 *   Behavior is selected with environment variables (they flow through the
 *   harness's child-env allowlist because they are MUSE_-prefixed):
 *
 *     MUSE_MOCK_MODE         success (default) | failure | hang | noise
 *     MUSE_MOCK_FIXTURE      path to a .ndjson fixture to replay verbatim
 *     MUSE_MOCK_CHUNK_DELAY_MS  delay between stdout writes (default 0)
 *     MUSE_MOCK_ARGV_LOG     when set, the received argv is appended (JSON line)
 *                            so tests can assert the exact spawn arguments
 *
 *   Subcommands beyond `exec`:
 *
 *     muse --version         prints a mock version string (probeHealth)
 *     muse export ...        writes a canned REAL-shaped export document (the
 *                            checked-in fixtures/muse-export.echo.json, captured
 *                            from a real `muse export --redacted`) to --out, so
 *                            readHistoryFromDisk is testable hermetically.
 *                            MUSE_MOCK_EXPORT_FIXTURE overrides the canned doc;
 *                            MUSE_MOCK_EXPORT_FAIL=1 exits 1 (failure path).
 *
 *   Safety mirror: like the real CLI, the mock REQUIRES --workspace (exit 2
 *   with the real stderr text when absent) and reads --prompt-file when the
 *   prompt was staged to a file. --yolo is accepted (the harness constructs
 *   it only from the explicit opt-in setting).
 */

import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);

function writeLine(line) {
	fs.writeSync(1, `${line}\n`);
}

function sleep(ms) {
	if (ms <= 0) return;
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function flagValue(name) {
	const index = argv.indexOf(name);
	if (index === -1 || index + 1 >= argv.length) return null;
	return argv[index + 1];
}

const chunkDelay = Number(process.env.MUSE_MOCK_CHUNK_DELAY_MS || 0) || 0;
if (process.env.MUSE_MOCK_ARGV_LOG) {
	try {
		fs.appendFileSync(process.env.MUSE_MOCK_ARGV_LOG, `${JSON.stringify(argv)}\n`);
	} catch {
		// Diagnostic logging must never break the mock.
	}
}

/** `muse --version`: exercised by the harness probeHealth. */
if (argv[0] === "--version" || argv.includes("--version")) {
	process.stdout.write("Muse Code 1.3.0 (mock)\n");
	process.exit(0);
}

/** `muse export --redacted [--session <id> | --last] --out <file>`: writes the
 *  canned real-shaped export doc so readHistoryFromDisk runs hermetically.
 *  --session/--last selection is only observable via MUSE_MOCK_ARGV_LOG. */
if (argv[0] === "export") {
	if (process.env.MUSE_MOCK_EXPORT_FAIL === "1") {
		fs.writeSync(2, "mock-muse: export failed (MUSE_MOCK_EXPORT_FAIL=1)\n");
		process.exit(1);
	}
	const outFile = flagValue("--out");
	if (!outFile) {
		fs.writeSync(2, "mock-muse: export requires --out <file>\n");
		process.exit(2);
	}
	const canned =
		process.env.MUSE_MOCK_EXPORT_FIXTURE ||
		path.join(path.dirname(process.argv[1]), "muse-export.echo.json");
	try {
		fs.writeFileSync(outFile, fs.readFileSync(canned));
	} catch (error) {
		fs.writeSync(2, `mock-muse: cannot write export: ${error?.message || error}\n`);
		process.exit(1);
	}
	process.exit(0);
}

/** Replay a captured fixture verbatim; exit non-zero when it ends terminal-failed. */
const fixturePath = process.env.MUSE_MOCK_FIXTURE || null;
if (fixturePath) {
	const text = fs.readFileSync(fixturePath, "utf8");
	let failed = false;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		try {
			const parsed = JSON.parse(trimmed);
			if (parsed?.payload_type === "run.terminal.failed") failed = true;
		} catch {
			// Fixture lines are trusted to be valid JSON; ignore parse noise.
		}
	}
	const lines = text.endsWith("\n") ? text.slice(0, -1) : text;
	for (const line of lines.split("\n")) {
		writeLine(line);
		sleep(chunkDelay);
	}
	process.exit(failed ? 1 : 0);
}

if (argv[0] !== "exec") {
	fs.writeSync(2, `usage: muse exec [OPTIONS] [PROMPT] (mock: expected 'exec', got '${argv[0] || ""}')\n`);
	process.exit(2);
}

/** The real CLI pins the tool root: refuse an unpinned run like it does. */
if (!argv.includes("--workspace")) {
	fs.writeSync(2, "workspace root does not exist: --workspace is required (mock)\n");
	fs.writeSync(2, "usage: muse exec [OPTIONS] [PROMPT] (run `muse exec --help` for options)\n");
	process.exit(2);
}

const promptFile = flagValue("--prompt-file");
let prompt = "";
if (promptFile) {
	try {
		prompt = fs.readFileSync(promptFile, "utf8");
	} catch {
		fs.writeSync(2, `mock-muse: cannot read --prompt-file ${promptFile}\n`);
		process.exit(2);
	}
} else {
	// Positional prompt: the remaining argv element after "exec" that is not
	// a flag or a flag value (flags may trail the prompt — e.g. --yolo).
	const flagsWithValues = new Set([
		"--workspace",
		"--approval-mode",
		"--model",
		"--prompt-file",
	]);
	const positionals = [];
	const rest = argv[0] === "exec" ? argv.slice(1) : argv.slice();
	for (let i = 0; i < rest.length; i += 1) {
		const token = rest[i];
		if (flagsWithValues.has(token)) {
			i += 1;
			continue;
		}
		if (token.startsWith("--")) continue;
		positionals.push(token);
	}
	prompt = positionals.length > 0 ? positionals[positionals.length - 1] : "";
}

const mode = process.env.MUSE_MOCK_MODE || "success";
const sessionId = "01a0aa39-27b2-72c3-9a4e-43f8ddde8685";
const commandId = "2508a896-2b22-4d04-a98c-8b487a3f2c94";
let sequence = 0;

function envelope(payloadType, recordType, durability, payload) {
	sequence += 1;
	return JSON.stringify({
		schema_version: 1,
		id: `018f0000-0000-7000-8000-${String(0xc350 + sequence).padStart(12, "0")}`,
		stream: { kind: "session", id: sessionId },
		sequence,
		recorded_at: 1780531400000000 + sequence,
		record_type: recordType,
		durability,
		causation_id: commandId,
		payload_type: payloadType,
		payload_schema_version: 1,
		payload,
	});
}

function openRun() {
	writeLine(
		envelope("runtime.command.accepted", "reconciliation", "durable", {
			command_id: commandId,
			command_kind: "turn.submit",
			kind: "command_accepted",
		}),
	);
	sleep(chunkDelay);
	writeLine(
		envelope("run.lifecycle.started", "event", "durable", {
			command_id: commandId,
			kind: "run_started",
			prompt,
		}),
	);
	sleep(chunkDelay);
}

if (mode === "hang") {
	openRun();
	setInterval(() => {}, 60_000);
	await new Promise(() => {});
}

if (mode === "failure") {
	openRun();
	const reason = "model `definitely-not-a-real-model-id` does not exist or you lack access [request_id=mock]";
	writeLine(
		envelope("task.lifecycle.failed", "event", "durable", {
			command_id: commandId,
			kind: "task_lifecycle",
			event: { kind: "failed", reason },
		}),
	);
	sleep(chunkDelay);
	writeLine(
		envelope("run.terminal.failed", "event", "durable", {
			command_id: commandId,
			kind: "run_terminal",
			terminal: "failed",
			reason,
		}),
	);
	fs.writeSync(2, `run ended with Failed: ${reason}\n`);
	process.exit(1);
}

if (mode === "noise") {
	writeLine("NOT JSON — a diagnostics line that leaked into stdout");
	writeLine("");
	writeLine(envelope("run.lifecycle.started", "event", "durable", { kind: "run_started", prompt }));
	sleep(chunkDelay);
	writeLine('{"payload_type": 42}');
	writeLine(envelope("run.output.delta", "status", "ephemeral", { kind: "run_output_delta", text: `Mock reply: ${prompt}` }));
	sleep(chunkDelay);
	writeLine(
		envelope("run.terminal.completed", "event", "durable", {
			kind: "run_terminal",
			terminal: "completed",
			text: `Mock reply: ${prompt}`,
		}),
	);
	process.exit(0);
}

openRun();
{
	const response = `Mock reply: ${prompt}`;
	const deltas = response.match(/.{1,12}/gs) || [response];
	for (const delta of deltas) {
		writeLine(
			envelope("run.output.delta", "status", "ephemeral", {
				command_id: commandId,
				kind: "run_output_delta",
				text: delta,
			}),
		);
		sleep(chunkDelay);
	}
	writeLine(
		envelope("run.terminal.completed", "event", "durable", {
			command_id: commandId,
			kind: "run_terminal",
			terminal: "completed",
			text: response,
		}),
	);
	process.exit(0);
}
