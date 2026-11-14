#!/usr/bin/env node
/***
 * MARK: check-proof-and-hygiene.mjs
 * @description Worktree-hygiene gate for proof artifacts and the repo root
 *   (task b1c069e0: the 5a38ad45 Deep Review failed on a committed
 *   `pretty-proof.png` whose first byte had been rewritten to the UTF-8
 *   replacement character by a text-oriented edit tool — magic `ef bf bd`
 *   instead of PNG `89 50 4e 47`, `file` reporting `data` — plus a dead
 *   scratch file `rt.mjs` committed at the repo root).
 *   Two rule families, one script, one failure format:
 *   (1) magic-byte validation for proof images (everything image-typed under
 *   `docs/tasks/`, plus `*-proof.*` / `screenshot*` names anywhere under
 *   `docs/`); (2) root scratch detection (`rt.*`, root `*.mjs`/`*.cjs` repro
 *   scripts, `*.log`/`*.tmp`, loose root images, `t<digits>.*` ad-hoc notes)
 *   unless the exact path is allowlisted in
 *   `scripts/allowlists/repo-root-files.json`.
 *   Reads actual bytes from disk (worktree + tracked set), so corruption
 *   introduced before staging is still caught. Unknown extensions are
 *   skipped, never failed: this is a corruption detector, not file-type
 *   police. Dependency-free (Node stdlib only).
 *   Pre-existing violations owned by other tasks (corrupt on origin/main
 *   with no valid source to restore) are recorded in
 *   `scripts/baselines/proof-hygiene-known-violations.json` — the repo's
 *   established baseline pattern (cf. jsdoc-example-missing.json) — so the
 *   gate stays green while still failing on any NEW violation. `--strict`
 *   fails on baselined entries too (acceptance rehearsal, detector proof).
 * @example node scripts/check-proof-and-hygiene.mjs (exit 0 on a clean tree)
 * @example node scripts/check-proof-and-hygiene.mjs --root /tmp/fixture-tree
 * @example node scripts/check-proof-and-hygiene.mjs --strict
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

export const ALLOWLIST_PATH = path.join(HERE, "allowlists", "repo-root-files.json");

/***
 * MARK: MAGIC_TABLE
 * @description Maps a lowercase image extension to the expected leading magic
 *   bytes as a lowercase hex string. WebP is RIFF-based: bytes 0-3 are
 *   `52494646` ("RIFF") and bytes 8-11 are `57454250` ("WEBP"), so its entry
 *   carries both halves and `checkFileMagic` compares 12 bytes for it.
 ***/
export const MAGIC_TABLE = {
	".png": "89504e47",
	".jpg": "ffd8ff",
	".jpeg": "ffd8ff",
	".gif": "47494638",
	".webp": "52494646-57454250",
};

const IMAGE_EXTS = new Set(Object.keys(MAGIC_TABLE));

/***
 * MARK: magicForExtension
 * @description Expected magic hex for an extension (case-insensitive, with or
 *   without the leading dot), or null when the extension is unknown.
 * @example magicForExtension(".png") => "89504e47"
 * @example magicForExtension("JPG") => "ffd8ff"
 * @example magicForExtension(".svg") => null
 * @param {string} ext - File extension such as ".png" or "png".
 * @returns {string|null} Lowercase hex magic, or null when unknown.
 ***/
export function magicForExtension(ext) {
	const normalized = ext.toLowerCase().startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
	return MAGIC_TABLE[normalized] ?? null;
}

/***
 * MARK: toPosix
 * @description Normalizes a repo-relative path to POSIX separators so the
 *   matchers behave identically on Windows and POSIX checkouts.
 * @example toPosix("docs\\tasks\\x.png") => "docs/tasks/x.png"
 * @param {string} relPath - Repo-relative path in any separator style.
 * @returns {string} POSIX-style relative path.
 ***/
export function toPosix(relPath) {
	return relPath.split(path.sep).join("/");
}

/***
 * MARK: isProofPath
 * @description Whether a repo-relative path is a proof image: an image
 *   extension under `docs/tasks/`, or a `screenshot*` / `*-proof.*` image
 *   name anywhere (the naming this repo already uses for proof captures).
 * @example isProofPath("docs/tasks/abc/pretty-proof.png") => true
 * @example isProofPath("docs/tasks/abc/notes.md") => false
 * @example isProofPath("api/work/icon.png") => false
 * @param {string} relPath - Repo-relative path.
 * @returns {boolean} True when the path is checked for magic bytes.
 ***/
