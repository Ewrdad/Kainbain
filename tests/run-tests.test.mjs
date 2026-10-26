import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { buildBranches, depcheckAvailable, pruneStaleTestDirectories, resolveCanary, splitGatePhases } = await import("../scripts/run-tests.mjs");

/***
 * MARK: run-tests tests
 * @description Hermetic tests for the gate's branch assembly and canary
 *   resolution (scripts/run-tests.mjs): the eleven canonical branches in
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
	"Linting (api)",
	"Linting (frontend)",
	"Frontend Build",
	"Security Script Tests",
	"Dependency Check",
	"Dependency Audit Gate",
	"Harness Self-Tests",
	"Container Tests",
	"Canary Tests",
];

describe("buildBranches", () => {
	it("builds the eleven canonical branches in order when bash and docker exist", () => {
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
		for (const name of CANONICAL_NAMES.slice(2)) {
			assert.equal(byName[name].lowPriority, true, `${name} should be low priority`);
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

	it("container tests run the docker suite through node --test", () => {
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, hasDepcheck: true, nodeExec: "node", npmExec: "npm" });
		const containerTests = branches.find((branch) => branch.name === "Container Tests");
		assert.equal(containerTests.file, "node");
		assert.ok(containerTests.args.includes("--test"));
		assert.ok(containerTests.args.some((arg) => arg.endsWith("docker.test.mjs")));
		assert.equal(containerTests.lowPriority, true);
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
		// own honest hung-branch ceiling (15 min, exit 124 on breach) instead
		// of leaving a wedged suite bounded only by silence thresholds.
		assert.equal(canary.timeoutMs, 15 * 60 * 1000);
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

describe("pruneStaleTestDirectories", () => {
	it("removes old directories matching test prefixes and preserves young or unrelated entries", () => {
		const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-prune-suite-"));
		try {
			const staleTestDirectory = path.join(temporaryDirectory, "kainbain-test-projects-old");
			const youngTestDirectory = path.join(temporaryDirectory, "kainbain-test-projects-new");
			const staleKbDirectory = path.join(temporaryDirectory, "kb-review-route-old");
			const staleUnrelatedDirectory = path.join(temporaryDirectory, "unrelated-cache-old");
			const staleMatchingFile = path.join(temporaryDirectory, "kainbain-test-file.txt");

			fs.mkdirSync(staleTestDirectory);
			fs.mkdirSync(youngTestDirectory);
			fs.mkdirSync(staleKbDirectory);
			fs.mkdirSync(staleUnrelatedDirectory);
			fs.writeFileSync(staleMatchingFile, "sample content");

			const currentTimestampInSeconds = Math.floor(Date.now() / 1000);
			const oneHourAgoInSeconds = currentTimestampInSeconds - 3600;

			// Backdate stale entries to one hour ago
			fs.utimesSync(staleTestDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleKbDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleUnrelatedDirectory, oneHourAgoInSeconds, oneHourAgoInSeconds);
			fs.utimesSync(staleMatchingFile, oneHourAgoInSeconds, oneHourAgoInSeconds);

			const prunedCount = pruneStaleTestDirectories({
				temporaryDirectoryPath: temporaryDirectory,
				maximumAgeInMilliseconds: 30 * 60 * 1000,
			});

			assert.equal(prunedCount, 2);
			assert.equal(fs.existsSync(staleTestDirectory), false);
			assert.equal(fs.existsSync(staleKbDirectory), false);
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
