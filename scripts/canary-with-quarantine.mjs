#!/usr/bin/env node
/***
 * MARK: canary-with-quarantine.mjs
 * @description Gate wrapper around the canary E2E suite (task 44125086). It
 *   runs the EXACT same suite as `npm run test:canary` —
 *   `scripts/canary-preflight.mjs` then `playwright test` in `canary-e2e/`
 *   with the committed `retries: 0` policy untouched — but adds the
 *   runner-level infra-flake quarantine lane on top:
 *
 *   1. run 1: the full suite, with a gate-only JSON report
 *      (`KAINBAIN_CANARY_JSON_REPORT` env → the config appends a `json`
 *      reporter; html+list render as before).
 *   2. on failure, classify every failed test's error text against the
 *      single signature list (`canary-e2e/tests/infra-flakes.mjs`).
 *   3. ONLY when every failure matches a known signature, rerun just those
 *      tests (`file:line` filters from the JSON report, `--last-failed` as
 *      fallback) — minutes, not another full run. A green rerun that
 *      actually ran the tests (or one failing solely on known signatures
 *      again) forgives the flake; ANY genuine failure at any stage exits
 *      non-zero immediately. Mixed runs (flake + genuine) stay red, and a
 *      "green" rerun that ran ZERO tests (Playwright exits 0 on "No tests
 *      found") stays red too — fail-safe, never a silent forgiveness.
 *   4. always report: the greppable `KAINBAIN_CANARY_QUARANTINE …` log line
 *      (lane + outcome + signatures + tests) and `canary-quarantine.json` in
 *      the gate's verdict dir (via `KAINBAIN_CANARY_QUARANTINE_DIR`, set by
 *      the Canary Tests branch in scripts/run-tests.mjs), snapshotting the
 *      committed baseline (`canary-e2e/infra-flake-baseline.json`).
 *
 *   Fail-safe map (how this wrapper can fail, and which way it fails):
 *   reporting I/O breaks (no writable scratch/verdict dir) → degrades to
 *   the plain strict run, never crashes the gate, never forgives; run 1
 *   killed/crashes with no JSON → unclassifiable → red; rerun green with
 *   zero tests run → red; rerun genuine → red; mixed first run → red with
 *   no rerun. Only a signature-only first run plus a rerun that really ran
 *   goes green, and then visibly (log line + JSON).
 *
 *   Nothing is ever skipped silently: quarantined tests still ran, and only
 *   signature-only failures are forgiven, with the record above. The wrapper
 *   is used by the gate's Canary Tests branch; `npm run test:canary` and the
 *   deploy.sh sharded gates keep the plain strict invocation. Extra CLI args
 *   (argv) are forwarded to run 1 only (e.g. a single spec for debugging);
 *   the rerun always targets exactly the failed tests.
 * @example node scripts/canary-with-quarantine.mjs
 * @example node scripts/canary-with-quarantine.mjs tests/homepage.spec.js
 ***/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
	LANE_RUNNER_RERUN,
	buildQuarantineSummary,
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
} from "./lib/canary-quarantine.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
const CANARY_DIR = path.join(REPO_ROOT, "canary-e2e");

/***
 * MARK: resolvePlaywrightCli
 * @description Resolves the Playwright CLI entry (`playwright/cli.js`) from
 *   the canary-e2e workspace so the wrapper can spawn `node <cli> test …`
 *   cross-platform without a shell. Falls back to the `.bin` shim.
 * @example resolvePlaywrightCli().endsWith("cli.js") => true
 * @param {Object} [opts]
 * @param {string} [opts.canaryDir] - canary-e2e package dir, defaults to the repo's.
 * @returns {string} Absolute CLI path.
 ***/