export function isProofPath(relPath) {
	const posix = toPosix(relPath);
	const ext = path.posix.extname(posix).toLowerCase();
	if (!IMAGE_EXTS.has(ext)) return false;
	if (posix === "docs/tasks" || posix.startsWith("docs/tasks/")) return true;
	const base = path.posix.basename(posix).toLowerCase();
	if (base.startsWith("screenshot")) return true;
	if (base.includes("-proof.")) return true;
	return false;
}

/***
 * MARK: SCRATCH_PATTERNS
 * @description Scratch-shaped root filename rules: each entry carries a name
 *   used in failure messages and a test. Patterns stay scratch-shaped
 *   (ad-hoc repro stems, temp/log/note suffixes, loose images) rather than
 *   extension-broad, so a future legitimate root file does not false-fail.
 ***/
export const SCRATCH_PATTERNS = [
	{ name: "rt.*", test: (base) => base === "rt" || base.startsWith("rt.") },
	{ name: "*.mjs/*.cjs repro script", test: (base) => base.endsWith(".mjs") || base.endsWith(".cjs") },
	{ name: "*.log", test: (base) => base.endsWith(".log") },
	{ name: "*.tmp", test: (base) => base.endsWith(".tmp") },
	{ name: "loose root image", test: (base) => IMAGE_EXTS.has(path.posix.extname(base)) },
	{ name: "ad-hoc note t<digits>.*", test: (base) => /^t\d+\./.test(base) },
];

/***
 * MARK: isRootScratch
 * @description Whether a repo-relative path is a scratch file at the repo
 *   root: depth-1 (no directory part) and matching one of SCRATCH_PATTERNS,
 *   unless the exact path is allowlisted.
 * @example isRootScratch("rt.mjs", []) => true
 * @example isRootScratch("rt.mjs", ["rt.mjs"]) => false
 * @example isRootScratch("docs/tasks/x.png", []) => false
 * @param {string} relPath - Repo-relative path.
 * @param {string[]} [allowlist] - Exact repo-relative paths exempted.
 * @returns {boolean} True when the path is a root scratch violation.
 ***/
export function isRootScratch(relPath, allowlist = []) {
	const posix = toPosix(relPath);
	if (posix.includes("/")) return false;
	if (allowlist.includes(posix)) return false;
	const base = posix.toLowerCase();
	return SCRATCH_PATTERNS.some((pattern) => pattern.test(base));
}

/***
 * MARK: matchScratchPattern
 * @description Names the first SCRATCH_PATTERNS entry a root basename
 *   matches, for failure messages. Returns null when nothing matches.
 * @example matchScratchPattern("rt.mjs") => "rt.*"
 * @param {string} base - Lowercased root basename.
 * @returns {string|null} Matching pattern name or null.
 ***/
export function matchScratchPattern(base) {
	const entry = SCRATCH_PATTERNS.find((pattern) => pattern.test(base));
	return entry ? entry.name : null;
}

/***
 * MARK: checkFileMagic
 * @description Reads the leading bytes of a file and compares them against
 *   the expected magic for its extension. Missing/unreadable files and
 *   unknown extensions return `{ ok: true, skipped }` — the check never
 *   fails closed on what it does not understand.
 * @example checkFileMagic("/repo/docs/tasks/x/ok.png") => { ok: true, ... }
 * @param {string} absPath - Absolute file path.
 * @returns {{ ok: boolean, expected: string|null, actual: string|null, skipped?: string }}
 ***/
