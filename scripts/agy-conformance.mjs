#!/usr/bin/env node
/***
 * MARK: agy-conformance.mjs
 * @description Repeatable live-conformance check for the antigravity harness:
 *   probes a real `agy` CLI (version, --help flag matrix, `models`, one
 *   canned stream-json run, one forced print-timeout partial run, the ACP
 *   handshake) and diffs the results against the code's own expectations —
 *   the real `buildAgyArgs`, `agyStreamParser`, `agyEventMapper`,
 *   `parseAgyModelsOutput`, and ACP handshake builders, not copies.
 *   Raw captures land in the output dir; any drift fails the exit code with
 *   a per-item report. Opt-in manual check (needs a real, authenticated
 *   agy): `node scripts/agy-conformance.mjs --out /tmp/agy-conf`.
 * @example node scripts/agy-conformance.mjs --out /tmp/agy-conf
 * @example node scripts/agy-conformance.mjs --out /tmp/agy-conf --skip-live
 ***/

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgyArgs } from "../api/agent/harnesses/antigravity/agyPermissions.js";
import { createAgyStreamParser } from "../api/agent/harnesses/antigravity/agyStreamParser.js";
import { createAgyEventMapper } from "../api/agent/harnesses/antigravity/agyEventMapper.js";
import { parseAgyModelsOutput } from "../api/agent/harnesses/antigravity/agyModelCatalog.js";
import {
	AGY_ACP_PROTOCOL_VERSION,
	buildAgyAcpHandshake,
	buildAgyAcpSessionParams,
} from "../api/agent/harnesses/antigravity/agyAcpSupport.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function usage(exitCode) {
	console.log(`Usage: node scripts/agy-conformance.mjs --out <dir> [--bin <agy>] [--skip-live]

  --out <dir>   Capture directory (created; raw CLI outputs land here).
  --bin <path>  agy binary (default: $KAINBAIN_AGY_BIN or "agy" on PATH).
  --skip-live   Only version/help/argv/models checks (no stream-json runs, no ACP).`);
	process.exit(exitCode);
}

const argv = process.argv.slice(2);
let outDir = null;
let agyBin = process.env.KAINBAIN_AGY_BIN || "agy";
let skipLive = false;
for (let i = 0; i < argv.length; i += 1) {
	if (argv[i] === "--out" && argv[i + 1]) outDir = argv[(i += 1)];
	else if ((argv[i] === "--bin" || argv[i] === "--agy-bin") && argv[i + 1]) agyBin = argv[(i += 1)];
	else if (argv[i] === "--skip-live") skipLive = true;
	else if (argv[i] === "--help" || argv[i] === "-h") usage(0);
	else usage(2);
}
if (!outDir) usage(2);
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function check(name, ok, detail = "") {
	results.push({ name, ok, detail });
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function writeCapture(name, text) {
	fs.writeFileSync(path.join(outDir, name), String(text ?? ""));
}

function runCapture(args, { timeoutMs = 60000, cwd = outDir, input = null } = {}) {
	return new Promise((resolve) => {
		let child;
		try {
			child = spawn(agyBin, args, { cwd, env: process.env });
		} catch (error) {
			resolve({ error: String(error?.message || error), stdout: "", stderr: "", code: null });
			return;
		}
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (value) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			finish({ error: `timed out after ${timeoutMs}ms`, stdout, stderr, code: null, timedOut: true });
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			finish({ error: String(error?.message || error), stdout, stderr, code: null });
		});
		child.on("close", (code) => {
			finish({ error: null, stdout, stderr, code });
		});
		if (input !== null) {
			try {
				child.stdin.write(input);
				child.stdin.end();
			} catch {
				// child already gone
			}
		}
	});
}

function parseNdjson(text) {
	const parser = createAgyStreamParser();
	const rows = [...parser.push(text), ...parser.flush()];
	const mapper = createAgyEventMapper();
	const events = rows.flatMap((row) => mapper.map(row));
	return { rows, events };
}

const AUTH_PATTERN =
	/authenticat|auth login|not logged in|login required|unauthorized|unauthorised|unauthenticated|invalid credential|expired credential|missing credential/i;

// --- 1. version ---------------------------------------------------------------
const versionRun = await runCapture(["--version"], { timeoutMs: 15000 });
writeCapture("version.txt", `exit=${versionRun.code}\nstdout:\n${versionRun.stdout}\nstderr:\n${versionRun.stderr}\n`);
const versionText = `${versionRun.stdout}\n${versionRun.stderr}`.trim();
const versionMatch = versionText.match(/(\d+\.\d+\.\d+)/);
check(
	"version: agy --version answers with a version",
	!versionRun.error && versionRun.code === 0 && Boolean(versionMatch),
	versionMatch ? `agy ${versionMatch[1]}` : (versionRun.error || `exit ${versionRun.code}: ${versionText.slice(0, 120)}`),
);

