import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
	isAllowedImageExt,
	imageMediaType,
	sanitizeImageName,
	dedupeImageName,
	taskAssetDir,
	resolveTaskAssetFile,
	taskAssetRelPath,
	listTaskImages,
	collectTaskImageRefs,
	writeTaskImage,
	deleteTaskImage,
} from "./taskAssets.js";

describe("taskAssets helpers", () => {
	let tempRoot;

	beforeAll(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-assets-"));
	});

	afterAll(() => {
		try {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
	});

	describe("isAllowedImageExt / imageMediaType", () => {
		it("accepts the allowlisted extensions case-insensitively", () => {
			for (const ext of ["png", "jpg", "jpeg", "gif", "webp"]) {
				expect(isAllowedImageExt(`photo.${ext}`)).toBe(true);
				expect(isAllowedImageExt(`photo.${ext.toUpperCase()}`)).toBe(true);
			}
		});

		it("rejects non-image and dangerous extensions", () => {
			expect(isAllowedImageExt("payload.svg")).toBe(false);
			expect(isAllowedImageExt("report.md")).toBe(false);
			expect(isAllowedImageExt("shell.sh")).toBe(false);
			expect(isAllowedImageExt("noext")).toBe(false);
			expect(isAllowedImageExt("")).toBe(false);
			expect(isAllowedImageExt(null)).toBe(false);
		});

		it("maps extensions to their served Content-Type", () => {
			expect(imageMediaType("a.png")).toBe("image/png");
			expect(imageMediaType("a.JPG")).toBe("image/jpeg");
			expect(imageMediaType("a.jpeg")).toBe("image/jpeg");
			expect(imageMediaType("a.gif")).toBe("image/gif");
			expect(imageMediaType("a.webp")).toBe("image/webp");
			expect(imageMediaType("a.svg")).toBe(null);
			expect(imageMediaType("a.txt")).toBe(null);
		});
	});

	describe("sanitizeImageName", () => {
		it("strips directory components and traversal payloads", () => {
			expect(sanitizeImageName("../../etc/passwd.png")).toBe("passwd.png");
			expect(sanitizeImageName("..\\..\\evil.png")).toBe("evil.png");
			expect(sanitizeImageName("/abs/path/photo.png")).toBe("photo.png");
			expect(sanitizeImageName("docs/tasks/x/../../out.png")).toBe("out.png");
		});

		it("collapses unsafe characters and trims separators", () => {
			expect(sanitizeImageName("My Screenshot (1).PNG")).toBe(
				"my-screenshot-1.png",
			);
			expect(sanitizeImageName("..leading-dots.png")).toBe("leading-dots.png");
			expect(sanitizeImageName("trailing..")).toBe("trailing");
			expect(sanitizeImageName("--weird--name--.png")).toBe("weird-name.png");
		});

		it("normalizes unicode and drops names with nothing usable", () => {
			expect(sanitizeImageName("café latte.png")).toBe("cafe-latte.png");
			expect(sanitizeImageName("..")).toBe("");
			expect(sanitizeImageName(".")).toBe("");
			expect(sanitizeImageName("")).toBe("");
			expect(sanitizeImageName(null)).toBe("");
		});

		it("caps the length while preserving the extension", () => {
			const long = `${"a".repeat(200)}.png`;
			const sanitized = sanitizeImageName(long);
			expect(sanitized.length).toBe(120);
			expect(sanitized.endsWith(".png")).toBe(true);
		});
	});

	describe("dedupeImageName", () => {
		it("passes through a name with no collision", () => {
			expect(dedupeImageName(["b.png"], "a.png")).toBe("a.png");
			expect(dedupeImageName([], "a.png")).toBe("a.png");
		});

		it("suffixes colliding names (-2, -3, …) preserving the extension", () => {
			expect(dedupeImageName(["a.png"], "a.png")).toBe("a-2.png");
			expect(dedupeImageName(["a.png", "a-2.png"], "a.png")).toBe("a-3.png");
			expect(dedupeImageName(["a.png"], "A.PNG")).toBe("A-2.PNG");
		});
	});

	describe("taskAssetDir / resolveTaskAssetFile", () => {
		it("places assets inside docs/tasks/<taskId>/assets", () => {
			expect(taskAssetDir(tempRoot, "task-1")).toBe(
				path.join(tempRoot, "docs", "tasks", "task-1", "assets"),
			);
		});

		it("rejects traversal task ids", () => {
			expect(taskAssetDir(tempRoot, "../escape")).toBeNull();
			expect(taskAssetDir(tempRoot, "")).toBeNull();
			expect(taskAssetDir(tempRoot, null)).toBeNull();
			expect(taskAssetDir("", "task-1")).toBeNull();
		});

		it("resolves asset files only for already-sanitized flat names", () => {
			expect(resolveTaskAssetFile(tempRoot, "task-1", "a.png")).toBe(
				path.join(tempRoot, "docs", "tasks", "task-1", "assets", "a.png"),
			);
			expect(resolveTaskAssetFile(tempRoot, "task-1", "../a.png")).toBeNull();
			expect(resolveTaskAssetFile(tempRoot, "task-1", "sub/a.png")).toBeNull();
			expect(resolveTaskAssetFile(tempRoot, "task-1", "")).toBeNull();
		});
	});

	describe("write / list / delete round-trip", () => {
		it("writes, lists (sorted, image-only), references and deletes assets", () => {
			const relA = writeTaskImage(tempRoot, "task-rt", "b.png", Buffer.from([1, 2, 3]));
			writeTaskImage(tempRoot, "task-rt", "a.png", Buffer.from([4]));
			fs.writeFileSync(
				path.join(taskAssetDir(tempRoot, "task-rt"), "notes.txt"),
				"not an image",
			);

			expect(relA).toBe("assets/b.png");
			expect(taskAssetRelPath("b.png")).toBe("assets/b.png");

			const images = listTaskImages(tempRoot, "task-rt");
			expect(images.map((i) => i.name)).toEqual(["a.png", "b.png"]);
			expect(images[0].size).toBe(1);
			expect(images[0].mediaType).toBe("image/png");
			expect(images.every((i) => i.path.startsWith("assets/"))).toBe(true);

			expect(collectTaskImageRefs(tempRoot, "task-rt")).toEqual([
				"assets/a.png",
				"assets/b.png",
			]);
			expect(collectTaskImageRefs(tempRoot, "task-rt", 1)).toEqual([
				"assets/a.png",
			]);
			expect(collectTaskImageRefs(tempRoot, "missing-task")).toEqual([]);

			expect(deleteTaskImage(tempRoot, "task-rt", "a.png")).toBe(true);
			expect(deleteTaskImage(tempRoot, "task-rt", "a.png")).toBe(false);
			expect(deleteTaskImage(tempRoot, "task-rt", "../../etc/passwd")).toBe(false);
			expect(listTaskImages(tempRoot, "task-rt").map((i) => i.name)).toEqual([
				"b.png",
			]);
		});

		it("yields empty lists for tasks without an assets directory", () => {
			expect(listTaskImages(tempRoot, "no-assets-task")).toEqual([]);
		});

		it("rejects invalid writes", () => {
			expect(() => writeTaskImage(tempRoot, "task-rt", "a.png", "not-a-buffer")).toThrow();
			expect(() => writeTaskImage("", "task-rt", "a.png", Buffer.from([1]))).toThrow();
		});
	});
});