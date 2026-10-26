/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ProjectStore,
	inferAliasRenames,
} from "./projectStore.js";

/***
 * MARK: ProjectStore model-alias tests
 * @description Pins alias persistence: create/save/load round-trips alias
 *   bindings, writes normalize (trim/dedupe/drop invalid), alias-free
 *   projects keep their existing file shape, renames migrate referencing
 *   default + stage fields atomically in the same save, and deletes leave a
 *   dangling reference for the loud runtime fallback (never a silent rewrite).
 ***/

describe("ProjectStore model aliases", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-alias-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-alias-notes-"),
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

	function readProjectJson(project) {
		const raw = fs.readFileSync(
			path.join(project.cwd, ".kainbain", "project.json"),
			"utf8",
		);
		return JSON.parse(raw);
	}

	it("round-trips aliases through save and load", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Roundtrip",
			modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
		});
		expect(project.modelAliases).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
		const onDisk = readProjectJson(project);
		expect(onDisk.modelAliases).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
		const loaded = store._loadProjectFile(project.cwd);
		expect(loaded.modelAliases).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
	});

	it("normalizes on write (trim, dedupe, drop invalid)", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Normalize",
			modelAliases: [
				{ name: " small ", harness: " pi ", model: " m " },
				{ name: "small", harness: "other", model: "m2" },
				{ name: "Small", harness: "pi", model: "m" },
				{ name: "loop", harness: "alias", model: "small" },
				null,
			],
		});
		expect(project.modelAliases).toEqual([
			{
				name: "small",
				harness: "pi",
				model: "m",
				targets: [{ harness: "pi", model: "m", percent: 100 }],
			},
		]);
	});

	it("keeps the existing file shape for alias-free projects", () => {
		const project = store.createProject({ name: "No Aliases" , allowLocalOnly: true });
		expect(project.modelAliases).toBe(undefined);
		expect("modelAliases" in readProjectJson(project)).toBe(false);
	});

	it("renaming an alias migrates references atomically in the same save", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Rename",
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
			workflows: [
				{
					id: "wf-1",
					name: "W",
					isDefault: true,
					stages: [
						{ id: "1", name: "A", harness: "alias", model: "small" },
						{ id: "2", name: "B", harness: "pi", model: "google::m" },
					],
				},
			],
		});
		const updated = store.updateProject(project.id, {
			modelAliases: [{ name: "medium", harness: "pi", model: "google::m" }],
		});
		expect(updated.defaultModel).toBe("medium");
		expect(
			updated.workflows[0].stages.find((s) => s.id === "1").model,
		).toBe("medium");
		// Same model value on a concrete harness is not a reference — untouched.
		expect(
			updated.workflows[0].stages.find((s) => s.id === "2").model,
		).toBe("google::m");
		// The save is atomic: disk agrees with memory (no orphan window).
		const onDisk = readProjectJson(updated);
		expect(onDisk.modelAliases).toEqual([
			{
				name: "medium",
				harness: "pi",
				model: "google::m",
				targets: [{ harness: "pi", model: "google::m", percent: 100 }],
			},
		]);
		const diskStage = onDisk.workflows[0].stages.find((s) => s.id === "1");
		expect(diskStage.model).toBe("medium");
		expect(onDisk.defaultModel).toBe("medium");
	});

	it("round-trips weighted splits through save and load", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Weighted Roundtrip",
			modelAliases: [
				{
					name: "review",
					targets: [
						{ harness: "muse", model: "", percent: 90 },
						{ harness: "antigravity", model: "gem", percent: 10 },
					],
				},
			],
		});
		expect(project.modelAliases).toEqual([
			{
				name: "review",
				harness: "muse",
				model: "",
				targets: [
					{ harness: "muse", model: "", percent: 90 },
					{ harness: "antigravity", model: "gem", percent: 10 },
				],
			},
		]);
		const onDisk = readProjectJson(project);
		expect(onDisk.modelAliases).toEqual(project.modelAliases);
		const loaded = store._loadProjectFile(project.cwd);
		expect(loaded.modelAliases).toEqual(project.modelAliases);
	});

	it("deleting an alias leaves the dangling reference for the loud fallback", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Delete",
			harness: "alias",
			defaultModel: "small",
			modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
		});
		const updated = store.updateProject(project.id, { modelAliases: [] });
		expect(updated.modelAliases).toBe(undefined);
		// References are NOT silently rewritten — dispatch falls back.
		expect(updated.defaultModel).toBe("small");
	});

	it("survives a backend restart (fresh store re-scan) byte-identically", () => {
		const aliases = [
			{ name: "small", harness: "pi", model: "google::m" },
			{
				name: "review",
				targets: [
					{ harness: "muse", model: "", percent: 90 },
					{ harness: "antigravity", model: "gem", percent: 10 },
				],
			},
		];
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Restart",
			modelAliases: aliases,
		});
		const expected = project.modelAliases;
		expect(expected).toHaveLength(2);

		// A restart is a fresh store over the same roots (autoScan re-reads
		// every .kainbain/project.json from disk).
		const restarted = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});
		expect(restarted.getProject(project.id).modelAliases).toEqual(expected);
		expect(
			restarted.listProjects().find((p) => p.id === project.id).modelAliases,
		).toEqual(expected);
		const loaded = restarted._loadProjectFile(project.cwd);
		expect(loaded.modelAliases).toEqual(expected);
	});

	it("a PATCH without the modelAliases key never wipes aliases (stale page)", () => {
		const project = store.createProject({
			allowLocalOnly: true,
			name: "Alias Stale Save",
			modelAliases: [{ name: "small", harness: "pi", model: "google::m" }],
		});
		const expected = project.modelAliases;
		// A stale settings page saving unrelated fields omits the key: the
		// stored list must survive untouched.
		const updated = store.updateProject(project.id, {
			name: "Alias Stale Save Renamed",
		});
		expect(updated.modelAliases).toEqual(expected);
		const onDisk = readProjectJson(updated);
		expect(onDisk.modelAliases).toEqual(expected);
	});

	it("never persists the optimistic-concurrency token on the project", () => {
		const project = store.createProject({ name: "Alias Token Hygiene" , allowLocalOnly: true });
		const updated = store.updateProject(
			project.id,
			{ name: "Renamed", expectedUpdatedAt: project.updatedAt },
			{ expectedUpdatedAt: project.updatedAt },
		);
		expect("expectedUpdatedAt" in updated).toBe(false);
		expect("expectedUpdatedAt" in readProjectJson(updated)).toBe(false);
	});

	it("H4: loading a legacy none-harness + model target blanks the model", () => {
		const project = store.createProject({ name: "Legacy None Alias" , allowLocalOnly: true });
		// Hand-edit the file on disk (the legacy/API write path the API
		// refusal cannot retroactively fix).
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		const onDisk = JSON.parse(fs.readFileSync(configFile, "utf8"));
		onDisk.modelAliases = [
			{
				name: "worker",
				harness: "muse",
				model: "antigravity::google::gemini-legacy",
				targets: [
					{
						harness: "muse",
						model: "antigravity::google::gemini-legacy",
						percent: 100,
					},
				],
			},
		];
		fs.writeFileSync(configFile, JSON.stringify(onDisk, null, 2));
		const loaded = store._loadProjectFile(project.cwd);
		expect(loaded.modelAliases).toEqual([
			{
				name: "worker",
				harness: "muse",
				model: "",
				targets: [{ harness: "muse", model: "", percent: 100 }],
			},
		]);
	});
});

