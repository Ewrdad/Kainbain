import { describe, it, expect } from "vitest";
import path from "node:path";
import {
	DEFAULT_KAINBAIN_DIR_NAME,
	isValidKainbainDirName,
	resolveKainbainDirName,
	normalizeKainbainDirSettings,
	assertValidKainbainDirNameForWrite,
	resolveKainbainDir,
	resolveProjectConfigPath,
	resolveSessionsDir,
	resolveWorktreesDir,
	resolveQuarantineDir,
	kainbainIgnorePath,
	kainbainProjectFor,
} from "./kainbainDir.js";

/**
 * MARK: kainbainDir unit tests
 * @description Validation matrix, tolerant load, strict write, derived-path
 *   helpers, and collision guards for the per-project state folder seam.
 */
describe("isValidKainbainDirName", () => {
	it("accepts the default and simple custom names", () => {
		expect(isValidKainbainDirName(".kainbain")).toBe(true);
		expect(isValidKainbainDirName(".kb")).toBe(true);
		expect(isValidKainbainDirName("kb-state")).toBe(true);
		expect(isValidKainbainDirName("  .kb  ")).toBe(true);
	});

	it("rejects separators, blanks, garbage, and overlong names", () => {
		expect(isValidKainbainDirName("")).toBe(false);
		expect(isValidKainbainDirName("   ")).toBe(false);
		expect(isValidKainbainDirName(null)).toBe(false);
		expect(isValidKainbainDirName(undefined)).toBe(false);
		expect(isValidKainbainDirName(42)).toBe(false);
		expect(isValidKainbainDirName("../escape")).toBe(false);
		expect(isValidKainbainDirName("a/b")).toBe(false);
		expect(isValidKainbainDirName("a\\b")).toBe(false);
		expect(isValidKainbainDirName("has space")).toBe(false);
		expect(isValidKainbainDirName("semi;colon")).toBe(false);
		expect(isValidKainbainDirName(".")).toBe(false);
		expect(isValidKainbainDirName("..")).toBe(false);
		expect(isValidKainbainDirName("x".repeat(65))).toBe(false);
		expect(isValidKainbainDirName("x".repeat(64))).toBe(true);
	});

	it("rejects reserved and docs-colliding names", () => {
		expect(isValidKainbainDirName(".git")).toBe(false);
		expect(isValidKainbainDirName("node_modules")).toBe(false);
		expect(isValidKainbainDirName("NODE_MODULES")).toBe(false);
		expect(isValidKainbainDirName("docs")).toBe(false);
		expect(isValidKainbainDirName("kainbain-docs")).toBe(true);
		expect(
			isValidKainbainDirName("kainbain-docs", { docsDirName: "kainbain-docs" }),
		).toBe(false);
		expect(isValidKainbainDirName(".kb", { docsDirName: "k-docs" })).toBe(true);
	});
});

describe("resolveKainbainDirName (tolerant on load)", () => {
	it("returns the custom name when valid, default otherwise", () => {
		expect(resolveKainbainDirName({ kainbainDirName: ".kb" })).toBe(".kb");
		expect(resolveKainbainDirName({ kainbainDirName: "  .kb  " })).toBe(".kb");
		expect(resolveKainbainDirName({})).toBe(DEFAULT_KAINBAIN_DIR_NAME);
		expect(resolveKainbainDirName(null)).toBe(DEFAULT_KAINBAIN_DIR_NAME);
		expect(resolveKainbainDirName({ kainbainDirName: "../x" })).toBe(
			DEFAULT_KAINBAIN_DIR_NAME,
		);
		expect(resolveKainbainDirName({ kainbainDirName: ".git" })).toBe(
			DEFAULT_KAINBAIN_DIR_NAME,
		);
		expect(
			resolveKainbainDirName({
				kainbainDirName: "k-docs",
				docsDirName: "k-docs",
			}),
		).toBe(DEFAULT_KAINBAIN_DIR_NAME);
	});
});

