import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "./projectStore.js";

/***
 * MARK: Project remote requirement (D11) tests
 * @description Verifies that creating a NEW project requires a fetchable
 *   git remote (explicit gitUrl or KAINBAIN_GIT_REMOTE_TEMPLATE expansion),
 *   rejects before any directory is created, and leaves the adoption path
 *   (registerProject) and opt-in samples remote-free (grandfathered D11b).
 ***/
describe("Project remote requirement (D11)", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;
	const OLD_TEMPLATE = process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;

	beforeEach(() => {
		delete process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-notes-"),
		);
		store = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
	});

	afterEach(() => {
		if (OLD_TEMPLATE === undefined)
			delete process.env.KAINBAIN_GIT_REMOTE_TEMPLATE;
		else process.env.KAINBAIN_GIT_REMOTE_TEMPLATE = OLD_TEMPLATE;
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	it("rejects remote-less creation with the D11 error before touching disk", () => {
		try {
			store.createProject({ name: "No Remote App" });
			expect.unreachable();
		} catch (err) {
			expect(err.statusCode).toBe(400);
			expect(err.code).toBe("REMOTE_REQUIRED");
			expect(err.message).toMatch(/KAINBAIN_GIT_REMOTE_TEMPLATE/);
			expect(err.message).toMatch(/\/projects\/register/);
		}
		expect(fs.existsSync(path.join(tempProjectsDir, "no-remote-app"))).toBe(
			false,
		);
	});

	it("accepts an explicit gitUrl", () => {
		const project = store.createProject({
			name: "Remote App",
			gitUrl: "https://git.example.com/team/remote-app.git",
		});
		expect(project.gitUrl).toBe(
			"https://git.example.com/team/remote-app.git",
		);
	});

	it("accepts template expansion when no gitUrl is given", () => {
		process.env.KAINBAIN_GIT_REMOTE_TEMPLATE =
			"https://git.example.com/team/${SLUG}.git";
		const project = store.createProject({ name: "Templated App" });
		expect(project.gitUrl).toBe(
			"https://git.example.com/team/templated-app.git",
		);
	});

	it("keeps adoption remote-free (grandfathered local-only, D11b)", () => {
		const adopted = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-adopt-"),
		);
		try {
			const project = store.registerProject({ path: adopted });
			expect(project.cwd).toBe(adopted);
			expect(project.gitUrl).toBeNull();
		} finally {
			fs.rmSync(adopted, { recursive: true, force: true });
		}
	});

	it("keeps the internal local-only escape hatch for fixtures", () => {
		const project = store.createProject({
			name: "Local Fixture",
			allowLocalOnly: true,
		});
		expect(project.gitUrl).toBeNull();
	});
});
