#!/usr/bin/env node
/***
 * MARK: generate-changelog.mjs
 * @description Bakes KainBain's default-branch git history into a JSON artifact
 *   for production deploys. Production instances are plain file copies without
 *   `.git`, so `deploy.sh --prod` runs this script at deploy time and ships the
 *   output as `$PROD_DIR/changelog.json`; the API serves it from disk with no
 *   git dependency.
 *
 *   Every git invocation is spawned as an ARGUMENT ARRAY (never a shell
 *   string) per the `api/git.js` no-shell rule, and ref names are validated
 *   before use so a ref starting with `-` can never be consumed as a flag.
 *
 * @example node scripts/generate-changelog.mjs --limit 200 --out changelog.json
 * @example node scripts/generate-changelog.mjs --ref master --limit 5 (prints JSON to stdout)
 ***/

import { spawnSync } from "node:child_process";
import fs from "node:fs";

/***
 * MARK: changelog constants
 * @description Tunables for the baked artifact. DEFAULT_LIMIT bounds file size
 *   and dialog render cost; MAX_BODY_CHARS bounds per-entry bodies (KainBain
 *   auto-commit messages embed whole task prompts, averaging ~3KB — uncapped
 *   bodies push 200 entries to ~675KB, truncated to ~140KB).
 ***/
export const DEFAULT_LIMIT = 200;
export const MAX_BODY_CHARS = 500;
export const FIELD_SEP = "\x00";
export const RECORD_SEP = "\x1e";

// %H sha, %h short, %an author, %ae email, %aI iso date, %s subject, %b body.
const LOG_FORMAT = ["%H", "%h", "%an", "%ae", "%aI", "%s", "%b"].join("%x00") + "%x1e";

/***
 * MARK: isSafeRef
 * @description Validates a git ref name with the same conservative allow-list
 *   as `isValidBranchName` in `api/git.js`: letters, digits, `_`, `-`, `.`,
 *   `/`; must not start with `-`, `/`, `.` (flag injection / hidden refs) and
 *   must not contain `..`, `//`, `@{`, or end with `/`, `.`, `.lock`.
 * @example isSafeRef('master') => true
 * @example isSafeRef('--upload-pack=x') => false
 * @param {string} ref
 * @returns {boolean}
 ***/
export function isSafeRef(ref) {
	if (typeof ref !== "string") return false;
	if (ref.length === 0 || ref.length > 255) return false;
	if (!/^[A-Za-z0-9_./-]+$/.test(ref)) return false;
	if (ref.startsWith("-") || ref.startsWith("/") || ref.startsWith(".")) return false;
	if (ref.endsWith("/") || ref.endsWith(".") || ref.endsWith(".lock")) return false;
	if (ref.includes("..") || ref.includes("//") || ref.includes("@{")) return false;
	return true;
}

/***
 * MARK: runGit
 * @description Runs one git command via argv array (no shell) and returns
 *   stdout. Throws an Error carrying stderr on non-zero exit.
 * @example runGit('/repo', ['rev-parse', '--verify', 'master']) => 'abc...'
 * @param {string} cwd - Working directory for the command.
 * @param {string[]} args - Argument array.
 * @returns {string} Trimmed stdout.
 ***/
export function runGit(cwd, args) {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.error) {
		throw new Error(`git ${args.join(" ")} failed to start: ${result.error.message}`);
	}
	if (result.status !== 0) {
		const detail = String(result.stderr || result.stdout || "").trim() || "no output";
		throw new Error(`git ${args.join(" ")} failed (exit ${result.status}): ${detail}`);
	}
	return String(result.stdout || "");
}

/***
 * MARK: resolveDefaultBranch
 * @description Resolves which branch to bake: local `master` first, then local
 *   `main`, then the `origin/HEAD` symbolic target. Strict: throws when none
 *   resolves so the caller (deploy.sh) can record a `generation-failed` marker
 *   instead of baking the wrong history. (Deliberately stricter than the
 *   lenient `defaultBranch()` in `api/git.js`, which falls back silently.)
 * @example resolveDefaultBranch('/repo') => 'master'
 * @param {string} cwd - Repository working directory.
 * @returns {string} The resolved branch name.
 ***/
export function resolveDefaultBranch(cwd) {
	for (const name of ["master", "main"]) {
		const probe = spawnSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], {
			cwd,
			encoding: "utf8",
		});
		if (!probe.error && probe.status === 0) return name;
	}
	const head = spawnSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD"], {
		cwd,
		encoding: "utf8",
	});
	if (!head.error && head.status === 0) {
		const branch = String(head.stdout || "").replace("refs/remotes/origin/", "").trim();
		if (isSafeRef(branch)) {
			const verify = spawnSync("git", ["rev-parse", "--verify", "--quiet", branch], {
				cwd,
				encoding: "utf8",
			});
			if (!verify.error && verify.status === 0) return branch;
		}
	}
	throw new Error(
		"Cannot resolve default branch: no local 'master' or 'main' and no refs/remotes/origin/HEAD",
	);
}

