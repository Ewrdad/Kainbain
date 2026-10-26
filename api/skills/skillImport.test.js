import { describe, it, expect } from "vitest";
import {
	deriveSkillName,
	firstHeading,
	normalizeMarkdownImport,
	normalizeZipImport,
	planInstall,
	sanitizeSlugStem,
	stemOf,
	withNormalizedFrontmatter,
	zipSlipError,
} from "./skillImport.js";
import {
	SKILL_NAME_PATTERN,
	MAX_SKILL_MARKDOWN_CHARS,
	MAX_SKILL_CONFIG_CHARS,
	parseSkillFrontmatter,
} from "./skillsRegistry.js";

/**
 * MARK: skillImport tests
 * @description Exhaustive unit coverage for the pure import validator: slug
 *   derivation, markdown normalization + description fallbacks, zip layout
 *   detection + slip guards, and the 409/overwrite/shadow install matrix.
 *   Every case asserts the exact warnings/errors the route layer relays to
 *   the operator, so nothing is ever normalized silently.
 */

const FRONTMATTER_MD = `---\nname: my-guide\ndescription: A useful guide\n---\n# My Guide\nBody text.`;
const NO_FRONTMATTER_MD = `# Lonely Guide\nSome body without frontmatter.`;
const NO_HEADING_MD = `Just a paragraph, no heading, no frontmatter.`;

function zipEntry(entryPath, content) {
	return {
		path: entryPath,
		bytes: Buffer.from(String(content), "utf8"),
	};
}

describe("sanitizeSlugStem / stemOf", () => {
	it("collapses arbitrary stems into slug shape", () => {
		expect(sanitizeSlugStem("My Cool Guide!")).toBe("my-cool-guide");
		expect(sanitizeSlugStem("  --a__b-- ")).toBe("a-b");
		expect(sanitizeSlugStem("!!!")).toBe("");
		expect(sanitizeSlugStem(null)).toBe("");
	});

	it("takes the basename minus its last extension", () => {
		expect(stemOf("my-pack.zip")).toBe("my-pack");
		expect(stemOf("guide.md")).toBe("guide");
		expect(stemOf("noext")).toBe("noext");
		expect(stemOf("a/b/c.md")).toBe("c");
	});
});

describe("deriveSkillName", () => {
	it("prefers a valid explicit override over everything", () => {
		expect(
			deriveSkillName({
				explicitName: "override",
				frontmatterName: "front",
				filenameStem: "file",
			}),
		).toEqual({ name: "override", error: null });
	});

	it("rejects an invalid explicit override", () => {
		const { name, error } = deriveSkillName({ explicitName: "Bad Name!" });
		expect(name).toBeNull();
		expect(error).toMatch(/not a valid skill slug/);
	});

	it("falls back to a valid frontmatter name", () => {
		expect(
			deriveSkillName({ frontmatterName: "front", filenameStem: "file" }),
		).toEqual({ name: "front", error: null });
	});

	it("rejects an invalid frontmatter name", () => {
		const { name, error } = deriveSkillName({ frontmatterName: "Bad Name" });
		expect(name).toBeNull();
		expect(error).toMatch(/Frontmatter name/);
	});

	it("sanitizes the filename stem as the last resort", () => {
		expect(deriveSkillName({ filenameStem: "My Guide" })).toEqual({
			name: "my-guide",
			error: null,
		});
	});

	it("fails closed when no usable name exists", () => {
		const { name, error } = deriveSkillName({ filenameStem: "!!!" });
		expect(name).toBeNull();
		expect(error).toMatch(/Could not derive a skill name/);
	});
});

describe("firstHeading", () => {
	it("returns the first heading's text, capped", () => {
		expect(firstHeading("# Guide\nBody")).toBe("Guide");
		expect(firstHeading("para\n## Second\n# Third")).toBe("Second");
		expect(firstHeading("no headings")).toBe("");
		expect(firstHeading(null)).toBe("");
	});
});

