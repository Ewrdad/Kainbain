#!/usr/bin/env node
/**
 * MARK: mock-vibe.mjs
 * @description A deterministic mock of Mistral's Vibe CLI
 *   (`vibe --prompt … --output streaming`) used by the vibe harness tests
 *   — no real CLI install, no network, no credentials required. It speaks
 *   the `--output streaming` wire format (one JSON message object per line,
 *   with a `type` discriminator — see
 *   api/agent/harnesses/vibe/vibeStreamParser.js):
 *
 *     {"type":"message","role":"user",…}        (prompt echo)
 *     {"type":"effect",…}                        (one settled tool call)
 *     {"type":"message","role":"assistant",…}    (answer text)
 *
 *   Like the real CLI it writes `--output-dir/export.json`
 *   (`outcome`, `usage`, `cost_usd`, `steps`, `exit_code`) on every exit,
 *   so the harness's export-read path is exercised too.
 *
 *   Behavior is selected with environment variables (they flow through the
 *   harness's child-env allowlist because they are VIBE_-prefixed):
 *
 *     VIBE_MOCK_MODE         success (default) | failure | limit | hang | noise | tool
 *     VIBE_MOCK_FIXTURE      path to a .jsonl fixture to replay verbatim
 *     VIBE_MOCK_CHUNK_DELAY_MS  delay between stdout writes (default 0)
 *     VIBE_MOCK_ARGV_LOG     when set, the received argv is appended (JSON line)
 *                            so tests can assert the exact spawn arguments
 *     VIBE_MOCK_STRICT       when set, validate argv against the selected CLI's
 *                            accepted flag set and exit 2 like the real parser
 *     VIBE_MOCK_CLI          rust | python — which CLI implementation this mock
 *                            models (defaults to $VIBE_CLI if set, else rust).
 *                            In strict mode `rust` simulates the PRE-3.0 Rust
 *                            TUI (ground truth: help.rust-pre3.txt), whose
 *                            clap parser rejects the harness-owned flags —
 *                            the production failure the pin regression proves
 *                            against. Stock Vibe >= 3.0 is the unified Rust
 *                            TUI and accepts all three flags (ground truth:
 *                            help.rust.txt); the rejection survives here ONLY
 *                            as that legacy simulator, never as a claim about
 *                            a current binary.
 *
 *   The two SIMULATED implementations do NOT accept the same flags: the
 *   harness-owned `--output-dir`, `--time-limit`, and `--prompt-file` exist
 *   on the Python CLI (ground truth: help.python.txt) but are rejected by
 *   the simulated pre-3.0 Rust TUI (ground truth: help.rust-pre3.txt).
 *   Strict mode reproduces the exact production failure — clap's
 *   `unexpected argument '--output-dir' found` (exit 2) or argparse's
 *   `unrecognized arguments` — so a regression test can prove the harness
 *   pins a compatible implementation.
 *
 *   Safety mirror: like the real CLI, the mock REQUIRES --workdir (exit 1
 *   with the real stderr text when absent) and reads --prompt-file when the
 *   prompt was staged to a file. --auto-approve is accepted (the harness
 *   constructs it only from the explicit opt-in setting).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);

/** Which implementation this mock models. Precedence mirrors the PRE-3.0
 *  launcher: an explicit `VIBE_CLI` selector (e.g. the harness pin) wins;
 *  otherwise the mocked rollout (`VIBE_MOCK_CLI`) decides; otherwise we
 *  default to rust. (Stock Vibe >= 3.0 ignores `VIBE_CLI` — the unified Rust
 *  TUI always runs — but the mock keeps honoring it so the legacy pin
 *  regression stays exercisable.) */
const CLI_SELECTOR = String(process.env.VIBE_CLI || "").trim().toLowerCase();
const ROLLOUT = String(process.env.VIBE_MOCK_CLI || "rust").trim().toLowerCase();
const MOCK_CLI = CLI_SELECTOR === "rust" || CLI_SELECTOR === "python" ? CLI_SELECTOR : ROLLOUT;
const STRICT = Boolean(process.env.VIBE_MOCK_STRICT);

/** Flags the Python CLI accepts (ground truth: fixtures/help.python.txt). */
const PYTHON_FLAGS = new Set([
	"-h",
	"--help",
	"-v",
	"--version",
	"-p",
	"--prompt",
	"--max-turns",
	"--max-price",
	"--max-tokens",
	"--time-limit",
	"--prompt-file",
	"--output-dir",
	"--enabled-tools",
	"--disabled-tools",
	"--output",
	"--agent",
	"--experimental-harness",
	"--legacy-harness",
	"--smart-approve",
	"--auto-approve",
	"--yolo",
	"--setup",
	"--check-upgrade",
	"--workdir",
	"--worktree",
	"--add-dir",
	"--trust",
	"-c",
	"--continue",
	"--resume",
]);

