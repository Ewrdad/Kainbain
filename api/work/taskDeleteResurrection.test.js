/* eslint-disable security/detect-non-literal-fs-filename */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TaskStore } from "../taskStore.js";

/***
 * MARK: deleted-task resurrection regression
 * @description A task deleted while a stage is in flight, or resurrected at
 *   the git level (a kb/* branch checkout restoring tracked docs/tasks
 *   files), must never come back:
 *   - deferred saves after `deleteTask` must not recreate task.md (the
 *     `_saveTaskMarkdown` liveness guard);
 *   - a resurrected on-disk dir must be purged and skipped by `scanTasks`
 *     via the git-ignored deletion tombstone.
 ***/
describe("deleted tasks never resurrect on disk", () => {
	const tempDirs = [];
	const stores = [];

	function makeStore() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-del-resurrect-"));
		tempDirs.push(dir);
		const projectId = "p-1";
		const project = {
			id: projectId,
			name: "P1",
			cwd: dir,
			stages: [{ id: "s-1", name: "Build", type: "agent" }],
		};
		const projectStore = { getProject: () => project };
		const store = new TaskStore({ eventBridge: {}, projectStore });
		stores.push(store);
		return { store, dir, projectId };
	}

	afterEach(() => {
		for (const store of stores.splice(0)) {
			try {
				store.stopScheduler?.();
			} catch {
				// best-effort teardown
			}
		}
		while (tempDirs.length) {
			fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
		}
	});

	it("a deferred save after deleteTask does not recreate task.md and a fresh scan does not re-import", () => {
		const { store, dir, projectId } = makeStore();
		const task = store.createTask(projectId, {
			title: "Doomed",
			goal: "g",
			projectCwd: dir,
		});
		const taskMd = path.join(dir, "docs", "tasks", task.id, "task.md");
		expect(fs.existsSync(taskMd)).toBe(true);

		expect(store.deleteTask(projectId, task.id, dir)).toBe(true);
		expect(fs.existsSync(taskMd)).toBe(false);
		expect(store.getTask(projectId, task.id)).toBeUndefined();

		// Simulate an in-flight stage settle that finishes after the delete:
		// the save must be skipped instead of recreating the file.
		store._saveTaskMarkdown(dir, task);
		expect(fs.existsSync(taskMd)).toBe(false);

		// A "restarted" server rescans from disk and must not see the task.
		const rebooted = new TaskStore({
			eventBridge: {},
			projectStore: { getProject: () => ({ id: projectId, cwd: dir }) },
		});
		stores.push(rebooted);
		rebooted.scanTasks(projectId, dir);
		expect(rebooted.getTask(projectId, task.id)).toBeUndefined();
	});

	it("a git-level resurrection (branch checkout restoring the dir) is purged on the next scan, never re-imported", () => {
		const { store, dir, projectId } = makeStore();
		const task = store.createTask(projectId, {
			title: "Doomed",
			goal: "g",
			projectCwd: dir,
		});
		const taskMd = path.join(dir, "docs", "tasks", task.id, "task.md");
		const original = fs.readFileSync(taskMd, "utf8");
		expect(store.deleteTask(projectId, task.id, dir)).toBe(true);
		expect(fs.existsSync(taskMd)).toBe(false);

		// Simulate a kb/* branch checkout restoring the tracked task docs
		// into the working tree after the delete.
		fs.mkdirSync(path.join(dir, "docs", "tasks", task.id), { recursive: true });
		fs.writeFileSync(taskMd, original);

		// A "restarted" server rescans: the tombstoned task must not come
		// back, and the resurrected directory must be purged from disk.
		const rebooted = new TaskStore({
			eventBridge: {},
			projectStore: { getProject: () => ({ id: projectId, cwd: dir }) },
		});
		stores.push(rebooted);
		rebooted.scanTasks(projectId, dir);
		expect(rebooted.getTask(projectId, task.id)).toBeUndefined();
		expect(fs.existsSync(path.join(dir, "docs", "tasks", task.id))).toBe(false);
	});

	it("deleteTask purges dedupe entries so a same-key re-create returns a new task", () => {
		const { store, dir, projectId } = makeStore();
		const first = store.createTask(projectId, {
			title: "Repeat",
			goal: "g",
			idempotencyKey: "k-1",
			projectCwd: dir,
		});
		expect(store.deleteTask(projectId, first.id, dir)).toBe(true);

		const second = store.createTask(projectId, {
			title: "Repeat",
			goal: "g",
			idempotencyKey: "k-1",
			projectCwd: dir,
		});
		expect(second.id).not.toBe(first.id);
		expect(store.getTask(projectId, second.id)).toBe(second);
	});

	it("clearProject clears tombstones so a later scan re-imports freely", () => {
		const { store, dir, projectId } = makeStore();
		const task = store.createTask(projectId, {
			title: "Wiped",
			goal: "g",
			projectCwd: dir,
		});
		const taskMd = path.join(dir, "docs", "tasks", task.id, "task.md");
		const original = fs.readFileSync(taskMd, "utf8");
		expect(store.deleteTask(projectId, task.id, dir)).toBe(true);
		store.clearProject(projectId, dir);

		// After a full clear, a restored dir is a legitimate task again.
		fs.mkdirSync(path.join(dir, "docs", "tasks", task.id), { recursive: true });
		fs.writeFileSync(taskMd, original);
		const rebooted = new TaskStore({
			eventBridge: {},
			projectStore: { getProject: () => ({ id: projectId, cwd: dir }) },
		});
		stores.push(rebooted);
		rebooted.scanTasks(projectId, dir);
		expect(rebooted.getTask(projectId, task.id)).toBeTruthy();
	});

	it("saves for still-registered tasks still persist", () => {
		const { store, dir, projectId } = makeStore();
		const task = store.createTask(projectId, {
			title: "Live",
			goal: "g",
			projectCwd: dir,
		});
		task.title = "Live (edited)";
		store._saveTaskMarkdown(dir, task);
		const onDisk = fs.readFileSync(
			path.join(dir, "docs", "tasks", task.id, "task.md"),
			"utf8",
		);
		expect(onDisk).toContain("Live (edited)");
	});
});