export function resolvePlaywrightCli({ canaryDir = CANARY_DIR } = {}) {
	try {
		const require = createRequire(path.join(canaryDir, "package.json"));
		for (const spec of ["playwright/cli.js", "@playwright/test/cli.js"]) {
			try {
				return require.resolve(spec);
			} catch {
				// Try the next candidate.
			}
		}
	} catch {
		// Fall through to the .bin shim.
	}
	return path.join(canaryDir, "node_modules", ".bin", "playwright");
}

/***
 * MARK: resolveWorkDir
 * @description Creates the scratch dir that holds the gate-only JSON reports
 *   (`run-1.json`, `run-2.json`). Fail-open by design: the dir only serves
 *   reporting, so when it cannot be created the lane degrades to the plain
 *   strict run — no JSON report means an unclassifiable failure stays RED
 *   (fail-safe) and a green run still passes — instead of crashing the
 *   wrapper before the suite even ran. Returns null when no dir could be
 *   created. Prefers os.tmpdir() (the "kb-" prefix lets the gate's
 *   stale-scratch pruner reclaim it), falls back to the quarantine dir.
 * @example resolveWorkDir({ quarantineDir: "/v" }) => "/tmp/kb-canary-quarantine-XXXX"
 * @example resolveWorkDir({ quarantineDir: "/v", mkdtempFn: () => { throw new Error("tmp full"); } }) => null
 * @param {Object} [opts]
 * @param {string} [opts.quarantineDir] - Already-created verdict/quarantine dir (fallback location).
 * @param {Function} [opts.tmpdirFn] - os.tmpdir seam, for tests.
 * @param {Function} [opts.mkdtempFn] - fs.mkdtempSync seam, for tests.
 * @returns {string|null} The created work dir, or null (degraded strict mode).
 ***/
export function resolveWorkDir({ quarantineDir, tmpdirFn = os.tmpdir, mkdtempFn = fs.mkdtempSync } = {}) {
	try {
		return mkdtempFn(path.join(tmpdirFn(), "kb-canary-quarantine-"));
	} catch {
		// Fall through to the quarantine dir below.
	}
	if (typeof quarantineDir === "string" && quarantineDir.trim()) {
		try {
			return mkdtempFn(path.join(quarantineDir, "kb-canary-quarantine-"));
		} catch {
			// Fall through to null (degraded strict mode).
		}
	}
	return null;
}

/***
 * MARK: runPreflight
 * @description Runs `scripts/canary-preflight.mjs` from the canary-e2e dir —
 *   the same first step as the package's `test` script — freeing the scratch
 *   ports before Playwright provisions its own webServer entries.
 * @example runPreflight({ canaryDir }).exitCode => 0
 * @param {Object} [opts]
 * @param {string} [opts.canaryDir] - canary-e2e dir (cwd of the preflight).
 * @param {string} [opts.repoRoot] - Repo root (locates the preflight script).
 * @param {Object} [opts.env] - Extra env for the child.
 * @param {Function} [opts.spawnFn] - spawnSync seam, for tests.
 * @returns {{ exitCode: number }}
 ***/
export function runPreflight({ canaryDir = CANARY_DIR, repoRoot = REPO_ROOT, env = {}, spawnFn = spawnSync } = {}) {
	const result = spawnFn(process.execPath, [path.join(repoRoot, "scripts", "canary-preflight.mjs")], {
		cwd: canaryDir,
		env: { ...process.env, ...env },
		stdio: "inherit",
		windowsHide: true,
	});
	return { exitCode: result.status ?? (result.error ? 127 : 1) };
}

/***
 * MARK: runPlaywright
 * @description One `playwright test` invocation in the canary-e2e dir with
 *   stdio inherited (the gate captures it). `jsonReport` is exported to the
 *   child as KAINBAIN_CANARY_JSON_REPORT so the config adds the gate-only
 *   JSON reporter writing there. A spawn failure resolves as exit 127, never
 *   a throw.
 * @example runPlaywright({ cli, args: ["tests/homepage.spec.js"], jsonReport: "/tmp/r.json" }).exitCode => 0 | 1
 * @param {Object} opts
 * @param {string} opts.cli - Playwright CLI path (resolvePlaywrightCli).
 * @param {string} [opts.canaryDir] - cwd for the run.
 * @param {Array<string>} [opts.args] - Extra CLI args (run 1 filters).
 * @param {string} [opts.jsonReport] - JSON report output path for this run.
 * @param {Object} [opts.env] - Extra env for the child.
 * @param {Function} [opts.spawnFn] - spawnSync seam, for tests.
 * @returns {{ exitCode: number, spawnError: string|null }}
 ***/
