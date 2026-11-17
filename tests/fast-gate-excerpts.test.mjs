import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { failureDetailsExcerpt } = await import("../scripts/lib/run-parallel.mjs");
const {
	buildFastGateVerdict,
	formatFastGateBanner,
	writeFastGateVerdict,
} = await import("../scripts/lib/fast-gate-verdict.mjs");
// The real engine excerpt pipeline (resolver + budgets only — no routing
// barrel, so this harness suite stays light).
const { excerptLog } = await import("../api/flow/routing/resolvers/excerptLog.js");
const { failureLogExcerptLimit } = await import("../api/flow/routing/tables/failureLogExcerptLimit.js");
const { retryPromptLogBudget } = await import("../api/flow/routing/tables/retryPromptLogBudget.js");

/***
 * MARK: fast-gate excerpts tests
 * @description The executable form of the acceptance criterion's second half
 *   ("failure excerpts are not truncated away"): a case-study-shaped gate
 *   stdout — a 24011-line noisy frontend dump like task cccd8b9d's, trimmed
 *   by the real `failureDetailsExcerpt`, wrapped in the real verdict banner
 *   — must still carry the failed suite names, the verdict-file paths, and
 *   an assertion line after the real `excerptLog` cuts it to the 3072-char
 *   timeline budget and the 4000-char retry-prompt budget. The companion
 *   assertion proves the untrimmed middle survives byte-complete in the
 *   verdict's full-log file: files carry bulk, budgets carry pointers.
 * @example run `node --test tests/fast-gate-excerpts.test.mjs`
 ***/

const VERDICT_DIR = "/repo/docs/tasks/cccd8b9d-9021-4d0f-b51c-26d489073567/ci-fast-gate-20261115-232533";
const VERDICT_PATH = `${VERDICT_DIR}/verdict.json`;
const FULL_LOG_PATH = `${VERDICT_DIR}/unit-tests-frontend.full.log`;

// A 24011-line failing frontend dump shaped like the case study: thousands
// of React `act` noise lines, then the vitest failure summary at the end
// (the tail the gate keeps).
function caseStudyOutput() {
	const noise = Array.from(
		{ length: 23900 },
		(_, index) =>
			`This ensures that you're testing the behavior the user would see in the browser (noise-${index}). Learn more at https://reactjs.org/link/wrap-tests-with-act`,
	);
	const summary = [
		" ❯ src/components/tasks/TaskDetailOverlay.test.jsx (42 tests | 1 failed)",
		"   ❯ uncomplete-task feature > completion button flips to uncomplete once done",
		"     → expected 'Complete' to equal 'Uncomplete' (button disabled state)",
		"AssertionError: expected 'Complete' to equal 'Uncomplete'",
		" Test Files  1 failed | 41 passed (42)",
		"      Tests  1 failed | 1203 passed (1204)",
	];
	const filler = Array.from(
		{ length: 24011 - noise.length - summary.length },
		(_, index) => `stdout | unknown test file · filler-${index}`,
	);
	return [...noise, ...filler, ...summary].join("\n");
}

function failedVerdict() {
	return buildFastGateVerdict({
		fastResults: [
			{ name: "Unit Tests (api)", ok: true, exitCode: 0, output: "ok\n", wallSecs: 217 },
			{ name: "Unit Tests (frontend)", ok: false, exitCode: 1, output: caseStudyOutput(), wallSecs: 217 },
		],
		fastGateNames: ["Unit Tests (api)", "Unit Tests (frontend)"],
		canaryDecision: "skipped_due_to_fast_gate_failure",
	});
}

function banner() {
	return formatFastGateBanner({
		verdict: failedVerdict(),
		verdictPath: VERDICT_PATH,
		logPaths: [{ name: "Unit Tests (frontend)", path: FULL_LOG_PATH }],
	});
}

