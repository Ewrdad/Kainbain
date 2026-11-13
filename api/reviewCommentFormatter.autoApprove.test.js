import { describe, it, expect } from "vitest";
import { buildHumanApprovalContent } from "./reviewCommentFormatter.js";

/***
 * MARK: automatic approval report tests
 * @description Pins the sweeper-driven `# Human approval (automatic)` report
 *   variant and the byte-identical manual output it must never disturb.
 ***/
describe("buildHumanApprovalContent (automatic)", () => {
	const automated = {
		heldSince: "2026-11-01T00:00:00.000Z",
		autoApproveAt: "2026-11-11T00:00:00.000Z",
		firedAt: "2026-11-11T00:01:30.000Z",
		durationMs: 864000000,
		durationText: "10 days",
	};

	it("renders the automatic header variant with the full audit line", () => {
		const content = buildHumanApprovalContent({ stageName: "Review", automated });
		expect(content).toContain("# Human approval (automatic): Review");
		expect(content).toContain("**Status:** PASSED");
		expect(content).toContain("**Automatic:** approved by the auto-approve timer after 10 days");
		expect(content).toContain("held since 2026-11-01T00:00:00.000Z");
		expect(content).toContain("deadline 2026-11-11T00:00:00.000Z");
		expect(content).toContain("fired 2026-11-11T00:01:30.000Z");
	});

	it("keeps review threads and guidance in automatic reports", () => {
		const content = buildHumanApprovalContent({
			stageName: "Review",
			guidance: "ship it",
			comments: [{ filePath: "a.md", line: 2, body: "Fix this" }],
			automated,
		});
		expect(content).toContain("# Human approval (automatic): Review");
		expect(content).toContain("## Review Comments");
		expect(content).toContain("Fix this");
		expect(content).toContain("## Guidance");
		expect(content).toContain("ship it");
	});

	it("degrades every audit field to readable fallback text, never undefined", () => {
		const content = buildHumanApprovalContent({ stageName: "Review", automated: {} });
		expect(content).toContain("# Human approval (automatic): Review");
		expect(content).not.toContain("undefined");
	});

	it("renders manual approvals byte-identically with no marker", () => {
		expect(buildHumanApprovalContent({ stageName: "Review", comments: [] })).toBe(
			"# Human approval: Review\n**Status:** PASSED",
		);
		expect(
			buildHumanApprovalContent({
				stageName: "Review",
				guidance: "ship it",
				comments: [{ filePath: "a.md", scope: "line", line: 2, body: "Fix this" }],
			}),
		).toBe(
			[
				"# Human approval: Review",
				"**Status:** PASSED",
				"",
				"## Review Comments",
				"### `a.md`",
				"- Line 2 (open, human): Fix this",
				"",
				"## Guidance",
				"ship it",
			].join("\n"),
		);
	});
});