describe("normalizeKainbainDirSettings (tolerant normalize)", () => {
	it("passes through only present keys and trims custom names", () => {
		expect(normalizeKainbainDirSettings({})).toEqual({});
		expect(normalizeKainbainDirSettings(null)).toEqual({});
		expect(normalizeKainbainDirSettings({ kainbainDirName: "  .kb  " })).toEqual({
			kainbainDirName: ".kb",
		});
	});

	it("clears on blank and degrades garbage to undefined", () => {
		expect(normalizeKainbainDirSettings({ kainbainDirName: "" })).toEqual({
			kainbainDirName: undefined,
		});
		expect(normalizeKainbainDirSettings({ kainbainDirName: null })).toEqual({
			kainbainDirName: undefined,
		});
		expect(normalizeKainbainDirSettings({ kainbainDirName: "../x" })).toEqual({
			kainbainDirName: undefined,
		});
	});

	it("drops the default name so default projects keep their file shape", () => {
		expect(normalizeKainbainDirSettings({ kainbainDirName: ".kainbain" })).toEqual({
			kainbainDirName: undefined,
		});
	});

	it("is idempotent", () => {
		const once = normalizeKainbainDirSettings({ kainbainDirName: ".kb" });
		expect(normalizeKainbainDirSettings(once)).toEqual(once);
	});
});

describe("assertValidKainbainDirNameForWrite (strict on write)", () => {
	it("clears on blank and trims valid names", () => {
		expect(assertValidKainbainDirNameForWrite(undefined)).toBe(undefined);
		expect(assertValidKainbainDirNameForWrite("")).toBe(undefined);
		expect(assertValidKainbainDirNameForWrite("   ")).toBe(undefined);
		expect(assertValidKainbainDirNameForWrite(".kb")).toBe(".kb");
		expect(assertValidKainbainDirNameForWrite("  .kb  ")).toBe(".kb");
		expect(assertValidKainbainDirNameForWrite(".kainbain")).toBe(undefined);
	});

	it("throws 400 INVALID_KAINBAIN_DIR_NAME on garbage", () => {
		for (const bad of ["../x", "a/b", ".git", "node_modules", "docs"]) {
			let err = null;
			try {
				assertValidKainbainDirNameForWrite(bad);
			} catch (e) {
				err = e;
			}
			expect(err?.statusCode).toBe(400);
			expect(err?.code).toBe("INVALID_KAINBAIN_DIR_NAME");
		}
	});

	it("throws when colliding with the project's docs folder", () => {
		let err = null;
		try {
			assertValidKainbainDirNameForWrite("k-docs", { docsDirName: "k-docs" });
		} catch (e) {
			err = e;
		}
		expect(err?.code).toBe("INVALID_KAINBAIN_DIR_NAME");
	});
});

describe("derived-path helpers", () => {
	it("resolveKainbainDir honours the custom name", () => {
		expect(resolveKainbainDir("/repo", {})).toBe(
			path.join(path.resolve("/repo"), ".kainbain"),
		);
		expect(resolveKainbainDir("/repo", { kainbainDirName: ".kb" })).toBe(
			path.join(path.resolve("/repo"), ".kb"),
		);
		expect(resolveKainbainDir("", {})).toBe(null);
		expect(resolveKainbainDir(null, {})).toBe(null);
	});

	it("config, sessions, worktrees, and quarantine paths follow the folder", () => {
		const custom = { kainbainDirName: ".kb" };
		expect(resolveProjectConfigPath("/repo", custom)).toBe(
			path.join(path.resolve("/repo"), ".kb", "project.json"),
		);
		expect(resolveSessionsDir("/repo", custom)).toBe(
			path.join(path.resolve("/repo"), ".kb", "sessions"),
		);
		expect(resolveWorktreesDir("/repo", custom)).toBe(
			path.join(path.resolve("/repo"), ".kb", "worktrees"),
		);
		expect(resolveQuarantineDir("/repo", custom)).toBe(
			path.join(path.resolve("/repo"), ".kb", "quarantine"),
		);
		expect(resolveProjectConfigPath("", custom)).toBe(null);
		expect(resolveSessionsDir("", custom)).toBe(null);
	});

	it("kainbainIgnorePath honours the custom name", () => {
		expect(kainbainIgnorePath({})).toBe(".kainbain/");
		expect(kainbainIgnorePath({ kainbainDirName: ".kb" })).toBe(".kb/");
	});

	it("kainbainProjectFor degrades to null without a linked store", () => {
		expect(kainbainProjectFor(null, "p1")).toBe(null);
		const store = { projectStore: { getProject: (id) => ({ id }) } };
		expect(kainbainProjectFor(store, "p1")).toEqual({ id: "p1" });
		const directStore = { getProject: (id) => ({ id, kainbainDirName: ".kb" }) };
		expect(kainbainProjectFor(directStore, "p1")).toEqual({
			id: "p1",
			kainbainDirName: ".kb",
		});
	});
});
