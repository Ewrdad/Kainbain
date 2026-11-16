#!/usr/bin/env node
/***
 * MARK: check-binary-guard.mjs
 * @description Fail-fast local guard against binary corruption (prevention
 *   follow-on to task b1c069e0's proof-hygiene detector): checks the magic
 *   bytes of binary files the agent actually touched — staged and unstaged
 *   worktree changes, or explicit paths — so a text-path rewrite of a PNG
 *   fails in seconds on the agent's own machine instead of after a 15+
 *   minute CI run. The detector (`scripts/check-proof-and-hygiene.mjs`)
 *   stays the CI gate for proof paths; this guard is the pre-handoff
 *   preflight (`npm run check:binaries`) and the pre-commit hook
 *   (`scripts/githooks/pre-commit`, `--staged` mode).
 *   Coverage is data, not code branches: every image extension from the
 *   detector's MAGIC_TABLE (single source of truth, imported) plus an
 *   extendable archive list (zip/gz/tgz today). Future taggable types slot
 *   in as one table row. Unknown extensions and files that vanish
 *   mid-scan are skipped, never failed; an UNREADABLE binary fails, so an
 *   unverifiable file can never pass. Deleted files are skipped (there are
 *   no bytes left to verify). Dependency-free (Node stdlib only). An
 *   invocation that cannot run (bad flag, missing `--root` directory, or a
 *   changed-file scan outside a git repository) exits 2 — never a false
 *   PASS. Tool-level blocking of text-tool writes by extension is a
 *   deliberate follow-on (no clean harness interception point exists
 *   without touching live agent runs); this guard plus the documented
 *   capture recipe is the fail-fast layer.
 * @example node scripts/check-binary-guard.mjs (changed binaries vs git, exit 0 when clean)
 * @example node scripts/check-binary-guard.mjs --staged (staged binaries only, for the pre-commit hook)
 * @example node scripts/check-binary-guard.mjs --root /tmp/tree docs/tasks/demo/p.png (explicit paths)
 ***/

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MAGIC_TABLE, toPosix } from "./check-proof-and-hygiene.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

/***
 * MARK: EXTRA_MAGIC
 * @description Magic bytes for guarded binary extensions beyond the
 *   detector's image set, as lowercase hex strings. Zip archives start
 *   with `504b0304` ("PK\x03\x04"); gzip streams (`.gz`, and `.tgz` which
 *   is a gzipped tar) start with `1f8b`. Extend this table — not the code
 *   below — when new taggable binary types arrive.
 ***/
export const EXTRA_MAGIC = {
	".zip": "504b0304",
	".gz": "1f8b",
	".tgz": "1f8b",
};

/***
 * MARK: BINARY_MAGIC
 * @description Expected leading magic bytes per guarded lowercase
 *   extension: the detector's MAGIC_TABLE (images, single source of
 *   truth) plus EXTRA_MAGIC (archives). WebP keeps the detector's
 *   `RIFF-half-WEBP-half` form and its 12-byte comparison.
 ***/
export const BINARY_MAGIC = {
	...MAGIC_TABLE,
	...EXTRA_MAGIC,
};

const GUARDED_EXTS = new Set(Object.keys(BINARY_MAGIC));

/***
 * MARK: binaryMagicForExtension
 * @description Expected magic hex for an extension (case-insensitive, with
 *   or without the leading dot), or null when the extension is not a
 *   guarded binary type.
 * @example binaryMagicForExtension(".png") => "89504e47"
 * @example binaryMagicForExtension("ZIP") => "504b0304"
 * @example binaryMagicForExtension(".svg") => null
 * @param {string} ext - File extension such as ".png" or "png".
 * @returns {string|null} Lowercase hex magic, or null when unguarded.
 ***/
export function binaryMagicForExtension(ext) {
	if (typeof ext !== "string" || ext.length === 0) return null;
	const lowered = ext.toLowerCase();
	const normalized = lowered.startsWith(".") ? lowered : `.${lowered}`;
	return BINARY_MAGIC[normalized] ?? null;
}

