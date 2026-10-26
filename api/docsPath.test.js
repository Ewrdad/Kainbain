import { describe, it, expect } from "vitest";
import path from "node:path";
import {
	DEFAULT_DOCS_DIR_NAME,
	isValidDocsDirName,
	resolveDocsDirName,
	normalizeDocsSettings,
	assertValidDocsDirNameForWrite,
	resolveDocsPath,
	resolveTasksDir,
	resolveTaskDocsDir,
	docsProjectFor,
	docsTasksIgnorePath,
} from "./docsPath.js";

/**
 * MARK: docsPath unit tests
 * @description Validation matrix, tolerant load, strict write, derived-path
 *   helpers, and the project-record lookup seam for the per-project docs
 *   link folder (mirrors `kainbainDir.test.js` for the state folder).
 */
describe("isValidDocsDirName", () => {
	it("accepts the default and simple custom names", () => {
		expect(isValidDocsDirName("docs")).toBe(true);
		expect(isValidDocsDirName("k-docs")).toBe(true);
		expect(isValidDocsDirName("kainbain-docs")).toBe(true);
		expect(isValidDocsDirName("  k-docs  ")).toBe(true);
	});

	it("rejects separators, blanks, garbage, and overlong names", () => {
		expect(isValidDocsDirName("")).toBe(false);
		expect(isValidDocsDirName("   ")).toBe(false);
		expect(isValidDocsDirName(null)).toBe(false);
		expect(isValidDocsDirName(undefined)).toBe(false);
		expect(isValidDocsDirName(42)).toBe(false);
		expect(isValidDocsDirName("../escape")).toBe(false);
		expect(isValidDocsDirName("a/b")).toBe(false);
		expect(isValidDocsDirName("a\\b")).toBe(false);
		expect(isValidDocsDirName("has space")).toBe(false);
		expect(isValidDocsDirName(".")).toBe(false);
		expect(isValidDocsDirName("..")).toBe(false);
		expect(isValidDocsDirName("x".repeat(65))).toBe(false);
		expect(isValidDocsDirName("x".repeat(64))).toBe(true);
	});

	it("rejects reserved names (including the default state folder)", () => {
		expect(isValidDocsDirName(".kainbain")).toBe(false);
		expect(isValidDocsDirName(".KAINBAIN")).toBe(false);
		expect(isValidDocsDirName(".git")).toBe(false);
		expect(isValidDocsDirName("node_modules")).toBe(false);
	});
});

describe("resolveDocsDirName (tolerant on load)", () => {
	it("returns the custom name when valid, default otherwise", () => {
		expect(resolveDocsDirName({ docsDirName: "k-docs" })).toBe("k-docs");
		expect(resolveDocsDirName({ docsDirName: "  k-docs  " })).toBe("k-docs");
		expect(resolveDocsDirName({})).toBe(DEFAULT_DOCS_DIR_NAME);
		expect(resolveDocsDirName(null)).toBe(DEFAULT_DOCS_DIR_NAME);
		expect(resolveDocsDirName({ docsDirName: "../x" })).toBe(
			DEFAULT_DOCS_DIR_NAME,
		);
		expect(resolveDocsDirName({ docsDirName: ".kainbain" })).toBe(
			DEFAULT_DOCS_DIR_NAME,
		);
	});
});

describe("normalizeDocsSettings (tolerant normalize)", () => {
	it("passes through only present keys and trims custom names", () => {
		expect(normalizeDocsSettings({})).toEqual({});
		expect(normalizeDocsSettings(null)).toEqual({});
		expect(normalizeDocsSettings({ docsDirName: "  k-docs  " })).toEqual({
			docsDirName: "k-docs",
		});
	});

	it("clears on blank and degrades garbage to undefined", () => {
		expect(normalizeDocsSettings({ docsDirName: "" })).toEqual({
			docsDirName: undefined,
		});
		expect(normalizeDocsSettings({ docsDirName: null })).toEqual({
			docsDirName: undefined,
		});
		expect(normalizeDocsSettings({ docsDirName: "../x" })).toEqual({
			docsDirName: undefined,
		});
	});

	it("drops the default name so default projects keep their file shape", () => {
		expect(normalizeDocsSettings({ docsDirName: "docs" })).toEqual({
			docsDirName: undefined,
		});
	});

	it("persists the centralised-docs opt-out only when explicit", () => {
		expect(normalizeDocsSettings({ centralizedDocs: false })).toEqual({
			centralizedDocs: false,
		});
		expect(normalizeDocsSettings({ centralizedDocs: true })).toEqual({
			centralizedDocs: undefined,
		});
	});
});

