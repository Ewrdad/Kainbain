import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";

const { runParallel, resolveProgressIntervalMs, formatElapsedSeconds } = await import(
	"../scripts/lib/run-parallel.mjs"
);

/***
 * MARK: run-parallel tests
 * @description Hermetic tests for the overlap helper (scripts/lib/run-parallel.mjs),
 *   ported from tests/run-tests-parallel.test.sh cases 1-4 plus the no-worker-cap
 *   assertion (case 5, retargeted at scripts/run-tests.mjs). Locks the two
 *   behaviors that make the overlapped gate safe: every branch always runs to
 *   completion (no early kill hides a failure), and any single branch failure
 *   fails the whole step (ok:false with the failure output shown). Fast and
 *   hermetic: branches are node one-liners only (no POSIX `true`/`false`
 *   binaries, so the suite also passes on Windows).
 * @example run `node --test tests/run-parallel.test.mjs`
 ***/

const NODE = process.execPath;

// Cross-platform pass/fail stubs: `process.execPath` is absolute, so these
// resolve with no PATH lookup and work on Linux, macOS, and Windows.
const PASS_ARGS = ["-e", "process.exit(0)"];
const FAIL_ARGS = ["-e", "process.exitCode=1"];

// Collects every line the helper prints instead of writing to stdout.
function makeCollector() {
	const lines = [];
	return {
		lines,
		write: (text) => {
			lines.push(text);
		},
		joined: () => lines.join(""),
	};
}

describe("runParallel", () => {
	it("all branches pass -> ok:true with a PASS line per branch", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{ name: "Step A", file: NODE, args: PASS_ARGS },
				{ name: "Step B", file: NODE, args: PASS_ARGS },
			],
			{ write: out.write },
		);
		assert.equal(result.ok, true);
		assert.match(out.joined(), /Step A\.\.\. .*PASS/);
		assert.match(out.joined(), /Step B\.\.\. .*PASS/);
		assert.equal(result.results.length, 2);
		assert.ok(result.results.every((r) => r.ok));
	});

	it("one branch fails -> ok:false, FAIL names the branch, the other still passes, output shown", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{
					name: "Good Step",
					file: NODE,
					args: ["-e", "setTimeout(() => console.log('good-done'), 1000)"],
				},
				{
					name: "Bad Step",
					file: NODE,
					args: ["-e", "console.log('boom-output'); process.exitCode=1"],
				},
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /Bad Step\.\.\. .*FAIL/);
		assert.match(out.joined(), /Good Step\.\.\. .*PASS/);
		assert.match(out.joined(), /boom-output/);
	});

	it("all branches fail -> ok:false", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{ name: "Fail A", file: NODE, args: FAIL_ARGS },
				{ name: "Fail B", file: NODE, args: FAIL_ARGS },
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /Fail A\.\.\. .*FAIL/);
		assert.match(out.joined(), /Fail B\.\.\. .*FAIL/);
	});

	it("seven branches work (mirrors the gate overlap window)", async () => {
		const out = makeCollector();
		const branches = ["A", "B", "C", "D", "E", "F"].map((name) => ({
			name,
			file: NODE,
			args: PASS_ARGS,
		}));
		branches.push({ name: "Y", file: NODE, args: FAIL_ARGS });
		const result = await runParallel(branches, { write: out.write });
		assert.equal(result.ok, false);
		assert.match(out.joined(), /Y\.\.\. .*FAIL/);
		assert.match(out.joined(), /A\.\.\. .*PASS/);
	});

	it("reports lines in argument order even when a later branch finishes first", async () => {
		const out = makeCollector();
		await runParallel(
			[
				{
					name: "Slow Step",
					file: NODE,
					args: ["-e", "setTimeout(() => {}, 800)"],
				},
				{ name: "Fast Step", file: NODE, args: PASS_ARGS },
			],
			{ write: out.write },
		);
		const text = out.joined();
		assert.ok(text.indexOf("Slow Step") < text.indexOf("Fast Step"));
	});

	it("a missing command fails its branch instead of crashing the run", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{ name: "Missing Step", file: "kainbain-no-such-command-xyz" },
				{ name: "Fine Step", file: NODE, args: PASS_ARGS },
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /Missing Step\.\.\. .*FAIL/);
		assert.match(out.joined(), /Fine Step\.\.\. .*PASS/);
	});

	it("passing branch output stays hidden", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{
					name: "Chatty Step",
					file: NODE,
					args: ["-e", "console.log('chatty-hidden-output')"],
				},
			],
			{ write: out.write },
		);
		assert.equal(result.ok, true);
		assert.doesNotMatch(out.joined(), /chatty-hidden-output/);
	});

	it("lowPriority branches still run (niceness is best-effort)", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[{ name: "Nice Step", file: NODE, args: PASS_ARGS, lowPriority: true }],
			{ write: out.write },
		);
		assert.equal(result.ok, true);
		assert.match(out.joined(), /Nice Step\.\.\. .*PASS/);
	});

	it("failure details keep the tail of long output, not the flood", async () => {
		const out = makeCollector();
		const prints = Array.from(
			{ length: 300 },
			(_, index) => `console.log('flood-line-${index}')`,
		).join(";");
		const result = await runParallel(
			[
				{
					name: "Noisy Step",
					file: NODE,
					args: ["-e", `${prints};process.exitCode=1`],
				},
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /Noisy Step\.\.\. .*FAIL/);
		// The tail (what diagnoses the failure) is shown...
		assert.match(out.joined(), /flood-line-299/);
		// ...the head (passing noise) is not.
		assert.doesNotMatch(out.joined(), /flood-line-0\n/);
		assert.doesNotMatch(out.joined(), /flood-line-42\n/);
		assert.match(out.joined(), /trimmed \d+ of \d+ lines/);
		// The captured result keeps everything for programmatic use.
		assert.match(result.results[0].output, /flood-line-0/);
		assert.match(result.results[0].output, /flood-line-299/);
	});

	it("short failure output prints whole with no trim marker", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{
					name: "Brief Step",
					file: NODE,
					args: ["-e", "console.log('brief-boom');process.exitCode=1"],
				},
			],
			{ write: out.write },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /brief-boom/);
		assert.doesNotMatch(out.joined(), /trimmed \d+ of \d+ lines/);
	});

	it("failureOutputTailLines tunes the kept tail", async () => {
		const out = makeCollector();
		const prints = Array.from(
			{ length: 60 },
			(_, index) => `console.log('tuned-line-${index}')`,
		).join(";");
		const result = await runParallel(
			[
				{
					name: "Tuned Step",
					file: NODE,
					args: ["-e", `${prints};process.exitCode=1`],
				},
			],
			{ write: out.write, failureOutputTailLines: 10 },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /tuned-line-59/);
		assert.doesNotMatch(out.joined(), /tuned-line-49\n/);
		assert.match(out.joined(), /trimmed 50 of 60 lines/);
	});
});