export function runPlaywright({ cli, canaryDir = CANARY_DIR, args = [], jsonReport, env = {}, spawnFn = spawnSync } = {}) {
	const childEnv = { ...process.env, ...env };
	if (jsonReport) childEnv.KAINBAIN_CANARY_JSON_REPORT = jsonReport;
	const result = spawnFn(process.execPath, [cli, "test", ...args], {
		cwd: canaryDir,
		env: childEnv,
		stdio: "inherit",
		windowsHide: true,
	});
	return {
		exitCode: result.status ?? (result.error ? 127 : 1),
		spawnError: result.error ? String(result.error.message || result.error) : null,
	};
}

/***
 * MARK: runCanaryGate
 * @description The whole quarantine lane, orchestrated (see the file MARK):
 *   preflight → run 1 (full suite + JSON report) → classify → optional
 *   failed-tests-only rerun → summary + log line → exit code. All side
 *   effects go through injectable seams so tests can drive it without a
 *   browser. Returns the exit code the gate branch should propagate.
 * @example const { exitCode } = runCanaryGate({ argv: ["tests/homepage.spec.js"] })
 * @param {Object} [opts]
 * @param {string} [opts.canaryDir] - canary-e2e dir.
 * @param {string} [opts.repoRoot] - Repo root.
 * @param {Object} [opts.env] - Env for dir resolution + children.
 * @param {Array<string>} [opts.argv] - Extra CLI args forwarded to run 1.
 * @param {string} [opts.cli] - Playwright CLI path.
 * @param {Function} [opts.runPreflightFn] - Preflight seam.
 * @param {Function} [opts.runPlaywrightFn] - Playwright seam.
 * @param {Function} [opts.resolveWorkDirFn] - Report-scratch-dir seam (fail-open, see resolveWorkDir).
 * @param {Function} [opts.log] - Line sink, defaults to console.log.
 * @param {Function} [opts.now] - ISO timestamp seam.
 * @returns {{ exitCode: number, summary: Object, summaryPath: string|null, quarantineDir: string }}
 ***/
