#!/usr/bin/env node
/***
 * MARK: run-tests.mjs
 * @description Cross-platform full-project verification gate: the same seven
 *   checks the old `run-tests.sh` ran plus the Container Tests branch, the
 *   Frontend Build branch (exercises the deprecation gate), the Dependency
 *   Audit Gate, and the Proof Hygiene branch, in a single overlap window
 *   (the two unit suites
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
 *   suites. Fail-fast is ON by default (see resolveFailFast): when the fast
 *   phase fails, the gate writes its verdict (`verdict.json` plus one
 *   untrimmed `<branch-slug>.full.log` per failed branch) under
 *   `$KAINBAIN_TASK_DOCS/ci-fast-gate-<timestamp>/`, prints the
 *   `KAINBAIN_FAST_GATE_RESULT` banner, and skips the serial canary phase
 *   with an explicit SKIP line — so the failure surfaces seconds after the
 *   fast phase instead of ~13 minutes later. Opt out with `--no-fail-fast`
 *   or `KAINBAIN_NO_FAIL_FAST=1` (canary still runs after a red fast phase,
 *   but the verdict still lands early). A green fast phase always runs
 *   canary (the #KB-0417 parity requirement); deploy.sh --prod passes
 *   `--no-canary` to its final-test-suite gate, so fail-fast changes
 *   nothing there. Failure Details tails stay bounded (120 lines by
 *   default, `KAINBAIN_FAILURE_TAIL_LINES` to tune) with a `Full log:`
 *   pointer at the untrimmed file; the verdict pointers are printed at the
 *   gate's head and tail so they survive the engine's head+tail excerpts.
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
 * @example `npm test` => thirteen PASS lines (twelve fast branches + Canary Tests), exit 0
 * @example `npm test -- --no-canary` => twelve PASS lines, exit 0
 ***/

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { npmExecutable, resolveFailureTailLines, runParallel } from "./lib/run-parallel.mjs";
import {
	branchSlug,
	buildFastGateVerdict,
	ensureVerdictDir,
	formatFastGateBanner,
	resolveVerdictDir,
	writeFastGateVerdict,
} from "./lib/fast-gate-verdict.mjs";
import {
	checkDirectoryForDuplicates,
	formatViolationsReport,
} from "./check-duplicate-settings.mjs";
import {
	checkPackageDirectory as checkFrontendImportsDeclared,
	formatUndeclaredReport,
} from "../frontend/scripts/check-imports-declared.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM = npmExecutable();

/***
 * MARK: pruneStaleTestDirectories
 * @description Removes abandoned kainbain scratch directories from the
 *   temporary folder if they are older than maximumAgeInMilliseconds
 *   (default: 30 minutes). Vitest setups mint isolated roots per worker and
 *   agents mint per-attempt deploy/stage/survey/recon dirs; on long-running
 *   servers with memory-backed tmpfs, the tens of thousands of accumulated
 *   roots otherwise exhaust inodes and eat gigabytes of RAM during CI
 *   (2026-11-03: 49k entries, 4.1G/7.6G of tmpfs). One broad `kainbain-`
 *   stem covers scratch families invented tomorrow; the keep-list below
 *   protects the few names that must survive (compile caches, the canary
 *   suite's live scratch roots).
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
		const scratchDirectoryPrefixes = ["kainbain-", "kb-", "survey-", "sitedocs-"];
		// Never prune these: compile caches are big, shared, and harmless,
		// and kb-canary-e2e holds a possibly LIVE canary scratch stack from
		// a concurrent task (it reclaims itself after 24h in
		// canary-e2e/playwright.config.js).
		const keepDirectoryNames = new Set(["kb-canary-e2e"]);

		for (const entry of directoryEntries) {
			if (!entry.isDirectory()) {
				continue;
			}
			const matchesScratchPrefix = scratchDirectoryPrefixes.some((prefix) =>
				entry.name.startsWith(prefix),
			);
			if (!matchesScratchPrefix) {
				continue;
			}
			if (keepDirectoryNames.has(entry.name) || entry.name.includes("cache")) {
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
 *   old shell gate. Children inherit it through `spawn` env. The default is
 *   disk-backed (`~/.cache`): /tmp is tmpfs (RAM) on the gate host and the
 *   cache grows to ~1G, which directly eats memory and swap (2026-11-03).
 * @example ensureCompileCache() => process.env.NODE_COMPILE_CACHE is set
 ***/
