/***
 * MARK: canary-quarantine.mjs
 * @description The canary infra-flake quarantine lane's library (task
 *   44125086): pure helpers that turn a Playwright JSON report into
 *   per-test failure classifications (against the single signature list in
 *   `canary-e2e/tests/infra-flakes.mjs`), decide whether a failed run is
 *   signature-only (rerun the failed tests once, forgive visibly) or genuine
 *   (stay red), and render the machine-readable summary
 *   (`canary-quarantine.json`) plus the greppable
 *   `KAINBAIN_CANARY_QUARANTINE …` gate log line that names the lane and
 *   signatures (acceptance criterion 3). The producer is
 *   `scripts/canary-with-quarantine.mjs`; the gate re-emits the log line from
 *   the written summary. Nothing here ever skips a test silently: a
 *   quarantined test still RAN and only a signature-only failure is forgiven.
 * @example import { collectFailedTests, planQuarantine, buildQuarantineSummary } from "./lib/canary-quarantine.mjs";
 ***/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchInfraFlake } from "../../canary-e2e/tests/infra-flakes.mjs";
import { resolveVerdictDir } from "./fast-gate-verdict.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(HERE, "..", "..");

/***
 * MARK: QUARANTINE_LOG_MARKER
 * @description Opens the quarantine log line
 *   (`KAINBAIN_CANARY_QUARANTINE forgiven=… lane=… signatures=… tests=…
 *   summary=…`) so operators and the engine can grep which lane/signature
 *   was retried or quarantined. Deliberately a SEPARATE marker from the
 *   pinned `KAINBAIN_FAST_GATE_RESULT` spelling, which never changes.
 * @example QUARANTINE_LOG_MARKER => "KAINBAIN_CANARY_QUARANTINE"
 ***/
export const QUARANTINE_LOG_MARKER = "KAINBAIN_CANARY_QUARANTINE";

/***
 * MARK: QUARANTINE_SUMMARY_FILENAME
 * @description Name of the JSON summary written next to `verdict.json` in the
 *   gate's verdict directory (`ci-fast-gate-<timestamp>/`).
 * @example QUARANTINE_SUMMARY_FILENAME => "canary-quarantine.json"
 ***/
export const QUARANTINE_SUMMARY_FILENAME = "canary-quarantine.json";

/***
 * MARK: QUARANTINE_DIR_ENV
 * @description Env var the gate sets on the Canary Tests branch so the wrapper
 *   writes `canary-quarantine.json` into the SAME verdict directory as
 *   `verdict.json`. Manual runs fall back to `resolveVerdictDir`.
 * @example QUARANTINE_DIR_ENV => "KAINBAIN_CANARY_QUARANTINE_DIR"
 ***/
export const QUARANTINE_DIR_ENV = "KAINBAIN_CANARY_QUARANTINE_DIR";

/***
 * MARK: LANE_RUNNER_RERUN
 * @description The lane name recorded when the wrapper reran only the failed
 *   tests after a signature-only first run.
 * @example LANE_RUNNER_RERUN => "runner-rerun"
 ***/
export const LANE_RUNNER_RERUN = "runner-rerun";

/***
 * MARK: BASELINE_PATH
 * @description Committed recorded baseline of known signatures
 *   (`canary-e2e/infra-flake-baseline.json`): firstSeen + evidence per
 *   signature id, snapshotted into every summary so runs are diffable and a
 *   signature can be retired with proof the flake is gone.
 * @example BASELINE_PATH.endsWith("canary-e2e/infra-flake-baseline.json") => true
 ***/
export const BASELINE_PATH = path.join(
	DEFAULT_REPO_ROOT,
	"canary-e2e",
	"infra-flake-baseline.json",
);

/***
 * MARK: quoteLogValue
 * @description Quotes one log-line value (wrap in double quotes, escape
 *   backslashes and quotes) so signatures/tests/summary stay greppable as
 *   single tokens — same convention as the fast-gate banner.
 * @example quoteLogValue('a"b') => '"a\\"b"'
 * @param {*} value - Value to quote.
 * @returns {string} Double-quoted token for the log line.
 ***/