describe("assertValidDocsDirNameForWrite (strict on write)", () => {
	it("clears on blank and trims valid names", () => {
		expect(assertValidDocsDirNameForWrite(undefined)).toBe(undefined);
		expect(assertValidDocsDirNameForWrite("")).toBe(undefined);
		expect(assertValidDocsDirNameForWrite("   ")).toBe(undefined);
		expect(assertValidDocsDirNameForWrite("k-docs")).toBe("k-docs");
		expect(assertValidDocsDirNameForWrite("  k-docs  ")).toBe("k-docs");
		expect(assertValidDocsDirNameForWrite("docs")).toBe(undefined);
	});

	it("throws 400 INVALID_DOCS_DIR_NAME on garbage", () => {
		for (const bad of ["../x", "a/b", ".git", "node_modules", ".kainbain"]) {
			let err = null;
			try {
				assertValidDocsDirNameForWrite(bad);
			} catch (e) {
				err = e;
			}
			expect(err?.statusCode).toBe(400);
			expect(err?.code).toBe("INVALID_DOCS_DIR_NAME");
		}
	});
});

describe("derived-path helpers", () => {
	it("resolveDocsPath honours the custom name", () => {
		expect(resolveDocsPath("/repo", {})).toBe(
			path.join(path.resolve("/repo"), "docs"),
		);
		expect(resolveDocsPath("/repo", { docsDirName: "k-docs" })).toBe(
			path.join(path.resolve("/repo"), "k-docs"),
		);
		expect(resolveDocsPath("", {})).toBe(null);
		expect(resolveDocsPath(null, {})).toBe(null);
	});

	it("tasks and per-task dirs follow the folder", () => {
		const custom = { docsDirName: "k-docs" };
		expect(resolveTasksDir("/repo", custom)).toBe(
			path.join(path.resolve("/repo"), "k-docs", "tasks"),
		);
		expect(resolveTaskDocsDir("/repo", custom, "t-1")).toBe(
			path.join(path.resolve("/repo"), "k-docs", "tasks", "t-1"),
		);
		expect(resolveTaskDocsDir("/repo", custom, "")).toBe(null);
		expect(resolveTasksDir("", custom)).toBe(null);
	});

	it("docsTasksIgnorePath honours the custom name", () => {
		expect(docsTasksIgnorePath({})).toBe("docs/tasks/");
		expect(docsTasksIgnorePath({ docsDirName: "k-docs" })).toBe("k-docs/tasks/");
	});

	it("docsProjectFor resolves through a direct or a linked store", () => {
		expect(docsProjectFor(null, "p1")).toBe(null);
		expect(docsProjectFor(undefined, "p1")).toBe(null);
		expect(docsProjectFor({}, "")).toBe(null);
		const linked = { projectStore: { getProject: (id) => ({ id }) } };
		expect(docsProjectFor(linked, "p1")).toEqual({ id: "p1" });
		const direct = {
			getProject: (id) => ({ id, docsDirName: "k-docs" }),
		};
		expect(docsProjectFor(direct, "p1")).toEqual({
			id: "p1",
			docsDirName: "k-docs",
		});
		// A missing lookup degrades to null (the caller falls back to the
		// `docs` default), and a throwing store never propagates.
		expect(docsProjectFor({ getProject: () => null }, "p1")).toBe(null);
		expect(
			docsProjectFor(
				{
					getProject: () => {
						throw new Error("boom");
					},
				},
				"p1",
			),
		).toBe(null);
	});
});
