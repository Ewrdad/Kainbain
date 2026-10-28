import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { buildBranches } = await import("../scripts/run-tests.mjs");

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

/***
 * MARK: deploy gates parity tests
 * @description Pins the "same tests in deploy and npm test" contract from
 *   both sides (the #KB-0417 incident: canary E2E only ran at deploy, so a
 *   regression surfaced at the merge/deploy gate instead of the earliest
 *   automated stage). `npm test` runs the full gate including Canary Tests;
 *   `deploy.sh --prod` runs the same fast branches as its `final-test-suite`
 *   gate (`./run-tests.sh --no-canary`, so nothing runs twice) plus the
 *   canary suite exactly once as its own blocking `canary-e2e` gate. The
 *   static tests pin both gate lines in deploy.sh; the executable tests prove
 *   the union of the two deploy gates equals the default `npm test` branch
 *   list — by executed command (`file` + `args`), not just branch name, so a
 *   renamed-but-diverged suite cannot slip through. The root `test:canary`
 *   script is pinned to delegate to the canary-e2e package, so deploy's
 *   `npm run test:canary` and the gate's Canary Tests branch execute the same
 *   suite. The emergency opt-out (`KAINBAIN_SKIP_CANARY=1`, exactly "1") is
 *   pinned too — it must match resolveCanary() so a stray value can never
 *   silently disable canary in one entry point but not the other.
 * @example run `node --test tests/deploy-gates.test.mjs`
 ***/

function readDeploySh() {
	/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
	return fs.readFileSync(path.join(REPO_ROOT, "deploy.sh"), "utf8");
	/* eslint-enable security/detect-non-literal-fs-filename */
}

describe("deploy.sh test gates (static contract)", () => {
	it("runs the fast branches as the final-test-suite gate without canary", () => {
		const body = readDeploySh();
		assert.match(
			body,
			/run_gate "final-test-suite" ".\/run-tests\.sh --no-canary" .\/run-tests\.sh --no-canary/,
			"deploy.sh must gate on ./run-tests.sh --no-canary (fast branches; canary runs once below, never twice)",
		);
	});

	it("runs the canary suite as two blocking sharded gates (1/2 then 2/2)", () => {
		const body = readDeploySh();
		const shard1 = body.match(/run_gate "canary-e2e-shard-1" "npm run test:canary -- --shard=1\/2" npm run test:canary -- --shard=1\/2/g) || [];
		const shard2 = body.match(/run_gate "canary-e2e-shard-2" "npm run test:canary -- --shard=2\/2" npm run test:canary -- --shard=2\/2/g) || [];
		assert.equal(shard1.length, 1, `expected exactly one canary-e2e-shard-1 gate, found ${shard1.length}`);
		assert.equal(shard2.length, 1, `expected exactly one canary-e2e-shard-2 gate, found ${shard2.length}`);
		assert.ok(
			body.indexOf('run_gate "canary-e2e-shard-1"') < body.indexOf('run_gate "canary-e2e-shard-2"'),
			"shard 1/2 must run before shard 2/2",
		);
		// No unsharded legacy gate may survive alongside: it would run the
		// whole suite a third time on a stale stack.
		assert.equal((body.match(/run_gate "canary-e2e" /g) || []).length, 0, "legacy unsharded canary-e2e gate must be gone");
	});

	it("orders the canary-e2e gates after the final-test-suite gate", () => {
		const body = readDeploySh();
		const fastGate = body.indexOf('run_gate "final-test-suite"');
		const shard1 = body.indexOf('run_gate "canary-e2e-shard-1"');
		const shard2 = body.indexOf('run_gate "canary-e2e-shard-2"');
		assert.ok(fastGate !== -1 && shard1 !== -1 && shard2 !== -1, "all gates must exist");
		assert.ok(fastGate < shard1 && shard1 < shard2, "order must be final-test-suite, shard 1/2, shard 2/2");
	});

	it("skips the canary gate only on exactly KAINBAIN_SKIP_CANARY=1 (fail-safe)", () => {
		const body = readDeploySh();
		assert.match(
			body,
			/if \[ "\$\{KAINBAIN_SKIP_CANARY:-\}" = "1" \]/,
			"canary opt-out must require exactly '1', matching resolveCanary() in scripts/run-tests.mjs",
		);
		assert.match(
			body,
			/not exactly '1'.*running the canary E2E gate/,
			"a stray KAINBAIN_SKIP_CANARY value must warn and still run the gate, never silently skip it",
		);
	});
});

