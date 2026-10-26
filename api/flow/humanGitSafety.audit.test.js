import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
	classifyGitArgv,
	auditGitArgv,
	realGitPath,
	installGitArgvAudit,
} from "./humanGitSafety.audit.js";

/***
 * MARK: Human git-safety audit classifier tests
 * @description Pins the git-argv classifier the human-review contract tests
 *   rely on: pure reads and flag-free ref creation pass, everything that can
 *   move the tree (or is unknown) fails closed as a violation.
 ***/

describe("classifyGitArgv", () => {
	it("passes read-only argv used by human review paths", () => {
		for (const line of [
			"status --porcelain -uall",
			"rev-parse --abbrev-ref HEAD",
			"rev-parse --verify refs/heads/kb/abc",
			"symbolic-ref refs/remotes/origin/HEAD",
			"diff --stat main...kb/abc",
			"for-each-ref --format=%(refname)",
		]) {
			expect(classifyGitArgv(line).kind, line).toBe("read");
		}
	});

	it("passes flag-free branch creation as ref-create", () => {
		expect(classifyGitArgv("branch kb/abc").kind).toBe("ref-create");
		expect(classifyGitArgv("branch kb/abc master").kind).toBe("ref-create");
	});

	it("flags every other branch form as tree-mutating", () => {
		for (const line of [
			"branch -D kb/abc",
			"branch -m kb/old kb/new",
			"branch --show-current",
			"branch --list kb/*",
			"branch --verify kb/abc",
		]) {
			expect(classifyGitArgv(line).kind, line).toBe("tree-mutating");
		}
	});

	it("passes bare remote listing, flags every remote verb", () => {
		expect(classifyGitArgv("remote").kind).toBe("read");
		expect(classifyGitArgv("remote -v").kind).toBe("read");
		expect(classifyGitArgv("remote --verbose").kind).toBe("read");
		for (const line of [
			"remote add origin /tmp/x.git",
			"remote remove origin",
			"remote set-url origin /tmp/y.git",
			"remote prune origin",
			"remote show origin",
		]) {
			expect(classifyGitArgv(line).kind, line).toBe("tree-mutating");
		}
	});

	it("flags tree-mutating subcommands and fails closed on unknown ones", () => {
		for (const line of [
			"checkout kb/abc",
			"add -A",
			"commit -m x",
			"push origin kb/abc",
			"fetch origin",
			"merge kb/abc",
			"stash push",
			"clean -fd",
			"reset --hard HEAD",
			"reflog expire --all",
			"config user.email x@y",
			"notes add -m x",
		]) {
			expect(
				["tree-mutating", "unexpected"],
				line,
			).toContain(classifyGitArgv(line).kind);
		}
		expect(classifyGitArgv("some-future-subcommand --flag").kind).toBe(
			"unexpected",
		);
	});
});

describe("realGitPath", () => {
	it("resolves git to an absolute executable path without a shell", () => {
		const resolved = realGitPath();
		expect(path.isAbsolute(resolved)).toBe(true);
		expect(fs.existsSync(resolved)).toBe(true);
		// Cached: a second call returns the identical path.
		expect(realGitPath()).toBe(resolved);
	});
});

describe("installGitArgvAudit", () => {
	it("throws a clear error on Windows instead of installing a POSIX wrapper", () => {
		expect(() => installGitArgvAudit({ platform: "win32" })).toThrow(
			/not supported on Windows/,
		);
	});
});

describe("auditGitArgv", () => {
	it("splits recorded lines into reads, ref-creations, and violations", () => {
		const { reads, refCreates, violations } = auditGitArgv([
			"status --porcelain -uall",
			"branch kb/abc master",
			"checkout kb/abc",
			"remote prune origin",
			"some-future-subcommand",
		]);
		expect(reads.map((entry) => entry.argv)).toEqual([
			"status --porcelain -uall",
		]);
		expect(refCreates.map((entry) => entry.argv)).toEqual([
			"branch kb/abc master",
		]);
		expect(violations.map((entry) => entry.argv)).toEqual([
			"checkout kb/abc",
			"remote prune origin",
			"some-future-subcommand",
		]);
	});
});
