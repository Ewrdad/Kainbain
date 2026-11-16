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
 *
 *   REQUIRED RENAME PROCEDURE (follow first time — a rename without these
 *   steps silently drops custom `KAINBAIN_SITE_DOCS` articles carrying old
 *   `section:` frontmatter; see `DEPRECATIONS.md` "Docs taxonomy rename"):
 *   1. Choose the new id; update `DOC_SECTIONS` and `SECTION_LABELS` here.
 *      The frontend and `GET /docs` derive order and labels from
 *      `buildDocsIndex`, so no other source file needs a hand edit
 *      (`siteDocs.frontendParity.test.js` locks that contract).
 *   2. Add `LEGACY_SECTION_ALIASES['<old-id>'] = '<new-id>'` — never delete
 *      entries; aliases are kept forever so old frontmatter keeps indexing.
 *   3. Add a `DEPRECATIONS.md` entry (retired id, new id, date, automatic
 *      migration note).
 *   4. Append the retired id to `KNOWN_SECTION_HISTORY` just below (and any
 *      brand-new current id too), so the taxonomy guardrail keeps covering it.
 *   5. Migrate in-repo `site-docs/*.md` frontmatter to the new ids.
 *   6. Run the siteDocs suites (`npm run test --prefix api -- siteDocs`).
 *   The guardrail fails naming the retired id when step 2/3 is missed, and
 *   names a dangling alias target when the new id in step 1 is mistyped.
 * @example DOC_SECTIONS => ['getting-started', 'concepts', 'workflows', 'reference']
 ***/
export const DOC_SECTIONS = ["getting-started", "concepts", "workflows", "reference"];

/***
 * MARK: SECTION_LABELS
 * @description Human-readable labels for the four groups, shared by API and
 *   UI copy. Shipped to the frontend inside the `GET /docs` index
 *   (`sectionLabels` from `buildDocsIndex`), which is the only copy the UI
 *   reads — there is no second list to keep in sync.
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
 *   file so owners can update frontmatter at their convenience. Entries are
 *   never removed — see the REQUIRED RENAME PROCEDURE on `DOC_SECTIONS`.
 * @example LEGACY_SECTION_ALIASES['how-it-works'] => 'concepts'
 ***/
export const LEGACY_SECTION_ALIASES = {
	"how-it-works": "concepts",
	"working-with": "workflows",
};

/***
 * MARK: KNOWN_SECTION_HISTORY
 * @description Every section id ever shipped, current or retired. Append-only:
 *   when a rename retires an id, that id stays here forever so the taxonomy
 *   guardrail (`siteDocs taxonomy rename guardrail` in `siteDocs.test.js`)
 *   keeps failing — naming the retired id — until an alias entry covers it.
 *   Brand-new current ids are appended here the moment they join
 *   `DOC_SECTIONS`, so a later rename of them stays guarded. Never delete an
 *   entry to make the guardrail pass: that re-opens the silent drop the
 *   guardrail exists to prevent (custom `KAINBAIN_SITE_DOCS` articles carrying
 *   old `section:` frontmatter vanishing from `listDocs`/`getDoc`). At
 *   runtime `readDocFile` also uses this list to tell a retired id missing
 *   its alias (an upgrade break — loud warning) apart from a plain typo.
 * @example KNOWN_SECTION_HISTORY.includes('how-it-works') => true
 ***/
export const KNOWN_SECTION_HISTORY = [
	"getting-started",
	"concepts",
	"workflows",
	"reference",
	"how-it-works",
	"working-with",
];

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
 * @param {string} [contentDirectoryOverride]
 * @returns {string}
 * @example defaultDocsDir() => '/home/.../kainbain/site-docs'
 ***/
export function defaultDocsDir(contentDirectoryOverride) {
	if (contentDirectoryOverride) return contentDirectoryOverride;
	return config.siteDocsDir;
}

/***
 * MARK: parseFrontmatter
 * @description Splits a raw article file into `{ meta, body }`. Returns empty
 *   meta when no `---` frontmatter block is present.
 * @param {string} rawFileContent - Full file content.
 * @returns {{ meta: object, body: string }}
 * @example parseFrontmatter('---\ntitle: Hi\n---\nBody') => { meta: { title: 'Hi' }, body: 'Body' }
 ***/
