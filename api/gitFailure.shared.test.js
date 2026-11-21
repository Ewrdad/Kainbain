import { describe, it, expect } from "vitest";
import {
	GIT_FAILURE_KINDS,
	GIT_FAILURE_LIMITS,
	GIT_FAILURE_PARK_AFTER,
	GIT_FAILURE_PHASES,
	buildGitFailureDetails,
	gitFailureSignature,
	isDeterministicGitFailure,
	parseHookFailure,
	summarizeGitFailure,
} from "../shared/gitFailure.js";

// The shared commit/hook-failure contract: the parser, the envelope
// builder, the determinism predicate, and the streak signature live in
// shared/gitFailure/ so the runner, the backend, and the UI classify
// identically. These tests pin the binary-guard output shape, the foreign
// hook degradation, the transport caps, and the kind taxonomy.

const GUARD_STDERR = [
	"binary-guard check FAILED (3 corrupt binaries):",
	"  docs/tasks/t1/assets/a.png: expected magic 89504e47, found efbfbd50 (binary file was rewritten through a text path — never create, edit, or restore binaries with text tools; re-capture via node scripts/capture-screenshot.mjs --out docs/tasks/t1/assets/a.png or restore binary-safely via git checkout <ref> -- docs/tasks/t1/assets/a.png, then re-verify with xxd -l 8 and file)",
	"  docs/tasks/t1/assets/b.png: expected magic 89504e47, found efbfbd50 (binary file was rewritten through a text path — never create, edit, or restore binaries with text tools; re-capture via node scripts/capture-screenshot.mjs --out docs/tasks/t1/assets/b.png or restore binary-safely via git checkout <ref> -- docs/tasks/t1/assets/b.png, then re-verify with xxd -l 8 and file)",
	"  shot.png: expected magic 89504e47, found (empty or unreadable head) (binary file was rewritten through a text path — never create, edit, or restore binaries with text tools; re-capture via node scripts/capture-screenshot.mjs --out shot.png or restore binary-safely via git checkout <ref> -- shot.png, then re-verify with xxd -l 8 and file)",
	"pre-commit: binary guard rejected staged binaries (see above for the file and the safe remedy).",
].join("\n");

describe("parseHookFailure", () => {
	it("reads binary-guard output into kind, hook name, files, and remedy", () => {
		const parsed = parseHookFailure({ command: "git commit -m x", exitCode: 1, stdout: "", stderr: GUARD_STDERR });
		expect(parsed.kind).toBe("hook-rejected");
		expect(parsed.hookName).toBe("pre-commit");
		expect(parsed.files).toEqual(["docs/tasks/t1/assets/a.png", "docs/tasks/t1/assets/b.png", "shot.png"]);
		expect(parsed.hookOutput).toContain("binary-guard check FAILED");
		expect(parsed.remedy).toContain("capture-screenshot.mjs");
		expect(parsed.remedy).toContain("--no-verify");
	});

	it("degrades gracefully on a foreign hook with arbitrary stderr", () => {
		const parsed = parseHookFailure({ command: "git commit -m x", exitCode: 1, stdout: "", stderr: "my-hook: nope, custom policy says no\nsecond line" });
		expect(parsed.kind).toBe("hook-rejected");
		expect(parsed.hookName).toBe("unknown");
		expect(parsed.files).toEqual([]);
		expect(parsed.hookOutput).toContain("custom policy says no");
		expect(parsed.remedy).toContain("Inspect the hook output");
	});

	it("names a foreign hook when its stderr carries a known hook name", () => {
		const parsed = parseHookFailure({ command: "git commit -m x", exitCode: 1, stdout: "", stderr: "pre-push: branch is protected, push denied" });
		expect(parsed.kind).toBe("hook-rejected");
		expect(parsed.hookName).toBe("pre-push");
	});

	it("reads hook-less commit output as a plain commit failure", () => {
		const parsed = parseHookFailure({ command: "git commit -m x", exitCode: 128, stdout: "", stderr: "Author identity unknown\n\nPlease tell me who you are" });
		expect(parsed.kind).toBe("commit-failed");
		expect(parsed.hookName).toBeNull();
		expect(parsed.files).toEqual([]);
		expect(parsed.hookOutput).toContain("Author identity unknown");
	});

	it("never throws on garbage input", () => {
		expect(() => parseHookFailure()).not.toThrow();
		expect(() => parseHookFailure(null)).not.toThrow();
		expect(() => parseHookFailure({ stdout: 42, stderr: { toString: () => { throw new Error("boom"); } } })).not.toThrow();
		const parsed = parseHookFailure({ stdout: 42, stderr: null });
		expect(parsed.kind).toBe("commit-failed");
		expect(parsed.hookOutput).toBe("42");
	});
});