export function runCanaryGate({
	canaryDir = CANARY_DIR,
	repoRoot = REPO_ROOT,
	env = process.env,
	argv = process.argv.slice(2),
	cli = resolvePlaywrightCli({ canaryDir }),
	runPreflightFn = runPreflight,
	runPlaywrightFn = runPlaywright,
	resolveWorkDirFn = resolveWorkDir,
	log = (...args) => console.log(...args),
	now = () => new Date().toISOString(),
} = {}) {
	const quarantineDir = resolveQuarantineDir({ env, repoRoot });
	// Report scratch dir for the gate-only JSON reports. Fail-open: when no
	// work dir can be created the lane degrades to the plain strict run
	// (report paths null → no JSON reporter → an unclassifiable failure
	// stays red, a green run still passes) — reporting scaffolding must
	// never crash the gate or red a green suite on its own.
	const workDir = resolveWorkDirFn({ quarantineDir });
	const report1 = workDir ? path.join(workDir, "run-1.json") : null;
	const report2 = workDir ? path.join(workDir, "run-2.json") : null;
	if (!workDir) {
		log("canary-quarantine: no writable report scratch dir — running strict, no JSON report (fail-safe)");
	}
	const baseline = readBaseline({ repoRoot });
	const testDir = path.join(canaryDir, "tests");

	const pre = runPreflightFn({ canaryDir, repoRoot, env });
	if (pre.exitCode !== 0) {
		const summary = buildQuarantineSummary({
			generatedAt: now(),
			lane: "preflight-failed",
			failures: [],
			firstRun: null,
			unclassified: true,
			baseline,
			note: `canary-preflight exited ${pre.exitCode} — the suite never ran`,
		});
		const written = writeQuarantineSummary({ dir: quarantineDir, summary });
		log(formatQuarantineLogLine(summary, written.path));
		return { exitCode: pre.exitCode || 1, summary, summaryPath: written.path, quarantineDir };
	}

	log(
		`canary-quarantine: run 1 (full suite, retries stay 0), json report ${report1 ?? "unavailable (strict mode)"}`,
	);
	const first = runPlaywrightFn({ cli, canaryDir, args: [...argv], jsonReport: report1, env });
	const report1Obj = loadReport(report1);
	const { failed: failed1, globalErrors } = collectFailedTests(report1Obj, { testDir, configDir: canaryDir });
	const plan = planQuarantine({ firstExitCode: first.exitCode, failed: failed1, globalErrors });

	let exitCode = first.exitCode;
	let lane = "none";
	let failures = failed1;
	let rerun = null;
	let unclassified = false;

	if (first.exitCode === 0) {
		log("canary-quarantine: run 1 green — nothing to quarantine");
	} else if (plan.rerun) {
		const { filters, unresolved } = planRerunFilters(failed1, { configDir: canaryDir, testDir });
		const rerunArgs = filters.length > 0 ? filters : ["--last-failed"];
		log(
			`canary-quarantine: ${plan.reason} — rerunning ${filters.length || "the"} failed test(s) once (lane=${LANE_RUNNER_RERUN}): ${rerunArgs.join(" ")}`,
		);
		const second = runPlaywrightFn({ cli, canaryDir, args: rerunArgs, jsonReport: report2, env });
		const report2Obj = loadReport(report2);
		const { failed: failed2 } = collectFailedTests(report2Obj, { testDir, configDir: canaryDir });
		// Playwright exits 0 even when zero tests ran ("No tests found") —
		// such a rerun proves nothing and must stay red (fail-safe).
		const rerunRanTests = countRanTests(report2Obj);
		const verdict = evaluateRerun({ rerunExitCode: second.exitCode, rerunFailed: failed2, rerunRanTests });
		rerun = {
			attempted: true,
			exitCode: second.exitCode,
			filters: rerunArgs,
			outcome: verdict.outcome,
			testsRan: rerunRanTests,
			unresolvedFilters: unresolved,
		};
		if (verdict.forgiven) {
			exitCode = 0;
			lane = LANE_RUNNER_RERUN;
			log(`canary-quarantine: rerun ${verdict.outcome} — forgiving ${failed1.length} signature-only failure(s)`);
		} else {
			exitCode = second.exitCode || first.exitCode || 1;
			failures = failed2.length > 0 ? failed2 : failed1;
			log(`canary-quarantine: rerun ${verdict.outcome} — gate stays red`);
		}
	} else {
		unclassified = failed1.length === 0;
		log(`canary-quarantine: ${plan.reason} — no rerun, gate stays red`);
	}

	const summary = buildQuarantineSummary({
		generatedAt: now(),
		lane,
		failures,
		firstRun: { exitCode: first.exitCode, reportPath: report1, reportWritten: report1Obj !== null },
		rerun,
		unclassified,
		baseline,
		note: first.exitCode === 0 ? "first run green" : plan.reason,
	});
	const written = writeQuarantineSummary({ dir: quarantineDir, summary });
	log(formatQuarantineLogLine(summary, written.path));
	return { exitCode, summary, summaryPath: written.path, quarantineDir };
}

/***
 * MARK: main
 * @description CLI entry: runs the lane and propagates its exit code.
 ***/
async function main() {
	const { exitCode } = runCanaryGate({});
	process.exitCode = exitCode;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main();
}
