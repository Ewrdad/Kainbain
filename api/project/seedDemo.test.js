import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "../projectStore.js";
import { DEMO_SEED_PROJECT_NAME, seedDemoProject } from "./seedDemo.js";

/***
 * MARK: seedDemoProject tests
 * @description The install-time demo seed (KAINBAIN_SEED_DEMO): an empty
 *   store gains one local-only "Welcome Tour" project (one agent stage +
 *   human review); a non-empty store is never touched, and seeding is
 *   idempotent.
 ***/
describe("seedDemoProject", () => {
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-seed-"));
		tempNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-seed-notes-"));
	});

	afterEach(() => {
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	const emptyStore = () =>
		new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});

	it("seeds one agent-plus-review project into an empty store", () => {
		const store = emptyStore();
		const project = seedDemoProject(store);
		expect(project).not.toBeNull();
		expect(project.name).toBe(DEMO_SEED_PROJECT_NAME);
		expect(store.listProjects()).toHaveLength(1);
		const stages = project.workflows?.[0]?.stages || project.stages || [];
		expect(stages.map((s) => s.type)).toEqual(["agent", "human"]);
	});

	it("leaves a non-empty store untouched", () => {
		const store = emptyStore();
		store.registerProject({ path: tempNotesDir });
		expect(seedDemoProject(store)).toBeNull();
		expect(store.listProjects()).toHaveLength(1);
	});

	it("is idempotent", () => {
		const store = emptyStore();
		expect(seedDemoProject(store)).not.toBeNull();
		expect(seedDemoProject(store)).toBeNull();
		expect(store.listProjects()).toHaveLength(1);
	});

	it("returns null instead of throwing on an unusable store", () => {
		expect(seedDemoProject(null)).toBeNull();
		expect(seedDemoProject({})).toBeNull();
	});
});
