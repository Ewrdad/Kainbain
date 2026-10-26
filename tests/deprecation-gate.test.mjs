import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { compileAllowlistPattern, findDeprecationWarnings, loadBuildAllowlist } = await import(
	"../frontend/scripts/check-no-deprecations.js"
);
const { evaluateAudit } = await import("../scripts/check-dep-audit.mjs");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/***
 * MARK: deprecation gate tests
 * @description Hermetic tests for the two deprecation gates: the frontend
 *   build-output scanner (fails the build on new deprecation warnings) and
 *   the dependency-audit gate (fails on new high/critical npm audit
 *   findings). Pure scanner logic is tested directly; the build gate binary
 *   itself is exercised end to end with tiny fixture commands instead of a
 *   full vite build so this suite stays fast.
 * @example run `node --test tests/deprecation-gate.test.mjs`
 ***/

describe("findDeprecationWarnings", () => {
	it("flags the three build-log warning shapes from the task screenshot", () => {
		const lines = [
			"`esbuild` option was specified by \"vite:react-babel\" plugin. This option is deprecated, please use `ox` instead.",
			"`optimizeDeps.rollupOptions` / `ssr.optimizeDeps.rollupOptions` is deprecated. Use `optimizeDeps.rolldownOptions` instead.",
			"[vite:react-babel] We recommend switching to `@vitejs/plugin-react-oxc` for improved performance.",
		];
		assert.deepEqual(findDeprecationWarnings(lines, []), lines);
	});

	it("passes clean build output (including the chunk-size hint)", () => {
		const lines = [
			"vite v8.2.2 building client environment for production...",
			"transforming...",
			"✓ 204 modules transformed.",
			"(!) Some chunks are larger than 500 kB after minification. Consider:",
			"Use build.rolldownOptions.output.codeSplitting to improve chunking",
			"✓ built in 2.02s",
		];
		assert.deepEqual(findDeprecationWarnings(lines, []), []);
	});

	it("an allowlist entry suppresses its matching line only", () => {
		const allowlist = [{ pattern: "optimizeDeps\\.rollupOptions", reason: "test", expires: "2099-01-01" }];
		const lines = [
			"`optimizeDeps.rollupOptions` is deprecated. Use `optimizeDeps.rolldownOptions` instead.",
			"[vite:react-babel] We recommend switching to `@vitejs/plugin-react-oxc`.",
		];
		assert.deepEqual(findDeprecationWarnings(lines, allowlist), [lines[1]]);
	});

	it("an expired allowlist entry does not suppress", () => {
		const allowlist = [{ pattern: "deprecated", reason: "test", expires: "2000-01-01" }];
		const lines = ["This option is deprecated, please use `ox` instead."];
		assert.deepEqual(findDeprecationWarnings(lines, allowlist), lines);
	});

	it("an entry without an expiry date does not suppress", () => {
		const allowlist = [{ pattern: "deprecated", reason: "test" }];
		const lines = ["This option is deprecated, please use `ox` instead."];
		assert.deepEqual(findDeprecationWarnings(lines, allowlist), lines);
	});

	it("an entry with an invalid regex pattern fails closed instead of crashing", () => {
		const allowlist = [{ pattern: "([", reason: "typo", expires: "2099-01-01" }];
		const lines = ["This option is deprecated, please use `ox` instead."];
		assert.deepEqual(findDeprecationWarnings(lines, allowlist), lines);
	});

	it("an invalid pattern does not break its valid siblings", () => {
		const allowlist = [
			{ pattern: "optimizeDeps\\.rollupOptions", reason: "test", expires: "2099-01-01" },
			{ pattern: "([", reason: "typo", expires: "2099-01-01" },
		];
		const lines = [
			"`optimizeDeps.rollupOptions` is deprecated. Use `optimizeDeps.rolldownOptions` instead.",
			"[vite:react-babel] We recommend switching to `@vitejs/plugin-react-oxc`.",
		];
		assert.deepEqual(findDeprecationWarnings(lines, allowlist), [lines[1]]);
	});
});

describe("compileAllowlistPattern", () => {
	it("compiles a valid pattern", () => {
		assert.ok(compileAllowlistPattern("deprecated") instanceof RegExp);
	});

	it("returns null for a pattern that does not compile", () => {
		assert.equal(compileAllowlistPattern("([ oops"), null);
	});
});

describe("loadBuildAllowlist", () => {
	it("loads the shipped allowlist file without crashing", () => {
		const allowlist = loadBuildAllowlist();
		assert.ok(Array.isArray(allowlist));
	});
});