/***
 * MARK: admin commit taxonomy
 * @description Bake-time filter so the shipped changelog shows task-merge
 *   history only. Derived from a taxonomy pass over real history (Step 1):
 *   `KainBain:` subjects are automation (auto-commit, converge, merge-latest
 *   sync); `kb/<uuid>` subjects are runner stage-output commits; `Merge
 *   remote-tracking branch` subjects are branch-sync noise. Everything else
 *   (human task work, squash-merge subjects, real merges) is kept.
 * @example isAdminCommitSubject('KainBain: auto-commit pending work') => true
 * @example isAdminCommitSubject('Harden runner log transport') => false
 * @param {string} subject - The commit subject line.
 * @returns {boolean} True when the commit is admin/automation noise to drop.
 ***/
export function isAdminCommitSubject(subject) {
	if (typeof subject !== "string") return true;
	const line = subject.trim();
	if (line.length === 0) return true;
	if (line.startsWith("KainBain:")) return true;
	if (/^kb\/[0-9a-f-]{8,}/i.test(line)) return true;
	if (/^merge remote-tracking branch\b/i.test(line)) return true;
	return false;
}

/***
 * MARK: filterChangelogEntries
 * @description Drops admin/automation entries (see `isAdminCommitSubject`)
 *   from an already-parsed entry list, preserving newest-first order.
 * @example filterChangelogEntries([{ subject: 'KainBain: sync' }]) => []
 * @param {Array<Object>} entries - Parsed changelog entries, newest first.
 * @returns {Array<Object>} The kept entries, newest first.
 ***/
export function filterChangelogEntries(entries) {
	if (!Array.isArray(entries)) return [];
	return entries.filter((entry) => !isAdminCommitSubject(entry?.subject));
}

/***
 * MARK: parseGitLog
 * @description Parses NUL/RS-delimited `git log` output into changelog entries,
 *   newest-first as emitted. Bodies are truncated to MAX_BODY_CHARS with a
 *   `bodyTruncated` flag; malformed records (short fields, empty SHA) are
 *   skipped rather than failing the whole bake.
 * @example parseGitLog(raw) => [{ sha, shortSha, subject, body, bodyTruncated, author, authorEmail, date }]
 * @param {string} raw - Raw stdout from the git log invocation.
 * @returns {Array<Object>} Parsed entries, newest first.
 ***/
export function parseGitLog(raw) {
	if (typeof raw !== "string" || raw.length === 0) return [];
	const entries = [];
	for (const record of raw.split(RECORD_SEP)) {
		if (!record.trim()) continue;
		const fields = record.split(FIELD_SEP);
		if (fields.length < 7) continue;
		const [sha, shortSha, author, authorEmail, date, subject, ...bodyParts] = fields;
		if (!sha || !sha.trim()) continue;
		// A body containing a literal NUL is near-impossible (git truncates
		// messages at NUL), but rejoin defensively so extra separators never
		// drop body text.
		const body = bodyParts.join(FIELD_SEP).replace(/^\n/, "").replace(/\s+$/, "");
		const bodyTruncated = body.length > MAX_BODY_CHARS;
		entries.push({
			sha: sha.trim(),
			shortSha: (shortSha || "").trim(),
			subject: (subject || "").trim(),
			body: bodyTruncated ? body.slice(0, MAX_BODY_CHARS) : body,
			bodyTruncated,
			author: (author || "").trim(),
			authorEmail: (authorEmail || "").trim(),
			date: (date || "").trim(),
		});
	}
	return entries;
}

/***
 * MARK: generateChangelog
 * @description Builds the full changelog artifact for `ref` (resolved via
 *   `resolveDefaultBranch` when omitted): the latest `limit` task-merge
 *   entries plus bake metadata. Admin/automation noise is dropped at bake
 *   time (see `isAdminCommitSubject`), so raw history is paged until `limit`
 *   kept entries are collected or history is exhausted. `totalCount` is the
 *   kept (task-merge) commits visible at bake time; `truncated` is true when
 *   kept history extends beyond `entries`. Pass `filter: false` to bake the
 *   unfiltered history (debugging only).
 * @example generateChangelog({ cwd: '/repo', limit: 5 }) => { branch: 'master', entries: [...] }
 * @param {Object} opts
 * @param {string} [opts.cwd] - Repository working directory (defaults to process.cwd()).
 * @param {string} [opts.ref] - Branch/ref to bake (defaults to resolved default branch).
 * @param {number} [opts.limit] - Max entries to bake (defaults to DEFAULT_LIMIT).
 * @param {boolean} [opts.filter] - Drop admin commits (defaults to true).
 * @returns {Object} The changelog artifact.
 ***/