export function parseFrontmatter(rawFileContent) {
	const fileContentText = String(rawFileContent ?? "");
	const frontmatterMatch = fileContentText.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
	if (!frontmatterMatch) return { meta: {}, body: fileContentText };
	const meta = {};
	for (const line of frontmatterMatch[1].split(/\r?\n/)) {
		const separatorIndex = line.indexOf(":");
		if (separatorIndex === -1) continue;
		const frontmatterKey = line.slice(0, separatorIndex).trim();
		const frontmatterValue = line.slice(separatorIndex + 1).trim();
		if (frontmatterKey) meta[frontmatterKey] = frontmatterValue;
	}
	return { meta, body: fileContentText.slice(frontmatterMatch[0].length) };
}

/***
 * MARK: resolveSectionName
 * @description Maps one raw `section:` frontmatter value to the section id to
 *   index under. Pure lookup with no logging: current ids pass through,
 *   retired ids resolve through `LEGACY_SECTION_ALIASES`, and anything else
 *   resolves to null so the caller can skip the file loudly. Uses an
 *   own-property check so object-prototype names (`__proto__`, `toString`,
 *   ...) can never mis-resolve to an alias entry.
 * @param {object} [inputs] - Labelled inputs.
 * @param {string} [inputs.rawSectionName] - The raw frontmatter value.
 * @returns {{ resolvedSectionName: string|null, retiredSectionId: string|null }} The id to index under (null when unresolvable) plus the retired id when an alias applied.
 * @example resolveSectionName({ rawSectionName: 'how-it-works' }) => { resolvedSectionName: 'concepts', retiredSectionId: 'how-it-works' }
 ***/
export function resolveSectionName({ rawSectionName } = {}) {
	const trimmedSectionName = String(rawSectionName ?? "").trim();
	if (DOC_SECTIONS.includes(trimmedSectionName)) {
		return { resolvedSectionName: trimmedSectionName, retiredSectionId: null };
	}
	if (Object.hasOwn(LEGACY_SECTION_ALIASES, trimmedSectionName)) {
		return {
			/* eslint-disable-next-line security/detect-object-injection -- key is hasOwn-checked on the line above */
			resolvedSectionName: LEGACY_SECTION_ALIASES[trimmedSectionName],
			retiredSectionId: trimmedSectionName,
		};
	}
	return { resolvedSectionName: null, retiredSectionId: null };
}

/***
 * MARK: warnUnlessFileMissing
 * @description Emits one owner-facing warning for a filesystem failure unless
 *   the path simply does not exist (ENOENT), which callers treat as a normal
 *   empty/miss signal: `getDoc` probes `${slug}.md` directly, and `listDocs`
 *   on a missing dir means "no content", so those stay silent while genuine
 *   problems (permissions, not-a-directory, I/O errors) stay loud.
 * @param {object} inputs - Labelled inputs.
 * @param {unknown} inputs.fileSystemError - The caught error.
 * @param {string} inputs.warningMessage - Message to emit when not ENOENT.
 * @returns {void}
 * @example warnUnlessFileMissing({ fileSystemError: caughtError, warningMessage: '[siteDocs] ...' })
 ***/
function warnUnlessFileMissing({ fileSystemError, warningMessage }) {
	if (fileSystemError?.code !== "ENOENT") {
		console.warn(warningMessage);
	}
}

