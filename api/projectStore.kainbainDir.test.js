/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ProjectStore } from "./projectStore.js";
import { getWorkingTreeStatus } from "./git.js";
import {
	resolveKainbainDir,
	resolveKainbainDirName,
	resolveProjectConfigPath,
	resolveSessionsDir,
} from "./kainbainDir.js";
import {
	worktreesBaseFor,
	quarantineDirFor,
} from "./work/taskWorkspace.js";

/**
 * MARK: ProjectStore custom state folder tests
 * @description Round-trip gate for per-project `kainbainDirName`: create with
 *   a custom folder, reload it through a fresh scan, and prove sessions,
 *   worktrees, gitignore, and the cleanliness guard all follow the folder.
 */
describe("ProjectStore kainbainDirName", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-kbdir-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-kbdir-notes-"),
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

	it("creates the state folder, config, and gitignore entry under a custom name", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Custom State App",
			kainbainDirName: ".kb",
		});
		expect(project.kainbainDirName).toBe(".kb");
		expect(fs.existsSync(path.join(project.cwd, ".kb", "project.json"))).toBe(
			true,
		);
		expect(fs.existsSync(path.join(project.cwd, ".kainbain"))).toBe(false);
		const gitignore = fs.readFileSync(
			path.join(project.cwd, ".gitignore"),
			"utf8",
		);
		expect(gitignore).toContain(".kb/sessions");
		expect(gitignore).not.toContain(".kainbain/sessions");
		const saved = JSON.parse(
			fs.readFileSync(path.join(project.cwd, ".kb", "project.json"), "utf8"),
		);
		expect(saved.kainbainDirName).toBe(".kb");
	});

	it("keeps the default file shape for default projects", () => {
		const project = store.createProject({ name: "Default State App" , allowLocalOnly: true });
		expect(project.kainbainDirName).toBe(undefined);
		const saved = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		expect("kainbainDirName" in saved).toBe(false);
	});

	it("reloads the custom folder through a fresh scan (restart simulation)", () => {
		const created = store.createProject({
			allowLocalOnly: true,
			name: "Restart App",
			kainbainDirName: ".kb",
		});
		const rescanned = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		const loaded = rescanned.getProject(created.id);
		expect(loaded?.kainbainDirName).toBe(".kb");
		expect(resolveKainbainDirName(loaded)).toBe(".kb");
		expect(resolveProjectConfigPath(loaded.cwd, loaded)).toBe(
			path.join(path.resolve(loaded.cwd), ".kb", "project.json"),
		);
		// A save after reload writes back to the custom folder, not the default.
		rescanned._saveProjectFile(loaded);
		expect(fs.existsSync(path.join(loaded.cwd, ".kb", "project.json"))).toBe(
			true,
		);
		expect(fs.existsSync(path.join(loaded.cwd, ".kainbain"))).toBe(false);
	});

	it("adopts a hand-moved state folder missing the persisted setting", () => {
		const created = store.createProject({ name: "Moved App" , allowLocalOnly: true });
		expect(created.kainbainDirName).toBe(undefined);
		fs.renameSync(
			path.join(created.cwd, ".kainbain"),
			path.join(created.cwd, ".kb"),
		);
		const loaded = store._loadProjectFile(created.cwd);
		expect(loaded?.kainbainDirName).toBe(".kb");
	});

	it("rejects invalid state folder names on create without touching disk", () => {
		for (const bad of ["../escape", "a/b", ".git", "node_modules", "docs"]) {
			let err = null;
			try {
				store.createProject({ name: `Bad ${bad}`, kainbainDirName: bad , allowLocalOnly: true });
			} catch (e) {
				err = e;
			}
			expect(err?.code).toBe("INVALID_KAINBAIN_DIR_NAME");
		}
		expect(
			fs.readdirSync(tempProjectsDir).filter((e) => e.startsWith("bad-")),
		).toEqual([]);
	});

	it("updateProject sets, clears, and validates the folder without moving state", () => {
		const project = store.createProject({ name: "Rename App" , allowLocalOnly: true });
		const updated = store.updateProject(project.id, { kainbainDirName: ".kb" });
		expect(updated.kainbainDirName).toBe(".kb");
		// v1 does not move state: the old folder is still on disk.
		expect(fs.existsSync(path.join(project.cwd, ".kainbain"))).toBe(true);

		const cleared = store.updateProject(project.id, { kainbainDirName: "" });
		expect(cleared.kainbainDirName).toBe(undefined);

		let err = null;
		try {
			store.updateProject(project.id, { kainbainDirName: "../x" });
		} catch (e) {
			err = e;
		}
		expect(err?.code).toBe("INVALID_KAINBAIN_DIR_NAME");
		expect(store.getProject(project.id).kainbainDirName).toBe(undefined);
	});

	it("setting change survives a restart and clears the stale config", () => {
		const project = store.createProject({ name: "Survives Restart App" , allowLocalOnly: true });
		store.updateProject(project.id, { kainbainDirName: ".kb" });
		// v1 does not move state, so the old folder stays on disk, but the
		// superseded `.kainbain/project.json` is removed: otherwise a restart
		// would re-adopt it (no setting) and silently revert to the default,
		// splitting state across two folders.
		expect(fs.existsSync(path.join(project.cwd, ".kainbain"))).toBe(true);
		expect(
			fs.existsSync(path.join(project.cwd, ".kainbain", "project.json")),
		).toBe(false);
		expect(fs.existsSync(path.join(project.cwd, ".kb", "project.json"))).toBe(
			true,
		);
		const rescanned = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		const loaded = rescanned.getProject(project.id);
		expect(loaded?.kainbainDirName).toBe(".kb");
		expect(resolveKainbainDirName(loaded)).toBe(".kb");

		// Clearing the setting is symmetric: the custom config is removed and
		// the default folder wins again on the next scan.
		store.updateProject(project.id, { kainbainDirName: "" });
		expect(fs.existsSync(path.join(project.cwd, ".kb", "project.json"))).toBe(
			false,
		);
		const rescannedDefault = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		const loadedDefault = rescannedDefault.getProject(project.id);
		expect(loadedDefault?.kainbainDirName).toBe(undefined);
		expect(resolveKainbainDirName(loadedDefault)).toBe(".kainbain");
	});

	it("updateProject rejects docs/state folder collisions in both directions", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Collision App",
			docsDirName: "k-docs",
		});
		let first = null;
		try {
			store.updateProject(project.id, { kainbainDirName: "k-docs" });
		} catch (e) {
			first = e;
		}
		expect(first?.statusCode).toBe(400);

		const custom = store.createProject({
			allowLocalOnly: true,
			name: "Collision App 2",
			kainbainDirName: ".kb",
		});
		let second = null;
		try {
			store.updateProject(custom.id, { docsDirName: ".kb" });
		} catch (e) {
			second = e;
		}
		expect(second?.statusCode).toBe(400);
		expect(store.getProject(custom.id).kainbainDirName).toBe(".kb");
	});

	it("updateProject rejects crossing the two folders onto each other's current name", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Swap App",
			docsDirName: "k-docs",
			kainbainDirName: ".kb",
		});
		// A pure swap in one PATCH: the final names differ, so only the
		// crossing guard can see it. It would write the state config into
		// the docs folder and strand the old sessions/task docs.
		let swapErr = null;
		try {
			store.updateProject(project.id, {
				docsDirName: ".kb",
				kainbainDirName: "k-docs",
			});
		} catch (e) {
			swapErr = e;
		}
		expect(swapErr?.statusCode).toBe(400);
		expect(["INVALID_DOCS_DIR_NAME", "INVALID_KAINBAIN_DIR_NAME"]).toContain(
			swapErr?.code,
		);
		// Rejected before the record was touched: nothing changed on disk.
		const after = store.getProject(project.id);
		expect(after.docsDirName).toBe("k-docs");
		expect(after.kainbainDirName).toBe(".kb");
		expect(fs.existsSync(path.join(project.cwd, ".kb", "project.json"))).toBe(
			true,
		);
		expect(fs.existsSync(path.join(project.cwd, "k-docs", "project.json"))).toBe(
			false,
		);

		// Docs moving onto the current state folder while the state folder
		// moves away is the same hazard.
		let docsCross = null;
		try {
			store.updateProject(project.id, {
				docsDirName: ".kb",
				kainbainDirName: ".kb2",
			});
		} catch (e) {
			docsCross = e;
		}
		expect(docsCross?.statusCode).toBe(400);
		expect(docsCross?.code).toBe("INVALID_DOCS_DIR_NAME");

		// State moving into the current docs folder while the docs folder
		// moves away is the same hazard in the other direction.
		let stateCross = null;
		try {
			store.updateProject(project.id, {
				docsDirName: "k-docs2",
				kainbainDirName: "k-docs",
			});
		} catch (e) {
			stateCross = e;
		}
		expect(stateCross?.statusCode).toBe(400);
		expect(stateCross?.code).toBe("INVALID_KAINBAIN_DIR_NAME");

		// A double change that crosses nobody is fine, and re-sending the
		// unchanged pair (the settings form always sends both fields) is a
		// no-op, not an error.
		const ok = store.updateProject(project.id, {
			docsDirName: "k-docs2",
			kainbainDirName: ".kb2",
		});
		expect(ok.docsDirName).toBe("k-docs2");
		expect(ok.kainbainDirName).toBe(".kb2");
		const again = store.updateProject(project.id, {
			docsDirName: "k-docs2",
			kainbainDirName: ".kb2",
		});
		expect(again.docsDirName).toBe("k-docs2");
		expect(again.kainbainDirName).toBe(".kb2");
	});

	it("stale-config cleanup never removes another project's config", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Foreign Config App",
			kainbainDirName: ".kb",
		});
		const foreignConfig = path.join(project.cwd, ".kb", "project.json");
		// A config that names this cwd but belongs to a DIFFERENT project
		// (a corrupt/ambiguous setup) must survive the state-folder change.
		fs.writeFileSync(
			foreignConfig,
			JSON.stringify({ id: "some-other-project", cwd: project.cwd }),
		);
		store.updateProject(project.id, { kainbainDirName: ".kb2" });
		expect(fs.existsSync(path.join(project.cwd, ".kb2", "project.json"))).toBe(
			true,
		);
		expect(fs.existsSync(foreignConfig)).toBe(true);

		// An id-less legacy config naming this cwd IS this project's own —
		// sitting in the CURRENT state folder it is the superseded one and
		// is removed on the next change.
		const legacyConfig = path.join(project.cwd, ".kb2", "project.json");
		fs.writeFileSync(legacyConfig, JSON.stringify({ cwd: project.cwd }));
		store.updateProject(project.id, { kainbainDirName: ".kb3" });
		expect(fs.existsSync(legacyConfig)).toBe(false);
		expect(fs.existsSync(path.join(project.cwd, ".kb3", "project.json"))).toBe(
			true,
		);
	});

	it("session, worktree, and quarantine dirs honour the custom folder", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Dirs App",
			kainbainDirName: ".kb",
		});
		expect(resolveKainbainDir(project.cwd, project)).toBe(
			path.join(path.resolve(project.cwd), ".kb"),
		);
		expect(resolveSessionsDir(project.cwd, project)).toBe(
			path.join(path.resolve(project.cwd), ".kb", "sessions"),
		);
		expect(worktreesBaseFor(project.cwd, project)).toBe(
			path.join(path.resolve(project.cwd), ".kb", "worktrees"),
		);
		expect(quarantineDirFor(project.cwd, project)).toBe(
			path.join(path.resolve(project.cwd), ".kb", "quarantine"),
		);
	});

	it("cleanliness guard ignores the custom folder with a project hint", async () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Guard App",
			kainbainDirName: ".kb",
		});
		const debris = path.join(project.cwd, ".kb", "sessions", "scratch.json");
		fs.mkdirSync(path.dirname(debris), { recursive: true });
		fs.writeFileSync(debris, "{}", "utf8");
		const withHint = await getWorkingTreeStatus(project.cwd, { project });
		expect(
			withHint.dirtyPaths.some((p) => String(p).includes(".kb")),
		).toBe(false);
		const strict = await getWorkingTreeStatus(project.cwd, { ignorePaths: [] });
		expect(strict.clean).toBe(false);
		expect(
			strict.dirtyPaths.some((p) => String(p).includes(".kb")),
		).toBe(true);
	});

	it("sessionStore.sessionDirFor honours the custom folder", async () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Session App",
			kainbainDirName: ".kb",
		});
		const { SessionStore } = await import("./sessionStore.js");
		const sessions = new SessionStore({ baseDir: null });
		expect(sessions.sessionDirFor(project)).toBe(
			path.join(path.resolve(project.cwd), ".kb", "sessions"),
		);
		const def = store.createProject({ name: "Session Default App" , allowLocalOnly: true });
		expect(sessions.sessionDirFor(def)).toBe(
			path.join(path.resolve(def.cwd), ".kainbain", "sessions"),
		);
	});

	it("restores docs link settings on scan so custom docs survive restart", () => {
		const created = store.createProject({
			allowLocalOnly: true,
			name: "Docs Restart App",
			docsDirName: "k-docs",
		});
		const rescanned = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		const loaded = rescanned.getProject(created.id);
		expect(loaded?.docsDirName).toBe("k-docs");
		expect(fs.existsSync(path.join(loaded.cwd, ".kainbain", "project.json"))).toBe(
			true,
		);
	});

	it("clearing docsDirName migrates the old link back to docs", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Docs Clear App",
			docsDirName: "k-docs",
		});
		expect(fs.existsSync(path.join(project.cwd, "k-docs"))).toBe(true);
		store.updateProject(project.id, { docsDirName: "" });
		expect(store.getProject(project.id).docsDirName).toBe(undefined);
		// The blank payload normalized to `undefined`; the post-save migration
		// must still run (the touched flag, not the normalized field, drives it).
		expect(fs.existsSync(path.join(project.cwd, "k-docs"))).toBe(false);
		expect(fs.existsSync(path.join(project.cwd, "docs"))).toBe(true);
	});
});
