#!/usr/bin/env node
/***
 * MARK: check-doc-links.mjs
 * @description Scans documentation markdown surfaces for repo file paths
 *   referenced in backticks and asserts that the referenced files exist.
 * @example node scripts/check-doc-links.mjs
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..");

const DOC_FILES = [];

function collectMarkdownFiles(dir) {
	if (!fs.existsSync(dir)) return;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (
			entry.isDirectory() &&
			entry.name !== "node_modules" &&
			entry.name !== ".git"
		) {
			collectMarkdownFiles(full);
		} else if (entry.isFile() && entry.name.endsWith(".md")) {
			DOC_FILES.push(full);
		}
	}
}

collectMarkdownFiles(path.join(REPO_ROOT, "site-docs"));
collectMarkdownFiles(path.join(REPO_ROOT, "docs", "EngineDetails"));
for (const rootDoc of ["README.md", "AGENTS-MAP.md", "CHANGELOG.md", "DEPRECATIONS.md", "agents.md"]) {
	const p = path.join(REPO_ROOT, rootDoc);
	if (fs.existsSync(p)) DOC_FILES.push(p);
}

// Allowlisted patterns/references:
// - Wildcards, brace expansion, or line-number anchors
// - Gitignored local files created from templates (frontend/.env)
// - Deliberately recorded removed/deprecated files in DEPRECATIONS.md
const ALLOWLISTED_PATTERNS = [
	/\*/,
	/\{.*\}/,
	/<.*>/,
	/::/,
	/:[0-9]+/,
	/frontend\/\.env$/,
	/api\/logs\/?$/,
];

const missing = [];

for (const docFile of DOC_FILES) {
	const isDeprecations = docFile.endsWith("DEPRECATIONS.md");
	const content = fs.readFileSync(docFile, "utf8");
	const matches =
		content.match(/`(?:api|frontend|shared|scripts|site-docs|docs)\/[^`#?\s]+`/g) ||
		[];

	for (const m of matches) {
		const target = m.slice(1, -1).replace(/\.\.\.$/, "").trim();
		const cleanTarget = target.replace(/[:,\.]$/, "");

		if (ALLOWLISTED_PATTERNS.some((pat) => pat.test(cleanTarget))) {
			continue;
		}

		if (isDeprecations) {
			// DEPRECATIONS.md documents removed/deprecated historical paths
			continue;
		}

		const fullPath = path.resolve(REPO_ROOT, cleanTarget);
		if (!fs.existsSync(fullPath)) {
			missing.push({
				file: path.relative(REPO_ROOT, docFile),
				reference: m,
				target: cleanTarget,
			});
		}
	}
}

if (missing.length > 0) {
	console.error(`Found ${missing.length} stale file path references:`);
	for (const item of missing) {
		console.error(`  ${item.file}: ${item.reference} (${item.target} not found)`);
	}
	process.exit(1);
} else {
	console.log(`✓ All referenced file paths exist (${DOC_FILES.length} doc files scanned).`);
	process.exit(0);
}
