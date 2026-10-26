/* eslint-disable security/detect-non-literal-fs-filename -- temp-dir test fixtures by design */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	SKILL_NAME_PATTERN,
	listSkills,
	loadSkill,
	parseSkillFrontmatter,
	parseSkillConfig,
	normalizeSkillKeywords,
	normalizeSkillMode,
	scanSkillDir,
	skillPathForName,
	mergeSkillSources,
	sameResolvedDir,
	isDistinctOverlay,
	SkillsRegistry,
	buildDescriptor,
} from "./skillsRegistry.js";

/**
 * MARK: skillsRegistry unit tests
 * @description Verifies skill-package discovery: frontmatter parsing, tolerant
 *   KB_config parsing, slug validation, size caps, path-traversal blocking,
 *   global/project shadowing, and the TTL-cached registry cache layer.
 */

function makeSkillsDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-skills-"));
}

function writeSkill(dir, name, { markdown, configJson } = {}) {
	const skillDir = path.join(dir, name);
	fs.mkdirSync(skillDir, { recursive: true });
	fs.writeFileSync(
		path.join(skillDir, "SKILL.md"),
		markdown ??
			`---\nname: ${name}\ndescription: Test skill ${name}\n---\n# ${name}\nBody text.`,
		"utf8",
	);
	if (configJson !== undefined) {
		fs.writeFileSync(path.join(skillDir, "KB_config.json"), configJson, "utf8");
	}
	return skillDir;
}

describe("SKILL_NAME_PATTERN", () => {
	it("accepts lowercase slugs with hyphens and digits", () => {
		expect(SKILL_NAME_PATTERN.test("creating-new-tickets")).toBe(true);
		expect(SKILL_NAME_PATTERN.test("a1")).toBe(true);
	});
	it("rejects uppercase, spaces, leading hyphen, and traversal", () => {
		expect(SKILL_NAME_PATTERN.test("Bad_Name")).toBe(false);
		expect(SKILL_NAME_PATTERN.test("has space")).toBe(false);
		expect(SKILL_NAME_PATTERN.test("-leading")).toBe(false);
		expect(SKILL_NAME_PATTERN.test("../escape")).toBe(false);
	});
});

describe("parseSkillFrontmatter", () => {
	it("parses simple key: value frontmatter and body", () => {
		const { frontmatter, body } = parseSkillFrontmatter(
			"---\nname: my-skill\ndescription: Does things\n---\n# Body\nText",
		);
		expect(frontmatter).toEqual({
			name: "my-skill",
			description: "Does things",
		});
		expect(body).toBe("# Body\nText");
	});

	it("strips surrounding quotes from values", () => {
		const { frontmatter } = parseSkillFrontmatter(
			'---\nname: "quoted"\ndescription: \'single\'\n---\nBody',
		);
		expect(frontmatter.name).toBe("quoted");
		expect(frontmatter.description).toBe("single");
	});

	it("supports multi-line continuation for long descriptions", () => {
		const { frontmatter } = parseSkillFrontmatter(
			"---\nname: a\ndescription: First line\n  continued here\n---\nBody",
		);
		expect(frontmatter.description).toBe("First line\ncontinued here");
	});

	it("returns markdown unchanged when there is no frontmatter", () => {
		const { frontmatter, body } = parseSkillFrontmatter("# Just a body");
		expect(frontmatter).toEqual({});
		expect(body).toBe("# Just a body");
	});

	it("handles non-string input defensively", () => {
		const { frontmatter, body } = parseSkillFrontmatter(null);
		expect(frontmatter).toEqual({});
		expect(body).toBe("");
	});
});

