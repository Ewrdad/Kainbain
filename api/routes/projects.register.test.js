import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolation: throwaway roots BEFORE the app (and its import-time stores)
// loads, so no fixture touches the live projects root or notes space.
const tempProjectsRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-register-routes-projects-"),
);
const tempNotesRoot = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-register-routes-notes-"),
);
process.env.PROJECTS_ROOT = tempProjectsRoot;
process.env.NOTES_SPACE_ROOT = tempNotesRoot;

const tempOutside = fs.mkdtempSync(
	path.join(os.tmpdir(), "kainbain-test-register-outside-"),
);

const { default: app } = await import("../index.js");

afterAll(() => {
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
		fs.rmSync(tempOutside, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

/***
 * MARK: Adopt existing project (POST /projects/register)
 * @description Route gate for adopting an existing repo: 201 on first
 *   adoption, 200 idempotent re-register, 400 on a missing path or a
 *   directory that does not exist.
 ***/
describe("POST /projects/register", () => {
	beforeAll(async () => {
		await app.ready();
	});

	it("400s when path is missing", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: {},
		});
		expect(res.statusCode).toBe(400);
	});

	it("400s when the directory does not exist", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: { path: path.join(tempOutside, "nope") },
		});
		expect(res.statusCode).toBe(400);
	});

	it("adopts a directory (201), then re-registers it idempotently (200)", async () => {
		const repoDir = path.join(tempOutside, "adopt-me");
		fs.mkdirSync(repoDir, { recursive: true });

		const first = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: { path: repoDir, kainbainDirName: ".kb" },
		});
		expect(first.statusCode).toBe(201);
		const adopted = JSON.parse(first.payload);
		expect(adopted.kainbainDirName).toBe(".kb");
		expect(fs.existsSync(path.join(repoDir, ".kb", "project.json"))).toBe(
			true,
		);

		const second = await app.inject({
			method: "POST",
			url: "/projects/register",
			payload: { path: repoDir },
		});
		expect(second.statusCode).toBe(200);
		expect(JSON.parse(second.payload).id).toBe(adopted.id);

		const listed = await app.inject({ method: "GET", url: "/projects" });
		const matches = JSON.parse(listed.payload).filter(
			(p) => p.cwd === path.resolve(repoDir),
		);
		expect(matches.length).toBe(1);
	});
});
