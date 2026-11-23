import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertDocsRepoSeparateFromMain } from "./assertDocsRepoSeparateFromMain.js";

/**
 * MARK: assertDocsRepoSeparateFromMain unit tests
 * @description The stealth guard: the docs repo must not be the main repo or
 *   live inside it (path), and its URL must differ from the main remote
 *   (URL). Absent inputs are a no-op; violations throw 400 with stable codes.
 */
describe("assertDocsRepoSeparateFromMain", () => {
	it("is a no-op for absent or empty inputs", () => {
		expect(() => assertDocsRepoSeparateFromMain()).not.toThrow();
		expect(() => assertDocsRepoSeparateFromMain({})).not.toThrow();
		expect(() => assertDocsRepoSeparateFromMain({ docsRepo: null, projectCwd: "/repo" })).not.toThrow();
		expect(() => assertDocsRepoSeparateFromMain({ docsRepo: { url: "https://h/kb.git" } })).not.toThrow();
	});

	it("accepts a docs checkout outside the main repo", () => {
		expect(() =>
			assertDocsRepoSeparateFromMain({
				docsRepo: { localPath: "/srv/kb/proj", url: "https://h/kb.git" },
				projectCwd: "/repo",
				mainRepoUrls: ["https://h/app.git"],
			}),
		).not.toThrow();
	});

	it("rejects a localPath equal to the main checkout", () => {
		expect(() =>
			assertDocsRepoSeparateFromMain({ docsRepo: { localPath: "/repo" }, projectCwd: "/repo" }),
		).toThrowError(/OUTSIDE the main project repo/);
		try {
			assertDocsRepoSeparateFromMain({ docsRepo: { localPath: "/repo" }, projectCwd: "/repo" });
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("INVALID_DOCS_REPO_PATH");
		}
	});

	it("rejects a localPath inside the main checkout (nested docs = main-repo traces)", () => {
		expect(() =>
			assertDocsRepoSeparateFromMain({
				docsRepo: { localPath: "/repo/.kainbain-docs" },
				projectCwd: "/repo",
			}),
		).toThrowError(/INVALID_DOCS_REPO_PATH|OUTSIDE/);
		try {
			assertDocsRepoSeparateFromMain({
				docsRepo: { localPath: path.join("/repo", "docs-repo") },
				projectCwd: "/repo",
			});
			throw new Error("should have thrown");
		} catch (err) {
			expect(err.code).toBe("INVALID_DOCS_REPO_PATH");
			expect(err.statusCode).toBe(400);
		}
	});

	it("rejects a localPath that wraps the main checkout", () => {
		expect(() =>
			assertDocsRepoSeparateFromMain({ docsRepo: { localPath: "/" }, projectCwd: "/repo" }),
		).toThrowError(/OUTSIDE the main project repo/);
	});

	it("catches a symlinked alias of the main repo via realpath", () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-docsrepo-guard-"));
		try {
			const real = path.join(tmp, "real-repo");
			fs.mkdirSync(real, { recursive: true });
			const link = path.join(tmp, "link-repo");
			fs.symlinkSync(real, link, "dir");
			// Lexically distinct, physically the same directory.
			expect(() =>
				assertDocsRepoSeparateFromMain({
					docsRepo: { localPath: path.join(link, "kb-docs") },
					projectCwd: real,
				}),
			).toThrowError(/OUTSIDE the main project repo/);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("rejects a docsRepo.url equal to the main repo URL (incl. .git / slash variants and credentials)", () => {
		const main = "https://git.example.com/team/app.git";
		for (const same of [
			main,
			"https://git.example.com/team/app",
			"https://git.example.com/team/app.git/",
			"https://user:secret@git.example.com/team/app.git",
		]) {
			try {
				assertDocsRepoSeparateFromMain({
					docsRepo: { url: same },
					projectCwd: "/repo",
					mainRepoUrls: [main],
				});
				throw new Error(`should have thrown for ${same}`);
			} catch (err) {
				expect(err.code).toBe("INVALID_DOCS_REPO_URL");
				expect(err.statusCode).toBe(400);
			}
		}
	});

	it("accepts a different docs URL and ignores blank main URL candidates", () => {
		expect(() =>
			assertDocsRepoSeparateFromMain({
				docsRepo: { url: "https://git.example.com/me/app-kb.git" },
				projectCwd: "/repo",
				mainRepoUrls: ["https://git.example.com/team/app.git", "", null, undefined],
			}),
		).not.toThrow();
	});
});