describe("parseSkillConfig (non-declarative tolerance)", () => {
	it("returns empty config for missing file", () => {
		expect(parseSkillConfig(null)).toEqual({ config: {}, error: null });
		expect(parseSkillConfig("")).toEqual({ config: {}, error: null });
	});

	it("parses valid config with unknown fields preserved", () => {
		const { config, error } = parseSkillConfig(
			'{"keywords":{"a":{"value":"b"}},"ticketLabel":"audit","defaults":{"mode":"direct"}}',
		);
		expect(error).toBeNull();
		expect(config.keywords).toEqual({ a: { value: "b" } });
		expect(config.ticketLabel).toBe("audit"); // unknown field preserved, engine ignores it
		expect(config.defaults).toEqual({ mode: "direct" });
	});

	it("captures invalid JSON as an error instead of throwing", () => {
		const { config, error } = parseSkillConfig("{ not json");
		expect(config).toEqual({});
		expect(error).toContain("parse error");
	});

	it("rejects non-object JSON", () => {
		const { error } = parseSkillConfig("[1,2,3]");
		expect(error).toContain("must be a JSON object");
	});
});

describe("normalizeSkillKeywords", () => {
	it("accepts plain strings and { value } objects", () => {
		expect(normalizeSkillKeywords({ a: "x", b: { value: "y", description: "d" } })).toEqual({
			a: "x",
			b: "y",
		});
	});
	it("ignores malformed entries and non-objects", () => {
		expect(normalizeSkillKeywords(null)).toEqual({});
		expect(normalizeSkillKeywords({ bad: { noValue: true }, num: 5, flag: true })).toEqual({
			num: "5",
			flag: "true",
		});
	});
});