function ensureCompileCache() {
	if (!process.env.NODE_COMPILE_CACHE) {
		process.env.NODE_COMPILE_CACHE = path.join(os.homedir(), ".cache", "kainbain-compile-cache");
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
 * MARK: WORKSPACE_PACKAGES
 * @description Every package directory with its own install root. A root
 *   `npm install` — all a fresh Runner clone runs — never installs these,
 *   so the gate provisions each one itself (see ensureWorkspaceDeps) instead
 *   of failing branches with "command not found" (2026-10-27 task b5716327:
 *   fresh workdir, no api/frontend/canary-e2e node_modules).
 * @example WORKSPACE_PACKAGES => ["api", "frontend", "canary-e2e"]
 ***/
export const WORKSPACE_PACKAGES = ["api", "frontend", "canary-e2e"];

/***
 * MARK: workspaceDepsInstalled
 * @description Whether every workspace package's dependencies resolve from
 *   its own package directory. Reads each package's dependency names from
 *   its manifest (dependencies and devDependencies alike) and checks each
 *   for a landed package.json under that package's node_modules.
 * @example workspaceDepsInstalled({ root: "/repo" }) => { installed: true, missing: {} }
 * @param {Object} [opts]
 * @param {string} [opts.root] - repo root to probe, defaults to the gate's root.
 * @param {string[]} [opts.packages] - package dirs to check, defaults to every workspace package.
 * @returns {{ installed: boolean, missing: Record<string, string[]> }} Install state plus the missing names per package.
 ***/
export function workspaceDepsInstalled({ root = REPO_ROOT, packages = WORKSPACE_PACKAGES } = {}) {
	const missing = {};
	for (const pkg of packages) {
		let dependencies = null;
		try {
			const manifest = JSON.parse(
				fs.readFileSync(path.join(root, pkg, "package.json"), "utf8"),
			);
			dependencies = { ...(manifest.dependencies || {}), ...(manifest.devDependencies || {}) };
		} catch {
			missing[pkg] = [`${pkg}/package.json unreadable`];
			continue;
		}
		const absent = Object.keys(dependencies).filter((name) => {
			try {
				return !fs.existsSync(path.join(root, pkg, "node_modules", name, "package.json"));
			} catch {
				return true;
			}
		});
		if (absent.length > 0) missing[pkg] = absent;
	}
	return { installed: Object.keys(missing).length === 0, missing };
}

/***
 * MARK: WORKSPACE_INSTALL_TIMEOUT_MS
 * @description Honest ceiling for one package's one-shot dependency install
 *   (registry fetch on a fresh clone). A wedged registry is killed by this
 *   budget instead of hanging the gate to the stage timeout.
 * @example WORKSPACE_INSTALL_TIMEOUT_MS => 300000
 ***/
export const WORKSPACE_INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/***
 * MARK: ensureWorkspaceDeps
 * @description Installs each workspace package's dependencies when they are
 *   absent (fresh Runner clone) and only then. No-op for packages that
 *   already resolve (and for canary-e2e when canary is opted out);
 *   re-verifies after installing so a silent partial install still fails
 *   loudly instead of failing branches with "command not found".
 * @example ensureWorkspaceDeps({ root: "/repo", withCanary: true }) => { ok: true, installed: [] }
 * @param {Object} [opts]
 * @param {string} [opts.root] - repo root, defaults to the gate's root.
 * @param {boolean} [opts.withCanary] - whether the Canary Tests branch will run (only then is canary-e2e provisioned).
 * @param {string} [opts.npmExec] - npm binary, defaults to the platform one.
 * @param {Function} [opts.spawnFn] - spawnSync seam, defaults to a live spawn.
 * @returns {{ ok: boolean, installed?: string[], error?: string }}
 ***/
export function ensureWorkspaceDeps({ root = REPO_ROOT, withCanary = true, npmExec = NPM, spawnFn = spawnSync } = {}) {
	const packages = withCanary
		? [...WORKSPACE_PACKAGES]
		: WORKSPACE_PACKAGES.filter((name) => name !== "canary-e2e");
	const before = workspaceDepsInstalled({ root, packages });
	if (before.installed) return { ok: true, installed: [] };
	const installed = [];
	for (const pkg of Object.keys(before.missing)) {
		if (before.missing[pkg].length === 1 && before.missing[pkg][0].endsWith("package.json unreadable")) {
			return { ok: false, error: `Workspace dependencies could not be checked (${before.missing[pkg][0]}).` };
		}
		console.log(
			`Dependencies missing for ${pkg} (${before.missing[pkg].join(", ")}) — installing (npm install --prefix ${pkg})...`,
		);
		let status = null;
		let spawnError = null;
		try {
			const result = spawnFn(npmExec, ["install", "--prefix", pkg], {
				cwd: root,
				timeout: WORKSPACE_INSTALL_TIMEOUT_MS,
				stdio: "inherit",
			});
			status = result?.status ?? null;
			spawnError = result?.error ?? null;
		} catch (err) {
			spawnError = err;
		}
		if (spawnError != null || (typeof status === "number" && status !== 0)) {
			const cause =
				spawnError != null
					? `install failed: ${spawnError.message || String(spawnError)}`
					: `install exited with status ${status}`;
			return {
				ok: false,
				error: `Workspace dependencies could not be installed for ${pkg} (${cause}). Refusing to run a gate whose branches would fail for missing setup.`,
			};
		}
		installed.push(pkg);
	}
	const after = workspaceDepsInstalled({ root, packages });
	if (after.installed) {
		console.log(`Workspace dependencies installed (${installed.join(", ")}).`);
		return { ok: true, installed };
	}
	const stillMissing = Object.entries(after.missing)
		.map(([pkg, names]) => `${pkg}: ${names.join(", ")}`)
		.join("; ");
	return {
		ok: false,
		error: `Workspace dependencies installed but still missing (${stillMissing}). Refusing to run a gate whose branches would fail for missing setup.`,
	};
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
 * MARK: FAST_GATE_BRANCH_NAMES
 * @description The fast-gate set: the branches whose failure reports first —
 *   the three unit suites, the two lint branches, and the Harness
 *   Self-Tests. The fail-fast predicate itself is uniform (ANY fast-phase
 *   failure skips the serial canary phase), but the verdict flags these
 *   branches' failures as the fast-gate signal so the fixing agent sees
 *   the cheap, deterministic failures before anything else.
 * @example FAST_GATE_BRANCH_NAMES.includes("Unit Tests (api)") => true
 ***/
export const FAST_GATE_BRANCH_NAMES = [
	"Unit Tests (api)",
	"Unit Tests (frontend)",
	"Unit Tests (runner)",
	"Linting (api)",
	"Linting (frontend)",
	"Harness Self-Tests",
];

/***
 * MARK: resolveFailFast
 * @description Resolves whether the gate skips the serial canary phase when
 *   the fast phase fails. ON by default (the agent-visible verdict lands
 *   seconds after the fast phase instead of ~13 minutes later); the
 *   explicit opt-outs are `--no-fail-fast` on the command line or
 *   `KAINBAIN_NO_FAIL_FAST=1` in the environment. The explicit `--fail-fast`
 *   flag is accepted as a no-op so scripts can pin the behaviour. Deploy
 *   is unaffected: it already passes `--no-canary` to its `final-test-suite`
 *   gate, so there is no canary branch left to skip.
 * @example resolveFailFast({ argv: ["node", "run-tests.mjs"], env: {} }) => true
 * @example resolveFailFast({ argv: ["node", "run-tests.mjs", "--no-fail-fast"], env: {} }) => false
 * @param {Object} [opts]
 * @param {Array<string>} [opts.argv] - defaults to process.argv.
 * @param {Object} [opts.env] - defaults to process.env.
 * @returns {boolean} True when a failed fast phase skips canary.
 ***/
export function resolveFailFast({ argv = process.argv, env = process.env } = {}) {
	return !(argv.includes("--no-fail-fast") || env.KAINBAIN_NO_FAIL_FAST === "1");
}

/***
 * MARK: buildBranches
 * @description Builds the thirteen gate branches in canonical order (the
 *   twelve fast branches plus the Canary Tests branch). Branch
 *   names match the old shell gate byte-for-byte so output parsers keep
 *   working. The low-priority branches (lint, build, scans, depcheck, audit
 *   gate, self-tests, containers, canary) carry `lowPriority`, the helper's
 *   best-effort equivalent of the old gate's lowered scheduling priority. The
 *   three unit suites (api, frontend, runner) run at normal priority. When `bash` is absent the
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
		{
			name: "Unit Tests (runner)",
			file: nodeExec,
			// Explicit file list, never a bare directory or a glob: `node
			// --test runner/` mis-resolves the positional directory on
			// current Node, and a glob would need a shell (the gate never
			// spawns through one). tests/run-tests.test.mjs pins that every
			// runner/*.test.js on disk is named here, so a new suite file
			// fails the gate instead of silently never running.
			args: [
				"--test",
				"runner/ciBranchWorkdir.test.js",
				"runner/daemon.test.js",
				"runner/client.test.js",
			"runner/impromptu.test.js",
				"runner/config.test.js",
				"runner/gitOps.test.js",
				"runner/harness.test.js",
				"runner/logEvents.test.js",
				"runner/modelDiscovery.test.js",
				"runner/harnessModelDiscovery.test.js",
				"runner/project.test.js",
				"runner/updates-check.test.js",
				"runner/updates-compat.test.js",
				"runner/updates-daemon.test.js",
				"runner/updates-fixture.test.js",
				"runner/updates-manifest.test.js",
				"runner/updates-platform.test.js",
				"runner/updates-state.test.js",
				"runner/updates-verify.test.js",
				"runner/updates-wrapper.test.js",
			],
		},
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
			// Real-tree enforcement for binary-safe proof artifacts and
			// repo-root scratch hygiene (task b1c069e0): the Harness
			// Self-Tests pin the checker's logic on fixtures, but only this
			// branch scans the worktree — without it a corrupt proof or a
			// stray root scratch file would sail through `npm test`.
			// Dependency-free (Node stdlib only) and sub-second, so it needs
			// no workspace provisioning and no timeout override.
			name: "Proof Hygiene",
			file: nodeExec,
			args: ["scripts/check-proof-and-hygiene.mjs"],
			lowPriority: true,
		},
		{
			name: "Harness Self-Tests",
			file: nodeExec,
			args: [
				"--test",
				"tests/run-parallel.test.mjs",
				"tests/fast-gate-verdict.test.mjs",
				"tests/fast-gate-excerpts.test.mjs",
				"tests/fast-gate-acceptance.test.mjs",
				"tests/repeat-tests.test.mjs",
				"tests/deprecation-gate.test.mjs",
				"tests/free-port.test.mjs",
				"tests/generate-changelog.test.mjs",
				"tests/canary-preflight.test.mjs",
				"tests/canary-lock.test.mjs",
				"tests/canary-readiness.test.mjs",
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
				"tests/check-imports-declared.test.mjs",
				"tests/check-component-compat.test.mjs",
				"tests/detect-changed-components.test.mjs",
				"tests/publish.test.mjs",
				"tests/sync-tip-dist.test.mjs",
				"tests/runner-release-manifest.test.mjs",
				"tests/package-runner-conformance.test.mjs",
				"tests/check-runner-version-bump.test.mjs",
				"tests/migrate-runner-to-wrapper.test.mjs",
				"tests/install-runner-wrapper.test.mjs",
				"tests/redeploy.test.mjs",
				"tests/verify-stage-attestation.test.mjs",
				"tests/check-proof-and-hygiene.test.mjs",
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
			// Honest hung-branch ceiling (25 min): the canary branch is
			// minutes long and its output goes quiet mid-run, so the gate's
			// silence guards must never be its only bound — a wedged Playwright
			// run is killed by THIS budget with exit 124, long before the
			// engine's stage timeout. Healthy runs take ~14 min; the headroom
			// absorbs loaded-host jitter plus a possible wait on the host-wide
			// canary mutex (canary-e2e/canary-lock.js), which serializes suites
			// across tasks so overlapping runs stop killing each other's
			// scratch stacks (2026-11-03: every task failing CI).
			timeoutMs: 25 * 60 * 1000,
		});
	}
	return { branches, skipped };
}

/***
 * MARK: reportPreflightFailure
 * @description Reports a preflight failure (the settings-duplicate or
 *   frontend-imports guardrail that runs before the overlap window opens):
 *   writes the fast-gate verdict with the preflight entry plus its full
 *   report, and logs the banner — so even the fastest gate of all leaves
 *   the same machine-readable trail as a branch failure. The caller still
 *   owns the stderr report and the exit code.
 * @example reportPreflightFailure({ name: "Settings duplicate check", reportText: "dup!", verdictDir: "/tmp/v", verdictReady: true, withCanary: true }) => { ok: false, … }
 * @param {Object} [opts]
 * @param {string} [opts.name] - Preflight name (a verdict failed-branch entry).
 * @param {string} [opts.reportText] - Full preflight report (becomes the untrimmed full log).
 * @param {string} [opts.verdictDir] - Verdict directory (must already exist when verdictReady).
 * @param {boolean} [opts.verdictReady] - False degrades every pointer to "unavailable".
 * @param {boolean} [opts.withCanary] - Whether canary was in the gate (recorded as skipped, never silent).
 * @param {Function} [opts.log] - Line sink, defaults to console.log.
 * @returns {Object} { ok: false, verdictPath, logPaths }.
 ***/
export function reportPreflightFailure({
	name,
	reportText = "",
	verdictDir = null,
	verdictReady = false,
	withCanary = true,
	log = (...args) => console.log(...args),
} = {}) {
	const verdict = buildFastGateVerdict({
		fastResults: [],
		fastGateNames: FAST_GATE_BRANCH_NAMES,
		canaryDecision: withCanary ? "skipped_due_to_fast_gate_failure" : "opted_out",
		preflightFailure: {
			name: String(name ?? "Preflight check"),
			detail: String(reportText ?? "").split("\n")[0] ?? "",
		},
	});
	let written = { ok: false, verdictPath: null, logPaths: [] };
	if (verdictReady) {
		written = writeFastGateVerdict({
			dir: verdictDir,
			verdict,
			fullOutputs: [{ name: String(name ?? "Preflight check"), output: String(reportText ?? "") }],
		});
	}
	log(
		formatFastGateBanner({
			verdict,
			verdictPath: written.verdictPath ?? null,
			logPaths: written.logPaths ?? [],
			verdictAvailable: written.ok === true,
		}),
	);
	return { ok: false, verdictPath: written.verdictPath ?? null, logPaths: written.logPaths ?? [] };
}

/***
 * MARK: CANARY_SERIAL_START_LINE
 * @description The line the gate prints when the fast phase passed (or
 *   fail-fast is off) and the canary suite starts its serial phase. Pinned
 *   byte-for-byte: operators and log scrapers match it.
 * @example CANARY_SERIAL_START_LINE => "Fast gate complete — starting Canary Tests alone …"
 ***/
export const CANARY_SERIAL_START_LINE =
	"Fast gate complete — starting Canary Tests alone (serial phase, no shared CPUs with the unit suites)...";

/***
 * MARK: resolvePhaseOutcome
 * @description Reads one overlap-window run the way the verdict needs it:
 *   the phase passes only when the runner claims success AND no branch
 *   result disagrees. A runner that reports failure without naming a failed
 *   branch (a custom seam, a truncated return) still fails the gate, and
 *   the verdict names the gap as `unknown branch` instead of claiming ok —
 *   the verdict and the exit code can never disagree.
 * @example resolvePhaseOutcome({ run: { ok: false, results: [] } }) => { ok: false, failedNames: ["unknown branch"], … }
 * @param {Object} [opts]
 * @param {Object} [opts.run] - A `runParallel` result ({ ok, results }).
 * @param {string} [opts.fallbackName] - Failed-branch name when the run names none.
 * @returns {{ ok: boolean, verdictResults: Array<Object>, failedNames: Array<string> }}
 ***/
export function resolvePhaseOutcome({ run, fallbackName = "unknown branch" } = {}) {
	const results = Array.isArray(run?.results) ? run.results : [];
	const failedResults = results.filter((result) => result && result.ok !== true);
	const failedNames = failedResults.map((result) => String(result?.name ?? "unknown branch"));
	if (failedNames.length > 0) {
		return { ok: false, verdictResults: results, failedNames };
	}
	if (run?.ok === true) {
		return { ok: true, verdictResults: results, failedNames: [] };
	}
	return {
		ok: false,
		verdictResults: [...results, { name: fallbackName, ok: false, exitCode: null, wallSecs: 0 }],
		failedNames: [fallbackName],
	};
}

/***
 * MARK: runGatePhases
 * @description Runs the gate's two phases — the fast overlap window, then
 *   the canary suite alone — with fail-fast verdict reporting. The moment
 *   the fast phase resolves the verdict (`verdict.json` plus one untrimmed
 *   full log per failed branch) is written and the banner is logged; when
 *   fail-fast is on and the fast phase failed, the ~13-minute serial canary
 *   phase is skipped with an explicit SKIP line and the gate returns within
 *   seconds instead of after the canary. A green fast phase always runs
 *   canary (the #KB-0417 parity requirement); every `Running <name>...
 *   PASS/FAIL` line keeps its exact shape. Phase outcomes are read through
 *   resolvePhaseOutcome, so a runner that reports failure without naming a
 *   branch still fails the gate as `unknown branch` — the verdict and the
 *   exit code can never disagree.
 * @example const { ok } = await runGatePhases({ fastBranches: [], canaryBranches: [] })
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.fastBranches] - Fast overlap-window branches.
 * @param {Array<Object>} [opts.canaryBranches] - Serial-phase branches (empty when canary is opted out).
 * @param {boolean} [opts.failFast] - Skip canary on fast-phase failure; defaults to true.
 * @param {string} [opts.verdictDir] - Verdict directory (must already exist when verdictReady).
 * @param {boolean} [opts.verdictReady] - False degrades every pointer to "unavailable".
 * @param {string} [opts.cwd] - Working directory for every branch.
 * @param {Function} [opts.runParallelFn] - Overlap runner seam, defaults to runParallel.
 * @param {Function} [opts.log] - Line sink, defaults to console.log.
 * @returns {Promise<Object>} { ok, fastOk, canaryOk, canaryDecision, verdictPath, logPaths }.
 ***/
export async function runGatePhases({
	fastBranches = [],
	canaryBranches = [],
	failFast = true,
	verdictDir = null,
	verdictReady = false,
	cwd = REPO_ROOT,
	runParallelFn = runParallel,
	log = (...args) => console.log(...args),
} = {}) {
	const tailLines = resolveFailureTailLines();
	const canPointAtFullLogs =
		verdictReady === true && typeof verdictDir === "string" && verdictDir.length > 0;
	const failureDetailsPreamble = canPointAtFullLogs
		? (result) =>
				`Full log: ${result.name} → ${path.join(verdictDir, `${branchSlug(result.name)}.full.log`)}`
		: undefined;
	const failedOutputsOf = (results) =>
		(Array.isArray(results) ? results : [])
			.filter((result) => result && result.ok !== true)
			.map((result) => ({
				name: String(result.name ?? "unknown branch"),
				output: typeof result.output === "string" ? result.output : "",
			}));
	const writePhaseVerdict = (verdict, fullOutputs) => {
		if (!canPointAtFullLogs) return { ok: false, verdictPath: null, logPaths: [] };
		const written = writeFastGateVerdict({ dir: verdictDir, verdict, fullOutputs });
		return {
			ok: written.ok === true,
			verdictPath: written.verdictPath ?? null,
			logPaths: written.logPaths ?? [],
		};
	};
	const logBanner = (verdict, written) => {
		log(
			formatFastGateBanner({
				verdict,
				verdictPath: written.verdictPath,
				logPaths: written.logPaths,
				verdictAvailable: written.ok,
			}),
		);
	};

	const fastRun = await runParallelFn(fastBranches, {
		cwd,
		failureOutputTailLines: tailLines,
		failureDetailsPreamble,
	});
	const fastOutcome = resolvePhaseOutcome({ run: fastRun });
	const fastResults = Array.isArray(fastRun?.results) ? fastRun.results : [];
	const fastOk = fastOutcome.ok;
	const failedNames = fastOutcome.failedNames;

	const skipCanary = failFast === true && !fastOk && canaryBranches.length > 0;
	const earlyDecision =
		canaryBranches.length === 0
			? "opted_out"
			: skipCanary
				? "skipped_due_to_fast_gate_failure"
				: "pending";
	const earlyVerdict = buildFastGateVerdict({
		fastResults: fastOutcome.verdictResults,
		fastGateNames: FAST_GATE_BRANCH_NAMES,
		canaryDecision: earlyDecision,
	});
	const earlyWritten = writePhaseVerdict(earlyVerdict, failedOutputsOf(fastResults));
	logBanner(earlyVerdict, earlyWritten);

	let canaryOk = true;
	let canaryResults = null;
	let canaryDecision = earlyDecision;
	if (skipCanary) {
		log(
			`Running Canary Tests... SKIP (fast-gate failed: ${failedNames.join(", ")}; verdict at ${earlyWritten.verdictPath ?? "unavailable"})`,
		);
	} else if (canaryBranches.length > 0) {
		log(CANARY_SERIAL_START_LINE);
		const canaryRun = await runParallelFn(canaryBranches, {
			cwd,
			failureOutputTailLines: tailLines,
			failureDetailsPreamble,
		});
		const canaryOutcome = resolvePhaseOutcome({ run: canaryRun });
		canaryResults = canaryOutcome.verdictResults;
		canaryOk = canaryOutcome.ok;
		canaryDecision = "ran";
	}

	const closingVerdict = buildFastGateVerdict({
		fastResults: fastOutcome.verdictResults,
		fastGateNames: FAST_GATE_BRANCH_NAMES,
		canaryDecision,
		canaryResults,
	});
	const closingWritten = writePhaseVerdict(closingVerdict, [
		...failedOutputsOf(fastResults),
		...failedOutputsOf(canaryResults),
	]);
	logBanner(closingVerdict, closingWritten);

	return {
		ok: fastOk && canaryOk,
		fastOk,
		canaryOk,
		canaryDecision,
		verdictPath: closingWritten.verdictPath,
		logPaths: closingWritten.logPaths,
	};
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
	const failFast = resolveFailFast();
	// The verdict directory is resolved and created BEFORE the first branch
	// runs: the head pointer line below survives the engine's head+tail
	// excerpts, and every failure Details section can point at full-log
	// paths that are guaranteed creatable.
	const verdictSelection = resolveVerdictDir({ env: process.env });
	const verdictReady = ensureVerdictDir({ dir: verdictSelection.dir });
	if (verdictReady) {
		console.log(
			`Fast-gate verdict dir: ${verdictSelection.dir} (verdict.json + untrimmed failed-branch logs land here)`,
		);
	} else {
		console.log(
			`Fast-gate verdict files unavailable (cannot write ${verdictSelection.dir}); inline excerpts carry the detail`,
		);
	}
	// Provision workspace installs BEFORE anything that needs them: the
	// Settings duplicate check below parses with the frontend toolchain, so
	// it also depends on provisioned node_modules (fresh-clone gate, 2026-10-27).
	const workspaceDeps = ensureWorkspaceDeps({ root: REPO_ROOT, withCanary, npmExec: NPM });
	if (!workspaceDeps.ok) {
		console.error(workspaceDeps.error);
		process.exitCode = 1;
		return;
	}
	const { branches, skipped } = buildBranches({ withCanary });
	for (const entry of skipped) {
		console.log(`Running ${entry.name}... SKIP (${entry.reason})`);
	}
	// Two phases, same suites: the fast branches overlap as before, then the
	// canary suite runs alone (see splitGatePhases) — unless fail-fast skips
	// it after a fast-phase failure (see runGatePhases). Every fast branch
	// still runs to completion and the exit semantics are unchanged.
	const { fast, canary } = splitGatePhases(branches);
	const fastPreflightResult = await checkDirectoryForDuplicates({
		baseDirectoryPath: REPO_ROOT,
	});
	if (!fastPreflightResult.isClean) {
		const preflightReport = formatViolationsReport({
			violationsList: fastPreflightResult.violationsList,
		});
		console.error(preflightReport);
		reportPreflightFailure({
			name: "Settings duplicate check",
			reportText: preflightReport,
			verdictDir: verdictSelection.dir,
			verdictReady,
			withCanary,
		});
		process.exitCode = 1;
		return;
	}
	console.log(
		`✅ Settings duplicate check passed (${fastPreflightResult.totalFilesScanned} files in ${fastPreflightResult.durationMilliseconds}ms)`,
	);
	// Fail-first manifest guardrail (frontend-only): an undeclared import
	// used to sail through every cheap stage and then fail the expensive
	// ones (Frontend Build, depcheck, canary, publish). This preflight runs
	// in milliseconds, before the overlap window starts anything. The check
	// throws (instead of passing) when the manifest or a source file cannot
	// be read, or nothing is found to scan — reported here as a one-line
	// gate failure, not a stack trace.
	let frontendImportsResult;
	try {
		frontendImportsResult = checkFrontendImportsDeclared({
			packageDirectoryPath: path.join(REPO_ROOT, "frontend"),
		});
	} catch (error) {
		const preflightReport = `❌ Frontend imports check failed: ${error.message}`;
		console.error(preflightReport);
		reportPreflightFailure({
			name: "Frontend imports check",
			reportText: preflightReport,
			verdictDir: verdictSelection.dir,
			verdictReady,
			withCanary,
		});
		process.exitCode = 1;
		return;
	}
	if (!frontendImportsResult.isClean) {
		const preflightReport = formatUndeclaredReport({
			violationsList: frontendImportsResult.violationsList,
		});
		console.error(preflightReport);
		reportPreflightFailure({
			name: "Frontend imports check",
			reportText: preflightReport,
			verdictDir: verdictSelection.dir,
			verdictReady,
			withCanary,
		});
		process.exitCode = 1;
		return;
	}
	console.log(
		`✅ Frontend imports check passed (${frontendImportsResult.totalFilesScanned} files in ${frontendImportsResult.durationMilliseconds}ms)`,
	);
	const { ok } = await runGatePhases({
		fastBranches: fast,
		canaryBranches: canary,
		failFast,
		verdictDir: verdictSelection.dir,
		verdictReady,
		cwd: REPO_ROOT,
	});
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
