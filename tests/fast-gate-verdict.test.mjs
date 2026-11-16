import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const {
	FAST_GATE_MARKER,
	FAST_GATE_VERDICT_DIR_PREFIX,
	branchSlug,
	buildFastGateVerdict,
	ensureVerdictDir,
	formatFastGateBanner,
	formatVerdictTimestamp,
	resolveVerdictDir,
	writeBranchFullLog,
	writeFastGateVerdict,
} = await import("../scripts/lib/fast-gate-verdict.mjs");

/***
 * MARK: fast-gate-verdict tests
 * @description Hermetic tests for the fast-gate verdict helpers
 *   (scripts/lib/fast-gate-verdict.mjs): the pure verdict builder, the
 *   fail-open verdict-file writer, the verdict-dir resolver, and the banner
 *   printer. These are the seams the fail-fast gate (scripts/run-tests.mjs)
 *   and the engine's marker scan (api/flow/fastGateMarker.js) share: the
 *   marker spelling is pinned here and cross-checked against the engine copy
 *   so the two can never drift apart silently.
 * @example run `node --test tests/fast-gate-verdict.test.mjs`
 ***/

const FAST_GATE_NAMES = [
	"Unit Tests (api)",
	"Unit Tests (frontend)",
	"Unit Tests (runner)",
	"Linting (api)",
	"Linting (frontend)",
	"Harness Self-Tests",
];

function passResult(name, wallSecs = 3) {
	return { name, ok: true, exitCode: 0, output: "ok\n", wallSecs };
}

function failResult(name, wallSecs = 5) {
	return { name, ok: false, exitCode: 1, output: `boom in ${name}\n`, wallSecs };
}

describe("FAST_GATE_MARKER", () => {
	it("is a greppable single token the engine scans for", () => {
		assert.equal(FAST_GATE_MARKER, "KAINBAIN_FAST_GATE_RESULT");
		assert.match(FAST_GATE_MARKER, /^[A-Z0-9_]+$/);
	});

	it("matches the engine's copy exactly (gate and engine share the marker)", async () => {
		const engine = await import("../api/flow/fastGateMarker.js");
		assert.equal(engine.FAST_GATE_MARKER, FAST_GATE_MARKER);
	});
});

describe("branchSlug", () => {
	it("slugifies branch names into safe log-file stems", () => {
		assert.equal(branchSlug("Unit Tests (frontend)"), "unit-tests-frontend");
		assert.equal(branchSlug("Linting (api)"), "linting-api");
		assert.equal(branchSlug("Harness Self-Tests"), "harness-self-tests");
		assert.equal(branchSlug("Canary Tests"), "canary-tests");
	});

	it("collapses runs of separators and never returns an empty stem", () => {
		assert.equal(branchSlug("  Weird   Name!! "), "weird-name");
		assert.equal(branchSlug(""), "branch");
		assert.equal(branchSlug("!!!"), "branch");
		assert.equal(branchSlug(null), "branch");
	});
});

describe("formatVerdictTimestamp", () => {
	it("renders a UTC stamp beside its run", () => {
		assert.equal(formatVerdictTimestamp(new Date("2026-11-16T12:00:00.000Z")), "20261116-120000");
	});

	it("falls back to the current time for an unreadable clock reading", () => {
		for (const unreadable of ["not-a-date", NaN, new Date(NaN)]) {
			assert.match(formatVerdictTimestamp(unreadable), /^\d{8}-\d{6}$/);
		}
		assert.doesNotMatch(formatVerdictTimestamp("not-a-date"), /NaN/);
	});
});

