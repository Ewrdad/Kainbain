import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { CANARY_SERIAL_START_LINE, FAST_GATE_BRANCH_NAMES, RUNNER_TEST_SUITES, buildBranches, buildRunnerSuiteArgs, checkRunnerSuiteList, depcheckAvailable, ensureWorkspaceDeps, resolvePhaseOutcome, pruneStaleTestDirectories, reportPreflightFailure, resolveCanary, resolveFailFast, runGatePhases, splitGatePhases, workspaceDepsInstalled } = await import("../scripts/run-tests.mjs");

/***
 * MARK: run-tests tests
 * @description Hermetic tests for the gate's branch assembly and canary
 *   resolution (scripts/run-tests.mjs): the fourteen canonical branches in
 *   order with shell-free spawn shapes, the bash-less SKIP path for the
 *   bash-only security-scan branch, the docker-less SKIP path for the
 *   Container Tests branch, the depcheck-less SKIP path for the Dependency
 *   Check branch (production-only installs carry no `depcheck` binary),
 *   and the canary parity contract — `npm test` runs the same suites as
 *   `deploy.sh --prod`, with Canary Tests in by default and an explicit
 *   `--no-canary` / `KAINBAIN_SKIP_CANARY=1` opt-out. The branches
 *   themselves are exercised by the real `npm test` run, not here.
 * @example run `node --test tests/run-tests.test.mjs`
 ***/

const CANONICAL_NAMES = [
	"Unit Tests (api)",
	"Unit Tests (frontend)",
	"Unit Tests (runner)",
	"Linting (api)",
	"Linting (frontend)",
	"Frontend Build",
	"Security Script Tests",
	"Dependency Check",
	"Dependency Audit Gate",
	"Proof Hygiene",
	"Binary Guard",
	"Harness Self-Tests",
	"Container Tests",
	"Canary Tests",
];

