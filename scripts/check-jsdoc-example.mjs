#!/usr/bin/env node
/***
 * MARK: check-jsdoc-example
 * @description JSDoc `@example` completeness gate (WP-8, binding q6/q7/q8):
 *   every public export (any `export` statement declaring a function, class,
 *   or const/let/var binding, plus `export default`) must carry an `@example`
 *   tag in its nearest preceding JSDoc block. Exports that were already
 *   missing `@example` when the gate landed are recorded in
 *   `scripts/baselines/jsdoc-example-missing.json` and keep passing untouched
 *   (q6: the current gap stays a to-do); only exports NOT in that baseline —
 *   i.e. newly created or newly renamed exports — fail. Runs across api/,
 *   shared/, and frontend/src/ (q2/q8) and is wired into `npm run docs:check`.
 * @example node scripts/check-jsdoc-example.mjs (exit 0 on a clean tree)
 * @example node scripts/check-jsdoc-example.mjs --baseline-write
 * @example node scripts/check-jsdoc-example.mjs --report
 * @example node scripts/check-jsdoc-example.mjs --strict
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");
export const BASELINE_PATH = path.join(
	REPO_ROOT,
	"scripts",
	"baselines",
	"jsdoc-example-missing.json",
);

const ROOTS = ["api", "shared", path.join("frontend", "src")];
const SOURCE_EXTS = new Set([".js", ".jsx"]);
const SKIP_PARTS = new Set(["node_modules", "dist", ".git", "coverage", "build", "__fixtures__", "__mocks__"]);

/***
 * MARK: isDocSourceFile
 * @description Whether a repo-relative POSIX path is in the `@example` gate's
 *   scope: a .js/.jsx file under api/, shared/, or frontend/src/, excluding
 *   test/spec files, fixtures, mocks, and build output.
 * @example isDocSourceFile("api/work/taskErrors.js") => true
 * @param {string} relPath - Repo-relative POSIX path.
 * @returns {boolean} True when the file is checked by this gate.
 ***/
export function isDocSourceFile(relPath) {
	const ext = path.posix.extname(relPath);
	if (!SOURCE_EXTS.has(ext)) return false;
	if (!ROOTS.some((root) => relPath === root || relPath.startsWith(`${root}/`)))
		return false;
	const base = path.posix.basename(relPath);
	if (base.includes(".test.") || base.includes(".spec.")) return false;
	if (base.includes(".fixtures.") || base.includes(".fixture.")) return false;
	if (base.includes("__fixtures__") || base.includes("__mocks__")) return false;
	if (relPath.split("/").some((part) => SKIP_PARTS.has(part))) return false;
	return true;
}

/***
 * MARK: maskNonCode
 * @description Masks comments and string/template literals with spaces (length
 *   and newlines preserved) so export scans never match prose or doc text.
 * @example maskNonCode("// export const x = 1") hides the commented export
 * @param {string} source - Raw file text.
 * @returns {string} Masked text of identical length.
 ***/
