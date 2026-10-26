#!/usr/bin/env node
/***
 * MARK: run-tests.mjs
 * @description Cross-platform full-project verification gate: the same seven
 *   checks the old `run-tests.sh` ran plus the Container Tests branch, the
 *   Frontend Build branch (exercises the deprecation gate), and the
 *   Dependency Audit Gate, in a single overlap window (the two unit suites
 *   alone take ~2x35s sequentially, so overlapping keeps the wall near one
 *   suite), with identical `Running <name>... PASS/FAIL (<s>s)` lines and exit semantics —
 *   but driven by Node (`node:child_process`, no shell), so it runs on
 *   Linux, macOS, and Windows with only Node + npm installed. Shells out
 *   only to `npm`/Node/Docker; the two environment-conditional branches
 *   report SKIP instead of failing when their runtime is absent (Security
 *   Script Tests without `bash`, Container Tests without a Docker daemon).
 *   The fast branches share one overlap window; the Canary Tests branch runs
 *   alone afterwards (see splitGatePhases) — same suites, same exit
 *   semantics, but the heaviest branch never shares CPUs with the unit
 *   suites.
 *   The Container Tests branch runs the static Dockerfile/compose assertions
 *   only; the minutes-long live image build/boot tests are opt-in via
 *   `KAINBAIN_CONTAINER_TESTS=live` (direct suite run, not the gate).
 *   The Canary Tests branch (serial Playwright suite on its own scratch
 *   stack, ~7 min) is IN the default gate so `npm test` and
 *   `deploy.sh --prod` run the exact same suites and regressions surface in
 *   the earliest automated stage, not at the merge/deploy gate (the
 *   #KB-0417 incident). Opt out with `--no-canary` or
 *   `KAINBAIN_SKIP_CANARY=1` for fast sanity cycles; `deploy.sh --prod`
 *   passes `--no-canary` to its `final-test-suite` gate and runs the canary
 *   suite as its own blocking `canary-e2e` gate, so nothing runs twice.
 *   Measured gate wall is ~60-70s without canary (the two unit suites alone
 *   are ~160s of CPU work) and ~366-420s with canary (the serial Playwright
 *   suite is minutes long), so CI stages running this gate need an explicit
 *   `timeout` override well above the 60s engine default
 *   (`config.ciTimeoutMs`) — this project's stage sets 1800s. While branches
 *   run the gate emits `▸ started <name>` lines and a `⏳ still running: …`
 *   tick every 30s (`KAINBAIN_GATE_PROGRESS_INTERVAL_MS`), so a slow branch
 *   never blanks the output (see scripts/lib/run-parallel.mjs).
 *   `run-tests.sh` is a thin shim over this file so `deploy.sh --prod` and
 *   older docs keep working.
 * @example `npm test` => eleven PASS lines (ten fast branches + Canary Tests), exit 0
 * @example `npm test -- --no-canary` => ten PASS lines, exit 0
 ***/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmExecutable, runParallel } from "./lib/run-parallel.mjs";
import {
	checkDirectoryForDuplicates,
	formatViolationsReport,
} from "./check-duplicate-settings.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM = npmExecutable();

/***
 * MARK: pruneStaleTestDirectories
 * @description Removes abandoned test directories from the temporary folder if
 *   they are older than maximumAgeInMilliseconds (default: 30 minutes). Vitest
 *   test setup files mint isolated temporary roots for each worker process; on
 *   long-running servers with memory-backed tmpfs, accumulated test roots will
 *   otherwise exhaust all available inodes and cause ENOSPC failures during CI.
 * @example pruneStaleTestDirectories({ temporaryDirectoryPath: "/tmp", maximumAgeInMilliseconds: 1800000 })
 * @param {Object} [options]
 * @param {string} [options.temporaryDirectoryPath] - path to inspect, defaults to os.tmpdir().
 * @param {number} [options.maximumAgeInMilliseconds] - cutoff age, defaults to 30 minutes.
 * @returns {number} count of pruned directories
 ***/
