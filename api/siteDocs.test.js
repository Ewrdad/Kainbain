import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	DOC_SECTIONS,
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
			"title: Architecture\nsection: how-it-works\norder: 10",
			"# Architecture\n\nHow it works.",
		),
	);
	write(
		"install.md",
		article(
			"title: Install & Run\nsection: working-with\norder: 10",
			"# Install\n\nHow to run it.",
		),
	);
	write(
		"first-task.md",
		article(
			"title: First Task\nsection: working-with\norder: 20",
			"# First Task\n\nSubmit a task.",
		),
	);
});

describe("DOC_SECTIONS", () => {
	it("exposes exactly the two onboarding avenues", () => {
		expect(DOC_SECTIONS).toEqual(["how-it-works", "working-with"]);
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
			"---\ntitle: Hi\nsection: how-it-works\norder: 3\n---\n\nHello.",
		);
		expect(meta).toMatchObject({ title: "Hi", section: "how-it-works", order: "3" });
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
			section: "how-it-works",
			order: 10,
		});
		expect(doc.markdown).toContain("# Architecture");
	});

	it("returns null for missing title, bad section, or missing file", () => {
		write("no-title.md", article("section: how-it-works\norder: 1"));
		write("bad-section.md", article("title: X\nsection: nope\norder: 1"));
		expect(readDocFile(path.join(dir, "no-title.md"))).toBeNull();
		expect(readDocFile(path.join(dir, "bad-section.md"))).toBeNull();
		expect(readDocFile(path.join(dir, "does-not-exist.md"))).toBeNull();
	});
});

describe("listDocs", () => {
	it("returns the index ordered by section then order", () => {
		const docs = listDocs({ dir });
		expect(docs.map((d) => d.slug)).toEqual(["architecture", "install", "first-task"]);
		expect(docs[0]).toEqual({
			slug: "architecture",
			title: "Architecture",
			section: "how-it-works",
			order: 10,
		});
	});

	it("skips invalid articles and non-markdown files", () => {
		write("broken.md", article("title: Broken\nsection: nope\norder: 1"));
		write("notes.txt", "not markdown");
		const docs = listDocs({ dir });
		expect(docs.map((d) => d.slug)).toEqual(["architecture", "install", "first-task"]);
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

describe("first-time-setup article (real content dir)", () => {
	/***
	 * MARK: first-time-setup regression guard
	 * @description Guards the onboarding path article against silent index
	 *   skips (a frontmatter typo drops the file from GET /docs with no
	 *   error): the slug must be listed in `working-with` between
	 *   `install-run` and `ports-env`, with valid frontmatter, and the body
	 *   must serve without a frontmatter leak. Reads the real site-docs dir
	 *   (defaultDocsDir) on purpose — the temp-dir suites above cannot see
	 *   content regressions.
	 * @example run `npm run test --prefix api`
	 ***/
	const realDir = defaultDocsDir();

	it("lists first-time-setup in working-with between install-run and ports-env", () => {
		const docs = listDocs({ dir: realDir });
		const working = docs.filter((d) => d.section === "working-with");
		const slugs = working.map((d) => d.slug);
		expect(slugs).toContain("first-time-setup");
		expect(working.find((d) => d.slug === "first-time-setup")).toEqual({
			slug: "first-time-setup",
			title: "First-Time Setup",
			section: "working-with",
			order: 15,
		});
		expect(slugs.indexOf("install-run")).toBeLessThan(slugs.indexOf("first-time-setup"));
		expect(slugs.indexOf("first-time-setup")).toBeLessThan(slugs.indexOf("ports-env"));
	});

	it("serves the article body without a frontmatter leak", () => {
		const doc = getDoc("first-time-setup", { dir: realDir });
		expect(doc).not.toBeNull();
		expect(doc.markdown).toContain("# First-Time Setup");
		expect(doc.markdown).not.toContain("section: working-with");
	});
});