// The gate's full stdout for this red run: npm wrapper noise, the head
// pointer line, the trimmed Details section, the canary SKIP line, and the
// repeated closing banner at the tail.
function gateStdout() {
	const output = caseStudyOutput();
	return [
		"up to date, audited 118 packages in 1s",
		"",
		"> kainbain@1.0.0 test",
		"> node scripts/run-tests.mjs",
		"",
		"Starting full project verification...",
		`Fast-gate verdict dir: ${VERDICT_DIR} (verdict.json + untrimmed failed-branch logs land here)`,
		"✅ Settings duplicate check passed (36 files in 103ms)",
		"✅ Frontend imports check passed (734 files in 278ms)",
		"▸ started Unit Tests (api)",
		"▸ started Unit Tests (frontend)",
		"⏳ still running: Unit Tests (api) (30s), Unit Tests (frontend) (30s)",
		"Running Unit Tests (api)... PASS (217s)",
		"Running Unit Tests (frontend)... FAIL (217s)",
		"----------------------------------------------------------------------",
		"Details for Unit Tests (frontend):",
		`Full log: Unit Tests (frontend) → ${FULL_LOG_PATH}`,
		failureDetailsExcerpt(output, 120).trimEnd(),
		"----------------------------------------------------------------------",
		banner().trimEnd(),
		`Running Canary Tests... SKIP (fast-gate failed: Unit Tests (frontend); verdict at ${VERDICT_PATH})`,
		banner().trimEnd(),
	].join("\n");
}

describe("fast-gate excerpt survival (case-study fixture)", () => {
	it("the fixture really is case-study-shaped (24011 lines, trimmed inline)", () => {
		const output = caseStudyOutput();
		assert.equal(output.split("\n").length, 24011);
		const excerpt = failureDetailsExcerpt(output, 120);
		assert.match(excerpt, /\(trimmed 23891 of 24011 lines; showing the tail\)/);
		assert.match(excerpt, /AssertionError/);
		assert.doesNotMatch(excerpt, /noise-0/);
	});

	it("budgets stay pinned (no budget raises ship with this change)", () => {
		assert.equal(failureLogExcerptLimit, 3072);
		assert.equal(retryPromptLogBudget, 4000);
	});

	for (const [label, budget] of [
		["timeline excerpt (3072 chars)", failureLogExcerptLimit],
		["retry-prompt excerpt (4000 chars)", retryPromptLogBudget],
	]) {
		it(`keeps suite names and verdict paths in the ${label}`, () => {
			const stdout = gateStdout();
			// The gate already trimmed the 24011-line dump to 120 lines, so
			// stdout is tens of KB — still several budgets long, so the
			// engine excerpt genuinely engages.
			assert.ok(stdout.length > budget, "fixture must exceed the budget");
			const excerpted = excerptLog(stdout, budget);
			assert.ok(excerpted.length <= budget, `excerpt is ${excerpted.length} chars, budget ${budget}`);
			assert.match(excerpted, /Unit Tests \(frontend\)/);
			assert.match(excerpted, /KAINBAIN_FAST_GATE_RESULT/);
			assert.ok(excerpted.includes(VERDICT_PATH), "verdict.json path survives");
			assert.ok(excerpted.includes(FULL_LOG_PATH), "full-log path survives");
		});
	}

	it("keeps an assertion line in the retry-prompt excerpt (4000 chars)", () => {
		// Layering: the 3072-char timeline row carries pointers; the
		// assertion itself travels in the retry prompt (here), the full
		// stage report, and the verdict's full-log file.
		const excerpted = excerptLog(gateStdout(), retryPromptLogBudget);
		assert.match(excerpted, /AssertionError: expected 'Complete' to equal 'Uncomplete'/);
		assert.match(excerpted, /Test Files  1 failed/);
	});

	it("keeps the untrimmed middle byte-complete in the verdict full-log file", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-excerpts-"));
		try {
			const output = caseStudyOutput();
			const written = writeFastGateVerdict({
				dir: path.join(root, "run"),
				verdict: failedVerdict(),
				fullOutputs: [{ name: "Unit Tests (frontend)", output }],
			});
			assert.equal(written.ok, true);
			const stored = fs.readFileSync(written.logPaths[0].path, "utf8");
			assert.equal(stored, output);
			// The trimmed-away middle (invisible inline) is all present.
			assert.match(stored, /noise-0/);
			assert.match(stored, /noise-23899/);
			assert.match(stored, /AssertionError/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
