/* eslint-disable security/detect-non-literal-fs-filename -- temp-dir test fixtures by design */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import skillsRoutes from "./skills.js";
import { SkillsRegistry } from "../skills/skillsRegistry.js";

/**
 * MARK: Skills API integration tests
 * @description Verifies GET /skills and GET /skills/:name with an isolated temp
 *   skills library (no dependency on repo content): listing, project-overlay
 *   shadowing, raw markdown preview, 404s, and path-traversal blocking.
 */

function writeSkill(dir, name, { markdown, configJson } = {}) {
	const skillDir = path.join(dir, name);
	fs.mkdirSync(skillDir, { recursive: true });
	fs.writeFileSync(
		path.join(skillDir, "SKILL.md"),
		markdown ?? `---\nname: ${name}\ndescription: Skill ${name}\n---\n# ${name}\nBody.`,
		"utf8",
	);
	if (configJson !== undefined) {
		fs.writeFileSync(path.join(skillDir, "KB_config.json"), configJson, "utf8");
	}
}

describe("Skills API (GET /skills)", () => {
	let globalDir;
	let projectDir;
	let app;

	beforeEach(async () => {
		globalDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skills-global-"));
		projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skills-project-"));
		writeSkill(globalDir, "global-skill");
		writeSkill(globalDir, "shared-skill", {
			markdown: "---\nname: shared-skill\ndescription: global version\n---\nG",
		});
		writeSkill(path.join(projectDir, "skills"), "shared-skill", {
			markdown: "---\nname: shared-skill\ndescription: project version\n---\nP",
		});
		writeSkill(globalDir, "configured-skill", {
			configJson: '{"keywords":{"targetStage":{"value":"Intake","description":"Where"}}}',
		});

		const registry = new SkillsRegistry({ skillsDir: globalDir, cacheTtlMs: 0 });
		const projectStore = {
			getProject: (id) =>
				id === "proj-1" ? { id: "proj-1", name: "P1", cwd: projectDir } : undefined,
		};

		app = fastify();
		await app.register(skillsRoutes, { deps: { projectStore, skillsRegistry: registry } });
		await app.ready();
	});

	afterEach(async () => {
		if (app) await app.close();
		fs.rmSync(globalDir, { recursive: true, force: true });
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	it("lists the global library when no projectId is given", async () => {
		const res = await app.inject({ method: "GET", url: "/skills" });
		expect(res.statusCode).toBe(200);
		const skills = JSON.parse(res.payload);
		expect(skills.map((s) => s.name).sort()).toEqual([
			"configured-skill",
			"global-skill",
			"shared-skill",
		]);
		const shared = skills.find((s) => s.name === "shared-skill");
		expect(shared.source).toBe("global");
		expect(shared.description).toBe("global version");
		expect(shared.markdown).toBeUndefined(); // no raw markdown in the list payload
		expect(shared.hasConfig).toBe(false);
	});

	it("applies the project overlay when projectId is given", async () => {
		const res = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		expect(res.statusCode).toBe(200);
		const skills = JSON.parse(res.payload);
		const shared = skills.find((s) => s.name === "shared-skill");
		expect(shared.source).toBe("project");
		expect(shared.description).toBe("project version");
	});

	it("returns parsed config + keywords for a configured skill", async () => {
		const res = await app.inject({ method: "GET", url: "/skills" });
		const skills = JSON.parse(res.payload);
		const configured = skills.find((s) => s.name === "configured-skill");
		expect(configured.hasConfig).toBe(true);
		expect(configured.keywords.targetStage).toBe("Intake");
		expect(configured.config.keywords.targetStage.description).toBe("Where");
	});

	it("returns 404 for an unknown projectId", async () => {
		const res = await app.inject({ method: "GET", url: "/skills?projectId=ghost" });
		expect(res.statusCode).toBe(404);
	});

	it("returns raw markdown for one skill", async () => {
		const res = await app.inject({ method: "GET", url: "/skills/global-skill" });
		expect(res.statusCode).toBe(200);
		const skill = JSON.parse(res.payload);
		expect(skill.name).toBe("global-skill");
		expect(skill.markdown).toContain("# global-skill");
		expect(skill.body).toContain("Body.");
		expect(skill.config).toEqual({});
	});

	it("prefers the project overlay when fetching one skill", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/skills/shared-skill?projectId=proj-1",
		});
		expect(res.statusCode).toBe(200);
		const skill = JSON.parse(res.payload);
		expect(skill.source).toBe("project");
		expect(skill.markdown).toContain("project version");
	});

	it("returns 404 for unknown skills and traversal names", async () => {
		const missing = await app.inject({ method: "GET", url: "/skills/nope" });
		expect(missing.statusCode).toBe(404);

		const traversal = await app.inject({
			method: "GET",
			url: "/skills/..%2F..%2Fetc%2Fpasswd",
		});
		expect(traversal.statusCode).toBe(404);
	});

	it("returns 404 for an unknown project on the detail endpoint", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/skills/global-skill?projectId=ghost",
		});
		expect(res.statusCode).toBe(404);
	});
});