describe("runParallel progress output (no silent blackout)", () => {
	it("announces every branch at spawn, in argument order, before any result line", async () => {
		const out = makeCollector();
		await runParallel(
			[
				{ name: "First Step", file: NODE, args: PASS_ARGS },
				{ name: "Second Step", file: NODE, args: PASS_ARGS },
			],
			{ write: out.write },
		);
		const text = out.joined();
		assert.ok(text.includes("▸ started First Step\n"));
		assert.ok(text.includes("▸ started Second Step\n"));
		assert.ok(text.indexOf("▸ started First Step") < text.indexOf("▸ started Second Step"));
		// The completion contract is unchanged and still present.
		assert.match(text, /First Step\.\.\. .*PASS/);
		assert.match(text, /Second Step\.\.\. .*PASS/);
	});

	it("emits a still-running tick naming outstanding branches while a slow branch runs", async () => {
		// Deterministic by construction: a stub spawn settles the fast branch
		// on the next macrotask while the slow branch stays outstanding past
		// several ticks. The previous shape (two real node spawns, 80ms tick)
		// raced spawn latency against the first tick under a loaded gate and
		// flaked with the fast branch still outstanding at tick time.
		const stubSpawn = (file) => {
			const child = new EventEmitter();
			setTimeout(() => child.emit("close", 0), file === "slow" ? 400 : 0);
			return child;
		};
		const out = makeCollector();
		const result = await runParallel(
			[
				{ name: "Slow Step", file: "slow" },
				{ name: "Fast Step", file: "fast" },
			],
			{ write: out.write, spawnFn: stubSpawn, progressIntervalMs: 80 },
		);
		assert.equal(result.ok, true);
		const ticks = out.lines.filter((line) => line.includes("still running:"));
		assert.ok(ticks.length >= 1, "expected at least one progress tick");
		assert.ok(ticks.every((line) => line.includes("Slow Step")));
		// The tick never claims a finished branch: the fast branch settles
		// before the first tick lands.
		assert.ok(!ticks.some((line) => line.includes("Fast Step")));
	});

	it("emits no tick when every branch settles inside the interval", async () => {
		const out = makeCollector();
		await runParallel(
			[{ name: "Quick Step", file: NODE, args: PASS_ARGS }],
			{ write: out.write, progressIntervalMs: 5000 },
		);
		assert.ok(!out.joined().includes("still running:"));
	});

	it("progressIntervalMs 0 disables the tick entirely", async () => {
		const out = makeCollector();
		await runParallel(
			[
				{
					name: "Slow Step",
					file: NODE,
					args: ["-e", "setTimeout(() => process.exit(0), 300)"],
				},
			],
			{ write: out.write, progressIntervalMs: 0 },
		);
		assert.ok(!out.joined().includes("still running:"));
	});

	it("an injected failing branch still prints its full details unchanged", async () => {
		const out = makeCollector();
		const result = await runParallel(
			[
				{
					name: "Bad Step",
					file: NODE,
					args: ["-e", "console.log('boom-detail'); process.exitCode=1"],
				},
			],
			{ write: out.write, progressIntervalMs: 50 },
		);
		assert.equal(result.ok, false);
		assert.match(out.joined(), /Bad Step\.\.\. .*FAIL/);
		assert.ok(out.joined().includes("boom-detail"));
	});

	it("resolveProgressIntervalMs: option wins, then env, then the 30s default", () => {
		assert.equal(resolveProgressIntervalMs({ intervalMs: 123 }), 123);
		assert.equal(resolveProgressIntervalMs({ intervalMs: 0 }), 0);
		assert.equal(
			resolveProgressIntervalMs({ env: { KAINBAIN_GATE_PROGRESS_INTERVAL_MS: "5000" } }),
			5000,
		);
		assert.equal(
			resolveProgressIntervalMs({ env: { KAINBAIN_GATE_PROGRESS_INTERVAL_MS: "0" } }),
			0,
		);
		assert.equal(resolveProgressIntervalMs({ env: {} }), 30000);
	});

	it("formatElapsedSeconds renders compact human durations", () => {
		assert.equal(formatElapsedSeconds(59), "59s");
		assert.equal(formatElapsedSeconds(62), "1m02s");
		assert.equal(formatElapsedSeconds(271), "4m31s");
		assert.equal(formatElapsedSeconds(-3), "0s");
	});
});