/***
 * MARK: readDocFile
 * @description Reads one article file into a descriptor, or null when the file
 *   cannot be used. Loud vs silent nulls — every section-caused skip warns so
 *   custom content can never silently vanish again:
 *   - retired `section:` with an alias: resolves to the new section and warns
 *     once naming the file, the retired id, and the replacement.
 *   - retired `section:` with NO alias (a rename shipped without its mapping):
 *     returns null and warns loudly naming the retired id and the fix.
 *   - unknown or missing `section:`: returns null and warns naming the file.
 *   - missing file (ENOENT): returns null silently — `getDoc` probes
 *     `${slug}.md` directly, so a miss is a normal control-flow signal.
 *   - unreadable file for any other reason (permissions, ...): returns null
 *     and warns naming the file and the error code.
 *   - missing title or invalid slug: returns null silently (unchanged
 *     authoring-error behavior; outside the section-rename scope).
 * @param {string} filePath - Absolute path to the `.md` file.
 * @returns {object|null} { slug, title, section, order, markdown } or null.
 * @example readDocFile('/x/site-docs/architecture.md') => { slug: 'architecture', ... }
 ***/
export function readDocFile(filePath) {
	let rawFileContent;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		rawFileContent = fs.readFileSync(filePath, "utf8");
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch (fileReadError) {
		warnUnlessFileMissing({
			fileSystemError: fileReadError,
			warningMessage: `[siteDocs] Could not read ${path.basename(String(filePath))} (${fileReadError?.code ?? "unknown error"}) — article skipped from the index.`,
		});
		return null;
	}
	const { meta, body } = parseFrontmatter(rawFileContent);
	const fallbackSlug = path.basename(filePath, ".md").toLowerCase();
	const slug = (meta.slug || fallbackSlug).toLowerCase();
	const title = (meta.title || "").trim();
	const rawSection = (meta.section || "").trim();
	const order = Number.parseInt(meta.order, 10);
	if (!isValidSlug(slug)) return null;
	if (!title) return null;
	const { resolvedSectionName, retiredSectionId } = resolveSectionName({
		rawSectionName: rawSection,
	});
	if (retiredSectionId) {
		console.warn(
			`[siteDocs] ${path.basename(filePath)} uses retired section "${retiredSectionId}"; resolved to "${resolvedSectionName}". Update frontmatter to "section: ${resolvedSectionName}".`,
		);
	}
	if (!resolvedSectionName) {
		if (KNOWN_SECTION_HISTORY.includes(rawSection)) {
			console.warn(
				`[siteDocs] ${path.basename(filePath)} uses retired section "${rawSection}" which has no LEGACY_SECTION_ALIASES entry — article skipped from the index. This is an upgrade break: add LEGACY_SECTION_ALIASES['${rawSection}'] = '<new-section>' plus a DEPRECATIONS.md entry; see the REQUIRED RENAME PROCEDURE on DOC_SECTIONS in api/siteDocs.js.`,
			);
		} else if (rawSection) {
			console.warn(
				`[siteDocs] ${path.basename(filePath)} has unknown section "${rawSection}" — article skipped from the index. Use one of: ${DOC_SECTIONS.join(", ")}.`,
			);
		} else {
			console.warn(
				`[siteDocs] ${path.basename(filePath)} has no "section:" frontmatter — article skipped from the index. Add "section:" with one of: ${DOC_SECTIONS.join(", ")}.`,
			);
		}
		return null;
	}
	return {
		slug,
		title,
		section: resolvedSectionName,
		order: Number.isFinite(order) ? order : 999,
		markdown: body.trimStart(),
	};
}

/***
 * MARK: listDocs
 * @description Builds the docs index from frontmatter: `[{ slug, title,
 *   section, order }]`, ordered by section group then `order` then title.
 *   Files with invalid frontmatter are skipped so one bad article cannot
 *   break the index — and every section-caused skip warns via `readDocFile`,
 *   so the skip is loud, not hidden. A missing directory returns [] silently
 *   (no content is a normal state); an unreadable directory returns [] with
 *   a warning naming the directory and the error code.
 * @param {object} [options]
 * @param {string} [options.dir] - Content directory override (tests).
 * @returns {Array<object>}
 * @example listDocs() => [{ slug: 'architecture', section: 'concepts', ... }]
 ***/
