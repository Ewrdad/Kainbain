/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { isPathSafe } from "./files.js";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so the fixture project can
// never touch the live projects root or the live SilverBullet notes space.
// Mirrors the mkdtemp + rmSync convention used by projectStore.test.js.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch (e) {
		// ignore cleanup error
	}
});

/***
 * MARK: Files API Integration & Security Tests
 * @description Verifies directory listing, file content retrieval, and path traversal security guards.
 ***/
describe("Files API Integration & Security Tests", () => {
	let tempProjectDir;
	let testProjectId;

	beforeAll(async () => {
		await app.ready();

		// Create a dedicated test project directory with subdirectories and files
		tempProjectDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-files-test-"),
		);
		fs.mkdirSync(path.join(tempProjectDir, "docs", "tasks", "task-1"), {
			recursive: true,
		});
		fs.mkdirSync(path.join(tempProjectDir, "src"), { recursive: true });

		fs.writeFileSync(
			path.join(tempProjectDir, "README.md"),
			"# Test Project\nWelcome to test project.",
			"utf8",
		);
		fs.writeFileSync(
			path.join(tempProjectDir, "src", "index.js"),
			"console.log('hello');",
			"utf8",
		);
		fs.writeFileSync(
			path.join(tempProjectDir, "docs", "tasks", "task-1", "task.md"),
			"# Task 1\nTask goal and details.",
			"utf8",
		);
		// Image-preview fixtures: a tiny valid PNG, an SVG, a zip-named binary,
		// an extensionless binary (null-byte sniff target), and an oversize file.
		const pngBytes = Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
			"base64",
		);
		fs.writeFileSync(path.join(tempProjectDir, "logo.png"), pngBytes);
		fs.writeFileSync(
			path.join(tempProjectDir, "icon.svg"),
			'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
			"utf8",
		);
		fs.writeFileSync(
			path.join(tempProjectDir, "archive.zip"),
			Buffer.concat([Buffer.from("PK\x03\x04"), Buffer.from([0x00, 0x01, 0x02])]),
		);
		fs.writeFileSync(
			path.join(tempProjectDir, "blob"),
			Buffer.concat([Buffer.from("binary"), Buffer.from([0x00, 0xff])]),
		);
		fs.writeFileSync(
			path.join(tempProjectDir, "big.bin"),
			Buffer.alloc(15 * 1024 * 1024 + 1, 7),
		);

		// Register the test project via API
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Files Test Project",
				cwd: tempProjectDir,
			},
		});
		const project = JSON.parse(res.payload);
		testProjectId = project.id;
	});

	afterAll(() => {
		try {
			fs.rmSync(tempProjectDir, { recursive: true, force: true });
		} catch (e) {
			// ignore cleanup error
		}
	});

	describe("isPathSafe helper", () => {
		it("accepts paths within project root", () => {
			expect(isPathSafe(tempProjectDir, tempProjectDir)).toBe(true);
			expect(
				isPathSafe(tempProjectDir, path.join(tempProjectDir, "docs", "task.md")),
			).toBe(true);
		});

		it("rejects path traversal attempts escaping project root", () => {
			expect(
				isPathSafe(tempProjectDir, path.join(tempProjectDir, "../../etc/passwd")),
			).toBe(false);
			expect(isPathSafe(tempProjectDir, "/etc/passwd")).toBe(false);
		});

		it("rejects symlinks pointing outside the project root", () => {
			const outsideTarget = path.join(os.tmpdir(), "kainbain-outside-target.txt");
			fs.writeFileSync(outsideTarget, "secret", "utf8");
			const symlinkPath = path.join(tempProjectDir, "external-link.txt");
			try {
				fs.symlinkSync(outsideTarget, symlinkPath);
				expect(isPathSafe(tempProjectDir, symlinkPath)).toBe(false);
				expect(isPathSafe(tempProjectDir, symlinkPath, [os.tmpdir()])).toBe(true);
			} finally {
				try {
					fs.unlinkSync(symlinkPath);
					fs.unlinkSync(outsideTarget);
				} catch {
					// ignore
				}
			}
		});
	});

	describe("GET /projects/:id/files", () => {
		it("lists directory entries at project root", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files`,
			});
			expect(res.statusCode).toBe(200);
			const data = JSON.parse(res.payload);
			expect(data.cwd).toBe(tempProjectDir);
			expect(data.currentPath).toBe("");
			expect(Array.isArray(data.entries)).toBe(true);

			const names = data.entries.map((e) => e.name);
			expect(names).toContain("README.md");
			expect(names).toContain("src");
			expect(names).toContain("docs");
		});

		it("lists entries in a subpath", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files?path=docs/tasks`,
			});
			expect(res.statusCode).toBe(200);
			const data = JSON.parse(res.payload);
			expect(data.currentPath).toBe("docs/tasks");
			const names = data.entries.map((e) => e.name);
			expect(names).toContain("task-1");
		});

		it("returns 403 Forbidden on path traversal attempts", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files?path=../../etc`,
			});
			expect(res.statusCode).toBe(403);
			expect(JSON.parse(res.payload).error).toContain(
				"Path traversal detected",
			);
		});

		it("returns 404 for a non-existent directory", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files?path=non-existent-subfolder`,
			});
			expect(res.statusCode).toBe(404);
		});

		it("returns 400 when path is a file, not a directory", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files?path=README.md`,
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).error).toContain(
				"Target path is not a directory",
			);
		});

		it("returns 404 for unknown project", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/projects/unknown-proj-id/files",
			});
			expect(res.statusCode).toBe(404);
		});
	});

	describe("GET /projects/:id/files/content", () => {
		it("reads UTF-8 text file content", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=README.md`,
			});
			expect(res.statusCode).toBe(200);
			const data = JSON.parse(res.payload);
			expect(data.name).toBe("README.md");
			expect(data.path).toBe("README.md");
			expect(data.content).toContain("# Test Project");
			expect(data.extension).toBe(".md");
			expect(data.size).toBeGreaterThan(0);
		});

		it("reads markdown file in nested docs path", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=docs/tasks/task-1/task.md`,
			});
			expect(res.statusCode).toBe(200);
			const data = JSON.parse(res.payload);
			expect(data.name).toBe("task.md");
			expect(data.content).toContain("# Task 1");
		});

		it("returns 403 Forbidden on path traversal reading", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=../../etc/passwd`,
			});
			expect(res.statusCode).toBe(403);
			expect(JSON.parse(res.payload).error).toContain(
				"Path traversal detected",
			);
		});

		it("returns 404 for non-existent file", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=docs/missing.md`,
			});
			expect(res.statusCode).toBe(404);
		});

		it("returns 400 when reading directory as file", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=src`,
			});
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.payload).error).toContain("directory, not a file");
		});

	
		it("refuses image files with 415 and a raw preview URL", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=logo.png`,
			});
			expect(res.statusCode).toBe(415);
			const data = JSON.parse(res.payload);
			expect(data.kind).toBe("image");
			expect(data.mime).toBe("image/png");
			expect(data.size).toBeGreaterThan(0);
			expect(data.previewUrl).toContain(`/projects/${testProjectId}/files/raw`);
			expect(data.previewUrl).toContain("logo.png");
		});

		it("refuses known binary extensions with 415", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=archive.zip`,
			});
			expect(res.statusCode).toBe(415);
			const data = JSON.parse(res.payload);
			expect(data.kind).toBe("unsupported-binary");
		});

		it("sniffs null bytes in extensionless binaries with 415", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=blob`,
			});
			expect(res.statusCode).toBe(415);
			expect(JSON.parse(res.payload).kind).toBe("unsupported-binary");
		});

		it("reports kind and mime on successful text reads", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content?path=README.md`,
			});
			expect(res.statusCode).toBe(200);
			const data = JSON.parse(res.payload);
			expect(data.kind).toBe("markdown");
			expect(data.mime).toBe("application/octet-stream");
			expect(data.content).toContain("# Test Project");
		});

		it("reports kind and mime on directory listings", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files`,
			});
			expect(res.statusCode).toBe(200);
			const data = JSON.parse(res.payload);
			const readme = data.entries.find((e) => e.name === "README.md");
			expect(readme.kind).toBe("markdown");
			const logo = data.entries.find((e) => e.name === "logo.png");
			expect(logo.kind).toBe("image");
			expect(logo.mime).toBe("image/png");
			const src = data.entries.find((e) => e.name === "src");
			expect(src.kind).toBe("directory");
			expect(src.mime).toBeNull();
		});

		it("returns 400 when path parameter is missing", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/content`,
			});
			expect(res.statusCode).toBe(400);
		});
	});

	describe("GET /projects/:id/files/raw", () => {
		it("serves exact image bytes with image headers", async () => {
			const onDisk = fs.readFileSync(path.join(tempProjectDir, "logo.png"));
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=logo.png`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.headers["content-type"]).toBe("image/png");
			expect(res.headers["content-disposition"]).toContain('inline; filename="logo.png"');
			expect(res.headers["x-content-type-options"]).toBe("nosniff");
			expect(res.headers["cache-control"]).toContain("private");
			expect(Number(res.headers["content-length"])).toBe(onDisk.length);
			expect(Buffer.compare(res.rawPayload, onDisk)).toBe(0);
		});

		it("serves SVG with a sandbox CSP so embedded scripts never run", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=icon.svg`,
			});
			expect(res.statusCode).toBe(200);
			expect(res.headers["content-type"]).toBe("image/svg+xml");
			expect(res.headers["content-security-policy"]).toBe("sandbox");
		});

		it("serves text files byte-identical for the download fallback", async () => {
			const onDisk = fs.readFileSync(path.join(tempProjectDir, "README.md"));
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=README.md`,
			});
			expect(res.statusCode).toBe(200);
			expect(Buffer.compare(res.rawPayload, onDisk)).toBe(0);
		});

		it("returns 413 for files over the preview cap", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=big.bin`,
			});
			expect(res.statusCode).toBe(413);
			const data = JSON.parse(res.payload);
			expect(data.size).toBe(15 * 1024 * 1024 + 1);
		});

		it("returns 403 Forbidden on path traversal", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=../../etc/passwd`,
			});
			expect(res.statusCode).toBe(403);
		});

		it("rejects symlinks escaping the project root", async () => {
			const outsideTarget = path.join(os.tmpdir(), "kainbain-raw-outside.bin");
			fs.writeFileSync(outsideTarget, Buffer.from([0x89, 0x50, 0x00]));
			const symlinkPath = path.join(tempProjectDir, "escape.png");
			try {
				fs.symlinkSync(outsideTarget, symlinkPath);
				const res = await app.inject({
					method: "GET",
					url: `/projects/${testProjectId}/files/raw?path=escape.png`,
				});
				expect(res.statusCode).toBe(403);
			} finally {
				try {
					fs.unlinkSync(symlinkPath);
					fs.unlinkSync(outsideTarget);
				} catch {
					// ignore
				}
			}
		});

		it("returns 404 for a missing file", async () => {
			const res = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=nope.png`,
			});
			expect(res.statusCode).toBe(404);
		});

		it("returns 400 when reading a directory or omitting path", async () => {
			const dirRes = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw?path=src`,
			});
			expect(dirRes.statusCode).toBe(400);
			const missingRes = await app.inject({
				method: "GET",
				url: `/projects/${testProjectId}/files/raw`,
			});
			expect(missingRes.statusCode).toBe(400);
		});

		it("returns 404 for an unknown project", async () => {
			const res = await app.inject({
				method: "GET",
				url: "/projects/unknown-proj-id/files/raw?path=logo.png",
			});
			expect(res.statusCode).toBe(404);
		});
	});
});
