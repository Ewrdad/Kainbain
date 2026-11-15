/***
 * MARK: siteDocs
 * @description Single source of truth for the markdown-driven site docs that
 *   double as an agent-consumable knowledge base. The source files live in a
 *   repo-root content directory (default `site-docs/`, deliberately NOT under
 *   the in-repo `docs/` directory (curated docs; run history under
 *   `docs/tasks/` is never committed). Pure file/index
 *   logic lives here so it is unit-testable; the thin HTTP layer is in
 *   `routes/docs.js`, matching the `agentGuide.js` layering convention.
 *
 * Each article is a `.md` file with YAML-ish frontmatter:
 *
 *   ---
 *   title: My Article
 *   section: getting-started | concepts | workflows | reference
 *   order: 10
 *   slug: my-article        (optional — defaults to the file basename)
 *   ---
 *   Markdown body...
 *
 * @example import { listDocs, getDoc } from './siteDocs.js'
 ***/
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/***
 * MARK: DOC_SECTIONS
 * @description The four docs groups, ordered for onboarding (setup before
 *   concepts before daily use before lookup). Every article belongs to
 *   exactly one. The order here is the sidebar order: the frontend follows
 *   the `sections` array of the GET /docs index, which mirrors this list.
 * @example DOC_SECTIONS => ['getting-started', 'concepts', 'workflows', 'reference']
 ***/
export const DOC_SECTIONS = ["getting-started", "concepts", "workflows", "reference"];

/***
 * MARK: SECTION_LABELS
 * @description Human-readable labels for the four groups, shared by API and
 *   UI copy. The frontend `docsSections` module duplicates these for
 *   offline/fallback rendering; `docsSections.test` locks the two copies
 *   together so they cannot drift.
 * @example SECTION_LABELS['getting-started'] => 'Getting started'
 ***/
export const SECTION_LABELS = {
	"getting-started": "Getting started",
	concepts: "Concepts",
	workflows: "Everyday workflows",
	reference: "Reference & runbooks",
};

/***
 * MARK: LEGACY_SECTION_ALIASES
 * @description Backward-compat aliases for the pre-regroup taxonomy
 *   (`how-it-works` / `working-with`, two avenues). Custom content dirs
 *   (`KAINBAIN_SITE_DOCS` overrides) may still carry old `section:`
 *   frontmatter; `readDocFile` resolves these to the closest new group so
 *   old articles keep indexing instead of silently vanishing. `how-it-works`
 *   held the conceptual articles (now `concepts`); `working-with` held the
 *   operational guides (now `workflows`). Emits a `console.warn` naming the
 *   file so owners can update frontmatter at their convenience.
 * @example LEGACY_SECTION_ALIASES['how-it-works'] => 'concepts'
 ***/
export const LEGACY_SECTION_ALIASES = {
	"how-it-works": "concepts",
	"working-with": "workflows",
};

/***
 * MARK: SLUG_PATTERN
 * @description Strict allowlist for article slugs. Only lowercase alphanumerics
 *   and single hyphens — this makes path traversal impossible by construction.
 * @example SLUG_PATTERN.test('my-article') => true
 ***/
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/***
 * MARK: isValidSlug
 * @description Whether a slug is safe to resolve to a content file.
 * @param {string} slug
 * @returns {boolean}
 * @example isValidSlug('../secret') => false
 ***/
export function isValidSlug(slug) {
	return typeof slug === "string" && SLUG_PATTERN.test(slug);
}

/***
 * MARK: defaultDocsDir
 * @description Resolves the content directory: explicit override (tests),
 *   else the validated `KAINBAIN_SITE_DOCS` config (default
 *   `<repo-root>/site-docs`).
 * @param {string} [override]
 * @returns {string}
 * @example defaultDocsDir() => '/home/.../kainbain/site-docs'
 ***/
export function defaultDocsDir(override) {
	if (override) return override;
	return config.siteDocsDir;
}

/***
 * MARK: parseFrontmatter
 * @description Splits a raw article file into `{ meta, body }`. Returns empty
 *   meta when no `---` frontmatter block is present.
 * @param {string} raw - Full file content.
 * @returns {{ meta: object, body: string }}
 * @example parseFrontmatter('---\ntitle: Hi\n---\nBody') => { meta: { title: 'Hi' }, body: 'Body' }
 ***/
export function parseFrontmatter(raw) {
	const text = String(raw ?? "");
	const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
	if (!match) return { meta: {}, body: text };
	const meta = {};
	for (const line of match[1].split(/\r?\n/)) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (key) meta[key] = value;
	}
	return { meta, body: text.slice(match[0].length) };
}