describe("buildBranches", () => {
	it("builds the fourteen canonical branches in order when bash and docker exist", () => {
		const { branches, skipped } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		assert.deepEqual(
			branches.map((branch) => branch.name),
			CANONICAL_NAMES,
		);
		assert.deepEqual(skipped, []);
	});

	it("every branch spawns a binary with argv (never a shell string)", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		for (const branch of branches) {
			assert.equal(typeof branch.file, "string", `${branch.name} has no file`);
			assert.ok(Array.isArray(branch.args), `${branch.name} has no args array`);
			assert.equal(branch.shell, undefined, `${branch.name} must not use a shell`);
		}
	});

	it("unit tests run at normal priority, the rest low", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const byName = Object.fromEntries(branches.map((branch) => [branch.name, branch]));
		assert.equal(byName["Unit Tests (api)"].lowPriority, undefined);
		assert.equal(byName["Unit Tests (frontend)"].lowPriority, undefined);
		assert.equal(byName["Unit Tests (runner)"].lowPriority, undefined);
		for (const name of CANONICAL_NAMES.slice(3)) {
			assert.equal(byName[name].lowPriority, true, `${name} should be low priority`);
		}
	});

	it("runs the runner contract suites through node --test with every runner test file named", () => {
		// The Runner owns the model-reporting contract (daemon progress +
		// posture, client wire shape): if its suites ever stop running in
		// the gate, a reporting regression goes green. A bare directory
		// (`node --test runner/`) mis-resolves on current Node and a glob
		// would need a shell, so the branch names each file — and this test
		// fails when a file on disk is not named there.
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const runnerTests = branches.find((branch) => branch.name === "Unit Tests (runner)");
		assert.equal(runnerTests.file, "node");
		assert.ok(runnerTests.args.includes("--test"));
		assert.equal(runnerTests.shell, undefined, "must not use a shell");
		/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
		const onDisk = fs.readdirSync(path.join(path.resolve(import.meta.dirname, ".."), "runner"))
			.filter((name) => name.endsWith(".test.js"))
			.sort();
		/* eslint-enable security/detect-non-literal-fs-filename */
		assert.ok(onDisk.length > 0, "expected runner test files on disk");
		for (const name of onDisk) {
			assert.ok(
				runnerTests.args.includes(`runner/${name}`),
				`runner/${name} is on disk but not in the gate branch — name it in scripts/run-tests.mjs`,
			);
		}
	});

	it("reports SKIP (non-fatal) for Security Script Tests without bash", () => {
		const { branches, skipped } = buildBranches({ hasBash: false, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		assert.deepEqual(
			branches.map((branch) => branch.name),
			CANONICAL_NAMES.filter((name) => name !== "Security Script Tests"),
		);
		assert.equal(skipped.length, 1);
		assert.equal(skipped[0].name, "Security Script Tests");
		assert.match(skipped[0].reason, /bash/i);
	});

	it("reports SKIP (non-fatal) for Container Tests without a docker daemon", () => {
		const { branches, skipped } = buildBranches({ hasBash: true, hasDocker: false, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		assert.deepEqual(
			branches.map((branch) => branch.name),
			CANONICAL_NAMES.filter((name) => name !== "Container Tests"),
		);
		assert.equal(skipped.length, 1);
		assert.equal(skipped[0].name, "Container Tests");
		assert.match(skipped[0].reason, /docker/i);
	});

	it("reports SKIP (non-fatal) for Dependency Check without the depcheck binary", () => {
		const { branches, skipped } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: false, nodeExec: "node", npmExec: "npm" });
		assert.deepEqual(
			branches.map((branch) => branch.name),
			CANONICAL_NAMES.filter((name) => name !== "Dependency Check"),
		);
		assert.equal(skipped.length, 1);
		assert.equal(skipped[0].name, "Dependency Check");
		assert.match(skipped[0].reason, /depcheck/i);
	});

	it("keeps Dependency Check runnable (low priority, via npm) when the binary exists", () => {
		const { branches, skipped } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const depcheck = branches.find((branch) => branch.name === "Dependency Check");
		assert.equal(depcheck.file, "npm");
		assert.deepEqual(depcheck.args, ["run", "depcheck"]);
		assert.equal(depcheck.lowPriority, true);
		assert.equal(depcheck.shell, undefined, "must not use a shell");
		assert.deepEqual(skipped, []);
	});

	it("runs the proof-hygiene gate against the real tree (not just its fixture tests)", () => {
		// The Harness Self-Tests pin the checker's logic on fixtures; this
		// branch is the actual enforcement — it scans the worktree, so a
		// corrupt proof or a stray root scratch file fails the gate.
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const proofHygiene = branches.find((branch) => branch.name === "Proof Hygiene");
		assert.equal(proofHygiene.file, "node");
		assert.deepEqual(proofHygiene.args, ["scripts/check-proof-and-hygiene.mjs"]);
		assert.equal(proofHygiene.lowPriority, true);
		assert.equal(proofHygiene.shell, undefined, "must not use a shell");
	});

	it("runs the binary-guard gate against the real tree (fail-fast prevention, task ef569a1a)", () => {
		// Prevention complement to Proof Hygiene: magic-checks every changed
		// binary (images + zip/gz/tgz anywhere, not just proof paths) in the
		// gate, so a text-path PNG rewrite fails in seconds inside `npm test`
		// instead of only after a full CI cycle.
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const binaryGuard = branches.find((branch) => branch.name === "Binary Guard");
		assert.equal(binaryGuard.file, "node");
		assert.deepEqual(binaryGuard.args, ["scripts/check-binary-guard.mjs"]);
		assert.equal(binaryGuard.lowPriority, true);
		assert.equal(binaryGuard.shell, undefined, "must not use a shell");
		// Ordered right after Proof Hygiene so the two binary gates sit together.
		const names = branches.map((branch) => branch.name);
		assert.equal(names.indexOf("Binary Guard"), names.indexOf("Proof Hygiene") + 1);
	});

	it("container tests run the docker suite through node --test", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const containerTests = branches.find((branch) => branch.name === "Container Tests");
		assert.equal(containerTests.file, "node");
		assert.ok(containerTests.args.includes("--test"));
		assert.ok(containerTests.args.some((arg) => arg.endsWith("docker.test.mjs")));
		assert.equal(containerTests.lowPriority, true);
	});

	it("harness self-tests run the fast-gate verdict, excerpt, and acceptance suites", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const selfTests = branches.find((branch) => branch.name === "Harness Self-Tests");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("fast-gate-verdict.test.mjs")), "verdict-helper tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("fast-gate-excerpts.test.mjs")), "excerpt-survival tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("fast-gate-acceptance.test.mjs")), "fail-fast acceptance tests must stay in the gate");
	});

	it("harness self-tests run the ported node suites (not the old shell one)", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const selfTests = branches.find((branch) => branch.name === "Harness Self-Tests");
		assert.equal(selfTests.file, "node");
		assert.ok(selfTests.args.includes("--test"));
		assert.ok(selfTests.args.some((arg) => arg.endsWith("run-parallel.test.mjs")));
		assert.ok(selfTests.args.some((arg) => arg.endsWith("deploy-reexec.test.mjs")), "deploy re-exec contract must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("check-one-function-per-file.test.mjs")), "WP-8 shape gate tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("check-jsdoc-example.test.mjs")), "WP-8 @example gate tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("check-proof-and-hygiene.test.mjs")), "proof/hygiene gate tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("check-binary-guard.test.mjs")), "binary-guard unit tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("capture-screenshot.test.mjs")), "capture self-verification tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("pre-commit-hook.test.mjs")), "pre-commit hook end-to-end tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("install-git-hooks.test.mjs")), "hook installer tests must stay in the gate");
		assert.ok(selfTests.args.some((arg) => arg.endsWith("check-imports-declared.test.mjs")), "imports-declared guardrail tests must stay in the gate");
		assert.ok(!selfTests.args.some((arg) => arg.endsWith(".sh")), "no shell suites");
	});

	it("includes Canary Tests by default (npm test parity with deploy.sh --prod)", () => {
		// No withCanary opt: the default gate must run the canary suite so
		// regressions surface in the earliest automated stage, not at the
		// merge/deploy gate (the #KB-0417 incident).
		const { branches, skipped } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		assert.ok(branches.some((branch) => branch.name === "Canary Tests"));
		assert.deepEqual(skipped, []);
	});

	it("omits Canary Tests when opted out (withCanary: false — --no-canary / KAINBAIN_SKIP_CANARY=1)", () => {
		const { branches, skipped } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, withCanary: false, nodeExec: "node", npmExec: "npm" });
		assert.deepEqual(
			branches.map((branch) => branch.name),
			CANONICAL_NAMES.filter((name) => name !== "Canary Tests"),
		);
		assert.deepEqual(skipped, []);
	});

	it("spawns Canary Tests last as npm run test:canary", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		assert.deepEqual(
			branches.map((branch) => branch.name),
			[...CANONICAL_NAMES.filter((name) => name !== "Canary Tests"), "Canary Tests"],
		);
		const canary = branches.at(-1);
		assert.equal(canary.file, "npm");
		assert.deepEqual(canary.args, ["run", "test:canary"]);
		assert.equal(canary.lowPriority, true);
		assert.equal(canary.shell, undefined, "must not use a shell");
		// The canary branch is minutes long and quiet mid-run: it carries its
		// own honest hung-branch ceiling (25 min, exit 124 on breach) instead
		// of leaving a wedged suite bounded only by silence thresholds.
		assert.equal(canary.timeoutMs, 25 * 60 * 1000);
	});
});

