import { describe, it, expect } from "vitest";

import {
	GitError,
	isValidBranchName,
	_assertValidBranchName,
	redactCredentials,
} from "./validation.js";

/***
 * MARK: git validation unit tests
 * @description Direct tests for the `api/git/validation.js` command-family
 *   leaf: branch-name allow-listing, the throwing assertion guard, and
 *   credential redaction for remote URLs. Pure functions — no git spawn.
 ***/

describe("isValidBranchName", () => {
	it("accepts safe names", () => {
		expect(isValidBranchName("kb/123e4567-e89b-12d3-a456-426614174000")).toBe(true);
		expect(isValidBranchName("main")).toBe(true);
		expect(isValidBranchName("feature/x_y-w.z")).toBe(true);
		expect(isValidBranchName("HEAD")).toBe(true);
		expect(isValidBranchName("a".repeat(40))).toBe(true);
	});

	it("rejects flag-injection and traversal shapes", () => {
		expect(isValidBranchName("--force")).toBe(false);
		expect(isValidBranchName("-rf")).toBe(false);
		expect(isValidBranchName("../evil")).toBe(false);
		expect(isValidBranchName("a..b")).toBe(false);
		expect(isValidBranchName("a//b")).toBe(false);
		expect(isValidBranchName(".hidden")).toBe(false);
		expect(isValidBranchName("name.lock")).toBe(false);
		expect(isValidBranchName("ends.")).toBe(false);
		expect(isValidBranchName("ends/")).toBe(false);
		expect(isValidBranchName("main~1")).toBe(false);
		expect(isValidBranchName("main^")).toBe(false);
		expect(isValidBranchName("a@{1}")).toBe(false);
	});

	it("rejects whitespace, specials, empties, and non-strings", () => {
		expect(isValidBranchName("")).toBe(false);
		expect(isValidBranchName(null)).toBe(false);
		expect(isValidBranchName(undefined)).toBe(false);
		expect(isValidBranchName(42)).toBe(false);
		expect(isValidBranchName("has space")).toBe(false);
		expect(isValidBranchName("tilde~")).toBe(false);
		expect(isValidBranchName("caret^")).toBe(false);
		expect(isValidBranchName("colon:x")).toBe(false);
		expect(isValidBranchName("star*")).toBe(false);
		expect(isValidBranchName("q?uestion")).toBe(false);
		expect(isValidBranchName("back\\slash")).toBe(false);
		expect(isValidBranchName("a".repeat(256))).toBe(false);
	});
});

describe("_assertValidBranchName", () => {
	it("passes silently for valid names", () => {
		expect(() => _assertValidBranchName("kb/task-1", "checkout")).not.toThrow();
	});

	it("throws a GitError naming the caller for invalid names", () => {
		expect(() => _assertValidBranchName("--force", "merge")).toThrow(GitError);
		expect(() => _assertValidBranchName("--force", "merge")).toThrow(
			/invalid branch name/,
		);
		try {
			_assertValidBranchName("--force", "push");
		} catch (err) {
			expect(err.message).toContain("push");
		}
	});
});

describe("redactCredentials", () => {
	it("strips a token userinfo section from https remotes", () => {
		expect(
			redactCredentials("https://40hex-token-here@git.example.com/u/r.git"),
		).toBe("https://git.example.com/u/r.git");
	});

	it("strips user:password pairs (last @ wins)", () => {
		expect(redactCredentials("https://user:p%40ss@host/u/r.git")).toBe(
			"https://host/u/r.git",
		);
	});

	it("leaves credential-free URLs, scp remotes, and non-strings untouched", () => {
		expect(redactCredentials("https://host/u/r.git")).toBe(
			"https://host/u/r.git",
		);
		expect(redactCredentials("git@github.com:u/r.git")).toBe(
			"git@github.com:u/r.git",
		);
		expect(redactCredentials(null)).toBe(null);
		expect(redactCredentials(undefined)).toBe(undefined);
		expect(redactCredentials("")).toBe("");
		expect(redactCredentials(42)).toBe(42);
	});
});
