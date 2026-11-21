// Domain: The Flow — unit tests for the runner gitFailure boundary sanitizer.
import { describe, it, expect } from "vitest";
import { sanitizeGitFailure } from "./sanitizeGitFailure.js";

const VALID = {
	kind: "hook-rejected",
	phase: "stage-commit",
	command: "git commit -m stage",
	exitCode: 1,
	hookName: "pre-commit",
	files: ["docs/tasks/t1/assets/a.png", "shot.png"],
	hookOutput: "binary-guard check FAILED (2 corrupt binaries):\n  a.png: expected magic 89504e47, found efbfbd",
	remedy: "Re-capture each corrupt file, then retry the stage.",
	summary: "Commit blocked by pre-commit hook: 2 corrupt files",
};

describe("The Flow: sanitizeGitFailure", () => {
	it("keeps a valid envelope with every field intact", () => {
		expect(sanitizeGitFailure({ ...VALID })).toMatchObject({
			kind: "hook-rejected",
			phase: "stage-commit",
			command: "git commit -m stage",
			exitCode: 1,
			hookName: "pre-commit",
			files: ["docs/tasks/t1/assets/a.png", "shot.png"],
			remedy: "Re-capture each corrupt file, then retry the stage.",
			summary: "Commit blocked by pre-commit hook: 2 corrupt files",
		});
	});

	it("returns null for absent or malformed payloads", () => {
		for (const raw of [undefined, null, "hook-rejected", 42, ["hook-rejected"], {}, { kind: "" }, { kind: "   " }, { files: [] }]) {
			expect(sanitizeGitFailure(raw)).toBeNull();
		}
	});

	it("tolerates unknown fields and keeps unknown kinds verbatim", () => {
		const out = sanitizeGitFailure({ ...VALID, kind: "future-kind", extra: { nested: true } });
		expect(out.kind).toBe("future-kind");
		expect(out).not.toHaveProperty("extra");
	});

	it("degrades unknown phases to null instead of guessing", () => {
		expect(sanitizeGitFailure({ ...VALID, phase: "mystery" }).phase).toBeNull();
	});

	it("caps hook output and the file list with truncation markers", () => {
		const out = sanitizeGitFailure({
			...VALID,
			hookOutput: `x\n${"y".repeat(20000)}`,
			files: Array.from({ length: 60 }, (_, i) => `f${i}.png`),
		});
		expect(out.hookOutput.length).toBeLessThanOrEqual(8000 + 60);
		expect(out.hookOutput).toMatch(/truncated/);
		expect(out.truncatedOutput).toBe(true);
		expect(out.files).toHaveLength(50);
		expect(out.truncatedFiles).toBe(true);
	});

	it("redacts secrets in every string field, including file entries", () => {
		const out = sanitizeGitFailure({
			...VALID,
			hookOutput: "hook said Bearer abcdefghijklmnop — see https://x",
			remedy: "use Bearer abcdefghijklmnop",
			files: ["ok.png", 42, null, "Bearer abcdefghijklmnop"],
		});
		expect(out.hookOutput).toContain("Bearer [REDACTED]");
		expect(out.hookOutput).not.toContain("abcdefghijklmnop");
		expect(out.remedy).toContain("Bearer [REDACTED]");
		expect(out.files).toEqual(["ok.png", "Bearer [REDACTED]"]);
	});

	it("derives the one-line summary when the runner omitted it", () => {
		const { summary, ...rest } = VALID;
		const out = sanitizeGitFailure(rest);
		expect(out.summary).toContain("pre-commit hook");
		expect(out.summary).toContain("a.png");
	});

	it("is idempotent: re-sanitizing a clean envelope returns an equal envelope", () => {
		const once = sanitizeGitFailure({ ...VALID });
		expect(sanitizeGitFailure(once)).toEqual(once);
	});
});