export function pruneStaleTestDirectories({
	temporaryDirectoryPath = os.tmpdir(),
	maximumAgeInMilliseconds = 30 * 60 * 1000,
} = {}) {
	let prunedDirectoryCount = 0;
	try {
		const directoryEntries = fs.readdirSync(temporaryDirectoryPath, { withFileTypes: true });
		const currentTimestamp = Date.now();
		const testDirectoryPrefixes = [
			"kainbain-test-",
			"kb-",
			"survey-",
			"sitedocs-",
		];

		for (const entry of directoryEntries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const matchesTestPrefix = testDirectoryPrefixes.some((prefix) => entry.name.startsWith(prefix));
			if (!matchesTestPrefix) {
				continue;
			}
			const entryFullPath = path.join(temporaryDirectoryPath, entry.name);
			try {
				const entryStatistics = fs.statSync(entryFullPath);
				const entryAgeInMilliseconds = currentTimestamp - entryStatistics.mtimeMs;
				if (entryAgeInMilliseconds > maximumAgeInMilliseconds) {
					fs.rmSync(entryFullPath, { recursive: true, force: true });
					prunedDirectoryCount += 1;
				}
			} catch {
				// Ignore permission errors or concurrent deletion races
			}
		}
	} catch {
		// Ignore readdir failures if temporary directory is unreadable
	}
	return prunedDirectoryCount;
}

/***
 * MARK: ensureCompileCache
 * @description Defaults `NODE_COMPILE_CACHE` (persisted V8 compilation output
 *   the many vitest workers share) and creates the directory, matching the
 *   old shell gate. Children inherit it through `spawn` env.
 * @example ensureCompileCache() => process.env.NODE_COMPILE_CACHE is set
 ***/
function ensureCompileCache() {
	if (!process.env.NODE_COMPILE_CACHE) {
		process.env.NODE_COMPILE_CACHE = path.join(os.tmpdir(), "kainbain-compile-cache");
	}
	fs.mkdirSync(process.env.NODE_COMPILE_CACHE, { recursive: true });
}

/***
 * MARK: bashAvailable
 * @description Whether `bash` resolves on PATH (needed only by the
 *   bash-only security-scan harness branch).
 * @example bashAvailable() => true
 * @returns {boolean}
 ***/
function bashAvailable() {
	try {
		const result = spawnSync("bash", ["--version"], { stdio: "ignore", windowsHide: true });
		return !result.error;
	} catch {
		return false;
	}
}

/***
 * MARK: dockerAvailable
 * @description Whether a Docker daemon is reachable (needed only by the
 *   Container Tests branch, which builds and boots the production image).
 * @example dockerAvailable() => true
 * @returns {boolean}
 ***/
function dockerAvailable() {
	try {
		const result = spawnSync("docker", ["info"], { stdio: "ignore", windowsHide: true });
		return !result.error && result.status === 0;
	} catch {
		return false;
	}
}

/***
 * MARK: depcheckAvailable
 * @description Whether the `depcheck` devDependency binary is installed in
 *   the root tree (needed only by the Dependency Check branch). A pure file
 *   probe — no spawn, no network — so it stays fast and offline-safe; a
 *   production-only (`--omit=dev`) provisioning simply reports false and
 *   the gate SKIPs the branch instead of failing it.
 * @example depcheckAvailable() => true
 * @param {Object} [opts]
 * @param {string} [opts.root] - repo root to probe, defaults to the gate's root.
 * @param {string} [opts.targetPlatform] - defaults to process.platform.
 * @returns {boolean}
 ***/
export function depcheckAvailable({ root = REPO_ROOT, targetPlatform = process.platform } = {}) {
	const bin = targetPlatform === "win32" ? "depcheck.cmd" : "depcheck";
	try {
		return fs.existsSync(path.join(root, "node_modules", ".bin", bin));
	} catch {
		return false;
	}
}

/***
 * MARK: resolveCanary
 * @description Resolves whether the gate runs the Canary Tests branch.
 *   Included by default (parity with `deploy.sh --prod`); the explicit
 *   opt-outs are `--no-canary` on the command line or `KAINBAIN_SKIP_CANARY=1`
 *   in the environment (the same emergency opt-out `deploy.sh --prod`
 *   documents for its `canary-e2e` gate, matched exactly). The legacy opt-in
 *   flags (`--canary`, `KAINBAIN_CANARY=1`) are accepted as no-ops so old docs
 *   and muscle memory keep working.
 * @example resolveCanary({ argv: ["node", "run-tests.mjs"], env: {} }) => true
 * @example resolveCanary({ argv: ["node", "run-tests.mjs", "--no-canary"], env: {} }) => false
 * @param {Object} [opts]
 * @param {Array<string>} [opts.argv] - defaults to process.argv.
 * @param {Object} [opts.env] - defaults to process.env.
 * @returns {boolean} True when the Canary Tests branch should run.
 ***/
