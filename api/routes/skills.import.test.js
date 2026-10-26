/* eslint-disable security/detect-non-literal-fs-filename -- temp-dir test fixtures by design */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import skillsRoutes, { declaredMimeMatches } from "./skills.js";
import { SkillsRegistry } from "../skills/skillsRegistry.js";
import { config as appConfig } from "../config.js";

/**
 * MARK: Skill import/delete API contract tests
 * @description Covers POST /projects/:id/skills/import (`.md` + `.zip` happy
 *   paths, every 400/404/409/413 guard, overwrite retry, global shadowing,
 *   cache invalidation) and DELETE /projects/:id/skills/:name
 *   (overlay-only removal, global protection, traversal). Uses an isolated
 *   Fastify instance with temp global/project dirs — never the repo library.
 *   Every failure case also asserts the overlay was left untouched
 *   (validate-before-write).
 */

const FRONTMATTER_MD = `---\nname: imported-guide\ndescription: An imported guide\n---\n# Imported Guide\nBody.`;
const NO_FRONTMATTER_MD = `# Bare Guide\nBody without frontmatter.`;

function buildZip(files) {
	const zip = new AdmZip();
	for (const [name, content] of Object.entries(files)) {
		zip.addFile(name, Buffer.from(String(content), "utf8"));
	}
	return zip.toBuffer();
}

// `../evil.md` traversal entry (python-zipfile-authored; adm-zip cannot
// write traversal names). Must be rejected with nothing written.
const SLIP_ZIP = Buffer.from(
	"UEsDBBQAAAAAAMgOPl1xF4RdBgAAAAYAAAAKAAAALi4vZXZpbC5tZCMgZXZpbFBLAQIUAxQAAAAAAMgOPl1xF4RdBgAAAAYAAAAKAAAAAAAAAAAAAACAAQAAAAAuLi9ldmlsLm1kUEsFBgAAAAABAAEAOAAAAC4AAAAAAA==",
	"base64",
);

/***
 * MARK: multipartImportBody
 * @description Builds a raw multipart/form-data body for app.inject with one
 *   `file` part plus optional text fields (name/overwrite) — light-my-request
 *   has no FormData helper, so the framing is byte-assembled here.
 ***/
function multipartImportBody({ filename, buffer, mimetype, fields = {} }) {
	const boundary = "----kainbain-skill-import-boundary";
	const chunks = [];
	for (const [field, value] of Object.entries(fields)) {
		chunks.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${value}\r\n`,
				"latin1",
			),
		);
	}
	chunks.push(
		Buffer.from(
			`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
			"latin1",
		),
	);
	chunks.push(Buffer.isBuffer(buffer) ? buffer : Buffer.from(String(buffer)));
	chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "latin1"));
	return {
		payload: Buffer.concat(chunks),
		headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
	};
}

function writeGlobalSkill(globalDir, name, markdown) {
	const skillDir = path.join(globalDir, name);
	fs.mkdirSync(skillDir, { recursive: true });
	fs.writeFileSync(
		path.join(skillDir, "SKILL.md"),
		markdown ?? `---\nname: ${name}\ndescription: Global ${name}\n---\n# ${name}\nGlobal body.`,
		"utf8",
	);
}

