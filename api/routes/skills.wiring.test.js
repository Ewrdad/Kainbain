/* eslint-disable security/detect-non-literal-fs-filename -- temp-dir test fixtures by design */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import skillsRoutes from "./skills.js";
import {
	SkillsRegistry,
	loadSkill,
} from "../skills/skillsRegistry.js";
import { PromptCurationEngine } from "../promptCuration.js";

/**
 * MARK: Skill import -> stage attach -> inject wiring tests
 * @description Proves the end-to-end seam with NO engine changes: an operator
 *   imports a `.md` skill through the HTTP endpoint, the project overlay
 *   lists it, a stage attaches it, and the curated prompt carries it —
 *   `direct` mode injects the body, `option` mode lists a manifest entry
 *   (body withheld). Uses temp global/project dirs only.
 */

const PROBE_BODY_MARKER = "WIRING-PROBE-BODY-7f3a9c";
const PROBE_MD = `---\nname: wiring-probe\ndescription: Wiring probe skill\n---\n# Wiring Probe\n${PROBE_BODY_MARKER} guides the stage.`;

function multipartFileBody(filename, buffer, mimetype = "text/markdown") {
	const boundary = "----kainbain-wiring-boundary";
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
		"latin1",
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "latin1");
	return {
		payload: Buffer.concat([head, Buffer.from(buffer), tail]),
		headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
	};
}

describe("Skill import -> stage attach -> prompt injection", () => {
	let globalDir;
	let projectDir;
	let app;

	const curateWith = (stageSkills) => {
		const engine = new PromptCurationEngine({
			loadSkill: (name, projectCwd) =>
				loadSkill({
					name,
					skillsDir: globalDir,
					projectSkillsDir: projectCwd ? path.join(projectCwd, "skills") : null,
				}),
		});
		return engine.curatePrompt(
			{
				id: "wiring-task",
				title: "Wiring",
				goal: "Prove the import seam",
				projectCwd: projectDir,
			},
			{ id: "1", name: "Probe", type: "agent", prompt: "Do the work.", skills: stageSkills },
		);
	};

	beforeEach(async () => {
		globalDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-wiring-global-"));
		projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-wiring-project-"));
		const globalSkill = path.join(globalDir, "shared-default");
		fs.mkdirSync(globalSkill, { recursive: true });
		fs.writeFileSync(
			path.join(globalSkill, "SKILL.md"),
			"---\nname: shared-default\ndescription: Global\n---\n# G\nGlobal.",
			"utf8",
		);

		const registry = new SkillsRegistry({ skillsDir: globalDir, cacheTtlMs: 0 });
		const projectStore = {
			getProject: (id) =>
				id === "proj-1" ? { id: "proj-1", name: "P1", cwd: projectDir } : undefined,
		};
		app = fastify();
		await app.register(fastifyMultipart);
		await app.register(skillsRoutes, { deps: { projectStore, skillsRegistry: registry } });
		await app.ready();
	});

	afterEach(async () => {
		if (app) await app.close();
		fs.rmSync(globalDir, { recursive: true, force: true });
		fs.rmSync(projectDir, { recursive: true, force: true });
	});

	it("import -> list -> direct attach injects the imported body", async () => {
		const { payload, headers } = multipartFileBody("wiring-probe.md", PROBE_MD);
		const imported = await app.inject({
			method: "POST",
			url: "/projects/proj-1/skills/import",
			payload,
			headers,
		});
		expect(imported.statusCode).toBe(201);

		const listed = await app.inject({
			method: "GET",
			url: "/skills?projectId=proj-1",
		});
		const probe = JSON.parse(listed.payload).find(
			(skill) => skill.name === "wiring-probe",
		);
		expect(probe).toBeTruthy();
		expect(probe.source).toBe("project");

		const prompt = curateWith([{ name: "wiring-probe", mode: "direct", config: {} }]);
		expect(prompt).toContain("# Stage Skills");
		expect(prompt).toContain("## wiring-probe");
		expect(prompt).toContain(PROBE_BODY_MARKER);
	});

	it("import -> list -> option attach lists a manifest entry (body withheld)", async () => {
		const { payload, headers } = multipartFileBody("wiring-probe.md", PROBE_MD);
		const imported = await app.inject({
			method: "POST",
			url: "/projects/proj-1/skills/import",
			payload,
			headers,
		});
		expect(imported.statusCode).toBe(201);

		const prompt = curateWith([{ name: "wiring-probe", mode: "option", config: {} }]);
		expect(prompt).toContain("# Available Skills");
		expect(prompt).toContain("### wiring-probe");
		expect(prompt).toContain("SKILL.md");
		expect(prompt).not.toContain(PROBE_BODY_MARKER);
	});
});
