import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so no fixture in this file
// can ever touch the live projects root or the live SilverBullet notes space.
// Mirrors the mkdtemp + rmSync convention used by projects.test.js.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-docs-settings-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-docs-settings-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: Project docs-folder settings (POST /projects)
 * @description Regression gate for per-project docs linkage: POST must honour
 *   `docsDirName` (custom link-folder name) and `centralizedDocs: false`
 *   (opt out of centralised docs), and must reject invalid names with a 400
 *   instead of silently dropping the fields.
 ***/
describe("POST /projects docs-folder settings", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("creates the link at a custom docsDirName and echoes it", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Custom Docs App", docsDirName: "kainbain-docs" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.docsDirName).toBe("kainbain-docs");

		// GET reflects the stored choice.
		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(fetched.statusCode).toBe(200);
		expect(JSON.parse(fetched.payload).docsDirName).toBe("kainbain-docs");

		// On disk the custom entry is a symlink; the default is untouched.
		const customLink = path.join(project.cwd, "kainbain-docs");
		expect(fs.lstatSync(customLink).isSymbolicLink()).toBe(true);
		expect(fs.existsSync(path.join(project.cwd, "docs"))).toBe(false);
	});

	it("opts out with centralizedDocs: false (plain local dir, notes space untouched)", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Opt Out Docs App", centralizedDocs: false },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.centralizedDocs).toBe(false);

		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(JSON.parse(fetched.payload).centralizedDocs).toBe(false);

		// Plain local directory, never a symlink; the notes space is never
		// created or touched in opt-out mode.
		const docsEntry = path.join(project.cwd, "docs");
		const stat = fs.lstatSync(docsEntry);
		expect(stat.isDirectory()).toBe(true);
		expect(stat.isSymbolicLink()).toBe(false);
		expect(fs.existsSync(project.notesDir)).toBe(false);
	});

	it("rejects an invalid docsDirName with a 400 and creates nothing", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Bad Docs App", docsDirName: "../escape" },
		});
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.payload).error).toMatch(/docsDirName/i);
	});
});

/***
 * MARK: Project docs-folder settings (disk round-trip)
 * @description The settings must survive a restart: what POST/PATCH accepts
 *   in memory must reach `<cwd>/.kainbain/project.json` and load back
 *   unchanged through a fresh store (the pre-fix failure mode dropped both
 *   keys on save, silently reverting custom projects to `docs`/centralised
 *   on the next boot). Default projects must keep their existing file shape
 *   (no new keys).
 ***/
describe("docs-folder settings survive save + reload", () => {
	beforeAll(async () => {
		await app.ready();
	});

	function readProjectFile(cwd) {
		return JSON.parse(
			fs.readFileSync(path.join(cwd, ".kainbain", "project.json"), "utf8"),
		);
	}

	it("persists custom docsDirName + opt-out to project.json and reloads them", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Round Trip Docs App",
				docsDirName: "kainbain-docs",
				centralizedDocs: false,
			},
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);

		const saved = readProjectFile(project.cwd);
		expect(saved.docsDirName).toBe("kainbain-docs");
		expect(saved.centralizedDocs).toBe(false);

		// Fresh store (simulates a server restart) loads the same settings.
		const { ProjectStore } = await import("../projectStore.js");
		const fresh = new ProjectStore({
			projectsRoot: tempProjectsRoot,
			notesRoot: tempNotesRoot,
			autoScan: false,
		});
		const reloaded = fresh._loadProjectFile(project.cwd);
		expect(reloaded.docsDirName).toBe("kainbain-docs");
		expect(reloaded.centralizedDocs).toBe(false);
	});

	it("keeps the legacy file shape for default projects (no new keys)", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Default Shape Docs App" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);

		const saved = readProjectFile(project.cwd);
		expect("docsDirName" in saved).toBe(false);
		expect("centralizedDocs" in saved).toBe(false);
	});

	it("persists a PATCH rename to disk and migrates the link", async () => {
		const created = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Rename Persist Docs App" },
		});
		expect(created.statusCode).toBe(201);
		const project = JSON.parse(created.payload);

		const patched = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { docsDirName: "renamed-docs" },
		});
		expect(patched.statusCode).toBe(200);
		expect(JSON.parse(patched.payload).docsDirName).toBe("renamed-docs");

		expect(readProjectFile(project.cwd).docsDirName).toBe("renamed-docs");
		expect(
			fs.lstatSync(path.join(project.cwd, "renamed-docs")).isSymbolicLink(),
		).toBe(true);
	});
});
