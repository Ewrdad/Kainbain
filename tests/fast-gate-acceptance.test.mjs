import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { runGatePhases } = await import("../scripts/run-tests.mjs");
const { runParallel } = await import("../scripts/lib/run-parallel.mjs");

/***
 * MARK: fast-gate acceptance tests
 * @description The committed form of the acceptance rehearsal: one failing
 *   fast branch plus a slow stub canary (a 6-second sleeper that leaves a
 *   sentinel file when it runs), executed through the REAL overlap runner
 *   (real spawns, quieted). Fail-fast on must return without the canary
 *   stub ever running — verdict on disk, SKIP line naming the suite — while
 *   fail-fast off runs the stub to completion. A relative-timing assertion
 *   (fail-fast arm finishes before the opt-out arm) proves the wait is gone
 *   without any wall-clock threshold to flake on a loaded host.
 * @example run `node --test tests/fast-gate-acceptance.test.mjs`
 ***/

const CANARY_SLEEP_MS = 6000;

// Real spawns, quiet output: branch control lines would only noise the log.
function quietRunner(branches, opts) {
	return runParallel(branches, { ...opts, write: () => {} });
}

function makeCollector() {
	const lines = [];
	return { lines, log: (text) => lines.push(text), joined: () => lines.join("\n") };
}

function makeScratch() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-fast-gate-accept-"));
	const verdictDir = path.join(root, "verdict");
	fs.mkdirSync(verdictDir, { recursive: true });
	return { root, verdictDir, sentinel: path.join(root, "canary-ran") };
}

function fastFailBranch() {
	return {
		name: "Unit Tests (frontend)",
		file: process.execPath,
		args: ["-e", "console.log('unit-boom: 1 failed');process.exitCode=1"],
	};
}

function slowCanaryBranch(sentinel) {
	return {
		name: "Canary Tests",
		file: process.execPath,
		args: [
			"-e",
			`setTimeout(()=>require("fs").writeFileSync(${JSON.stringify(sentinel)},"ran"),${CANARY_SLEEP_MS})`,
		],
	};
}

describe("fast-gate acceptance (real spawns, stub canary)", () => {
	it("fail-fast on: returns without running the slow canary, verdict on disk", async () => {
		const { root, verdictDir, sentinel } = makeScratch();
		try {
			const out = makeCollector();
			const startedAt = Date.now();
			const result = await runGatePhases({
				fastBranches: [fastFailBranch()],
				canaryBranches: [slowCanaryBranch(sentinel)],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn: quietRunner,
				log: out.log,
			});
			const elapsedMs = Date.now() - startedAt;
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "skipped_due_to_fast_gate_failure");
			assert.ok(!fs.existsSync(sentinel), "the canary stub must never run");
			assert.match(
				out.joined(),
				/Running Canary Tests\.\.\. SKIP \(fast-gate failed: Unit Tests \(frontend\); verdict at .*verdict\.json\)/,
			);
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.ok, false);
			assert.deepEqual(verdict.failedBranches.map((entry) => entry.name), [
				"Unit Tests (frontend)",
			]);
			const fullLog = fs.readFileSync(
				path.join(verdictDir, "unit-tests-frontend.full.log"),
				"utf8",
			);
			assert.match(fullLog, /unit-boom/);
			// Structural timing proof (no absolute threshold): the whole
			// fail-fast run finishes before the skipped stub alone would.
			assert.ok(
				elapsedMs < CANARY_SLEEP_MS,
				`fail-fast run took ${elapsedMs}ms; the skipped canary sleeps ${CANARY_SLEEP_MS}ms`,
			);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fail-fast off: the verdict still lands early but the slow canary runs on", async () => {
		const { root, verdictDir, sentinel } = makeScratch();
		try {
			const out = makeCollector();
			const result = await runGatePhases({
				fastBranches: [fastFailBranch()],
				canaryBranches: [slowCanaryBranch(sentinel)],
				failFast: false,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn: quietRunner,
				log: out.log,
			});
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "ran");
			assert.equal(fs.readFileSync(sentinel, "utf8"), "ran");
			assert.doesNotMatch(out.joined(), /SKIP \(fast-gate failed/);
			assert.match(out.joined(), /starting Canary Tests alone/);
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.canary, "ran");
			assert.deepEqual(verdict.failedBranches.map((entry) => entry.name), [
				"Unit Tests (frontend)",
			]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