/***
 * MARK: hung-branch guard
 * @description A timed-out branch must FAIL the gate, never wedge it. Branches
 *   are process trees (`npm` → `sh` → `playwright`/`vite`) and every descendant
 *   inherits the branch's stdio pipes, so a `close`-only implementation waits
 *   forever after killing just the direct child (observed: a canary branch past
 *   its 15-minute budget kept the whole `npm test` hanging with no result line).
 *   These cases pin the bounded reap and the tree-wide kill.
 ***/
describe("hung-branch guard (a timed-out branch fails the gate, it cannot hang it)", () => {
	// A spawn seam that models the failure mode exactly: the branch never emits
	// `close` (its grandchildren hold the pipes), and `pid` is one nobody owns so
	// the kill falls back to `child.kill`. No real processes are needed.
	const neverClosingBranch = () => {
		const child = new EventEmitter();
		child.pid = 2147483647;
		child.kill = () => true;
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		return child;
	};

	it("reports exit 124 and settles even when the branch never emits close", async () => {
		const out = makeCollector();
		const started = Date.now();
		const result = await runParallel([{ name: "Wedged Step", file: "wedged", timeoutMs: 50 }], {
			write: out.write,
			spawnFn: neverClosingBranch,
			termGraceMs: 20,
			settleGraceMs: 20,
		});
		const elapsed = Date.now() - started;
		assert.equal(result.ok, false);
		assert.equal(result.results[0].timedOut, true);
		assert.equal(result.results[0].exitCode, 124);
		assert.match(out.joined(), /Timed out after 50ms/);
		assert.match(out.joined(), /Wedged Step\.\.\. .*FAIL/);
		assert.ok(elapsed < 5000, `expected a bounded reap, took ${elapsed}ms`);
	});

	it("keeps the branch's captured output when it is reaped", async () => {
		const stubSpawn = () => {
			const child = neverClosingBranch();
			// Emit some output on the next macrotask (the real spawn path's data
			// listener is attached after the child is returned), then go quiet
			// without ever closing.
			setTimeout(() => child.stdout.emit("data", Buffer.from("partial canary output\n")), 0);
			return child;
		};
		const result = await runParallel([{ name: "Wedged Step", file: "wedged", timeoutMs: 30 }], {
			write: makeCollector().write,
			spawnFn: stubSpawn,
			termGraceMs: 20,
			settleGraceMs: 20,
		});
		assert.match(result.results[0].output, /partial canary output/);
	});

	it("reaps the whole branch process tree, not just the direct child", async (t) => {
		if (process.platform === "win32") {
			t.skip("POSIX process groups only; Windows uses taskkill /T");
			return;
		}
		// The branch spawns a grandchild that ignores SIGTERM and idles. Only a
		// group-wide kill reaches it; killing the direct child leaves it running
		// (and holding the branch's stdio, which is the hang above).
		const script = [
			'const { spawn } = require("node:child_process");',
			'const grandchild = spawn(process.execPath, ["-e", "process.on(\'SIGTERM\', () => {}); setInterval(() => {}, 1000);"], { stdio: "ignore" });',
			'process.stdout.write(String(grandchild.pid) + "\\n");',
			"setInterval(() => {}, 1000);",
		].join("\n");
		const result = await runParallel(
			// timeoutMs is deliberately generous: the assertion is that the
			// SIGTERM-ignoring grandchild is reaped tree-wide, not how fast a
			// cold `node -e` starts. A tight budget (400ms) raced process
			// startup on loaded CI hosts and killed the branch before it
			// printed the grandchild pid, failing the pid assertion for
			// scheduling reasons rather than a reap defect.
			[{ name: "Tree Step", file: NODE, args: ["-e", script], timeoutMs: 6000 }],
			{
				write: makeCollector().write,
				termGraceMs: 300,
				settleGraceMs: 100,
			},
		);
		assert.equal(result.results[0].timedOut, true);
		const pidLine = result.results[0].output
			.split("\n")
			.map((line) => line.trim())
			.find((line) => /^\d+$/.test(line));
		assert.ok(pidLine, `expected the grandchild pid in the branch output: ${result.results[0].output}`);
		const grandchildPid = Number(pidLine);
		let alive = true;
		for (let i = 0; i < 100 && alive; i += 1) {
			try {
				process.kill(grandchildPid, 0);
				await new Promise((resolve) => setTimeout(resolve, 50));
			} catch {
				alive = false;
			}
		}
		assert.equal(alive, false, "the grandchild should have been reaped with the branch's process group");
	});
});