describe("keyword reference metadata (kbRef/dependsOn) pass-through", () => {
	const REPO_ROOT = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const REPO_SKILLS_DIR = path.join(REPO_ROOT, "skills");

	let dir;

	beforeEach(() => {
		dir = makeSkillsDir();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("buildDescriptor preserves kbRef/dependsOn metadata verbatim in config.keywords", () => {
		writeSkill(dir, "meta-skill", {
			configJson:
				'{"keywords":{' +
				'"targetProject":{"value":"{{project}}","description":"Project that receives tickets.","kbRef":"project"},' +
				'"targetWorkflow":{"value":"wf-default","description":"Workflow that receives tickets.","kbRef":"workflow","dependsOn":"targetProject"},' +
				'"targetStage":{"value":"Idea","description":"Stage where tickets land.","kbRef":"stage","dependsOn":"targetWorkflow"}' +
				"}}",
		});

		const descriptor = buildDescriptor({
			name: "meta-skill",
			skillsDir: dir,
			markdown: "---\nname: meta-skill\ndescription: Metadata skill\n---\n# meta-skill\nBody.",
		});

		expect(descriptor.invalid).toBe(false);
		// Raw KB_config pass-through: metadata survives byte-for-byte, never rewritten.
		expect(descriptor.config.keywords.targetProject).toEqual({
			value: "{{project}}",
			description: "Project that receives tickets.",
			kbRef: "project",
		});
		expect(descriptor.config.keywords.targetWorkflow.kbRef).toBe("workflow");
		expect(descriptor.config.keywords.targetWorkflow.dependsOn).toBe("targetProject");
		expect(descriptor.config.keywords.targetStage.kbRef).toBe("stage");
		expect(descriptor.config.keywords.targetStage.dependsOn).toBe("targetWorkflow");
		// Flattened keyword map stays value-only (the prompt-interpolation shape).
		expect(descriptor.keywords).toEqual({
			targetProject: "{{project}}",
			targetWorkflow: "wf-default",
			targetStage: "Idea",
		});
	});

	it("listSkills tolerates metadata next to plain string keyword entries", () => {
		writeSkill(dir, "mixed-skill", {
			configJson:
				'{"keywords":{"targetStage":{"value":"Idea","kbRef":"stage"},"kbApiBase":"http://localhost:3100"}}',
			markdown: "---\nname: mixed-skill\ndescription: Mixed keywords\n---\n# mixed-skill\nBody.",
		});

		const skills = listSkills({ skillsDir: dir });
		const skill = skills.find((s) => s.name === "mixed-skill");
		expect(skill.invalid).toBe(false);
		// Both entry shapes preserved verbatim in the raw config.
		expect(skill.config.keywords.targetStage).toEqual({ value: "Idea", kbRef: "stage" });
		expect(skill.config.keywords.kbApiBase).toBe("http://localhost:3100");
		// And the flattened map keeps working across the mix.
		expect(skill.keywords).toEqual({
			targetStage: "Idea",
			kbApiBase: "http://localhost:3100",
		});
	});

	it("normalizeSkillKeywords still flattens metadata-bearing entries to plain strings", () => {
		expect(
			normalizeSkillKeywords({
				targetStage: { value: "Idea", kbRef: "stage" },
				targetWorkflow: { value: "wf-default", kbRef: "workflow", dependsOn: "targetProject" },
				plain: "value",
			}),
		).toEqual({ targetStage: "Idea", targetWorkflow: "wf-default", plain: "value" });
	});

	it("REAL repo skill: listSkills locks both keyword shapes for creating-new-tickets", () => {
		const skills = listSkills({ skillsDir: REPO_SKILLS_DIR });
		const skill = skills.find((s) => s.name === "creating-new-tickets");
		expect(skill).toBeTruthy();
		expect(skill.invalid).toBe(false);
		expect(skill.hasConfig).toBe(true);

		// Raw config shape: kbRef/dependsOn metadata verbatim (UI dropdown contract).
		expect(skill.config.keywords.targetProject.kbRef).toBe("project");
		expect(skill.config.keywords.targetWorkflow.kbRef).toBe("workflow");
		expect(skill.config.keywords.targetWorkflow.dependsOn).toBe("targetProject");
		expect(skill.config.keywords.targetStage.kbRef).toBe("stage");
		expect(skill.config.keywords.targetStage.dependsOn).toBe("targetWorkflow");
		expect(skill.config.keywords.targetStage.value).toBe("Idea");

		// Flattened shape: injection still sees plain strings only.
		expect(skill.keywords.targetProject).toBe("{{project}}");
		expect(skill.keywords.targetWorkflow).toBe("wf-default");
		expect(skill.keywords.targetStage).toBe("Idea");
	});
});

describe("scanSkillDir / buildDescriptor", () => {
	let dir;

	beforeEach(() => {
		dir = makeSkillsDir();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("discovers skills with valid frontmatter and parses KB_config", () => {
		writeSkill(dir, "alpha", {
			configJson:
				'{"keywords":{"kbApiBase":{"value":"http://localhost:3100","description":"API base"}},"unknownFlag":true}',
		});
		writeSkill(dir, "beta-skill");
		const skills = scanSkillDir(dir, "global");
		expect(skills.map((s) => s.name).sort()).toEqual(["alpha", "beta-skill"]);
		const alpha = skills.find((s) => s.name === "alpha");
		expect(alpha.invalid).toBe(false);
		expect(alpha.source).toBe("global");
		expect(alpha.hasConfig).toBe(true);
		expect(alpha.keywords.kbApiBase).toBe("http://localhost:3100");
		expect(alpha.config.unknownFlag).toBe(true);
		expect(alpha.body).toContain("# alpha");
		expect(alpha.markdownChars).toBeGreaterThan(0);
	});

	it("flags skills whose frontmatter name does not match the folder", () => {
		writeSkill(dir, "folder-name", {
			markdown: "---\nname: other-name\ndescription: x\n---\nBody",
		});
		const [skill] = scanSkillDir(dir);
		expect(skill.invalid).toBe(true);
		expect(skill.error).toContain("does not match folder name");
	});

	it("flags skills missing a description", () => {
		writeSkill(dir, "no-desc", { markdown: "---\nname: no-desc\n---\nBody" });
		const [skill] = scanSkillDir(dir);
		expect(skill.invalid).toBe(true);
		expect(skill.error).toContain("description");
	});

	it("tolerates an invalid KB_config.json without throwing", () => {
		writeSkill(dir, "broken-config", {
			configJson: "{ oops",
		});
		const [skill] = scanSkillDir(dir);
		expect(skill.invalid).toBe(true);
		expect(skill.error).toContain("KB_config.json parse error");
		expect(skill.markdownChars).toBeGreaterThan(0); // markdown still listed
	});

	it("skips folders without SKILL.md and hidden folders", () => {
		fs.mkdirSync(path.join(dir, "empty-skill"), { recursive: true });
		fs.mkdirSync(path.join(dir, ".hidden"), { recursive: true });
		expect(scanSkillDir(dir)).toEqual([]);
	});

	it("ignores folder names that are not valid slugs", () => {
		fs.mkdirSync(path.join(dir, "Not_A_Slug"), { recursive: true });
		fs.writeFileSync(path.join(dir, "Not_A_Slug", "SKILL.md"), "---\nname: x\n---\nB");
		expect(scanSkillDir(dir)).toEqual([]);
	});

	it("returns empty for a missing directory", () => {
		expect(scanSkillDir(path.join(dir, "nope"))).toEqual([]);
	});

	it("buildDescriptor reports oversized markdown as invalid", () => {
		const descriptor = buildDescriptor({
			name: "too-big",
			skillsDir: dir,
			markdown: "x".repeat(256 * 1024 + 1),
		});
		expect(descriptor.invalid).toBe(true);
		expect(descriptor.error).toContain("cap");
	});
});

describe("mergeSkillSources (shadowing)", () => {
	it("retains both rows when a project skill shadows a global of the same name", () => {
		const merged = mergeSkillSources({
			globalSkills: [
				{ name: "a", source: "global", description: "global a" },
				{ name: "b", source: "global" },
			],
			projectSkills: [{ name: "a", source: "project", description: "project a" }],
		});
		const projectA = merged.find((s) => s.name === "a" && s.source === "project");
		const globalA = merged.find((s) => s.name === "a" && s.source === "global");
		expect(projectA).toBeTruthy();
		expect(projectA.description).toBe("project a");
		expect(globalA).toBeTruthy();
		expect(globalA.description).toBe("global a");
		expect(merged).toHaveLength(3);
	});

	it("orders project skills before global skills, each alphabetically", () => {
		const merged = mergeSkillSources({
			globalSkills: [{ name: "zulu", source: "global" }, { name: "alpha", source: "global" }],
			projectSkills: [{ name: "mike", source: "project" }],
		});
		expect(merged.map((s) => `${s.source}:${s.name}`)).toEqual([
			"project:mike",
			"global:alpha",
			"global:zulu",
		]);
	});

	it("fails safe when given null, undefined, or non-array inputs without throwing", () => {
		expect(mergeSkillSources()).toEqual([]);
		expect(mergeSkillSources(null)).toEqual([]);
		expect(mergeSkillSources(undefined)).toEqual([]);
		expect(mergeSkillSources("invalid")).toEqual([]);
		expect(mergeSkillSources({ globalSkills: null, projectSkills: null })).toEqual([]);
		expect(
			mergeSkillSources({
				globalSkills: [{ name: "only-global", source: "global" }],
				projectSkills: null,
			}),
		).toHaveLength(1);
	});
});

describe("listSkills / loadSkill", () => {
	let globalDir;
	let projectDir;

	beforeEach(() => {
		globalDir = makeSkillsDir();
		projectDir = makeSkillsDir();
		writeSkill(globalDir, "shared", { markdown: "---\nname: shared\ndescription: global\n---\nGlobal body" });
		writeSkill(globalDir, "global-only");
		writeSkill(projectDir, "shared", { markdown: "---\nname: shared\ndescription: project\n---\nProject body" });
	});

	afterEach(() => {
		fs.rmSync(globalDir, { recursive: true, force: true });
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	it("lists merged skills with both project and global rows on shadow", () => {
		const skills = listSkills({ skillsDir: globalDir, projectSkillsDir: projectDir });
		expect(skills.map((s) => s.name).sort()).toEqual(["global-only", "shared", "shared"]);
		const sharedProject = skills.find((s) => s.name === "shared" && s.source === "project");
		const sharedGlobal = skills.find((s) => s.name === "shared" && s.source === "global");
		expect(sharedProject).toBeTruthy();
		expect(sharedProject.description).toBe("project");
		expect(sharedGlobal).toBeTruthy();
		expect(sharedGlobal.description).toBe("global");
	});

	it("loadSkill prefers the project overlay body", () => {
		const skill = loadSkill({
			name: "shared",
			skillsDir: globalDir,
			projectSkillsDir: projectDir,
		});
		expect(skill.source).toBe("project");
		expect(skill.body).toContain("Project body");
		expect(skill.markdown).toContain("name: shared");
	});

	it("loadSkill falls back to the global library", () => {
		const skill = loadSkill({
			name: "global-only",
			skillsDir: globalDir,
			projectSkillsDir: projectDir,
		});
		expect(skill.source).toBe("global");
		expect(skill.body).toContain("Body text.");
	});

	it("loadSkill returns null for unknown skills", () => {
		expect(
			loadSkill({ name: "ghost", skillsDir: globalDir, projectSkillsDir: projectDir }),
		).toBeNull();
	});

	it("preserves kbRef/dependsOn keyword metadata verbatim in config (and does not leak it into the flattened keywords)", () => {
		writeSkill(globalDir, "referencing", {
			configJson: JSON.stringify({
				keywords: {
					kbApiBase: { value: "http://localhost:3100", description: "API base" },
					targetProject: { value: "{{project}}", description: "p", kbRef: "project" },
					targetWorkflow: {
						value: "wf-default",
						description: "w",
						kbRef: "workflow",
						dependsOn: "targetProject",
					},
					targetStage: {
						value: "Idea",
						description: "s",
						kbRef: "stage",
						dependsOn: "targetWorkflow",
					},
				},
			}),
		});
		const skill = loadSkill({ name: "referencing", skillsDir: globalDir });
		expect(skill.config.keywords.targetWorkflow).toEqual({
			value: "wf-default",
			description: "w",
			kbRef: "workflow",
			dependsOn: "targetProject",
		});
		expect(skill.config.keywords.targetProject.kbRef).toBe("project");
		expect(skill.config.keywords.targetStage).toMatchObject({
			kbRef: "stage",
			dependsOn: "targetWorkflow",
		});
		// The injection-facing flattened map stays a plain key -> value string map.
		expect(skill.keywords).toEqual({
			kbApiBase: "http://localhost:3100",
			targetProject: "{{project}}",
			targetWorkflow: "wf-default",
			targetStage: "Idea",
		});
		// And the list endpoint payload (listSkills) carries the same metadata.
		const listed = listSkills({ skillsDir: globalDir }).find((s) => s.name === "referencing");
		expect(listed.config.keywords.targetStage).toMatchObject({
			kbRef: "stage",
			dependsOn: "targetWorkflow",
		});
	});

	it("loadSkill blocks traversal names", () => {
		expect(
			loadSkill({ name: "../escape", skillsDir: globalDir, projectSkillsDir: projectDir }),
		).toBeNull();
	});

	it("skillPathForName rejects non-slug names", () => {
		expect(skillPathForName(globalDir, "..%2Fetc")).toBeNull();
		expect(skillPathForName(globalDir, "")).toBeNull();
		expect(skillPathForName(null, "ok")).toBeNull();
	});
});

describe("sameResolvedDir / isDistinctOverlay", () => {
	it("treats identical paths with trailing slashes or dot segments as the same", () => {
		const dir = makeSkillsDir();
		try {
			expect(
				sameResolvedDir({
					firstDirectoryPath: dir,
					secondDirectoryPath: dir,
				}),
			).toBe(true);
			expect(
				sameResolvedDir({
					firstDirectoryPath: dir,
					secondDirectoryPath: `${dir}/`,
				}),
			).toBe(true);
			expect(
				sameResolvedDir({
					firstDirectoryPath: dir,
					secondDirectoryPath: path.join(dir, "sub", ".."),
				}),
			).toBe(true);
			expect(isDistinctOverlay({ skillsDir: dir, projectSkillsDir: dir })).toBe(false);
			expect(
				isDistinctOverlay({ skillsDir: dir, projectSkillsDir: `${dir}/` }),
			).toBe(false);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("treats genuinely different directories as distinct", () => {
		const a = makeSkillsDir();
		const b = makeSkillsDir();
		try {
			expect(
				sameResolvedDir({
					firstDirectoryPath: a,
					secondDirectoryPath: b,
				}),
			).toBe(false);
			expect(isDistinctOverlay({ skillsDir: a, projectSkillsDir: b })).toBe(true);
		} finally {
			fs.rmSync(a, { recursive: true, force: true });
			fs.rmSync(b, { recursive: true, force: true });
		}
	});

	it("returns false for missing or non-string inputs", () => {
		expect(
			sameResolvedDir({ firstDirectoryPath: null, secondDirectoryPath: "/x" }),
		).toBe(false);
		expect(
			sameResolvedDir({ firstDirectoryPath: "/x", secondDirectoryPath: undefined }),
		).toBe(false);
		expect(
			sameResolvedDir({ firstDirectoryPath: "", secondDirectoryPath: "" }),
		).toBe(false);
		expect(
			sameResolvedDir({ firstDirectoryPath: "   ", secondDirectoryPath: "   " }),
		).toBe(false);
		// No overlay means nothing extra to scan, so the overlay is not distinct.
		expect(isDistinctOverlay({ skillsDir: "/x", projectSkillsDir: null })).toBe(false);
		expect(isDistinctOverlay({ skillsDir: "/x", projectSkillsDir: "" })).toBe(false);
		expect(isDistinctOverlay({ skillsDir: "", projectSkillsDir: "/y" })).toBe(false);
	});

	it("fails safe when called with null, undefined, or non-object inputs", () => {
		expect(sameResolvedDir(null)).toBe(false);
		expect(sameResolvedDir(undefined)).toBe(false);
		expect(sameResolvedDir("invalid")).toBe(false);
		expect(isDistinctOverlay(null)).toBe(false);
		expect(isDistinctOverlay(undefined)).toBe(false);
		expect(isDistinctOverlay("invalid")).toBe(false);
		expect(isDistinctOverlay({})).toBe(false);
	});

	it("follows symlinks so a symlinked overlay equals the library", function () {
		if (process.platform === "win32") this.skip();
		const target = makeSkillsDir();
		const linkParent = makeSkillsDir();
		const link = path.join(linkParent, "linked-skills");
		try {
			fs.symlinkSync(target, link, "dir");
		} catch {
			this.skip();
			return;
		}
		try {
			expect(
				sameResolvedDir({
					firstDirectoryPath: target,
					secondDirectoryPath: link,
				}),
			).toBe(true);
			expect(isDistinctOverlay({ skillsDir: target, projectSkillsDir: link })).toBe(
				false,
			);
		} finally {
			fs.rmSync(target, { recursive: true, force: true });
			fs.rmSync(linkParent, { recursive: true, force: true });
		}
	});
});

describe("same-directory overlay keeps global provenance", () => {
	let dir;

	beforeEach(() => {
		dir = makeSkillsDir();
		writeSkill(dir, "shipped-one");
		writeSkill(dir, "shipped-two");
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("listSkills classifies every entry as global when the overlay is the library dir", () => {
		for (const overlay of [dir, `${dir}/`, path.join(dir, "sub", "..")]) {
			const skills = listSkills({ skillsDir: dir, projectSkillsDir: overlay });
			expect(skills.map((s) => s.name).sort()).toEqual(["shipped-one", "shipped-two"]);
			for (const skill of skills) {
				expect(skill.source).toBe("global");
			}
		}
	});

	it("loadSkill resolves from the global library when the overlay is the library dir", () => {
		const skill = loadSkill({
			name: "shipped-one",
			skillsDir: dir,
			projectSkillsDir: dir,
		});
		expect(skill).not.toBeNull();
		expect(skill.source).toBe("global");
	});

	it("SkillsRegistry skips the overlay when the project cwd owns the library dir", () => {
		// Self-managed layout: <projectCwd>/skills === registry skillsDir.
		const cwd = makeSkillsDir();
		const skillsDir = path.join(cwd, "skills");
		try {
			writeSkill(skillsDir, "shipped-one");
			const routed = new SkillsRegistry({ skillsDir, cacheTtlMs: 50 });
			const skills = routed.listSkills({ projectCwd: cwd });
			expect(skills.map((s) => s.name)).toEqual(["shipped-one"]);
			expect(skills[0].source).toBe("global");
			expect(routed.getSkill("shipped-one", { projectCwd: cwd }).source).toBe(
				"global",
			);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});
});

describe("SkillsRegistry (TTL cache layer)", () => {
	let dir;
	let registry;

	beforeEach(() => {
		dir = makeSkillsDir();
		registry = new SkillsRegistry({ skillsDir: dir, cacheTtlMs: 50 });
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("caches directory scans within the TTL", () => {
		writeSkill(dir, "one");
		expect(registry.listSkills()).toHaveLength(1);
		writeSkill(dir, "two");
		expect(registry.listSkills()).toHaveLength(1); // cached
		registry.invalidate();
		expect(registry.listSkills()).toHaveLength(2); // fresh scan
	});

	it("expires the cache after the TTL", async () => {
		writeSkill(dir, "one");
		expect(registry.listSkills()).toHaveLength(1);
		writeSkill(dir, "two");
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(registry.listSkills()).toHaveLength(2);
	});

	it("never serves a cached scan to the other source label", () => {
		writeSkill(dir, "one");
		const asGlobal = registry._scanCached(dir, "global");
		const asProject = registry._scanCached(dir, "project");
		expect(asGlobal.map((s) => s.source)).toEqual(["global"]);
		expect(asProject.map((s) => s.source)).toEqual(["project"]);
	});

	it("resolves project overlay skills via projectCwd", () => {
		writeSkill(dir, "shared", { markdown: "---\nname: shared\ndescription: g\n---\nG" });
		const projectCwd = makeSkillsDir();
		const projectSkillsDir = path.join(projectCwd, "skills");
		writeSkill(projectSkillsDir, "shared", { markdown: "---\nname: shared\ndescription: p\n---\nP" });
		const skill = registry.getSkill("shared", { projectCwd });
		expect(skill.source).toBe("project");
		expect(skill.body).toContain("P");
		fs.rmSync(projectCwd, { recursive: true, force: true });
	});
});

describe("retrospective-task-lookup skill package", () => {
	const REPO_ROOT = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const REPO_SKILLS_DIR = path.join(REPO_ROOT, "skills");

	let dir;

	beforeEach(() => {
		dir = makeSkillsDir();
	});

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it("discovers a chat-lookup-shaped skill from a temp dir", () => {
		writeSkill(dir, "retrospective-task-lookup", {
			markdown:
				"---\nname: retrospective-task-lookup\ndescription: temp-dir shaped like the chat skill\n---\n# Lookup\nCite task ids.",
			configJson: JSON.stringify({
				description: "temp config",
				keywords: { kbApiBase: { value: "http://localhost:3100" } },
				defaults: { mode: "direct" },
			}),
		});
		const found = scanSkillDir(dir).find((s) => s.name === "retrospective-task-lookup");
		expect(found).toBeTruthy();
		expect(found.invalid).toBe(false);
		const loaded = loadSkill({ name: "retrospective-task-lookup", skillsDir: dir });
		expect(loaded.invalid).toBe(false);
		expect(loaded.hasConfig).toBe(true);
		expect(loaded.config.defaults.mode).toBe("direct");
	});

	it("REAL repo skill: retrospective-task-lookup is present and valid (additive-safe)", () => {
		const skills = listSkills({ skillsDir: REPO_SKILLS_DIR });
		const skill = skills.find((s) => s.name === "retrospective-task-lookup");
		expect(skill).toBeTruthy();
		expect(skill.invalid).toBe(false);
		expect(skill.description.length).toBeGreaterThan(0);
		expect(skill.hasConfig).toBe(true);
	});

	it("REAL repo skill: chat skill body stays under the prompt-budget cap", () => {
		const skill = loadSkill({ name: "retrospective-task-lookup", skillsDir: REPO_SKILLS_DIR });
		expect(skill.invalid).toBe(false);
		// The chat prompt injects this body in `direct` mode inside a ~6k
		// skill budget shared with nothing else; fail fast on bloat.
		expect(skill.body.length).toBeLessThan(4096);
		expect(skill.body).toContain("task ids");
		expect(skill.keywords.kbApiBase).toBe("http://localhost:3100");
	});
});

describe("shipped default skills contract", () => {
	const REPO_ROOT = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const REPO_SKILLS_DIR = path.join(REPO_ROOT, "skills");

	// All seven skills that ship with KainBain and must appear under
	// "KainBain defaults" for every project and deployment.
	const SHIPPED_DEFAULT_SKILLS = [
		"creating-new-tickets",
		"kainbain-task-analysis",
		"question-me",
		"retrospective-task-lookup",
		"stage-report",
		"stage-verdict",
		"update-app-status",
	];

	it("discovers exactly the seven shipped default skills from the repo library", () => {
		const skills = listSkills({ skillsDir: REPO_SKILLS_DIR });
		expect(skills.map((s) => s.name).sort()).toEqual(
			[...SHIPPED_DEFAULT_SKILLS].sort(),
		);
	});

	it("every shipped skill is valid, classified global, and marked isDefault", () => {
		const skills = listSkills({ skillsDir: REPO_SKILLS_DIR });
		for (const expectedName of SHIPPED_DEFAULT_SKILLS) {
			const skill = skills.find((s) => s.name === expectedName);
			expect(skill, `skill "${expectedName}" must be present`).toBeTruthy();
			expect(skill.source, `skill "${expectedName}" must be global`).toBe("global");
			expect(skill.invalid, `skill "${expectedName}" must be valid`).toBe(false);
			expect(
				skill.description.length,
				`skill "${expectedName}" must have a description`,
			).toBeGreaterThan(0);
			expect(
				skill.config?.isDefault,
				`skill "${expectedName}" KB_config must set isDefault: true`,
			).toBe(true);
		}
	});

	it("every shipped skill loads with a non-empty body via loadSkill", () => {
		for (const expectedName of SHIPPED_DEFAULT_SKILLS) {
			const skill = loadSkill({ name: expectedName, skillsDir: REPO_SKILLS_DIR });
			expect(skill, `loadSkill("${expectedName}") must return a descriptor`).toBeTruthy();
			expect(skill.invalid, `loadSkill("${expectedName}") must be valid`).toBe(false);
			expect(skill.body.length, `loadSkill("${expectedName}") body must be non-empty`).toBeGreaterThan(0);
			expect(skill.source, `loadSkill("${expectedName}") must be global`).toBe("global");
		}
	});

	it("no shipped skill contains environment-specific absolute paths", () => {
		// Guards against regressions where a skill re-introduces a hardcoded
		// developer-machine path that would not exist on another deployment.
		const forbiddenPatterns = [/\/home\/server\//, /home\.home/, /kainbain\.home/];
		for (const expectedName of SHIPPED_DEFAULT_SKILLS) {
			const skill = loadSkill({ name: expectedName, skillsDir: REPO_SKILLS_DIR });
			for (const pattern of forbiddenPatterns) {
				expect(
					skill.markdown,
					`skill "${expectedName}" must not contain ${pattern}`,
				).not.toMatch(pattern);
			}
		}
	});

	it("shipped skills keep global provenance when the overlay equals the library (self-managed repo)", () => {
		// Simulates KainBain managing its own repository: projectSkillsDir === skillsDir.
		const skills = listSkills({
			skillsDir: REPO_SKILLS_DIR,
			projectSkillsDir: REPO_SKILLS_DIR,
		});
		expect(skills).toHaveLength(SHIPPED_DEFAULT_SKILLS.length);
		for (const skill of skills) {
			expect(skill.source).toBe("global");
		}
	});
});