export function quoteLogValue(value) {
	return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/***
 * MARK: loadReport
 * @description Reads and parses one Playwright JSON report file. Returns null
 *   when the file is missing or unparseable (a killed/timed-out run writes no
 *   report) — the caller treats that as unclassifiable and stays red.
 * @example loadReport("/tmp/missing.json") => null
 * @param {string} [reportPath] - JSON report path.
 * @returns {Object|null} Parsed report, or null.
 ***/
export function loadReport(reportPath) {
	try {
		if (typeof reportPath !== "string" || !reportPath) return null;
		const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

function errorTextOfResult(result) {
	const parts = [];
	const err = result?.error;
	if (err) {
		if (err.message) parts.push(String(err.message));
		if (err.value) parts.push(String(err.value));
		if (err.stack) parts.push(String(err.stack));
	}
	for (const e of Array.isArray(result?.errors) ? result.errors : []) {
		if (e?.message) parts.push(String(e.message));
		if (e?.stack) parts.push(String(e.stack));
	}
	return parts.join("\n");
}

function walkSuites(suites, chain, out) {
	for (const suite of Array.isArray(suites) ? suites : []) {
		const nextChain = suite?.title ? [...chain, String(suite.title)] : chain;
		for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
			const tests = Array.isArray(spec?.tests) ? spec.tests : [];
			const failed =
				spec?.ok === false ||
				tests.some((t) => t?.status === "unexpected") ||
				tests.some((t) =>
					(Array.isArray(t?.results) ? t.results : []).some(
						(r) => r?.status === "failed" || r?.status === "timedOut" || r?.status === "interrupted",
					),
				);
			if (!failed) continue;
			const texts = [];
			for (const t of tests) {
				for (const r of Array.isArray(t?.results) ? t.results : []) texts.push(errorTextOfResult(r));
			}
			const text = texts.join("\n");
			const file = spec?.file ?? suite?.file ?? "";
			const line = Number.isInteger(spec?.line) ? spec.line : Number.isInteger(suite?.line) ? suite.line : null;
			const testTitles = tests.map((t) => String(t?.title ?? "")).filter(Boolean);
			const title = [...nextChain, String(spec?.title ?? ""), ...new Set(testTitles)].join(" › ");
			out.push({
				title,
				file: String(file),
				line,
				column: Number.isInteger(spec?.column) ? spec.column : null,
				id: spec?.id ? String(spec.id) : null,
				signature: matchInfraFlake(text),
				errorExcerpt: String(text).replace(/\s+/g, " ").trim().slice(0, 240),
			});
		}
		walkSuites(suite?.suites, nextChain, out);
	}
}

/***
 * MARK: collectFailedTests
 * @description Extracts every failed spec from a Playwright JSON report
 *   (suites nest arbitrarily deep) and classifies each one's error text
 *   against the infra-flake signature list. Returns the failed entries
 *   (`signature` = matched id or null for genuine failures) plus any
 *   top-level report errors (global setup crashes etc.).
 * @example const { failed, globalErrors } = collectFailedTests(report)
 * @param {Object} [report] - Parsed Playwright JSON report (see loadReport).
 * @param {Object} [opts]
 * @param {string} [opts.testDir] - Absolute testDir, used to resolve the
 *   report's spec-relative `file` for rerun filters.
 * @param {string} [opts.configDir] - Absolute config dir, fallback resolver.
 * @returns {{ failed: Array<Object>, globalErrors: Array<string> }}
 ***/
export function collectFailedTests(report, { testDir, configDir } = {}) {
	const failed = [];
	if (report && typeof report === "object") walkSuites(report.suites, [], failed);
	const globalErrors = (Array.isArray(report?.errors) ? report.errors : [])
		.map((e) => String(e?.message ?? e ?? ""))
		.filter(Boolean);
	for (const entry of failed) {
		entry.absFile = resolveSpecFile(entry.file, { testDir, configDir });
		if (entry.absFile && configDir) {
			entry.displayFile = path.relative(configDir, entry.absFile).split(path.sep).join("/");
		}
	}
	return { failed, globalErrors };
}

function resolveSpecFile(file, { testDir, configDir } = {}) {
	if (!file) return null;
	if (path.isAbsolute(file) && fs.existsSync(file)) return file;
	for (const base of [testDir, configDir]) {
		if (!base) continue;
		const candidate = path.resolve(base, file);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

/***
 * MARK: classifyFailures
 * @description Splits failed-test entries into infra flakes vs genuine
 *   failures. `allInfraFlakes` is true only when there is at least one failure
 *   and EVERY failure matched a known signature — a mixed run (one flake +
 *   one genuine failure) is NOT all-flakes and stays red.
 * @example classifyFailures([{ signature: "browser-closed" }]).allInfraFlakes => true
 * @example classifyFailures([{ signature: null }]).allInfraFlakes => false
 * @param {Array<Object>} [failed] - Entries from collectFailedTests.
 * @returns {{ allInfraFlakes: boolean, signatureCounts: Object<string, number>, flakes: Array<Object>, genuine: Array<Object> }}
 ***/
export function classifyFailures(failed) {
	const entries = Array.isArray(failed) ? failed : [];
	const signatureCounts = {};
	const flakes = [];
	const genuine = [];
	for (const entry of entries) {
		if (entry?.signature) {
			signatureCounts[entry.signature] = (signatureCounts[entry.signature] ?? 0) + 1;
			flakes.push(entry);
		} else {
			genuine.push(entry);
		}
	}
	return {
		allInfraFlakes: entries.length > 0 && genuine.length === 0,
		signatureCounts,
		flakes,
		genuine,
	};
}

/***
 * MARK: planRerunFilters
 * @description Builds the Playwright CLI `file:line` filters that select
 *   exactly the failed tests for the runner-level rerun (failed tests only,
 *   never the whole ~17-minute run). Paths are made relative to the config
 *   dir (the CLI's cwd) with forward slashes. Deduped; entries whose file
 *   cannot be resolved on disk fall back to the report-relative path.
 * @example planRerunFilters([{ file: "a.spec.js", line: 4, absFile: "/r/canary-e2e/tests/a.spec.js" }], { configDir: "/r/canary-e2e", testDir: "/r/canary-e2e/tests" }) => { filters: ["tests/a.spec.js:4"] }
 * @param {Array<Object>} [failed] - Entries from collectFailedTests.
 * @param {Object} [opts]
 * @param {string} [opts.configDir] - Absolute canary-e2e dir (CLI cwd).
 * @param {string} [opts.testDir] - Absolute tests dir.
 * @returns {{ filters: Array<string>, unresolved: number }}
 ***/
export function planRerunFilters(failed, { configDir, testDir } = {}) {
	const seen = new Set();
	const filters = [];
	let unresolved = 0;
	for (const entry of Array.isArray(failed) ? failed : []) {
		const abs = entry?.absFile ?? resolveSpecFile(entry?.file, { testDir, configDir });
		const base = abs
			? path.relative(configDir || process.cwd(), abs).split(path.sep).join("/")
			: String(entry?.file ?? "");
		if (!base) continue;
		const filter = entry?.line ? `${base}:${entry.line}` : base;
		if (seen.has(filter)) continue;
		seen.add(filter);
		if (!abs) unresolved += 1;
		filters.push(filter);
	}
	return { filters, unresolved };
}

/***
 * MARK: planQuarantine
 * @description Decides what the wrapper does after the first run: green runs
 *   and unclassifiable runs (no failed tests in the report — e.g. a global
 *   setup crash or a killed run that wrote no JSON) stay red/neutral, mixed
 *   runs (any genuine failure alongside flakes) stay RED with no rerun, and
 *   only signature-only failure runs get the one failed-tests-only rerun.
 * @example planQuarantine({ firstExitCode: 1, failed: [{ signature: "browser-closed" }], globalErrors: [] }).rerun => true
 * @param {Object} [opts]
 * @param {number} [opts.firstExitCode] - First run's exit code.
 * @param {Array<Object>} [opts.failed] - collectFailedTests(...).failed.
 * @param {Array<string>} [opts.globalErrors] - collectFailedTests(...).globalErrors.
 * @returns {{ rerun: boolean, red: boolean, reason: string }}
 ***/
export function planQuarantine({ firstExitCode, failed = [], globalErrors = [] } = {}) {
	if (firstExitCode === 0) {
		return { rerun: false, red: false, reason: "first run green" };
	}
	if (!Array.isArray(failed) || failed.length === 0) {
		return {
			rerun: false,
			red: true,
			reason: `exit ${firstExitCode} with no classifiable failed tests (global errors: ${globalErrors.length}) — cannot prove an infra flake, stays red`,
		};
	}
	const { allInfraFlakes, genuine } = classifyFailures(failed);
	if (!allInfraFlakes) {
		return {
			rerun: false,
			red: true,
			reason: `exit ${firstExitCode} with ${genuine.length} genuine (non-signature) failure(s) alongside ${failed.length - genuine.length} flake(s) — mixed runs stay red`,
		};
	}
	return {
		rerun: true,
		red: false,
		reason: `exit ${firstExitCode} with ${failed.length} signature-only failure(s) — eligible for the runner-rerun lane`,
	};
}

/***
 * MARK: evaluateRerun
 * @description Decides whether the rerun forgives the first run's failures:
 *   a green rerun forgives; a rerun failing SOLELY on known signatures again
 *   (any id) is still recorded + forgiven (load flakes can persist within a
 *   run); anything else (genuine failure, or no classifiable failures) keeps
 *   the gate red.
 * @example evaluateRerun({ rerunExitCode: 0, rerunFailed: [] }).forgiven => true
 * @param {Object} [opts]
 * @param {number} [opts.rerunExitCode] - Rerun's exit code.
 * @param {Array<Object>} [opts.rerunFailed] - collectFailedTests of the rerun report.
 * @returns {{ forgiven: boolean, outcome: string }}
 ***/
export function evaluateRerun({ rerunExitCode, rerunFailed = [] } = {}) {
	if (rerunExitCode === 0) return { forgiven: true, outcome: "passed" };
	const { allInfraFlakes } = classifyFailures(rerunFailed);
	if (Array.isArray(rerunFailed) && rerunFailed.length > 0 && allInfraFlakes) {
		return { forgiven: true, outcome: "signature-only" };
	}
	return { forgiven: false, outcome: "red" };
}

/***
 * MARK: buildQuarantineSummary
 * @description Builds the machine-readable quarantine summary object written
 *   as `canary-quarantine.json` next to verdict.json: the lane, forgiven
 *   count, per-signature counts (the DEC-9 baseline counter — diffable
 *   across runs to prove a flake is gone), the named tests, the first-run and
 *   rerun details, and a snapshot of the committed baseline file. Pure.
 * @example buildQuarantineSummary({ lane: "runner-rerun", failures: [{ title: "t", file: "a.spec.js", line: 4, signature: "browser-closed" }] }).signatures => { "browser-closed": 1 }
 * @param {Object} [opts]
 * @param {string} [opts.generatedAt] - ISO timestamp, defaults to now.
 * @param {string} [opts.lane] - "none" | "runner-rerun" | "preflight-failed".
 * @param {Array<Object>} [opts.failures] - Failed entries of the deciding run.
 * @param {Object} [opts.firstRun] - { exitCode, reportPath } of the first run.
 * @param {Object|null} [opts.rerun] - { attempted, exitCode, filters, outcome } or null.
 * @param {boolean} [opts.unclassified] - True when a red run had no classifiable failures.
 * @param {Object|null} [opts.baseline] - Snapshot of infra-flake-baseline.json.
 * @param {string} [opts.note] - Free-form note (e.g. the plan reason).
 * @returns {Object} The summary object (version 1).
 ***/
export function buildQuarantineSummary({
	generatedAt = new Date().toISOString(),
	lane = "none",
	failures = [],
	firstRun = null,
	rerun = null,
	unclassified = false,
	baseline = null,
	note = "",
} = {}) {
	const entries = Array.isArray(failures) ? failures : [];
	const signatureCounts = {};
	for (const entry of entries) {
		if (entry?.signature) signatureCounts[entry.signature] = (signatureCounts[entry.signature] ?? 0) + 1;
	}
	const signatures = {};
	for (const id of Object.keys(signatureCounts).sort()) signatures[id] = signatureCounts[id];
	// "forgiven" counts only when the lane actually forgave (runner-rerun);
	// a red run's flake entries are recorded in tests/signatures but NOT forgiven.
	const laneName = String(lane || "none");
	const forgiven = laneName === LANE_RUNNER_RERUN ? entries.filter((e) => e?.signature).length : 0;
	return {
		version: 1,
		generatedAt,
		lane: laneName,
		forgiven,
		signatures,
		tests: entries.map((e) => ({
			title: String(e?.title ?? ""),
			file: String(e?.displayFile ?? e?.file ?? ""),
			line: typeof e?.line === "number" ? e.line : null,
			signature: e?.signature ?? null,
		})),
		firstRun,
		rerun,
		unclassified: unclassified === true,
		baseline,
		note: String(note ?? ""),
	};
}

/***
 * MARK: formatQuarantineLogLine
 * @description Renders the single greppable gate log line naming the
 *   lane/signature/tests (acceptance criterion 3):
 *   `KAINBAIN_CANARY_QUARANTINE forgiven=<n> lane=<lane> signatures="<id:count;…>" tests="<file:line:title;…>" summary="<path>"`.
 *   Pure; values are quoted so the line parses as tokens.
 * @example formatQuarantineLogLine(buildQuarantineSummary({ lane: "runner-rerun", failures: [{ title: "t", file: "a.spec.js", line: 4, signature: "browser-closed" }] }), "/v/canary-quarantine.json").startsWith("KAINBAIN_CANARY_QUARANTINE forgiven=1 lane=runner-rerun ") => true
 * @param {Object} [summary] - buildQuarantineSummary object.
 * @param {string|null} [summaryPath] - Written canary-quarantine.json path.
 * @returns {string} The log line (newline-terminated).
 ***/
export function formatQuarantineLogLine(summary, summaryPath = null) {
	const sig = Object.entries(summary?.signatures ?? {})
		.map(([id, count]) => `${id}:${count}`)
		.join(";");
	const tests = (Array.isArray(summary?.tests) ? summary.tests : [])
		.map((t) => `${t?.file ?? ""}${t?.line != null ? `:${t.line}` : ""}:${t?.title ?? ""}`)
		.join(";");
	return (
		`${QUARANTINE_LOG_MARKER} forgiven=${Number(summary?.forgiven ?? 0)}` +
		` lane=${quoteLogValue(summary?.lane ?? "none")}` +
		` signatures=${quoteLogValue(sig)}` +
		` tests=${quoteLogValue(tests)}` +
		` summary=${quoteLogValue(summaryPath ?? "unavailable")}\n`
	);
}

/***
 * MARK: readBaseline
 * @description Reads the committed infra-flake baseline
 *   (`canary-e2e/infra-flake-baseline.json`). Fail-open: unreadable or
 *   malformed resolves to null so a broken baseline never fails the gate.
 * @example readBaseline({ repoRoot: "/r" }) => { version: 1, signatures: {…} } | null
 * @param {Object} [opts]
 * @param {string} [opts.repoRoot] - Repo root, defaults to this checkout.
 * @param {string} [opts.baselinePath] - Explicit baseline path override.
 * @returns {Object|null} Parsed baseline, or null.
 ***/
export function readBaseline({ repoRoot = DEFAULT_REPO_ROOT, baselinePath = BASELINE_PATH } = {}) {
	try {
		const parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
		return parsed && typeof parsed === "object" ? parsed : null;
	} catch {
		return null;
	}
}

/***
 * MARK: resolveQuarantineDir
 * @description Picks (and creates) the directory the wrapper writes
 *   `canary-quarantine.json` into: the gate passes its verdict dir via
 *   `KAINBAIN_CANARY_QUARANTINE_DIR`; manual runs fall back to the standard
 *   verdict-dir resolution (task-docs `ci-fast-gate-<timestamp>/` or the
 *   repo-local fallback). Fail-open: an unwritable choice degrades to a fresh
 *   /tmp dir so reporting can never fail the gate it reports on.
 * @example resolveQuarantineDir({ env: { KAINBAIN_CANARY_QUARANTINE_DIR: "/v" } }) => "/v"
 * @param {Object} [opts]
 * @param {Object} [opts.env] - Env-like object, defaults to process.env.
 * @param {string} [opts.repoRoot] - Repo root for the fallback resolution.
 * @param {Date|number|string} [opts.now] - Clock seam for the fallback stamp.
 * @returns {string} The quarantine summary directory (created when possible).
 ***/
export function resolveQuarantineDir({ env = process.env, repoRoot = DEFAULT_REPO_ROOT, now } = {}) {
	const fromEnv = env?.[QUARANTINE_DIR_ENV];
	const candidates = [];
	if (typeof fromEnv === "string" && fromEnv.trim()) candidates.push(fromEnv.trim());
	try {
		candidates.push(resolveVerdictDir({ env, repoRoot, now }).dir);
	} catch {
		// Fall through to the tmp fallback below.
	}
	candidates.push(path.join(os.tmpdir(), `kb-canary-quarantine-${Date.now()}`));
	for (const dir of candidates) {
		try {
			fs.mkdirSync(dir, { recursive: true });
			fs.accessSync(dir, fs.constants.W_OK);
			return dir;
		} catch {
			// Try the next candidate.
		}
	}
	return candidates[candidates.length - 1];
}

/***
 * MARK: writeQuarantineSummary
 * @description Writes `canary-quarantine.json` into the given directory.
 *   Fail-open: any I/O error resolves to `{ ok: false }` instead of throwing,
 *   so reporting can never fail the gate it reports on.
 * @example writeQuarantineSummary({ dir: "/tmp/v", summary }) => { ok: true, path: "/tmp/v/canary-quarantine.json" }
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Target directory.
 * @param {Object} [opts.summary] - buildQuarantineSummary object.
 * @returns {Object} { ok, path } or { ok: false, error }.
 ***/
export function writeQuarantineSummary({ dir, summary = {} } = {}) {
	try {
		if (typeof dir !== "string" || !dir.trim()) return { ok: false, path: null, error: "no directory" };
		fs.mkdirSync(dir, { recursive: true });
		const filePath = path.join(dir, QUARANTINE_SUMMARY_FILENAME);
		fs.writeFileSync(filePath, `${JSON.stringify(summary, null, 2)}\n`);
		return { ok: true, path: filePath };
	} catch (error) {
		return { ok: false, path: null, error: error?.message || String(error) };
	}
}
