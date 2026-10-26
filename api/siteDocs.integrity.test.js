import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { defaultDocsDir, listDocs, readDocFile } from "./siteDocs.js";

/**
 * MARK: siteDocs integrity tests
 * @description Locks the site-docs consolidation: every indexed slug must
 *   resolve to a same-named file (slug == filename, no scan-fallback
 *   reliance), no two articles may share an `order` within a section, and
 *   every `#/docs/<slug>` cross-link in any article must resolve in the
 *   index. Reads the real content dir on purpose — temp-dir suites cannot
 *   see content regressions. Never asserts on article counts.
 * @example run `npm run test --prefix api`
 */

const realDir = defaultDocsDir();
const repoRoot = path.resolve(import.meta.dirname, "..");

function articleFiles() {
	/* eslint-disable security/detect-non-literal-fs-filename */
	return fs
		.readdirSync(realDir, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith(".md"))
		.map((e) => e.name);
	/* eslint-enable security/detect-non-literal-fs-filename */
}

function articleBodies() {
	/* eslint-disable security/detect-non-literal-fs-filename */
	const extra = ["README.md", "agents.md"].map((name) => {
		try {
			return fs.readFileSync(path.join(repoRoot, name), "utf8");
		} catch {
			return "";
		}
	});
	const articles = articleFiles().map(
		(name) => readDocFile(path.join(realDir, name))?.markdown ?? "",
	);
	/* eslint-enable security/detect-non-literal-fs-filename */
	return [...articles, ...extra];
}

const CROSSLINK_PATTERN = /#\/docs\/([a-z0-9]+(?:-[a-z0-9]+)*)/g;

describe("siteDocs integrity (real content dir)", () => {
	it("resolves every indexed slug to a same-named file", () => {
		const docs = listDocs({ dir: realDir });
		expect(docs.length).toBeGreaterThan(0);
		for (const doc of docs) {
			/* eslint-disable security/detect-non-literal-fs-filename */
			const fromFile = readDocFile(path.join(realDir, `${doc.slug}.md`));
			/* eslint-enable security/detect-non-literal-fs-filename */
			expect(fromFile).not.toBeNull();
			expect(fromFile.slug).toBe(doc.slug);
		}
	});

	it("gives every article a unique order within its section", () => {
		const docs = listDocs({ dir: realDir });
		const seen = new Map();
		for (const doc of docs) {
			const key = `${doc.section}:${doc.order}`;
			expect(seen.get(key)).toBeUndefined();
			seen.set(key, doc.slug);
		}
	});

	it("resolves every #/docs/<slug> cross-link in the index", () => {
		const slugs = new Set(listDocs({ dir: realDir }).map((d) => d.slug));
		const dangling = [];
		for (const body of articleBodies()) {
			for (const match of body.matchAll(CROSSLINK_PATTERN)) {
				if (!slugs.has(match[1])) dangling.push(match[1]);
			}
		}
		expect(dangling).toEqual([]);
	});
});
