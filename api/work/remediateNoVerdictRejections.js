/***
 * MARK: remediateNoVerdictRejections
 * @description Repair for the pre-revert strict verdict gate: the deployed
 *   build that predated commit b2806f3 failed every agent stage that made no
 *   file changes and rendered no `KAINBAIN_VERDICT` block, stamping
 *   `[Agent Review Rejection] No changes made and no verdict rendered` into
 *   the task timeline and report metadata. Under the restored fail-open
 *   contract that rejection is spurious, so this module drops the bogus
 *   `Failed` timeline entry, flips the matched rejected report(s) back to
 *   PASSED, and removes the stale pre-revert `verdictImplicitPassStages`
 *   ledger. `sanitizeSpuriousNoVerdictRejections` is the record-level source
 *   of truth used by the task loader (so a clobbered file heals on restart);
 *   `remediateTaskMarkdown` is the text-level transform used by the one-off
 *   CLI. Every mutation is idempotent and unrelated history — including
 *   genuine agent rejections — is left byte-identical.
 ***/
import { _formatFrontmatterValue } from "./taskFiles.js";

/*** Exact diagnostic emitted by the removed strict no-verdict gate. */
export const NO_VERDICT_REJECTION_DIAGNOSTIC =
	"No changes made and no verdict rendered";

/** How close a report createdAt must be to a failure timestamp to pair them. */
export const REPORT_MATCH_WINDOW_MS = 3000;

/* eslint-disable security/detect-non-literal-regexp -- frontmatter keys are internal constants, never user input */
/***
 * MARK: readFrontmatterLine
 * @description Reads the raw value of a single frontmatter line.
 ***/
function readFrontmatterLine(text, key) {
	const match = text.match(new RegExp(`^${key}: (.*)$`, "m"));
	return match ? match[1] : null;
}

/***
 * MARK: writeFrontmatterLine
 * @description Replaces a single frontmatter line's value, preserving the
 *   engine's own escaping so the file round-trips through `_parseFrontmatter`.
 ***/
function writeFrontmatterLine(text, key, value) {
	return text.replace(
		new RegExp(`^${key}: .*$`, "m"),
		`${key}: ${_formatFrontmatterValue(value)}`,
	);
}
/* eslint-enable security/detect-non-literal-regexp */

/***
 * MARK: decodeFrontmatterJson
 * @description Decodes a JSON-in-YAML frontmatter scalar (double-quoted with
 *   escaped quotes/backslashes) back into a value. Returns null when the value
 *   is absent or malformed so callers skip rather than throw.
 ***/
