/***
 * MARK: canary-quarantine.test.mjs
 * @description Unit + seam-level integration tests for the canary infra-flake
 *   quarantine lane (task 44125086): `scripts/lib/canary-quarantine.mjs`
 *   (JSON-report classification, rerun planning, summary, log line, dir
 *   resolution) and `scripts/canary-with-quarantine.mjs`'s `runCanaryGate`
 *   driven end-to-end with fake playwright runs. Proves the acceptance
 *   criteria at the unit level: (1) a browser-closed signature-only failure is
 *   forgiven via the runner-rerun lane and recorded, (2) genuine failures
 *   (mixed runs, rerun red, unclassifiable crashes) stay red, (3) the log
 *   line + canary-quarantine.json name the lane/signature/tests.
 * @example run `node --test tests/canary-quarantine.test.mjs`
 ***/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	QUARANTINE_DIR_ENV,
	QUARANTINE_LOG_MARKER,
	QUARANTINE_SUMMARY_FILENAME,
	buildQuarantineSummary,
	classifyFailures,
	collectFailedTests,
	countRanTests,
	evaluateRerun,
	formatQuarantineLogLine,
	loadReport,
	planQuarantine,
	planRerunFilters,
	readBaseline,
	resolveQuarantineDir,
	writeQuarantineSummary,
} from "../scripts/lib/canary-quarantine.mjs";
import { resolveWorkDir, runCanaryGate } from "../scripts/canary-with-quarantine.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// --- fixtures shaped like a real Playwright JSON report (verified against
// playwright 1.63: spec.file is testDir-relative, tests[].results[].error) ---

function spec(file, line, title, errorMessage, { ok = false, suiteTitle = "Suite" } = {}) {
	return {
		title,
		ok,
		file,
		line,
		column: 5,
		id: `id-${file}-${line}`,
		tests: [
			{
				testId: `t-${file}-${line}`,
				title,
				status: ok ? "expected" : "unexpected",
				results: [
					ok
						? { status: "passed", error: null }
						: { status: "failed", error: { message: errorMessage, stack: `${errorMessage}\n    at helpers.js:65` } },
				],
			},
		],
	};
}

function report(specs, { globalErrors = [], stats = null } = {}) {
	// Mirror the real Playwright JSON root: { config, suites, errors, stats }.
	// stats counts what actually ran (verified against playwright 1.63: a
	// "No tests found" run exits 0 with all-zero stats).
	const passed = specs.filter((s) => s.ok).length;
	return {
		suites: [
			{
				title: "Suite",
				file: specs[0]?.file ?? "",
				line: 1,
				column: 1,
				specs,
				suites: [{ title: "Nested", file: specs[0]?.file ?? "", line: 1, column: 1, specs: [], suites: [] }],
			},
		],
		errors: globalErrors.map((message) => ({ message })),
		stats: stats ?? {
			startTime: "2026-11-24T12:00:00.000Z",
			duration: 1,
			expected: passed,
			skipped: 0,
			unexpected: specs.length - passed,
			flaky: 0,
		},
	};
}

const NO_TESTS_REPORT = report([], {
	stats: { startTime: "2026-11-24T12:00:00.000Z", duration: 1, expected: 0, skipped: 0, unexpected: 0, flaky: 0 },
});

const FLAKE_MSG = "Error: page.goto: Target page, context or browser has been closed\n\n   at helpers.js:65:14";
const GENUINE_MSG = "Error: expect(received).toBe(expected)\n\nExpected: 3\nReceived: 2";

