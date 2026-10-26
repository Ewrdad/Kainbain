#!/usr/bin/env node
/***
 * MARK: repeat-tests.mjs
 * @description Flake-reproduction runner. One test suite is run `--runs`
 *   times, back to back, standalone, and every run's PASS/FAIL is printed
 *   with its wall time plus a final pass-rate table. This turns "it failed
 *   once in CI" into a measurable hit rate, which is the only honest way to
 *   know whether a flake is fixed: a fix is done when the rate is 100%, not
 *   when the failing run happens to be followed by a green one.
 *
 *   Each run appends one JSON object to a JSONL log under the OS temp dir
 *   (never committed) and keeps the raw suite output beside it, so a failing
 *   run's exact signature can be read afterwards. Exit code 0 means every
 *   run passed; 1 means at least one did not; 2 means the arguments were bad.
 *
 *   Usage:
 *     node scripts/repeat-tests.mjs --suite api --pattern api/index.test.js --runs 10
 *     node scripts/repeat-tests.mjs --suite frontend --pattern StageSkillsPanel --runs 10
 *     node scripts/repeat-tests.mjs --suite canary --runs 3
 * @example node scripts/repeat-tests.mjs --suite api --pattern api/flow/schedulerIdle.test.js
 ***/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmExecutable, runParallel } from "./lib/run-parallel.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/***
 * MARK: suiteDirectories
 * @description Maps a public suite name to its npm workspace directory.
 * @example suiteDirectories.frontend => "frontend"
 ***/
export const suiteDirectories = { api: "api", frontend: "frontend", canary: "canary-e2e" };

/***
 * MARK: parseArgs
 * @description Reads the CLI flags into options. Unknown flags and bad values
 *   throw, so the caller can print usage and exit 2 instead of guessing.
 * @example parseArgs(["--suite", "api", "--runs", "3"]) => { suite: "api", runs: 3, ... }
 * @param {Array<string>} argv
 * @returns {Object}
 ***/
export function parseArgs(argv) {
	const options = { suite: "api", pattern: "", runs: 5, jsonl: "", timeoutSecs: 0, help: false };
	for (let index = 0; index < argv.length; index++) {
		const flag = argv[index];
		const value = () => {
			const next = argv[++index];
			if (next === undefined) throw new Error(`Missing value for ${flag}`);
			return next;
		};
		if (flag === "--suite") options.suite = value();
		else if (flag === "--pattern") options.pattern = value();
		else if (flag === "--runs") options.runs = Number(value());
		else if (flag === "--jsonl") options.jsonl = value();
		else if (flag === "--timeout") options.timeoutSecs = Number(value());
		else if (flag === "--help" || flag === "-h") options.help = true;
		else throw new Error(`Unknown option "${flag}"`);
	}
	if (!(options.suite in suiteDirectories)) {
		throw new Error(`Unknown suite "${options.suite}" (expected ${Object.keys(suiteDirectories).join(", ")})`);
	}
	if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error("--runs must be a positive integer");
	return options;
}

/***
 * MARK: normalizePattern
 * @description Makes a caller-supplied file pattern relative to the suite
 *   workspace, because the suite runner resolves positional filters against
 *   its own directory (`api/index.test.js` must become `index.test.js` when
 *   vitest runs with cwd `api`). A pattern without the suite prefix (e.g. a
 *   bare `StageSkillsPanel`, matched as a substring) is passed through.
 * @example normalizePattern("api", "api/index.test.js") => "index.test.js"
 * @param {string} suite
 * @param {string} [pattern]
 * @returns {string}
 ***/