function decodeFrontmatterJson(raw) {
	if (typeof raw !== "string" || !raw.trim()) return null;
	let value = raw.trim();
	if (value.startsWith('"') && value.endsWith('"')) {
		value = value
			.slice(1, -1)
			.replace(/\\"/g, '"')
			.replace(/\\\\/g, "\\");
	}
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

/***
 * MARK: isSpuriousNoVerdictFailure
 * @description True only for the exact pre-revert rejection signature: a
 *   Failed timeline/report entry whose reason carries the no-verdict
 *   diagnostic. Genuine rejections (with any other reason) never match.
 ***/
export function isSpuriousNoVerdictFailure(entry) {
	if (!entry || typeof entry !== "object") return false;
	return (
		entry.status === "Failed" &&
		String(entry.reason || "").includes(NO_VERDICT_REJECTION_DIAGNOSTIC)
	);
}

/***
 * MARK: sanitizeSpuriousNoVerdictRejections
 * @description Record-level migration: mutates a task (or any
 *   `{ timeline, reports }` record) in place, dropping the spurious
 *   no-verdict `Failed` timeline entries and flipping the report entries that
 *   pair with them (same timestamp, within the match window) back to PASSED.
 *   Genuine rejections and all other history are untouched. No-ops — and
 *   reports `changed: false` — when the record has no such entry, so it is
 *   safe to call on every load.
 * @example sanitizeSpuriousNoVerdictRejections(task).removedFailures => 2
 * @param {Object} record - Task entity with `timeline` and `reports` arrays.
 * @param {Object} [opts]
 * @param {number} [opts.matchWindowMs] - Report/timeline pairing tolerance.
 * @returns {{changed:boolean,removedFailures:number,repairedReports:number,reportFilenames:string[]}}
 ***/
export function sanitizeSpuriousNoVerdictRejections(
	record,
	{ matchWindowMs = REPORT_MATCH_WINDOW_MS } = {},
) {
	const result = {
		changed: false,
		removedFailures: 0,
		repairedReports: 0,
		reportFilenames: [],
	};
	if (!record || typeof record !== "object") return result;
	if (!Array.isArray(record.timeline)) return result;
	const removed = record.timeline.filter(isSpuriousNoVerdictFailure);
	if (removed.length === 0) return result;

	record.timeline = record.timeline.filter(
		(entry) => !isSpuriousNoVerdictFailure(entry),
	);
	result.removedFailures = removed.length;
	result.changed = true;

	const failureTimes = removed
		.map((entry) => Date.parse(entry.timestamp))
		.filter(Number.isFinite);
	if (!Array.isArray(record.reports)) return result;
	for (const report of record.reports) {
		if (String(report?.status || "").toUpperCase() !== "FAILED") continue;
		const created = Date.parse(report.createdAt);
		if (!Number.isFinite(created)) continue;
		const matched = failureTimes.some(
			(failureAt) => Math.abs(failureAt - created) <= matchWindowMs,
		);
		if (!matched) continue;
		report.status = "PASSED";
		delete report.failureKind;
		result.repairedReports += 1;
		if (typeof report.filename === "string" && report.filename) {
			result.reportFilenames.push(report.filename);
		}
	}
	return result;
}

/***
 * MARK: remediateTaskMarkdown
 * @description Pure text-level repair of one persisted `task.md`, backed by
 *   `sanitizeSpuriousNoVerdictRejections`: it rewrites only the
 *   `timelineMetadata`/`reportMetadata` frontmatter lines and drops the stale
 *   `verdictImplicitPassStages` field, leaving the rest of the file
 *   byte-identical. No-ops unless the spurious diagnostic is present.
 * @example remediateTaskMarkdown(tmd).changed => true
 * @param {string} text - Raw `task.md` content.
 * @param {Object} [opts]
 * @param {number} [opts.matchWindowMs] - Report/timeline pairing tolerance.
 * @returns {{changed:boolean,text:string,removedFailures:number,repairedReports:number,removedLedger:boolean,reportFilenames:string[]}}
 ***/
export function remediateTaskMarkdown(text, opts = {}) {
	const result = {
		changed: false,
		text,
		removedFailures: 0,
		repairedReports: 0,
		removedLedger: false,
		reportFilenames: [],
	};
	if (typeof text !== "string" || !text.includes(NO_VERDICT_REJECTION_DIAGNOSTIC)) {
		return result;
	}

	const timeline = decodeFrontmatterJson(
		readFrontmatterLine(text, "timelineMetadata"),
	);
	const reports = decodeFrontmatterJson(
		readFrontmatterLine(text, "reportMetadata"),
	);
	const scratch = {
		timeline: Array.isArray(timeline) ? timeline : [],
		reports: Array.isArray(reports) ? reports : [],
	};
	const sanitized = sanitizeSpuriousNoVerdictRejections(scratch, opts);

	let out = text;
	if (sanitized.removedFailures > 0) {
		out = writeFrontmatterLine(
			out,
			"timelineMetadata",
			JSON.stringify(scratch.timeline),
		);
		if (Array.isArray(reports)) {
			out = writeFrontmatterLine(
				out,
				"reportMetadata",
				JSON.stringify(scratch.reports),
			);
		}
		result.removedFailures = sanitized.removedFailures;
		result.repairedReports = sanitized.repairedReports;
		result.reportFilenames = sanitized.reportFilenames;
	}

	// Stale pre-revert ledger field: the parser already ignores it, but a
	// remediated task should not keep a field that no longer exists.
	if (/^verdictImplicitPassStages: /m.test(out)) {
		out = out.replace(/^verdictImplicitPassStages: .*\n/m, "");
		result.removedLedger = true;
	}

	result.changed = out !== text;
	result.text = out;
	return result;
}

/***
 * MARK: remediateReportMarkdown
 * @description Pure repair of one persisted stage report: flips the recorded
 *   FAILED status to PASSED and appends a remediation note naming the cause,
 *   so the report file agrees with the repaired task metadata. Idempotent.
 * @example remediateReportMarkdown(rpt).changed => true
 * @param {string} text - Raw report markdown.
 * @returns {{changed:boolean,text:string}}
 ***/
export function remediateReportMarkdown(text) {
	if (typeof text !== "string" || !text.includes(NO_VERDICT_REJECTION_DIAGNOSTIC)) {
		return { changed: false, text };
	}
	if (text.includes("<!-- no-verdict-rejection-remediated -->")) {
		return { changed: false, text };
	}
	const out = text.replace(/\*\*Status:\*\* FAILED/, "**Status:** PASSED");
	if (out === text) {
		// The diagnostic can appear in the body of an otherwise non-FAILED
		// report; only a status flip counts as a repair.
		return { changed: false, text };
	}
	return {
		changed: true,
		text:
			out +
			"\n<!-- no-verdict-rejection-remediated -->\n" +
			"> **Remediated:** this stage was failed by the pre-revert strict " +
			"no-verdict gate (`No changes made and no verdict rendered`). Under the " +
			"restored fail-open contract the stage passed; the rejection was spurious.\n",
	};
}