/** Flags the SIMULATED pre-3.0 Rust TUI rejects (ground truth:
 *  fixtures/help.rust-pre3.txt). Stock Vibe >= 3.0 accepts all three
 *  (ground truth: fixtures/help.rust.txt); this set exists only so the
 *  strict-mode legacy regression keeps failing like 2.x did. */
const RUST_REJECTED = new Set(["--time-limit", "--prompt-file", "--output-dir"]);

function acceptsFlag(flag) {
	if (!PYTHON_FLAGS.has(flag)) return false;
	if (MOCK_CLI === "rust" && RUST_REJECTED.has(flag)) return false;
	return true;
}

function helpFixture() {
	const name = MOCK_CLI === "rust" ? "help.rust.txt" : "help.python.txt";
	return path.join(path.dirname(fileURLToPath(import.meta.url)), name);
}

function clapReject(flag) {
	const tip = flag === "--output-dir" ? "--output" : null;
	fs.writeSync(
		2,
		`error: unexpected argument '${flag}' found\n\n` +
			(tip ? `  tip: a similar argument exists: '${tip}'\n\n` : "") +
			"Usage: vibe --prompt [<PROMPT>] --output <OUTPUT> [INITIAL_PROMPT]\n\n" +
			"For more information, try '--help'.\n",
	);
	process.exit(2);
}

function argparseReject(flags) {
	fs.writeSync(
		2,
		`usage: vibe [-h] [-v] [-p [TEXT]] [--output-dir DIR] [PROMPT]\n` +
			`vibe: error: unrecognized arguments: ${flags.join(" ")}\n`,
	);
	process.exit(2);
}

/** Model the real parsers' unknown-argument rejection (opt-in strict mode). */
function validateArgv() {
	if (!STRICT) return;
	const unknown = [];
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (!/^--?[A-Za-z]/.test(token)) continue;
		const flag = token.split("=")[0];
		if (acceptsFlag(flag)) continue;
		unknown.push(flag);
		// clap reports the first offender; argparse collects them all.
		if (MOCK_CLI === "rust") clapReject(flag);
	}
	if (unknown.length > 0) argparseReject(unknown);
}

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

const chunkDelay = Number(process.env.VIBE_MOCK_CHUNK_DELAY_MS || 0) || 0;
const SESSION_ID = "mock-session-0001";
const TURN_ID = "mock-turn-0001";
if (process.env.VIBE_MOCK_ARGV_LOG) {
	try {
		fs.appendFileSync(process.env.VIBE_MOCK_ARGV_LOG, `${JSON.stringify(argv)}\n`);
	} catch {
		// Diagnostic logging must never break the mock.
	}
}

/** `vibe --version`: exercised by the harness probeHealth. */
if (argv[0] === "--version" || argv[0] === "-v" || argv.includes("--version")) {
	process.stdout.write("vibe 3.0.2 (mock)\n");
	process.exit(0);
}

/** `vibe --help`: exercised by the harness capability preflight; prints the
 *  captured ground-truth help for the modelled implementation. */
if (argv[0] === "--help" || argv[0] === "-h") {
	try {
		process.stdout.write(fs.readFileSync(helpFixture(), "utf8"));
	} catch {
		process.stdout.write("vibe (mock help)\n");
	}
	process.exit(0);
}

// The real parsers reject unknown arguments before doing any work.
validateArgv();

/** Replay a captured fixture verbatim; exit non-zero when it ends terminal-failed. */
const fixturePath = process.env.VIBE_MOCK_FIXTURE || null;
if (fixturePath) {
	const text = fs.readFileSync(fixturePath, "utf8");
	const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
	for (const line of lines) {
		if (!line.trim()) continue;
		writeLine(line);
		sleep(chunkDelay);
	}
	writeExport("finished", 0);
	process.exit(0);
}

function writeExport(outcome, exitCode) {
	const outputDir = flagValue("--output-dir");
	if (!outputDir) return;
	try {
		fs.mkdirSync(outputDir, { recursive: true });
		fs.writeFileSync(
			path.join(outputDir, "export.json"),
			JSON.stringify({
				outcome,
				stop_reason: outcome === "finished" ? null : outcome,
				error: null,
				session_id: SESSION_ID,
				usage: {
					input_tokens: 100,
					output_tokens: 10,
					cached_input_tokens: 0,
					total_tokens: 110,
				},
				cost_usd: 0.001,
				steps: 1,
				limits: { max_turns: 5, max_price: null, max_tokens: null, time_limit_s: null },
				exit_code: exitCode,
			}),
			"utf8",
		);
	} catch {
		// Export enrichment must never break the mock.
	}
}

/** The real CLI pins the tool root: refuse an unpinned run like it does. */
if (!argv.includes("--workdir")) {
	fs.writeSync(2, "Error: --workdir is required (mock)\n");
	process.exit(1);
}

