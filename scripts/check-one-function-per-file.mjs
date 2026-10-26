#!/usr/bin/env node
/***
 * MARK: check-one-function-per-file
 * @description New-file shape gate (WP-8, binding q1/q2/q3/q13): every source
 *   file outside the grandfather allowlist must declare at most ONE top-level
 *   named function. Only `function name` declarations at brace depth 0 count
 *   (nested declarations, callbacks, and arrow-function constants are ignored
 *   per q1). Files that already held >= 2 top-level named functions when the
 *   gate landed are listed in `scripts/allowlists/one-function-per-file.json`
 *   and keep passing untouched (q13); an allowlisted path that is itself
 *   newly added still fails so the list cannot grandfather brand-new code.
 * @example node scripts/check-one-function-per-file.mjs (exit 0 on a clean tree)
 * @example node scripts/check-one-function-per-file.mjs --write-allowlist
 * @example node scripts/check-one-function-per-file.mjs --report
 ***/

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
export const ALLOWLIST_PATH = path.join(
	REPO_ROOT,
	"scripts",
	"allowlists",
	"one-function-per-file.json",
);

const ROOTS = ["api", "shared", path.join("frontend", "src")];
const SOURCE_EXTS = new Set([".js", ".jsx"]);
const SKIP_BASENAMES = new Set(["node_modules", "dist", ".git", "coverage"]);

/***
 * MARK: isSourceFile
 * @description Whether a repo-relative POSIX path is in the gate's scope:
 *   a .js/.jsx file under api/, shared/, or frontend/src/, excluding
 *   test/spec files, node_modules, and build output.
 * @example isSourceFile("api/work/taskErrors.js") => true
 * @param {string} relPath - Repo-relative POSIX path.
 * @returns {boolean} True when the file is checked by this gate.
 ***/
export function isSourceFile(relPath) {
	const ext = path.posix.extname(relPath);
	if (!SOURCE_EXTS.has(ext)) return false;
	if (!ROOTS.some((root) => relPath === root || relPath.startsWith(`${root}/`)))
		return false;
	const base = path.posix.basename(relPath);
	if (base.includes(".test.") || base.includes(".spec.")) return false;
	if (relPath.split("/").some((part) => SKIP_BASENAMES.has(part))) return false;
	return true;
}

/***
 * MARK: stripNonCode
 * @description Masks comments and string/template literals with spaces (keeping
 *   newlines and length stable) so keyword scans never match prose, URLs, or
 *   doc examples. Handles line/block comments, single/double quotes, and
 *   template literals with `${}` interpolation.
 * @example stripNonCode("const s = 'function x';") hides the quoted words
 * @param {string} source - Raw file text.
 * @returns {string} Masked text of identical length.
 ***/
export function stripNonCode(source) {
	const out = source.split("");
	const len = source.length;
	const mask = (from, to) => {
		for (let k = from; k < to; k++) {
			if (out[k] !== "\n") out[k] = " ";
		}
	};
	const skipString = (i) => {
		const quote = source[i];
		let j = i + 1;
		while (j < len) {
			if (source[j] === "\\") j += 2;
			else if (source[j] === quote) {
				j++;
				break;
			} else j++;
		}
		mask(i, j);
		return j;
	};
	// Skips `${ ... }` starting at the `$`, honouring nested strings,
	// comments, templates, and braces. Returns the index after the `}`.
	const skipInterpolation = (i) => {
		let j = i + 2;
		let depth = 1;
		while (j < len && depth > 0) {
			const ch = source[j];
			const next = source[j + 1];
			if (ch === "/" && next === "/") {
				let k = j + 2;
				while (k < len && source[k] !== "\n") k++;
				mask(j, k);
				j = k;
			} else if (ch === "/" && next === "*") {
				const end = source.indexOf("*/", j + 2);
				const k = end === -1 ? len : end + 2;
				mask(j, k);
				j = k;
			} else if (ch === "'" || ch === '"') {
				j = skipString(j);
			} else if (ch === "`") {
				j = skipTemplate(j);
			} else {
				if (ch === "{") depth++;
				else if (ch === "}") depth--;
				j++;
			}
		}
		return j;
	};
	// Masks a template literal starting at the backtick, scanning
	// `${}` interpolations as code. Returns the index after the closing
	// backtick (or end of input for an unterminated literal).
	const skipTemplate = (i) => {
		let j = i + 1;
		let segStart = j;
		while (j < len) {
			const ch = source[j];
			if (ch === "\\") j += 2;
			else if (ch === "`") {
				mask(segStart, j);
				mask(j, j + 1);
				return j + 1;
			} else if (ch === "$" && source[j + 1] === "{") {
				mask(segStart, j);
				j = skipInterpolation(j);
				segStart = j;
			} else j++;
		}
		if (segStart < len) mask(segStart, len);
		return len;
	};
	let i = 0;
	while (i < len) {
		const ch = source[i];
		const next = source[i + 1];
		if (ch === "/" && next === "/") {
			let j = i + 2;
			while (j < len && source[j] !== "\n") j++;
			mask(i, j);
			i = j;
		} else if (ch === "/" && next === "*") {
			const end = source.indexOf("*/", i + 2);
			const j = end === -1 ? len : end + 2;
			mask(i, j);
			i = j;
		} else if (ch === "'" || ch === '"') {
			i = skipString(i);
		} else if (ch === "`") {
			i = skipTemplate(i);
		} else {
			i++;
		}
	}
	return out.join("");
}