export function maskNonCode(source) {
	const chars = source.split("");
	const len = source.length;
	const mask = (from, to) => {
		for (let k = from; k < to; k++) {
			if (chars[k] !== "\n") chars[k] = " ";
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
	return chars.join("");
}

/***
 * MARK: nearestJsdoc
 * @description Returns the nearest preceding JSDoc block for an export at the
 *   given offset: a `/** ... *\/` comment whose end is separated from the
 *   export only by whitespace. Returns null when there is none.
 * @example nearestJsdoc("/**\n * @example x\n *\/\nexport const a = 1", 30) finds the block
 * @param {string} source - Raw file text.
 * @param {number} exportIndex - Offset where the `export` keyword starts.
 * @returns {string|null} The JSDoc block text, or null.
 ***/
export function nearestJsdoc(source, exportIndex) {
	const end = source.lastIndexOf("*/", exportIndex);
	if (end === -1) return null;
	const between = source.slice(end + 2, exportIndex);
	if (!/^[\s]*$/.test(between)) return null;
	const start = source.lastIndexOf("/**", end);
	if (start === -1) return null;
	// The /** must open the same comment that */ closes: no intervening */.
	if (source.slice(start + 3, end).includes("*/")) return null;
	return source.slice(start, end + 2);
}

/***
 * MARK: hasExampleTag
 * @description Whether a JSDoc block carries an `@example` tag.
 * @example hasExampleTag("/**\n * @example f() => 1\n *\/") => true
 * @param {string} jsdoc - JSDoc block text.
 * @returns {boolean} True when an @example tag is present.
 ***/
export function hasExampleTag(jsdoc) {
	return /(^|\s)@example(\s|$)/.test(jsdoc);
}

/***
 * MARK: findPublicExports
 * @description Lists every public export declared in a source file: `export
 *   function/async function/class/const/let/var` (each declared name) and
 *   `export default ...` (name "default"). Re-export lists (`export { a }`,
 *   `export * from`) declare nothing new and are skipped. Each entry records
 *   whether its nearest preceding JSDoc block carries `@example`.
 * @example findPublicExports("export function f() {}") => [{ exportName: "f", kind: "function", hasExample: false }]
 * @param {string} source - Raw file text.
 * @returns {Array<{exportName: string, kind: string, hasExample: boolean}>} Declared exports in source order.
 ***/
export function findPublicExports(source) {
	const masked = maskNonCode(source);
	const found = [];
	const len = masked.length;
	const isIdChar = (c) => /[$\w]/.test(c || "");
	const isIdStart = (c) => /[$A-Za-z_]/.test(c || "");
	const skipWs = (j) => {
		while (j < len && /\s/.test(masked[j])) j++;
		return j;
	};
	const readIdent = (j) => {
		let name = "";
		if (!isIdStart(masked[j])) return { name: "", next: j };
		while (j < len && isIdChar(masked[j])) {
			name += masked[j];
			j++;
		}
		return { name, next: j };
	};
	const keywordAt = (word, i) =>
		masked.startsWith(word, i) &&
		!isIdChar(masked[i - 1]) &&
		!isIdChar(masked[i + word.length]);

	let i = 0;
	while (i < len) {
		if (keywordAt("export", i)) {
			let j = skipWs(i + 6);
			if (keywordAt("default", j)) {
				let k = skipWs(j + 7);
				let kind = "default";
				if (keywordAt("function", k)) kind = "function";
				else if (keywordAt("class", k)) kind = "class";
				found.push({
					exportName: "default",
					kind,
					hasExample: checkExample(source, i),
				});
				i = j + 7;
				continue;
			}
			if (keywordAt("async", j)) {
				const after = skipWs(j + 5);
				if (keywordAt("function", after)) j = after;
			}
			if (keywordAt("function", j)) {
				let k = skipWs(j + 8);
				if (masked[k] === "*") k = skipWs(k + 1);
				const { name } = readIdent(k);
				found.push({
					exportName: name || "default",
					kind: "function",
					hasExample: checkExample(source, i),
				});
				i = k;
				continue;
			}
			if (keywordAt("class", j)) {
				let k = skipWs(j + 5);
				const { name } = readIdent(k);
				found.push({
					exportName: name || "default",
					kind: "class",
					hasExample: checkExample(source, i),
				});
				i = k;
				continue;
			}
			if (
				keywordAt("const", j) ||
				keywordAt("let", j) ||
				keywordAt("var", j)
			) {
				const kind = masked.slice(j, j + 5) === "const" ? "const" : keywordAt("let", j) ? "let" : "var";
				let k = skipWs(j + kind.length);
				// One JSDoc block heads the whole declaration statement.
				const statementHasExample = checkExample(source, i);
				// Walk comma-separated declarators at this level only.
				let depth = 0;
				let expectName = true;
				while (k < len) {
					const ch = masked[k];
					if (ch === "(" || ch === "[" || ch === "{") depth++;
					else if (ch === ")" || ch === "]" || ch === "}") depth--;
					else if (ch === ";" && depth <= 0) break;
					else if (ch === "," && depth === 0) {
						expectName = true;
						k++;
						k = skipWs(k);
						continue;
					}
					if (expectName && depth === 0) {
						k = skipWs(k);
						const { name, next } = readIdent(k);
						if (name) {
							found.push({ exportName: name, kind, hasExample: statementHasExample });
							k = next;
							expectName = false;
							continue;
						}
						expectName = false;
					}
					k++;
				}
				i = k;
				continue;
			}
			// export { ... } / export * from ... : no new declaration — skip.
			i = j;
			continue;
		}
		i++;
	}
	return found;
}

function checkExample(source, exportIndex) {
	const jsdoc = nearestJsdoc(source, exportIndex);
	return jsdoc !== null && hasExampleTag(jsdoc);
}

/***
 * MARK: collectDocSourceFiles
 * @description Walks the gate's roots and returns every in-scope source file
 *   as a repo-relative POSIX path, sorted.
 * @example collectDocSourceFiles().every(isDocSourceFile) => true
 * @returns {Array<string>} Sorted repo-relative POSIX paths.
 ***/
export function collectDocSourceFiles() {
	const found = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || SKIP_PARTS.has(entry.name)) continue;
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.isFile()) {
				const rel = path.relative(REPO_ROOT, full).split(path.sep).join("/");
				if (isDocSourceFile(rel)) found.push(rel);
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
 * MARK: scanAllExports
 * @description Scans the tree and returns every public export with its
 *   `@example` status.
 * @example scanAllExports().total counts every declared export
 * @returns {{ total: number, missing: Array<{file: string, exportName: string, kind: string}> }} Full scan.
 ***/
export function scanAllExports() {
	let total = 0;
	const missing = [];
	for (const file of collectDocSourceFiles()) {
		const source = fs.readFileSync(path.join(REPO_ROOT, file), "utf8");
		for (const exp of findPublicExports(source)) {
			total++;
			if (!exp.hasExample) {
				missing.push({ file, exportName: exp.exportName, kind: exp.kind });
			}
		}
	}
	missing.sort((a, b) =>
		a.file.localeCompare(b.file) ||
		a.exportName.localeCompare(b.exportName) ||
		a.kind.localeCompare(b.kind),
	);
	return { total, missing };
}

/***
 * MARK: scanMissing
 * @description Scans the tree and returns every public export missing
 *   `@example`, keyed as { file, exportName, kind }.
 * @example scanMissing() returns an array of { file, exportName, kind }
 * @returns {Array<{file: string, exportName: string, kind: string}>} Missing exports, sorted.
 ***/
export function scanMissing() {
	return scanAllExports().missing;
}

/***
 * MARK: readBaseline
 * @description Reads the committed missing-`@example` baseline (empty when
 *   absent — a missing file means "no grandfathered gap", never a crash).
 * @example readBaseline() returns an array of { file, exportName, kind }
 * @returns {Array<{file: string, exportName: string, kind: string}>} Baselined entries.
 ***/
export function readBaseline() {
	try {
		const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
		return Array.isArray(raw) ? raw : [];
	} catch {
		return [];
	}
}

const keyOf = (entry) => `${entry.file}::${entry.exportName}::${entry.kind}`;

/***
 * MARK: checkMissing
 * @description Pure gate core: missing exports still present in the baseline
 *   keep passing (the gap stays a to-do per q6); anything else fails. In
 *   strict mode the baseline is ignored and every missing export fails.
 * @example checkMissing([{...}], [{...}], false) splits new vs grandfathered
 * @param {Array<Object>} missing - Currently-missing exports.
 * @param {Array<Object>} baseline - Grandfathered missing exports.
 * @param {boolean} strict - Fail on every missing export.
 * @returns {{ failures: Array<Object>, prunable: Array<Object> }} New failures and baseline entries that now have @example.
 ***/
export function checkMissing(missing, baseline, strict = false) {
	const baselined = new Set(baseline.map(keyOf));
	const failures = strict
		? [...missing]
		: missing.filter((entry) => !baselined.has(keyOf(entry)));
	const present = new Set(missing.map(keyOf));
	const prunable = baseline.filter((entry) => !present.has(keyOf(entry)));
	return { failures, prunable };
}

/***
 * MARK: formatExampleFailure
 * @description Renders the remediation-forward gate failure (plan §5.5/§7:
 *   gate name, offending locations, why, remediation, local repro).
 * @example formatExampleFailure([{ file: "f.js", exportName: "g", kind: "function" }]) mentions @example
 * @param {Array<Object>} failures - Newly-missing exports.
 * @returns {string} Human-readable failure text.
 ***/
export function formatExampleFailure(failures) {
	const lines = ["FAIL: JSDoc @example completeness (docs:check gate)", ""];
	const byFile = new Map();
	for (const entry of failures) {
		if (!byFile.has(entry.file)) byFile.set(entry.file, []);
		byFile.get(entry.file).push(entry);
	}
	for (const [file, entries] of byFile) {
		lines.push(`${file} — ${entries.length} export(s) missing @example:`);
		for (const entry of entries) {
			lines.push(`  • ${entry.kind} ${entry.exportName}`);
		}
		lines.push("");
	}
	lines.push("Every public export needs an @example tag in its JSDoc block.");
	lines.push("");
	lines.push("Remediation:");
	lines.push("  1. Add a JSDoc block directly above each export with a runnable example:");
	lines.push("       /**");
	lines.push("        * MARK: short name");
	lines.push("        * @description What it does.");
	lines.push("        * @example myExport(input) => expectedOutput");
	lines.push("        */");
	lines.push("  2. Keep the block attached: only whitespace may sit between `*/` and `export`.");
	lines.push("  3. Do NOT edit scripts/baselines/jsdoc-example-missing.json to silence this:");
	lines.push("     that file only covers exports that already lacked @example before the gate.");
	lines.push("     New exports must document themselves (q6).");
	lines.push("See: AGENTS-MAP.md §automated-gates, KB Code Standards §documentation.");
	lines.push("");
	lines.push("Reproduce locally: npm run check:jsdoc-example");
	lines.push("Triage the remaining gap: node scripts/check-jsdoc-example.mjs --report");
	return lines.join("\n");
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	const args = new Set(process.argv.slice(2));
	if (args.has("--baseline-write")) {
		const missing = scanMissing();
		fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
		fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(missing, null, 2)}\n`);
		console.log(`baseline: wrote ${missing.length} missing exports to ${path.relative(REPO_ROOT, BASELINE_PATH)}`);
	} else {
		const { total, missing } = scanAllExports();
		const baseline = readBaseline();
		const strict = args.has("--strict");
		if (args.has("--report")) {
			const covered = total - missing.length;
			const pct = total === 0 ? 100 : ((covered / total) * 100).toFixed(1);
			console.log(`jsdoc-@example report: ${missing.length}/${total} exports missing @example (${pct}% carry @example)`);
			const byRoot = new Map();
			for (const entry of missing) {
				const root = entry.file.split("/")[0] === "frontend" ? "frontend/src" : entry.file.split("/")[0];
				byRoot.set(root, (byRoot.get(root) || 0) + 1);
			}
			for (const [root, count] of [...byRoot.entries()].sort()) {
				console.log(`  ${root}: ${count}`);
			}
			const counts = new Map();
			for (const entry of missing) {
				counts.set(entry.file, (counts.get(entry.file) || 0) + 1);
			}
			const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
			console.log("top missing exporters:");
			for (const [file, count] of top) console.log(`  ${count} ${file}`);
			console.log(`(frontend-first triage: close frontend/src, then shared, then api; prune each batch)`);
		}
		if (args.has("--prune")) {
			const { prunable } = checkMissing(missing, baseline, false);
			if (prunable.length === 0) {
				console.log("prune: baseline already matches the tree (nothing to drop).");
			} else {
				const keep = baseline.filter(
					(entry) => missing.some((m) => keyOf(m) === keyOf(entry)),
				);
				fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(keep, null, 2)}\n`);
				console.log(`prune: dropped ${prunable.length} fixed exports from the baseline.`);
			}
		}
		const { failures } = checkMissing(missing, baseline, strict);
		if (failures.length > 0) {
			console.error(formatExampleFailure(failures));
			process.exit(1);
		}
		const mode = strict ? "strict" : `baseline (${baseline.length} grandfathered)`;
		console.log(`jsdoc-@example: PASS (${missing.length} missing, ${mode})`);
	}
}
