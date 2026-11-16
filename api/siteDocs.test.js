import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DOC_SECTIONS,
	LEGACY_SECTION_ALIASES,
	isValidSlug,
	parseFrontmatter,
	readDocFile,
	listDocs,
	getDoc,
	defaultDocsDir,
} from "./siteDocs.js";

/**
 * MARK: siteDocs unit tests
 * @description Covers frontmatter parsing, slug allowlist, index shape/ordering,
 *   raw article fetch, 404-equivalent nulls, and traversal rejection — all
 *   against a throwaway temp dir so the real site-docs content cannot affect
 *   the suite.
 * @example run `npm run test:api`
 */

let dir;

function write(name, content) {
	fs.writeFileSync(path.join(dir, name), content);
}

const article = (meta, body = "Body text.") =>
	`---\n${meta}\n---\n\n${body}\n`;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "sitedocs-"));
	write(
		"architecture.md",
		article(
			"title: Architecture\nsection: concepts\norder: 10",
			"# Architecture\n\nHow it works.",
		),
	);
	write(
		"install.md",
		article(
			"title: Install & Run\nsection: getting-started\norder: 10",
			"# Install\n\nHow to run it.",
		),
	);
	write(
		"first-task.md",
		article(
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

describe("readDocFile", () => {
	it("reads a valid article with basename slug fallback", () => {
		const doc = readDocFile(path.join(dir, "architecture.md"));
		expect(doc).toMatchObject({
			slug: "architecture",
			title: "Architecture",
			section: "concepts",
			order: 10,
		});
		expect(doc.markdown).toContain("# Architecture");
	});

	it("returns null for missing title, bad section, or missing file", () => {
		write("no-title.md", article("section: concepts\norder: 1"));
		write("bad-section.md", article("title: X\nsection: nope\norder: 1"));
		expect(readDocFile(path.join(dir, "no-title.md"))).toBeNull();
		expect(readDocFile(path.join(dir, "bad-section.md"))).toBeNull();
		expect(readDocFile(path.join(dir, "does-not-exist.md"))).toBeNull();
	});
});

describe("listDocs", () => {
	it("returns the index ordered by section then order", () => {
		const docs = listDocs({ dir });
		expect(docs.map((d) => d.slug)).toEqual(["install", "architecture", "first-task"]);
		expect(docs[0]).toEqual({
			slug: "install",
			title: "Install & Run",
			section: "getting-started",
			order: 10,
		});
	});

	it("skips invalid articles and non-markdown files", () => {
		write("broken.md", article("title: Broken\nsection: nope\norder: 1"));
		write("notes.txt", "not markdown");
		const docs = listDocs({ dir });
		expect(docs.map((d) => d.slug)).toEqual(["install", "architecture", "first-task"]);
	});

	it("returns [] for a missing directory", () => {
		expect(listDocs({ dir: path.join(dir, "nope") })).toEqual([]);
	});
});

describe("getDoc", () => {
	it("returns the full article including raw markdown", () => {
		const doc = getDoc("install", { dir });
		expect(doc).toMatchObject({ slug: "install", title: "Install & Run" });
		expect(doc.markdown).toContain("# Install");
	});

	it("returns null for unknown slugs and traversal attempts", () => {
		expect(getDoc("missing", { dir })).toBeNull();
		expect(getDoc("../secret", { dir })).toBeNull();
		expect(getDoc("..", { dir })).toBeNull();
	});
});

describe("LEGACY_SECTION_ALIASES (retired how-it-works / working-with)", () => {
	/***
	 * MARK: legacy-section regression guard
	 * @description Custom `KAINBAIN_SITE_DOCS` dirs may still carry the
	 *   pre-regroup two-avenue frontmatter. These must resolve to the new
	 *   groups (with a warn), never silently vanish from the index.
	 ***/
	it("maps the retired avenues to the new groups", () => {
		expect(LEGACY_SECTION_ALIASES).toEqual({
			"how-it-works": "concepts",
			"working-with": "workflows",
		});
	});

	it("readDocFile resolves old sections instead of returning null", () => {
		write("legacy-a.md", article("title: Legacy A\nsection: how-it-works\norder: 1"));
		write("legacy-b.md", article("title: Legacy B\nsection: working-with\norder: 1"));
		expect(readDocFile(path.join(dir, "legacy-a.md"))).toMatchObject({
			slug: "legacy-a",
			section: "concepts",
		});
		expect(readDocFile(path.join(dir, "legacy-b.md"))).toMatchObject({
			slug: "legacy-b",
			section: "workflows",
		});
	});

	it("listDocs/getDoc still index old-section custom articles", () => {
		const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "sitedocs-legacy-"));
		/* eslint-disable security/detect-non-literal-fs-filename */
		fs.writeFileSync(
			path.join(legacyDir, "a.md"),
			article("title: A\nsection: how-it-works\norder: 1", "# A"),
		);
		fs.writeFileSync(
			path.join(legacyDir, "b.md"),
			article("title: B\nsection: working-with\norder: 1", "# B"),
		);
		/* eslint-enable security/detect-non-literal-fs-filename */
		const docs = listDocs({ dir: legacyDir });
		expect(docs.map((d) => d.slug).sort()).toEqual(["a", "b"]);
		expect(docs.find((d) => d.slug === "a")).toMatchObject({ section: "concepts" });
		expect(docs.find((d) => d.slug === "b")).toMatchObject({ section: "workflows" });
		expect(getDoc("a", { dir: legacyDir })).toMatchObject({
			slug: "a",
			section: "concepts",
		});
		expect(getDoc("b", { dir: legacyDir })).toMatchObject({
			slug: "b",
			section: "workflows",
		});
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
	const realDir = defaultDocsDir();

	it("lists first-time-setup in getting-started between install-run and ports-env", () => {
		const docs = listDocs({ dir: realDir });
		const starters = docs.filter((d) => d.section === "getting-started");
		const slugs = starters.map((d) => d.slug);
		expect(slugs).toContain("first-time-setup");
		expect(starters.find((d) => d.slug === "first-time-setup")).toEqual({
			slug: "first-time-setup",
			title: "First-Time Setup",
			section: "getting-started",
			order: 15,
		});
		expect(slugs.indexOf("install-run")).toBeLessThan(slugs.indexOf("first-time-setup"));
		expect(slugs.indexOf("first-time-setup")).toBeLessThan(slugs.indexOf("ports-env"));
	});

	it("serves the article body without a frontmatter leak", () => {
		const doc = getDoc("first-time-setup", { dir: realDir });
		expect(doc).not.toBeNull();
		expect(doc.markdown).toContain("# First-Time Setup");
		expect(doc.markdown).not.toContain("section: getting-started");
	});
});