/***
 * MARK: isGuardedPath
 * @description Whether a repo-relative path is a guarded binary: any path
 *   whose extension is in BINARY_MAGIC. Deliberately broader than the
 *   detector's proof paths — the guard follows the agent's changed files
 *   wherever they are, so a corrupted asset outside docs/ still fails
 *   fast locally.
 * @example isGuardedPath("docs/tasks/abc/pretty-proof.png") => true
 * @example isGuardedPath("frontend/src/logo.png") => true
 * @example isGuardedPath("docs/tasks/abc/notes.md") => false
 * @param {string} relPath - Repo-relative path.
 * @returns {boolean} True when the path's bytes are magic-checked.
 ***/
export function isGuardedPath(relPath) {
	if (typeof relPath !== "string" || relPath.length === 0) return false;
	const ext = path.posix.extname(toPosix(relPath)).toLowerCase();
	return GUARDED_EXTS.has(ext);
}

/***
 * MARK: checkBinaryMagic
 * @description Reads the leading bytes of a file and compares them against
 *   the expected magic for its extension. Unknown extensions and files
 *   that vanished between listing and reading (ENOENT) return
 *   `{ ok: true, skipped }` — the guard never fails on what it does not
 *   understand or can no longer see. Any other read error (permission
 *   denied, EISDIR) FAILS with `readError`: an unverifiable binary must
 *   not pass, or chmodding a corrupt file would evade the guard.
 * @example checkBinaryMagic("/repo/docs/tasks/x/ok.png") => { ok: true, ... }
 * @param {string} absPath - Absolute file path.
 * @returns {{ ok: boolean, expected: string|null, actual: string|null, skipped?: string, readError?: string }}
 ***/
export function checkBinaryMagic(absPath) {
	const ext = path.extname(absPath).toLowerCase();
	const expected = binaryMagicForExtension(ext);
	if (expected === null) {
		return { ok: true, expected: null, actual: null, skipped: `unknown extension ${ext || "(none)"}` };
	}
	let head;
	try {
		const fd = fs.openSync(absPath, "r");
		try {
			const size = ext === ".webp" ? 12 : 8;
			const buf = Buffer.alloc(size);
			const read = fs.readSync(fd, buf, 0, size, 0);
			head = buf.subarray(0, read);
		} finally {
			fs.closeSync(fd);
		}
	} catch (err) {
		if (err && err.code === "ENOENT") {
			return { ok: true, expected, actual: null, skipped: "file vanished between listing and reading" };
		}
		const reason = err && err.code ? `${err.code}: ${absPath}` : `read failed: ${absPath}`;
		return { ok: false, expected, actual: null, readError: reason };
	}
	if (ext === ".webp") {
		const actual = head.toString("hex");
		const ok = head.length >= 12
			&& head.subarray(0, 4).toString("hex") === "52494646"
			&& head.subarray(8, 12).toString("hex") === "57454250";
		return { ok, expected, actual };
	}
	const actual = head.toString("hex").toLowerCase();
	const ok = actual.startsWith(expected.toLowerCase());
	return { ok, expected, actual };
}

/***
 * MARK: formatGuardFailure
 * @description One-line violation text naming the file, expected vs actual
 *   magic (the `ef bf bd` text-round-trip signature when that is what
 *   corrupted it), and the concrete safe remedy: re-capture through the
 *   capture script or restore binary-safely, then re-verify. Never prints
 *   a bare null/undefined: an unreadable file gets a distinct
 *   placeholder.
 * @example formatGuardFailure({ relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "efbfbd50" })
 * @param {{ relPath: string, expected: string, actual?: string, readError?: string }} violation
 * @returns {string} Single-line failure message.
 ***/