export function resolveCanary({ argv = process.argv, env = process.env } = {}) {
	return !(argv.includes("--no-canary") || env.KAINBAIN_SKIP_CANARY === "1");
}

/***
 * MARK: buildBranches
 * @description Builds the eleven gate branches in canonical order (the ten
 *   fast branches plus the Canary Tests branch). Branch
 *   names match the old shell gate byte-for-byte so output parsers keep
 *   working. The low-priority branches (lint, build, scans, depcheck, audit
 *   gate, self-tests, containers, canary) carry `lowPriority`, the helper's
 *   best-effort equivalent of the old gate's lowered scheduling priority. When `bash` is absent the
 *   Security Script Tests branch is returned in `skipped` (reported as
 *   SKIP, non-fatal) instead of `branches`; likewise Container Tests when
 *   no Docker daemon is reachable, and Dependency Check when the `depcheck`
 *   binary is not installed.
 * @example const { branches, skipped } = buildBranches({ hasBash: false })
 * @param {Object} [opts]
 * @param {boolean} [opts.hasBash] - defaults to a live PATH probe.
 * @param {boolean} [opts.hasDocker] - defaults to a live daemon probe.
 * @param {boolean} [opts.hasDepcheck] - defaults to a live binary probe.
 * @param {boolean} [opts.withCanary] - include the Canary Tests branch; defaults to `true` (`npm test` keeps parity with `deploy.sh --prod`). Opt out via `--no-canary` / `KAINBAIN_SKIP_CANARY=1` (see resolveCanary).
 * @param {string} [opts.nodeExec] - node binary, defaults to process.execPath.
 * @param {string} [opts.npmExec] - npm binary, defaults to the platform one.
 * @returns {{ branches: Array<Object>, skipped: Array<Object> }}
 ***/
/***
 * MARK: splitGatePhases
 * @description Splits gate branches into the two execution phases: the fast
 *   overlap window first, then the Canary Tests branch alone. The canary
 *   suite (serial Playwright on its own scratch api+vite stack, minutes
 *   long) is the gate's heaviest branch; overlapping it with both vitest
 *   suites on a 4-core, swap-full host starved git-heavy api tests into
 *   120s timeouts on whichever file was unlucky (three consecutive red
 *   gates, each on DIFFERENT tests — the load-flake signature, 2026-10-15).
 *   Phasing keeps every suite in the default gate (the #KB-0417 parity
 *   requirement) and keeps the fast branches overlapped; it only stops the
 *   heaviest branch from sharing CPUs with the unit suites. Order within
 *   each phase is preserved.
 * @example splitGatePhases([{ name: "Unit Tests (api)" }, { name: "Canary Tests" }]) => { fast: [{ name: "Unit Tests (api)" }], canary: [{ name: "Canary Tests" }] }
 * @param {Array<Object>} branches - The `buildBranches().branches` list.
 * @returns {{ fast: Array<Object>, canary: Array<Object> }}
 ***/
export function splitGatePhases(branches) {
	const fast = [];
	const canary = [];
	for (const branch of branches) {
		if (branch.name === "Canary Tests") canary.push(branch);
		else fast.push(branch);
	}
	return { fast, canary };
}