describe("vitest workers: defaults govern (no cap)", () => {
	const repoRoot = path.resolve(import.meta.dirname, "..");

	it("scripts/run-tests.mjs sets no worker cap", () => {
		/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
		const runner = fs.readFileSync(path.join(repoRoot, "scripts", "run-tests.mjs"), "utf8");
		/* eslint-enable security/detect-non-literal-fs-filename */
		assert.doesNotMatch(runner, /VITEST_MAX_WORKERS/);
	});

	it("api vitest config uses vitest defaults", () => {
		const config = fs.readFileSync(path.join(repoRoot, "api", "vitest.config.js"), "utf8");
		assert.doesNotMatch(config, /VITEST_MAX_WORKERS/);
	});

	it("frontend vitest config uses vitest defaults", () => {
		const config = fs.readFileSync(path.join(repoRoot, "frontend", "vitest.config.js"), "utf8");
		assert.doesNotMatch(config, /VITEST_MAX_WORKERS/);
	});
});

describe("api worker pool: thread workers, per-file isolation kept", () => {
	const repoRoot = path.resolve(import.meta.dirname, "..");
	const config = () => fs.readFileSync(path.join(repoRoot, "api", "vitest.config.js"), "utf8");

	it("runs the api suite on the threads pool (no fork per file)", () => {
		// The recurring red `npm test` runs are `[vitest-pool]: Failed to start
		// forks worker …` (routes/workflows.test.js, routes/projects.docsSettings.test.js,
		// …) — 240+ fork()s inside the overlapped gate on a swap-full 4-core host.
		// The threads pool spawns one worker per file for ~1/6 of the memory.
		assert.match(config(), /pool:\s*["']threads["']/);
	});

	it("never disables per-file isolation", () => {
		// `isolate: false` would reuse one module graph across files; the api
		// stores and `config` are import-time singletons that capture the
		// per-file roots minted by testSetup.isolation.js (2026-10-06 incident:
		// suites wrote into the live projects root).
		assert.doesNotMatch(config(), /isolate:\s*false/);
	});

	it("keeps the per-file isolation setup file installed", () => {
		assert.match(config(), /testSetup\.isolation\.js/);
	});
});

describe("vitest node-env contract: node builtins stay out of shared happy-dom workers", () => {
	const repoRoot = path.resolve(import.meta.dirname, "..");

	function frontendTestFiles() {
		const out = [];
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					walk(full);
				} else if (/\.test\.[mc]?jsx?$/.test(entry.name)) {
					out.push(full);
				}
			}
		};
		walk(path.join(repoRoot, "frontend", "src"));
		return out;
	}

	function forksPinnedSuites() {
		const config = fs.readFileSync(path.join(repoRoot, "frontend", "vitest.config.js"), "utf8");
		const includes = [...config.matchAll(/include:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
			[...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((s) => s[1]),
		);
		return new Set(includes);
	}

	it("no frontend suite imports the api tree (no pin escape hatch)", () => {
		// The api graph carries `node:` builtins; a DOM-env suite that loads it
		// flakes under the overlapped gate with `No such built-in module: node:`
		// — and forks-pinning the suite does NOT fix it (the flake survived the
		// pin). Suites that need api behavior must use canned real-shaped
		// payloads instead (see ObservabilityDashboard.session.test.jsx; real
		// enrichment stays covered natively in api/taskStore.observability.test.js).
		const violations = [];
		for (const file of frontendTestFiles()) {
			const source = fs.readFileSync(file, "utf8");
			const importsApi =
				/from\s+['"]\.\.\/(?:\.\.\/)*api\//.test(source) ||
				/import\(\s*['"]\.\.\/(?:\.\.\/)*api\//.test(source);
			if (!importsApi) continue;
			violations.push(path.relative(path.join(repoRoot, "frontend"), file).replaceAll(path.sep, "/"));
		}
		assert.deepEqual(
			violations,
			[],
			`frontend suites must not import the api tree (use canned payloads): ${violations.join(", ")}`,
		);
	});

	it("every node:-importing suite runs in node env or the forks pool", () => {
		const pinned = forksPinnedSuites();
		const violations = [];
		for (const file of frontendTestFiles()) {
			const source = fs.readFileSync(file, "utf8");
			const touchesNode =
				/from\s+['"]node:/.test(source) || /import\(\s*['"]node:/.test(source);
			if (!touchesNode) continue;
			const rel = path.relative(path.join(repoRoot, "frontend"), file).replaceAll(path.sep, "/");
			const isNodeEnv = source.includes("@vitest-environment node");
			if (!isNodeEnv && !pinned.has(rel)) violations.push(rel);
		}
		assert.deepEqual(
			violations,
			[],
			`node:-importing happy-dom suites must be forks-pinned (or node-env): ${violations.join(", ")}`,
		);
	});

	it("every forks-pinned suite is excluded from the main project (no double run)", () => {
		const config = fs.readFileSync(path.join(repoRoot, "frontend", "vitest.config.js"), "utf8");
		const excludes = [...config.matchAll(/exclude:\s*\[([\s\S]*?)\]/g)].flatMap((m) =>
			[...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((s) => s[1]),
		);
		for (const suite of forksPinnedSuites()) {
			assert.ok(
				excludes.includes(suite),
				`forks-pinned suite is missing from the main-project exclude: ${suite}`,
			);
		}
	});
});