describe("summarizeGitFailure", () => {
	it("names the hook, count, and files for a guard rejection", () => {
		expect(
			summarizeGitFailure({ kind: "hook-rejected", hookName: "pre-commit", files: ["a.png", "b.png"], exitCode: 1 }),
		).toBe("Commit blocked by pre-commit hook: 2 corrupt files: a.png, b.png");
	});

	it("collapses long file lists with an and-more tail", () => {
		const files = ["a.png", "b.png", "c.png", "d.png", "e.png", "f.png", "g.png"];
		const summary = summarizeGitFailure({ kind: "hook-rejected", hookName: "pre-commit", files, exitCode: 1 });
		expect(summary).toContain("7 corrupt files");
		expect(summary).toContain("and 2 more");
		expect(summary.length).toBeLessThanOrEqual(GIT_FAILURE_LIMITS.summary);
	});

	it("falls back to the first output line when no files were parsed", () => {
		const summary = summarizeGitFailure({ kind: "hook-rejected", hookName: "unknown", files: [], exitCode: 1, hookOutput: "my-hook: nope\nsecond" });
		expect(summary).toBe("Commit blocked by git hook (exit 1): my-hook: nope");
	});

	it("summarizes merge conflicts with their file list", () => {
		expect(
			summarizeGitFailure({ kind: "merge-conflict", files: ["a.txt", "b.txt"], exitCode: 1 }),
		).toBe("Merge conflicts in: a.txt, b.txt — resolve the conflicts and retry");
	});

	it("degrades unknown kinds without throwing", () => {
		expect(summarizeGitFailure({ kind: "push-failed", exitCode: 128, hookOutput: "boom" })).toBe(
			"Git operation failed (exit 128): boom",
		);
		expect(summarizeGitFailure()).toContain("Git operation failed");
	});
});