describe("withNormalizedFrontmatter", () => {
	it("puts name + description first and preserves other keys", () => {
		const out = withNormalizedFrontmatter(
			{ extra: "kept", name: "old", description: "old desc" },
			"Body",
			"new-name",
			"New desc",
		);
		expect(out).toBe(
			"---\nname: new-name\ndescription: New desc\nextra: kept\n---\nBody",
		);
	});

	it("round-trips through the registry frontmatter parser", () => {
		const out = withNormalizedFrontmatter({}, "Body", "guide", "A: quoted, desc");
		const { frontmatter, body } = parseSkillFrontmatter(out);
		expect(frontmatter.name).toBe("guide");
		expect(frontmatter.description).toBe("A: quoted, desc");
		expect(body).toBe("Body");
		expect(SKILL_NAME_PATTERN.test(frontmatter.name)).toBe(true);
	});
});

describe("normalizeMarkdownImport", () => {
	it("accepts a fully-formed file with no warnings", () => {
		const result = normalizeMarkdownImport(FRONTMATTER_MD, "my-guide.md");
		expect(result.error).toBeNull();
		expect(result.name).toBe("my-guide");
		expect(result.description).toBe("A useful guide");
		expect(result.warnings).toEqual([]);
		expect(result.markdown).toContain("name: my-guide");
		expect(result.markdown).toContain("Body text.");
	});

	it("accepts Buffer input", () => {
		const result = normalizeMarkdownImport(
			Buffer.from(FRONTMATTER_MD, "utf8"),
			"my-guide.md",
		);
		expect(result.error).toBeNull();
		expect(result.name).toBe("my-guide");
	});

	it("derives the slug from the filename and warns", () => {
		const result = normalizeMarkdownImport(NO_FRONTMATTER_MD, "Lonely Guide.md");
		expect(result.error).toBeNull();
		expect(result.name).toBe("lonely-guide");
		expect(result.warnings).toContain(
			"Skill name 'lonely-guide' derived from the filename (no frontmatter 'name')",
		);
	});

	it("falls back to the first heading for a missing description", () => {
		const result = normalizeMarkdownImport(NO_FRONTMATTER_MD, "lonely.md");
		expect(result.error).toBeNull();
		expect(result.description).toBe("Lonely Guide");
		expect(result.warnings).toContain(
			"Description taken from the '# Lonely Guide' heading (no frontmatter 'description')",
		);
	});

	it("uses a generated placeholder when no description exists anywhere", () => {
		const result = normalizeMarkdownImport(NO_HEADING_MD, "plain.md");
		expect(result.error).toBeNull();
		expect(result.description).toBe("Custom skill 'plain'");
		expect(result.warnings).toContain(
			"No description found — using a generated placeholder",
		);
	});

	it("warns when the explicit name overrides frontmatter", () => {
		const result = normalizeMarkdownImport(FRONTMATTER_MD, "my-guide.md", {
			explicitName: "renamed",
		});
		expect(result.error).toBeNull();
		expect(result.name).toBe("renamed");
		expect(result.warnings).toContain(
			"Frontmatter name 'my-guide' overridden by 'renamed'",
		);
		expect(result.markdown).toContain("name: renamed");
	});

	it("rejects empty and oversized files", () => {
		expect(normalizeMarkdownImport("   ", "empty.md").error).toMatch(/empty/);
		const big = `---\nname: big\ndescription: b\n---\n${"x".repeat(MAX_SKILL_MARKDOWN_CHARS)}`;
		expect(normalizeMarkdownImport(big, "big.md").error).toMatch(/max 262144/);
	});

	it("rejects files whose name cannot be derived", () => {
		const result = normalizeMarkdownImport(NO_HEADING_MD, "!!!.md");
		expect(result.name).toBeNull();
		expect(result.error).toMatch(/Could not derive a skill name/);
	});

	it("warns on a frontmatter-only file", () => {
		const result = normalizeMarkdownImport(
			"---\nname: shell\ndescription: Empty body\n---\n",
			"shell.md",
		);
		expect(result.error).toBeNull();
		expect(result.warnings).toContain("Markdown body is empty (frontmatter only)");
	});

	it("produces markdown that validates under the registry parser", () => {
		const result = normalizeMarkdownImport(NO_FRONTMATTER_MD, "lonely.md");
		const { frontmatter, body } = parseSkillFrontmatter(result.markdown);
		expect(frontmatter.name).toBe("lonely");
		expect(frontmatter.description).toBe("Lonely Guide");
		expect(body).toContain("Some body");
	});
});