describe("Skills API schema validation", () => {
	it("rejects malformed querystrings", async () => {
		const globalDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skills-schema-"));
		try {
			const registry = new SkillsRegistry({ skillsDir: globalDir, cacheTtlMs: 0 });
			const app = fastify();
			await app.register(skillsRoutes, {
				deps: { projectStore: { getProject: () => undefined }, skillsRegistry: registry },
			});
			await app.ready();
			const res = await app.inject({ method: "GET", url: "/skills?projectId=123" });
			// A non-existent project id is a clean 404 (string schema passes, project lookup fails).
			expect(res.statusCode).toBe(404);
			await app.close();
		} finally {
			fs.rmSync(globalDir, { recursive: true, force: true });
		}
	});
});

describe("Skills API keyword reference metadata (real library)", () => {
	// Read-only: serves the repo's own skills library to lock the route-level
	// pass-through of kbRef/dependsOn metadata (GET /skills strips body/markdown
	// but keeps `config` + `keywords` verbatim).
	const REPO_ROOT = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
	);
	const REPO_SKILLS_DIR = path.join(REPO_ROOT, "skills");
	let app;

	beforeAll(async () => {
		const registry = new SkillsRegistry({
			skillsDir: REPO_SKILLS_DIR,
			cacheTtlMs: 0,
		});
		app = fastify();
		await app.register(skillsRoutes, {
			deps: {
				projectStore: { getProject: () => undefined },
				skillsRegistry: registry,
			},
		});
		await app.ready();
	});

	afterAll(async () => {
		if (app) await app.close();
	});

	it("GET /skills keeps kbRef/dependsOn metadata in the list payload", async () => {
		const res = await app.inject({ method: "GET", url: "/skills" });
		expect(res.statusCode).toBe(200);
		const skills = JSON.parse(res.payload);
		const skill = skills.find((s) => s.name === "creating-new-tickets");
		expect(skill).toBeTruthy();
		// Raw config metadata survives the list serialization verbatim.
		expect(skill.config.keywords.targetStage.kbRef).toBe("stage");
		expect(skill.config.keywords.targetWorkflow.dependsOn).toBe("targetProject");
		// The flattened keyword value is still present for prompt injection.
		expect(skill.keywords.targetStage).toBe("Idea");
	});

	it("GET /skills/:name keeps the same metadata for the detail payload", async () => {
		const res = await app.inject({
			method: "GET",
			url: "/skills/creating-new-tickets",
		});
		expect(res.statusCode).toBe(200);
		const skill = JSON.parse(res.payload);
		expect(skill.config.keywords.targetStage.kbRef).toBe("stage");
		expect(skill.config.keywords.targetStage.dependsOn).toBe("targetWorkflow");
		expect(skill.config.keywords.targetProject.kbRef).toBe("project");
		expect(skill.keywords.targetStage).toBe("Idea");
	});
});