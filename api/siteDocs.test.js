import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DOC_SECTIONS,
	KNOWN_SECTION_HISTORY,
	LEGACY_SECTION_ALIASES,
	isValidSlug,
	parseFrontmatter,
	readDocFile,
	resolveSectionName,
	listDocs,
	getDoc,
	defaultDocsDir,
} from "./siteDocs.js";

/**
 * MARK: siteDocs unit tests
 * @description Covers frontmatter parsing, slug allowlist, section-name
 *   resolution (current, retired-alias, unknown), index shape/ordering, raw
 *   article fetch, 404-equivalent nulls, and traversal rejection — all
 *   against throwaway temp dirs so the real site-docs content cannot affect
 *   the suite. Also holds the permanent legacy-alias regression proof and
 *   the taxonomy rename guardrail: section-caused skips are never silent.
 * @example run `npm run test:api`
 */

let scratchDocsDir;

function writeArticleFile(fileName, fileContent) {
	/* eslint-disable security/detect-non-literal-fs-filename -- test helper writing into a throwaway temp dir */
	fs.writeFileSync(path.join(scratchDocsDir, fileName), fileContent);
	/* eslint-enable security/detect-non-literal-fs-filename */
}

const buildArticleMarkdown = (frontmatterLines, bodyText = "Body text.") =>
	`---\n${frontmatterLines}\n---\n\n${bodyText}\n`;

/***
 * MARK: writeLegacyDocsDir
 * @description Mints a throwaway content dir of articles carrying the given
 *   (possibly retired) `section:` frontmatter; returns its path. Shared by
 *   the legacy-alias regression tests so each stays a few lines long.
 * @example writeLegacyDocsDir([{ name: 'a.md', section: 'how-it-works', title: 'A' }]) => '/tmp/sitedocs-legacy-xyz'
 ***/