export function buildBranches({ hasBash = bashAvailable(), hasDocker = dockerAvailable(), hasDepcheck = depcheckAvailable(), withCanary = true, nodeExec = process.execPath, npmExec = NPM } = {}) {
	const branches = [
		{ name: "Unit Tests (api)", file: npmExec, args: ["run", "test:api"] },
		{ name: "Unit Tests (frontend)", file: npmExec, args: ["run", "test:frontend"] },
		{ name: "Linting (api)", file: npmExec, args: ["run", "lint:api"], lowPriority: true },
		{ name: "Linting (frontend)", file: npmExec, args: ["run", "lint:frontend"], lowPriority: true },
		{ name: "Frontend Build", file: npmExec, args: ["run", "build:frontend"], lowPriority: true },
	];
	const skipped = [];
	if (hasBash) {
		branches.push({
			name: "Security Script Tests",
			file: "bash",
			args: ["tests/security-scans.test.sh"],
			lowPriority: true,
		});
	} else {
		skipped.push({
			name: "Security Script Tests",
			reason: "no bash on PATH (the security-scan harness is bash-only)",
		});
	}
	if (hasDepcheck) {
		branches.push(
			{ name: "Dependency Check", file: npmExec, args: ["run", "depcheck"], lowPriority: true },
		);
	} else {
		skipped.push({
			name: "Dependency Check",
			reason: "no depcheck binary in the root tree (run `npm install` to enable the unused-dependency check)",
		});
	}
	branches.push(
		{
			name: "Dependency Audit Gate",
			file: nodeExec,
			args: ["scripts/check-dep-audit.mjs"],
			lowPriority: true,
		},
		{
			name: "Harness Self-Tests",
			file: nodeExec,
			args: [
				"--test",
				"tests/run-parallel.test.mjs",
				"tests/repeat-tests.test.mjs",
				"tests/deprecation-gate.test.mjs",
				"tests/free-port.test.mjs",
				"tests/canary-preflight.test.mjs",
				"tests/deploy-gates.test.mjs",
				"tests/run-supervised.test.mjs",
				"tests/run-tests.test.mjs",
				"tests/dev.test.mjs",
				"tests/deploy-reexec.test.mjs",
				"tests/setup.test.mjs",
				"tests/storage-sanity.test.mjs",
				"tests/remediate-no-verdict-rejections.test.mjs",
				"tests/entry-platform.test.mjs",
				"tests/check-one-function-per-file.test.mjs",
				"tests/check-jsdoc-example.test.mjs",
				"tests/check-duplicate-settings.test.mjs",
			],
			lowPriority: true,
		},
	);
	if (hasDocker) {
		branches.push({
			name: "Container Tests",
			file: nodeExec,
			args: ["--test", "tests/docker.test.mjs"],
			lowPriority: true,
		});
	} else {
		skipped.push({
			name: "Container Tests",
			reason: "no Docker daemon reachable (container build/boot tests need one)",
		});
	}
	if (withCanary) {
		branches.push({
			name: "Canary Tests",
			file: npmExec,
			args: ["run", "test:canary"],
			lowPriority: true,
			// Honest hung-branch ceiling (15 min): the canary branch is
			// minutes long and its output goes quiet mid-run, so the gate's
			// silence guards must never be its only bound — a wedged Playwright
			// run is killed by THIS budget with exit 124, long before the
			// engine's stage timeout.
			timeoutMs: 15 * 60 * 1000,
		});
	}
	return { branches, skipped };
}

/***
 * MARK: main
 * @description Runs the gate: one overlap window over every branch, then
 *   the canary opt-out note when canary was skipped. Exits 0 only when
 *   every branch passes.
 ***/
async function main() {
	console.log("Starting full project verification...");
	pruneStaleTestDirectories();
	ensureCompileCache();
	const withCanary = resolveCanary();
	const { branches, skipped } = buildBranches({ withCanary });
	for (const entry of skipped) {
		console.log(`Running ${entry.name}... SKIP (${entry.reason})`);
	}
	// Two phases, same suites: the fast branches overlap as before, then the
	// canary suite runs alone (see splitGatePhases). Every branch still runs
	// to completion and the exit semantics are unchanged.
	const { fast, canary } = splitGatePhases(branches);
	const fastPreflightResult = await checkDirectoryForDuplicates({
		baseDirectoryPath: REPO_ROOT,
	});
	if (!fastPreflightResult.isClean) {
		console.error(
			formatViolationsReport({
				violationsList: fastPreflightResult.violationsList,
			}),
		);
		process.exitCode = 1;
		return;
	}
	console.log(
		`✅ Settings duplicate check passed (${fastPreflightResult.totalFilesScanned} files in ${fastPreflightResult.durationMilliseconds}ms)`,
	);
	const { ok: fastOk } = await runParallel(fast, { cwd: REPO_ROOT });
	let canaryOk = true;
	if (canary.length > 0) {
		console.log("Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...");
		({ ok: canaryOk } = await runParallel(canary, { cwd: REPO_ROOT }));
	}
	const ok = fastOk && canaryOk;
	// Only on success: the old shell gate short-circuited (`|| exit 1`), so
	// a failing run ends with the failure details, not this line.
	if (ok && !withCanary) {
		console.log("⏭️ Skipping Canary Tests (opted out via --no-canary or KAINBAIN_SKIP_CANARY=1; npm test and deploy.sh --prod run them by default)");
	}
	process.exitCode = ok ? 0 : 1;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main();
}
