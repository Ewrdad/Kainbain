import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: point the stores at throwaway roots BEFORE the app (and every
// store it constructs at import time) is loaded, so no fixture in this file
// can ever touch the live projects root or the live SilverBullet notes space.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-kbdir-routes-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-kbdir-routes-notes-"),
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
 * MARK: Project state-folder settings (POST/PATCH /projects)
 * @description Regression gate for per-project state linkage: POST must honour
 *   `kainbainDirName`, PATCH must set/clear it with strict validation, and
 *   invalid names or docs collisions must 400 without touching the project.
 ***/
describe("POST/PATCH /projects kainbainDirName", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("creates the state folder at a custom kainbainDirName and echoes it", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Custom State Api App", kainbainDirName: ".kb" },
		});
		expect(res.statusCode).toBe(201);
		const project = JSON.parse(res.payload);
		expect(project.kainbainDirName).toBe(".kb");

		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		expect(fetched.statusCode).toBe(200);
		expect(JSON.parse(fetched.payload).kainbainDirName).toBe(".kb");
		expect(
			fs.existsSync(path.join(project.cwd, ".kb", "project.json")),
		).toBe(true);
	});

	it("rejects invalid kainbainDirName values with a 400", async () => {
		for (const bad of ["../escape", ".git", "node_modules"]) {
			const res = await app.inject({
				method: "POST",
				url: "/projects",
				payload: { name: `Bad State ${bad}`, kainbainDirName: bad },
			});
			expect(res.statusCode).toBe(400);
		}
	});

	it("PATCH sets and clears kainbainDirName, and 400s on collisions", async () => {
		const created = await app.inject({
			method: "POST",
			url: "/projects",
			payload: { name: "Patch State App", docsDirName: "k-docs" },
		});
		const project = JSON.parse(created.payload);

		const set = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { kainbainDirName: ".kb" },
		});
		expect(set.statusCode).toBe(200);
		expect(JSON.parse(set.payload).kainbainDirName).toBe(".kb");

		const colliding = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { kainbainDirName: "k-docs" },
		});
		expect(colliding.statusCode).toBe(400);

		const cleared = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { kainbainDirName: "" },
		});
		expect(cleared.statusCode).toBe(200);
		expect(JSON.parse(cleared.payload).kainbainDirName).toBe(undefined);
	});

	it("PATCH rejects swapping the docs and state folders onto each other", async () => {
		const created = await app.inject({
			method: "POST",
			url: "/projects",
			payload: {
				name: "Swap Api App",
				docsDirName: "k-docs",
				kainbainDirName: ".kb",
			},
		});
		const project = JSON.parse(created.payload);

		// A single PATCH that exchanges the two folder names would strand
		// the old sessions/task docs — rejected with a 400, nothing changes.
		const swap = await app.inject({
			method: "PATCH",
			url: `/projects/${project.id}`,
			payload: { docsDirName: ".kb", kainbainDirName: "k-docs" },
		});
		expect(swap.statusCode).toBe(400);

		const fetched = await app.inject({
			method: "GET",
			url: `/projects/${project.id}`,
		});
		const after = JSON.parse(fetched.payload);
		expect(after.docsDirName).toBe("k-docs");
		expect(after.kainbainDirName).toBe(".kb");
		expect(
			fs.existsSync(path.join(project.cwd, ".kb", "project.json")),
		).toBe(true);
		expect(
			fs.existsSync(path.join(project.cwd, "k-docs", "project.json")),
		).toBe(false);
	});
});
