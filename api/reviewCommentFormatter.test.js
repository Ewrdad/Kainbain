import { describe, it, expect } from "vitest";
import {
	normalizeReportPath,
	reportPathVariants,
	formatCommentsMarkdown,
	feedbackAlreadyContainsComments,
	buildHumanApprovalContent,
	buildHumanRejectionContent,
	buildCommentsGuidance,
} from "./reviewCommentFormatter.js";

/***
 * MARK: reviewCommentFormatter tests
 * @description Black-box coverage for the human-review markdown helpers:
 *   path canonicalization, comment grouping/sorting, approval/rejection
 *   report bodies, and downstream guidance composition.
 ***/
describe("normalizeReportPath", () => {
	it("strips a single leading ./ prefix", () => {
		expect(normalizeReportPath("./docs/tasks/t-1/plan.md")).toBe(
			"docs/tasks/t-1/plan.md",
		);
	});

	it("leaves bare repo-relative paths untouched", () => {
		expect(normalizeReportPath("docs/tasks/t-1/plan.md")).toBe(
			"docs/tasks/t-1/plan.md",
		);
	});

	it("strips repeated ./ prefixes but never traversal", () => {
		expect(normalizeReportPath("././docs/tasks/t-1/plan.md")).toBe(
			"docs/tasks/t-1/plan.md",
		);
		expect(normalizeReportPath("../docs/tasks/t-1/plan.md")).toBe(
			"../docs/tasks/t-1/plan.md",
		);
		expect(normalizeReportPath("./")).toBe("");
	});

	it("returns empty string for non-string input", () => {
		expect(normalizeReportPath(null)).toBe("");
		expect(normalizeReportPath(undefined)).toBe("");
		expect(normalizeReportPath(42)).toBe("");
	});
});

describe("reportPathVariants", () => {
	it("returns both spellings for a bare path", () => {
		expect(reportPathVariants("docs/tasks/t-1/plan.md")).toEqual([
			"docs/tasks/t-1/plan.md",
			"./docs/tasks/t-1/plan.md",
		]);
	});

	it("returns both spellings for a ./ prefixed path", () => {
		expect(reportPathVariants("./docs/tasks/t-1/plan.md")).toEqual([
			"docs/tasks/t-1/plan.md",
			"./docs/tasks/t-1/plan.md",
		]);
	});

	it("returns empty for unusable input", () => {
		expect(reportPathVariants(null)).toEqual([]);
		expect(reportPathVariants("   ")).toEqual([]);
	});
});

describe("formatCommentsMarkdown", () => {
	it("renders a placeholder for an empty list", () => {
		expect(formatCommentsMarkdown([])).toBe("_No review comments._");
		expect(formatCommentsMarkdown()).toBe("_No review comments._");
	});

	it("groups threads by file and sorts by line", () => {
		const output = formatCommentsMarkdown([
			{ filePath: "b.md", scope: "line", line: 30, body: "later", author: "human" },
			{ filePath: "a.md", scope: "line", line: 5, body: "first", author: "human" },
			{ filePath: "a.md", scope: "line", line: 2, body: "earliest", author: "human" },
		]);
		expect(output.indexOf("### `a.md`")).toBeLessThan(output.indexOf("### `b.md`"));
		const aSection = output.slice(
			output.indexOf("### `a.md`"),
			output.indexOf("### `b.md`"),
		);
		expect(aSection.indexOf("earliest")).toBeLessThan(aSection.indexOf("first"));
		expect(output).toContain("Line 2");
	});

	it("marks resolved state and renders replies", () => {
		const output = formatCommentsMarkdown([
			{
				filePath: "src/auth.js",
				scope: "file",
				body: "split this",
				author: "human",
				resolved: true,
				replies: [{ body: "done", author: "agent" }],
			},
		]);
		expect(output).toContain("File");
		expect(output).toContain("resolved");
		expect(output).toContain("Reply (agent): done");
	});
});