export function checkFileMagic(absPath) {
	const ext = path.extname(absPath).toLowerCase();
	const expected = magicForExtension(ext);
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
	} catch {
		return { ok: true, expected, actual: null, skipped: "unreadable or missing file" };
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
 * MARK: formatFailure
 * @description One-line violation text naming the file, expected vs actual
 *   magic (or the matched scratch pattern), and the concrete remedy.
 * @example formatFailure({ kind: "magic", relPath: "docs/tasks/x/p.png", expected: "89504e47", actual: "efbfbd50" })
 * @param {{ kind: "magic"|"scratch", relPath: string, expected?: string, actual?: string, pattern?: string }} violation
 * @returns {string} Single-line failure message.
 ***/
export function formatFailure(violation) {
	if (violation.kind === "magic") {
		return `${violation.relPath}: expected magic ${violation.expected}, found ${violation.actual} `
			+ `(binary file was rewritten through a text path; restore binary-safely via git checkout <ref> -- ${violation.relPath}, then re-verify with xxd -l 8 and file)`;
	}
	return `${violation.relPath}: root scratch file matching ${violation.pattern} `
		+ `(move to scratch/ (gitignored) or /tmp, or delete; to keep it at the root, add the exact path to scripts/allowlists/repo-root-files.json)`;
}

/***
 * MARK: loadAllowlist
 * @description Reads the root-file allowlist (exact repo-relative paths).
 *   A missing or unparsable file degrades to an empty list rather than
 *   failing the gate on its own config.
 * @example loadAllowlist("/repo") => []
 * @param {string} [root] - Repo root holding scripts/allowlists/.
 * @returns {string[]} Allowlisted exact paths.
 ***/
export function loadAllowlist(root = REPO_ROOT) {
	try {
		const raw = fs.readFileSync(path.join(root, "scripts", "allowlists", "repo-root-files.json"), "utf8");
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((entry) => typeof entry === "string");
		if (parsed && Array.isArray(parsed.allowlist)) return parsed.allowlist.filter((entry) => typeof entry === "string");
		return [];
	} catch {
		return [];
	}
}

export const BASELINE_PATH = path.join(HERE, "baselines", "proof-hygiene-known-violations.json");

/***
 * MARK: loadBaseline
 * @description Reads the known-violations baseline (entries with `relPath`
 *   plus the recorded `expected`/`actual` magic and a `note`). A missing or
 *   unparsable file degrades to an empty list — fixture trees scanned with
 *   `--root` therefore run fully strict. An entry only covers a violation
 *   whose bytes still match the recording: changed bytes re-fail as new,
 *   and a healed file passes silently.
 * @example loadBaseline("/repo") => [{ relPath: "docs/.../x.png", ... }]
 * @param {string} [root] - Repo root holding scripts/baselines/.
 * @returns {Array<{ relPath: string, expected: string|null, actual: string|null, note: string }>}
 ***/
export function loadBaseline(root = REPO_ROOT) {
	try {
		const raw = fs.readFileSync(path.join(root, "scripts", "baselines", "proof-hygiene-known-violations.json"), "utf8");
		const parsed = JSON.parse(raw);
		const list = Array.isArray(parsed) ? parsed : parsed.violations;
		if (!Array.isArray(list)) return [];
		return list
			.filter((entry) => entry && typeof entry.relPath === "string")
			.map((entry) => ({
				relPath: toPosix(entry.relPath),
				expected: typeof entry.expected === "string" ? entry.expected.toLowerCase() : null,
				actual: typeof entry.actual === "string" ? entry.actual.toLowerCase() : null,
				note: typeof entry.note === "string" ? entry.note : "",
			}));
	} catch {
		return [];
	}
}

/***
 * MARK: matchBaseline
 * @description Finds the baseline entry covering a violation: same path, and
 *   the recorded expected/actual magic still matches the observed bytes.
 *   Returns null when the violation is new or its bytes changed.
 * @example matchBaseline({ relPath: "a.png", expected: "89504e47", actual: "efbfbd" }, baseline) => entry|null
 * @param {{ relPath: string, expected?: string, actual?: string }} violation
 * @param {Array} baseline - Entries from loadBaseline().
 * @returns {Object|null} Matching baseline entry or null.
 ***/
export function matchBaseline(violation, baseline) {
	const expected = (violation.expected || "").toLowerCase();
	const actual = (violation.actual || "").toLowerCase();
	return baseline.find((entry) => entry.relPath === violation.relPath
		&& (entry.expected === null || entry.expected === expected)
		&& (entry.actual === null || entry.actual === actual)) || null;
}

/***
 * MARK: collectCandidateFiles
 * @description Lists worktree files in scope: every file under `docs/` plus
 *   every depth-1 entry at the repo root. Never descends into build output,
 *   dependencies, or VCS metadata.
 * @example collectCandidateFiles("/repo") => [{ relPath, absPath }, ...]
 * @param {string} root - Repo root to scan.
 * @returns {Array<{ relPath: string, absPath: string }>} Candidate files.
 ***/
export function collectCandidateFiles(root) {
	const out = [];
	const walk = (dir) => {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(full);
			} else if (entry.isFile()) {
				out.push({ relPath: path.relative(root, full), absPath: full });
			}
		}
	};
	walk(path.join(root, "docs"));
	let rootEntries;
	try {
		rootEntries = fs.readdirSync(root, { withFileTypes: true });
	} catch {
		rootEntries = [];
	}
	for (const entry of rootEntries) {
		if (!entry.isFile()) continue;
		const full = path.join(root, entry.name);
		out.push({ relPath: entry.name, absPath: full });
	}
	return out;
}

/***
 * MARK: checkTree
 * @description Runs both rule families over a worktree: magic-byte checks on
 *   proof paths, scratch checks on root files. Violations already recorded
 *   in the baseline (same path and same bytes) are reported separately as
 *   `knownViolations` so the gate fails only on NEW damage. Pure over its
 *   inputs except for filesystem reads.
 * @example checkTree({ root: "/repo", allowlist: [] }) => { magicViolations: [], scratchViolations: [], knownViolations: [] }
 * @param {Object} [opts]
 * @param {string} [opts.root] - Repo root (or fixture tree) to scan.
 * @param {string[]} [opts.allowlist] - Exact paths exempt from scratch rules.
 * @param {Array} [opts.baseline] - Entries from loadBaseline(); defaults to the tree's baseline file.
 * @returns {{ magicViolations: Array, scratchViolations: Array, knownViolations: Array }} New violations by family plus baselined ones.
 ***/
