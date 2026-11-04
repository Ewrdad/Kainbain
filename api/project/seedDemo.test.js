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

	it("writes the marker on success and skips seeding once it exists", () => {
		const store = emptyStore();
		const markerFile = path.join(tempProjectsDir, "engine", "seed-demo.json");
		const project = seedDemoProject(store, { markerFile });
		expect(project).not.toBeNull();
		expect(fs.existsSync(markerFile)).toBe(true);
		expect((fs.statSync(markerFile).mode & 0o777).toString(8)).toBe("600");
		expect(JSON.parse(fs.readFileSync(markerFile, "utf8")).name).toBe(DEMO_SEED_PROJECT_NAME);

		// A later boot whose store is empty again (user deleted every
		// project) must NOT resurrect the demo: the marker suppresses it.
		const freshStore = emptyStore();
		expect(seedDemoProject(freshStore, { markerFile })).toBeNull();
		expect(freshStore.listProjects()).toHaveLength(0);
	});

	it("treats any existing marker path (even a directory) as already seeded", () => {
		const store = emptyStore();
		const markerFile = path.join(tempProjectsDir, "engine-marker-dir");
		fs.mkdirSync(markerFile, { recursive: true });
		expect(seedDemoProject(store, { markerFile })).toBeNull();
		expect(store.listProjects()).toHaveLength(0);
	});
});