describe("Skill import API (POST /projects/:id/skills/import)", () => {
	let globalDir;
	let projectDir;
	let app;

	const overlayEntries = () => {
		const overlay = path.join(projectDir, "skills");
		if (!fs.existsSync(overlay)) return [];
		return fs.readdirSync(overlay).filter((entry) => !entry.startsWith("."));
	};

	const doImport = async ({
		filename,
		buffer,
		mimetype = "application/octet-stream",
		fields = {},
		projectId = "proj-1",
	}) => {
		const { payload, headers } = multipartImportBody({
			filename,
			buffer,
			mimetype,
			fields,
		});
		return app.inject({
			method: "POST",
			url: `/projects/${projectId}/skills/import`,
			payload,
			headers,
		});
	};

	beforeEach(async () => {
		globalDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-import-global-"));
		projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-import-project-"));
		writeGlobalSkill(globalDir, "shared-default");

		// Long TTL on purpose: post-import visibility proves invalidate().
		const registry = new SkillsRegistry({ skillsDir: globalDir, cacheTtlMs: 60000 });
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

	it("imports a .md file into the project overlay", async () => {
		const res = await doImport({
			filename: "imported-guide.md",
			buffer: FRONTMATTER_MD,
			mimetype: "text/markdown",
		});
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.warnings).toEqual([]);
		expect(body.skills).toHaveLength(1);
		expect(body.skills[0].name).toBe("imported-guide");
		expect(body.skills[0].source).toBe("project");
		expect(body.skills[0].description).toBe("An imported guide");
		expect(body.skills[0].markdown).toBeUndefined();

		const stored = fs.readFileSync(
			path.join(projectDir, "skills", "imported-guide", "SKILL.md"),
			"utf8",
		);
		expect(stored).toContain("name: imported-guide");
	});

	it("imports a .md without frontmatter, reporting every normalization", async () => {
		const res = await doImport({ filename: "bare-guide.md", buffer: NO_FRONTMATTER_MD });
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.skills[0].name).toBe("bare-guide");
		expect(body.skills[0].description).toBe("Bare Guide");
		expect(body.warnings.length).toBeGreaterThan(0);
		expect(body.warnings.join(" ")).toMatch(/filename/);
	});

	it("honours the explicit name override", async () => {
		const res = await doImport({
			filename: "imported-guide.md",
			buffer: FRONTMATTER_MD,
			fields: { name: "renamed-guide" },
		});
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.skills[0].name).toBe("renamed-guide");
		expect(body.warnings.join(" ")).toMatch(/overridden/);
		expect(
			fs.existsSync(path.join(projectDir, "skills", "renamed-guide", "SKILL.md")),
		).toBe(true);
	});

	it("rejects an invalid explicit name with nothing written", async () => {
		const res = await doImport({
			filename: "imported-guide.md",
			buffer: FRONTMATTER_MD,
			fields: { name: "Bad Name!" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/not a valid skill slug/);
		expect(overlayEntries()).toEqual([]);
	});

	it("imports a root-layout zip", async () => {
		const res = await doImport({
			filename: "pack.zip",
			buffer: buildZip({ "SKILL.md": FRONTMATTER_MD }),
			mimetype: "application/zip",
		});
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload).skills[0].name).toBe("imported-guide");
	});

	it("imports a folder-layout zip with its KB_config.json", async () => {
		const res = await doImport({
			filename: "pack.zip",
			buffer: buildZip({
				"guide/SKILL.md": FRONTMATTER_MD,
				"guide/KB_config.json": '{"keywords":{"targetStage":{"value":"Intake"}}}',
			}),
			mimetype: "application/zip",
		});
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.skills[0].hasConfig).toBe(true);
		expect(body.skills[0].keywords.targetStage).toBe("Intake");
		expect(
			fs.existsSync(
				path.join(projectDir, "skills", "imported-guide", "KB_config.json"),
			),
		).toBe(true);
	});

	it("makes imports visible to GET /skills immediately (cache invalidation)", async () => {
		const before = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		expect(JSON.parse(before.payload).map((skill) => skill.name)).not.toContain(
			"imported-guide",
		);
		const res = await doImport({ filename: "g.md", buffer: FRONTMATTER_MD });
		expect(res.statusCode).toBe(201);
		const after = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		const names = JSON.parse(after.payload).map((skill) => skill.name);
		expect(names).toContain("imported-guide");
		const detail = await app.inject({
			method: "GET",
			url: "/skills/imported-guide?projectId=proj-1",
		});
		expect(detail.statusCode).toBe(200);
		expect(JSON.parse(detail.payload).markdown).toContain("# Imported Guide");
	});

	it("rejects garbage zips with nothing written", async () => {
		const res = await doImport({
			filename: "pack.zip",
			buffer: "this is not a zip",
			mimetype: "application/zip",
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/valid zip/i);
		expect(overlayEntries()).toEqual([]);
	});

	it("rejects zip-slip archives with nothing written", async () => {
		const res = await doImport({
			filename: "evil.zip",
			buffer: SLIP_ZIP,
			mimetype: "application/zip",
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/escapes the archive/);
		expect(overlayEntries()).toEqual([]);
		expect(fs.existsSync(path.join(projectDir, "evil.md"))).toBe(false);
	});

	it("rejects zip-bomb entries with 400 and nothing written", async () => {
		const res = await doImport({
			filename: "bomb.zip",
			buffer: buildZip({ "SKILL.md": "x".repeat(300 * 1024) }),
			mimetype: "application/zip",
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/max 262144/);
		expect(overlayEntries()).toEqual([]);
	});

	it("serializes concurrent imports on the same slug (one 201, one 409, no half-install)", async () => {
		const attempt = () =>
			doImport({ filename: "race.md", buffer: FRONTMATTER_MD });
		const [first, second] = await Promise.all([attempt(), attempt()]);
		const statuses = [first.statusCode, second.statusCode].sort();
		expect(statuses).toEqual([201, 409]);

		const skillDir = path.join(projectDir, "skills", "imported-guide");
		expect(fs.existsSync(path.join(skillDir, "SKILL.md"))).toBe(true);
		expect(overlayEntries()).toEqual(["imported-guide"]);
		const leftovers = fs
			.readdirSync(path.join(projectDir, "skills"))
			.filter((entry) => entry.startsWith(".") || entry.includes(".backup-"));
		expect(leftovers).toEqual([]);

		const listed = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		const skill = JSON.parse(listed.payload).find(
			(entry) => entry.name === "imported-guide",
		);
		expect(skill.invalid).not.toBe(true);
	});

	it("rejects multi-skill zips with nothing written", async () => {
		const res = await doImport({
			filename: "two.zip",
			buffer: buildZip({
				"one/SKILL.md": FRONTMATTER_MD,
				"two/SKILL.md": FRONTMATTER_MD,
			}),
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/holds 2 skills/);
		expect(overlayEntries()).toEqual([]);
	});

	it("rejects unsupported extensions", async () => {
		const res = await doImport({ filename: "notes.txt", buffer: "hi" });
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/Only .md and .zip/);
		expect(overlayEntries()).toEqual([]);
	});

	it("rejects contradictory declared MIME types", async () => {
		const res = await doImport({
			filename: "guide.md",
			buffer: FRONTMATTER_MD,
			mimetype: "image/png",
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/does not match/);
		expect(overlayEntries()).toEqual([]);
	});

	it("rejects oversized uploads with 413 and nothing written", async () => {
		const res = await doImport({
			filename: "big.md",
			buffer: Buffer.alloc(appConfig.skillImportMaxBytes + 1, "x"),
		});
		expect(res.statusCode).toBe(413);
		expect(JSON.parse(res.payload).error).toMatch(/1048576 byte limit/);
		expect(overlayEntries()).toEqual([]);
	});

	it("rejects non-multipart requests", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects/proj-1/skills/import",
			payload: { file: "nope" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/multipart/);
	});

	it("returns 409 on name clashes, then overwrites with overwrite=true", async () => {
		const first = await doImport({ filename: "g.md", buffer: FRONTMATTER_MD });
		expect(first.statusCode).toBe(201);

		const clash = await doImport({ filename: "g.md", buffer: FRONTMATTER_MD });
		expect(clash.statusCode).toBe(409);
		const clashBody = JSON.parse(clash.payload);
		expect(clashBody.error).toMatch(/already exists/);
		expect(clashBody.conflicts).toEqual(["imported-guide"]);

		const retry = await doImport({
			filename: "g.md",
			buffer: FRONTMATTER_MD.replace("An imported guide", "Replaced guide"),
			fields: { overwrite: "true" },
		});
		expect(retry.statusCode).toBe(201);
		const stored = fs.readFileSync(
			path.join(projectDir, "skills", "imported-guide", "SKILL.md"),
			"utf8",
		);
		expect(stored).toContain("Replaced guide");
	});

	it("flags global-name shadowing as a visible warning", async () => {
		const res = await doImport({
			filename: "shared-default.md",
			buffer: "---\nname: shared-default\ndescription: Project override\n---\n# P\nBody.",
		});
		expect(res.statusCode).toBe(201);
		const body = JSON.parse(res.payload);
		expect(body.warnings).toContain(
			"Skill 'shared-default' shadows a KainBain default skill",
		);
		const listed = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		const shadowed = JSON.parse(listed.payload).find(
			(skill) => skill.name === "shared-default",
		);
		expect(shadowed.source).toBe("project");
		expect(shadowed.description).toBe("Project override");
	});

	it("installs invalid KB_config.json as invalid (never a 500)", async () => {
		const res = await doImport({
			filename: "pack.zip",
			buffer: buildZip({
				"SKILL.md": FRONTMATTER_MD,
				"KB_config.json": "{not json",
			}),
		});
		expect(res.statusCode).toBe(201);
		expect(JSON.parse(res.payload).warnings.join(" ")).toMatch(/not valid JSON/);
		const listed = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		const skill = JSON.parse(listed.payload).find(
			(entry) => entry.name === "imported-guide",
		);
		expect(skill.invalid).toBe(true);
		expect(skill.error).toMatch(/KB_config/);
	});

	it("returns 404 for unknown projects", async () => {
		const res = await doImport({
			filename: "g.md",
			buffer: FRONTMATTER_MD,
			projectId: "ghost",
		});
		expect(res.statusCode).toBe(404);
	});
});

describe("Skill delete API (DELETE /projects/:id/skills/:name)", () => {
	let globalDir;
	let projectDir;
	let app;
	let registry;

	beforeEach(async () => {
		globalDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-delete-global-"));
		projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-skill-delete-project-"));
		writeGlobalSkill(globalDir, "shared-default");
		const overlaySkill = path.join(projectDir, "skills", "custom-one");
		fs.mkdirSync(overlaySkill, { recursive: true });
		fs.writeFileSync(
			path.join(overlaySkill, "SKILL.md"),
			"---\nname: custom-one\ndescription: Custom\n---\n# C\nBody.",
			"utf8",
		);

		registry = new SkillsRegistry({ skillsDir: globalDir, cacheTtlMs: 60000 });
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

	it("deletes a project-overlay skill and invalidates the cache", async () => {
		const before = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		expect(JSON.parse(before.payload).map((skill) => skill.name)).toContain("custom-one");

		const res = await app.inject({
			method: "DELETE",
			url: "/projects/proj-1/skills/custom-one",
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ status: "deleted", name: "custom-one" });
		expect(fs.existsSync(path.join(projectDir, "skills", "custom-one"))).toBe(false);

		const after = await app.inject({ method: "GET", url: "/skills?projectId=proj-1" });
		expect(JSON.parse(after.payload).map((skill) => skill.name)).not.toContain(
			"custom-one",
		);
	});

	it("refuses to delete a KainBain default with a descriptive 404", async () => {
		const res = await app.inject({
			method: "DELETE",
			url: "/projects/proj-1/skills/shared-default",
		});
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.payload).error).toMatch(/KainBain default/);
		expect(
			fs.existsSync(path.join(globalDir, "shared-default", "SKILL.md")),
		).toBe(true);
	});

	it("returns 404 for unknown skills, traversal names, and projects", async () => {
		const missing = await app.inject({
			method: "DELETE",
			url: "/projects/proj-1/skills/nope",
		});
		expect(missing.statusCode).toBe(404);

		const traversal = await app.inject({
			method: "DELETE",
			url: "/projects/proj-1/skills/..%2F..%2Fetc",
		});
		expect(traversal.statusCode).toBe(404);

		const ghost = await app.inject({
			method: "DELETE",
			url: "/projects/ghost/skills/custom-one",
		});
		expect(ghost.statusCode).toBe(404);
	});
});

describe("declaredMimeMatches", () => {
	it("lets the extension win but rejects contradictions", () => {
		expect(declaredMimeMatches("g.md", "text/markdown")).toBe(true);
		expect(declaredMimeMatches("g.md", "")).toBe(true);
		expect(declaredMimeMatches("g.md", "application/octet-stream")).toBe(true);
		expect(declaredMimeMatches("g.md", "image/png")).toBe(false);
		expect(declaredMimeMatches("p.zip", "application/zip")).toBe(true);
		expect(declaredMimeMatches("p.zip", "application/x-zip-compressed")).toBe(true);
		expect(declaredMimeMatches("p.zip", "")).toBe(true);
		expect(declaredMimeMatches("p.zip", "text/plain")).toBe(false);
		expect(declaredMimeMatches("n.txt", "text/plain")).toBe(false);
	});
});