describe("resolveVerdictDir", () => {
	function fixedNow() {
		return new Date("2026-11-16T12:00:00.000Z");
	}

	it("lands under KAINBAIN_TASK_DOCS when it names a writable directory", () => {
		const taskDocs = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-docs-"));
		try {
			const resolved = resolveVerdictDir({
				env: { KAINBAIN_TASK_DOCS: taskDocs },
				now: fixedNow(),
			});
			assert.equal(resolved.viaTaskDocs, true);
			assert.equal(
				resolved.dir,
				path.join(taskDocs, `${FAST_GATE_VERDICT_DIR_PREFIX}20261116-120000`),
			);
			assert.ok(resolved.dir.startsWith(taskDocs));
		} finally {
			fs.rmSync(taskDocs, { recursive: true, force: true });
		}
	});

	it("falls back to a repo-local scratch dir when KAINBAIN_TASK_DOCS is absent", () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-repo-root-"));
		try {
			const resolved = resolveVerdictDir({ env: {}, now: fixedNow(), repoRoot });
			assert.equal(resolved.viaTaskDocs, false);
			assert.equal(
				resolved.dir,
				path.join(
					repoRoot,
					"docs",
					"tasks",
					"local-gate-runs",
					`${FAST_GATE_VERDICT_DIR_PREFIX}20261116-120000`,
				),
			);
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	it("falls back when KAINBAIN_TASK_DOCS names a missing path or a file", () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-repo-root-"));
		const strayFile = path.join(repoRoot, "stray.txt");
		fs.writeFileSync(strayFile, "not a dir");
		try {
			for (const taskDocs of [path.join(repoRoot, "missing"), strayFile]) {
				const resolved = resolveVerdictDir({
					env: { KAINBAIN_TASK_DOCS: taskDocs },
					now: fixedNow(),
					repoRoot,
				});
				assert.equal(resolved.viaTaskDocs, false, taskDocs);
				assert.ok(resolved.dir.startsWith(repoRoot), taskDocs);
			}
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});

	it("uses the current time when no clock is injected", () => {
		const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-repo-root-"));
		try {
			const before = new Date();
			const resolved = resolveVerdictDir({ env: {}, repoRoot });
			assert.match(
				path.basename(resolved.dir),
				/^ci-fast-gate-\d{8}-\d{6}$/,
			);
			const stamp = path.basename(resolved.dir).slice(FAST_GATE_VERDICT_DIR_PREFIX.length);
			const year = Number(stamp.slice(0, 4));
			assert.ok(year >= before.getUTCFullYear());
		} finally {
			fs.rmSync(repoRoot, { recursive: true, force: true });
		}
	});
});

describe("ensureVerdictDir", () => {
	it("creates a nested directory and reports it writable", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		try {
			const dir = path.join(root, "nested", "run");
			assert.equal(ensureVerdictDir({ dir }), true);
			assert.ok(fs.statSync(dir).isDirectory());
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("returns false (never throws) when the path cannot hold a directory", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		const blocker = path.join(root, "blocker.txt");
		fs.writeFileSync(blocker, "a file, not a dir");
		try {
			assert.equal(ensureVerdictDir({ dir: path.join(blocker, "nested") }), false);
			assert.equal(ensureVerdictDir({ dir: "" }), false);
			assert.equal(ensureVerdictDir({}), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("buildFastGateVerdict", () => {
	it("marks all-pass fast results ok with no failed branches", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [passResult("Unit Tests (api)"), passResult("Linting (api)")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "pending",
			generatedAt: "2026-11-16T12:00:00.000Z",
		});
		assert.equal(verdict.ok, true);
		assert.deepEqual(verdict.failedBranches, []);
		assert.equal(verdict.canary, "pending");
		assert.equal(verdict.preflight, null);
		assert.equal(verdict.generatedAt, "2026-11-16T12:00:00.000Z");
	});

	it("flags fast-gate membership on each failed branch", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [
				failResult("Unit Tests (frontend)"),
				failResult("Frontend Build"),
				passResult("Unit Tests (api)"),
			],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "skipped_due_to_fast_gate_failure",
		});
		assert.equal(verdict.ok, false);
		assert.deepEqual(
			verdict.failedBranches.map((entry) => [entry.name, entry.fastGate]),
			[
				["Unit Tests (frontend)", true],
				["Frontend Build", false],
			],
		);
		assert.deepEqual(verdict.failedBranches[0], {
			name: "Unit Tests (frontend)",
			exitCode: 1,
			wallSecs: 5,
			fastGate: true,
		});
	});

	it("records every failure when the whole fast phase fails", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [failResult("Unit Tests (api)"), failResult("Linting (frontend)")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "skipped_due_to_fast_gate_failure",
		});
		assert.equal(verdict.ok, false);
		assert.equal(verdict.failedBranches.length, 2);
		assert.ok(verdict.failedBranches.every((entry) => entry.fastGate));
	});

	it("carries a preflight failure with a null exit code and zero wall time", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "opted_out",
			preflightFailure: { name: "Settings duplicate check", detail: "dup!" },
		});
		assert.equal(verdict.ok, false);
		assert.deepEqual(verdict.preflight, { name: "Settings duplicate check", detail: "dup!" });
		assert.deepEqual(verdict.failedBranches, [
			{ name: "Settings duplicate check", exitCode: null, wallSecs: 0, fastGate: true },
		]);
	});

	it("folds ran-canary failures into the same failed-branches list", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [passResult("Unit Tests (api)")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "ran",
			canaryResults: [failResult("Canary Tests", 800)],
		});
		assert.equal(verdict.ok, false);
		assert.equal(verdict.canary, "ran");
		assert.deepEqual(verdict.failedBranches, [
			{ name: "Canary Tests", exitCode: 1, wallSecs: 800, fastGate: false },
		]);
	});

	it("stays ok when a ran canary passes after a green fast phase", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [passResult("Unit Tests (api)")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "ran",
			canaryResults: [passResult("Canary Tests", 800)],
		});
		assert.equal(verdict.ok, true);
		assert.deepEqual(verdict.failedBranches, []);
	});

	it("never throws on malformed inputs", () => {
		const verdict = buildFastGateVerdict({});
		assert.equal(verdict.ok, true);
		assert.deepEqual(verdict.failedBranches, []);
		assert.equal(verdict.canary, "pending");
	});
});

