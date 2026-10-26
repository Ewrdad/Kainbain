/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "./projectStore.js";

/***
 * MARK: ProjectStore docs-link tests
 * @description Pins the `<cwd>/docs` → notes-space link verification that
 *   keeps task storage reachable. Regression coverage for the 2026-10-02
 *   incident where the tracked `docs` symlink was removed from git: the
 *   engine recreated `docs/` as a real directory holding a single task, so
 *   the UI silently showed 1 of 134 tasks. ensureDocsLink must recreate a
 *   missing link, repoint a broken one, recreate a missing project notes
 *   dir when the space root exists (notes cleanup fallout), and loudly
 *   report (never silently adopt or delete) a real directory shadowing a
 *   populated notes space.
 ***/

describe("ProjectStore ensureDocsLink", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;
	let warnSpy;
	let errorSpy;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-docslink-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-docslink-notes-"),
		);
		store = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
		warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	function makeProject(name = "Demo") {
		const cwd = path.join(tempProjectsDir, name);
		fs.mkdirSync(cwd, { recursive: true });
		const notesDir = path.join(tempNotesDir, name);
		fs.mkdirSync(notesDir, { recursive: true });
		return { id: "p1", name, cwd, notesPath: notesDir, notesDir };
	}

	function seedNotesTask(notesDir, taskId = "task-1") {
		fs.mkdirSync(path.join(notesDir, "tasks", taskId), { recursive: true });
		fs.writeFileSync(
			path.join(notesDir, "tasks", taskId, "task.md"),
			"---\nid: \"task-1\"\n---\n",
			"utf8",
		);
	}

	it("recreates a missing docs symlink when the notes space exists", () => {
		const project = makeProject();
		const result = store.ensureDocsLink(project);

		expect(result.state).toBe("repaired");
		expect(result.repaired).toBe(true);
		const docsLink = path.join(project.cwd, "docs");
		expect(fs.lstatSync(docsLink).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(docsLink)).toBe(
			fs.realpathSync(project.notesDir),
		);
	});

	it("leaves a healthy symlink untouched", () => {
		const project = makeProject();
		const docsLink = path.join(project.cwd, "docs");
		fs.symlinkSync(project.notesDir, docsLink, "dir");

		const result = store.ensureDocsLink(project);

		expect(result).toMatchObject({ state: "ok", repaired: false });
		expect(fs.lstatSync(docsLink).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(docsLink)).toBe(
			fs.realpathSync(project.notesDir),
		);
	});

	it("reports (never adopts or deletes) a real directory shadowing populated notes", () => {
		const project = makeProject();
		seedNotesTask(project.notesDir);
		const shadowTasks = path.join(project.cwd, "docs", "tasks", "lonely");
		fs.mkdirSync(shadowTasks, { recursive: true });
		fs.writeFileSync(path.join(shadowTasks, "task.md"), "shadow", "utf8");

		const result = store.ensureDocsLink(project);

		expect(result).toMatchObject({ state: "shadowed", repaired: false });
		// The shadow directory is left byte-for-byte for an operator merge.
		expect(fs.lstatSync(path.join(project.cwd, "docs")).isDirectory()).toBe(
			true,
		);
		expect(
			fs.readFileSync(path.join(shadowTasks, "task.md"), "utf8"),
		).toBe("shadow");
		expect(errorSpy).toHaveBeenCalled();
	});

	it("treats a real docs directory as local storage when notes hold no tasks", () => {
		const project = makeProject();
		fs.mkdirSync(path.join(project.cwd, "docs", "tasks"), {
			recursive: true,
		});

		const result = store.ensureDocsLink(project);

		expect(result).toMatchObject({ state: "local-dir", repaired: false });
		expect(errorSpy).not.toHaveBeenCalled();
	});

	it("does nothing when the notes space root itself is absent (fresh clone)", () => {
		const project = makeProject();
		const missingRoot = path.join(tempNotesDir, "no-space-root");
		const missingNotes = path.join(missingRoot, "Demo");
		project.notesPath = missingNotes;
		project.notesDir = missingNotes;

		const result = store.ensureDocsLink(project);

		expect(result).toMatchObject({ state: "notes-missing", repaired: false });
		expect(fs.existsSync(path.join(project.cwd, "docs"))).toBe(false);
		// A missing space root is never created by link verification.
		expect(fs.existsSync(missingRoot)).toBe(false);
		expect(fs.existsSync(missingNotes)).toBe(false);
	});

	it("recreates a missing project notes dir and repoints the dangling link", () => {
		// A notes-store cleanup removed the paired note while the project
		// stayed registered: the space root exists, the project dir is gone,
		// and <cwd>/docs dangles. Verification must heal instead of leaving
		// every later write behind a 500 (task image uploads) or a silently
		// dropped save.
		const project = makeProject();
		const docsLink = path.join(project.cwd, "docs");
		fs.symlinkSync(project.notesDir, docsLink, "dir");
		fs.rmSync(project.notesDir, { recursive: true, force: true });

		const result = store.ensureDocsLink(project);

		// Recreating the notes directory un-dangles the pre-existing link,
		// so verification reports healthy — the heal is the recreated dir.
		expect(result).toMatchObject({ state: "ok", repaired: false });
		expect(fs.existsSync(project.notesDir)).toBe(true);
		expect(fs.realpathSync(docsLink)).toBe(
			fs.realpathSync(project.notesDir),
		);
	});

	it("recreates a missing project notes dir and links it when no docs entry exists", () => {
		const project = makeProject();
		fs.rmSync(project.notesDir, { recursive: true, force: true });

		const result = store.ensureDocsLink(project);

		expect(result.state).toBe("repaired");
		expect(result.repaired).toBe(true);
		expect(fs.existsSync(project.notesDir)).toBe(true);
		expect(fs.realpathSync(path.join(project.cwd, "docs"))).toBe(
			fs.realpathSync(project.notesDir),
		);
	});

	it("repoints a broken symlink at the existing notes space", () => {
		const project = makeProject();
		const docsLink = path.join(project.cwd, "docs");
		fs.symlinkSync(path.join(tempNotesDir, "gone"), docsLink, "dir");

		const result = store.ensureDocsLink(project);

		expect(result.state).toBe("repaired-broken-link");
		expect(result.repaired).toBe(true);
		expect(fs.realpathSync(docsLink)).toBe(
			fs.realpathSync(project.notesDir),
		);
	});

	it("warns about (never repoints) a link to a different existing space", () => {
		const project = makeProject();
		const other = path.join(tempNotesDir, "Other");
		fs.mkdirSync(other, { recursive: true });
		const docsLink = path.join(project.cwd, "docs");
		fs.symlinkSync(other, docsLink, "dir");

		const result = store.ensureDocsLink(project);

		expect(result).toMatchObject({ state: "foreign-link", repaired: false });
		expect(fs.realpathSync(docsLink)).toBe(fs.realpathSync(other));
		expect(warnSpy).toHaveBeenCalled();
	});

	it("resolves the notes space case-insensitively (peer review F-7)", () => {
		const project = makeProject("KainBain");
		// Saved config uses the wrong case; the real directory keeps its own.
		project.notesPath = path.join(tempNotesDir, "kainbain");
		project.notesDir = project.notesPath;

		const result = store.ensureDocsLink(project);

		expect(result.repaired).toBe(true);
		expect(fs.realpathSync(path.join(project.cwd, "docs"))).toBe(
			fs.realpathSync(path.join(tempNotesDir, "KainBain")),
		);
	});

	it("returns no-cwd when the project has no working directory", () => {
		expect(store.ensureDocsLink(null)).toMatchObject({
			state: "no-cwd",
			repaired: false,
		});
		expect(store.ensureDocsLink({})).toMatchObject({
			state: "no-cwd",
			repaired: false,
		});
	});

	it("creates and verifies a custom docs link name", () => {
		const project = makeProject("CustomDocs");
		project.docsDirName = "kainbain-docs";
		const result = store.ensureDocsLink(project);

		expect(result.state).toBe("repaired");
		expect(result.repaired).toBe(true);
		const customLink = path.join(project.cwd, "kainbain-docs");
		expect(fs.lstatSync(customLink).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(customLink)).toBe(
			fs.realpathSync(project.notesDir),
		);
		// Default docs/ was not created
		expect(fs.existsSync(path.join(project.cwd, "docs"))).toBe(false);
	});

	it("honours centralizedDocs: false (opted-out, no symlink)", () => {
		const project = makeProject("OptOut");
		project.centralizedDocs = false;
		const result = store.ensureDocsLink(project);

		expect(result).toMatchObject({ state: "opted-out", repaired: false });
		expect(fs.existsSync(path.join(project.cwd, "docs"))).toBe(false);
	});

	it("removes stale default docs symlink when renamed to a custom docs folder", () => {
		const project = makeProject("Renamed");
		// Create the default docs symlink first
		const defaultLink = path.join(project.cwd, "docs");
		fs.symlinkSync(project.notesDir, defaultLink, "dir");
		expect(fs.lstatSync(defaultLink).isSymbolicLink()).toBe(true);

		// Switch project to custom name
		project.docsDirName = "kainbain-docs";
		const result = store.ensureDocsLink(project);

		expect(result.state).toBe("repaired");
		const customLink = path.join(project.cwd, "kainbain-docs");
		expect(fs.lstatSync(customLink).isSymbolicLink()).toBe(true);
		// Stale default symlink pointing to notes was unlinked
		expect(fs.existsSync(defaultLink)).toBe(false);
	});

	it("refuses rename if destination folder is an existing real directory (conflict)", () => {
		const project = store.createProject({
			name: "RenameConflict",
			cwd: path.join(tempProjectsDir, "RenameConflict"),
		});
		const customDir = path.join(project.cwd, "kainbain-docs");
		fs.mkdirSync(customDir, { recursive: true });
		fs.writeFileSync(path.join(customDir, "existing.txt"), "hello");

		expect(() => {
			store.updateProject(project.id, { docsDirName: "kainbain-docs" });
		}).toThrow(/blocked/);

		// File in customDir is preserved
		expect(fs.readFileSync(path.join(customDir, "existing.txt"), "utf8")).toBe("hello");
	});
});

