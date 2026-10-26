/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "./projectStore.js";
import { readRegistry } from "./projectRegistry.js";

/**
 * MARK: ProjectStore multi-root and adopt tests
 * @description Contract gate for multi-project discovery: extra roots scan,
 *   results dedupe by cwd, bare directories never auto-create, and an
 *   adopted outside-root directory survives a restart via the registry file.
 */
describe("ProjectStore multi-root + register", () => {
	let tempRootA;
	let tempRootB;
	let tempOutside;
	let tempNotesDir;
	let tempRegistryFile;

	const makeStore = (overrides = {}) =>
		new ProjectStore({
			projectsRoot: tempRootA,
			notesRoot: tempNotesDir,
			registryFile: tempRegistryFile,
			autoScan: false,
			...overrides,
		});

	beforeEach(() => {
		tempRootA = fs.mkdtempSync(path.join(os.tmpdir(), "kb-multi-a-"));
		tempRootB = fs.mkdtempSync(path.join(os.tmpdir(), "kb-multi-b-"));
		tempOutside = fs.mkdtempSync(path.join(os.tmpdir(), "kb-multi-out-"));
		tempNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-multi-notes-"));
		tempRegistryFile = path.join(
			fs.mkdtempSync(path.join(os.tmpdir(), "kb-multi-reg-")),
			"projects.json",
		);
	});

	afterEach(() => {
		for (const dir of [tempRootA, tempRootB, tempOutside, tempNotesDir]) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// ignore cleanup errors
			}
		}
		try {
			fs.rmSync(path.dirname(tempRegistryFile), {
				recursive: true,
				force: true,
			});
		} catch {
			// ignore cleanup errors
		}
	});

	it("scans the primary root and every extra root", () => {
		const storeA = makeStore();
		const inA = storeA.createProject({ name: "Root A App" });
		const storeB = makeStore({ projectsRoot: tempRootB });
		const inB = storeB.createProject({ name: "Root B App" });

		const store = makeStore({ projectsRoots: [tempRootB] });
		const scanned = store.scanProjects();
		expect(scanned.find((p) => p.id === inA.id)?.name).toBe("Root A App");
		expect(scanned.find((p) => p.id === inB.id)?.name).toBe("Root B App");
	});

	it("dedupes by resolved cwd across roots and registry entries", () => {
		const store = makeStore({ projectsRoots: [tempRootA] });
		const created = store.createProject({ name: "Dedupe App" });
		// The same directory reachable twice (primary + extra root) is one project.
		const scanned = store.scanProjects();
		expect(scanned.filter((p) => p.id === created.id).length).toBe(1);
		expect(
			scanned.filter(
				(p) => path.resolve(p.cwd) === path.resolve(created.cwd),
			).length,
		).toBe(1);
	});

	it("ignores bare directories in every root (no auto-create)", () => {
		fs.mkdirSync(path.join(tempRootA, "stray-dir"), { recursive: true });
		fs.mkdirSync(path.join(tempRootB, "other-stray"), { recursive: true });
		const store = makeStore({ projectsRoots: [tempRootB] });
		expect(store.scanProjects()).toEqual([]);
		expect(store.listProjects()).toEqual([]);
	});

	it("dedupes by the config's own cwd when two roots name the same checkout", () => {
		const source = makeStore();
		const project = source.createProject({ name: "Shared Checkout" });
		// A second root holds a sibling config that names the same cwd (a moved
		// or aliased checkout). Both must collapse to a single project record.
		const aliasDir = path.join(tempRootB, "alias-dir");
		fs.mkdirSync(path.join(aliasDir, ".kainbain"), { recursive: true });
		const config = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		config.id = "alias-different-id";
		fs.writeFileSync(
			path.join(aliasDir, ".kainbain", "project.json"),
			JSON.stringify(config),
		);
		const store = makeStore({ projectsRoots: [tempRootB] });
		const scanned = store.scanProjects();
		expect(
			scanned.filter(
				(p) => path.resolve(p.cwd) === path.resolve(project.cwd),
			).length,
		).toBe(1);
	});

	it("register adopts a bare outside-root directory and survives restart", () => {
		const repoDir = path.join(tempOutside, "adopted-repo");
		fs.mkdirSync(repoDir, { recursive: true });
		const store = makeStore();
		const adopted = store.registerProject({ path: repoDir });
		expect(adopted.name).toBe("adopted-repo");
		expect(fs.existsSync(path.join(repoDir, ".kainbain", "project.json"))).toBe(
			true,
		);
		// Registered outside every root, so the registry file records it.
		expect(readRegistry({ registryFile: tempRegistryFile }).projects).toContain(
			path.resolve(repoDir),
		);

		// Restart simulation: a fresh store re-discovers the adopted project.
		const restarted = makeStore();
		const found = restarted.scanProjects().find((p) => p.id === adopted.id);
		expect(found?.cwd).toBe(path.resolve(repoDir));
	});

	it("register adopts a directory that already carries a custom-folder config", () => {
		const repoDir = path.join(tempOutside, "custom-repo");
		fs.mkdirSync(path.join(repoDir, ".kb"), { recursive: true });
		fs.writeFileSync(
			path.join(repoDir, ".kb", "project.json"),
			JSON.stringify({
				id: "pre-existing-1",
				name: "Pre-existing",
				slug: "pre-existing",
				cwd: repoDir,
			}),
		);
		const store = makeStore();
		const adopted = store.registerProject({ path: repoDir });
		expect(adopted.id).toBe("pre-existing-1");
		expect(adopted.kainbainDirName).toBe(".kb");
	});

	it("register is idempotent and validates its path", () => {
		const repoDir = path.join(tempOutside, "idempotent-repo");
		fs.mkdirSync(repoDir, { recursive: true });
		const store = makeStore();
		const first = store.registerProject({ path: repoDir, name: "Idem" });
		const second = store.registerProject({ path: repoDir, name: "Idem" });
		expect(second.id).toBe(first.id);
		expect(store.listProjects().length).toBe(1);

		for (const bad of ["", null, path.join(tempOutside, "missing")]) {
			let err = null;
			try {
				store.registerProject({ path: bad });
			} catch (e) {
				err = e;
			}
			expect(err?.statusCode).toBe(400);
			expect(err?.code).toBe("INVALID_PROJECT_PATH");
		}
	});

	it("register accepts a custom state folder for provisioning", () => {
		const repoDir = path.join(tempOutside, "kb-repo");
		fs.mkdirSync(repoDir, { recursive: true });
		const store = makeStore();
		const adopted = store.registerProject({
			path: repoDir,
			kainbainDirName: ".kb",
		});
		expect(adopted.kainbainDirName).toBe(".kb");
		expect(fs.existsSync(path.join(repoDir, ".kb", "project.json"))).toBe(true);
	});

	it("refuses to create, register, save, or patch an extra scan root as a project", () => {
		const store = makeStore({ projectsRoots: [tempRootB] });
		expect(() =>
			store.createProject({ name: "Bad Extra Root", cwd: tempRootB }),
		).toThrow("not the projects root");

		let registerErr = null;
		try {
			store.registerProject({ path: tempRootB });
		} catch (e) {
			registerErr = e;
		}
		expect(registerErr?.statusCode).toBe(400);
		expect(registerErr?.code).toBe("INVALID_PROJECT_PATH");

		const project = store.createProject({ name: "Valid Project" });
		store._saveProjectFile({ ...project, cwd: tempRootB });
		expect(fs.existsSync(path.join(tempRootB, ".kainbain", "project.json"))).toBe(
			false,
		);

		let patchErr = null;
		try {
			store.updateProject(project.id, { cwd: tempRootB });
		} catch (e) {
			patchErr = e;
		}
		expect(patchErr?.statusCode).toBe(400);
		expect(patchErr?.code).toBe("INVALID_PROJECT_CWD");
	});

	it("ignores unrelated subfolder project.json files (e.g. NX monorepo configs)", () => {
		const repoDir = path.join(tempRootA, "monorepo-app");
		fs.mkdirSync(path.join(repoDir, "apps", "web"), { recursive: true });
		// An NX project.json in a subfolder with no KainBain markers
		fs.writeFileSync(
			path.join(repoDir, "apps", "web", "project.json"),
			JSON.stringify({ name: "web", targets: { build: {} } }),
		);
		const store = makeStore();
		// Does not auto-create monorepo-app because it has no KainBain config
		expect(store.scanProjects()).toEqual([]);
	});
});