function writeLegacyDocsDir(legacyArticles) {
	const legacyDocsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitedocs-legacy-"));
	/* eslint-disable security/detect-non-literal-fs-filename */
	for (const { name, section, title, order = 1 } of legacyArticles) {
		fs.writeFileSync(
			path.join(legacyDocsDir, name),
			buildArticleMarkdown(`title: ${title}\nsection: ${section}\norder: ${order}`, `# ${title}`),
		);
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
	return legacyDocsDir;
}

/***
 * MARK: captureOwnerWarnings
 * @description Runs one synchronous callback with `console.warn` intercepted;
 *   returns the callback's result plus every warning message it emitted.
 *   Every section-caused skip warns by contract, so tests either assert those
 *   warnings through this helper or suppress them with it to keep the suite
 *   output clean. Always restores the original `console.warn`.
 * @example const { result, warningMessages } = captureOwnerWarnings(() => listDocs({ dir }))
 ***/
function captureOwnerWarnings(callback) {
	const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
	try {
		const callbackResult = callback();
		const warningMessages = warnSpy.mock.calls.map((callArguments) => String(callArguments[0]));
		return { result: callbackResult, warningMessages };
	} finally {
		warnSpy.mockRestore();
	}
}

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

beforeEach(() => {
	scratchDocsDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitedocs-"));
	writeArticleFile(
		"architecture.md",
		buildArticleMarkdown(
			"title: Architecture\nsection: concepts\norder: 10",
			"# Architecture\n\nHow it works.",
		),
	);
	writeArticleFile(
		"install.md",
		buildArticleMarkdown(
			"title: Install & Run\nsection: getting-started\norder: 10",
			"# Install\n\nHow to run it.",
		),
	);
	writeArticleFile(
		"first-task.md",
		buildArticleMarkdown(
			"title: First Task\nsection: workflows\norder: 20",
			"# First Task\n\nSubmit a task.",
		),
	);
});

describe("DOC_SECTIONS", () => {
	it("exposes exactly the four docs groups in sidebar order", () => {
		expect(DOC_SECTIONS).toEqual(["getting-started", "concepts", "workflows", "reference"]);
	});
});

describe("isValidSlug", () => {
	it("accepts lowercase hyphenated slugs", () => {
		expect(isValidSlug("architecture")).toBe(true);
		expect(isValidSlug("first-task")).toBe(true);
		expect(isValidSlug("a1-b2")).toBe(true);
	});

	it("rejects traversal, separators, and non-strings", () => {
		expect(isValidSlug("../secret")).toBe(false);
		expect(isValidSlug("..")).toBe(false);
		expect(isValidSlug("a/b")).toBe(false);
		expect(isValidSlug("UPPER")).toBe(false);
		expect(isValidSlug("under_score")).toBe(false);
		expect(isValidSlug("")).toBe(false);
		expect(isValidSlug(null)).toBe(false);
		expect(isValidSlug(undefined)).toBe(false);
	});
});

describe("parseFrontmatter", () => {
	it("splits meta from body", () => {
		const { meta, body } = parseFrontmatter(
			"---\ntitle: Hi\nsection: concepts\norder: 3\n---\n\nHello.",
		);
		expect(meta).toMatchObject({ title: "Hi", section: "concepts", order: "3" });
		expect(body.trim()).toBe("Hello.");
	});

	it("returns empty meta when no frontmatter block exists", () => {
		const { meta, body } = parseFrontmatter("# Just markdown");
		expect(meta).toEqual({});
		expect(body).toBe("# Just markdown");
	});
});

describe("resolveSectionName", () => {
	it("passes current sections through unchanged", () => {
		for (const sectionId of DOC_SECTIONS) {
			expect(resolveSectionName({ rawSectionName: sectionId })).toEqual({
				resolvedSectionName: sectionId,
				retiredSectionId: null,
			});
		}
	});

	it("maps retired ids to their new sections", () => {
		expect(resolveSectionName({ rawSectionName: "how-it-works" })).toEqual({
			resolvedSectionName: "concepts",
			retiredSectionId: "how-it-works",
		});
		expect(resolveSectionName({ rawSectionName: "working-with" })).toEqual({
			resolvedSectionName: "workflows",
			retiredSectionId: "working-with",
		});
	});

	it("returns null for unknown, empty, and missing input without throwing", () => {
		expect(resolveSectionName({ rawSectionName: "portals" })).toEqual({
			resolvedSectionName: null,
			retiredSectionId: null,
		});
		expect(resolveSectionName({ rawSectionName: "" })).toEqual({
			resolvedSectionName: null,
			retiredSectionId: null,
		});
		expect(resolveSectionName({})).toEqual({
			resolvedSectionName: null,
			retiredSectionId: null,
		});
		expect(resolveSectionName({ rawSectionName: "  concepts  " })).toEqual({
			resolvedSectionName: "concepts",
			retiredSectionId: null,
		});
	});

	it("ignores object-prototype names instead of mis-resolving them", () => {
		for (const trickyName of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
			expect(resolveSectionName({ rawSectionName: trickyName })).toEqual({
				resolvedSectionName: null,
				retiredSectionId: null,
			});
		}
	});
});

describe("readDocFile", () => {
	it("reads a valid article with basename slug fallback", () => {
		const { result: articleDescriptor } = captureOwnerWarnings(() =>
			readDocFile(path.join(scratchDocsDir, "architecture.md")),
		);
		expect(articleDescriptor).toMatchObject({
			slug: "architecture",
			title: "Architecture",
			section: "concepts",
			order: 10,
		});
		expect(articleDescriptor.markdown).toContain("# Architecture");
	});

	it("returns null for missing title, bad section, or missing file", () => {
		writeArticleFile("no-title.md", buildArticleMarkdown("section: concepts\norder: 1"));
		writeArticleFile("bad-section.md", buildArticleMarkdown("title: X\nsection: nope\norder: 1"));
		const { result: nullResults } = captureOwnerWarnings(() => [
			readDocFile(path.join(scratchDocsDir, "no-title.md")),
			readDocFile(path.join(scratchDocsDir, "bad-section.md")),
			readDocFile(path.join(scratchDocsDir, "does-not-exist.md")),
		]);
		expect(nullResults).toEqual([null, null, null]);
	});
});

describe("listDocs", () => {
	it("returns the index ordered by section then order", () => {
		const { result: indexedDocs } = captureOwnerWarnings(() => listDocs({ dir: scratchDocsDir }));
		expect(indexedDocs.map((indexedDoc) => indexedDoc.slug)).toEqual([
			"install",
			"architecture",
			"first-task",
		]);
		expect(indexedDocs[0]).toEqual({
			slug: "install",
			title: "Install & Run",
			section: "getting-started",
			order: 10,
		});
	});

	it("skips invalid articles and non-markdown files", () => {
		writeArticleFile("broken.md", buildArticleMarkdown("title: Broken\nsection: nope\norder: 1"));
		writeArticleFile("notes.txt", "not markdown");
		const { result: indexedDocs } = captureOwnerWarnings(() => listDocs({ dir: scratchDocsDir }));
		expect(indexedDocs.map((indexedDoc) => indexedDoc.slug)).toEqual([
			"install",
			"architecture",
			"first-task",
		]);
	});

	it("returns [] for a missing directory", () => {
		expect(listDocs({ dir: path.join(scratchDocsDir, "nope") })).toEqual([]);
	});
});

describe("getDoc", () => {
	it("returns the full article including raw markdown", () => {
		const { result: articleDescriptor } = captureOwnerWarnings(() =>
			getDoc("install", { dir: scratchDocsDir }),
		);
		expect(articleDescriptor).toMatchObject({ slug: "install", title: "Install & Run" });
		expect(articleDescriptor.markdown).toContain("# Install");
	});

	it("returns null for unknown slugs and traversal attempts", () => {
		const { result: nullResults } = captureOwnerWarnings(() => [
			getDoc("missing", { dir: scratchDocsDir }),
			getDoc("../secret", { dir: scratchDocsDir }),
			getDoc("..", { dir: scratchDocsDir }),
		]);
		expect(nullResults).toEqual([null, null, null]);
	});
});

describe("LEGACY_SECTION_ALIASES (retired how-it-works / working-with)", () => {
	/***
	 * MARK: legacy-section regression guard
	 * @description Custom `KAINBAIN_SITE_DOCS` dirs may still carry the
	 *   pre-regroup two-avenue frontmatter. These must resolve to the new
	 *   groups (with a recorded warning each), never silently vanish into an
	 *   empty index.
	 * @example listDocs({ dir: legacyDir }) keeps slugs 'a' and 'b'
	 ***/
	it("maps the retired avenues to the new groups", () => {
		expect(LEGACY_SECTION_ALIASES).toEqual({
			"how-it-works": "concepts",
			"working-with": "workflows",
		});
	});

	it("readDocFile resolves old sections instead of returning null", () => {
		writeArticleFile(
			"legacy-a.md",
			buildArticleMarkdown("title: Legacy A\nsection: how-it-works\norder: 1"),
		);
		writeArticleFile(
			"legacy-b.md",
			buildArticleMarkdown("title: Legacy B\nsection: working-with\norder: 1"),
		);
		const { result: legacyArticleA } = captureOwnerWarnings(() =>
			readDocFile(path.join(scratchDocsDir, "legacy-a.md")),
		);
		const { result: legacyArticleB } = captureOwnerWarnings(() =>
			readDocFile(path.join(scratchDocsDir, "legacy-b.md")),
		);
		expect(legacyArticleA).toMatchObject({ slug: "legacy-a", section: "concepts" });
		expect(legacyArticleB).toMatchObject({ slug: "legacy-b", section: "workflows" });
	});

	it("listDocs/getDoc still index old-section custom articles (never a silent empty index)", () => {
		const legacyDocsDir = writeLegacyDocsDir([
			{ name: "a.md", section: "how-it-works", title: "A" },
			{ name: "b.md", section: "working-with", title: "B" },
		]);
		const { result: indexedDocs } = captureOwnerWarnings(() => listDocs({ dir: legacyDocsDir }));
		expect(indexedDocs.map((indexedDoc) => indexedDoc.slug).sort()).toEqual(["a", "b"]);
		expect(indexedDocs.find((indexedDoc) => indexedDoc.slug === "a")).toMatchObject({
			section: "concepts",
		});
		expect(indexedDocs.find((indexedDoc) => indexedDoc.slug === "b")).toMatchObject({
			section: "workflows",
		});
		const { result: firstArticle } = captureOwnerWarnings(() =>
			getDoc("a", { dir: legacyDocsDir }),
		);
		const { result: secondArticle } = captureOwnerWarnings(() =>
			getDoc("b", { dir: legacyDocsDir }),
		);
		expect(firstArticle).toMatchObject({ slug: "a", section: "concepts" });
		expect(secondArticle).toMatchObject({ slug: "b", section: "workflows" });
	});

	it("records exactly one owner-facing warning per aliased file naming the retired id", () => {
		const legacyDocsDir = writeLegacyDocsDir([
			{ name: "legacy-a.md", section: "how-it-works", title: "Legacy A" },
			{ name: "legacy-b.md", section: "working-with", title: "Legacy B" },
		]);
		const { result: indexedDocs, warningMessages } = captureOwnerWarnings(() =>
			listDocs({ dir: legacyDocsDir }),
		);
		expect(indexedDocs.map((indexedDoc) => indexedDoc.slug).sort()).toEqual([
			"legacy-a",
			"legacy-b",
		]);
		expect(warningMessages).toHaveLength(2);
		for (const [fileName, retiredSectionId, newSectionId] of [
			["legacy-a.md", "how-it-works", "concepts"],
			["legacy-b.md", "working-with", "workflows"],
		]) {
			const matchingWarnings = warningMessages.filter(
				(warningMessage) =>
					warningMessage.includes(fileName) &&
					warningMessage.includes(retiredSectionId) &&
					warningMessage.includes(newSectionId),
			);
			expect(matchingWarnings).toHaveLength(1);
		}
	});
});

describe("readDocFile loud skips (section drops are never silent)", () => {
	/***
	 * MARK: loud-skip regression guard
	 * @description The original upgrade failure was silence: unresolvable
	 *   sections returned null with no log, so articles vanished from the
	 *   index undetected. Every section-caused skip still returns null (the
	 *   index stays buildable) but must warn naming the file.
	 * @example readDocFile('mystery.md') => null plus a warning naming 'mystery.md'
	 ***/
	it("returns null but warns naming the file for an unknown section", () => {
		writeArticleFile(
			"mystery.md",
			buildArticleMarkdown("title: Mystery\nsection: portals\norder: 1"),
		);
		const { result: articleDescriptor, warningMessages } = captureOwnerWarnings(() =>
			readDocFile(path.join(scratchDocsDir, "mystery.md")),
		);
		expect(articleDescriptor).toBeNull();
		expect(warningMessages).toHaveLength(1);
		expect(warningMessages[0]).toContain("mystery.md");
		expect(warningMessages[0]).toContain("portals");
	});

	it("returns null but warns naming the file for a missing section", () => {
		writeArticleFile("no-section.md", buildArticleMarkdown("title: No Section\norder: 1"));
		const { result: articleDescriptor, warningMessages } = captureOwnerWarnings(() =>
			readDocFile(path.join(scratchDocsDir, "no-section.md")),
		);
		expect(articleDescriptor).toBeNull();
		expect(warningMessages).toHaveLength(1);
		expect(warningMessages[0]).toContain("no-section.md");
	});

	it("warns loudly when a retired id has no alias entry (guardrail bypassed at runtime)", () => {
		const aliasExistedBeforeProbe = Object.hasOwn(LEGACY_SECTION_ALIASES, "working-with");
		const savedAliasTarget = LEGACY_SECTION_ALIASES["working-with"];
		writeArticleFile(
			"legacy.md",
			buildArticleMarkdown("title: Legacy\nsection: working-with\norder: 1"),
		);
		delete LEGACY_SECTION_ALIASES["working-with"];
		try {
			const { result: articleDescriptor, warningMessages } = captureOwnerWarnings(() =>
				readDocFile(path.join(scratchDocsDir, "legacy.md")),
			);
			expect(articleDescriptor).toBeNull();
			expect(warningMessages).toHaveLength(1);
			expect(warningMessages[0]).toContain("working-with");
			expect(warningMessages[0]).toContain("LEGACY_SECTION_ALIASES");
		} finally {
			// Restore exactly the pre-probe shape: recreating a deleted key with
			// an `undefined` value would leak an own-property into later suites.
			if (aliasExistedBeforeProbe) {
				LEGACY_SECTION_ALIASES["working-with"] = savedAliasTarget;
			} else {
				delete LEGACY_SECTION_ALIASES["working-with"];
			}
		}
	});

	it("returns null but warns when the file cannot be read for a non-missing reason", () => {
		const { result: articleDescriptor, warningMessages } = captureOwnerWarnings(() =>
			readDocFile(scratchDocsDir),
		);
		expect(articleDescriptor).toBeNull();
		expect(warningMessages).toHaveLength(1);
	});
});

describe("siteDocs taxonomy rename guardrail", () => {
	/***
	 * MARK: section-rename guardrail
	 * @description Permanent guard against repeating the silent-drop upgrade
	 *   failure: any retired section id must keep resolving through
	 *   LEGACY_SECTION_ALIASES with a DEPRECATIONS.md entry. Removing or
	 *   renaming a DOC_SECTIONS id without that mapping fails here naming
	 *   the retired id (plus the fix), instead of vanishing custom articles
	 *   from listDocs/getDoc with no warning.
	 * @example remove one LEGACY_SECTION_ALIASES entry => this suite fails naming that id
	 ***/
	it("keeps every retired id resolving via an alias (fails naming the id otherwise)", () => {
		for (const historyId of KNOWN_SECTION_HISTORY) {
			expect(
				DOC_SECTIONS.includes(historyId) || Object.hasOwn(LEGACY_SECTION_ALIASES, historyId),
				`[siteDocs taxonomy guardrail] Retired section "${historyId}" is neither a current DOC_SECTIONS member nor a key of LEGACY_SECTION_ALIASES — articles using "section: ${historyId}" would silently vanish from listDocs/getDoc. Fix: add LEGACY_SECTION_ALIASES['${historyId}'] = '<new-section>' plus a DEPRECATIONS.md entry; see the REQUIRED RENAME PROCEDURE on DOC_SECTIONS in api/siteDocs.js.`,
			).toBe(true);
		}
	});

	it("covers every current id in the history list so future renames stay guarded", () => {
		for (const sectionId of DOC_SECTIONS) {
			expect(
				KNOWN_SECTION_HISTORY.includes(sectionId),
				`[siteDocs taxonomy guardrail] Current section "${sectionId}" is missing from KNOWN_SECTION_HISTORY in api/siteDocs.js — a later rename of "${sectionId}" without an alias would not fail this guardrail. Fix: append "${sectionId}" to KNOWN_SECTION_HISTORY.`,
			).toBe(true);
		}
	});

	it("records every alias key in the history list so retired ids stay covered", () => {
		for (const retiredSectionId of Object.keys(LEGACY_SECTION_ALIASES)) {
			expect(
				KNOWN_SECTION_HISTORY.includes(retiredSectionId),
				`[siteDocs taxonomy guardrail] Alias key "${retiredSectionId}" is missing from KNOWN_SECTION_HISTORY in api/siteDocs.js — the retired id would lose its guardrail coverage. Fix: append "${retiredSectionId}" to KNOWN_SECTION_HISTORY (entries are never removed).`,
			).toBe(true);
		}
	});

	it("keeps the history list clean (unique non-empty string ids)", () => {
		const seenHistoryIds = new Set();
		for (const historyId of KNOWN_SECTION_HISTORY) {
			expect(
				typeof historyId,
				"[siteDocs taxonomy guardrail] KNOWN_SECTION_HISTORY holds a non-string entry — it must list only section id strings.",
			).toBe("string");
			expect(
				historyId.length,
				"[siteDocs taxonomy guardrail] KNOWN_SECTION_HISTORY holds an empty id — remove it.",
			).toBeGreaterThan(0);
			expect(
				seenHistoryIds.has(historyId),
				`[siteDocs taxonomy guardrail] KNOWN_SECTION_HISTORY lists "${historyId}" twice — keep one entry.`,
			).toBe(false);
			seenHistoryIds.add(historyId);
		}
	});

	it("points every alias at a live section (no dangling targets after a second rename)", () => {
		for (const [retiredSectionId, targetSectionId] of Object.entries(LEGACY_SECTION_ALIASES)) {
			expect(
				DOC_SECTIONS.includes(targetSectionId),
				`[siteDocs taxonomy guardrail] Alias for retired section "${retiredSectionId}" points at "${targetSectionId}", which is not a current DOC_SECTIONS member — articles using "section: ${retiredSectionId}" would silently vanish. Fix: point LEGACY_SECTION_ALIASES['${retiredSectionId}'] at a live section id.`,
			).toBe(true);
		}
	});

	it("records every retired id in DEPRECATIONS.md (alias without a note still fails)", () => {
		let deprecationNotes = null;
		try {
			deprecationNotes = fs.readFileSync(path.join(REPO_ROOT, "DEPRECATIONS.md"), "utf8");
		} catch {
			deprecationNotes = null;
		}
		expect(
			deprecationNotes,
			"[siteDocs taxonomy guardrail] Could not read DEPRECATIONS.md at the repo root — the guardrail cannot prove each retired section id has a deprecation note. Fix: restore the file.",
		).not.toBeNull();
		if (deprecationNotes === null) return;
		for (const retiredSectionId of Object.keys(LEGACY_SECTION_ALIASES)) {
			expect(
				deprecationNotes.includes(retiredSectionId),
				`[siteDocs taxonomy guardrail] Retired section "${retiredSectionId}" has an alias but no DEPRECATIONS.md entry — owners cannot discover the rename. Fix: add a DEPRECATIONS.md entry naming "${retiredSectionId}", its replacement, and the date.`,
			).toBe(true);
		}
	});
});

describe("first-time-setup article (real content dir)", () => {
	/***
	 * MARK: first-time-setup regression guard
	 * @description Guards the onboarding path article against silent index
	 *   skips (a frontmatter typo drops the file from GET /docs with no
	 *   error): the slug must be listed in `getting-started` between
	 *   `install-run` and `ports-env`, with valid frontmatter, and the body
	 *   must serve without a frontmatter leak. Reads the real site-docs dir
	 *   (defaultDocsDir) on purpose — the temp-dir suites above cannot see
	 *   content regressions.
	 * @example run `npm run test --prefix api`
	 ***/
	const liveContentDir = defaultDocsDir();

	it("lists first-time-setup in getting-started between install-run and ports-env", () => {
		const { result: indexedDocs } = captureOwnerWarnings(() => listDocs({ dir: liveContentDir }));
		const gettingStartedArticles = indexedDocs.filter(
			(indexedDoc) => indexedDoc.section === "getting-started",
		);
		const articleSlugs = gettingStartedArticles.map((indexedDoc) => indexedDoc.slug);
		expect(articleSlugs).toContain("first-time-setup");
		expect(gettingStartedArticles.find((indexedDoc) => indexedDoc.slug === "first-time-setup")).toEqual({
			slug: "first-time-setup",
			title: "First-Time Setup",
			section: "getting-started",
			order: 15,
		});
		expect(articleSlugs.indexOf("install-run")).toBeLessThan(articleSlugs.indexOf("first-time-setup"));
		expect(articleSlugs.indexOf("first-time-setup")).toBeLessThan(articleSlugs.indexOf("ports-env"));
	});

	it("serves the article body without a frontmatter leak", () => {
		const { result: setupArticle } = captureOwnerWarnings(() =>
			getDoc("first-time-setup", { dir: liveContentDir }),
		);
		expect(setupArticle).not.toBeNull();
		expect(setupArticle.markdown).toContain("# First-Time Setup");
		expect(setupArticle.markdown).not.toContain("section: getting-started");
	});
});