describe("RUNNER_TEST_SUITES / --print-runner-suites", () => {
	it("the gate branch runs exactly buildRunnerSuiteArgs() (one call path, no second literal)", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const runnerTests = branches.find((branch) => branch.name === "Unit Tests (runner)");
		assert.deepEqual(runnerTests.args, buildRunnerSuiteArgs());
		assert.deepEqual(buildRunnerSuiteArgs(), ["--test", ...RUNNER_TEST_SUITES]);
	});

	it("every suite named in RUNNER_TEST_SUITES exists on disk (a typo fails here, not in node --test)", () => {
		// The on-disk pin above proves every file on disk is NAMED; this is
		// the reverse direction — every name resolves — so a typo'd
		// registration fails in Harness Self-Tests with the bad name, instead
		// of surfacing later as a node --test "file not found" in two gates.
		for (const suite of RUNNER_TEST_SUITES) {
			/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
			const exists = fs.existsSync(path.join(path.resolve(import.meta.dirname, ".."), suite));
			/* eslint-enable security/detect-non-literal-fs-filename */
			assert.ok(
				exists,
				`${suite} is named in RUNNER_TEST_SUITES but missing on disk — fix the registration in scripts/run-tests.mjs`,
			);
		}
	});

	it("checkRunnerSuiteList accepts the real list and rejects malformed lists with a reason", () => {
		// The print-mode guard, probed directly: publish.sh can only run
		// what this checker passes, so every rejection shape is pinned here.
		assert.deepEqual(checkRunnerSuiteList({ suitePaths: [...RUNNER_TEST_SUITES] }), { wellFormed: true, problem: null });
		assert.deepEqual(checkRunnerSuiteList(), { wellFormed: true, problem: null }, "defaults to the single source");
		const badLists = [
			[], // empty: publish.sh must never run a vacuous node --test
			["runner/"], // bare directory mis-resolves on current Node
			["runner"], // bare directory without the slash
			["runner/*.test.js"], // glob needs a shell; the gate never spawns one
			["runner/harness*.test.js"], // partial glob, same hazard
			["runner/sub/harness.test.js"], // nested path escapes the flat contract
			["../runner/harness.test.js"], // parent escape
			["/repo/runner/harness.test.js"], // absolute path
			["runner/harness.test.mjs"], // wrong extension
			["runner/my suite.test.js"], // spaces break shell expansions of the print output
			["runner/harness.test.js", ""], // empty entry
			["runner/harness.test.js", 42], // non-string entry
			"runner/harness.test.js", // not a list at all
		];
		for (const suitePaths of badLists) {
			const check = checkRunnerSuiteList({ suitePaths });
			assert.equal(check.wellFormed, false, `${JSON.stringify(suitePaths)} must be rejected`);
			assert.equal(typeof check.problem, "string", "rejection names the problem");
			assert.ok(check.problem.length > 0, "rejection names the problem");
		}
	});

	it("checkRunnerSuiteList stays silent on a repeated suite (wasteful, never under-tested)", () => {
		const check = checkRunnerSuiteList({ suitePaths: ["runner/harness.test.js", "runner/harness.test.js"] });
		assert.deepEqual(check, { wellFormed: true, problem: null });
	});

	it("print mode lists exactly the branch suites, one per line, exit 0", () => {
		// The publish.sh derivation contract: stdout is the suite list and
		// nothing else, so the shell can read it line by line.
		const printed = spawnSync(process.execPath, ["scripts/run-tests.mjs", "--print-runner-suites"], {
			cwd: path.resolve(import.meta.dirname, ".."),
			encoding: "utf8",
		});
		assert.equal(printed.status, 0, printed.stderr);
		assert.equal(printed.stderr, "", "print mode must be silent on stderr");
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const runnerTests = branches.find((branch) => branch.name === "Unit Tests (runner)");
		const expected = runnerTests.args.filter((arg) => arg.startsWith("runner/"));
		assert.deepEqual(printed.stdout.trim().split("\n"), expected);
		assert.ok(printed.stdout.endsWith("\n"), "trailing newline required");
		for (const line of printed.stdout.trim().split("\n")) {
			assert.match(line, /^runner\/[A-Za-z0-9._-]+\.test\.js$/, `extraneous stdout line: ${line}`);
		}
	});

	it("print mode never emits a bare directory or a glob (explicit file list only)", () => {
		const printed = spawnSync(process.execPath, ["scripts/run-tests.mjs", "--print-runner-suites"], {
			cwd: path.resolve(import.meta.dirname, ".."),
			encoding: "utf8",
		});
		assert.equal(printed.status, 0, printed.stderr);
		for (const line of printed.stdout.trim().split("\n")) {
			assert.notEqual(line, "runner/", "never a bare directory");
			assert.notEqual(line, "runner", "never a bare directory");
			assert.doesNotMatch(line, /[*?[]/, "never a glob");
		}
	});

	it("print mode short-circuits the gate (no preamble, no side effects)", () => {
		const printed = spawnSync(process.execPath, ["scripts/run-tests.mjs", "--print-runner-suites", "--no-canary"], {
			cwd: path.resolve(import.meta.dirname, ".."),
			encoding: "utf8",
		});
		assert.equal(printed.status, 0, printed.stderr);
		assert.doesNotMatch(printed.stdout, /Starting full project verification/, "must not run the gate");
		assert.deepEqual(printed.stdout.trim().split("\n"), [...RUNNER_TEST_SUITES]);
	});
});