describe("deploy / npm test parity (executable contract)", () => {
	it("final-test-suite branches + canary-e2e gate equal the default npm test branches", () => {
		// deploy.sh --prod runs buildBranches({ withCanary: false }) as its
		// final-test-suite gate and the Canary Tests branch as canary-e2e;
		// npm test runs buildBranches({ withCanary: true }). The union must
		// be identical — same suites, same order, canary last, nothing twice.
		const full = buildBranches({ hasBash: true, hasDocker: true, withCanary: true, nodeExec: "node", npmExec: "npm" });
		const fast = buildBranches({ hasBash: true, hasDocker: true, withCanary: false, nodeExec: "node", npmExec: "npm" });
		const deployUnion = [...fast.branches.map((branch) => branch.name), "Canary Tests"];
		assert.deepEqual(deployUnion, full.branches.map((branch) => branch.name));
		assert.deepEqual(fast.skipped, full.skipped);
	});

	it("fast branches execute the identical command with and without canary", () => {
		// Names matching is not enough: the same branch name must spawn the
		// same binary with the same argv in both entry points, otherwise
		// "same tests" is a label coincidence, not a contract.
		const full = buildBranches({ hasBash: true, hasDocker: true, withCanary: true, nodeExec: "node", npmExec: "npm" });
		const fast = buildBranches({ hasBash: true, hasDocker: true, withCanary: false, nodeExec: "node", npmExec: "npm" });
		const fullByName = Object.fromEntries(full.branches.map((branch) => [branch.name, branch]));
		for (const branch of fast.branches) {
			const counterpart = fullByName[branch.name];
			assert.ok(counterpart, `${branch.name} missing from the default gate`);
			assert.deepEqual(
				{ file: branch.file, args: branch.args },
				{ file: counterpart.file, args: counterpart.args },
				`${branch.name} must spawn the same command in deploy and npm test`,
			);
		}
	});

	it("the canary-e2e gate command matches the gate's Canary Tests branch", () => {
		// Both entry points must invoke the suite the same way: deploy.sh runs
		// `npm run test:canary`, and the gate branch must spawn exactly that.
		const { branches } = buildBranches({ hasBash: true, hasDocker: true, withCanary: true, nodeExec: "node", npmExec: "npm" });
		const canary = branches.find((branch) => branch.name === "Canary Tests");
		assert.deepEqual(canary.file, "npm");
		assert.deepEqual(canary.args, ["run", "test:canary"]);
		const body = readDeploySh();
		// Sharded 1/2 + 2/2 over fresh stacks: both shards must delegate to
		// the same suite (identical 135 assertions, split for memory), so pin
		// both gate lines — a missing shard would silently halve coverage.
		assert.match(body, /run_gate "canary-e2e-shard-1" "npm run test:canary -- --shard=1\/2" npm run test:canary -- --shard=1\/2/);
		assert.match(body, /run_gate "canary-e2e-shard-2" "npm run test:canary -- --shard=2\/2" npm run test:canary -- --shard=2\/2/);
	});

	it("root test:canary delegates to the canary-e2e package suite", () => {
		// If the root script ever stops delegating to canary-e2e, both entry
		// points would run something other than the Playwright suite while
		// every gate line above still matches — pin the delegation itself.
		/* eslint-disable security/detect-non-literal-fs-filename -- fixed repo-relative path under test */
		const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
		/* eslint-enable security/detect-non-literal-fs-filename */
		assert.match(pkg.scripts["test:canary"], /canary-e2e/, "root test:canary must run the canary-e2e suite");
	});
});
