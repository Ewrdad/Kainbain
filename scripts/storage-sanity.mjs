#!/usr/bin/env node
/***
 * MARK: storage-sanity.mjs
 * @description Cold-start storage gate: proves a boot/restore against task
 *   storage can never again present an empty (or shadowed) board silently.
 *   Regression coverage for the 2026-10-02 incident, where a missing
 *   `<cwd>/docs` link degraded into a one-task shadow directory and the UI
 *   showed 1 of 134 tasks. Two fixture legs, both through the same
 *   `ProjectStore.ensureDocsLink` + `TaskStore.scanTasks` path the UI reads:
 *   (1) healthy link: seed 3 tasks, restore into a FRESH store (a reboot
 *   with empty memory), assert the count is 3 and non-empty; (2) shadow
 *   directory: 3 tasks in the notes space but a real `docs/` dir holding 1,
 *   assert `ensureDocsLink` reports `shadowed` and the scan visibly
 *   diverges from the notes count (the detector is armed). Any mismatch
 *   exits 1 with a `STORAGE-SANITY FAIL` line naming the leg. Node-only, no
 *   new dependencies; temp fixtures are removed afterwards. Run in CI
 *   (`node scripts/storage-sanity.mjs`) and covered by
 *   `tests/storage-sanity.test.mjs` inside `npm test`.
 * @example `node scripts/storage-sanity.mjs` => two PASS lines, exit 0
 ***/

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProjectStore } from "../api/projectStore.js";
import { TaskStore } from "../api/taskStore.js";

const PROJECT_ID = "sanity-proj";

/***
 * MARK: makeFixture
 * @description Builds an isolated projects-root + notes-space pair with one
 *   project fixture (manual object, no git involved) and linked stores.
 * @example const fx = makeFixture() // => { projectStore, taskStore, project, cleanup }
 * @returns {{ projectStore: Object, taskStore: Object, project: Object, cleanup: Function }}
 ***/
export function makeFixture() {
	/* eslint-disable security/detect-non-literal-fs-filename */
	const projectsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sanity-projects-"));
	const notesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kainbain-sanity-notes-"));
	const cwd = path.join(projectsRoot, "Sanity");
	const notesDir = path.join(notesRoot, "Sanity");
	fs.mkdirSync(cwd, { recursive: true });
	fs.mkdirSync(notesDir, { recursive: true });
	const projectStore = new ProjectStore({ projectsRoot, notesRoot, autoScan: false });
	const taskStore = new TaskStore({ projectStore });
	const project = { id: PROJECT_ID, name: "Sanity", cwd, notesPath: notesDir, notesDir };
	const cleanup = () => {
		try {
			fs.rmSync(projectsRoot, { recursive: true, force: true });
			fs.rmSync(notesRoot, { recursive: true, force: true });
		} catch {
			// Fixture cleanup is best-effort; the check result stands.
		}
	};
	/* eslint-enable security/detect-non-literal-fs-filename */
	return { projectStore, taskStore, project, cleanup };
}

/***
 * MARK: seedTask
 * @description Persists one task through the engine's own save path (which
 *   re-verifies the docs link on every write), so the fixture holds exactly
 *   what a real boot would read.
 * @example seedTask(fx.taskStore, fx.project.cwd, "sanity-proj", "task-1")
 * @param {Object} taskStore
 * @param {string} cwd
 * @param {string} projectId
 * @param {string} taskId
 ***/
export function seedTask(taskStore, cwd, projectId, taskId) {
	taskStore._saveTaskMarkdown(cwd, {
		id: taskId,
		projectId,
		title: `Sanity ${taskId}`,
		status: "in_stage",
		history: [],
		timeline: [],
		reports: [],
	});
}

/***
 * MARK: countNotesTasks
 * @description Counts task folders holding a `task.md` directly under the
 *   notes space (ground truth the scan must agree with).
 * @example countNotesTasks("/tmp/notes/Sanity") => 3
 * @param {string} notesDir
 * @returns {number}
 ***/
export function countNotesTasks(notesDir) {
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		return fs
			.readdirSync(path.join(notesDir, "tasks"), { withFileTypes: true })
			.filter((e) => e.isDirectory() && fs.existsSync(path.join(notesDir, "tasks", e.name, "task.md")))
			.length;
	} catch {
		return 0;
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
}

/***
 * MARK: checkStorageSanity
 * @description Runs both fixture legs and returns the verdict (no printing;
 *   the caller decides how to report). Restores go through a FRESH TaskStore
 *   each time so memory can never mask a disk regression.
 * @example const { ok, failures } = checkStorageSanity()
 * @returns {{ ok: boolean, failures: Array<string>, report: Object }}
 ***/