describe("writeBranchFullLog", () => {
	it("writes the branch output byte-complete under its slug name", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		try {
			const output = "line one\nline two — ünïcödé\n";
			const written = writeBranchFullLog({
				dir: path.join(dir, "nested"),
				branchName: "Unit Tests (frontend)",
				output,
			});
			assert.equal(written, path.join(dir, "nested", "unit-tests-frontend.full.log"));
			assert.equal(fs.readFileSync(written, "utf8"), output);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("writes an empty file (not a throw) for empty output", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		try {
			const written = writeBranchFullLog({ dir, branchName: "Linting (api)", output: "" });
			assert.equal(fs.readFileSync(written, "utf8"), "");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("returns null (never throws) when the directory is unwritable", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		const blocker = path.join(dir, "blocker.txt");
		fs.writeFileSync(blocker, "a file, not a dir");
		const written = writeBranchFullLog({
			dir: path.join(blocker, "nested"),
			branchName: "Linting (api)",
			output: "x\n",
		});
		assert.equal(written, null);
		fs.rmSync(dir, { recursive: true, force: true });
	});
});

describe("writeFastGateVerdict", () => {
	it("writes verdict.json plus one full log per failed branch only", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		try {
			const verdict = buildFastGateVerdict({
				fastResults: [failResult("Unit Tests (frontend)"), passResult("Unit Tests (api)")],
				fastGateNames: FAST_GATE_NAMES,
				canaryDecision: "skipped_due_to_fast_gate_failure",
			});
			const fullOutput = "assertion failure details\n".repeat(50);
			const written = writeFastGateVerdict({
				dir: path.join(dir, "run"),
				verdict,
				fullOutputs: [{ name: "Unit Tests (frontend)", output: fullOutput }],
			});
			assert.equal(written.ok, true);
			assert.equal(written.verdictPath, path.join(dir, "run", "verdict.json"));
			assert.deepEqual(JSON.parse(fs.readFileSync(written.verdictPath, "utf8")), verdict);
			assert.deepEqual(written.logPaths, [
				{
					name: "Unit Tests (frontend)",
					path: path.join(dir, "run", "unit-tests-frontend.full.log"),
				},
			]);
			assert.equal(fs.readFileSync(written.logPaths[0].path, "utf8"), fullOutput);
			assert.deepEqual(fs.readdirSync(path.join(dir, "run")).sort(), [
				"unit-tests-frontend.full.log",
				"verdict.json",
			]);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("degrades to ok:false without throwing when nothing is writable", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-verdict-"));
		const blocker = path.join(dir, "blocker.txt");
		fs.writeFileSync(blocker, "a file, not a dir");
		try {
			const written = writeFastGateVerdict({
				dir: path.join(blocker, "nested"),
				verdict: buildFastGateVerdict({ fastGateNames: FAST_GATE_NAMES }),
				fullOutputs: [],
			});
			assert.equal(written.ok, false);
			assert.ok(typeof written.error === "string" && written.error.length > 0);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("formatFastGateBanner", () => {
	function failedFixture() {
		const verdict = buildFastGateVerdict({
			fastResults: [failResult("Unit Tests (frontend)"), failResult("Frontend Build")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "skipped_due_to_fast_gate_failure",
		});
		return {
			verdict,
			verdictPath: "/tmp/task-docs/ci-fast-gate-20261116-120000/verdict.json",
			logPaths: [
				{
					name: "Unit Tests (frontend)",
					path: "/tmp/task-docs/ci-fast-gate-20261116-120000/unit-tests-frontend.full.log",
				},
				{
					name: "Frontend Build",
					path: "/tmp/task-docs/ci-fast-gate-20261116-120000/frontend-build.full.log",
				},
			],
		};
	}

	it("opens with the greppable marker line carrying names, decision, and verdict path", () => {
		const banner = formatFastGateBanner(failedFixture());
		const [markerLine] = banner.split("\n");
		assert.ok(markerLine.startsWith(`${FAST_GATE_MARKER} `), markerLine);
		assert.match(markerLine, /ok=false/);
		assert.match(markerLine, /Unit Tests \(frontend\)/);
		assert.match(markerLine, /canary=skipped_due_to_fast_gate_failure/);
		assert.match(markerLine, /verdict="\/tmp\/task-docs\/ci-fast-gate-20261116-120000\/verdict\.json"/);
	});

	it("names every failed suite and its full-log path in the human lines", () => {
		const banner = formatFastGateBanner(failedFixture());
		assert.match(banner, /Unit Tests \(frontend\)/);
		assert.match(banner, /Frontend Build/);
		assert.match(banner, /unit-tests-frontend\.full\.log/);
		assert.match(banner, /frontend-build\.full\.log/);
		assert.match(banner, /verdict\.json/);
	});

	it("renders a passing verdict with ok=true and no failure lines", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [passResult("Unit Tests (api)")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "ran",
			canaryResults: [passResult("Canary Tests", 10)],
		});
		const banner = formatFastGateBanner({
			verdict,
			verdictPath: "/tmp/v/verdict.json",
			logPaths: [],
		});
		const [markerLine] = banner.split("\n");
		assert.match(markerLine, /ok=true/);
		assert.match(markerLine, /canary=ran/);
		assert.match(banner, /PASSED/);
		assert.doesNotMatch(banner, /Full log:/);
	});

	it("stays greppable when the verdict files are unavailable", () => {
		const verdict = buildFastGateVerdict({
			fastResults: [failResult("Linting (api)")],
			fastGateNames: FAST_GATE_NAMES,
			canaryDecision: "skipped_due_to_fast_gate_failure",
		});
		const banner = formatFastGateBanner({ verdict, verdictAvailable: false });
		const [markerLine] = banner.split("\n");
		assert.ok(markerLine.startsWith(`${FAST_GATE_MARKER} `), markerLine);
		assert.match(markerLine, /verdict="unavailable"/);
		assert.match(banner, /Linting \(api\)/);
		assert.match(banner, /unavailable/);
	});
});
