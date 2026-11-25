import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
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
	collectTaskAssetPayload,
	filterBranchBackedRefs,
	findMissingAssetRefs,
	formatMissingAssetWarning,
	resolveAssetRef,
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
			// Non-image files are outside the image endpoint's care: refusing
			// them keeps a hand-placed notes.txt deletable only by other means.
			expect(deleteTaskImage(tempRoot, "task-rt", "notes.txt")).toBe(false);
			expect(
				fs.existsSync(path.join(taskAssetDir(tempRoot, "task-rt"), "notes.txt")),
			).toBe(true);
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

	describe("resolveAssetRef", () => {
		it("reports a literally present file as present", () => {
			writeTaskImage(tempRoot, "task-resolve", "shot.png", Buffer.from([9]));
			expect(resolveAssetRef(tempRoot, "task-resolve", "assets/shot.png")).toEqual({
				ref: "assets/shot.png",
				name: "shot.png",
				present: true,
			});
		});

		it("reports a missing file without throwing, even with no assets dir", () => {
			expect(
				resolveAssetRef(tempRoot, "task-resolve", "assets/nope.png"),
			).toEqual({ ref: "assets/nope.png", name: "nope.png", present: false });
			expect(
				resolveAssetRef(tempRoot, "task-no-dir-at-all", "assets/nope.png"),
			).toEqual({ ref: "assets/nope.png", name: "nope.png", present: false });
		});

		it("treats drifted-but-servable refs as present (serve parity)", () => {
			writeTaskImage(tempRoot, "task-drift", "my-shot.png", Buffer.from([1]));
			// The serve route canonicalises `My Shot.PNG` to `my-shot.png`
			// instead of 404ing, so curation must not warn on it either.
			expect(
				resolveAssetRef(tempRoot, "task-drift", "assets/My Shot.PNG"),
			).toEqual({ ref: "assets/My Shot.PNG", name: "My Shot.PNG", present: true });
		});

		it("detects non-image files literally and via canonicalisation", () => {
			fs.mkdirSync(taskAssetDir(tempRoot, "task-mixed"), { recursive: true });
			fs.writeFileSync(
				path.join(taskAssetDir(tempRoot, "task-mixed"), "notes.txt"),
				"hand-placed",
			);
			expect(
				resolveAssetRef(tempRoot, "task-mixed", "assets/notes.txt").present,
			).toBe(true);
			// Serve parity covers every allowed attachment extension: the
			// attachments route canonicalises `Notes.TXT` to `notes.txt`
			// instead of 404ing, so curation must not warn on it either.
			expect(
				resolveAssetRef(tempRoot, "task-mixed", "assets/Notes.TXT").present,
			).toBe(true);
			// Disallowed extensions still never canonicalise to present.
			expect(
				resolveAssetRef(tempRoot, "task-mixed", "assets/Run.SH").present,
			).toBe(false);
		});

		it("reads non-asset input and unusable locations as not-an-asset / missing", () => {
			writeTaskImage(tempRoot, "task-resolve", "shot.png", Buffer.from([9]));
			expect(resolveAssetRef(tempRoot, "task-resolve", "https://x/y.png")).toBeNull();
			expect(resolveAssetRef(tempRoot, "task-resolve", "docs/notes.md")).toBeNull();
			expect(
				resolveAssetRef(tempRoot, "../escape", "assets/shot.png").present,
			).toBe(false);
			expect(
				resolveAssetRef(null, "task-resolve", "assets/shot.png").present,
			).toBe(false);
		});
	});

	describe("findMissingAssetRefs", () => {
		it("names each dangling ref with its expected task-folder path", () => {
			writeTaskImage(tempRoot, "task-find", "here.png", Buffer.from([1]));
			const goal =
				"See ![here](assets/here.png) and ![gone](assets/gone.png).";
			expect(findMissingAssetRefs(tempRoot, "task-find", goal)).toEqual([
				{
					ref: "assets/gone.png",
					name: "gone.png",
					expectedPath: "docs/tasks/task-find/assets/gone.png",
				},
			]);
		});

		it("returns [] when every ref resolves, or there are no refs", () => {
			writeTaskImage(tempRoot, "task-find", "here.png", Buffer.from([1]));
			expect(
				findMissingAssetRefs(tempRoot, "task-find", "See ![h](assets/here.png)."),
			).toEqual([]);
			expect(findMissingAssetRefs(tempRoot, "task-find", "no refs")).toEqual([]);
			expect(findMissingAssetRefs(tempRoot, "task-find", null)).toEqual([]);
		});

		it("returns [] when the location cannot be verified (no false warnings)", () => {
			expect(findMissingAssetRefs(null, "t1", "![a](assets/a.png)")).toEqual([]);
			expect(findMissingAssetRefs(tempRoot, "", "![a](assets/a.png)")).toEqual([]);
		});

		it("honours a custom docs folder name in the expected path", () => {
			expect(
				findMissingAssetRefs(tempRoot, "task-custom", "![a](assets/a.png)", {
					docsDirName: "k-docs",
				}),
			).toEqual([
				{
					ref: "assets/a.png",
					name: "a.png",
					expectedPath: "k-docs/tasks/task-custom/assets/a.png",
				},
			]);
		});
	});

	describe("formatMissingAssetWarning", () => {
		it("renders nothing for no missing files", () => {
			expect(formatMissingAssetWarning([])).toBe("");
			expect(formatMissingAssetWarning(null)).toBe("");
		});

		it("names the file, its expected path, and the fail-fast instruction", () => {
			const block = formatMissingAssetWarning(
				[
					{
						ref: "assets/image.png",
						name: "image.png",
						expectedPath: "docs/tasks/t1/assets/image.png",
					},
				],
				{ taskId: "t1" },
			);
			expect(block).toContain("MISSING-ASSET");
			expect(block).toContain("assets/image.png");
			expect(block).toContain("docs/tasks/t1/assets/image.png");
			expect(block.toLowerCase()).toContain("do not guess");
		});

		it("names every missing file, one line per ref", () => {
			const block = formatMissingAssetWarning([
				{ ref: "assets/a.png", name: "a.png", expectedPath: "docs/tasks/t1/assets/a.png" },
				{ ref: "assets/b.png", name: "b.png", expectedPath: "docs/tasks/t1/assets/b.png" },
			]);
			expect(block).toContain("assets/a.png");
			expect(block).toContain("assets/b.png");
		});
	});

	describe("collectTaskAssetPayload", () => {
		it("ships on-disk attachments as base64 entries, images first", () => {
			writeTaskImage(tempRoot, "task-payload", "b.png", Buffer.from([1, 2, 3]));
			writeTaskImage(tempRoot, "task-payload", "a.png", Buffer.from([4]));
			fs.writeFileSync(
				path.join(taskAssetDir(tempRoot, "task-payload"), "notes.txt"),
				"shipped",
			);
			const payload = collectTaskAssetPayload(tempRoot, "task-payload");
			expect(payload.map((entry) => entry.name)).toEqual([
				"a.png",
				"b.png",
				"notes.txt",
			]);
			expect(payload[0]).toEqual({
				name: "a.png",
				size: 1,
				contentBase64: Buffer.from([4]).toString("base64"),
			});
			expect(
				Buffer.from(payload[1].contentBase64, "base64"),
			).toEqual(Buffer.from([1, 2, 3]));
		});

		it("honours per-file and total byte caps", () => {
			writeTaskImage(tempRoot, "task-caps", "small.png", Buffer.from([1]));
			writeTaskImage(
				tempRoot,
				"task-caps",
				"big.png",
				Buffer.alloc(100, 7),
			);
			expect(
				collectTaskAssetPayload(tempRoot, "task-caps", null, {
					maxFileBytes: 10,
				}).map((entry) => entry.name),
			).toEqual(["small.png"]);
			expect(
				collectTaskAssetPayload(tempRoot, "task-caps", null, {
					maxTotalBytes: 1,
				}).map((entry) => entry.name),
			).toEqual(["small.png"]);
		});

		it("yields [] for missing tasks and never throws", () => {
			expect(collectTaskAssetPayload(tempRoot, "no-such-task")).toEqual([]);
			expect(collectTaskAssetPayload(null, "t1")).toEqual([]);
		});
	});

	describe("filterBranchBackedRefs", () => {
		function gitRepoWithBranchAssets() {
			const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-assets-git-"));
			const git = (args) =>
				execFileSync("git", args, {
					cwd: repo,
					stdio: "ignore",
					env: {
						...process.env,
						GIT_CONFIG_GLOBAL: os.devNull,
						GIT_CONFIG_SYSTEM: os.devNull,
					},
				});
			git(["init", "-q", "--initial-branch=main"]);
			git(["config", "user.email", "t@t.t"]);
			git(["config", "user.name", "t"]);
			git(["config", "commit.gpgsign", "false"]);
			const assetsDir = path.join(repo, "docs", "tasks", "task-flap", "assets");
			fs.mkdirSync(assetsDir, { recursive: true });
			fs.writeFileSync(path.join(assetsDir, "shot.png"), "branch-bytes");
			fs.writeFileSync(path.join(repo, "docs", "tasks", "task-flap", "task.md"), "x");
			git(["add", "."]);
			git(["commit", "-qm", "seed"]);
			git(["checkout", "-qb", "kb/task-flap"]);
			// Simulate the flap: another branch is checked out, so the
			// worktree no longer shows the task's assets.
			git(["checkout", "-q", "main"]);
			git(["rm", "-q", "-r", "--cached", "docs/tasks/task-flap"]);
			fs.rmSync(path.join(repo, "docs", "tasks", "task-flap"), {
				recursive: true,
				force: true,
			});
			git(["commit", "-qm", "flap away"]);
			return repo;
		}

		it("drops refs whose bytes sit on the task branch (branch flap)", () => {
			const repo = gitRepoWithBranchAssets();
			try {
				expect(
					fs.existsSync(path.join(repo, "docs", "tasks", "task-flap", "assets", "shot.png")),
				).toBe(false);
				const missing = [
					{
						ref: "assets/shot.png",
						name: "shot.png",
						expectedPath: "docs/tasks/task-flap/assets/shot.png",
					},
					{
						ref: "assets/gone.png",
						name: "gone.png",
						expectedPath: "docs/tasks/task-flap/assets/gone.png",
					},
				];
				expect(
					filterBranchBackedRefs(repo, "kb/task-flap", "task-flap", missing),
				).toEqual([missing[1]]);
			} finally {
				fs.rmSync(repo, { recursive: true, force: true });
			}
		});

		it("keeps every ref when git cannot answer (no repo, no branch, bad input)", () => {
			const plain = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-assets-plain-"));
			try {
				const missing = [
					{ ref: "assets/a.png", name: "a.png", expectedPath: "docs/tasks/t1/assets/a.png" },
				];
				expect(filterBranchBackedRefs(plain, "kb/t1", "t1", missing)).toEqual(missing);
				expect(filterBranchBackedRefs(plain, "no-such-branch", "t1", missing)).toEqual(missing);
				expect(filterBranchBackedRefs(plain, "../escape", "t1", missing)).toEqual(missing);
				expect(filterBranchBackedRefs(null, "kb/t1", "t1", missing)).toEqual(missing);
				expect(filterBranchBackedRefs(plain, null, "t1", missing)).toEqual(missing);
				expect(filterBranchBackedRefs(plain, "kb/t1", "t1", [])).toEqual([]);
				expect(filterBranchBackedRefs(plain, "kb/t1", "t1", null)).toEqual(null);
			} finally {
				fs.rmSync(plain, { recursive: true, force: true });
			}
		});
	});
});