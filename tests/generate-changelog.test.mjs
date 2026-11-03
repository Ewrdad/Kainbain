import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	DEFAULT_LIMIT,
	FIELD_SEP,
	RECORD_SEP,
	filterChangelogEntries,
	generateChangelog,
	isAdminCommitSubject,
	isSafeRef,
	parseGitLog,
} from "../scripts/generate-changelog.mjs";

/***
 * MARK: generate-changelog tests
 * @description Bake-time changelog filter tests (task-merge history for the
 *   Now Playing bar `#buildhash` dialog): admin/automation subjects are
 *   dropped, human task work survives, newest-first order is preserved, and
 *   `generateChangelog` pages past noise to fill its limit against a real
 *   throwaway git repo.
 * @example run `node --test tests/generate-changelog.test.mjs`
 ***/

function rawEntry({ sha, short, author, email, date, subject, body }) {
	return (
		[sha, short, author, email, date, subject, body ?? ""].join(FIELD_SEP) + RECORD_SEP
	);
}

describe("isAdminCommitSubject", () => {
	it("drops KainBain automation sync subjects", () => {
		assert.equal(isAdminCommitSubject("KainBain: auto-commit pending work on 'main'"), true);
		assert.equal(
			isAdminCommitSubject("KainBain: merge latest main into 'kb/abc' (sync task branch)"),
			true,
		);
	});

	it("drops runner stage-output subjects", () => {
		assert.equal(
			isAdminCommitSubject("kb/91257d62-f181-4ee0-ab91-f00188221c78 3: Runner local-alpha stage output"),
			true,
		);
		assert.equal(isAdminCommitSubject("kb/2b2c7858-604c-42dc-8a16-6b0f97210a3a 5: Runner output"), true);
	});

	it("drops merge remote-tracking noise case-insensitively", () => {
		assert.equal(
			isAdminCommitSubject("Merge remote-tracking branch 'origin/main' into kb/abc"),
			true,
		);
		assert.equal(isAdminCommitSubject("merge remote-tracking branch 'origin/main'"), true);
	});

	it("keeps human task work and real merges", () => {
		for (const subject of [
			"Harden runner log transport and live fan-out (stage cleanup)",
			"Squash-merge task branches with task-details commits",
			"CI: publish/update/install split with asymmetric updates and ad-site sync",
			"docs(research): human-graded finetune data flywheel spike",
			"Merge main: keep model-reporting fix alongside CI workdir changes",
			"Fix exit-78 on publish stages: worktree guard by path",
		]) {
			assert.equal(isAdminCommitSubject(subject), false, subject);
		}
	});

	it("treats empty and non-string subjects as admin (never bake a blank row)", () => {
		assert.equal(isAdminCommitSubject(""), true);
		assert.equal(isAdminCommitSubject("   "), true);
		assert.equal(isAdminCommitSubject(null), true);
		assert.equal(isAdminCommitSubject(undefined), true);
	});

	it("does not confuse lookalike prefixes with admin markers", () => {
		assert.equal(isAdminCommitSubject("KainBainish: not the automation prefix"), false);
		assert.equal(isAdminCommitSubject("kb-notes: a human note, no uuid"), false);
		assert.equal(isAdminCommitSubject("Merge branch 'feature' into main"), false);
	});
});

describe("filterChangelogEntries", () => {
	it("drops admin entries and preserves newest-first order", () => {
		const entries = [
			{ sha: "c3", subject: "Newest human fix" },
			{ sha: "c2", subject: "KainBain: auto-commit engine snapshots" },
			{ sha: "c1", subject: "kb/aaaa1111-bbbb-4ccc-8ddd-eeeeeeeeeeee 3: Runner stage output" },
			{ sha: "c0", subject: "Older human fix" },
		];
		assert.deepEqual(
			filterChangelogEntries(entries).map((entry) => entry.sha),
			["c3", "c0"],
		);
	});

	it("tolerates non-array and malformed input", () => {
		assert.deepEqual(filterChangelogEntries(null), []);
		assert.deepEqual(filterChangelogEntries([{ sha: "x" }]), []);
	});
});

describe("parseGitLog plus filter round-trip", () => {
	it("parses the baked format and filters to task-merge history", () => {
		const raw =
			rawEntry({
				sha: "aaa",
				short: "aaa",
				author: "Dev",
				email: "d@e.c",
				date: "2026-10-01T00:00:00Z",
				subject: "Human fix",
			}) +
			rawEntry({
				sha: "bbb",
				short: "bbb",
				author: "Runner",
				email: "r@e.c",
				date: "2026-09-30T00:00:00Z",
				subject: "KainBain: auto-commit pending work",
			});
		const parsed = parseGitLog(raw);
		assert.equal(parsed.length, 2);
		assert.deepEqual(
			filterChangelogEntries(parsed).map((entry) => entry.sha),
			["aaa"],
		);
	});
});

describe("generateChangelog against a throwaway repo", () => {
	function makeRepo(subjects) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-changelog-test-"));
		execFileSync("git", ["init", "-b", "master"], { cwd: dir });
		execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
		execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
		for (const subject of subjects) {
			fs.writeFileSync(path.join(dir, "file.txt"), `${subject}\n`, "utf8");
			execFileSync("git", ["add", "file.txt"], { cwd: dir });
			execFileSync("git", ["commit", "-m", subject, "--allow-empty"], { cwd: dir });
		}
		return dir;
	}

	it("pages past noise to fill the limit and counts only kept commits", () => {
		const dir = makeRepo([
			"Human fix one",
			"KainBain: auto-commit pending work on 'main'",
			"kb/11111111-2222-4aaa-8bbb-cccccccccccc 3: Runner stage output",
			"Human fix two",
			"Merge remote-tracking branch 'origin/main'",
		]);
		try {
			const artifact = generateChangelog({ cwd: dir, ref: "master", limit: 2 });
			assert.equal(artifact.branch, "master");
			assert.deepEqual(
				artifact.entries.map((entry) => entry.subject),
				["Human fix two", "Human fix one"],
			);
			assert.equal(artifact.totalCount, 2);
			assert.equal(artifact.truncated, false);
			assert.match(artifact.commit, /^[0-9a-f]{40}$/);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("marks truncation when kept history exceeds the limit", () => {
		const dir = makeRepo(["Human fix one", "Human fix two", "Human fix three"]);
		try {
			const artifact = generateChangelog({ cwd: dir, ref: "master", limit: 2 });
			assert.equal(artifact.entries.length, 2);
			assert.equal(artifact.totalCount, 3);
			assert.equal(artifact.truncated, true);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("supports an unfiltered bake for debugging", () => {
		const dir = makeRepo(["Human fix one", "KainBain: auto-commit pending work on 'main'"]);
		try {
			const artifact = generateChangelog({ cwd: dir, ref: "master", limit: 5, filter: false });
			assert.equal(artifact.entries.length, 2);
			assert.equal(artifact.totalCount, 2);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("still validates refs and limits", () => {
		assert.throws(() => generateChangelog({ cwd: ".", ref: "--upload-pack=x", limit: 5 }));
		assert.throws(() => generateChangelog({ cwd: ".", ref: "master", limit: 0 }));
		assert.equal(isSafeRef("master"), true);
		assert.equal(DEFAULT_LIMIT, 200);
	});
});