describe("inferAliasRenames", () => {
	it("matches renames by identical target", () => {
		expect(
			inferAliasRenames(
				[{ name: "s", harness: "pi", model: "m" }],
				[{ name: "m", harness: "pi", model: "m" }],
			),
		).toEqual([{ from: "s", to: "m" }]);
	});

	it("maps a lone removed/added pair even when retargeted", () => {
		expect(
			inferAliasRenames(
				[{ name: "s", harness: "pi", model: "m1" }],
				[{ name: "m", harness: "custom", model: "m2" }],
			),
		).toEqual([{ from: "s", to: "m" }]);
	});

	it("matches renames by identical weighted split", () => {
		expect(
			inferAliasRenames(
				[
					{
						name: "s",
						harness: "pi",
						model: "m1",
						targets: [
							{ harness: "pi", model: "m1", percent: 90 },
							{ harness: "custom", model: "m2", percent: 10 },
						],
					},
				],
				[
					{
						name: "m",
						harness: "pi",
						model: "m1",
						targets: [
							{ harness: "pi", model: "m1", percent: 90 },
							{ harness: "custom", model: "m2", percent: 10 },
						],
					},
				],
			),
		).toEqual([{ from: "s", to: "m" }]);
	});

	it("still maps a lone retarget pair when the split changed", () => {
		expect(
			inferAliasRenames(
				[
					{
						name: "s",
						harness: "pi",
						model: "m1",
						targets: [
							{ harness: "pi", model: "m1", percent: 90 },
							{ harness: "custom", model: "m2", percent: 10 },
						],
					},
				],
				[
					{
						name: "m",
						harness: "pi",
						model: "m1",
						targets: [{ harness: "pi", model: "m1", percent: 100 }],
					},
				],
			),
		).toEqual([{ from: "s", to: "m" }]);
	});

	it("stays empty for pure adds, deletes, and ambiguous multi-renames", () => {
		expect(inferAliasRenames([], [{ name: "m", harness: "p", model: "x" }])).toEqual(
			[],
		);
		expect(
			inferAliasRenames([{ name: "s", harness: "p", model: "x" }], []),
		).toEqual([]);
		expect(
			inferAliasRenames(
				[
					{ name: "a", harness: "pi", model: "m1" },
					{ name: "b", harness: "pi", model: "m2" },
				],
				[
					{ name: "c", harness: "pi", model: "m3" },
					{ name: "d", harness: "pi", model: "m4" },
				],
			),
		).toEqual([]);
	});

});