/***
 * MARK: readDocFile
 * @description Reads one article file into a descriptor, or null when the file
 *   is missing/invalid frontmatter (unknown section or missing title).
 * @param {string} filePath - Absolute path to the `.md` file.
 * @returns {object|null} { slug, title, section, order, markdown } or null.
 * @example readDocFile('/x/site-docs/architecture.md') => { slug: 'architecture', ... }
 ***/
export function readDocFile(filePath) {
	let raw;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		raw = fs.readFileSync(filePath, "utf8");
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return null;
	}
	const { meta, body } = parseFrontmatter(raw);
	const fallbackSlug = path.basename(filePath, ".md").toLowerCase();
	const slug = (meta.slug || fallbackSlug).toLowerCase();
	const title = (meta.title || "").trim();
	const rawSection = (meta.section || "").trim();
	const order = Number.parseInt(meta.order, 10);
	if (!isValidSlug(slug)) return null;
	if (!title) return null;
	let section = rawSection;
	const aliased = LEGACY_SECTION_ALIASES[rawSection];
	if (aliased) {
		section = aliased;
		console.warn(
			`[siteDocs] ${path.basename(filePath)} uses retired section "${rawSection}"; resolved to "${aliased}". Update frontmatter to "section: ${aliased}".`,
		);
	}
	if (!DOC_SECTIONS.includes(section)) return null;
	return {
		slug,
		title,
		section,
		order: Number.isFinite(order) ? order : 999,
		markdown: body.trimStart(),
	};
}

/***
 * MARK: listDocs
 * @description Builds the docs index from frontmatter: `[{ slug, title,
 *   section, order }]`, ordered by section group then `order` then title.
 *   Files with invalid frontmatter are skipped so one bad article cannot
 *   break the index; the skipped file still fails loudly in tests that read
 *   the real content dir, so a typoed `section:` is caught, not hidden.
 * @param {object} [options]
 * @param {string} [options.dir] - Content directory override (tests).
 * @returns {Array<object>}
 * @example listDocs() => [{ slug: 'architecture', section: 'concepts', ... }]
 ***/
export function listDocs({ dir } = {}) {
	const docsDir = defaultDocsDir(dir);
	let entries;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		entries = fs.readdirSync(docsDir, { withFileTypes: true });
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return [];
	}
	const sectionRank = Object.fromEntries(DOC_SECTIONS.map((s, i) => [s, i]));
	const docs = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
		if (entry.name.toLowerCase() === "readme.md") continue;
		const doc = readDocFile(path.join(docsDir, entry.name));
		if (doc) docs.push(doc);
	}
	// De-duplicate on slug: first file wins (sorted by filename for stability).
	docs.sort((a, b) => a.slug.localeCompare(b.slug));
	const seen = new Set();
	const unique = docs.filter((d) => {
		if (seen.has(d.slug)) return false;
		seen.add(d.slug);
		return true;
	});
	unique.sort((a, b) => {
		const sectionDiff = (sectionRank[a.section] ?? 99) - (sectionRank[b.section] ?? 99);
		if (sectionDiff !== 0) return sectionDiff;
		if (a.order !== b.order) return a.order - b.order;
		return a.title.localeCompare(b.title);
	});
	return unique.map(({ slug, title, section, order }) => ({ slug, title, section, order }));
}

/***
 * MARK: getDoc
 * @description Returns one article `{ slug, title, section, order, markdown }`
 *   or null for invalid slugs / unknown articles. Slug-gated (never joins a
 *   raw user path), so traversal attempts 404 instead of escaping the dir.
 * @param {string} slug
 * @param {object} [options]
 * @param {string} [options.dir] - Content directory override (tests).
 * @returns {object|null}
 * @example getDoc('architecture') => { slug: 'architecture', markdown: '# ...' }
 ***/
export function getDoc(slug, { dir } = {}) {
	if (!isValidSlug(slug)) return null;
	const docsDir = defaultDocsDir(dir);
	const index = listDocs({ dir: docsDir });
	const entry = index.find((d) => d.slug === slug);
	if (!entry) return null;
	const full = readDocFile(path.join(docsDir, `${slug}.md`));
	if (full) return full;
	// Slug came from frontmatter of a differently-named file: find it by scan.
	let entries;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		entries = fs.readdirSync(docsDir, { withFileTypes: true });
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch {
		return null;
	}
	for (const e of entries) {
		if (!e.isFile() || !e.name.endsWith(".md")) continue;
		const doc = readDocFile(path.join(docsDir, e.name));
		if (doc && doc.slug === slug) return doc;
	}
	return null;
}