describe("zipSlipError", () => {
	it("rejects escapes and accepts safe relative paths", () => {
		expect(zipSlipError("../evil.md")).toMatch(/escapes the archive/);
		expect(zipSlipError("a/../../evil.md")).toMatch(/escapes the archive/);
		expect(zipSlipError("/abs/path.md")).toMatch(/escapes the archive/);
		expect(zipSlipError("C:/win.md")).toMatch(/escapes the archive/);
		expect(zipSlipError("")).toMatch(/escapes the archive/);
		expect(zipSlipError("guide/SKILL.md")).toBeNull();
		expect(zipSlipError("SKILL.md")).toBeNull();
	});
});

describe("normalizeZipImport", () => {
	it("accepts the root layout (SKILL.md at zip root)", () => {
		const { skills, errors } = normalizeZipImport(
			[zipEntry("SKILL.md", FRONTMATTER_MD)],
			"pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills).toHaveLength(1);
		expect(skills[0].name).toBe("my-guide");
		expect(skills[0].configRaw).toBeNull();
		expect(skills[0].warnings).toEqual([]);
	});

	it("accepts the single-folder layout and pairs its config", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("guide/SKILL.md", FRONTMATTER_MD),
				zipEntry("guide/KB_config.json", '{"keywords":{"k":{"value":"v"}}}'),
			],
			"pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills).toHaveLength(1);
		expect(skills[0].name).toBe("my-guide");
		expect(skills[0].configRaw).toContain('"keywords"');
	});

	it("derives the slug from the folder name when frontmatter is absent", () => {
		const { skills, errors } = normalizeZipImport(
			[zipEntry("Cool Pack/SKILL.md", NO_FRONTMATTER_MD)],
			"pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills[0].name).toBe("cool-pack");
	});

	it("derives the slug from the zip stem for root layouts without frontmatter", () => {
		const { skills, errors } = normalizeZipImport(
			[zipEntry("SKILL.md", NO_FRONTMATTER_MD)],
			"lonely-pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills[0].name).toBe("lonely-pack");
	});

	it("rejects traversal entries before anything else", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("SKILL.md", FRONTMATTER_MD),
				zipEntry("../evil.md", "# evil"),
			],
			"pack.zip",
		);
		expect(skills).toEqual([]);
		expect(errors).toEqual(["Zip entry '../evil.md' escapes the archive (rejected)"]);
	});

	it("rejects zips with no SKILL.md", () => {
		const { skills, errors } = normalizeZipImport(
			[zipEntry("README.md", "# hi")],
			"pack.zip",
		);
		expect(skills).toEqual([]);
		expect(errors[0]).toMatch(/contains no SKILL.md/);
	});

	it("rejects ambiguous root-plus-folder zips", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("SKILL.md", FRONTMATTER_MD),
				zipEntry("guide/SKILL.md", FRONTMATTER_MD),
			],
			"pack.zip",
		);
		expect(skills).toEqual([]);
		expect(errors[0]).toMatch(/both at the root and in folders/);
	});

	it("rejects multi-skill zips by name", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("one/SKILL.md", FRONTMATTER_MD),
				zipEntry("two/SKILL.md", FRONTMATTER_MD),
			],
			"pack.zip",
		);
		expect(skills).toEqual([]);
		expect(errors[0]).toMatch(/holds 2 skills \(one, two\)/);
	});

	it("rejects deeply nested SKILL.md files", () => {
		const { skills, errors } = normalizeZipImport(
			[zipEntry("a/b/SKILL.md", FRONTMATTER_MD)],
			"pack.zip",
		);
		expect(skills).toEqual([]);
		expect(errors[0]).toMatch(/nested at 'a\/b\/'/);
	});

	it("ignores non-skill files with warnings, silently skipping packager noise", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("SKILL.md", FRONTMATTER_MD),
				zipEntry("notes.txt", "hi"),
				zipEntry("__MACOSX/._SKILL.md", "noise"),
				zipEntry(".DS_Store", "noise"),
			],
			"pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills[0].warnings).toEqual([
			"Ignored 'notes.txt' (only SKILL.md and KB_config.json are imported)",
		]);
	});

	it("warns about stray configs that belong to no imported skill", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("SKILL.md", FRONTMATTER_MD),
				zipEntry("other/KB_config.json", "{}"),
			],
			"pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills[0].configRaw).toBeNull();
		expect(skills[0].warnings).toContain(
			"Ignored KB_config.json in 'other' (belongs to no imported skill)",
		);
	});

	it("warns on invalid config JSON instead of failing", () => {
		const { skills, errors } = normalizeZipImport(
			[
				zipEntry("SKILL.md", FRONTMATTER_MD),
				zipEntry("KB_config.json", "{not json"),
			],
			"pack.zip",
		);
		expect(errors).toEqual([]);
		expect(skills[0].configRaw).toBe("{not json");
		expect(skills[0].warnings.join(" ")).toMatch(/not valid JSON/);
	});

	it("enforces the registry char caps standalone", () => {
		const big = `---\nname: big\ndescription: b\n---\n${"x".repeat(MAX_SKILL_MARKDOWN_CHARS)}`;
		const over = normalizeZipImport([zipEntry("SKILL.md", big)], "pack.zip");
		expect(over.skills).toEqual([]);
		expect(over.errors[0]).toMatch(/max 262144/);

		const bigConfig = normalizeZipImport(
			[
				zipEntry("SKILL.md", FRONTMATTER_MD),
				zipEntry("KB_config.json", "x".repeat(MAX_SKILL_CONFIG_CHARS + 1)),
			],
			"pack.zip",
		);
		expect(bigConfig.skills).toEqual([]);
		expect(bigConfig.errors[0]).toContain(`max ${MAX_SKILL_CONFIG_CHARS}`);
	});

	it("honours the explicit name override", () => {
		const { skills, errors } = normalizeZipImport(
			[zipEntry("guide/SKILL.md", FRONTMATTER_MD)],
			"pack.zip",
			{ explicitName: "renamed" },
		);
		expect(errors).toEqual([]);
		expect(skills[0].name).toBe("renamed");
	});
});

