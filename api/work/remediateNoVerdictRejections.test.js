import { describe, it, expect } from "vitest";
import { _formatFrontmatterValue } from "./taskFiles.js";
import {
	NO_VERDICT_REJECTION_DIAGNOSTIC,
	isSpuriousNoVerdictFailure,
	remediateReportMarkdown,
	remediateTaskMarkdown,
	sanitizeSpuriousNoVerdictRejections,
} from "./remediateNoVerdictRejections.js";

/***
 * MARK: remediateNoVerdictRejections tests
 * @description Proves the one-off repair drops only the pre-revert
 *   no-verdict/no-change rejections from a persisted task, leaves genuine
 *   history untouched, and is idempotent.
 ***/

const fm = (value) => _formatFrontmatterValue(JSON.stringify(value));

function makeTaskMarkdown({ timeline, reports, ledger = '"{}"' }) {
	const lines = [
		"---",
		'id: "t1"',
		'projectId: "p1"',
		'title: "A task"',
		'status: "in_stage"',
		`timelineMetadata: ${fm(timeline)}`,
		`reportMetadata: ${fm(reports)}`,
		`verdictImplicitPassStages: ${ledger}`,
		"---",
		"",
		"# Goal",
		"do the thing",
		"",
	];
	return lines.join("\n");
}

const spuriousFailure = {
	stage: "Plan",
	status: "Failed",
	timestamp: "2026-10-10T21:59:22.494Z",
	reason: `[Agent Review Rejection] ${NO_VERDICT_REJECTION_DIAGNOSTIC}. An explicit KAINBAIN_VERDICT (PASS, or FAIL with KAINBAIN_REASON and KAINBAIN_FIX) is required.`,
	durationStageId: "3",
};

const genuineFailure = {
	stage: "Deep Review",
	status: "Failed",
	timestamp: "2026-10-10T22:10:00.000Z",
	reason: "[Agent Review Rejection] The diff reintroduces the bug. Fix guidance: revert the change.",
	durationStageId: "9",
};

const makeRejectedReport = () => ({
	filename: "plan-20261010-225922.md",
	stageName: "Plan",
	stageId: "3",
	duration: 18336.231,
	status: "FAILED",
	createdAt: "2026-10-10T21:59:22.494Z",
	failureKind: "rejected",
});

const makeGenuineReport = () => ({
	filename: "deep-review-20261010-221000.md",
	stageName: "Deep Review",
	stageId: "9",
	duration: 12,
	status: "FAILED",
	createdAt: "2026-10-10T22:10:00.000Z",
	failureKind: "rejected",
});

describe("sanitizeSpuriousNoVerdictRejections", () => {
	it("mutates only the spurious failure and its paired report", () => {
		const genuineReport = makeGenuineReport();
		const rejectedReport = makeRejectedReport();
		const task = {
			timeline: [genuineFailure, spuriousFailure],
			reports: [genuineReport, rejectedReport],
		};
		const result = sanitizeSpuriousNoVerdictRejections(task);

		expect(result.changed).toBe(true);
		expect(result.removedFailures).toBe(1);
		expect(result.repairedReports).toBe(1);
		expect(task.timeline).toHaveLength(1);
		expect(task.timeline[0]).toBe(genuineFailure);
		expect(rejectedReport.status).toBe("PASSED");
		expect(rejectedReport.failureKind).toBeUndefined();
		expect(genuineReport.status).toBe("FAILED");
	});

	it("no-ops without a timeline array", () => {
		const result = sanitizeSpuriousNoVerdictRejections({ reports: [] });
		expect(result.changed).toBe(false);
		expect(result.removedFailures).toBe(0);
	});

	it("no-ops on a clean task", () => {
		const task = { timeline: [genuineFailure], reports: [makeGenuineReport()] };
		const result = sanitizeSpuriousNoVerdictRejections(task);
		expect(result.changed).toBe(false);
		expect(task.timeline).toHaveLength(1);
	});
});

describe("isSpuriousNoVerdictFailure", () => {
	it("matches only the exact diagnostic on a Failed entry", () => {
		expect(isSpuriousNoVerdictFailure(spuriousFailure)).toBe(true);
		expect(isSpuriousNoVerdictFailure(genuineFailure)).toBe(false);
		expect(
			isSpuriousNoVerdictFailure({ ...spuriousFailure, status: "Advanced" }),
		).toBe(false);
		expect(isSpuriousNoVerdictFailure(null)).toBe(false);
	});
});

