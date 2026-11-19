import { describe, it, expect } from "vitest";
import {
	DOCS_REPO_BRANCH_MODE_SYNCED,
	isValidDocsRepoUrl,
	isValidDocsRepoLocalPath,
	hasDocsRepo,
	resolveDocsRepoLocalPath,
	docsRepoUrlFor,
	resolveKainbainHome,
	normalizeDocsRepoSettings,
	assertValidDocsRepoForWrite,
} from "./docsRepo.js";

/**
 * MARK: docsRepo unit tests
 * @description Validation matrix, tolerant load, strict write, redaction,
 *   and the `resolveKainbainHome` seam for the separate docs repo.
 */
describe("isValidDocsRepoUrl", () => {
	it("accepts https, ssh, file, scp-like and absolute-path remotes", () => {
		expect(isValidDocsRepoUrl("https://git.example.com/me/proj-kb.git")).toBe(true);
		expect(isValidDocsRepoUrl("ssh://git@git.example.com/me/proj-kb.git")).toBe(true);
		expect(isValidDocsRepoUrl("git@github.com:me/proj-kb.git")).toBe(true);
		expect(isValidDocsRepoUrl("file:///srv/git/proj-kb.git")).toBe(true);
		expect(isValidDocsRepoUrl("/srv/git/proj-kb.git")).toBe(true);
	});

	it("rejects non-strings, blanks, whitespace and non-URL strings", () => {
		expect(isValidDocsRepoUrl(null)).toBe(false);
		expect(isValidDocsRepoUrl(42)).toBe(false);
		expect(isValidDocsRepoUrl("   ")).toBe(false);
		expect(isValidDocsRepoUrl("not a url")).toBe(false);
		expect(isValidDocsRepoUrl("https://git.example.com/a b.git")).toBe(false);
		expect(isValidDocsRepoUrl("https://git.example.com/\x00.git")).toBe(false);
		expect(isValidDocsRepoUrl("x".repeat(2049))).toBe(false);
	});
});

describe("isValidDocsRepoLocalPath", () => {
	it("accepts absolute paths only", () => {
		expect(isValidDocsRepoLocalPath("/srv/kainbain-docs/proj")).toBe(true);
		expect(isValidDocsRepoLocalPath("relative/path")).toBe(false);
		expect(isValidDocsRepoLocalPath("~/kb/proj")).toBe(false);
		expect(isValidDocsRepoLocalPath("")).toBe(false);
		expect(isValidDocsRepoLocalPath(null)).toBe(false);
	});
});

describe("hasDocsRepo / resolveDocsRepoLocalPath / docsRepoUrlFor", () => {
	it("legacy and garbage records have no docs repo", () => {
		expect(hasDocsRepo(undefined)).toBe(false);
		expect(hasDocsRepo({})).toBe(false);
		expect(hasDocsRepo({ docsRepo: null })).toBe(false);
		expect(hasDocsRepo({ docsRepo: "nope" })).toBe(false);
		expect(hasDocsRepo({ docsRepo: {} })).toBe(false);
		expect(hasDocsRepo({ docsRepo: { url: "not a url" } })).toBe(false);
	});

	it("url-only and path-only repos count", () => {
		expect(hasDocsRepo({ docsRepo: { url: "https://h/kb.git" } })).toBe(true);
		expect(hasDocsRepo({ docsRepo: { localPath: "/srv/kb" } })).toBe(true);
	});

	it("resolves the local path absolute and redacts the URL", () => {
		const p = { docsRepo: { url: "https://token123@git.example.com/me/kb.git", localPath: "/srv/kb/proj/" } };
		expect(resolveDocsRepoLocalPath(p)).toBe("/srv/kb/proj");
		expect(docsRepoUrlFor(p)).toBe("https://git.example.com/me/kb.git");
		expect(resolveDocsRepoLocalPath({})).toBeNull();
		expect(docsRepoUrlFor({})).toBeNull();
	});
});

