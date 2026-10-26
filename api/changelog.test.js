/* eslint-disable security/detect-non-literal-fs-filename -- temp-dir fixtures only, never user input */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

/***
 * MARK: Changelog generator tests
 * @description Covers `scripts/generate-changelog.mjs` (the deploy-time baker
 *   for `$PROD_DIR/changelog.json`). The suite lives in `api/` rather than
 *   next to the script because the repo root has no vitest runner — only
 *   `api/` and `frontend/` suites run under `npm run test:unit`. Real-git
 *   cases use throwaway temp repos (never the KainBain repo) and skip when git
 *   is unavailable, mirroring `api/git.integration.test.js`.
 * @example run `npm run test --prefix api`
 ***/
const {
	parseGitLog,
	isSafeRef,
	resolveDefaultBranch,
	generateChangelog,
	DEFAULT_LIMIT,
	MAX_BODY_CHARS,
	FIELD_SEP,
	RECORD_SEP,
} = await import("../scripts/generate-changelog.mjs");

let gitAvailable = true;
try {
	execFileSync("git", ["--version"], { stdio: "ignore" });
} catch {
	gitAvailable = false;
}

function run(cwd, ...args) {
	return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

function initRepo(cwd, { initialBranch = "master" } = {}) {
	fs.mkdirSync(cwd, { recursive: true });
	run(cwd, "init", "-b", initialBranch);
	run(cwd, "config", "user.email", "kainbain-test@example.com");
	run(cwd, "config", "user.name", "KainBain Test");
	return cwd;
}

function commitFile(cwd, name, body, message) {
	fs.writeFileSync(path.join(cwd, name), body);
	run(cwd, "add", "-A");
	run(cwd, "commit", "--allow-empty-message", "-m", message);
}

describe("parseGitLog", () => {
	it("parses a golden fixture newest-first, incl. unicode, pipes and quotes", () => {
		const rec = (fields) => fields.join(FIELD_SEP);
		const raw =
			rec([
				"aaa111",
				"aaa111",
				"Tést Author",
				"test@example.com",
				"2026-09-30T08:00:00+01:00",
				"Fix pipes | and \"quotes\" in subject",
				"Line one\nLine two — unicode ✓",
			]) +
			RECORD_SEP +
			"\n" +
			rec([
				"bbb222",
				"bbb222",
				"Second",
				"second@example.com",
				"2026-09-29T08:00:00+01:00",
				"Empty body commit",
				"",
			]) +
			RECORD_SEP +
			"\n";
		const entries = parseGitLog(raw);
		expect(entries).toHaveLength(2);
		expect(entries[0]).toEqual({
			sha: "aaa111",
			shortSha: "aaa111",
			subject: 'Fix pipes | and "quotes" in subject',
			body: "Line one\nLine two — unicode ✓",
			bodyTruncated: false,
			author: "Tést Author",
			authorEmail: "test@example.com",
			date: "2026-09-30T08:00:00+01:00",
		});
		expect(entries[1].body).toBe("");
		expect(entries[1].bodyTruncated).toBe(false);
	});

	it("truncates long bodies and flags them", () => {
		const longBody = `x`.repeat(MAX_BODY_CHARS + 100);
		const raw =
			["ccc333", "ccc333", "A", "a@e.c", "2026-09-30", "Big", longBody].join(FIELD_SEP) +
			RECORD_SEP;
		const [entry] = parseGitLog(raw);
		expect(entry.body).toHaveLength(MAX_BODY_CHARS);
		expect(entry.bodyTruncated).toBe(true);
	});

	it("skips malformed records and returns [] for empty input", () => {
		expect(parseGitLog("")).toEqual([]);
		expect(parseGitLog(null)).toEqual([]);
		const raw = `short${FIELD_SEP}record${RECORD_SEP}\n${FIELD_SEP}${RECORD_SEP}`;
		expect(parseGitLog(raw)).toEqual([]);
	});
});

describe("isSafeRef", () => {
	it.each(["master", "main", "kb/task-1", "origin/master", "v1.2.3"])(
		"accepts %s",
		(ref) => {
			expect(isSafeRef(ref)).toBe(true);
		},
	);
	it.each(["--upload-pack=x", "-b", "../escape", "a//b", "a@{b", "", ".hidden", "a.lock", 42, null])(
		"rejects %s",
		(ref) => {
			expect(isSafeRef(ref)).toBe(false);
		},
	);
});

describe("resolveDefaultBranch", () => {
	if (!gitAvailable) {
		it.skip("skipped: git is not available", () => {});
		return;
	}
	let tmp;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-branch-"));
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("resolves master when present", () => {
		initRepo(tmp, { initialBranch: "master" });
		commitFile(tmp, "a.txt", "a", "init");
		expect(resolveDefaultBranch(tmp)).toBe("master");
	});

	it("resolves main when master is absent", () => {
		initRepo(tmp, { initialBranch: "main" });
		commitFile(tmp, "a.txt", "a", "init");
		expect(resolveDefaultBranch(tmp)).toBe("main");
	});

	it("prefers master when both exist", () => {
		initRepo(tmp, { initialBranch: "master" });
		commitFile(tmp, "a.txt", "a", "init");
		run(tmp, "branch", "main");
		expect(resolveDefaultBranch(tmp)).toBe("master");
	});

	it("throws when neither master, main, nor origin/HEAD exists", () => {
		initRepo(tmp, { initialBranch: "trunk" });
		commitFile(tmp, "a.txt", "a", "init");
		expect(() => resolveDefaultBranch(tmp)).toThrow("Cannot resolve default branch");
	});
});

describe("generateChangelog", () => {
	if (!gitAvailable) {
		it.skip("skipped: git is not available", () => {});
		return;
	}
	let tmp;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-gen-"));
		initRepo(tmp, { initialBranch: "master" });
		commitFile(tmp, "a.txt", "a", "first\n\nFirst body.");
		commitFile(tmp, "b.txt", "b", "second");
		commitFile(tmp, "c.txt", "c", "third");
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("bakes newest-first entries with metadata and truncation flags", () => {
		const artifact = generateChangelog({ cwd: tmp, limit: 2 });
		expect(artifact.branch).toBe("master");
		expect(artifact.limit).toBe(2);
		expect(artifact.totalCount).toBe(3);
		expect(artifact.truncated).toBe(true);
		expect(artifact.commit).toMatch(/^[0-9a-f]{40}$/);
		expect(Date.parse(artifact.generatedAt)).not.toBeNaN();
		expect(artifact.entries.map((e) => e.subject)).toEqual(["third", "second"]);
		expect(artifact.entries[0].shortSha).toHaveLength(7);
	});

	it("reports truncated:false when history fits the limit", () => {
		const artifact = generateChangelog({ cwd: tmp, limit: 10 });
		expect(artifact.totalCount).toBe(3);
		expect(artifact.truncated).toBe(false);
		expect(artifact.entries).toHaveLength(3);
	});

	it("uses DEFAULT_LIMIT when no limit is given", () => {
		const artifact = generateChangelog({ cwd: tmp });
		expect(artifact.limit).toBe(DEFAULT_LIMIT);
		expect(artifact.entries).toHaveLength(3);
	});

	it("rejects invalid limits and unsafe refs", () => {
		expect(() => generateChangelog({ cwd: tmp, limit: 0 })).toThrow("positive integer");
		expect(() => generateChangelog({ cwd: tmp, ref: "--flag" })).toThrow("unsafe ref");
	});

	it("throws a clear error for a missing ref", () => {
		expect(() => generateChangelog({ cwd: tmp, ref: "nope" })).toThrow("failed");
	});

	it("round-trips through DeployManager.readChangelog shape validation", async () => {
		const { DeployManager } = await import("./deployManager.js");
		const prodDir = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-prod-"));
		try {
			const artifact = generateChangelog({ cwd: tmp, limit: 2 });
			fs.writeFileSync(path.join(prodDir, "changelog.json"), JSON.stringify(artifact));
			const manager = new DeployManager({ repoRoot: tmp, deployDir: tmp, prodDir });
			const read = manager.readChangelog();
			expect(read.branch).toBe("master");
			expect(read.totalCount).toBe(3);
			expect(read.entries.map((e) => e.subject)).toEqual(["third", "second"]);
		} finally {
			fs.rmSync(prodDir, { recursive: true, force: true });
		}
	});
});

describe("generate-changelog CLI", () => {
	if (!gitAvailable) {
		it.skip("skipped: git is not available", () => {});
		return;
	}
	let tmp;
	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "changelog-cli-"));
		initRepo(tmp, { initialBranch: "master" });
		commitFile(tmp, "a.txt", "a", "cli commit");
	});
	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	const scriptPath = path.resolve(import.meta.dirname, "../scripts/generate-changelog.mjs");

	it("writes a valid artifact file with --out", () => {
		const out = path.join(tmp, "changelog.json");
		const result = spawnSync(
			process.execPath,
			[scriptPath, "--cwd", tmp, "--limit", "5", "--out", out],
			{ encoding: "utf8" },
		);
		expect(result.status).toBe(0);
		const artifact = JSON.parse(fs.readFileSync(out, "utf8"));
		expect(artifact.branch).toBe("master");
		expect(artifact.entries).toHaveLength(1);
		expect(artifact.entries[0].subject).toBe("cli commit");
	});

	it("prints JSON to stdout without --out", () => {
		const result = spawnSync(process.execPath, [scriptPath, "--cwd", tmp, "--limit", "5"], {
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		const artifact = JSON.parse(result.stdout);
		expect(artifact.totalCount).toBe(1);
	});

	it("exits non-zero with a clear stderr for a missing ref", () => {
		const result = spawnSync(
			process.execPath,
			[scriptPath, "--cwd", tmp, "--ref", "missing-branch"],
			{ encoding: "utf8" },
		);
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("generate-changelog:");
	});
});
