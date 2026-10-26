import { describe, it, expect } from "vitest";
import AdmZip from "adm-zip";
import { parseZipEntries, isSymlinkAttr } from "./zipEntries.js";

/**
 * MARK: zipEntries tests
 * @description Covers the adm-zip adapter: valid archives parse to plain
 *   `{ path, bytes }` lists, directories are skipped, and every guard
 *   (bad zip, entry-count, per-file, total-uncompressed, symlink) fails with
 *   a descriptive error and no entries. Fixture zips are built in-test with
 *   adm-zip itself, except the two archives adm-zip cannot author (zip-slip
 *   names, symlink attrs), which are minimal base64 blobs generated once
 *   with `python3 -m zipfile` semantics (see the plan's Step 1).
 */

function buildZip(files) {
	const zip = new AdmZip();
	for (const [name, content] of Object.entries(files)) {
		zip.addFile(
			name,
			Buffer.isBuffer(content) ? content : Buffer.from(String(content), "utf8"),
		);
	}
	return zip.toBuffer();
}

// `../evil.md` (stored, 6 bytes) — python zipfile writestr allows the
// traversal name that adm-zip's own writer would normalize away.
const SLIP_ZIP_B64 =
	"UEsDBBQAAAAAAMgOPl1xF4RdBgAAAAYAAAAKAAAALi4vZXZpbC5tZCMgZXZpbFBLAQIUAxQAAAAAAMgOPl1xF4RdBgAAAAYAAAAKAAAAAAAAAAAAAACAAQAAAAAuLi9ldmlsLm1kUEsFBgAAAAABAAEAOAAAAC4AAAAAAA==";
// `link.md` flagged as a unix symlink (external_attr 0o120777 << 16).
const SYMLINK_ZIP_B64 =
	"UEsDBBQAAAAAAAAAIQDn2E40CAAAAAgAAAAHAAAAbGluay5tZFNLSUxMLm1kUEsBAhQDFAAAAAAAAAAhAOfYTjQIAAAACAAAAAcAAAAAAAAAAAAAAP+hAAAAAGxpbmsubWRQSwUGAAAAAAEAAQA1AAAALQAAAAAA";

describe("parseZipEntries", () => {
	it("parses files to { path, bytes } and skips directory entries", () => {
		const buffer = buildZip({
			"SKILL.md": "# Root",
			"guide/SKILL.md": "# Nested",
			"guide/KB_config.json": "{}",
		});
		const { entries, error } = parseZipEntries(buffer);
		expect(error).toBeNull();
		expect(entries.map((entry) => entry.path).sort()).toEqual([
			"SKILL.md",
			"guide/KB_config.json",
			"guide/SKILL.md",
		]);
		expect(entries.find((entry) => entry.path === "SKILL.md").bytes.toString("utf8")).toBe(
			"# Root",
		);
	});

	it("rejects empty and non-zip buffers without throwing", () => {
		expect(parseZipEntries(Buffer.alloc(0)).error).toMatch(/empty/i);
		expect(parseZipEntries(Buffer.from("not a zip at all")).error).toMatch(
			/valid zip/i,
		);
		expect(parseZipEntries(null).error).toBeTruthy();
	});

	it("rejects archives over the entry-count cap", () => {
		const files = {};
		for (let i = 0; i < 70; i++) files[`f${i}.txt`] = "x";
		const { entries, error } = parseZipEntries(buildZip(files), { maxEntries: 64 });
		expect(entries).toEqual([]);
		expect(error).toMatch(/70 files \(max 64\)/);
	});

	it("rejects one entry over the per-file cap before inflating it", () => {
		const buffer = buildZip({ "SKILL.md": "x".repeat(300 * 1024) });
		const { entries, error } = parseZipEntries(buffer, {
			maxFileBytes: 256 * 1024,
		});
		expect(entries).toEqual([]);
		expect(error).toMatch(/SKILL.md.*max 262144/);
	});

	it("rejects archives over the total-uncompressed cap", () => {
		const buffer = buildZip({ "a.md": "a".repeat(300), "b.md": "b".repeat(300) });
		const { entries, error } = parseZipEntries(buffer, { maxTotalBytes: 500 });
		expect(entries).toEqual([]);
		expect(error).toMatch(/exceed 500 bytes uncompressed/);
	});

	it("surfaces raw traversal paths for the caller-side slip guard", () => {
		const { entries, error } = parseZipEntries(
			Buffer.from(SLIP_ZIP_B64, "base64"),
		);
		expect(error).toBeNull();
		expect(entries.map((entry) => entry.path)).toEqual(["../evil.md"]);
	});

	it("rejects symlink entries outright", () => {
		const { entries, error } = parseZipEntries(
			Buffer.from(SYMLINK_ZIP_B64, "base64"),
		);
		expect(entries).toEqual([]);
		expect(error).toMatch(/link.md.*symlink/);
	});
});

describe("isSymlinkAttr", () => {
	it("detects the unix symlink file-type bits", () => {
		expect(isSymlinkAttr(0o120777 << 16)).toBe(true);
		expect(isSymlinkAttr(0o100644 << 16)).toBe(false);
		expect(isSymlinkAttr(0)).toBe(false);
		expect(isSymlinkAttr(undefined)).toBe(false);
		expect(isSymlinkAttr(Number.NaN)).toBe(false);
	});
});