describe("planInstall", () => {
	const candidate = (name, warnings = []) => ({
		name,
		markdown: "md",
		description: "d",
		configRaw: null,
		warnings,
	});

	it("fails closed on normalization errors", () => {
		const result = planInstall({
			skills: [candidate("a")],
			errors: ["boom"],
			existingNames: [],
			globalNames: [],
		});
		expect(result.ok).toBe(false);
		expect(result.skills).toEqual([]);
		expect(result.errors).toEqual(["boom"]);
	});

	it("maps existing names to 409 conflicts without overwrite", () => {
		const result = planInstall({
			skills: [candidate("taken")],
			errors: [],
			existingNames: ["taken"],
			globalNames: [],
			overwrite: false,
		});
		expect(result.ok).toBe(false);
		expect(result.conflicts).toEqual(["taken"]);
		expect(result.errors).toEqual([
			"Skill 'taken' already exists (pass overwrite=true to replace it)",
		]);
	});

	it("allows the same name with explicit overwrite", () => {
		const result = planInstall({
			skills: [candidate("taken")],
			errors: [],
			existingNames: ["taken"],
			globalNames: [],
			overwrite: true,
		});
		expect(result.ok).toBe(true);
		expect(result.skills).toHaveLength(1);
	});

	it("flags global shadowing as a visible warning, still installable", () => {
		const result = planInstall({
			skills: [candidate("creating-new-tickets")],
			errors: [],
			existingNames: [],
			globalNames: ["creating-new-tickets"],
		});
		expect(result.ok).toBe(true);
		expect(result.skills[0].shadowedGlobal).toBe(true);
		expect(result.skills[0].warnings).toContain(
			"Skill 'creating-new-tickets' shadows a KainBain default skill",
		);
	});

	it("marks non-shadowing installs cleanly", () => {
		const result = planInstall({
			skills: [candidate("fresh")],
			errors: [],
			existingNames: [],
			globalNames: ["other"],
		});
		expect(result.ok).toBe(true);
		expect(result.skills[0].shadowedGlobal).toBe(false);
		expect(result.skills[0].warnings).toEqual([]);
	});
});