/***
 * MARK: ProjectStore docs-settings persistence
 * @description The custom link name and centralised-docs opt-out must survive
 *   a save/load cycle: `_saveProjectFile` persists them (default projects
 *   keep their legacy file shape with no new keys) and `_loadProjectFile`
 *   degrades hand-edited garbage to the defaults instead of breaking the
 *   project. Regression coverage: the keys were once accepted in memory but
 *   dropped on save, silently reverting custom projects on the next boot.
 ***/
describe("ProjectStore docs-settings persistence", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-docspersist-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-docspersist-notes-"),
		);
		store = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
	});

	afterEach(() => {
		try {
			fs.rmSync(tempProjectsDir, { recursive: true, force: true });
			fs.rmSync(tempNotesDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	});

	function readProjectFile(cwd) {
		return JSON.parse(
			fs.readFileSync(path.join(cwd, ".kainbain", "project.json"), "utf8"),
		);
	}

	it("round-trips a custom name + opt-out through save and load", () => {
		const project = store.createProject({
			name: "PersistDocs",
			docsDirName: "kainbain-docs",
			centralizedDocs: false,
		});
		expect(readProjectFile(project.cwd).docsDirName).toBe("kainbain-docs");
		expect(readProjectFile(project.cwd).centralizedDocs).toBe(false);

		const reloaded = store._loadProjectFile(project.cwd);
		expect(reloaded.docsDirName).toBe("kainbain-docs");
		expect(reloaded.centralizedDocs).toBe(false);
	});

	it("keeps the legacy file shape for default projects", () => {
		const project = store.createProject({ name: "DefaultShape" });
		const saved = readProjectFile(project.cwd);
		expect("docsDirName" in saved).toBe(false);
		expect("centralizedDocs" in saved).toBe(false);
	});

	it("degrades hand-edited garbage docs settings on load, never breaking", () => {
		const project = store.createProject({ name: "GarbageDocs" });
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		const raw = JSON.parse(fs.readFileSync(configFile, "utf8"));
		raw.docsDirName = "../escape";
		raw.centralizedDocs = "yes";
		fs.writeFileSync(configFile, JSON.stringify(raw), "utf8");

		const reloaded = store._loadProjectFile(project.cwd);
		expect(reloaded).not.toBeNull();
		expect(reloaded.docsDirName).toBeUndefined();
		expect(reloaded.centralizedDocs).toBeUndefined();
	});
});
