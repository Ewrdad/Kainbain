import { describe, it, expect } from "vitest";
import { DEFAULT_LIMIT, MAX_BODY_CHARS, FIELD_SEP, RECORD_SEP } from "../shared/changelogHistory/changelogLimits.js";
import { buildChangelogGitFormat } from "../shared/changelogHistory/changelogGitFormat.js";
import { isAdminCommitSubject } from "../shared/changelogHistory/isAdminCommitSubject.js";
import { filterChangelogEntries } from "../shared/changelogHistory/filterChangelogEntries.js";
import { parseGitLog } from "../shared/changelogHistory/parseGitLog.js";

/***
 * MARK: changelogHistory shared tests
 * @description Pins the one home of the changelog taxonomy, parser, and
 *   bounds that both the deploy-time baker and the serve-time live fallback
 *   read. A drift here (a sync-merge shape the filter misses, a parser that
 *   drops bodies) ships straight into the Now Playing bar's dialog.
 * @example run `npm run test --prefix api`
 ***/
describe("isAdminCommitSubject", () => {
	it.each([
		"KainBain: auto-commit pending work on 'main'",
		"KainBain: converge latest main into task branch",
		"kb/91257d62-f181-4ee0-ab91-f00188221c78 5: Runner local-alpha stage output",
		"kb/91257d62 stage-1792767028679: Runner local-alpha stage output",
		"Merge remote-tracking branch 'origin/main'",
		"Merge remote-tracking branch 'origin/main' into kb/91257d62-2026",
		"Merge branch 'main' into kb/2b990c4f-2026",
		"Merge origin/main into kb/e3b2624a-2026: resolve merge conflict",
		"",
		"   ",
	])("hides automation noise %j", (subject) => {
		expect(isAdminCommitSubject(subject)).toBe(true);
	});

	it.each([null, undefined, 42, {}, []])("hides unknown shapes %j (fail safe, never ships a broken row)", (subject) => {
		expect(isAdminCommitSubject(subject)).toBe(true);
	});

	it.each([
		"Harden runner log transport and live fan-out",
		"Squash-merge task branches with task-details commits",
		"Merge main: keep the model-reporting fix alongside CI workdir changes",
		"Fix Runner-dispatched Publish: deploy.sh re-runs in primary",
	])("keeps shipped work %j", (subject) => {
		expect(isAdminCommitSubject(subject)).toBe(false);
	});
});

describe("filterChangelogEntries", () => {
	it("drops noise and keeps newest-first order", () => {
		const kept = { subject: "Fix the queue chip" };
		const entries = [{ subject: "KainBain: sync" }, kept, { subject: "Merge branch 'x' into kb/aaaaaaaa-1111" }];
		expect(filterChangelogEntries(entries)).toEqual([kept]);
	});

	it("reads a non-list as an empty changelog instead of throwing", () => {
		expect(filterChangelogEntries(null)).toEqual([]);
		expect(filterChangelogEntries(undefined)).toEqual([]);
	});
});

describe("buildChangelogGitFormat", () => {
	it("emits the seven parseGitLog fields in order with git escapes", () => {
		expect(buildChangelogGitFormat()).toBe(
			"%H%x00%h%x00%an%x00%ae%x00%aI%x00%s%x00%b%x1e",
		);
	});

	it("carries no literal separator bytes (argv cannot hold NUL)", () => {
		const format = buildChangelogGitFormat();
		expect(format).not.toContain(FIELD_SEP);
		expect(format).not.toContain(RECORD_SEP);
	});

	it("round-trips through parseGitLog the way git stdout does", () => {
		// Git decodes the %x00/%x1e escapes back to FIELD_SEP/RECORD_SEP in
		// its stdout; parsing that output must yield the fields in order.
		const raw =
			["aaa", "aaa", "Dev", "d@e.c", "2026-09-30", "Fix it", "body text"].join(FIELD_SEP) +
			RECORD_SEP;
		const [entry] = parseGitLog(raw);
		expect(entry).toMatchObject({
			sha: "aaa",
			shortSha: "aaa",
			subject: "Fix it",
			body: "body text",
			author: "Dev",
			authorEmail: "d@e.c",
			date: "2026-09-30",
		});
	});
});

describe("changelog bounds and parser parity", () => {
	it("keeps the bake/serve contract bounds", () => {
		expect(DEFAULT_LIMIT).toBe(200);
		expect(MAX_BODY_CHARS).toBe(500);
	});

	it("parses one record and caps the body", () => {
		const raw = ["sha1", "sha1", "Dev", "d@e.c", "2026-09-30", "Fix it", "b".repeat(600)].join("\x00") + "\x1e";
		const [entry] = parseGitLog(raw);
		expect(entry.subject).toBe("Fix it");
		expect(entry.body).toHaveLength(MAX_BODY_CHARS);
		expect(entry.bodyTruncated).toBe(true);
	});
});