describe("check-no-deprecations binary", () => {
	const script = path.join(repoRoot, "frontend", "scripts", "check-no-deprecations.js");

	function runGate(fixtureCode) {
		return spawnSync(process.execPath, [script, "--", process.execPath, "-e", fixtureCode], {
			cwd: path.join(repoRoot, "frontend"),
			encoding: "utf8",
		});
	}

	it("exits 0 and passes output through when the build is clean", () => {
		const result = runGate("console.log('✓ 204 modules transformed.')");
		assert.equal(result.status, 0);
		assert.match(result.stdout, /204 modules transformed/);
	});

	it("exits non-zero when the build prints a deprecation warning", () => {
		const result = runGate("console.log('`optimizeDeps.rollupOptions` is deprecated. Use rolldownOptions instead.')");
		assert.notEqual(result.status, 0);
		assert.match(result.stdout + result.stderr, /deprecat/i);
	});

	it("exits non-zero when the build command itself fails", () => {
		const result = runGate("process.exit(3)");
		assert.equal(result.status, 3);
	});
});

describe("evaluateAudit", () => {
	const auditFixture = {
		vulnerabilities: {
			"brace-expansion": {
				severity: "high",
				range: "4.0.0 - 5.0.11",
				via: [{ source: 1240103, name: "brace-expansion", title: "quadratic-time expansion" }],
			},
			"fastify": {
				severity: "moderate",
				range: "<5.12.5",
				via: [{ source: 1240639, name: "fastify", title: "H2 trailer DoS" }],
			},
			"left-pad": {
				severity: "low",
				range: "*",
				via: [{ source: 1, name: "left-pad", title: "trivial" }],
			},
		},
	};

	it("reports non-allowlisted high findings as blocking", () => {
		const result = evaluateAudit("api", auditFixture, { advisories: [] });
		assert.equal(result.blocking.length, 1);
		assert.equal(result.blocking[0].module, "brace-expansion");
		assert.equal(result.blocking[0].severity, "high");
	});

	it("ignores moderate and low findings", () => {
		const result = evaluateAudit(
			"api",
			auditFixture,
			{ advisories: [{ source: 1240103, module: "brace-expansion", reason: "test", expires: "2099-01-01" }] },
		);
		assert.deepEqual(result.blocking, []);
	});

	it("an allowlist entry with a valid expiry suppresses its advisory", () => {
		const result = evaluateAudit(
			"api",
			auditFixture,
			{ advisories: [{ source: 1240103, module: "brace-expansion", reason: "test", expires: "2099-01-01" }] },
		);
		assert.deepEqual(result.blocking, []);
		assert.equal(result.suppressed.length, 1);
	});

	it("an expired allowlist entry does not suppress", () => {
		const result = evaluateAudit(
			"api",
			auditFixture,
			{ advisories: [{ source: 1240103, module: "brace-expansion", reason: "test", expires: "2000-01-01" }] },
		);
		assert.equal(result.blocking.length, 1);
	});

	it("an entry for a different advisory source does not suppress", () => {
		const result = evaluateAudit(
			"api",
			auditFixture,
			{ advisories: [{ source: 9999999, module: "brace-expansion", reason: "test", expires: "2099-01-01" }] },
		);
		assert.equal(result.blocking.length, 1);
	});

	it("tolerates audit output with no vulnerabilities key", () => {
		assert.deepEqual(evaluateAudit("api", {}, { advisories: [] }).blocking, []);
	});

	it("suppresses transitive dependents when the root advisory is allowlisted", () => {
		const chained = {
			"braces": { severity: "high", range: "*", via: [{ source: 1240992, name: "braces", title: "stack exhaustion" }] },
			"chokidar": { severity: "high", range: "2.0.0 - 3.6.0", via: ["braces"] },
			"tailwindcss": { severity: "high", range: "3.4.19", via: ["chokidar"] },
		};
		const allowlist = { advisories: [{ source: 1240992, module: "braces", reason: "test", expires: "2099-01-01" }] };
		const result = evaluateAudit("frontend", { vulnerabilities: chained }, allowlist);
		assert.deepEqual(result.blocking, []);
		assert.equal(result.suppressed.length, 3);
	});

	it("a transitive chain with no reachable advisory stays blocking", () => {
		const chained = {
			"mystery": { severity: "high", range: "*", via: ["nothing-listed"] },
		};
		const result = evaluateAudit("frontend", { vulnerabilities: chained }, { advisories: [] });
		assert.equal(result.blocking.length, 1);
	});
});