export function checkStorageSanity() {
	const failures = [];
	const report = {};

	// Leg 1 — healthy link: restore must return every seeded task.
	const healthy = makeFixture();
	try {
		const link = healthy.projectStore.ensureDocsLink(healthy.project);
		report.healthyLinkState = link.state;
		if (link.state !== "repaired" && link.state !== "ok") {
			failures.push(`healthy leg: expected link state 'repaired' or 'ok', got '${link.state}'`);
		}
		for (const id of ["task-1", "task-2", "task-3"]) {
			seedTask(healthy.taskStore, healthy.project.cwd, PROJECT_ID, id);
		}
		const restored = new TaskStore({ projectStore: healthy.projectStore }).scanTasks(PROJECT_ID, healthy.project.cwd);
		report.healthyRestored = restored.length;
		report.healthyNotes = countNotesTasks(healthy.project.notesDir);
		if (restored.length === 0) {
			failures.push("healthy leg: restore returned ZERO tasks (empty-board regression)");
		} else if (restored.length !== 3) {
			failures.push(`healthy leg: restore returned ${restored.length} tasks, expected 3`);
		}
	} finally {
		healthy.cleanup();
	}

	// Leg 2 — shadow directory: the detector must fire, loudly.
	const shadow = makeFixture();
	try {
		const firstLink = shadow.projectStore.ensureDocsLink(shadow.project);
		if (firstLink.state !== "repaired" && firstLink.state !== "ok") {
			failures.push(`shadow leg setup: expected link state 'repaired' or 'ok', got '${firstLink.state}'`);
		}
		for (const id of ["task-1", "task-2", "task-3"]) {
			seedTask(shadow.taskStore, shadow.project.cwd, PROJECT_ID, id);
		}
		// Simulate the incident: the link is gone, a real dir holds 1 task.
		/* eslint-disable security/detect-non-literal-fs-filename */
		const docsLink = path.join(shadow.project.cwd, "docs");
		fs.unlinkSync(docsLink);
		const shadowTaskDir = path.join(docsLink, "tasks", "shadow-1");
		fs.mkdirSync(shadowTaskDir, { recursive: true });
		fs.writeFileSync(path.join(shadowTaskDir, "task.md"), '---\nid: "shadow-1"\ntitle: "Shadow task"\nstatus: "in_stage"\n---\n', "utf8");
		/* eslint-enable security/detect-non-literal-fs-filename */
		const link = shadow.projectStore.ensureDocsLink(shadow.project);
		report.shadowLinkState = link.state;
		if (link.state !== "shadowed") {
			failures.push(`shadow leg: expected link state 'shadowed', got '${link.state}'`);
		}
		if (link.repaired !== false) {
			failures.push("shadow leg: a shadow directory must never be auto-repaired");
		}
		const scanned = new TaskStore({ projectStore: shadow.projectStore }).scanTasks(PROJECT_ID, shadow.project.cwd);
		report.shadowScanned = scanned.length;
		report.shadowNotes = countNotesTasks(shadow.project.notesDir);
		if (report.shadowNotes !== 3 || scanned.length !== 1) {
			failures.push(
				`shadow leg: expected scan 1 vs notes 3 (visible divergence), got scan ${scanned.length} vs notes ${report.shadowNotes}`,
			);
		}
	} finally {
		shadow.cleanup();
	}

	return { ok: failures.length === 0, failures, report };
}

/***
 * MARK: main
 * @description CLI entry: runs the check, prints one line per leg plus the
 *   verdict, and exits 1 naming the failing leg when the gate fails.
 ***/
function main() {
	const { ok, failures, report } = checkStorageSanity();
	console.log(
		`storage-sanity healthy leg: link=${report.healthyLinkState} restored=${report.healthyRestored} notes=${report.healthyNotes}`,
	);
	console.log(
		`storage-sanity shadow leg: link=${report.shadowLinkState} scanned=${report.shadowScanned} notes=${report.shadowNotes}`,
	);
	if (!ok) {
		for (const failure of failures) {
			console.error(`STORAGE-SANITY FAIL: ${failure}`);
		}
		process.exitCode = 1;
		return;
	}
	console.log("storage-sanity: PASS (restore non-empty, shadow detector armed)");
}

/***
 * MARK: isMainModule
 * @description Direct-run guard: true when this file is the node entry point.
 *   Compares against `fileURLToPath` (the same shape `path.resolve` returns),
 *   never `URL.pathname` — pathname keeps `%XX` escapes and the leading `/`
 *   drive form (`/C:/...` vs `C:\...`), so a pathname comparison is always
 *   false on Windows and silently no-ops this gate there.
 * @example isMainModule(process.argv[1], import.meta.url) => true when run directly
 * @param {string|undefined} argv1
 * @param {string} moduleUrl
 * @returns {boolean}
 ***/
export function isMainModule(argv1, moduleUrl) {
	if (!argv1) return false;
	return path.resolve(argv1) === fileURLToPath(moduleUrl);
}

const invokedDirectly = isMainModule(process.argv[1], import.meta.url);
if (invokedDirectly) {
	main();
}