export function normalizePattern(suite, pattern = "") {
	if (!(suite in suiteDirectories)) throw new Error(`Unknown suite "${suite}"`);
	const normalized = String(pattern).replace(/\\/g, "/").replace(/^\.\//, "").trim();
	const prefix = `${suiteDirectories[suite]}/`;
	return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
}

/***
 * MARK: buildRepeatCommand
 * @description Builds the shell-free spawn shape for one suite run. The
 *   optional pattern is a positional filter passed to the suite's own
 *   runner (vitest file filter, Playwright grep spec) — it never becomes a
 *   shell string.
 * @example buildRepeatCommand("api", "api/index.test.js") => { file: "npm", args: ["run", "test", "--prefix", "api", "--", "index.test.js"], cwd: ... }
 * @param {string} suite
 * @param {string} [pattern]
 * @param {Object} [opts]
 * @param {string} [opts.npmExec] - defaults to the platform npm binary.
 * @returns {{ name: string, file: string, args: Array<string>, cwd: string }}
 ***/
export function buildRepeatCommand(suite, pattern = "", { npmExec = npmExecutable() } = {}) {
	if (!(suite in suiteDirectories)) throw new Error(`Unknown suite "${suite}"`);
	const relativePattern = normalizePattern(suite, pattern);
	const args = ["run", "test", "--prefix", suiteDirectories[suite]];
	if (relativePattern) args.push("--", relativePattern);
	return { name: suite + (pattern ? ` (${pattern})` : ""), file: npmExec, args, cwd: REPO_ROOT };
}

/***
 * MARK: extractFailureSignatures
 * @description Pulls the per-test failure headlines out of a suite's raw
 *   output so the JSONL log carries a readable signature (vitest `FAIL`
 *   lines, plus the first `Error:` lines when a run died before any test
 *   reported). ANSI colour is stripped first.
 * @example extractFailureSignatures("\u001b[31m FAIL \u001b[39m src/a.test.jsx > works") => ["src/a.test.jsx > works"]
 * @param {string} output
 * @param {number} [limit] - max signatures kept (default 5).
 * @returns {Array<string>}
 ***/
export function extractFailureSignatures(output, limit = 5) {
	const plain = String(output).replace(/\u001b\[[0-9;]*m/g, "");
	const signatures = [];
	for (const line of plain.split("\n")) {
		const failLine = line.match(/^\s*FAIL\s+(.+?)\s*$/);
		const errorLine = line.match(/^\s*(?:Error|Timeout Error)\s*:\s*(.+?)\s*$/);
		const match = failLine || errorLine;
		const signature = match ? match[1] : "";
		if (signature && !signatures.includes(signature)) signatures.push(signature);
		if (signatures.length >= limit) break;
	}
	return signatures;
}

/***
 * MARK: summarizeRuns
 * @description Condenses the per-run records into the numbers the audit table
 *   needs: pass count/rate, the failing run numbers, and the distinct failure
 *   signatures seen.
 * @example summarizeRuns([{ status: "PASS", run: 1 }]) => { total: 1, passed: 1, passRate: 1, failingRuns: [] }
 * @param {Array<Object>} records
 * @returns {{ total: number, passed: number, failed: number, passRate: number, failingRuns: Array<number>, failureSignatures: Array<string> }}
 ***/
export function summarizeRuns(records) {
	const failures = records.filter((record) => record.status !== "PASS");
	const signatures = [];
	for (const record of failures) {
		for (const signature of record.failureSignatures || []) {
			if (!signatures.includes(signature)) signatures.push(signature);
		}
	}
	return {
		total: records.length,
		passed: records.length - failures.length,
		failed: failures.length,
		passRate: records.length === 0 ? 0 : (records.length - failures.length) / records.length,
		failingRuns: failures.map((record) => record.run),
		failureSignatures: signatures,
	};
}

/***
 * MARK: defaultRunner
 * @description The real run step: reuses the gate's overlap helper for one
 *   branch, silencing its PASS/FAIL line so this script owns the reporting.
 * @example await defaultRunner({ file: "npm", args: ["run", "test"] }, { cwd: "/repo" })
 * @param {Object} branch
 * @param {Object} opts
 * @returns {Promise<Object>} { ok, exitCode, output, wallSecs }.
 ***/
async function defaultRunner(branch, { cwd }) {
	const { results } = await runParallel([branch], { cwd, write: () => {} });
	return results[0];
}

/***
 * MARK: runRepeat
 * @description Runs the suite `runs` times sequentially, writing one JSONL
 *   record and one raw-output file per run under `logDir`, then prints the
 *   per-run table and pass rate. Returns ok:true only when every run passed.
 * @example const { ok } = await runRepeat({ suite: "api", pattern: "index.test.js", runs: 3 })
 * @param {Object} options
 * @param {string} options.suite
 * @param {string} [options.pattern]
 * @param {number} [options.runs]
 * @param {string} [options.jsonl] - JSONL path; defaults under os.tmpdir().
 * @param {string} [options.logDir] - raw-output dir; defaults beside the JSONL.
 * @param {number} [options.timeoutSecs] - per-run SIGKILL budget; 0 = none.
 * @param {Function} [options.runner] - run seam (tests inject a fake).
 * @param {Function} [options.write] - line sink, defaults to stdout.
 * @returns {Promise<Object>} { ok, records, summary, jsonlPath, logDir }
 ***/
export async function runRepeat({ suite, pattern = "", runs = 5, jsonl = "", logDir = "", timeoutSecs = 0, runner = defaultRunner, write = (text) => process.stdout.write(text) }) {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const baseDir = logDir || path.join(os.tmpdir(), "kainbain-flake-repeat");
	fs.mkdirSync(baseDir, { recursive: true });
	const jsonlPath = jsonl || path.join(baseDir, `repeat-${suite}-${stamp}.jsonl`);
	const command = buildRepeatCommand(suite, pattern);
	const records = [];
	const timeoutMs = Number(timeoutSecs) > 0 ? Number(timeoutSecs) * 1000 : undefined;
	write(`Repeating ${command.name} ${runs}x (JSONL: ${jsonlPath})\n`);
	for (let run = 1; run <= runs; run++) {
		const result = await runner({ ...command, timeoutMs }, { cwd: command.cwd });
		const rawPath = path.join(baseDir, `repeat-${suite}-${stamp}-run${run}.log`);
		fs.writeFileSync(rawPath, result.output || "");
		const record = {
			suite,
			pattern,
			run,
			status: result.ok ? "PASS" : "FAIL",
			exitCode: result.exitCode ?? null,
			wallSecs: result.wallSecs ?? null,
			failureSignatures: result.ok ? [] : extractFailureSignatures(result.output || ""),
			rawOutputPath: rawPath,
			finishedAt: new Date().toISOString(),
		};
		records.push(record);
		fs.appendFileSync(jsonlPath, `${JSON.stringify(record)}\n`);
		write(`  run ${String(run).padStart(2)}/${runs}  ${record.status}  ${record.wallSecs ?? "?"}s  ${record.failureSignatures.join("; ")}\n`);
	}
	const summary = summarizeRuns(records);
	write(`pass rate: ${summary.passed}/${summary.total} (${(summary.passRate * 100).toFixed(1)}%)\n`);
	if (summary.failed > 0) write(`failing runs: ${summary.failingRuns.join(", ")}\n`);
	return { ok: summary.failed === 0, records, summary, jsonlPath, logDir: baseDir };
}

/***
 * MARK: usage
 * @description Prints the accepted flags.
 * @example usage() => "Usage: node scripts/repeat-tests.mjs ..."
 ***/
function usage() {
	return [
		"Usage: node scripts/repeat-tests.mjs [--suite api|frontend|canary] [--pattern <file filter>] [--runs N]",
		"       [--jsonl <path>] [--timeout <secs>]",
		"",
		"Repeats one suite N times and reports the per-run pass rate so flaky tests can be measured and proven fixed.",
	].join("\n");
}

async function main() {
	let options;
	try {
		options = parseArgs(process.argv.slice(2));
	} catch (error) {
		console.error(error.message);
		console.error(usage());
		process.exitCode = 2;
		return;
	}
	if (options.help) {
		console.log(usage());
		return;
	}
	const result = await runRepeat(options);
	process.exitCode = result.ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main();
}
