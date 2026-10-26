import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repo root as seen from this test file — the runner must resolve the same
// root from its own location, so the assertion stays true in any checkout
// (main checkout, CI worktree, or an isolated verification worktree).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { parseArgs, normalizePattern, buildRepeatCommand, extractFailureSignatures, summarizeRuns, runRepeat, suiteDirectories } =
	await import("../scripts/repeat-tests.mjs");

/***
 * MARK: repeat-tests tests
 * @description Hermetic tests for the flake-reproduction runner
 *   (scripts/repeat-tests.mjs): argument parsing, the shell-free spawn shape
 *   for each suite, failure-signature extraction, the pass-rate summary, and
 *   the JSONL/raw-output bookkeeping — all driven through an injected fake
 *   runner, so no real vitest suite is ever spawned here. The real suites are
 *   exercised by `npm test` and by the runner itself.
 * @example run `node --test tests/repeat-tests.test.mjs`
 ***/

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-repeat-test-"));
}

describe("parseArgs", () => {
	it("defaults to the api suite, 5 runs, no pattern", () => {
		const options = parseArgs([]);
		assert.equal(options.suite, "api");
		assert.equal(options.runs, 5);
		assert.equal(options.pattern, "");
		assert.equal(options.help, false);
	});

	it("parses every flag", () => {
		const options = parseArgs(["--suite", "canary", "--pattern", "smoke", "--runs", "3", "--jsonl", "/tmp/x.jsonl", "--timeout", "120"]);
		assert.equal(options.suite, "canary");
		assert.equal(options.pattern, "smoke");
		assert.equal(options.runs, 3);
		assert.equal(options.jsonl, "/tmp/x.jsonl");
		assert.equal(options.timeoutSecs, 120);
	});

	it("rejects an unknown suite, unknown flag, and non-positive runs", () => {
		assert.throws(() => parseArgs(["--suite", "unit"]), /Unknown suite/);
		assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
		assert.throws(() => parseArgs(["--runs", "0"]), /positive integer/);
		assert.throws(() => parseArgs(["--runs", "abc"]), /positive integer/);
	});

	it("rejects a flag with no value", () => {
		assert.throws(() => parseArgs(["--suite"]), /Missing value/);
	});
});

describe("normalizePattern", () => {
	it("strips the suite directory prefix so the runner resolves the filter in its own workspace", () => {
		assert.equal(normalizePattern("api", "api/index.test.js"), "index.test.js");
		assert.equal(normalizePattern("frontend", "frontend/src/App.test.jsx"), "src/App.test.jsx");
		assert.equal(normalizePattern("canary", "./tests/functional.spec.js"), "tests/functional.spec.js");
	});

	it("passes through a bare substring filter unchanged", () => {
		assert.equal(normalizePattern("frontend", "StageSkillsPanel"), "StageSkillsPanel");
		assert.equal(normalizePattern("api", ""), "");
	});

	it("rejects an unknown suite", () => {
		assert.throws(() => normalizePattern("nope", "x"), /Unknown suite/);
	});
});

describe("buildRepeatCommand", () => {
	it("targets the suite workspace through npm with no shell", () => {
		const command = buildRepeatCommand("frontend", "", { npmExec: "npm" });
		assert.equal(command.file, "npm");
		assert.deepEqual(command.args, ["run", "test", "--prefix", "frontend"]);
		assert.equal(command.shell, undefined);
		// Location-independent: the runner resolves the repo root from its own
		// module path, not from the checkout's directory name.
		assert.equal(command.cwd, REPO_ROOT);
	});

	it("passes the pattern as a workspace-relative positional filter after --", () => {
		const command = buildRepeatCommand("api", "api/index.test.js", { npmExec: "npm" });
		assert.deepEqual(command.args, ["run", "test", "--prefix", "api", "--", "index.test.js"]);
		assert.match(command.name, /api\/index\.test\.js/);
	});

	it("maps canary to its own workspace", () => {
		assert.deepEqual(Object.keys(suiteDirectories).sort(), ["api", "canary", "frontend"]);
		assert.deepEqual(buildRepeatCommand("canary", "", { npmExec: "npm" }).args, ["run", "test", "--prefix", "canary-e2e"]);
	});

	it("rejects an unknown suite", () => {
		assert.throws(() => buildRepeatCommand("nope"), /Unknown suite/);
	});
});

