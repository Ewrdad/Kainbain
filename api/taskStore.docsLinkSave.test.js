/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProjectStore } from "./projectStore.js";
import { TaskStore } from "./taskStore.js";

/***
 * MARK: TaskStore save-time docs-link repair tests
 * @description Pins the repair-after-switch hook in `_saveTaskMarkdown`.
 *   Old kb/* branches still track the `<cwd>/docs` symlink while master
 *   ignores it, so checking out across that boundary deletes the link from
 *   the worktree — and the post-switch save used to cement a one-task
 *   shadow directory that hid every other task (2026-10-02 recurrence).
 *   Re-verifying the link on every save closes the gap for all present and
 *   future switch sites: a deleted link is recreated before the write
 *   lands, and verification can never break a save.
 ***/

describe("TaskStore save-time docs-link repair", () => {
	let projectStore;
	let taskStore;
	let tempProjectsDir;
	let tempNotesDir;
	let warnSpy;
	let errorSpy;

	beforeEach(() => {
		tempProjectsDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-savelink-projects-"),
		);
		tempNotesDir = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-savelink-notes-"),
		);
		projectStore = new ProjectStore({
			projectsRoot: tempProjectsDir,
			notesRoot: tempNotesDir,
			autoScan: false,
		});
		taskStore = new TaskStore({ projectStore });
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

	function makeTask(project, id = "task-1") {
		return {
			id,
			projectId: project.id,
			title: "Demo task",
			status: "in_stage",
			history: [],
			timeline: [],
			reports: [],
		};
	}

	it("recreates a deleted docs link on save instead of growing a shadow dir", () => {
		const project = projectStore.createProject({ name: "Demo" , allowLocalOnly: true });
		const docsLink = path.join(project.cwd, "docs");
		expect(fs.lstatSync(docsLink).isSymbolicLink()).toBe(true);

		// Simulate a branch checkout removing the tracked link:
		fs.unlinkSync(docsLink);

		taskStore._saveTaskMarkdown(project.cwd, makeTask(project));

		expect(fs.lstatSync(docsLink).isSymbolicLink()).toBe(true);
		expect(fs.realpathSync(docsLink)).toBe(
			fs.realpathSync(project.notesDir),
		);
		expect(
			fs.existsSync(path.join(project.notesDir, "tasks", "task-1", "task.md")),
		).toBe(true);
	});

	it("recreates a deleted docs link on report save instead of growing a shadow dir", () => {
		const project = projectStore.createProject({ name: "Demo" , allowLocalOnly: true });
		const docsLink = path.join(project.cwd, "docs");
		taskStore._getMap(project.id).set("task-1", {
			...makeTask(project),
			currentStageId: "5",
			enteredStageAt: new Date().toISOString(),
		});

		// Simulate a branch checkout removing the tracked link:
		fs.unlinkSync(docsLink);

		const report = taskStore.saveStageReport(project.id, "task-1", {
			stageName: "catchup",
			content: "report body",
			projectCwd: project.cwd,
		});

		expect(report).not.toBeNull();
		expect(fs.lstatSync(docsLink).isSymbolicLink()).toBe(true);
		expect(
			fs.existsSync(
				path.join(project.notesDir, "tasks", "task-1", report.filename),
			),
		).toBe(true);
	});

	it("leaves a healthy link untouched on save", () => {
		const project = projectStore.createProject({ name: "Demo" , allowLocalOnly: true });
		const docsLink = path.join(project.cwd, "docs");
		const before = fs.readlinkSync(docsLink);

		taskStore._saveTaskMarkdown(project.cwd, makeTask(project));

		expect(fs.readlinkSync(docsLink)).toBe(before);
		expect(
			fs.existsSync(path.join(project.notesDir, "tasks", "task-1", "task.md")),
		).toBe(true);
	});

	it("saves normally without a projectStore (no link management)", () => {
		const bare = new TaskStore({ projectStore: null });
		const cwd = fs.mkdtempSync(
			path.join(os.tmpdir(), "kainbain-test-savelink-bare-"),
		);
		try {
			bare._saveTaskMarkdown(cwd, {
				id: "t",
				projectId: "p",
				title: "T",
			});
			expect(
				fs.existsSync(path.join(cwd, "docs", "tasks", "t", "task.md")),
			).toBe(true);
		} finally {
			fs.rmSync(cwd, { recursive: true, force: true });
		}
	});

	it("never lets link verification break a save", () => {
		const throwing = {
			getProject: () => {
				throw new Error("boom");
			},
			ensureDocsLink: () => {
				throw new Error("boom");
			},
		};
		const store = new TaskStore({ projectStore: throwing });
		expect(() =>
			store._saveTaskMarkdown(tempProjectsDir, {
				id: "t",
				projectId: "missing",
				title: "T",
			}),
		).not.toThrow();
		expect(
			fs.existsSync(
				path.join(tempProjectsDir, "docs", "tasks", "t", "task.md"),
			),
		).toBe(true);
	});
});