export function listDocs({ dir } = {}) {
	const docsDir = defaultDocsDir(dir);
	let directoryEntries;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		directoryEntries = fs.readdirSync(docsDir, { withFileTypes: true });
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch (directoryReadError) {
		warnUnlessFileMissing({
			fileSystemError: directoryReadError,
			warningMessage: `[siteDocs] Could not read docs directory ${docsDir} (${directoryReadError?.code ?? "unknown error"}) — returning an empty index.`,
		});
		return [];
	}
	const sectionRankById = Object.fromEntries(
		DOC_SECTIONS.map((sectionId, sectionIndex) => [sectionId, sectionIndex]),
	);
	const indexedArticles = [];
	for (const directoryEntry of directoryEntries) {
		if (!directoryEntry.isFile() || !directoryEntry.name.endsWith(".md")) continue;
		if (directoryEntry.name.toLowerCase() === "readme.md") continue;
		const articleDescriptor = readDocFile(path.join(docsDir, directoryEntry.name));
		if (articleDescriptor) indexedArticles.push(articleDescriptor);
	}
	// De-duplicate on slug: first file wins (sorted by filename for stability).
	indexedArticles.sort((firstArticle, secondArticle) =>
		firstArticle.slug.localeCompare(secondArticle.slug),
	);
	const seenSlugs = new Set();
	const uniqueArticles = indexedArticles.filter((articleDescriptor) => {
		if (seenSlugs.has(articleDescriptor.slug)) return false;
		seenSlugs.add(articleDescriptor.slug);
		return true;
	});
	uniqueArticles.sort((firstArticle, secondArticle) => {
		const sectionDiff =
			(sectionRankById[firstArticle.section] ?? 99) - (sectionRankById[secondArticle.section] ?? 99);
		if (sectionDiff !== 0) return sectionDiff;
		if (firstArticle.order !== secondArticle.order) return firstArticle.order - secondArticle.order;
		return firstArticle.title.localeCompare(secondArticle.title);
	});
	return uniqueArticles.map(({ slug, title, section, order }) => ({ slug, title, section, order }));
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
	const indexEntries = listDocs({ dir: docsDir });
	const matchingEntry = indexEntries.find((indexEntry) => indexEntry.slug === slug);
	if (!matchingEntry) return null;
	const articleFromDirectRead = readDocFile(path.join(docsDir, `${slug}.md`));
	if (articleFromDirectRead) return articleFromDirectRead;
	// Slug came from frontmatter of a differently-named file: find it by scan.
	let directoryEntries;
	try {
		/* eslint-disable security/detect-non-literal-fs-filename */
		directoryEntries = fs.readdirSync(docsDir, { withFileTypes: true });
		/* eslint-enable security/detect-non-literal-fs-filename */
	} catch (directoryReadError) {
		warnUnlessFileMissing({
			fileSystemError: directoryReadError,
			warningMessage: `[siteDocs] Could not re-read docs directory ${docsDir} (${directoryReadError?.code ?? "unknown error"}) while resolving slug "${slug}".`,
		});
		return null;
	}
	for (const directoryEntry of directoryEntries) {
		if (!directoryEntry.isFile() || !directoryEntry.name.endsWith(".md")) continue;
		const articleDescriptor = readDocFile(path.join(docsDir, directoryEntry.name));
		if (articleDescriptor && articleDescriptor.slug === slug) return articleDescriptor;
	}
	return null;
}

/***
 * MARK: buildDocsIndex
 * @description Builds the full `GET /docs` index payload from the single
 *   taxonomy source: `sections` is a copy of `DOC_SECTIONS` (sidebar order),
 *   `sectionLabels` is a copy of `SECTION_LABELS`, and `docs` is the
 *   `listDocs` article index. The frontend derives its sidebar order and
 *   group labels from this payload, so a rename edits `DOC_SECTIONS` /
 *   `SECTION_LABELS` here and nothing else — there is no second copy.
 * @param {object} [options]
 * @param {string} [options.dir] - Content directory override (tests).
 * @returns {{ sections: string[], sectionLabels: object, docs: Array<object> }}
 * @example buildDocsIndex().sections => [...DOC_SECTIONS]
 ***/
export function buildDocsIndex({ dir } = {}) {
	return {
		sections: [...DOC_SECTIONS],
		sectionLabels: { ...SECTION_LABELS },
		docs: listDocs({ dir }),
	};
}