// --- 2. help + argv flag matrix -------------------------------------------------
const helpRun = await runCapture(["--help"], { timeoutMs: 15000 });
writeCapture("help.txt", `exit=${helpRun.code}\nstdout:\n${helpRun.stdout}\nstderr:\n${helpRun.stderr}\n`);
// The CLI prints usage to stderr (Go flag package), so both streams count.
const help = `${helpRun.stdout || ""}\n${helpRun.stderr || ""}`;
const helpOk = !helpRun.error && helpRun.code === 0 && help.trim().length > 0;
check("help: agy --help answers", helpOk, helpOk ? `${help.length} bytes` : (helpRun.error || `exit ${helpRun.code}`));

// Every flag the harness constructs must exist on the installed CLI.
const sampleArgv = buildAgyArgs({
	prompt: "conformance probe",
	conversationId: "conv-probe",
	modelSlug: "probe-model",
	effort: "high",
	printTimeout: "10m",
	sandbox: true,
	skipPermissions: true,
});
const constructedFlags = [...new Set(sampleArgv.filter((token) => token.startsWith("--")))];
const missingFlags = constructedFlags.filter((flag) => !help.includes(flag));
check(
	"argv: every flag buildAgyArgs constructs exists in agy --help",
	helpOk && missingFlags.length === 0,
	helpOk
		? (missingFlags.length === 0
			? constructedFlags.join(" ")
			: `missing from --help: ${missingFlags.join(", ")}`)
		: "no help output to diff against",
);
for (const subcommand of ["models", "acp"]) {
	check(
		`argv: '${subcommand}' subcommand listed in agy --help`,
		helpOk && new RegExp(`\\b${subcommand}\\b`).test(help),
		helpOk ? "" : "no help output to diff against",
	);
}
// The effort value set the harness advertises must be accepted by the CLI.
const EXPECTED_EFFORTS = ["low", "medium", "high", "xhigh", "max"]; // mirrors reasoningLevels in agyHarness.js
const effortLine = (help.match(/[^\n]*--effort[^\n]*/g) || []).join(" ");
const missingEfforts = EXPECTED_EFFORTS.filter((level) => !effortLine.includes(level));
check(
	"argv: --effort accepts the harness's full level set (low|medium|high|xhigh|max)",
	helpOk && missingEfforts.length === 0,
	helpOk
		? (missingEfforts.length === 0 ? effortLine.trim().slice(0, 120) : `missing levels: ${missingEfforts.join(", ")}`)
		: "no help output to diff against",
);

// --- 3. models -----------------------------------------------------------------
const modelsRun = await runCapture(["models"], { timeoutMs: 60000 });
writeCapture("models-stdout.txt", modelsRun.stdout);
writeCapture("models-stderr.txt", modelsRun.stderr);
const parsedModels = parseAgyModelsOutput(modelsRun.stdout || "");
if (AUTH_PATTERN.test(`${modelsRun.stdout}\n${modelsRun.stderr}`)) {
	check("models: agy models parses to a non-empty list", false, "CLI reports an auth problem — run `agy auth login`, then retry");
} else {
	check(
		"models: agy models parses to a non-empty list",
		!modelsRun.error && modelsRun.code === 0 && parsedModels.length > 0,
		modelsRun.error || (modelsRun.code !== 0
			? `exit ${modelsRun.code}: ${(modelsRun.stderr || "").trim().slice(0, 160)}`
			: `${parsedModels.length} models (e.g. ${parsedModels[0]?.id || "?"})`),
	);
}