describe("remediateTaskMarkdown", () => {
	it("drops the spurious timeline failure and repairs the matched report", () => {
		const text = makeTaskMarkdown({
			timeline: [genuineFailure, spuriousFailure],
			reports: [makeRejectedReport(), makeGenuineReport()],
		});
		const result = remediateTaskMarkdown(text);

		expect(result.changed).toBe(true);
		expect(result.removedFailures).toBe(1);
		expect(result.repairedReports).toBe(1);
		expect(result.reportFilenames).toEqual(["plan-20261010-225922.md"]);

		const timeline = JSON.parse(
			result.text.match(/^timelineMetadata: "(.*)"$/m)[1].replace(/\\"/g, '"'),
		);
		expect(timeline).toHaveLength(1);
		expect(timeline[0].stage).toBe("Deep Review");

		const reports = JSON.parse(
			result.text.match(/^reportMetadata: "(.*)"$/m)[1].replace(/\\"/g, '"'),
		);
		const repaired = reports.find(
			(r) => r.filename === "plan-20261010-225922.md",
		);
		expect(repaired.status).toBe("PASSED");
		expect(repaired.failureKind).toBeUndefined();
		// The genuine rejection is untouched.
		const genuine = reports.find(
			(r) => r.filename === "deep-review-20261010-221000.md",
		);
		expect(genuine.status).toBe("FAILED");
		expect(genuine.failureKind).toBe("rejected");
	});

	it("removes the stale pre-revert ledger field", () => {
		const result = remediateTaskMarkdown(
			makeTaskMarkdown({ timeline: [spuriousFailure], reports: [] }),
		);
		expect(result.removedLedger).toBe(true);
		expect(result.text).not.toContain("verdictImplicitPassStages");
	});

	it("does not flip a report whose timestamp does not match a spurious failure", () => {
		const farReport = {
			...makeRejectedReport(),
			createdAt: "2026-10-09T00:00:00.000Z",
		};
		const result = remediateTaskMarkdown(
			makeTaskMarkdown({ timeline: [spuriousFailure], reports: [farReport] }),
		);
		expect(result.removedFailures).toBe(1);
		expect(result.repairedReports).toBe(0);
	});

	it("is idempotent", () => {
		const first = remediateTaskMarkdown(
			makeTaskMarkdown({
				timeline: [genuineFailure, spuriousFailure],
				reports: [makeRejectedReport(), makeGenuineReport()],
			}),
		);
		const second = remediateTaskMarkdown(first.text);
		expect(second.changed).toBe(false);
		expect(second.text).toBe(first.text);
	});

	it("no-ops when the diagnostic is absent", () => {
		const text = makeTaskMarkdown({
			timeline: [genuineFailure],
			reports: [makeGenuineReport()],
		});
		const result = remediateTaskMarkdown(text);
		expect(result.changed).toBe(false);
		expect(result.text).toBe(text);
		expect(result.removedFailures).toBe(0);
	});

	it("tolerates malformed frontmatter JSON without throwing", () => {
		const text = [
			"---",
			'id: "t1"',
			`timelineMetadata: "not json ${NO_VERDICT_REJECTION_DIAGNOSTIC}"`,
			"---",
			"",
			"body",
		].join("\n");
		expect(() => remediateTaskMarkdown(text)).not.toThrow();
		expect(remediateTaskMarkdown(text).changed).toBe(false);
	});
});

describe("remediateReportMarkdown", () => {
	const report = [
		"<!-- KAINBAIN AUTO-GENERATED REPORT -->",
		"# Stage Report: Plan",
		"",
		"**Status:** FAILED",
		"",
		`Execution failed: [Agent Review Rejection] ${NO_VERDICT_REJECTION_DIAGNOSTIC}`,
		"",
	].join("\n");

	it("flips the status and appends a remediation note", () => {
		const result = remediateReportMarkdown(report);
		expect(result.changed).toBe(true);
		expect(result.text).toContain("**Status:** PASSED");
		expect(result.text).toContain("Remediated");
		expect(result.text).not.toContain("**Status:** FAILED");
	});

	it("is idempotent", () => {
		const once = remediateReportMarkdown(report);
		const twice = remediateReportMarkdown(once.text);
		expect(twice.changed).toBe(false);
		expect(twice.text).toBe(once.text);
	});

	it("no-ops on an unrelated report", () => {
		const other = "# Stage Report\n\n**Status:** FAILED\n\nsome other reason\n";
		expect(remediateReportMarkdown(other).changed).toBe(false);
	});
});
