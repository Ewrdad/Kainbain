/***
 * MARK: fast-gate-verdict.mjs
 * @description The fast-gate verdict behind the fail-fast test gate: pure
 *   helpers that turn one overlap window's branch results into a
 *   machine-readable verdict (`verdict.json`), one untrimmed full log per
 *   failed branch, and a greppable banner printed on stdout. The gate
 *   (scripts/run-tests.mjs) writes the verdict the moment the fast phase
 *   resolves and the engine (api/flow/fastGateMarker.js) scans live output
 *   for the same marker line — the spelling is pinned by a cross-checked
 *   test so the two sides can never drift apart. Every writer here is
 *   fail-open: a missing or unwritable verdict directory degrades the banner
 *   to "unavailable" and never fails the gate by itself.
 * @example const verdict = buildFastGateVerdict({ fastResults: [], fastGateNames: [] })
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/***
 * MARK: FAST_GATE_MARKER
 * @description Opens the verdict banner's first line
 *   (`KAINBAIN_FAST_GATE_RESULT ok=… failedBranches="…" canary=…
 *   verdict="…"`) so operators can grep it and the engine can scan live
 *   chunks for it. Mirrored in api/flow/fastGateMarker.js; the
 *   cross-checked test fails when the two spellings disagree.
 * @example FAST_GATE_MARKER => "KAINBAIN_FAST_GATE_RESULT"
 ***/
export const FAST_GATE_MARKER = "KAINBAIN_FAST_GATE_RESULT";

/***
 * MARK: FAST_GATE_VERDICT_DIR_PREFIX
 * @description Directory-name stem for one gate run's verdict output:
 *   `<task-docs>/ci-fast-gate-<UTC-timestamp>/` holds `verdict.json` plus
 *   one `<branch-slug>.full.log` per failed branch.
 * @example FAST_GATE_VERDICT_DIR_PREFIX => "ci-fast-gate-"
 ***/
export const FAST_GATE_VERDICT_DIR_PREFIX = "ci-fast-gate-";

/***
 * MARK: LOCAL_VERDICT_RUNS_DIRNAME
 * @description Repo-local fallback when no task-docs directory is available
 *   (a developer's `npm test` outside CI): verdicts land under
 *   `<repo>/docs/tasks/local-gate-runs/ci-fast-gate-<timestamp>/`, a path
 *   the banner prints so it stays findable. Never a /tmp path an agent
 *   could not locate later.
 * @example LOCAL_VERDICT_RUNS_DIRNAME => "local-gate-runs"
 ***/
export const LOCAL_VERDICT_RUNS_DIRNAME = "local-gate-runs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(HERE, "..", "..");

/***
 * MARK: branchSlug
 * @description Turns a gate branch name into a safe log-file stem:
 *   lowercased, every non-alphanumeric run collapsed to one dash, with no
 *   leading or trailing dashes. Anything blank or unusable becomes
 *   "branch" so the writer always has a filename.
 * @example branchSlug("Unit Tests (frontend)") => "unit-tests-frontend"
 * @param {*} branchName - Gate branch name (anything stringifiable).
 * @returns {string} Safe filename stem for `<slug>.full.log`.
 ***/