export function formatGuardFailure(violation) {
	let seen;
	if (typeof violation.actual === "string" && violation.actual.length > 0) {
		seen = violation.actual;
	} else if (typeof violation.readError === "string" && violation.readError.length > 0) {
		seen = `(unreadable: ${violation.readError})`;
	} else {
		seen = "(empty or unreadable head)";
	}
	return `${violation.relPath}: expected magic ${violation.expected}, found ${seen} `
		+ `(binary file was rewritten through a text path — never create, edit, or restore binaries with text tools; `
		+ `re-capture via node scripts/capture-screenshot.mjs --out ${violation.relPath} `
		+ `or restore binary-safely via git checkout <ref> -- ${violation.relPath}, `
		+ `then re-verify with xxd -l 8 and file)`;
}

/***
 * MARK: parsePorcelainZero
 * @description Parses `git status --porcelain -z` output into repo-relative
 *   paths. Rename/copy records carry a second NUL-terminated field (the
 *   source path, in reversed `to from` order) which is consumed and
 *   dropped — only the current path has bytes worth checking. Records
 *   deleted on either side (`D` in X or Y) are dropped: deleting a file
 *   needs no byte verification.
 * @example parsePorcelainZero("?? new.png\\0") => ["new.png"]
 * @param {string} raw - Raw stdout of git status --porcelain -z.
 * @returns {string[]} Repo-relative paths with live worktree bytes.
 ***/
export function parsePorcelainZero(raw) {
	const fields = raw.split("\0");
	const out = [];
	for (let i = 0; i < fields.length; i++) {
		const field = fields[i];
		if (field.length < 4) continue;
		const x = field[0];
		const y = field[1];
		if (x === "R" || y === "R" || x === "C" || y === "C") {
			i++;
		}
		if (x === "D" || y === "D") continue;
		out.push(field.slice(3));
	}
	return out;
}

/***
 * MARK: listChangedFiles
 * @description Lists files with live bytes the agent touched: staged plus
 *   unstaged worktree changes by default (`git status --porcelain -z
 *   --untracked-files=all`), or staged changes only with `stagedOnly`
 *   (`git diff --cached`, the pre-commit-hook path, deletes excluded by
 *   `--diff-filter`). Deleted files never appear: there are no bytes left
 *   to verify. Throws a helpful error outside a git repository — callers
 *   turn that into exit 2, never a false PASS.
 * @example listChangedFiles({ root: "/repo" }) => [{ relPath, absPath }, ...]
 * @param {Object} [opts]
 * @param {string} [opts.root] - Repo root to scan (must be a git checkout).
 * @param {boolean} [opts.stagedOnly] - List staged changes only.
 * @returns {Array<{ relPath: string, absPath: string }>} Changed files.
 ***/