export function generateChangelog({ cwd = process.cwd(), ref, limit = DEFAULT_LIMIT, filter = true } = {}) {
	const count = Number(limit);
	if (!Number.isInteger(count) || count < 1) {
		throw new Error(`generateChangelog requires a positive integer limit, got ${String(limit)}`);
	}
	const branch = ref || resolveDefaultBranch(cwd);
	if (!isSafeRef(branch)) {
		throw new Error(`Refusing to bake unsafe ref ${String(branch)}`);
	}
	const keep = (entry) => !filter || !isAdminCommitSubject(entry?.subject);
	// Page the raw log until `count` kept entries are collected: noise-heavy
	// stretches would otherwise bake a short artifact. Each page advances
	// `--skip` past already-seen raw commits; at most ten pages bound the
	// deploy-time cost, and a short page ends history.
	const kept = [];
	let skip = 0;
	for (let page = 0; page < 10 && kept.length < count; page += 1) {
		const raw = runGit(cwd, [
			"log",
			branch,
			"-n",
			String(count),
			"--skip",
			String(skip),
			`--format=${LOG_FORMAT}`,
		]);
		const parsed = parseGitLog(raw);
		if (parsed.length === 0) break;
		skip += parsed.length;
		for (const entry of parsed) {
			if (keep(entry)) kept.push(entry);
			if (kept.length >= count) break;
		}
		if (parsed.length < count) break;
	}
	const entries = kept.slice(0, count);
	let totalCount;
	if (!filter) {
		const totalRaw = runGit(cwd, ["rev-list", "--count", branch]).trim();
		totalCount = Number.parseInt(totalRaw, 10);
		if (!Number.isInteger(totalCount) || totalCount < 0) {
			throw new Error(`Unparseable rev-list count for '${branch}': ${totalRaw}`);
		}
	} else {
		// Honest kept-commit count: subjects only (no bodies), one pass.
		const subjects = runGit(cwd, ["log", branch, "--format=%s"]).split("\n");
		totalCount = subjects.filter((subject) => !isAdminCommitSubject(subject)).length;
	}
	const commit = runGit(cwd, ["rev-parse", branch]).trim();
	return {
		generatedAt: new Date().toISOString(),
		branch,
		commit,
		totalCount,
		truncated: totalCount > entries.length,
		limit: count,
		entries,
	};
}

function printUsageAndExit(exitCode) {
	const usage = [
		"Usage: node scripts/generate-changelog.mjs [--ref <branch>] [--limit <n>] [--out <file>] [--cwd <dir>] [--no-filter]",
		"",
		"  --ref    Branch to bake (default: resolved default branch, master > main > origin/HEAD).",
		`  --limit  Max entries to bake (default: ${DEFAULT_LIMIT}).`,
		"  --out    Write JSON to <file> instead of stdout.",
		"  --cwd    Repository directory (default: current directory).",
		"  --no-filter  Bake unfiltered history (debugging only; default drops admin commits).",
	].join("\n");
	const stream = exitCode === 0 ? process.stdout : process.stderr;
	stream.write(`${usage}\n`);
	process.exit(exitCode);
}

/***
 * MARK: changelog CLI
 * @description `node scripts/generate-changelog.mjs --ref <branch> --limit 200
 *   --out <file>`: argv-parsed, non-zero exit with clear stderr when the ref is
 *   missing or git fails. Skipped on import so tests can use the pure exports.
 ***/
const invokedAsScript =
	typeof process.argv[1] === "string" && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (invokedAsScript) {
	const args = process.argv.slice(2);
	let ref;
	let limit = DEFAULT_LIMIT;
	let out;
	let cwd = process.cwd();
	let filter = true;
	try {
		for (let i = 0; i < args.length; i += 1) {
			const arg = args[i];
			if (arg === "--help" || arg === "-h") printUsageAndExit(0);
			else if (arg === "--ref") ref = args[(i += 1)];
			else if (arg === "--limit") limit = Number(args[(i += 1)]);
			else if (arg === "--out") out = args[(i += 1)];
			else if (arg === "--cwd") cwd = args[(i += 1)];
			else if (arg === "--no-filter") filter = false;
			else throw new Error(`Unknown argument: ${arg}`);
		}
		if (ref !== undefined && !isSafeRef(ref)) {
			throw new Error(`Refusing to bake unsafe ref ${String(ref)}`);
		}
		const artifact = generateChangelog({ cwd, ref, limit, filter });
		const json = `${JSON.stringify(artifact, null, 2)}\n`;
		if (out) {
			fs.writeFileSync(out, json, "utf8");
		} else {
			process.stdout.write(json);
		}
	} catch (err) {
		process.stderr.write(`generate-changelog: ${err.message}\n`);
		process.exit(1);
	}
}
