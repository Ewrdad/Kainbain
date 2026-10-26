import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * MARK: siteDocs deployed-layout tests
 * @description Proves the content-directory anchor holds in the production
 *   layout (`<PROD_DIR>/api` next to `<PROD_DIR>/site-docs`, the tree
 *   `deploy.sh` ships): the real `siteDocs.js` module is copied into a
 *   throwaway prod-like tree alongside the real committed `site-docs/`
 *   content and must still build a non-empty index serving raw markdown.
 *   This is the contract the deploy packaging step relies on.
 * @example run `npm run test --prefix api`
 */
const repoRoot = path.resolve(import.meta.dirname, "..");

let siteDocs;
let prodDocsCount = 0;

beforeAll(async () => {
	/* eslint-disable security/detect-non-literal-fs-filename */
	const prodDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-prod-"));
	fs.mkdirSync(path.join(prodDir, "api"), { recursive: true });
	fs.cpSync(
		path.join(repoRoot, "api", "siteDocs.js"),
		path.join(prodDir, "api", "siteDocs.js"),
	);
	fs.cpSync(
		path.join(repoRoot, "site-docs"),
		path.join(prodDir, "site-docs"),
		{ recursive: true },
	);
	/* eslint-enable security/detect-non-literal-fs-filename */
	siteDocs = await import(pathToFileURL(path.join(prodDir, "api", "siteDocs.js")).href);
	prodDocsCount = fs
		.readdirSync(path.join(repoRoot, "site-docs"))
		.filter((name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md").length;
});

describe("siteDocs in the deployed layout", () => {
	it("builds a non-empty index from the shipped content dir", () => {
		const docs = siteDocs.listDocs();
		expect(docs.length).toBe(prodDocsCount);
		expect(docs.length).toBeGreaterThan(0);
		const sections = new Set(docs.map((d) => d.section));
		expect(sections.has("how-it-works")).toBe(true);
		expect(sections.has("working-with")).toBe(true);
	});

	it("serves a raw markdown article for an indexed slug", () => {
		const slug = siteDocs.listDocs()[0].slug;
		const doc = siteDocs.getDoc(slug);
		expect(doc).not.toBeNull();
		expect(doc.markdown).toContain("#");
	});
});