export function listChangedFiles({ root = REPO_ROOT, stagedOnly = false } = {}) {
	let raw;
	try {
		raw = stagedOnly
			? execFileSync(
				"git",
				["-C", root, "diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			)
			: execFileSync(
				"git",
				["-C", root, "status", "--porcelain", "-z", "--untracked-files=all"],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			);
	} catch {
		throw new Error(
			`git ${stagedOnly ? "diff --cached" : "status"} failed for ${root} (not a git repository?); `
			+ "pass explicit file paths to check instead",
		);
	}
	const relPaths = stagedOnly
		? raw.split("\0").filter((entry) => entry.length > 0)
		: parsePorcelainZero(raw);
	return relPaths.map((relPath) => ({
		relPath: toPosix(relPath),
		absPath: path.join(root, relPath),
	}));
}

/***
 * MARK: checkPaths
 * @description Magic-checks a candidate file list, skipping unguarded
 *   extensions. Pure over its inputs except for filesystem reads.
 * @example checkPaths([{ relPath: "a.png", absPath: "/repo/a.png" }]) => []
 * @param {Array<{ relPath: string, absPath: string }>} candidates
 * @returns {Array<{ relPath: string, expected: string, actual: string, readError?: string }>} Violations.
 ***/
export function checkPaths(candidates) {
	const violations = [];
	for (const { relPath, absPath } of candidates) {
		if (!isGuardedPath(relPath)) continue;
		const result = checkBinaryMagic(absPath);
		if (!result.ok) {
			violations.push({
				relPath,
				expected: result.expected,
				actual: result.actual,
				readError: result.readError,
			});
		}
	}
	return violations;
}

/***
 * MARK: main
 * @description CLI: checks the magic bytes of changed binaries (default),
 *   staged binaries (`--staged`, the pre-commit-hook path), or explicit
 *   positional paths; prints one line per violation with its remedy and
 *   exits 1 when any binary is corrupt, 0 with a one-line PASS summary
 *   when clean. `--root <dir>` resolves the scan and explicit paths
 *   against a fixture tree (used by tests); `--help` prints usage.
 *   Unknown flags and a missing or non-directory `--root` exit 2, as does
 *   a changed-file scan outside a git repository — a scan that cannot run
 *   must never report a false PASS.
 * @example main(["node", "check-binary-guard.mjs", "--staged"])
 * @param {string[]} [argv] - Process argv; defaults to process.argv.
 * @returns {number} Process exit code (0 clean, 1 corrupt, 2 usage error).
 ***/
export function main(argv = process.argv) {
	const args = argv.slice(2);
	if (args.includes("--help") || args.includes("-h")) {
		console.log("Usage: node scripts/check-binary-guard.mjs [--staged] [--root <dir>] [path ...]");
		console.log("Fail-fast local guard: magic-checks changed binaries (or explicit paths) before handoff/commit.");
		console.log("  --staged  check staged binaries only (pre-commit hook path).");
		console.log("Exit codes: exit 0 clean, exit 1 corrupt binary found, exit 2 usage error.");
		return 0;
	}
	let stagedOnly = false;
	const rootValues = [];
	const positionalPaths = [];
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--staged") {
			stagedOnly = true;
		} else if (arg === "--root") {
			const value = args[i + 1];
			if (!value || value.startsWith("-")) {
				console.error("error: --root requires a directory argument");
				return 2;
			}
			rootValues.push(value);
			i++;
		} else if (arg.startsWith("--root=")) {
			const value = arg.slice("--root=".length);
			if (!value) {
				console.error("error: --root requires a directory argument");
				return 2;
			}
			rootValues.push(value);
		} else if (arg.startsWith("-")) {
			console.error(`error: unknown flag ${arg} (usage: [--staged] [--root <dir>] [path ...])`);
			return 2;
		} else {
			positionalPaths.push(arg);
		}
	}
	let root = REPO_ROOT;
	if (rootValues.length > 0) {
		root = path.resolve(rootValues[rootValues.length - 1]);
	}
	try {
		if (!fs.statSync(root).isDirectory()) {
			console.error(`error: --root ${root} is not a readable directory`);
			return 2;
		}
	} catch {
		console.error(`error: --root ${root} is not a readable directory`);
		return 2;
	}
	let candidates;
	if (positionalPaths.length > 0) {
		candidates = positionalPaths.map((relPath) => ({
			relPath: toPosix(relPath),
			absPath: path.resolve(root, relPath),
		}));
	} else {
		try {
			candidates = listChangedFiles({ root, stagedOnly });
		} catch (err) {
			console.error(`error: ${err.message}`);
			return 2;
		}
	}
	const violations = checkPaths(candidates);
	if (violations.length > 0) {
		const plural = violations.length === 1 ? "binary" : "binaries";
		console.error(`binary-guard check FAILED (${violations.length} corrupt ${plural}):`);
		for (const violation of violations) {
			console.error(`  ${formatGuardFailure(violation)}`);
		}
		return 1;
	}
	const checked = candidates.filter((candidate) => isGuardedPath(candidate.relPath)).length;
	console.log(`✓ binary guard OK (${checked} ${checked === 1 ? "binary" : "binaries"} checked).`);
	return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	process.exitCode = main();
}