/***
 * MARK: topLevelFunctions
 * @description Lists top-level named `function` declarations in a source file:
 *   `function foo`, `async function foo`, `export function foo`,
 *   `export default function foo` (anonymous defaults are ignored — there is
 *   no name to split into its own file). Nested declarations sit at brace
 *   depth > 0 and are ignored per q1, as are arrow-function constants (no
 *   `function` keyword).
 * @example topLevelFunctions("export function a() {}\nfunction b() {}") => ["a", "b"]
 * @param {string} source - Raw file text.
 * @returns {Array<string>} Declared names in source order.
 ***/
export function topLevelFunctions(source) {
	const masked = stripNonCode(source);
	const names = [];
	const len = masked.length;
	let depth = 0;
	const isIdChar = (c) => /[$\w]/.test(c);
	let i = 0;
	while (i < len) {
		const ch = masked[i];
		if (ch === "{" || ch === "}") {
			depth += ch === "{" ? 1 : -1;
			if (depth < 0) depth = 0;
			i++;
			continue;
		}
		if (
			ch === "f" &&
			masked.startsWith("function", i) &&
			!isIdChar(masked[i - 1] || "") &&
			!isIdChar(masked[i + 8] || "")
		) {
			let j = i + 8;
			while (j < len && /\s/.test(masked[j])) j++;
			if (masked[j] === "*") {
				j++;
				while (j < len && /\s/.test(masked[j])) j++;
			}
			let name = "";
			while (j < len && isIdChar(masked[j])) {
				name += masked[j];
				j++;
			}
			if (depth === 0 && name) names.push(name);
			i = j;
			continue;
		}
		i++;
	}
	return names;
}

/***
 * MARK: collectSourceFiles
 * @description Walks the gate's roots and returns every in-scope source file
 *   as a repo-relative POSIX path, sorted.
 * @example collectSourceFiles().every(isSourceFile) => true
 * @returns {Array<string>} Sorted repo-relative POSIX paths.
 ***/
export function collectSourceFiles() {
	const found = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || SKIP_BASENAMES.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) {
				const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
				if (isSourceFile(rel)) found.push(rel);
			}
		}
	};
	for (const root of ROOTS) {
		const abs = path.join(REPO_ROOT, root);
		if (fs.existsSync(abs)) walk(abs);
	}
	return found.sort();
}

/***
 * MARK: readAllowlist
 * @description Reads the committed grandfather allowlist (empty when absent —
 *   a missing file means "no grandfathered files", never a crash).
 * @example readAllowlist() returns an array of repo-relative paths
 * @returns {Array<string>} Sorted allowlisted repo-relative POSIX paths.
 ***/
export function readAllowlist() {
	try {
		const raw = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
		return Array.isArray(raw) ? [...raw].sort() : [];
	} catch {
		return [];
	}
}

/***
 * MARK: resolveDiffBase
 * @description Resolves the merge-base ancestor for newly-added detection
 *   (origin/master, origin/main, master, main — first that resolves), or null
 *   outside a git checkout / with no known default branch.
 * @example resolveDiffBase() => "abc123..." or null
 * @returns {string|null} A commit-ish, or null when git cannot answer.
 ***/
export function resolveDiffBase() {
	try {
		for (const ref of ["origin/master", "origin/main", "master", "main"]) {
			try {
				execFileSync("git", ["rev-parse", "--verify", ref], {
					cwd: REPO_ROOT,
					stdio: ["ignore", "pipe", "ignore"],
				});
				return ref;
			} catch {
				// Try the next candidate.
			}
		}
		return null;
	} catch {
		return null;
	}
}

/***
 * MARK: listNewlyAdded
 * @description Repo-relative POSIX paths that are newly added: committed as
 *   Added vs the diff base, or untracked (`??`) in the working tree. An
 *   allowlisted path that is newly added still fails — the allowlist is for
 *   files that existed before the gate (q13), not a way to grandfather
 *   brand-new code. Degrades to [] when git is unavailable.
 * @example listNewlyAdded().every((p) => typeof p === "string") => true
 * @returns {Array<string>} Newly-added repo-relative POSIX paths.
 ***/
