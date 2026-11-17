import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { listTaskDocsFiles } from "./taskDocsFiles.js";

describe("listTaskDocsFiles", () => {
	let tempRoot;

	beforeAll(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-docs-files-"));
	});

	afterAll(() => {
		try {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
	});

	const makeTaskDir = (taskId, files, docsDirName = "docs") => {
		const dir = path.join(tempRoot, docsDirName, "tasks", taskId);
		fs.mkdirSync(dir, { recursive: true });
		for (const [name, content] of Object.entries(files)) {
			if (name.includes("/")) {
				const sub = path.join(dir, path.dirname(name));
				fs.mkdirSync(sub, { recursive: true });
			}
			fs.writeFileSync(path.join(dir, name), content ?? name);
		}
		return dir;
	};

	const touch = (dir, name, mtimeMs) => {
		const target = path.join(dir, name);
		const atime = new Date(mtimeMs);
		fs.utimesSync(target, atime, atime);
	};

	it("lists top-level files newest-first, excluding task.md and subdirectories", () => {
		const taskId = "task-list-1";
		const dir = makeTaskDir(taskId, {
			"SURVEY.md": "survey",
			"task.md": "metadata",
			"photo.png": "bytes",
			"MY_NOTES.md": "notes",
		});
		fs.mkdirSync(path.join(dir, "assets"));
		fs.writeFileSync(path.join(dir, "assets", "nested.png"), "nested");
		touch(dir, "SURVEY.md", 3000);
		touch(dir, "photo.png", 2000);
		touch(dir, "MY_NOTES.md", 1000);

		const { files, dirExists } = listTaskDocsFiles(tempRoot, taskId);
		expect(dirExists).toBe(true);
		expect(files.map((f) => f.filename)).toEqual([
			"SURVEY.md",
			"photo.png",
			"MY_NOTES.md",
		]);
		expect(files[0]).toMatchObject({
			filename: "SURVEY.md",
			path: `./docs/tasks/${taskId}/SURVEY.md`,
		});
		expect(typeof files[0].mtimeMs).toBe("number");
	});

	it("breaks mtime ties by filename", () => {
		const taskId = "task-tie-1";
		const dir = makeTaskDir(taskId, { "b.md": "b", "a.md": "a" });
		touch(dir, "b.md", 5000);
		touch(dir, "a.md", 5000);

		const { files } = listTaskDocsFiles(tempRoot, taskId);
		expect(files.map((f) => f.filename)).toEqual(["a.md", "b.md"]);
	});

	it("honours a custom docsDirName in paths", () => {
		const taskId = "task-custom-1";
		makeTaskDir(taskId, { "NOTE.md": "n" }, "kainbain-docs");
		const { files, dirExists, docsDirName } = listTaskDocsFiles(tempRoot, taskId, {
			docsDirName: "kainbain-docs",
		});
		expect(dirExists).toBe(true);
		expect(docsDirName).toBe("kainbain-docs");
		expect(files[0].path).toBe(`./kainbain-docs/tasks/${taskId}/NOTE.md`);
	});

	it("returns dirExists false for a missing folder without throwing", () => {
		const { files, dirExists } = listTaskDocsFiles(tempRoot, "task-nope-missing");
		expect(dirExists).toBe(false);
		expect(files).toEqual([]);
	});

	it("rejects traversal taskIds", () => {
		for (const taskId of ["../escape", "a/b", "/etc", "..\\escape"]) {
			const { files, dirExists } = listTaskDocsFiles(tempRoot, taskId);
			expect(dirExists).toBe(false);
			expect(files).toEqual([]);
		}
	});

	it("lists links that resolve to a file and omits broken or directory links", () => {
		const taskId = "task-links-1";
		const dir = makeTaskDir(taskId, { "REAL.md": "real" });
		fs.mkdirSync(path.join(dir, "assets"));
		fs.symlinkSync(
			path.join(dir, "REAL.md"),
			path.join(dir, "LINK.md"),
		);
		fs.symlinkSync(
			path.join(dir, "does-not-exist.md"),
			path.join(dir, "BROKEN.md"),
		);
		fs.symlinkSync(path.join(dir, "assets"), path.join(dir, "DIRLINK.md"));

		const { files, dirExists } = listTaskDocsFiles(tempRoot, taskId);
		expect(dirExists).toBe(true);
		const filenames = files.map((f) => f.filename);
		expect(filenames).toContain("REAL.md");
		expect(filenames).toContain("LINK.md");
		expect(filenames).not.toContain("BROKEN.md");
		expect(filenames).not.toContain("DIRLINK.md");
		expect(filenames).not.toContain("assets");
	});

	it("omits entries that cannot be stat'ed instead of listing a phantom", () => {
		const taskId = "task-statfail-1";
		makeTaskDir(taskId, { "GOOD.md": "good", "GONE.md": "gone" });
		const realStatSync = fs.statSync;
		const statSpy = vi
			.spyOn(fs, "statSync")
			.mockImplementation(((target, ...rest) => {
				if (String(target).endsWith(`${path.sep}GONE.md`)) {
					throw new Error("ENOENT: raced deletion");
				}
				return realStatSync(target, ...rest);
			}));
		try {
			const { files } = listTaskDocsFiles(tempRoot, taskId);
			expect(files.map((f) => f.filename)).toEqual(["GOOD.md"]);
		} finally {
			statSpy.mockRestore();
		}
	});

	it("returns dirExists false for missing cwd or taskId without throwing", () => {
		expect(listTaskDocsFiles("", "t").files).toEqual([]);
		expect(listTaskDocsFiles(tempRoot, "").dirExists).toBe(false);
		expect(listTaskDocsFiles(null, null).dirExists).toBe(false);
	});
});