describe("extractFailureSignatures", () => {
	it("strips ANSI colour and keeps vitest FAIL headlines once each", () => {
		const output = [
			"\u001b[41m FAIL \u001b[49m src/a.test.jsx > renders the panel",
			"  some detail",
			"\u001b[41m FAIL \u001b[49m src/a.test.jsx > renders the panel",
			"\u001b[41m FAIL \u001b[49m src/b.test.jsx > handles empty state",
		].join("\n");
		assert.deepEqual(extractFailureSignatures(output), ["src/a.test.jsx > renders the panel", "src/b.test.jsx > handles empty state"]);
	});

	it("falls back to Error lines when the run died before reporting tests", () => {
		assert.deepEqual(extractFailureSignatures("Error: Cannot find module 'node:fs'\n"), ["Cannot find module 'node:fs'"]);
	});

	it("caps the number of signatures", () => {
		const output = Array.from({ length: 9 }, (_, index) => ` FAIL src/t${index}.test.js > case ${index}`).join("\n");
		assert.equal(extractFailureSignatures(output, 3).length, 3);
	});

	it("returns an empty list for a clean run", () => {
		assert.deepEqual(extractFailureSignatures("Test Files 2 passed (2)"), []);
	});
});

describe("summarizeRuns", () => {
	it("counts passes, failing run numbers, and distinct signatures", () => {
		const summary = summarizeRuns([
			{ run: 1, status: "PASS", failureSignatures: [] },
			{ run: 2, status: "FAIL", failureSignatures: ["src/a.test.jsx > renders"] },
			{ run: 3, status: "FAIL", failureSignatures: ["src/a.test.jsx > renders", "Error: boom"] },
		]);
		assert.equal(summary.total, 3);
		assert.equal(summary.passed, 1);
		assert.equal(summary.failed, 2);
		assert.deepEqual(summary.failingRuns, [2, 3]);
		assert.deepEqual(summary.failureSignatures, ["src/a.test.jsx > renders", "Error: boom"]);
		assert.ok(Math.abs(summary.passRate - 1 / 3) < 1e-9);
	});

	it("reports a zero pass rate for an empty record set without dividing by zero", () => {
		assert.equal(summarizeRuns([]).passRate, 0);
	});
});

describe("runRepeat", () => {
	it("runs the suite N times, logs JSONL + raw output, and reports a green pass rate", async () => {
		const dir = makeTempDir();
		try {
			const calls = [];
			const runner = async () => ({ ok: true, exitCode: 0, output: "Test Files 1 passed (1)", wallSecs: 2 });
			const lines = [];
			const result = await runRepeat({
				suite: "api",
				pattern: "index.test.js",
				runs: 3,
				logDir: dir,
				runner: (command, opts) => {
					calls.push(command);
					return runner(command, opts);
				},
				write: (text) => lines.push(text),
			});
			assert.equal(result.ok, true);
			assert.equal(result.records.length, 3);
			assert.equal(result.summary.passRate, 1);
			assert.equal(calls.length, 3);
			assert.ok(calls.every((command) => command.args.join(" ") === "run test --prefix api -- index.test.js"));
			const jsonl = fs.readFileSync(result.jsonlPath, "utf8").trim().split("\n");
			assert.equal(jsonl.length, 3);
			assert.equal(JSON.parse(jsonl[0]).status, "PASS");
			for (const record of result.records) assert.ok(fs.existsSync(record.rawOutputPath));
			assert.match(lines.join(""), /pass rate: 3\/3/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("records failures with their signatures and returns ok:false", async () => {
		const dir = makeTempDir();
		try {
			let call = 0;
			const runner = async () => {
				call += 1;
				if (call === 2) return { ok: false, exitCode: 1, output: " FAIL src/a.test.jsx > renders\nError: Test timed out in 5000ms.", wallSecs: 9 };
				return { ok: true, exitCode: 0, output: "Test Files 1 passed (1)", wallSecs: 3 };
			};
			const lines = [];
			const result = await runRepeat({ suite: "frontend", pattern: "a", runs: 3, logDir: dir, runner, write: (text) => lines.push(text) });
			assert.equal(result.ok, false);
			assert.deepEqual(result.summary.failingRuns, [2]);
			assert.deepEqual(result.summary.failureSignatures, ["src/a.test.jsx > renders", "Test timed out in 5000ms."]);
			assert.match(lines.join(""), /pass rate: 2\/3 \(66.7%\)/);
			assert.equal(JSON.parse(fs.readFileSync(result.jsonlPath, "utf8").trim().split("\n")[1]).exitCode, 1);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});