const promptFile = flagValue("--prompt-file");
let prompt = "";
if (promptFile) {
	try {
		prompt = fs.readFileSync(promptFile, "utf8");
	} catch {
		fs.writeSync(2, `mock-vibe: cannot read --prompt-file ${promptFile}\n`);
		process.exit(1);
	}
} else if (flagValue("--prompt") !== null) {
	prompt = flagValue("--prompt");
} else {
	// Positional prompt fallback (the real CLI accepts PROMPT positionally).
	const flagsWithValues = new Set([
		"--prompt",
		"--prompt-file",
		"--output-dir",
		"--output",
		"--workdir",
		"--agent",
		"--max-turns",
		"--max-price",
		"--max-tokens",
		"--time-limit",
		"--enabled-tools",
		"--disabled-tools",
	]);
	const positionals = [];
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (flagsWithValues.has(token)) {
			i += 1;
			continue;
		}
		if (token.startsWith("--")) continue;
		positionals.push(token);
	}
	prompt = positionals.length > 0 ? positionals[positionals.length - 1] : "";
}

const mode = process.env.VIBE_MOCK_MODE || "success";

function userRow() {
	return JSON.stringify({
		id: "mock-user-1",
		sessionId: SESSION_ID,
		turnId: TURN_ID,
		inputEntryId: null,
		createdAt: 1700000000001,
		updatedAt: 1700000000001,
		generationStatus: "completed",
		relatedEntryId: null,
		type: "message",
		role: "user",
		content: [{ type: "text", text: prompt }],
		source: "turn_start",
		userDisplayContent: null,
	});
}

function assistantRow(text) {
	return JSON.stringify({
		id: "mock-assistant-1",
		sessionId: SESSION_ID,
		turnId: TURN_ID,
		inputEntryId: "mock-user-1",
		createdAt: 1700000000002,
		updatedAt: 1700000000002,
		generationStatus: "completed",
		relatedEntryId: null,
		type: "message",
		role: "assistant",
		content: [{ type: "text", text }],
		source: "harness",
		userDisplayContent: null,
	});
}

function effectRow() {
	return JSON.stringify({
		id: "mock-effect-1",
		sessionId: SESSION_ID,
		turnId: TURN_ID,
		inputEntryId: "mock-user-1",
		createdAt: 1700000000003,
		updatedAt: 1700000000004,
		generationStatus: "completed",
		relatedEntryId: null,
		type: "effect",
		title: "file_system.bash",
		detail: {
			toolName: "file_system.bash",
			display: { summary: "bash: echo hi", message: "echo hi" },
			kind: "shell",
			input: { command: "echo hi" },
		},
		state: {
			status: "completed",
			output: { stdout: "hi\n", stderr: "", output: "", truncated: false },
			outputText: "hi\n",
			durationMs: 1,
			display: { success: true, message: "echo hi" },
			decision: "execute",
			approvalType: "always",
			approvalSource: "bypass",
		},
		userDisplayContent: null,
	});
}

if (mode === "hang") {
	writeLine(userRow());
	setInterval(() => {}, 60_000);
	await new Promise(() => {});
}

if (mode === "failure") {
	const reason = "model `definitely-not-a-real-model-id` is not available [request_id=mock]";
	writeLine(userRow());
	sleep(chunkDelay);
	fs.writeSync(2, `Error: ${reason}\n`);
	writeExport("error", 1);
	process.exit(1);
}

if (mode === "limit") {
	writeLine(userRow());
	sleep(chunkDelay);
	writeLine(assistantRow(`Partial reply: ${prompt}`));
	fs.writeSync(2, "Stopped: price_limit\n");
	writeExport("price_limit", 3);
	process.exit(3);
}

if (mode === "noise") {
	writeLine("NOT JSON — a diagnostics line that leaked into stdout");
	writeLine("");
	writeLine(userRow());
	sleep(chunkDelay);
	writeLine('{"type": 42}');
	writeLine(assistantRow(`Mock reply: ${prompt}`));
	sleep(chunkDelay);
	writeExport("finished", 0);
	process.exit(0);
}

if (mode === "tool") {
	writeLine(userRow());
	sleep(chunkDelay);
	writeLine(effectRow());
	sleep(chunkDelay);
	writeLine(assistantRow(`Mock reply: ${prompt}`));
	writeExport("finished", 0);
	process.exit(0);
}

{
	// Word-chunked answer: with VIBE_MOCK_CHUNK_DELAY_MS set, the stream
	// stays alive across several writes (abort/watchdog tests need a run
	// that outlives their settle delay); without a delay it is instant.
	const response = `Mock reply: ${prompt}`;
	writeLine(userRow());
	sleep(chunkDelay);
	const words = response.split(/(?<= )/);
	for (const word of words) {
		writeLine(assistantRow(word));
		sleep(chunkDelay);
	}
	writeExport("finished", 0);
	process.exit(0);
}