export function checkTree({ root = REPO_ROOT, allowlist = loadAllowlist(root), baseline = loadBaseline(root) } = {}) {
	const magicViolations = [];
	const scratchViolations = [];
	const knownViolations = [];
	const fileViolation = (violation) => {
		const entry = matchBaseline(violation, baseline);
		if (entry) {
			knownViolations.push({ ...violation, note: entry.note });
		} else if (violation.kind === "magic") {
			magicViolations.push(violation);
		} else {
			scratchViolations.push(violation);
		}
	};
	for (const { relPath, absPath } of collectCandidateFiles(root)) {
		const posix = toPosix(relPath);
		if (isRootScratch(posix, allowlist)) {
			fileViolation({
				kind: "scratch",
				relPath: posix,
				pattern: matchScratchPattern(posix.toLowerCase()),
			});
		}
		if (isProofPath(posix)) {
			const result = checkFileMagic(absPath);
			if (!result.ok) {
				fileViolation({
					kind: "magic",
					relPath: posix,
					expected: result.expected,
					actual: result.actual,
				});
			}
		}
	}
	return { magicViolations, scratchViolations, knownViolations };
}

/***
 * MARK: formatKnown
 * @description One-line note for a baselined (pre-existing, already recorded)
 *   violation: names the file and points at the baseline instead of a remedy.
 * @example formatKnown({ relPath: "docs/.../x.png", note: "..." })
 * @param {{ relPath: string, expected?: string, actual?: string, note?: string }} violation
 * @returns {string} Single-line known-issue note.
 ***/
export function formatKnown(violation) {
	return `${violation.relPath}: known pre-existing issue (recorded in scripts/baselines/proof-hygiene-known-violations.json${violation.note ? ` — ${violation.note}` : ""})`;
}

/***
 * MARK: main
 * @description CLI: scans the tree, prints one line per violation with its
 *   remedy, and exits 1 when any NEW violation fails; prints a one-line PASS
 *   summary and exits 0 when only baselined (pre-existing, recorded) issues
 *   remain. `--root <dir>` points the scan at a fixture tree (used by tests,
 *   where no baseline file exists so every violation fails); `--strict`
 *   fails on baselined entries too; `--help` prints usage.
 * @example main(["node", "check-proof-and-hygiene.mjs", "--root", "/tmp/fix"])
 * @param {string[]} [argv] - Process argv; defaults to process.argv.
 * @returns {number} Process exit code (0 clean, 1 violations, 2 usage error).
 ***/
export function main(argv = process.argv) {
	const args = argv.slice(2);
	if (args.includes("--help") || args.includes("-h")) {
		console.log("Usage: node scripts/check-proof-and-hygiene.mjs [--root <dir>] [--strict]");
		console.log("Checks proof-image magic bytes and rejects repo-root scratch files.");
		console.log("  --strict  fail on baselined (pre-existing) violations too.");
		return 0;
	}
	const strict = args.includes("--strict");
	let root = REPO_ROOT;
	const rootIdx = args.indexOf("--root");
	if (rootIdx !== -1) {
		if (!args[rootIdx + 1]) {
			console.error("error: --root requires a directory argument");
			return 2;
		}
		root = path.resolve(args[rootIdx + 1]);
	}
	const allowlist = loadAllowlist(root);
	const baseline = loadBaseline(root);
	const { magicViolations, scratchViolations, knownViolations } = checkTree({ root, allowlist, baseline });
	const failures = strict
		? [...magicViolations, ...scratchViolations, ...knownViolations]
		: [...magicViolations, ...scratchViolations];
	if (failures.length > 0) {
		console.error(`proof-and-hygiene check FAILED (${failures.length} violation(s)):`);
		for (const violation of failures) {
			console.error(`  ${knownViolations.includes(violation) ? formatKnown(violation) : formatFailure(violation)}`);
		}
		return 1;
	}
	if (knownViolations.length > 0) {
		console.log(`✓ proof artifacts and repo-root hygiene OK (${knownViolations.length} known pre-existing issue(s) recorded in the baseline).`);
		for (const violation of knownViolations) {
			console.log(`  ${formatKnown(violation)}`);
		}
	} else {
		console.log("✓ proof artifacts and repo-root hygiene OK.");
	}
	return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	process.exitCode = main();
}
