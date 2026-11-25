/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
	ATTACHMENT_EXTENSIONS,
	INLINE_ATTACHMENT_EXTENSIONS,
	IMAGE_EXTENSIONS,
	AttachmentIngestError,
	auditTaskAttachmentRefs,
	attachmentKind,
	attachmentMediaType,
	attachmentServeHeaders,
	bareMarkdownDestination,
	dedupeAttachmentName,
	dedupeImageName,
	deleteTaskAttachment,
	deleteTaskImage,
	extractMarkdownDestinations,
	imageMediaType,
	ingestAttachment,
	ingestOutOfTaskRefs,
	isAllowedAttachmentExt,
	isAllowedImageExt,
	listTaskAttachments,
	listTaskImages,
	rewriteRefsToAssets,
	resolveOutOfTaskRef,
	sanitizeAttachmentName,
	sanitizeImageName,
	taskAssetDir,
	writeTaskAttachment,
	writeTaskImage,
} from "./taskAssets.js";

/***
 * MARK: Task Attachments tests
 * @description Generalized attachment pipeline: image/attachment delegation
 *   equivalence, the extension allowlist + serving matrix, single-file
 *   ingest, markdown destination extraction + rewriting, out-of-task
 *   resolution + batch ingest, and the backfill auditor.
 ***/
