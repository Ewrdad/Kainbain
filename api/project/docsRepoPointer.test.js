import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	resolveDocsRepoPointersPath,
	normalizeDocsRepoPointers,
	readDocsRepoPointers,
	writeDocsRepoPointers,
	rememberDocsRepoPointer,
	removeDocsRepoPointer,
	docsRepoPointerFor,
} from "./docsRepoPointer.js";

/**
 * MARK: docsRepoPointer unit tests
 * @description Engine-global cwd → docs-checkout pointer map: path
 *   resolution, tolerant reads, atomic writes, idempotent remember/remove.
 */
let tmpCount = 0;
const tmpRoots = [];
function makeTmp() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kb-docsrepo-ptr-${process.pid}-${tmpCount++}-`));
	tmpRoots.push(dir);
	return dir;
}
afterEach(() => {
	while (tmpRoots.length) {
		try {
			fs.rmSync(tmpRoots.pop(), { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
});

describe("resolveDocsRepoPointersPath", () => {
	it("lives next to the registry file", () => {
		expect(resolveDocsRepoPointersPath({ registryFile: "/tmp/r.json" })).toBe(
			path.join("/tmp", "docs-repo-pointers.json"),
		);
	});
});

describe("normalizeDocsRepoPointers", () => {
	it("degrades garbage to an empty map and resolves both sides", () => {
		expect(normalizeDocsRepoPointers(null)).toEqual({});
		expect(normalizeDocsRepoPointers([])).toEqual({});
		expect(normalizeDocsRepoPointers({ "/repo": 42 })).toEqual({});
		expect(normalizeDocsRepoPointers({ "/repo": "relative" })).toEqual({});
		expect(normalizeDocsRepoPointers({ "/repo/": "/srv/kb/repo/" })).toEqual({
			"/repo": "/srv/kb/repo",
		});
	});
});

describe("read/write/remember/remove", () => {
	it("missing file reads as empty and never throws", () => {
		const dir = makeTmp();
		const overrides = { registryFile: path.join(dir, "projects.json") };
		expect(readDocsRepoPointers(overrides)).toEqual({});
		expect(docsRepoPointerFor("/repo", overrides)).toBeNull();
	});

	it("corrupt file reads as empty", () => {
		const dir = makeTmp();
		const registryFile = path.join(dir, "projects.json");
		fs.writeFileSync(path.join(dir, "docs-repo-pointers.json"), "{not json", "utf8");
		expect(readDocsRepoPointers({ registryFile })).toEqual({});
	});

	it("remember is idempotent and remove drops the entry", () => {
		const dir = makeTmp();
		const overrides = { registryFile: path.join(dir, "projects.json") };
		expect(rememberDocsRepoPointer("/repo", "/srv/kb/repo", overrides)).toBe(true);
		expect(rememberDocsRepoPointer("/repo/", "/srv/kb/repo/", overrides)).toBe(true);
		expect(docsRepoPointerFor("/repo", overrides)).toBe("/srv/kb/repo");
		// persisted across reads
		expect(readDocsRepoPointers(overrides)).toEqual({ "/repo": "/srv/kb/repo" });
		expect(removeDocsRepoPointer("/repo", overrides)).toBe(true);
		expect(docsRepoPointerFor("/repo", overrides)).toBeNull();
		expect(removeDocsRepoPointer("/repo", overrides)).toBe(true); // idempotent
	});

	it("writeDocsRepoPointers normalizes and persists atomically", () => {
		const dir = makeTmp();
		const overrides = { registryFile: path.join(dir, "projects.json") };
		expect(writeDocsRepoPointers({ "/a": "/x", "/b": "relative" }, overrides)).toBe(true);
		expect(readDocsRepoPointers(overrides)).toEqual({ "/a": "/x" });
		expect(fs.existsSync(resolveDocsRepoPointersPath(overrides))).toBe(true);
	});

	it("blank inputs are refused", () => {
		const dir = makeTmp();
		const overrides = { registryFile: path.join(dir, "projects.json") };
		expect(rememberDocsRepoPointer("", "/srv/kb", overrides)).toBe(false);
		expect(rememberDocsRepoPointer("/repo", " ", overrides)).toBe(false);
		expect(removeDocsRepoPointer("", overrides)).toBe(false);
	});
});