describe("splitGatePhases", () => {
	it("runs Canary Tests in the serial phase after the fast overlap window", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const { fast, canary } = splitGatePhases(branches);
		// Same suites, only re-phased: nothing added, nothing dropped.
		assert.deepEqual(
			[...fast.map((branch) => branch.name), ...canary.map((branch) => branch.name)].sort(),
			branches.map((branch) => branch.name).sort(),
		);
		assert.deepEqual(canary.map((branch) => branch.name), ["Canary Tests"]);
		assert.deepEqual(
			fast.map((branch) => branch.name),
			CANONICAL_NAMES.filter((name) => name !== "Canary Tests"),
		);
	});

	it("leaves an opted-out gate as one fast phase with no canary phase", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, withCanary: false, nodeExec: "node", npmExec: "npm" });
		const { fast, canary } = splitGatePhases(branches);
		assert.deepEqual(canary, []);
		assert.deepEqual(
			fast.map((branch) => branch.name),
			CANONICAL_NAMES.filter((name) => name !== "Canary Tests"),
		);
	});
});

describe("resolveCanary", () => {
	it("runs canary by default (parity with deploy.sh --prod)", () => {
		assert.equal(resolveCanary({ argv: ["node", "scripts/run-tests.mjs"], env: {} }), true);
		assert.equal(resolveCanary({ argv: [], env: {} }), true);
	});

	it("accepts the legacy --canary opt-in as a no-op", () => {
		assert.equal(resolveCanary({ argv: ["node", "scripts/run-tests.mjs", "--canary"], env: {} }), true);
		assert.equal(resolveCanary({ argv: ["node", "scripts/run-tests.mjs"], env: { KAINBAIN_CANARY: "1" } }), true);
	});

	it("opts out via --no-canary", () => {
		assert.equal(resolveCanary({ argv: ["node", "scripts/run-tests.mjs", "--no-canary"], env: {} }), false);
	});

	it("opts out via KAINBAIN_SKIP_CANARY=1 (the deploy emergency opt-out)", () => {
		assert.equal(resolveCanary({ argv: ["node", "scripts/run-tests.mjs"], env: { KAINBAIN_SKIP_CANARY: "1" } }), false);
	});

	it("treats other KAINBAIN_SKIP_CANARY values as unset", () => {
		// Parity contract: deploy.sh skips its canary gate on exactly "1"
		// too, so a stray value cannot silently hide canary from either
		// `npm test` or `deploy.sh --prod` (deploy logs a warning and runs
		// the gate instead).
		assert.equal(resolveCanary({ argv: [], env: { KAINBAIN_SKIP_CANARY: "" } }), true);
		assert.equal(resolveCanary({ argv: [], env: { KAINBAIN_SKIP_CANARY: "0" } }), true);
	});

	it("skip flags win over the legacy opt-in flags", () => {
		assert.equal(
			resolveCanary({ argv: ["node", "scripts/run-tests.mjs", "--canary", "--no-canary"], env: {} }),
			false,
		);
		assert.equal(
			resolveCanary({ argv: ["node", "scripts/run-tests.mjs", "--canary"], env: { KAINBAIN_SKIP_CANARY: "1" } }),
			false,
		);
	});
});

describe("FAST_GATE_BRANCH_NAMES", () => {
	it("names the six fast-gate branches from the problem statement", () => {
		assert.deepEqual(FAST_GATE_BRANCH_NAMES, [
			"Unit Tests (api)",
			"Unit Tests (frontend)",
			"Unit Tests (runner)",
			"Linting (api)",
			"Linting (frontend)",
			"Harness Self-Tests",
		]);
	});

	it("every fast-gate name is a real canonical branch in the fast phase", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const { fast } = splitGatePhases(branches);
		const fastNames = new Set(fast.map((branch) => branch.name));
		for (const name of FAST_GATE_BRANCH_NAMES) {
			assert.ok(fastNames.has(name), `${name} must be a fast-phase branch`);
		}
	});
});

describe("resolveFailFast", () => {
	it("skips canary on fast failure by default", () => {
		assert.equal(resolveFailFast({ argv: ["node", "scripts/run-tests.mjs"], env: {} }), true);
		assert.equal(resolveFailFast({ argv: [], env: {} }), true);
	});

	it("accepts the explicit --fail-fast flag as a no-op", () => {
		assert.equal(resolveFailFast({ argv: ["node", "scripts/run-tests.mjs", "--fail-fast"], env: {} }), true);
	});

	it("opts out via --no-fail-fast", () => {
		assert.equal(resolveFailFast({ argv: ["node", "scripts/run-tests.mjs", "--no-fail-fast"], env: {} }), false);
	});

	it("opts out via KAINBAIN_NO_FAIL_FAST=1", () => {
		assert.equal(resolveFailFast({ argv: ["node", "scripts/run-tests.mjs"], env: { KAINBAIN_NO_FAIL_FAST: "1" } }), false);
	});

	it("treats other KAINBAIN_NO_FAIL_FAST values as unset", () => {
		assert.equal(resolveFailFast({ argv: [], env: { KAINBAIN_NO_FAIL_FAST: "" } }), true);
		assert.equal(resolveFailFast({ argv: [], env: { KAINBAIN_NO_FAIL_FAST: "0" } }), true);
	});

	it("the opt-out wins over the explicit opt-in", () => {
		assert.equal(
			resolveFailFast({ argv: ["node", "scripts/run-tests.mjs", "--fail-fast", "--no-fail-fast"], env: {} }),
			false,
		);
	});
});

