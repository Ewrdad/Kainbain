import { describe, it, expect } from "vitest";
import {
	IMAGE_EXTENSIONS,
	MARKDOWN_EXTENSIONS,
	BINARY_EXTENSIONS,
	RAW_PREVIEW_MAX_BYTES,
	normalizeExtension,
	isImageExtension,
	isMarkdownExtension,
	extToMime,
	extToKind,
	looksBinary,
} from "./fileTypes.js";

/***
 * MARK: fileTypes unit tests
 * @description Black-box checks for the explorer file-type helpers: image and
 * markdown allowlists, mime mapping, kind classification, and null-byte sniffing.
 ***/
describe("fileTypes helpers", () => {
	it("lists every previewable image extension with a leading dot", () => {
		for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]) {
			expect(IMAGE_EXTENSIONS).toContain(ext);
		}
	});

	it("normalizes extensions from names, paths, and bare values", () => {
		expect(normalizeExtension(".PNG")).toBe(".png");
		expect(normalizeExtension("photo.JPG")).toBe(".jpg");
		expect(normalizeExtension("docs/a/b/icon.svg")).toBe(".svg");
		expect(normalizeExtension("no-extension")).toBe("");
		expect(normalizeExtension(null)).toBe("");
	});

	it("detects image extensions case-insensitively", () => {
		expect(isImageExtension(".png")).toBe(true);
		expect(isImageExtension("PHOTO.PNG")).toBe(true);
		expect(isImageExtension(".svg")).toBe(true);
		expect(isImageExtension(".md")).toBe(false);
		expect(isImageExtension(".js")).toBe(false);
	});

	it("detects markdown extensions case-insensitively", () => {
		expect(isMarkdownExtension(".md")).toBe(true);
		expect(isMarkdownExtension("notes.MARKDOWN")).toBe(true);
		expect(isMarkdownExtension(".png")).toBe(false);
		expect(MARKDOWN_EXTENSIONS).toContain(".md");
	});

	it("maps image extensions to their mime types", () => {
		expect(extToMime(".png")).toBe("image/png");
		expect(extToMime(".jpg")).toBe("image/jpeg");
		expect(extToMime(".jpeg")).toBe("image/jpeg");
		expect(extToMime(".gif")).toBe("image/gif");
		expect(extToMime(".webp")).toBe("image/webp");
		expect(extToMime(".svg")).toBe("image/svg+xml");
		expect(extToMime(".PNG")).toBe("image/png");
	});

	it("falls back to octet-stream for unknown extensions", () => {
		expect(extToMime(".xyz")).toBe("application/octet-stream");
		expect(extToMime("")).toBe("application/octet-stream");
	});

	it("classifies kinds for the explorer preview dispatch", () => {
		expect(extToKind(".png")).toBe("image");
		expect(extToKind(".SVG")).toBe("image");
		expect(extToKind(".md")).toBe("markdown");
		expect(extToKind(".markdown")).toBe("markdown");
		expect(extToKind(".js")).toBe("text");
		expect(extToKind(".unknown-ext")).toBe("text");
		expect(extToKind(".zip")).toBe("unsupported-binary");
		expect(extToKind(".pdf")).toBe("unsupported-binary");
		expect(BINARY_EXTENSIONS.length).toBeGreaterThan(0);
	});

	it("keeps the raw preview cap at 15 MB", () => {
		expect(RAW_PREVIEW_MAX_BYTES).toBe(15 * 1024 * 1024);
	});

	it("sniffs null bytes to spot binaries with misleading extensions", () => {
		expect(looksBinary(Buffer.from("# hello\nno nulls here", "utf8"))).toBe(false);
		expect(
			looksBinary(Buffer.concat([Buffer.from("GIF89a"), Buffer.from([0x00, 0x01])])),
		).toBe(true);
		expect(looksBinary(Buffer.alloc(0))).toBe(false);
	});
});
