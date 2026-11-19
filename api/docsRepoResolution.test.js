import { describe, it, expect } from "vitest";
import {
	resolveDocsPath,
	resolveTasksDir,
	resolveTaskDocsDir,
	reportRelPath,
	docsTasksIgnorePath,
} from "./docsPath.js";
import {
	resolveKainbainDir,
	resolveProjectConfigPath,
	resolveSessionsDir,
	resolveWorktreesDir,
	resolveQuarantineDir,
	kainbainIgnorePath,
} from "./kainbainDir.js";

/**
 * MARK: docsRepo resolution tests
 * @description The `resolveKainbainHome` seam: with a `docsRepo.localPath`
 *   every docs/state resolver maps into the docs checkout; without one
 *   (legacy) everything stays byte-identical under the cwd.
 */
describe("docs resolvers with a separate docs repo", () => {
	const project = { docsRepo: { url: "https://h/kb.git", localPath: "/srv/kb/proj" } };

	it("resolveDocsPath maps into the docs checkout", () => {
		expect(resolveDocsPath("/repo", project)).toBe("/srv/kb/proj/docs");
		expect(resolveDocsPath("/repo", { ...project, docsDirName: "k-docs" })).toBe("/srv/kb/proj/k-docs");
	});

	it("tasks and per-task dirs follow the docs checkout", () => {
		expect(resolveTasksDir("/repo", project)).toBe("/srv/kb/proj/docs/tasks");
		expect(resolveTaskDocsDir("/repo", project, "t-1")).toBe("/srv/kb/proj/docs/tasks/t-1");
	});

	it("state resolvers map into the docs checkout", () => {
		expect(resolveKainbainDir("/repo", project)).toBe("/srv/kb/proj/.kainbain");
		expect(resolveProjectConfigPath("/repo", project)).toBe("/srv/kb/proj/.kainbain/project.json");
		expect(resolveSessionsDir("/repo", project)).toBe("/srv/kb/proj/.kainbain/sessions");
		expect(resolveWorktreesDir("/repo", project)).toBe("/srv/kb/proj/.kainbain/worktrees");
		expect(resolveQuarantineDir("/repo", project)).toBe("/srv/kb/proj/.kainbain/quarantine");
	});

	it("relative-path forms and report helpers are unchanged", () => {
		// reportRelPath stays the in-repo relative form — inside the docs
		// repo the same relative path resolves correctly.
		expect(reportRelPath(project, "t-1", "plan.md")).toBe("./docs/tasks/t-1/plan.md");
		expect(docsTasksIgnorePath(project)).toBe("docs/tasks/");
		expect(kainbainIgnorePath(project)).toBe(".kainbain/");
	});
});

describe("legacy resolvers are byte-identical without docsRepo", () => {
	it("no docsRepo → cwd-based paths exactly as before", () => {
		expect(resolveDocsPath("/repo", {})).toBe("/repo/docs");
		expect(resolveDocsPath("/repo", null)).toBe("/repo/docs");
		expect(resolveDocsPath("/repo", { docsRepo: null })).toBe("/repo/docs");
		expect(resolveDocsPath("/repo", { docsRepo: { url: "https://h/kb.git" } })).toBe("/repo/docs");
		expect(resolveKainbainDir("/repo", {})).toBe("/repo/.kainbain");
		expect(resolveProjectConfigPath("/repo", {})).toBe("/repo/.kainbain/project.json");
		expect(resolveDocsPath("", {})).toBeNull();
		expect(resolveKainbainDir("", {})).toBeNull();
	});
});