export function branchSlug(branchName) {
	const slug = String(branchName ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "branch";
}

/***
 * MARK: formatVerdictTimestamp
 * @description Renders a clock reading as the UTC verdict-directory stamp
 *   (`YYYYMMDD-HHMMSS`, same shape as the stage-report timestamps), so one
 *   gate run's verdict sorts beside its reports in the task-docs folder.
 * @example formatVerdictTimestamp(new Date("2026-11-16T12:00:00Z")) => "20261116-120000"
 * @param {Date|number|string} [now] - Clock reading, defaults to now.
 * @returns {string} Timestamp stamp for the verdict directory name.
 ***/
export function formatVerdictTimestamp(now = new Date()) {
	const at = now instanceof Date ? now : new Date(now);
	const pad = (value) => String(value).padStart(2, "0");
	return (
		`${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
		`-${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`
	);
}

/***
 * MARK: taskDocsDirOf
 * @description Reads the engine-injected task-docs directory out of an env:
 *   the `KAINBAIN_TASK_DOCS` value when it names an existing writable
 *   directory, otherwise null (the caller falls back to repo-local
 *   scratch). Never throws: every probe failure resolves to null.
 * @example taskDocsDirOf({ env: { KAINBAIN_TASK_DOCS: "/docs/tasks/t1" } }) => "/docs/tasks/t1" | null
 * @param {Object} [opts]
 * @param {Object} [opts.env] - Env-like object, defaults to process.env.
 * @returns {string|null} Usable task-docs directory, or null.
 ***/
export function taskDocsDirOf({ env = process.env } = {}) {
	try {
		const candidate = env?.KAINBAIN_TASK_DOCS;
		if (typeof candidate !== "string" || !candidate.trim()) return null;
		const probed = candidate.trim();
		if (!fs.statSync(probed).isDirectory()) return null;
		fs.accessSync(probed, fs.constants.W_OK);
		return probed;
	} catch {
		return null;
	}
}

/***
 * MARK: resolveVerdictDir
 * @description Picks the directory this gate run's verdict files land in:
 *   `<task-docs>/ci-fast-gate-<timestamp>/` when the engine injected a
 *   usable `KAINBAIN_TASK_DOCS` (every CI run), otherwise the documented
 *   repo-local fallback for a developer's bare `npm test`. Pure path
 *   selection — the writer creates the directory; nothing is made here.
 * @example resolveVerdictDir({ env: {} }) => { dir: "<repo>/docs/tasks/local-gate-runs/ci-fast-gate-…", viaTaskDocs: false }
 * @param {Object} [opts]
 * @param {Object} [opts.env] - Env-like object, defaults to process.env.
 * @param {Date|number|string} [opts.now] - Clock seam for the timestamp.
 * @param {string} [opts.repoRoot] - Repo root for the fallback, defaults to this checkout.
 * @returns {{ dir: string, viaTaskDocs: boolean }} Verdict directory plus which arm resolved it.
 ***/
export function resolveVerdictDir({ env = process.env, now, repoRoot = DEFAULT_REPO_ROOT } = {}) {
	const stamp = formatVerdictTimestamp(now ?? new Date());
	const leaf = `${FAST_GATE_VERDICT_DIR_PREFIX}${stamp}`;
	const taskDocs = taskDocsDirOf({ env });
	if (taskDocs) return { dir: path.join(taskDocs, leaf), viaTaskDocs: true };
	return {
		dir: path.join(repoRoot, "docs", "tasks", LOCAL_VERDICT_RUNS_DIRNAME, leaf),
		viaTaskDocs: false,
	};
}

/***
 * MARK: ensureVerdictDir
 * @description Creates the verdict directory (recursively) and proves it
 *   writable. The gate calls this once up front so the failure Details
 *   preamble can point at full-log paths that are guaranteed creatable;
 *   a false here degrades every pointer to "unavailable" instead. Never
 *   throws: any I/O error resolves to false.
 * @example ensureVerdictDir({ dir: "/tmp/v/run" }) => true
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Directory to create and probe.
 * @returns {boolean} True when verdict files can be written there.
 ***/
export function ensureVerdictDir({ dir } = {}) {
	try {
		if (typeof dir !== "string" || !dir.trim()) return false;
		fs.mkdirSync(dir, { recursive: true });
		fs.accessSync(dir, fs.constants.W_OK);
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: buildFastGateVerdict
 * @description Builds the machine-readable verdict for one gate run from
 *   the fast overlap window's branch results (plus, after the serial
 *   phase, the canary results): the sorted failed-branch list with each
 *   branch's fast-gate membership, the canary decision, and any preflight
 *   failure. Pure: no I/O, never throws on malformed inputs.
 * @example buildFastGateVerdict({ fastResults: [], fastGateNames: [] }) => { ok: true, … }
 * @param {Object} [opts]
 * @param {Array<Object>} [opts.fastResults] - runParallel results of the fast phase.
 * @param {Array<string>} [opts.fastGateNames] - Branch names in the fast-gate set.
 * @param {string} [opts.canaryDecision] - 'ran' | 'skipped_due_to_fast_gate_failure' | 'opted_out' | 'pending'.
 * @param {Array<Object>} [opts.canaryResults] - runParallel results of the serial phase, once it ran.
 * @param {Object} [opts.preflightFailure] - { name, detail } when a preflight failed before the window opened.
 * @param {string} [opts.generatedAt] - ISO timestamp seam, defaults to now.
 * @returns {Object} { version, generatedAt, ok, failedBranches, canary, preflight }.
 ***/
export function buildFastGateVerdict({
	fastResults = [],
	fastGateNames = [],
	canaryDecision = "pending",
	canaryResults = null,
	preflightFailure = null,
	generatedAt = new Date().toISOString(),
} = {}) {
	const fastGateSet = new Set(Array.isArray(fastGateNames) ? fastGateNames : []);
	const failedBranches = [];
	const shaped = (result) => ({
		name: String(result?.name ?? "unknown branch"),
		exitCode: typeof result?.exitCode === "number" ? result.exitCode : null,
		wallSecs: typeof result?.wallSecs === "number" ? result.wallSecs : 0,
		fastGate: fastGateSet.has(result?.name),
	});
	for (const result of Array.isArray(fastResults) ? fastResults : []) {
		if (result && result.ok !== true) failedBranches.push(shaped(result));
	}
	for (const result of Array.isArray(canaryResults) ? canaryResults : []) {
		if (result && result.ok !== true) failedBranches.push(shaped(result));
	}
	let preflight = null;
	if (preflightFailure && typeof preflightFailure.name === "string") {
		preflight = {
			name: preflightFailure.name,
			detail: typeof preflightFailure.detail === "string" ? preflightFailure.detail : "",
		};
		failedBranches.unshift({
			name: preflightFailure.name,
			exitCode: null,
			wallSecs: 0,
			fastGate: true,
		});
	}
	const knownDecisions = new Set(["ran", "skipped_due_to_fast_gate_failure", "opted_out", "pending"]);
	return {
		version: 1,
		generatedAt,
		ok: failedBranches.length === 0,
		failedBranches,
		canary: knownDecisions.has(canaryDecision) ? canaryDecision : "pending",
		preflight,
	};
}

/***
 * MARK: writeBranchFullLog
 * @description Writes one branch's complete captured output to
 *   `<dir>/<branch-slug>.full.log`, creating the directory. Fail-open:
 *   any I/O error resolves to null instead of throwing, so a verdict
 *   write can never fail the gate it reports on.
 * @example writeBranchFullLog({ dir: "/tmp/v", branchName: "Linting (api)", output: "x\n" }) => "/tmp/v/linting-api.full.log"
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Verdict directory (created when missing).
 * @param {string} [opts.branchName] - Gate branch name (slugged for the filename).
 * @param {string} [opts.output] - Full captured output bytes for the branch.
 * @returns {string|null} Written path, or null when nothing could be written.
 ***/
export function writeBranchFullLog({ dir, branchName, output = "" } = {}) {
	try {
		if (typeof dir !== "string" || !dir.trim()) return null;
		fs.mkdirSync(dir, { recursive: true });
		const fullPath = path.join(dir, `${branchSlug(branchName)}.full.log`);
		fs.writeFileSync(fullPath, typeof output === "string" ? output : String(output ?? ""));
		return fullPath;
	} catch {
		return null;
	}
}

/***
 * MARK: writeFastGateVerdict
 * @description Writes one gate run's verdict atom: `verdict.json` (the
 *   buildFastGateVerdict object) plus one `<branch-slug>.full.log` per
 *   entry in `fullOutputs` — the caller passes failed branches only, so
 *   passing suites leave no files behind. Fail-open: an unwritable
 *   directory resolves to `{ ok: false, error }` instead of throwing.
 * @example writeFastGateVerdict({ dir: "/tmp/v", verdict, fullOutputs: [] }) => { ok: true, … }
 * @param {Object} [opts]
 * @param {string} [opts.dir] - Verdict directory (created when missing).
 * @param {Object} [opts.verdict] - Verdict object to serialize.
 * @param {Array<Object>} [opts.fullOutputs] - [{ name, output }] for failed branches only.
 * @returns {Object} { ok, dir, verdictPath, logPaths } or { ok: false, dir, error }.
 ***/
export function writeFastGateVerdict({ dir, verdict = {}, fullOutputs = [] } = {}) {
	try {
		if (typeof dir !== "string" || !dir.trim()) {
			return { ok: false, dir: dir ?? null, error: "no verdict directory" };
		}
		fs.mkdirSync(dir, { recursive: true });
		const verdictPath = path.join(dir, "verdict.json");
		fs.writeFileSync(verdictPath, `${JSON.stringify(verdict, null, 2)}\n`);
		const logPaths = [];
		for (const entry of Array.isArray(fullOutputs) ? fullOutputs : []) {
			const written = writeBranchFullLog({
				dir,
				branchName: entry?.name,
				output: entry?.output,
			});
			if (written) logPaths.push({ name: String(entry?.name ?? "unknown branch"), path: written });
		}
		return { ok: true, dir, verdictPath, logPaths };
	} catch (error) {
		return { ok: false, dir: dir ?? null, error: error?.message || String(error) };
	}
}

/***
 * MARK: quoteMarkerValue
 * @description Quotes one marker-line value: branch names and verdict paths
 *   carry spaces and parens but must stay greppable as one token, so the
 *   value is wrapped in double quotes with embedded quotes/backslashes
 *   escaped (the engine parser unescapes the same way).
 * @example quoteMarkerValue('a"b') => '"a\\"b"'
 * @param {*} value - Value to quote.
 * @returns {string} Double-quoted token for the marker line.
 ***/
function quoteMarkerValue(value) {
	return `"${String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/***
 * MARK: formatFastGateBanner
 * @description Renders the verdict banner the gate prints on stdout right
 *   after the fast phase resolves and repeats at gate end: a greppable
 *   `KAINBAIN_FAST_GATE_RESULT …` marker line first (the engine scans live
 *   chunks for it), then human lines naming every failed suite with its
 *   full-log path. Printed at both head and tail of the gate output so the
 *   pointers survive the engine's head+tail excerpts. Pure: never throws.
 * @example formatFastGateBanner({ verdict }) => "KAINBAIN_FAST_GATE_RESULT ok=true …\n…"
 * @param {Object} [opts]
 * @param {Object} [opts.verdict] - buildFastGateVerdict object.
 * @param {string} [opts.verdictPath] - Written verdict.json path (or null when unavailable).
 * @param {Array<Object>} [opts.logPaths] - [{ name, path }] written full logs.
 * @param {boolean} [opts.verdictAvailable] - False degrades every pointer to "unavailable".
 * @returns {string} Multi-line banner text (newline-terminated).
 ***/
export function formatFastGateBanner({ verdict = {}, verdictPath = null, logPaths = [], verdictAvailable = true } = {}) {
	try {
		const failed = Array.isArray(verdict?.failedBranches) ? verdict.failedBranches : [];
		const ok = verdict?.ok === true && failed.length === 0;
		const canary = typeof verdict?.canary === "string" ? verdict.canary : "pending";
		const available = verdictAvailable !== false && typeof verdictPath === "string" && verdictPath.length > 0;
		const names = failed.map((entry) => entry?.name ?? "unknown branch");
		const markerLine =
			`${FAST_GATE_MARKER} ok=${ok ? "true" : "false"}` +
			` failedBranches=${quoteMarkerValue(names.join(";"))}` +
			` canary=${canary}` +
			` verdict=${quoteMarkerValue(available ? verdictPath : "unavailable")}`;
		const lines = [markerLine];
		if (ok) {
			lines.push("Fast-gate verdict: PASSED — every fast branch passed");
		} else {
			lines.push(`Fast-gate verdict: FAILED — ${names.join(", ")}`);
		}
		if (canary === "skipped_due_to_fast_gate_failure") {
			lines.push("Canary: SKIPPED (fast-gate failed; deferred to the next green gate, never dropped)");
		} else if (canary === "opted_out") {
			lines.push("Canary: opted out (--no-canary)");
		} else if (canary === "ran") {
			lines.push("Canary: ran in the serial phase (see gate output)");
		}
		if (available) {
			for (const entry of Array.isArray(logPaths) ? logPaths : []) {
				if (entry && typeof entry.path === "string") {
					lines.push(`Full log: ${entry.name} → ${entry.path}`);
				}
			}
			lines.push(`Verdict file: ${verdictPath}`);
		} else {
			lines.push("Verdict files unavailable (verdict directory unwritable); the inline excerpts above carry the detail");
		}
		return `${lines.join("\n")}\n`;
	} catch {
		return `${FAST_GATE_MARKER} ok=false failedBranches="" canary=pending verdict="unavailable"\n`;
	}
}