describe("feedbackAlreadyContainsComments", () => {
	it("is true when there is nothing to carry", () => {
		expect(feedbackAlreadyContainsComments("anything", [])).toBe(true);
	});

	it("is false for blank feedback with live comments", () => {
		expect(feedbackAlreadyContainsComments("", [{ body: "fix this" }])).toBe(false);
	});

	it("detects the pre-filled fail-draft header", () => {
		expect(
			feedbackAlreadyContainsComments("## Review comments\n- `a` — hi", [
				{ body: "something else entirely" },
			]),
		).toBe(true);
	});

	it("detects comment bodies carried verbatim", () => {
		expect(
			feedbackAlreadyContainsComments("please fix the timeout handling", [
				{ body: "fix the timeout" },
			]),
		).toBe(true);
		expect(
			feedbackAlreadyContainsComments("unrelated notes", [{ body: "fix the timeout" }]),
		).toBe(false);
	});
});

describe("buildHumanApprovalContent", () => {
	it("writes a bare approval when there are no comments", () => {
		const content = buildHumanApprovalContent({ stageName: "Review" });
		expect(content).toContain("# Human approval: Review");
		expect(content).toContain("**Status:** PASSED");
		expect(content).not.toContain("## Review Comments");
	});

	it("records line-by-line comments on a pass with guidance", () => {
		const content = buildHumanApprovalContent({
			stageName: "Review",
			guidance: "Ship it",
			comments: [
				{
					filePath: "docs/tasks/t-1/plan.md",
					scope: "line",
					line: 42,
					body: "Consider a fallback timeout",
					author: "human",
				},
			],
		});
		expect(content).toContain("## Review Comments");
		expect(content).toContain("Line 42");
		expect(content).toContain("Consider a fallback timeout");
		expect(content).toContain("## Guidance");
		expect(content).toContain("Ship it");
	});

	it("notes downstream consideration when passing with comments but no guidance", () => {
		const content = buildHumanApprovalContent({
			stageName: "Review",
			comments: [{ filePath: "a.md", scope: "file", body: "note" }],
		});
		expect(content).toContain("## Review Comments");
		expect(content).toContain("## Guidance");
	});
});

describe("buildHumanRejectionContent", () => {
	it("keeps feedback without duplicating pre-filled comment drafts", () => {
		const content = buildHumanRejectionContent({
			feedback: "## Review comments\n- `a.md`:L1 — fix it",
			comments: [{ filePath: "a.md", scope: "line", line: 1, body: "fix it" }],
		});
		expect(content).toContain("# Human rejection");
		expect(content).toContain("**Status:** FAILED");
		expect(content.match(/## Review [Cc]omments/g) || []).toHaveLength(1);
	});

	it("appends threads when feedback was written freehand", () => {
		const content = buildHumanRejectionContent({
			feedback: "Not ready yet",
			comments: [{ filePath: "a.md", scope: "line", line: 3, body: "missing test" }],
		});
		expect(content).toContain("Not ready yet");
		expect(content).toContain("## Review Comments");
		expect(content).toContain("missing test");
	});
});

describe("buildCommentsGuidance", () => {
	it("returns empty when there is nothing to carry", () => {
		expect(buildCommentsGuidance({})).toBe("");
	});

	it("carries comments alone when guidance is blank", () => {
		const guidance = buildCommentsGuidance({
			comments: [{ filePath: "a.md", scope: "file", body: "watch this" }],
		});
		expect(guidance).toContain("watch this");
	});

	it("combines guidance with threads without duplicating", () => {
		const comments = [{ filePath: "a.md", scope: "file", body: "watch this" }];
		const combined = buildCommentsGuidance({ guidance: "Ship it", comments });
		expect(combined).toContain("Ship it");
		expect(combined).toContain("watch this");
		const already = buildCommentsGuidance({
			guidance: "Ship it — watch this is handled",
			comments,
		});
		expect(already).not.toContain("## Review Comments");
	});
});