describe("reportPreflightFailure", () => {
	function makeCollector() {
		const lines = [];
		return { lines, log: (text) => lines.push(text), joined: () => lines.join("\n") };
	}

	it("writes the verdict with the preflight entry plus its untrimmed report", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-preflight-"));
		try {
			const verdictDir = path.join(root, "run");
			fs.mkdirSync(verdictDir, { recursive: true });
			const out = makeCollector();
			const reportText = "duplicate setting X\nsecond line\n";
			const result = reportPreflightFailure({
				name: "Settings duplicate check",
				reportText,
				verdictDir,
				verdictReady: true,
				withCanary: true,
				log: out.log,
			});
			assert.equal(result.ok, false);
			assert.equal(result.verdictPath, path.join(verdictDir, "verdict.json"));
			const verdict = JSON.parse(fs.readFileSync(result.verdictPath, "utf8"));
			assert.equal(verdict.ok, false);
			assert.equal(verdict.canary, "skipped_due_to_fast_gate_failure");
			assert.deepEqual(verdict.preflight, { name: "Settings duplicate check", detail: "duplicate setting X" });
			assert.equal(result.logPaths.length, 1);
			assert.equal(fs.readFileSync(result.logPaths[0].path, "utf8"), reportText);
			assert.match(out.joined(), /KAINBAIN_FAST_GATE_RESULT ok=false/);
			assert.match(out.joined(), /Settings duplicate check/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("degrades to an unavailable banner when the verdict cannot be written", () => {
		const out = makeCollector();
		const result = reportPreflightFailure({
			name: "Frontend imports check",
			reportText: "undeclared import!",
			verdictDir: null,
			verdictReady: false,
			withCanary: false,
			log: out.log,
		});
		assert.equal(result.ok, false);
		assert.equal(result.verdictPath, null);
		assert.match(out.joined(), /verdict="unavailable"/);
		assert.match(out.joined(), /Frontend imports check/);
	});
});

describe("runGatePhases", () => {
	function makeCollector() {
		const lines = [];
		return { lines, log: (text) => lines.push(text), joined: () => lines.join("\n") };
	}

	function stubRunner({ fast = null, canary = null } = {}) {
		const calls = [];
		const runParallelFn = async (branches, opts) => {
			// First call is the fast phase, second (if any) the canary phase.
			const phase = calls.length === 0 ? "fast" : "canary";
			calls.push({ phase, branches: branches.map((branch) => branch.name), opts });
			const scripted = phase === "fast" ? fast : canary;
			if (scripted) return scripted;
			return {
				ok: true,
				results: branches.map((branch) => ({ name: branch.name, ok: true, exitCode: 0, output: "", wallSecs: 1 })),
			};
		};
		return { calls, runParallelFn };
	}

	function failedRun(name, output = `boom in ${name}\n`) {
		return {
			ok: false,
			results: [{ name, ok: false, exitCode: 1, output, wallSecs: 5 }],
		};
	}

	function makeVerdictDir() {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-gate-phases-"));
		const verdictDir = path.join(root, "run");
		fs.mkdirSync(verdictDir, { recursive: true });
		return { root, verdictDir };
	}

	it("fast failure skips the canary spawn, names the suites, and lands the verdict early", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({ fast: failedRun("Unit Tests (frontend)") });
			const result = await runGatePhases({
				fastBranches: [{ name: "Unit Tests (frontend)" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			// The canary spawn is never attempted: one overlap call, fast only.
			assert.equal(calls.length, 1);
			assert.deepEqual(calls[0].branches, ["Unit Tests (frontend)"]);
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "skipped_due_to_fast_gate_failure");
			assert.match(
				out.joined(),
				/Running Canary Tests\.\.\. SKIP \(fast-gate failed: Unit Tests \(frontend\); verdict at .*verdict\.json\)/,
			);
			// Banner printed twice (early + closing) with the marker line.
			assert.equal(out.joined().split("KAINBAIN_FAST_GATE_RESULT").length - 1, 2);
			// Verdict on disk: failed branch only, byte-complete.
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.ok, false);
			assert.equal(verdict.canary, "skipped_due_to_fast_gate_failure");
			assert.deepEqual(verdict.failedBranches.map((entry) => entry.name), ["Unit Tests (frontend)"]);
			assert.deepEqual(fs.readdirSync(verdictDir).sort(), [
				"unit-tests-frontend.full.log",
				"verdict.json",
			]);
			assert.equal(
				fs.readFileSync(path.join(verdictDir, "unit-tests-frontend.full.log"), "utf8"),
				"boom in Unit Tests (frontend)\n",
			);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("a non-fast-gate fast failure also skips canary (uniform predicate)", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({ fast: failedRun("Frontend Build") });
			const result = await runGatePhases({
				fastBranches: [{ name: "Frontend Build" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 1);
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "skipped_due_to_fast_gate_failure");
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.deepEqual(verdict.failedBranches, [
				{ name: "Frontend Build", exitCode: 1, wallSecs: 5, fastGate: false },
			]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("a green fast phase always runs canary (the #KB-0417 parity requirement)", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({});
			const result = await runGatePhases({
				fastBranches: [{ name: "Unit Tests (api)" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 2);
			assert.deepEqual(calls[1].branches, ["Canary Tests"]);
			assert.equal(result.ok, true);
			assert.equal(result.canaryDecision, "ran");
			assert.ok(out.joined().includes(CANARY_SERIAL_START_LINE));
			assert.doesNotMatch(out.joined(), /SKIP \(fast-gate failed/);
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.ok, true);
			assert.equal(verdict.canary, "ran");
			// No full logs for passing suites — verdict.json alone.
			assert.deepEqual(fs.readdirSync(verdictDir), ["verdict.json"]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("with --no-fail-fast the verdict still lands early but canary runs on", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({ fast: failedRun("Linting (api)") });
			const result = await runGatePhases({
				fastBranches: [{ name: "Linting (api)" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: false,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 2);
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "ran");
			// The early banner precedes the serial-phase start: operators see
			// the failure while canary still runs.
			const joined = out.joined();
			assert.ok(joined.indexOf("KAINBAIN_FAST_GATE_RESULT") < joined.indexOf(CANARY_SERIAL_START_LINE));
			assert.doesNotMatch(joined, /SKIP \(fast-gate failed/);
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.canary, "ran");
			assert.deepEqual(verdict.failedBranches.map((entry) => entry.name), ["Linting (api)"]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("an opted-out gate runs one phase and records opted_out", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({});
			const result = await runGatePhases({
				fastBranches: [{ name: "Unit Tests (api)" }],
				canaryBranches: [],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 1);
			assert.equal(result.ok, true);
			assert.equal(result.canaryDecision, "opted_out");
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.canary, "opted_out");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("a canary-only failure surfaces canary detail and exits 1", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({
				canary: failedRun("Canary Tests", "playwright boom\n"),
			});
			const result = await runGatePhases({
				fastBranches: [{ name: "Unit Tests (api)" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 2);
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "ran");
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.deepEqual(verdict.failedBranches.map((entry) => entry.name), ["Canary Tests"]);
			assert.equal(
				fs.readFileSync(path.join(verdictDir, "canary-tests.full.log"), "utf8"),
				"playwright boom\n",
			);
			assert.match(out.joined(), /KAINBAIN_FAST_GATE_RESULT ok=false/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("hands runParallel a preamble pointing at the branch's full log", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({ fast: failedRun("Linting (frontend)") });
			await runGatePhases({
				fastBranches: [{ name: "Linting (frontend)" }],
				canaryBranches: [],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			const preamble = calls[0].opts.failureDetailsPreamble;
			assert.equal(typeof preamble, "function");
			assert.equal(
				preamble({ name: "Linting (frontend)" }),
				`Full log: Linting (frontend) → ${path.join(verdictDir, "linting-frontend.full.log")}`,
			);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("an unwritable verdict dir skips files but still skips canary on failure", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-gate-phases-"));
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({ fast: failedRun("Unit Tests (api)") });
			const result = await runGatePhases({
				fastBranches: [{ name: "Unit Tests (api)" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: true,
				verdictDir: null,
				verdictReady: false,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 1);
			assert.equal(result.ok, false);
			assert.equal(result.verdictPath, null);
			assert.match(out.joined(), /verdict at unavailable/);
			assert.match(out.joined(), /verdict="unavailable"/);
			assert.equal(calls[0].opts.failureDetailsPreamble, undefined);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("a failure without named branch results still fails and skips canary as unknown branch", async () => {
		const { root, verdictDir } = makeVerdictDir();
		try {
			const out = makeCollector();
			const { calls, runParallelFn } = stubRunner({ fast: { ok: false } });
			const result = await runGatePhases({
				fastBranches: [{ name: "Unit Tests (api)" }],
				canaryBranches: [{ name: "Canary Tests" }],
				failFast: true,
				verdictDir,
				verdictReady: true,
				cwd: root,
				runParallelFn,
				log: out.log,
			});
			assert.equal(calls.length, 1);
			assert.equal(result.ok, false);
			assert.equal(result.canaryDecision, "skipped_due_to_fast_gate_failure");
			assert.match(out.joined(), /SKIP \(fast-gate failed: unknown branch;/);
			const verdict = JSON.parse(fs.readFileSync(path.join(verdictDir, "verdict.json"), "utf8"));
			assert.equal(verdict.ok, false);
			assert.deepEqual(verdict.failedBranches.map((entry) => entry.name), ["unknown branch"]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("resolvePhaseOutcome", () => {
	it("passes a clean run with its results untouched", () => {
		const run = {
			ok: true,
			results: [{ name: "Unit Tests (api)", ok: true, exitCode: 0, output: "", wallSecs: 3 }],
		};
		assert.deepEqual(resolvePhaseOutcome({ run }), {
			ok: true,
			verdictResults: run.results,
			failedNames: [],
		});
	});

	it("fails a named branch failure and names it", () => {
		const run = {
			ok: false,
			results: [{ name: "Linting (api)", ok: false, exitCode: 1, output: "boom\n", wallSecs: 5 }],
		};
		const outcome = resolvePhaseOutcome({ run });
		assert.equal(outcome.ok, false);
		assert.deepEqual(outcome.failedNames, ["Linting (api)"]);
		assert.equal(outcome.verdictResults, run.results);
	});

	it("fails a nameless failure as unknown branch instead of claiming ok", () => {
		for (const run of [{ ok: false }, { ok: false, results: [] }, null, undefined]) {
			const outcome = resolvePhaseOutcome({ run });
			assert.equal(outcome.ok, false);
			assert.deepEqual(outcome.failedNames, ["unknown branch"]);
			assert.equal(outcome.verdictResults.length, 1);
			assert.equal(outcome.verdictResults[0].name, "unknown branch");
		}
	});

	it("fails when the runner claims success but a branch result disagrees", () => {
		const outcome = resolvePhaseOutcome({
			run: {
				ok: true,
				results: [{ name: "Unit Tests (api)", ok: false, exitCode: 1, output: "boom\n", wallSecs: 3 }],
			},
		});
		assert.equal(outcome.ok, false);
		assert.deepEqual(outcome.failedNames, ["Unit Tests (api)"]);
	});
});

describe("depcheckAvailable", () => {
	function makeRootWithBin(binName) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-depcheck-"));
		if (binName) {
			fs.mkdirSync(path.join(root, "node_modules", ".bin"), { recursive: true });
			fs.writeFileSync(path.join(root, "node_modules", ".bin", binName), "");
		}
		return root;
	}

	it("reports true when the root tree carries the posix binary", () => {
		const root = makeRootWithBin("depcheck");
		try {
			assert.equal(depcheckAvailable({ root, targetPlatform: "linux" }), true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports true when the root tree carries the Windows binary", () => {
		const root = makeRootWithBin("depcheck.cmd");
		try {
			assert.equal(depcheckAvailable({ root, targetPlatform: "win32" }), true);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports false when the platform's binary name is missing", () => {
		const root = makeRootWithBin("depcheck");
		try {
			assert.equal(depcheckAvailable({ root, targetPlatform: "win32" }), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports false when the root tree has no binaries at all", () => {
		const root = makeRootWithBin(null);
		try {
			assert.equal(depcheckAvailable({ root, targetPlatform: "linux" }), false);
			assert.equal(depcheckAvailable({ root: path.join(root, "does-not-exist"), targetPlatform: "linux" }), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("workspaceDepsInstalled", () => {
	function makeWorkspaceRoot({ manifests = { api: { fastify: "^5.0.0" }, frontend: { react: "^19.0.0" }, "canary-e2e": { "@playwright/test": "^1.62.1" } }, installed = {} } = {}) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-workspace-deps-"));
		for (const [pkg, devDependencies] of Object.entries(manifests)) {
			fs.mkdirSync(path.join(root, pkg), { recursive: true });
			fs.writeFileSync(
				path.join(root, pkg, "package.json"),
				JSON.stringify({ name: pkg, devDependencies }),
			);
			for (const dep of installed[pkg] || []) {
				fs.mkdirSync(path.join(root, pkg, "node_modules", dep), { recursive: true });
				fs.writeFileSync(
					path.join(root, pkg, "node_modules", dep, "package.json"),
					JSON.stringify({ name: dep }),
				);
			}
		}
		return root;
	}

	it("reports installed when every workspace dependency resolves", () => {
		const root = makeWorkspaceRoot({ installed: { api: ["fastify"], frontend: ["react"], "canary-e2e": ["@playwright/test"] } });
		try {
			assert.deepEqual(workspaceDepsInstalled({ root }), { installed: true, missing: {} });
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("names the missing modules per package when node_modules is absent (fresh runner clone)", () => {
		const root = makeWorkspaceRoot({ installed: { api: ["fastify"] } });
		try {
			const result = workspaceDepsInstalled({ root });
			assert.equal(result.installed, false);
			assert.deepEqual(result.missing, {
				frontend: ["react"],
				"canary-e2e": ["@playwright/test"],
			});
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports not installed when a package manifest is unreadable", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-workspace-deps-"));
		try {
			const result = workspaceDepsInstalled({ root });
			assert.equal(result.installed, false);
			assert.deepEqual(Object.keys(result.missing).sort(), ["api", "canary-e2e", "frontend"]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("ensureWorkspaceDeps", () => {
	function makeWorkspaceRoot({ manifests = { api: { fastify: "^5.0.0" }, frontend: { react: "^19.0.0" }, "canary-e2e": { "@playwright/test": "^1.62.1" } }, installed = {} } = {}) {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-workspace-deps-"));
		for (const [pkg, devDependencies] of Object.entries(manifests)) {
			fs.mkdirSync(path.join(root, pkg), { recursive: true });
			fs.writeFileSync(
				path.join(root, pkg, "package.json"),
				JSON.stringify({ name: pkg, devDependencies }),
			);
			for (const dep of installed[pkg] || []) {
				fs.mkdirSync(path.join(root, pkg, "node_modules", dep), { recursive: true });
				fs.writeFileSync(
					path.join(root, pkg, "node_modules", dep, "package.json"),
					JSON.stringify({ name: dep }),
				);
			}
		}
		return root;
	}

	function landInstalledPackages(root, pkgs, manifestDeps) {
		for (const pkg of pkgs) {
			for (const dep of Object.keys(manifestDeps[pkg])) {
				fs.mkdirSync(path.join(root, pkg, "node_modules", dep), { recursive: true });
				fs.writeFileSync(
					path.join(root, pkg, "node_modules", dep, "package.json"),
					JSON.stringify({ name: dep }),
				);
			}
		}
	}

	it("provisions api and frontend but never touches canary when canary is opted out", () => {
		const root = makeWorkspaceRoot({ installed: {} });
		const calls = [];
		const manifestDeps = { api: { fastify: "^5.0.0" }, frontend: { react: "^19.0.0" } };
		try {
			const result = ensureWorkspaceDeps({
				root,
				withCanary: false,
				npmExec: "npm",
				spawnFn: (file, args, opts) => {
					calls.push({ file, args, opts });
					landInstalledPackages(root, [args[args.length - 1]], manifestDeps);
					return { status: 0 };
				},
			});
			assert.deepEqual(result, { ok: true, installed: ["api", "frontend"] });
			assert.deepEqual(calls.map((call) => call.args), [
				["install", "--prefix", "api"],
				["install", "--prefix", "frontend"],
			]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("does not spawn when every workspace dependency is already present", () => {
		const root = makeWorkspaceRoot({ installed: { api: ["fastify"], frontend: ["react"], "canary-e2e": ["@playwright/test"] } });
		try {
			const result = ensureWorkspaceDeps({
				root,
				withCanary: true,
				spawnFn: () => { throw new Error("must not reinstall present dependencies"); },
			});
			assert.deepEqual(result, { ok: true, installed: [] });
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("installs each missing package through npm and re-verifies", () => {
		const root = makeWorkspaceRoot({ installed: { api: ["fastify"] } });
		const calls = [];
		const manifestDeps = { api: { fastify: "^5.0.0" }, frontend: { react: "^19.0.0" }, "canary-e2e": { "@playwright/test": "^1.62.1" } };
		try {
			const result = ensureWorkspaceDeps({
				root,
				withCanary: true,
				npmExec: "npm",
				spawnFn: (file, args, opts) => {
					calls.push({ file, args, opts });
					// Simulate a successful install landing that package's modules.
					landInstalledPackages(root, [args[args.length - 1]], manifestDeps);
					return { status: 0 };
				},
			});
			assert.deepEqual(result, { ok: true, installed: ["frontend", "canary-e2e"] });
			assert.deepEqual(calls.map((call) => call.args), [
				["install", "--prefix", "frontend"],
				["install", "--prefix", "canary-e2e"],
			]);
			assert.ok(calls.every((call) => call.file === "npm" && call.opts.cwd === root));
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails loudly when an install exits non-zero (never a silent skip)", () => {
		const root = makeWorkspaceRoot({ installed: { api: ["fastify"] } });
		try {
			const result = ensureWorkspaceDeps({
				root,
				withCanary: true,
				npmExec: "npm",
				spawnFn: () => ({ status: 1 }),
			});
			assert.equal(result.ok, false);
			assert.match(result.error, /frontend/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("pruneStaleTestDirectories", () => {
	it("removes old directories matching test prefixes and preserves young or unrelated entries", () => {
		const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-prune-suite-"));
		try {
			const staleTestDirectory = path.join(temporaryDirectory, "kainbain-test-projects-old");
			const youngTestDirectory = path.join(temporaryDirectory, "kainbain-test-projects-new");
			const staleKbDirectory = path.join(temporaryDirectory, "kb-review-route-old");
			const staleDeployDirectory = path.join(temporaryDirectory, "kainbain-deploy-attempt-old");
			const staleCacheDirectory = path.join(temporaryDirectory, "kainbain-compile-cache-old");
			const liveCanaryRootsDirectory = path.join(temporaryDirectory, "kb-canary-e2e");
			const staleUnrelatedDirectory = path.join(temporaryDirectory, "unrelated-cache-old");
			const staleMatchingFile = path.join(temporaryDirectory, "kainbain-test-file.txt");

			fs.mkdirSync(staleTestDirectory);
			fs.mkdirSync(youngTestDirectory);
			fs.mkdirSync(staleKbDirectory);
			fs.mkdirSync(staleDeployDirectory);
			fs.mkdirSync(staleCacheDirectory);
			fs.mkdirSync(liveCanaryRootsDirectory);
			fs.mkdirSync(staleUnrelatedDirectory);
			fs.writeFileSync(staleMatchingFile, "sample content");

			const currentTimestampInSeconds = Math.floor(Date.now() / 1000);
			const oneHourAgoInSeconds = currentTimestampInSeconds - 3600;

			// Backdate stale entries to one hour ago
			fs.utimesSync(staleTestDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleKbDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleDeployDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleCacheDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(liveCanaryRootsDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleUnrelatedDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleMatchingFile, oneHourAgoInSeconds, oneHourAgoInSeconds);

			const prunedCount = pruneStaleTestDirectories({
				temporaryDirectoryPath: temporaryDirectory,
				maximumAgeInMilliseconds: 30 * 60 * 1000,
			});

			assert.equal(prunedCount, 3);
			assert.equal(fs.existsSync(staleTestDirectory), false);
			assert.equal(fs.existsSync(staleKbDirectory), false);
			assert.equal(fs.existsSync(staleDeployDirectory), false);
			assert.equal(fs.existsSync(staleCacheDirectory), true);
			assert.equal(fs.existsSync(liveCanaryRootsDirectory), true);
			assert.equal(fs.existsSync(youngTestDirectory), true);
			assert.equal(fs.existsSync(staleUnrelatedDirectory), true);
			assert.equal(fs.existsSync(staleMatchingFile), true);
		} finally {
			fs.rmSync(temporaryDirectory, { recursive: true, force: true });
		}
	});

	it("returns zero and does not throw when directory does not exist", () => {
		const nonExistentPath = path.join(os.tmpdir(), "kainbain-non-existent-" + Date.now());
		assert.equal(pruneStaleTestDirectories({ temporaryDirectoryPath: nonExistentPath }), 0);
	});
});