export function listNewlyAdded() {
	try {
		const added = new Set();
		const base = resolveDiffBase();
		if (base) {
			const out = execFileSync(
				"git",
				["diff", "--name-status", "--diff-filter=A", `${base}...HEAD`],
				{ cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
			);
			for (const line of out.split("\n")) {
				const file = line.replace(/^[AMDRCTUX]+\s+/, "").trim();
				if (file) added.add(file);
			}
		}
		const status = execFileSync("git", ["status", "--porcelain"], {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
		for (const line of status.split("\n")) {
			if (line.startsWith("??")) {
				const file = line.slice(2).trim().replace(/"/g, "");
				if (file) added.add(file.endsWith("/") ? file : file);
			}
		}
		return [...added].sort();
	} catch {
		return [];
	}
}

/***
 * MARK: checkFiles
 * @description Pure gate core: for each file's declared top-level functions,
 *   fails paths with >= 2 names unless allowlisted AND not newly added.
 * @example checkFiles({ "a.js": ["f", "g"] }, [], []) fails a.js
 * @param {Object<string, Array<string>>} counts - File -> declared names.
 * @param {Array<string>} allowlist - Grandfathered paths.
 * @param {Array<string>} newlyAdded - Newly-added paths (still fail).
 * @returns {{ failures: Array<Object>, stale: Array<string> }} Failures and allowlist entries no longer needed.
 ***/
export function checkFiles(counts, allowlist, newlyAdded) {
	const allowed = new Set(allowlist);
	const added = new Set(newlyAdded);
	const failures = [];
	for (const [file, names] of Object.entries(counts)) {
		if (names.length < 2) continue;
		if (allowed.has(file) && !added.has(file)) continue;
		failures.push({ file, names, grandfatheredButNew: allowed.has(file) });
	}
	const stale = allowlist.filter((file) => (counts[file] || []).length < 2);
	return { failures, stale };
}

/***
 * MARK: formatFailure
 * @description Renders the remediation-forward gate failure (plan §4.4/§7:
 *   gate name, offending locations, why, remediation, local repro).
 * @example formatFailure([{ file: "a.js", names: ["f", "g"] }]) mentions one-function-per-file
 * @param {Array<Object>} failures - Failing files with declared names.
 * @returns {string} Human-readable failure text.
 ***/
export function formatFailure(failures) {
	const lines = ["FAIL: new-file shape (one-function-per-file)", ""];
	for (const { file, names, grandfatheredButNew } of failures) {
		lines.push(`${file} — ${names.length} top-level named functions:`);
		names.forEach((name, i) => lines.push(`  ${i + 1}. ${name}`));
		if (grandfatheredButNew) {
			lines.push("  (this path is allowlisted, but it is newly added: the");
			lines.push("  allowlist only covers files that existed before the gate.)");
		}
		lines.push("");
	}
	lines.push("Newly added source files must declare at most one top-level named function.");
	lines.push("");
	lines.push("Remediation:");
	lines.push("  1. Split each function into its own file named after the function");
	lines.push("     (e.g. api/work/buildFoo.js for function buildFoo).");
	lines.push("  2. Keep this file as a barrel re-export if callers need one entry point.");
	lines.push("  3. Do NOT add this file to scripts/allowlists/one-function-per-file.json:");
	lines.push("     that list is reserved for files that existed before this gate (q13).");
	lines.push("See: AGENTS-MAP.md §one-function-per-file, KB Code Standards §modularity.");
	lines.push("");
	lines.push("Reproduce locally: npm run check:one-function");
	return lines.join("\n");
}

function scanCounts() {
	const counts = {};
	for (const file of collectSourceFiles()) {
		const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
		counts[file] = topLevelFunctions(source);
	}
	return counts;
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	const args = new Set(process.argv.slice(2));
	if (args.has("--write-allowlist")) {
		const counts = scanCounts();
		const listed = Object.entries(counts)
			.filter(([, names]) => names.length >= 2)
			.map(([file]) => file)
			.sort();
		fs.mkdirSync(path.dirname(ALLOWLIST_PATH), { recursive: true });
		fs.writeFileSync(ALLOWLIST_PATH, `${JSON.stringify(listed, null, 2)}\n`);
		console.log(`allowlist: wrote ${listed.length} files to ${path.relative(REPO_ROOT, ALLOWLIST_PATH)}`);
	} else {
		const counts = scanCounts();
		const allowlist = readAllowlist();
		const newlyAdded = listNewlyAdded();
		if (args.has("--report")) {
			const multi = Object.entries(counts).filter(([, names]) => names.length >= 2);
			console.log(`one-function-per-file report: ${multi.length} multi-function files`);
			for (const [file, names] of multi) {
				const tag = allowlist.includes(file) ? "allowlisted" : "UNLISTED";
				console.log(`  ${tag} ${file} (${names.length}): ${names.join(", ")}`);
			}
			const { stale } = checkFiles(counts, allowlist, newlyAdded);
			if (stale.length > 0) {
				console.log(`stale allowlist entries (now <= 1 function, may prune): ${stale.join(", ")}`);
			}
		}
		const { failures } = checkFiles(counts, allowlist, newlyAdded);
		if (failures.length > 0) {
			console.error(formatFailure(failures));
			process.exit(1);
		}
		console.log(
			`one-function-per-file: PASS (${Object.keys(counts).length} files scanned, ${allowlist.length} grandfathered)`,
		);
	}
}