if (!skipLive) {
	// --- 4. canned stream-json run ------------------------------------------------
	const liveRun = await runCapture(
		["-p", "reply with exactly OK", "--output-format", "stream-json", "--dangerously-skip-permissions"],
		{ timeoutMs: 180000 },
	);
	writeCapture("run-ok.ndjson", liveRun.stdout);
	writeCapture("run-ok.stderr.txt", liveRun.stderr);
	if (AUTH_PATTERN.test(`${liveRun.stdout}\n${liveRun.stderr}`)) {
		check("live: canned stream-json run completes with real output", false, "CLI reports an auth problem — run `agy auth login`, then retry");
	} else {
		const { rows, events } = parseNdjson(liveRun.stdout || "");
		const types = events.map((event) => event.type);
		const deltas = events.filter((event) => event.type === "assistant_delta").map((event) => event.delta).join("");
		const finished = types.includes("run_finished");
		const errored = types.includes("run_error");
		const hasConversation = rows.some((row) => row.conversationId);
		check(
			"live: canned stream-json run completes with real output",
			!liveRun.error && liveRun.code === 0 && finished && !errored && (deltas.includes("OK") || rows.some((row) => String(row.payload?.response || "").includes("OK"))) && hasConversation,
			liveRun.error || `exit=${liveRun.code} rows=${rows.length} events=${types.join(",") || "(none)"} deltas=${JSON.stringify(deltas.slice(0, 60))}`,
		);
		check(
			"live: deltas stream as assistant_delta (framing parses — not harness_log)",
			types.includes("assistant_delta"),
			`events=${types.join(",") || "(none)"}`,
		);
	}

	// --- 5. forced print-timeout partial run ---------------------------------------
	const partialRun = await runCapture(
		["-p", "Write a 5000-word essay about the history of concrete, covering every century in extreme detail with many examples", "--output-format", "stream-json", "--print-timeout", "1s", "--dangerously-skip-permissions"],
		{ timeoutMs: 120000 },
	);
	writeCapture("run-partial.ndjson", partialRun.stdout);
	writeCapture("run-partial.stderr.txt", partialRun.stderr);
	const { events: partialEvents } = parseNdjson(partialRun.stdout || "");
	const partialTypes = partialEvents.map((event) => event.type);
	check(
		"live: forced print-timeout run reports run_error (never run_finished)",
		!partialRun.error && partialTypes.includes("run_error") && !partialTypes.includes("run_finished"),
		partialRun.error || `exit=${partialRun.code} events=${partialTypes.join(",") || "(none)"}`,
	);

	// --- 6. ACP handshake -----------------------------------------------------------
	const acpResult = await new Promise((resolve) => {
		let child;
		try {
			child = spawn(agyBin, ["acp"], { cwd: outDir, env: process.env, stdio: ["pipe", "pipe", "pipe"] });
		} catch (error) {
			resolve({ error: String(error?.message || error) });
			return;
		}
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {
				// already gone
			}
			resolve({ error: "ACP handshake timed out after 60000ms", stdout, stderr });
		}, 60000);
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			resolve({ error: String(error?.message || error), stdout, stderr });
		});
		const handshake = buildAgyAcpHandshake();
		const sessionParams = buildAgyAcpSessionParams({ cwd: outDir });
		const frames = [
			{ jsonrpc: "2.0", id: 1, method: "initialize", params: handshake },
			{ jsonrpc: "2.0", id: 2, method: "session/new", params: sessionParams },
		];
		try {
			for (const frame of frames) child.stdin.write(`${JSON.stringify(frame)}\n`);
		} catch (error) {
			clearTimeout(timer);
			resolve({ error: String(error?.message || error), stdout, stderr });
			return;
		}
		const poll = setInterval(() => {
			const answers = {};
			for (const line of stdout.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed.startsWith("{")) continue;
				try {
					const parsed = JSON.parse(trimmed);
					if (parsed?.id === 1 || parsed?.id === 2) answers[parsed.id] = parsed;
				} catch {
					// partial line — keep waiting
				}
			}
			if (answers[1] && answers[2]) {
				clearInterval(poll);
				clearTimeout(timer);
				try {
					child.stdin.end();
					child.kill("SIGKILL");
				} catch {
					// already gone
				}
				resolve({ error: null, stdout, stderr, answers });
			}
		}, 100);
	});
	writeCapture("acp-transcript.jsonl", acpResult.stdout || "");
	writeCapture("acp-stderr.txt", acpResult.stderr || "");
	const initAnswer = acpResult.answers?.[1];
	const newAnswer = acpResult.answers?.[2];
	check(
		`acp: initialize with protocolVersion ${AGY_ACP_PROTOCOL_VERSION} is accepted`,
		!acpResult.error && initAnswer?.result?.protocolVersion === AGY_ACP_PROTOCOL_VERSION,
		acpResult.error || `protocolVersion=${initAnswer?.result?.protocolVersion ?? JSON.stringify(initAnswer)?.slice(0, 160)}`,
	);
	check(
		"acp: session/new with the harness params returns a sessionId",
		!acpResult.error && typeof newAnswer?.result?.sessionId === "string",
		acpResult.error || `answer=${JSON.stringify(newAnswer)?.slice(0, 160)}`,
	);
}

// --- summary --------------------------------------------------------------------
const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} conformance checks passed (captures in ${outDir}).`);
if (failed.length > 0) {
	console.log("Drift items:");
	for (const item of failed) console.log(`  - ${item.name}${item.detail ? `: ${item.detail}` : ""}`);
	process.exit(1);
}