describe("buildGitFailureDetails", () => {
	it("builds the full envelope with a derived summary", () => {
		const details = buildGitFailureDetails({
			phase: "recovery",
			command: "git commit -m recovery",
			exitCode: 1,
			...parseHookFailure({ exitCode: 1, stderr: GUARD_STDERR }),
		});
		expect(details.kind).toBe("hook-rejected");
		expect(details.phase).toBe("recovery");
		expect(details.command).toBe("git commit -m recovery");
		expect(details.exitCode).toBe(1);
		expect(details.hookName).toBe("pre-commit");
		expect(details.files).toHaveLength(3);
		expect(details.summary).toBe(
			"Commit blocked by pre-commit hook: 3 corrupt files: docs/tasks/t1/assets/a.png, docs/tasks/t1/assets/b.png, shot.png",
		);
		expect(details.truncatedFiles).toBe(false);
		expect(details.truncatedOutput).toBe(false);
	});

	it("caps hook output with an explicit truncation marker", () => {
		const big = `binary-guard check FAILED (1 corrupt binary):\nx.png: expected magic 1, found 2\n${"y".repeat(20000)}`;
		const details = buildGitFailureDetails({
			phase: "stage-commit",
			command: "git commit -m x",
			exitCode: 1,
			...parseHookFailure({ exitCode: 1, stderr: big }),
		});
		expect(details.hookOutput.length).toBeLessThanOrEqual(GIT_FAILURE_LIMITS.hookOutput + 60);
		expect(details.hookOutput).toContain("…[truncated ");
		expect(details.truncatedOutput).toBe(true);
	});

	it("caps the file list at fifty with a truncation flag", () => {
		const files = Array.from({ length: 60 }, (_, i) => `f${i}.png`);
		const details = buildGitFailureDetails({ phase: "stage-commit", command: "git commit", exitCode: 1, kind: "hook-rejected", hookName: "pre-commit", files, hookOutput: "x", remedy: "y" });
		expect(details.files).toHaveLength(50);
		expect(details.truncatedFiles).toBe(true);
	});

	it("keeps a caller summary override (the merge path words its own)", () => {
		const details = buildGitFailureDetails({
			phase: "merge",
			command: "git merge origin/kb/t",
			exitCode: 1,
			kind: "merge-conflict",
			files: ["a.txt"],
			hookOutput: "CONFLICT (content): Merge conflict in a.txt",
			remedy: "resolve a.txt",
			summary: "Merge conflicts in: a.txt — resolve on 'kb/t' and retry the merge stage",
		});
		expect(details.summary).toBe("Merge conflicts in: a.txt — resolve on 'kb/t' and retry the merge stage");
	});

	it("degrades unknown phases to null and garbage to commit-failed", () => {
		expect(buildGitFailureDetails({ phase: "nope" }).phase).toBeNull();
		expect(buildGitFailureDetails({ phase: "merge" }).phase).toBe("merge");
		const empty = buildGitFailureDetails();
		expect(empty.kind).toBe("commit-failed");
		expect(empty.files).toEqual([]);
		expect(empty.exitCode).toBeNull();
		expect(empty.summary).toContain("Commit failed");
	});
});

describe("isDeterministicGitFailure", () => {
	it("parks hook, commit, and merge rejections but not push/auth or unknown", () => {
		expect(isDeterministicGitFailure("hook-rejected")).toBe(true);
		expect(isDeterministicGitFailure("commit-failed")).toBe(true);
		expect(isDeterministicGitFailure("merge-conflict")).toBe(true);
		expect(isDeterministicGitFailure("push-failed")).toBe(false);
		expect(isDeterministicGitFailure("auth-failed")).toBe(false);
		expect(isDeterministicGitFailure("bogus")).toBe(false);
		expect(isDeterministicGitFailure({ kind: "hook-rejected" })).toBe(true);
		expect(isDeterministicGitFailure(null)).toBe(false);
		expect(isDeterministicGitFailure()).toBe(false);
	});
});

describe("gitFailureSignature", () => {
	it("keys on kind, hook, phase, and files", () => {
		expect(
			gitFailureSignature({ kind: "hook-rejected", hookName: "pre-commit", phase: "recovery", files: ["a.png"] }),
		).toBe("hook-rejected|pre-commit|recovery|a.png");
		expect(gitFailureSignature({ kind: "commit-failed" })).toBe("commit-failed|||");
		expect(gitFailureSignature()).toBe("|||");
		expect(gitFailureSignature(null)).toBe("");
	});
});

describe("taxonomy", () => {
	it("pins the kind, phase, and parking constants", () => {
		expect(GIT_FAILURE_KINDS).toEqual({
			HOOK_REJECTED: "hook-rejected",
			COMMIT_FAILED: "commit-failed",
			MERGE_CONFLICT: "merge-conflict",
			PUSH_FAILED: "push-failed",
			AUTH_FAILED: "auth-failed",
		});
		expect(GIT_FAILURE_PHASES).toEqual({
			WORKTREE_SETUP: "worktree-setup",
			RECOVERY: "recovery",
			STAGE_COMMIT: "stage-commit",
			MERGE: "merge",
		});
		expect(GIT_FAILURE_LIMITS).toEqual({ hookOutput: 8000, files: 50, command: 500, remedy: 2000, summary: 300 });
		expect(GIT_FAILURE_PARK_AFTER).toBe(3);
	});
});