function tmpdir(prefix) {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("collectFailedTests + classifyFailures", () => {
	it("extracts failed specs (nested suites too) and classifies signatures", () => {
		const dir = tmpdir("kb-q-test-");
		const testDir = path.join(dir, "tests");
		fs.mkdirSync(testDir, { recursive: true });
		fs.writeFileSync(path.join(testDir, "a.spec.js"), "// spec\n");
		fs.writeFileSync(path.join(testDir, "b.spec.js"), "// spec\n");
		const r = report([
			spec("a.spec.js", 3, "passes", null, { ok: true }),
			spec("a.spec.js", 4, "flake dies", FLAKE_MSG),
			spec("b.spec.js", 2, "genuine failure", GENUINE_MSG),
		]);
		const { failed, globalErrors } = collectFailedTests(r, { testDir, configDir: dir });
		assert.equal(globalErrors.length, 0);
		assert.equal(failed.length, 2);
		const flake = failed.find((f) => f.file === "a.spec.js");
		const genuine = failed.find((f) => f.file === "b.spec.js");
		assert.equal(flake.signature, "browser-closed");
		assert.equal(genuine.signature, null);
		assert.ok(flake.title.includes("flake dies"));
		assert.ok(flake.errorExcerpt.includes("has been closed"));
		assert.equal(flake.absFile, path.join(testDir, "a.spec.js"));
		assert.equal(flake.displayFile, "tests/a.spec.js", "summary names tests configDir-relative");
		const cls = classifyFailures(failed);
		assert.equal(cls.allInfraFlakes, false, "mixed run is not all-flakes");
		assert.deepEqual(cls.signatureCounts, { "browser-closed": 1 });
		assert.equal(cls.flakes.length, 1);
		assert.equal(cls.genuine.length, 1);
	});

	it("all-flake run classifies as allInfraFlakes; empty does not", () => {
		const allFlake = collectFailedTests(report([spec("a.spec.js", 4, "flake", FLAKE_MSG)])).failed;
		assert.equal(classifyFailures(allFlake).allInfraFlakes, true);
		assert.equal(classifyFailures([]).allInfraFlakes, false);
	});

	it("carries top-level report errors (global setup crashes) separately", () => {
		const { globalErrors } = collectFailedTests(report([], { globalErrors: ["global setup exploded"] }));
		assert.deepEqual(globalErrors, ["global setup exploded"]);
	});
});

describe("final-outcome semantics (runs with retries enabled)", () => {
	function multiResultSpec(file, line, title, results) {
		return {
			title,
			ok: false,
			file,
			line,
			column: 5,
			id: `id-${file}-${line}`,
			tests: [{ testId: `t-${file}-${line}`, title, status: "unexpected", results }],
		};
	}

	it("a flaky spec (passed on a retry) is NOT collected as a failure", () => {
		const flakySpec = {
			title: "flaky then passes",
			ok: true,
			file: "a.spec.js",
			line: 4,
			column: 5,
			id: "id-flaky",
			tests: [
				{
					testId: "t-flaky",
					title: "flaky then passes",
					status: "flaky",
					results: [
						{ status: "failed", error: { message: FLAKE_MSG, stack: FLAKE_MSG } },
						{ status: "passed", error: null },
					],
				},
			],
		};
		const { failed } = collectFailedTests(report([flakySpec]));
		assert.equal(failed.length, 0, "ok=true + status=flaky means the test ultimately passed");
	});

	it("classifies on the FINAL result: flake first attempt + genuine final failure stays genuine (red)", () => {
		const entry = multiResultSpec("a.spec.js", 4, "mixed attempts", [
			{ status: "failed", error: { message: FLAKE_MSG, stack: FLAKE_MSG } },
			{ status: "failed", error: { message: GENUINE_MSG, stack: GENUINE_MSG } },
		]);
		const { failed } = collectFailedTests(report([entry]));
		assert.equal(failed.length, 1);
		assert.equal(failed[0].signature, null, "the final (genuine) result must win over an earlier flake attempt");
		assert.ok(failed[0].errorExcerpt.includes("Expected: 3"), "excerpt carries the deciding error");
	});

	it("final result flake-only is classified as the flake even if an earlier attempt was genuine", () => {
		const entry = multiResultSpec("a.spec.js", 4, "flake final", [
			{ status: "failed", error: { message: GENUINE_MSG, stack: GENUINE_MSG } },
			{ status: "failed", error: { message: FLAKE_MSG, stack: FLAKE_MSG } },
		]);
		const { failed } = collectFailedTests(report([entry]));
		assert.equal(failed[0].signature, "browser-closed");
	});

	it("a failed spec with no results at all (interrupted) is collected, unclassified", () => {
		const entry = multiResultSpec("a.spec.js", 4, "interrupted", []);
		const { failed } = collectFailedTests(report([entry]));
		assert.equal(failed.length, 1);
		assert.equal(failed[0].signature, null);
	});
});

describe("planRerunFilters", () => {
	it("builds deduped configDir-relative file:line filters for failed tests only", () => {
		const dir = tmpdir("kb-q-filters-");
		const testDir = path.join(dir, "tests");
		fs.mkdirSync(testDir, { recursive: true });
		fs.writeFileSync(path.join(testDir, "a.spec.js"), "// spec\n");
		const { failed } = collectFailedTests(
			report([
				spec("a.spec.js", 4, "flake one", FLAKE_MSG),
				spec("a.spec.js", 9, "flake two", FLAKE_MSG),
				spec("a.spec.js", 4, "flake one (dup entry)", FLAKE_MSG),
			]),
			{ testDir, configDir: dir },
		);
		const { filters, unresolved } = planRerunFilters(failed, { configDir: dir, testDir });
		assert.deepEqual(filters.sort(), ["tests/a.spec.js:4", "tests/a.spec.js:9"]);
		assert.equal(unresolved, 0);
	});
});

describe("planQuarantine / evaluateRerun decision table", () => {
	const flakeOnly = [{ signature: "browser-closed", file: "a.spec.js", line: 4, title: "t" }];
	const mixed = [...flakeOnly, { signature: null, file: "b.spec.js", line: 2, title: "g" }];
	it("green first run: no rerun, not red", () => {
		assert.deepEqual(planQuarantine({ firstExitCode: 0, failed: [] }), { rerun: false, red: false, reason: "first run green" });
	});
	it("signature-only failure: rerun", () => {
		const p = planQuarantine({ firstExitCode: 1, failed: flakeOnly, globalErrors: [] });
		assert.equal(p.rerun, true);
		assert.equal(p.red, false);
	});
	it("mixed flake + genuine: red, no rerun", () => {
		const p = planQuarantine({ firstExitCode: 1, failed: mixed, globalErrors: [] });
		assert.equal(p.rerun, false);
		assert.equal(p.red, true);
	});
	it("red with no classifiable failures (crash/global error): red, no rerun", () => {
		const p = planQuarantine({ firstExitCode: 1, failed: [], globalErrors: ["boom"] });
		assert.equal(p.rerun, false);
		assert.equal(p.red, true);
	});
	it("evaluateRerun: green rerun forgives; signature-only rerun forgives; genuine/empty stays red", () => {
		assert.deepEqual(evaluateRerun({ rerunExitCode: 0, rerunFailed: [], rerunRanTests: 1 }), { forgiven: true, outcome: "passed" });
		assert.deepEqual(evaluateRerun({ rerunExitCode: 1, rerunFailed: flakeOnly }), { forgiven: true, outcome: "signature-only" });
		assert.equal(evaluateRerun({ rerunExitCode: 1, rerunFailed: mixed }).forgiven, false);
		assert.equal(evaluateRerun({ rerunExitCode: 1, rerunFailed: [] }).forgiven, false);
	});
	it("evaluateRerun: a green exit with ZERO tests run never forgives (Playwright exits 0 on 'No tests found')", () => {
		assert.deepEqual(evaluateRerun({ rerunExitCode: 0, rerunFailed: [], rerunRanTests: 0 }), {
			forgiven: false,
			outcome: "no-tests-ran",
		});
		// Unknown count (unreadable report) with exit 0: the exit code is all
		// we have — forgiven (playwright always writes the json report on a
		// normal exit, so null here means something very odd, not zero tests).
		assert.deepEqual(evaluateRerun({ rerunExitCode: 0, rerunFailed: [], rerunRanTests: null }), {
			forgiven: true,
			outcome: "passed",
		});
	});
});

describe("countRanTests", () => {
	it("sums expected+unexpected+flaky (skipped never ran) and returns null when stats are unknown", () => {
		assert.equal(countRanTests(report([spec("a.spec.js", 3, "p", null, { ok: true }), spec("a.spec.js", 4, "f", GENUINE_MSG)])), 2);
		assert.equal(countRanTests(NO_TESTS_REPORT), 0);
		assert.equal(countRanTests(null), null);
		assert.equal(countRanTests({ suites: [] }), null);
		assert.equal(
			countRanTests({ stats: { expected: 1, unexpected: 1, flaky: 1, skipped: 5 } }),
			3,
			"skipped tests do not count as ran",
		);
	});
});

describe("summary + log line", () => {
	it("buildQuarantineSummary counts signatures and names tests; baseline snapshotted", () => {
		const baseline = readBaseline({ repoRoot });
		assert.ok(baseline?.signatures?.["browser-closed"], "committed baseline must cover browser-closed");
		const summary = buildQuarantineSummary({
			generatedAt: "2026-11-24T00:00:00.000Z",
			lane: "runner-rerun",
			failures: [
				{ title: "T one", file: "tests/a.spec.js", line: 4, signature: "browser-closed", errorExcerpt: "page.goto: Target page, context or browser has been closed" },
				{ title: "T two", file: "tests/b.spec.js", line: 2, signature: "browser-closed" },
				{ title: "G", file: "tests/c.spec.js", line: 8, signature: null },
			],
			firstRun: { exitCode: 1, reportPath: "/tmp/r1.json", reportWritten: true },
			rerun: { attempted: true, exitCode: 0, filters: ["tests/a.spec.js:4"], outcome: "passed", unresolvedFilters: 0 },
			baseline,
		});
		assert.equal(summary.version, 1);
		assert.equal(summary.lane, "runner-rerun");
		assert.equal(summary.forgiven, 2);
		assert.deepEqual(summary.signatures, { "browser-closed": 2 });
		assert.equal(summary.tests.length, 3);
		assert.equal(summary.tests[0].errorExcerpt, "page.goto: Target page, context or browser has been closed");
		assert.equal(summary.tests[1].errorExcerpt, "", "missing excerpt degrades to empty string");
		assert.equal(summary.baseline, baseline);
	});
	it("formatQuarantineLogLine renders the exact greppable marker line (lane + outcome + signatures + tests)", () => {
		const summary = buildQuarantineSummary({
			generatedAt: "2026-11-24T00:00:00.000Z",
			lane: "runner-rerun",
			failures: [{ title: "T", file: "tests/a.spec.js", line: 4, signature: "browser-closed" }],
			rerun: { attempted: true, exitCode: 0, filters: ["tests/a.spec.js:4"], outcome: "passed", testsRan: 1, unresolvedFilters: 0 },
		});
		const line = formatQuarantineLogLine(summary, "/v/canary-quarantine.json");
		assert.equal(
			line,
			`${QUARANTINE_LOG_MARKER} forgiven=1 lane="runner-rerun" outcome="passed" signatures="browser-closed:1" tests="tests/a.spec.js:4:T" summary="/v/canary-quarantine.json"\n`,
		);
		assert.ok(line.startsWith("KAINBAIN_CANARY_QUARANTINE "));
	});
	it("formatQuarantineLogLine shows outcome=none when no rerun happened and quotes values safely", () => {
		const summary = buildQuarantineSummary({ lane: "none", failures: [] });
		const line = formatQuarantineLogLine(summary, null);
		assert.ok(line.includes('lane="none" outcome="none" signatures="" tests="" summary="unavailable"'), line);
		const reranRed = buildQuarantineSummary({
			lane: "none",
			failures: [{ title: 'we"ird', file: "tests/a.spec.js", line: 4, signature: null }],
			rerun: { attempted: true, exitCode: 1, filters: ["tests/a.spec.js:4"], outcome: "red", testsRan: 1 },
		});
		const redLine = formatQuarantineLogLine(reranRed, "/v/q.json");
		assert.ok(redLine.includes('outcome="red"'), redLine);
		assert.ok(redLine.includes('tests="tests/a.spec.js:4:we\\"ird"'), "quotes inside values are escaped");
	});
});

describe("dir resolution + summary writing", () => {
	it("loadReport returns null for missing/garbage files", () => {
		assert.equal(loadReport(path.join(tmpdir("kb-q-"), "nope.json")), null);
		const bad = path.join(tmpdir("kb-q-"), "bad.json");
		fs.writeFileSync(bad, "{not json");
		assert.equal(loadReport(bad), null);
	});
	it("resolveQuarantineDir prefers the gate-provided env dir and creates it", () => {
		const dir = path.join(tmpdir("kb-q-dir-"), "verdict-1");
		assert.equal(resolveQuarantineDir({ env: { [QUARANTINE_DIR_ENV]: dir }, repoRoot }), dir);
		assert.ok(fs.statSync(dir).isDirectory());
	});
	it("resolveQuarantineDir falls back to the standard verdict-dir resolution", () => {
		const root = tmpdir("kb-q-root-");
		const dir = resolveQuarantineDir({ env: {}, repoRoot: root, now: new Date("2026-11-24T12:00:00Z") });
		assert.ok(dir.startsWith(path.join(root, "docs", "tasks", "local-gate-runs", "ci-fast-gate-20261124-120000")), dir);
	});
	it("writeQuarantineSummary writes canary-quarantine.json, fail-open on bad dir", () => {
		const dir = tmpdir("kb-q-write-");
		const written = writeQuarantineSummary({ dir, summary: { version: 1, lane: "none" } });
		assert.equal(written.ok, true);
		assert.equal(written.path, path.join(dir, QUARANTINE_SUMMARY_FILENAME));
		assert.equal(JSON.parse(fs.readFileSync(written.path, "utf8")).lane, "none");
		assert.equal(writeQuarantineSummary({ dir: "", summary: {} }).ok, false);
	});
});

describe("runCanaryGate (fake playwright seams)", () => {
	function makeHarness({ reports, preflightExit = 0, dirPrefix = "kb-q-gate-", resolveWorkDirFn } = {}) {
		const quarantineDir = path.join(tmpdir(dirPrefix), "verdict");
		const canaryDir = path.join(tmpdir(dirPrefix), "canary-e2e");
		const testDir = path.join(canaryDir, "tests");
		fs.mkdirSync(testDir, { recursive: true });
		fs.writeFileSync(path.join(testDir, "a.spec.js"), "// spec\n");
		fs.writeFileSync(path.join(testDir, "b.spec.js"), "// spec\n");
		const calls = [];
		let runIndex = 0;
		const runPlaywrightFn = ({ args, jsonReport }) => {
			calls.push({ args, jsonReport });
			const entry = reports[Math.min(runIndex, reports.length - 1)];
			runIndex += 1;
			// Degraded strict mode passes jsonReport=null (no JSON reporter).
			if (jsonReport && entry.report !== null) fs.writeFileSync(jsonReport, JSON.stringify(entry.report));
			return { exitCode: entry.exitCode, spawnError: null };
		};
		const runPreflightFn = () => ({ exitCode: preflightExit });
		const lines = [];
		const log = (text) => lines.push(String(text));
		const env = { [QUARANTINE_DIR_ENV]: quarantineDir };
		return {
			quarantineDir,
			canaryDir,
			calls,
			lines,
			run: () =>
				runCanaryGate({
					canaryDir,
					repoRoot,
					env,
					argv: [],
					cli: "/fake/cli.js",
					runPreflightFn,
					runPlaywrightFn,
					resolveWorkDirFn: resolveWorkDirFn ?? resolveWorkDir,
					log,
					now: () => "2026-11-24T12:00:00.000Z",
				}),
		};
	}

	const flakeReport = report([spec("a.spec.js", 4, "flake dies", FLAKE_MSG)]);
	const genuineReport = report([spec("b.spec.js", 2, "genuine failure", GENUINE_MSG)]);
	const mixedReport = report([
		spec("a.spec.js", 4, "flake dies", FLAKE_MSG),
		spec("b.spec.js", 2, "genuine failure", GENUINE_MSG),
	]);
	const greenReport = report([spec("a.spec.js", 3, "passes", null, { ok: true })]);

	it("(1) signature-only first run + green rerun → exit 0, lane runner-rerun, recorded", () => {
		const h = makeHarness({ reports: [{ exitCode: 1, report: flakeReport }, { exitCode: 0, report: greenReport }] });
		const { exitCode, summary, summaryPath } = h.run();
		assert.equal(exitCode, 0, "browser-closed signature alone must not fail the gate");
		assert.equal(h.calls.length, 2, "exactly one rerun");
		assert.deepEqual(h.calls[1].args, ["tests/a.spec.js:4"], "rerun targets only the failed test");
		assert.equal(summary.lane, "runner-rerun");
		assert.equal(summary.forgiven, 1);
		assert.deepEqual(summary.signatures, { "browser-closed": 1 });
		assert.equal(summary.rerun.outcome, "passed");
		assert.equal(summary.tests[0].file, "tests/a.spec.js");
		assert.equal(summary.tests[0].signature, "browser-closed");
		assert.ok(summary.tests[0].errorExcerpt.includes("has been closed"), "summary carries the deciding error text");
		// (3) CI report names lane/signature: JSON file + log line agree.
		assert.equal(summaryPath, path.join(h.quarantineDir, QUARANTINE_SUMMARY_FILENAME));
		const onDisk = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
		assert.equal(onDisk.lane, "runner-rerun");
		assert.ok(onDisk.baseline.signatures["browser-closed"], "baseline snapshot included");
		const markerLine = h.lines.find((l) => l.startsWith(QUARANTINE_LOG_MARKER));
		assert.ok(markerLine, "log line printed");
		assert.ok(markerLine.includes('lane="runner-rerun"'));
		assert.ok(markerLine.includes('outcome="passed"'));
		assert.ok(markerLine.includes('signatures="browser-closed:1"'));
		assert.ok(markerLine.includes("tests/a.spec.js:4:Suite › flake dies"));
	});

	it("(1b) rerun failing again signature-only is still recorded + forgiven", () => {
		const h = makeHarness({ reports: [{ exitCode: 1, report: flakeReport }, { exitCode: 1, report: flakeReport }] });
		const { exitCode, summary } = h.run();
		assert.equal(exitCode, 0);
		assert.equal(summary.rerun.outcome, "signature-only");
		assert.equal(summary.forgiven, 1);
	});

	it("(2a) mixed flake + genuine first run → red, no rerun, summary names both", () => {
		const h = makeHarness({ reports: [{ exitCode: 1, report: mixedReport }] });
		const { exitCode, summary } = h.run();
		assert.notEqual(exitCode, 0);
		assert.equal(h.calls.length, 1, "no rerun on mixed runs");
		assert.equal(summary.lane, "none");
		assert.equal(summary.forgiven, 0);
		assert.equal(summary.tests.length, 2);
		assert.deepEqual(summary.tests.map((t) => t.signature).sort(), [null, "browser-closed"].sort());
		assert.equal(summary.unclassified, false);
	});

	it("(2b) rerun turning genuinely red → gate stays red", () => {
		const h = makeHarness({ reports: [{ exitCode: 1, report: flakeReport }, { exitCode: 1, report: genuineReport }] });
		const { exitCode, summary } = h.run();
		assert.notEqual(exitCode, 0);
		assert.equal(summary.rerun.outcome, "red");
	});

	it("(2c) red run with no JSON report (killed/crashed) → red, unclassified", () => {
		const h = makeHarness({ reports: [{ exitCode: 1, report: null }] });
		const { exitCode, summary } = h.run();
		assert.notEqual(exitCode, 0);
		assert.equal(h.calls.length, 1);
		assert.equal(summary.unclassified, true);
		assert.equal(summary.firstRun.reportWritten, false);
	});

	it("green first run → exit 0, empty quarantine summary still written + logged", () => {
		const h = makeHarness({ reports: [{ exitCode: 0, report: greenReport }] });
		const { exitCode, summary, summaryPath } = h.run();
		assert.equal(exitCode, 0);
		assert.equal(h.calls.length, 1);
		assert.equal(summary.lane, "none");
		assert.equal(summary.forgiven, 0);
		assert.ok(fs.existsSync(summaryPath));
		assert.ok(h.lines.some((l) => l.startsWith(`${QUARANTINE_LOG_MARKER} forgiven=0`)));
	});

	it("preflight failure → red with preflight-failed lane, suite never runs", () => {
		const h = makeHarness({ reports: [{ exitCode: 0, report: greenReport }], preflightExit: 1 });
		const { exitCode, summary } = h.run();
		assert.notEqual(exitCode, 0);
		assert.equal(h.calls.length, 0, "playwright never spawned");
		assert.equal(summary.lane, "preflight-failed");
	});

	it("(2d) rerun exits 0 but ran ZERO tests ('No tests found') → stays red, outcome no-tests-ran", () => {
		const h = makeHarness({ reports: [{ exitCode: 1, report: flakeReport }, { exitCode: 0, report: NO_TESTS_REPORT }] });
		const { exitCode, summary } = h.run();
		assert.notEqual(exitCode, 0, "a rerun that ran nothing must never forgive");
		assert.equal(h.calls.length, 2, "rerun was attempted");
		assert.equal(summary.rerun.outcome, "no-tests-ran");
		assert.equal(summary.rerun.testsRan, 0);
		assert.equal(summary.lane, "none");
		assert.equal(summary.forgiven, 0);
		const markerLine = h.lines.find((l) => l.startsWith(QUARANTINE_LOG_MARKER));
		assert.ok(markerLine.includes('outcome="no-tests-ran"'), markerLine);
	});

	it("degraded strict mode (no writable report scratch dir): green run still green, failure stays red unclassified", () => {
		const noWorkDir = () => null;
		const green = makeHarness({ reports: [{ exitCode: 0, report: greenReport }], resolveWorkDirFn: noWorkDir });
		const greenResult = green.run();
		assert.equal(greenResult.exitCode, 0, "green suite passes even without a JSON report");
		assert.equal(green.calls[0].jsonReport, null, "no JSON reporter in degraded mode");
		assert.ok(green.lines.some((l) => l.includes("running strict")), "degradation is logged");

		const red = makeHarness({ reports: [{ exitCode: 1, report: flakeReport }], resolveWorkDirFn: noWorkDir });
		const redResult = red.run();
		assert.notEqual(redResult.exitCode, 0, "without a JSON report a failure cannot be proven a flake — stays red");
		assert.equal(red.calls.length, 1, "no rerun without classification");
		assert.equal(redResult.summary.unclassified, true);
		assert.equal(redResult.summary.firstRun.reportWritten, false);
	});
});

describe("resolveWorkDir (fail-open scratch dir)", () => {
	it("creates a kb-canary-quarantine-* dir under the OS tmp dir", () => {
		const dir = resolveWorkDir({ quarantineDir: tmpdir("kb-q-wd-") });
		assert.ok(dir.startsWith(path.join(os.tmpdir(), "kb-canary-quarantine-")), dir);
		assert.ok(fs.statSync(dir).isDirectory());
	});
	it("falls back to the quarantine dir when the OS tmp dir is unwritable", () => {
		const quarantineDir = tmpdir("kb-q-wd-");
		const realMkdtemp = fs.mkdtempSync;
		const dir = resolveWorkDir({
			quarantineDir,
			tmpdirFn: () => "/nonexistent-root/no-tmp",
			mkdtempFn: (p) => realMkdtemp.call(fs, p),
		});
		assert.ok(dir.startsWith(quarantineDir), dir);
		assert.ok(fs.statSync(dir).isDirectory());
	});
	it("returns null when nothing is writable (caller degrades to strict mode)", () => {
		const alwaysThrow = () => {
			throw new Error("read-only fs");
		};
		assert.equal(resolveWorkDir({ quarantineDir: tmpdir("kb-q-wd-"), mkdtempFn: alwaysThrow }), null);
		assert.equal(resolveWorkDir({ quarantineDir: "", mkdtempFn: alwaysThrow }), null);
	});
});