describe("taskAttachments helpers", () => {
	let tempRoot;

	beforeAll(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-attachments-"));
	});

	afterAll(() => {
		try {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		} catch {
			// ignore cleanup error
		}
	});

	describe("attachment allowlist", () => {
		it("is a strict superset of the image extensions", () => {
			for (const ext of IMAGE_EXTENSIONS) {
				expect(ATTACHMENT_EXTENSIONS).toContain(ext);
			}
			expect(ATTACHMENT_EXTENSIONS.length).toBeGreaterThan(IMAGE_EXTENSIONS.length);
		});

		it("accepts text, docs, archives, media, and download-only web files", () => {
			for (const name of [
				"a.png",
				"server.LOG",
				"notes.md",
				"data.json",
				"rows.csv",
				"report.pdf",
				"deck.pptx",
				"backup.zip",
				"clip.mp4",
				"page.html",
				"diagram.SVG",
			]) {
				expect(isAllowedAttachmentExt(name)).toBe(true);
			}
		});

		it("rejects executables, scripts, and extensionless names", () => {
			for (const name of ["run.sh", "app.exe", "evil.bat", "blob", "", null]) {
				expect(isAllowedAttachmentExt(name)).toBe(false);
			}
		});

		it("classifies images vs files vs rejected names", () => {
			expect(attachmentKind("shot.png")).toBe("image");
			expect(attachmentKind("SHOT.JPG")).toBe("image");
			expect(attachmentKind("server.log")).toBe("file");
			expect(attachmentKind("page.html")).toBe("file");
			expect(attachmentKind("run.sh")).toBeNull();
		});

		it("maps media types, matching the image table exactly for images", () => {
			expect(attachmentMediaType("a.png")).toBe(imageMediaType("a.png"));
			expect(attachmentMediaType("A.JPEG")).toBe(imageMediaType("A.JPEG"));
			expect(attachmentMediaType("server.log")).toBe("text/plain");
			expect(attachmentMediaType("data.json")).toBe("application/json");
			expect(attachmentMediaType("report.pdf")).toBe("application/pdf");
			expect(attachmentMediaType("clip.mp4")).toBe("video/mp4");
			expect(attachmentMediaType("run.sh")).toBeNull();
		});

		it("serves images/text/pdf inline and everything risky as a download", () => {
			expect(attachmentServeHeaders("shot.png")).toEqual({
				mediaType: "image/png",
				disposition: "inline",
			});
			expect(attachmentServeHeaders("notes.md")).toEqual({
				mediaType: "text/markdown",
				disposition: "inline",
			});
			expect(attachmentServeHeaders("report.pdf").disposition).toBe("inline");
			expect(attachmentServeHeaders("page.html")).toEqual({
				mediaType: "text/html",
				disposition: "attachment",
			});
			expect(attachmentServeHeaders("diagram.svg").disposition).toBe("attachment");
			expect(attachmentServeHeaders("backup.zip").disposition).toBe("attachment");
			expect(attachmentServeHeaders("clip.mp4").disposition).toBe("attachment");
			expect(attachmentServeHeaders("run.sh")).toBeNull();
		});

		it("keeps the inline set inside the allowlist", () => {
			for (const ext of INLINE_ATTACHMENT_EXTENSIONS) {
				expect(ATTACHMENT_EXTENSIONS).toContain(ext);
			}
			expect(INLINE_ATTACHMENT_EXTENSIONS).not.toContain("html");
			expect(INLINE_ATTACHMENT_EXTENSIONS).not.toContain("svg");
		});
	});

	describe("image/attachment delegation equivalence", () => {
		it("sanitizes identically for image and non-image names", () => {
			const samples = [
				"My Screenshot (1).PNG",
				"../../etc/passwd.png",
				"..",
				"",
				"Server LOG (2).LOG",
				"trailing..",
			];
			for (const sample of samples) {
				expect(sanitizeImageName(sample)).toBe(sanitizeAttachmentName(sample));
			}
			expect(sanitizeAttachmentName("../../tmp/Server.LOG")).toBe("server.log");
		});

		it("dedupes identically", () => {
			expect(dedupeImageName(["a.png"], "a.png")).toBe(
				dedupeAttachmentName(["a.png"], "a.png"),
			);
			expect(dedupeAttachmentName(["a.log", "a-2.log"], "a.log")).toBe("a-3.log");
		});

		it("lists images byte-identically through the generalized lister", () => {
			writeTaskImage(tempRoot, "task-equiv", "b.png", Buffer.from([1]));
			writeTaskAttachment(tempRoot, "task-equiv", "a.log", Buffer.from([2]));
			expect(listTaskImages(tempRoot, "task-equiv")).toEqual([
				{
					name: "b.png",
					path: "assets/b.png",
					size: 1,
					mtime: expect.any(String),
					mediaType: "image/png",
				},
			]);
			expect(listTaskAttachments(tempRoot, "task-equiv").map((e) => e.name)).toEqual([
				"a.log",
				"b.png",
			]);
			expect(listTaskAttachments(tempRoot, "task-equiv")[0]).toMatchObject({
				kind: "file",
				mediaType: "text/plain",
			});
			expect(listTaskAttachments(tempRoot, "task-equiv")[1]).toMatchObject({
				kind: "image",
			});
		});

		it("writes and deletes round-trip for both spellings", () => {
			expect(
				writeTaskAttachment(tempRoot, "task-round", "out.log", Buffer.from("hi")),
			).toBe("assets/out.log");
			expect(deleteTaskImage(tempRoot, "task-round", "out.log")).toBe(false);
			expect(deleteTaskAttachment(tempRoot, "task-round", "out.log")).toBe(true);
			expect(deleteTaskAttachment(tempRoot, "task-round", "out.log")).toBe(false);
			expect(deleteTaskAttachment(tempRoot, "task-round", "run.sh")).toBe(false);
			writeTaskImage(tempRoot, "task-round", "x.png", Buffer.from([1]));
			expect(deleteTaskAttachment(tempRoot, "task-round", "x.png")).toBe(true);
		});

		it("yields [] for missing attachment dirs", () => {
			expect(listTaskAttachments(tempRoot, "no-such-task")).toEqual([]);
			expect(listTaskAttachments(null, "t1")).toEqual([]);
		});
	});

	describe("ingestAttachment", () => {
		it("stores bytes under a sanitized, deduped name and returns the ref", () => {
			const first = ingestAttachment({
				projectCwd: tempRoot,
				taskId: "task-ingest",
				sourceBytes: Buffer.from("one"),
				originalName: "Out.LOG",
			});
			expect(first).toEqual({ name: "out.log", relPath: "assets/out.log", size: 3 });
			const second = ingestAttachment({
				projectCwd: tempRoot,
				taskId: "task-ingest",
				sourceBytes: Buffer.from("two"),
				originalName: "../Out.LOG",
			});
			expect(second.name).toBe("out-2.log");
			expect(
				fs.readFileSync(
					path.join(taskAssetDir(tempRoot, "task-ingest"), "out.log"),
					"utf8",
				),
			).toBe("one");
		});

		it("reads bytes from sourcePath when no buffer is given", () => {
			const src = path.join(tempRoot, "from-path.txt");
			fs.writeFileSync(src, "via path");
			const stored = ingestAttachment({
				projectCwd: tempRoot,
				taskId: "task-ingest-path",
				sourcePath: src,
				originalName: "from-path.txt",
			});
			expect(stored.relPath).toBe("assets/from-path.txt");
		});

		it("rejects disallowed types with a reason code", () => {
			expect(() =>
				ingestAttachment({
					projectCwd: tempRoot,
					taskId: "task-ingest-err",
					sourceBytes: Buffer.from("x"),
					originalName: "run.sh",
				}),
			).toThrowError(expect.objectContaining({ code: "attachment-type-not-allowed" }));
			expect(() =>
				ingestAttachment({
					projectCwd: tempRoot,
					taskId: "task-ingest-err",
					sourceBytes: Buffer.from("x"),
					originalName: "..",
				}),
			).toThrowError(expect.objectContaining({ code: "attachment-invalid-name" }));
		});

		it("enforces per-file and per-task caps with limits attached", () => {
			expect(() =>
				ingestAttachment({
					projectCwd: tempRoot,
					taskId: "task-ingest-cap",
					sourceBytes: Buffer.alloc(11, 7),
					originalName: "big.log",
					maxFileBytes: 10,
				}),
			).toThrowError(
				expect.objectContaining({ code: "attachment-too-large", limit: 10 }),
			);
			ingestAttachment({
				projectCwd: tempRoot,
				taskId: "task-ingest-cap",
				sourceBytes: Buffer.from("a"),
				originalName: "a.log",
				maxPerTask: 1,
			});
			expect(() =>
				ingestAttachment({
					projectCwd: tempRoot,
					taskId: "task-ingest-cap",
					sourceBytes: Buffer.from("b"),
					originalName: "b.log",
					maxPerTask: 1,
				}),
			).toThrowError(
				expect.objectContaining({ code: "attachment-limit-reached", limit: 1 }),
			);
		});

		it("throws plain errors for unusable locations and missing bytes", () => {
			expect(() =>
				ingestAttachment({
					projectCwd: tempRoot,
					taskId: "../escape",
					sourceBytes: Buffer.from("x"),
					originalName: "a.log",
				}),
			).toThrow("Invalid task attachment location");
			expect(() =>
				ingestAttachment({
					projectCwd: tempRoot,
					taskId: "task-ingest-err",
					originalName: "a.log",
				}),
			).toThrow("Invalid task attachment bytes");
			expect(
				new AttachmentIngestError("attachment-too-large", "big.zip", 8).code,
			).toBe("attachment-too-large");
		});
	});

	describe("extractMarkdownDestinations / bareMarkdownDestination", () => {
		it("collects raw destinations in order without duplicates", () => {
			expect(
				extractMarkdownDestinations(
					'See [log](/tmp/out.log) and ![a](assets/a.png) and [log](/tmp/out.log).',
				),
			).toEqual(["/tmp/out.log", "assets/a.png"]);
		});

		it("keeps angle forms and titles raw", () => {
			expect(
				extractMarkdownDestinations('![a](<assets/my (1).png> "shot")'),
			).toEqual(['<assets/my (1).png> "shot"']);
		});

		it("reads non-strings as no destinations", () => {
			expect(extractMarkdownDestinations(null)).toEqual([]);
			expect(extractMarkdownDestinations("no links")).toEqual([]);
		});

		it("strips decorations to the bare path", () => {
			expect(bareMarkdownDestination('< /tmp/out.log > "run log"')).toBe("/tmp/out.log");
			expect(bareMarkdownDestination("assets/a.png")).toBe("assets/a.png");
			expect(bareMarkdownDestination("  ")).toBe("");
			expect(bareMarkdownDestination(null)).toBe("");
		});
	});

	describe("rewriteRefsToAssets", () => {
		it("replaces only exact matched destinations, preserving titles", () => {
			expect(
				rewriteRefsToAssets("See [log](/tmp/out.log)", {
					"/tmp/out.log": "assets/out.log",
				}),
			).toBe("See [log](assets/out.log)");
			expect(
				rewriteRefsToAssets('![shot](/tmp/shot.png "the shot")', {
					"/tmp/shot.png": "assets/shot.png",
				}),
			).toBe('![shot](assets/shot.png "the shot")');
			expect(
				rewriteRefsToAssets("See [log](/tmp/out.log) and [other](/tmp/other.log)", {
					"/tmp/out.log": "assets/out.log",
				}),
			).toBe("See [log](assets/out.log) and [other](/tmp/other.log)");
		});

		it("is idempotent and leaves unknown destinations alone", () => {
			const once = rewriteRefsToAssets("![a](/tmp/a.png)", {
				"/tmp/a.png": "assets/a.png",
			});
			expect(once).toBe("![a](assets/a.png)");
			expect(rewriteRefsToAssets(once, { "/tmp/a.png": "assets/a.png" })).toBe(once);
			expect(rewriteRefsToAssets("no links", { "/tmp/a.png": "assets/a.png" })).toBe(
				"no links",
			);
			expect(rewriteRefsToAssets(null, {})).toBe("");
			expect(rewriteRefsToAssets("![a](assets/a.png)", null)).toBe(
				"![a](assets/a.png)",
			);
		});
	});

	describe("resolveOutOfTaskRef", () => {
		it("resolves absolute project files and temp files", () => {
			const inside = path.join(tempRoot, "inside.log");
			fs.writeFileSync(inside, "in");
			expect(resolveOutOfTaskRef(tempRoot, "task-resolve", inside)).toBe(
				fs.realpathSync(inside),
			);
			const tmpFile = path.join(
				fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-src-")),
				"tmp.log",
			);
			fs.writeFileSync(tmpFile, "tmp");
			try {
				expect(resolveOutOfTaskRef(tempRoot, "task-resolve", tmpFile)).toBe(
					fs.realpathSync(tmpFile),
				);
			} finally {
				fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
			}
		});

		it("resolves relatives against the task folder first, then the project root", () => {
			const taskDir = path.join(tempRoot, "docs", "tasks", "task-rel");
			fs.mkdirSync(taskDir, { recursive: true });
			fs.writeFileSync(path.join(taskDir, "both.log"), "task");
			fs.writeFileSync(path.join(tempRoot, "both.log"), "root");
			fs.writeFileSync(path.join(tempRoot, "root-only.log"), "root");
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "both.log")).toBe(
				fs.realpathSync(path.join(taskDir, "both.log")),
			);
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "root-only.log")).toBe(
				fs.realpathSync(path.join(tempRoot, "root-only.log")),
			);
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "missing.log")).toBeNull();
		});

		it("refuses assets refs, URLs, queries, dirs, escapes, and bad input", () => {
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "assets/a.png")).toBeNull();
			expect(
				resolveOutOfTaskRef(tempRoot, "task-rel", "https://x/y.png"),
			).toBeNull();
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "data:text/x")).toBeNull();
			const inside = path.join(tempRoot, "q.log");
			fs.writeFileSync(inside, "q");
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", `${inside}?v=1`)).toBeNull();
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "docs")).toBeNull();
			expect(resolveOutOfTaskRef(tempRoot, "../escape", "both.log")).toBeNull();
			expect(resolveOutOfTaskRef(null, "task-rel", "both.log")).toBeNull();
			expect(resolveOutOfTaskRef(tempRoot, "task-rel", "")).toBeNull();
		});

		it("refuses symlink escapes outside the allowed roots", () => {
			const target = "/etc/hosts";
			if (!fs.existsSync(target)) return;
			const link = path.join(tempRoot, "escape.log");
			try {
				fs.symlinkSync(target, link);
			} catch {
				return;
			}
			try {
				expect(resolveOutOfTaskRef(tempRoot, "task-rel", link)).toBeNull();
			} finally {
				fs.rmSync(link, { force: true });
			}
		});
	});

	describe("ingestOutOfTaskRefs", () => {
		it("ingests resolvable refs and rewrites the text", () => {
			const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-batch-"));
			const logFile = path.join(srcDir, "Run Output.LOG");
			fs.writeFileSync(logFile, "log-bytes");
			try {
				const goal = [
					"Investigate the failure.",
					"",
					`See [run log](${logFile}) and ![kept](assets/kept.png).`,
					"External: [docs](https://example.com/x).",
				].join("\n");
				const outcome = ingestOutOfTaskRefs({
					projectCwd: tempRoot,
					taskId: "task-batch",
					markdown: goal,
				});
				expect(outcome.ingested).toEqual([
					{
						from: logFile,
						to: "assets/run-output.log",
						name: "run-output.log",
						size: 9,
					},
				]);
				expect(outcome.skipped).toEqual([]);
				expect(outcome.markdown).toBe(
					[
						"Investigate the failure.",
						"",
						"See [run log](assets/run-output.log) and ![kept](assets/kept.png).",
						"External: [docs](https://example.com/x).",
					].join("\n"),
				);
				expect(
					fs.readFileSync(
						path.join(taskAssetDir(tempRoot, "task-batch"), "run-output.log"),
						"utf8",
					),
				).toBe("log-bytes");
				// Idempotent: a second pass over the rewritten text is a no-op.
				const again = ingestOutOfTaskRefs({
					projectCwd: tempRoot,
					taskId: "task-batch",
					markdown: outcome.markdown,
				});
				expect(again.markdown).toBe(outcome.markdown);
				expect(again.ingested).toEqual([]);
				expect(again.skipped).toEqual([]);
			} finally {
				fs.rmSync(srcDir, { recursive: true, force: true });
			}
		});

		it("maps refs already inside assets/ without copying", () => {
			writeTaskAttachment(tempRoot, "task-direct", "a.log", Buffer.from("a"));
			const abs = path.join(taskAssetDir(tempRoot, "task-direct"), "a.log");
			const outcome = ingestOutOfTaskRefs({
				projectCwd: tempRoot,
				taskId: "task-direct",
				markdown: `See [a](${abs}).`,
			});
			expect(outcome.ingested).toEqual([
				{ from: abs, to: "assets/a.log", name: "a.log", size: 0, direct: true },
			]);
			expect(outcome.markdown).toBe("See [a](assets/a.log).");
			expect(fs.readdirSync(taskAssetDir(tempRoot, "task-direct"))).toEqual(["a.log"]);
		});

		it("normalizes fuller asset path forms only when the bytes exist", () => {
			writeTaskAttachment(tempRoot, "task-fuller", "kept.png", Buffer.from([1]));
			const outcome = ingestOutOfTaskRefs({
				projectCwd: tempRoot,
				taskId: "task-fuller",
				markdown:
					"![a](./assets/kept.png) ![b](docs/tasks/task-fuller/assets/kept.png) ![c](./assets/gone.png)",
			});
			expect(outcome.markdown).toBe(
				"![a](assets/kept.png) ![b](assets/kept.png) ![c](./assets/gone.png)",
			);
			expect(outcome.ingested.map((entry) => entry.to)).toEqual([
				"assets/kept.png",
				"assets/kept.png",
			]);
		});

		it("flattens files nested under assets/ into the folder", () => {
			const nested = path.join(taskAssetDir(tempRoot, "task-nested"), "sub");
			fs.mkdirSync(nested, { recursive: true });
			fs.writeFileSync(path.join(nested, "deep.log"), "deep");
			const outcome = ingestOutOfTaskRefs({
				projectCwd: tempRoot,
				taskId: "task-nested",
				markdown: "See [d](assets/sub/deep.log).",
			});
			expect(outcome.markdown).toBe("See [d](assets/deep.log).");
			expect(outcome.ingested).toEqual([
				{
					from: "assets/sub/deep.log",
					to: "assets/deep.log",
					name: "deep.log",
					size: 4,
				},
			]);
		});

		it("reports skipped refs with reasons and keeps their text", () => {
			const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-skip-"));
			const big = path.join(srcDir, "big.log");
			fs.writeFileSync(big, "0123456789");
			const evil = path.join(srcDir, "evil.sh");
			fs.writeFileSync(evil, "x");
			try {
				const goal =
					`[gone](/tmp/kainbain-no-such-file.log) [big](${big}) [evil](${evil})`;
				const outcome = ingestOutOfTaskRefs({
					projectCwd: tempRoot,
					taskId: "task-skip",
					markdown: goal,
					maxFileBytes: 4,
				});
				expect(outcome.markdown).toBe(goal);
				expect(outcome.ingested).toEqual([]);
				expect(outcome.skipped).toEqual([
					{ ref: "/tmp/kainbain-no-such-file.log", reason: "unresolvable" },
					{ ref: big, reason: "attachment-too-large" },
					{ ref: evil, reason: "attachment-type-not-allowed" },
				]);
			} finally {
				fs.rmSync(srcDir, { recursive: true, force: true });
			}
		});

		it("returns the input untouched when there is nothing to do", () => {
			expect(
				ingestOutOfTaskRefs({
					projectCwd: tempRoot,
					taskId: "task-batch",
					markdown: "plain text, no links",
				}),
			).toEqual({ markdown: "plain text, no links", ingested: [], skipped: [] });
			expect(
				ingestOutOfTaskRefs({ projectCwd: null, taskId: "t", markdown: "x" })
					.markdown,
			).toBe("x");
			expect(
				ingestOutOfTaskRefs({ projectCwd: tempRoot, taskId: "t", markdown: null })
					.markdown,
			).toBe("");
		});
	});

	describe("auditTaskAttachmentRefs", () => {
		it("reports dangling refs and out-of-task resolvability without writing", () => {
			const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-task-audit-"));
			const here = path.join(srcDir, "here.log");
			fs.writeFileSync(here, "here");
			try {
				const report = auditTaskAttachmentRefs({
					projectCwd: tempRoot,
					taskId: "task-audit",
					markdown: `![gone](assets/gone.png) [here](${here}) [gone2](/tmp/kainbain-nope.log)`,
				});
				expect(report.missing).toEqual([
					{
						ref: "assets/gone.png",
						name: "gone.png",
						expectedPath: "docs/tasks/task-audit/assets/gone.png",
					},
				]);
				expect(report.outOfTask).toEqual([
					{ ref: here, resolvable: true },
					{ ref: "/tmp/kainbain-nope.log", resolvable: false },
				]);
				expect(fs.existsSync(taskAssetDir(tempRoot, "task-audit") || "")).toBe(false);
			} finally {
				fs.rmSync(srcDir, { recursive: true, force: true });
			}
		});
	});
});