describe("resolveKainbainHome", () => {
	it("legacy projects resolve to the cwd", () => {
		expect(resolveKainbainHome("/repo", {})).toBe("/repo");
		expect(resolveKainbainHome("/repo/", null)).toBe("/repo");
		expect(resolveKainbainHome("", {})).toBeNull();
		expect(resolveKainbainHome(null, undefined)).toBeNull();
	});

	it("docs-repo projects resolve to the docs checkout", () => {
		expect(
			resolveKainbainHome("/repo", { docsRepo: { localPath: "/srv/kb/proj" } }),
		).toBe("/srv/kb/proj");
		// url-only (no localPath yet) still resolves to the cwd
		expect(
			resolveKainbainHome("/repo", { docsRepo: { url: "https://h/kb.git" } }),
		).toBe("/repo");
	});
});

describe("normalizeDocsRepoSettings", () => {
	it("absent stays absent; garbage degrades to a clear (undefined)", () => {
		expect(normalizeDocsRepoSettings({})).toEqual({});
		expect(normalizeDocsRepoSettings(null)).toEqual({});
		expect(normalizeDocsRepoSettings({ docsRepo: "x" })).toEqual({ docsRepo: undefined });
		expect(normalizeDocsRepoSettings({ docsRepo: { url: "bad url" } })).toEqual({ docsRepo: undefined });
	});

	it("keeps valid fields, redacts the URL, fixes branchMode, resolves localPath", () => {
		expect(
			normalizeDocsRepoSettings({
				docsRepo: { url: "https://tok@git.example.com/me/kb.git", localPath: "/srv/kb/proj" },
			}),
		).toEqual({
			docsRepo: {
				url: "https://git.example.com/me/kb.git",
				localPath: "/srv/kb/proj",
				branchMode: DOCS_REPO_BRANCH_MODE_SYNCED,
			},
		});
	});

	it("drops invalid fields but keeps the valid one", () => {
		expect(
			normalizeDocsRepoSettings({ docsRepo: { url: "https://h/kb.git", localPath: "relative" } }),
		).toEqual({
			docsRepo: { url: "https://h/kb.git", branchMode: DOCS_REPO_BRANCH_MODE_SYNCED },
		});
	});

	it("is idempotent", () => {
		const once = normalizeDocsRepoSettings({ docsRepo: { url: "https://h/kb.git" } });
		expect(normalizeDocsRepoSettings({ docsRepo: once.docsRepo })).toEqual(once);
	});
});

describe("assertValidDocsRepoForWrite", () => {
	it("null/undefined/blank clears to undefined", () => {
		expect(assertValidDocsRepoForWrite(undefined)).toBeUndefined();
		expect(assertValidDocsRepoForWrite(null)).toBeUndefined();
		expect(assertValidDocsRepoForWrite({})).toBeUndefined();
		expect(assertValidDocsRepoForWrite({ url: "  ", localPath: "" })).toBeUndefined();
	});

	it("accepts and normalizes a valid repo, redacting the URL", () => {
		const out = assertValidDocsRepoForWrite({
			url: "https://tok@git.example.com/me/kb.git",
			localPath: "/srv/kb/proj",
		});
		expect(out).toEqual({
			url: "https://git.example.com/me/kb.git",
			localPath: "/srv/kb/proj",
			branchMode: DOCS_REPO_BRANCH_MODE_SYNCED,
		});
	});

	it("accepts a url-only repo", () => {
		expect(assertValidDocsRepoForWrite({ url: "git@github.com:me/kb.git" })).toEqual({
			url: "git@github.com:me/kb.git",
			branchMode: DOCS_REPO_BRANCH_MODE_SYNCED,
		});
	});

	it("throws 400 INVALID_DOCS_REPO_URL for a bad URL", () => {
		try {
			assertValidDocsRepoForWrite({ url: "not a url" });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("INVALID_DOCS_REPO_URL");
		}
	});

	it("throws 400 INVALID_DOCS_REPO_PATH for a relative path", () => {
		try {
			assertValidDocsRepoForWrite({ localPath: "relative/dir" });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("INVALID_DOCS_REPO_PATH");
		}
	});

	it("throws 400 INVALID_DOCS_REPO for non-object input", () => {
		try {
			assertValidDocsRepoForWrite("https://h/kb.git");
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("INVALID_DOCS_REPO");
		}
	});
});
