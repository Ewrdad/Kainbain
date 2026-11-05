/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "./projectStore.js";

/***
 * MARK: discoverAdoptable tests
 * @description Proves the scan roots surface their unadopted git checkouts
 *   (one level deep, capped) so first-run UI can offer one-click adoption
 *   instead of a silently empty board. Already-adopted and configured
 *   directories are never listed.
 ***/
describe("ProjectStore.discoverAdoptable", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-discover-"));
		tempNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-test-notes-"));
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

	const plantGitRepo = (name) => {
		const dir = path.join(tempProjectsDir, name);
		fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
		return dir;
	};

	it("lists unadopted git checkouts one level deep", () => {
		const repo = plantGitRepo("my-repo");
		fs.mkdirSync(path.join(tempProjectsDir, "plain-dir"));
		const found = store.discoverAdoptable();
		expect(found).toEqual([{ path: repo, name: "my-repo" }]);
	});

	it("skips adopted projects and configured directories", () => {
		const repo = plantGitRepo("my-repo");
		store.registerProject({ path: repo });
		expect(store.discoverAdoptable()).toEqual([]);
	});

	it("skips dot-directories and node_modules", () => {
		plantGitRepo(".hidden");
		plantGitRepo("node_modules");
		expect(store.discoverAdoptable()).toEqual([]);
	});

	it("caps the listing", () => {
		for (let i = 0; i < 5; i += 1) plantGitRepo(`repo-${i}`);
		expect(store.discoverAdoptable({ cap: 3 })).toHaveLength(3);
	});

	it("returns an empty list when the root is missing", () => {
		const missing = new ProjectStore({
			projectsRoot: path.join(tempProjectsDir, "nope"),
			notesRoot: tempNotesDir,
			autoScan: false,
		});
		expect(missing.discoverAdoptable()).toEqual([]);
	});
});
