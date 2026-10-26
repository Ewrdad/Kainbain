/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	ProjectStore,
	DEFAULT_STAGES,
	normalizeWorkflows,
} from "./projectStore.js";

/**
 * MARK: Workflow consistency contract tests
 * @description Pins the pipeline invariants across save/load: `stages` always
 *   mirrors the active workflow's stages, round-trips preserve the workflow
 *   set, legacy migration is idempotent, the active-workflow fallback is
 *   deterministic, and default-pipeline edits never rewrite saved projects.
 */
describe("workflow consistency contracts", () => {
	let store;
	let tempProjectsDir;
	let tempNotesDir;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-wfcontract-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-wfcontract-notes-"),
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

	const rescan = () =>
		new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: true,
		});

	it("loaded stages deep-equal the active workflow's stages", () => {
		const project = store.createProject({ name: "Contract App" });
		expect(project.stages).toEqual(
			project.workflows.find((w) => w.id === project.activeWorkflowId).stages,
		);
		const loaded = rescan().getProject(project.id);
		expect(loaded.stages).toEqual(
			loaded.workflows.find((w) => w.id === loaded.activeWorkflowId).stages,
		);
	});

	it("save/load round-trips workflows, activeWorkflowId, and stages", () => {
		const project = store.createProject({ name: "Round Trip App" });
		const hotfix = store.createWorkflow(project.id, {
			name: "Hotfix",
			stages: [{ id: "h1", name: "Fix", type: "agent" }],
		});
		store.switchWorkflow(project.id, hotfix.id);
		const saved = store.getProject(project.id);
		const loaded = rescan().getProject(project.id);
		expect(loaded.workflows).toEqual(saved.workflows);
		expect(loaded.activeWorkflowId).toBe(saved.activeWorkflowId);
		expect(loaded.stages).toEqual(saved.stages);
		expect(loaded.stages).toEqual(hotfix.stages.map((s) => expect.objectContaining({ id: s.id })));
	});

	it("normalizeWorkflows migrates legacy stages exactly once (idempotent)", () => {
		const legacy = [{ id: "1", name: "Old", type: "review" }];
		const once = normalizeWorkflows(undefined, legacy);
		expect(once.length).toBe(1);
		expect(once[0].id).toBe("wf-default");
		expect(once[0].stages[0].type).toBe("human");
		const twice = normalizeWorkflows(once, legacy);
		expect(twice).toEqual(once);
	});

	it("activeWorkflowId fallback is deterministic (default, then first)", () => {
		const project = store.createProject({ name: "Fallback App" });
		const second = store.createWorkflow(project.id, { name: "Second" });
		// Corrupt the active id on disk: load falls back to the default workflow.
		const configFile = path.join(project.cwd, ".kainbain", "project.json");
		const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
		saved.activeWorkflowId = "wf-missing";
		fs.writeFileSync(configFile, JSON.stringify(saved));
		const loaded = rescan().getProject(project.id);
		expect(loaded.activeWorkflowId).toBe(
			loaded.workflows.find((w) => w.isDefault).id,
		);
		expect(loaded.stages).toEqual(
			loaded.workflows.find((w) => w.isDefault).stages,
		);
		expect(second.id).not.toBe(loaded.activeWorkflowId);
	});

	it("editing DEFAULT_STAGES never mutates a saved project's file or record", () => {
		const project = store.createProject({ name: "Frozen App" });
		const before = JSON.parse(
			fs.readFileSync(
				path.join(project.cwd, ".kainbain", "project.json"),
				"utf8",
			),
		);
		DEFAULT_STAGES[0].name = "MUTATED BY TEST";
		try {
			const loaded = rescan().getProject(project.id);
			expect(loaded.stages[0].name).toBe(before.stages[0].name);
			expect(loaded.workflows[0].stages[0].name).toBe(
				before.workflows[0].stages[0].name,
			);
			const after = JSON.parse(
				fs.readFileSync(
					path.join(project.cwd, ".kainbain", "project.json"),
					"utf8",
				),
			);
			expect(after.stages).toEqual(before.stages);
		} finally {
			DEFAULT_STAGES[0].name = "Idea";
		}
	});

	it("switching the active workflow re-mirrors stages on the next load", () => {
		const project = store.createProject({ name: "Switch App" });
		const hotfix = store.createWorkflow(project.id, {
			name: "Hotfix",
			stages: [{ id: "h1", name: "Fix", type: "ci" }],
		});
		store.switchWorkflow(project.id, hotfix.id);
		const loaded = rescan().getProject(project.id);
		expect(loaded.activeWorkflowId).toBe(hotfix.id);
		expect(loaded.stages.map((s) => s.id)).toEqual(["h1"]);
	});
});
