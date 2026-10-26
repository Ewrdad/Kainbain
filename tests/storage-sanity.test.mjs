import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { checkStorageSanity, countNotesTasks, isMainModule, makeFixture } = await import("../scripts/storage-sanity.mjs");

/***
 * MARK: storage-sanity tests
 * @description Gate coverage for the cold-start storage check
 *   (scripts/storage-sanity.mjs): the healthy restore returns every seeded
 *   task through the same ensureDocsLink + scanTasks path the UI reads, and
 *   the 2026-10-02 shadow-directory shape is detected (`shadowed`, never
 *   auto-repaired) with a visible scan-vs-notes divergence. Fixtures are
 *   temp dirs; nothing touches the live workspace.
 * @example run `node --test tests/storage-sanity.test.mjs`
 ***/

describe("checkStorageSanity", () => {
	it("restores every seeded task and arms the shadow detector", () => {
		const { ok, failures, report } = checkStorageSanity();

		assert.deepEqual(failures, []);
		assert.equal(ok, true);
		assert.ok(["repaired", "ok"].includes(report.healthyLinkState));
		assert.equal(report.healthyRestored, 3);
		assert.equal(report.healthyNotes, 3);
		assert.equal(report.shadowLinkState, "shadowed");
		assert.equal(report.shadowScanned, 1);
		assert.equal(report.shadowNotes, 3);
	});

	it("leaves no fixture residue in the OS temp dir", () => {
		const before = new Set(fs.readdirSync(os.tmpdir()));
		checkStorageSanity();
		const leaked = fs.readdirSync(os.tmpdir()).filter((name) => !before.has(name) && name.startsWith("kainbain-sanity-"));

		assert.deepEqual(leaked, []);
	});
});

describe("isMainModule", () => {
	it("matches URL-encoded entry paths (space decodes via fileURLToPath, not pathname)", () => {
		// Regression: the guard once compared against `new URL(...).pathname`,
		// which keeps `%20` (and the `/C:/...` drive form on Windows), so it
		// never matched a real argv[1] there and the gate silently no-op'd.
		// `pathToFileURL` produces exactly the encoded href shape
		// `import.meta.url` carries on every OS.
		const argv1 = path.join(os.tmpdir(), "some dir", "storage-sanity.mjs");
		const moduleUrl = pathToFileURL(argv1).href;

		assert.match(moduleUrl, /%20/);
		assert.notEqual(path.resolve(argv1), new URL(moduleUrl).pathname);
		assert.equal(isMainModule(argv1, moduleUrl), true);
	});

	it("rejects a missing entry path or a different file", () => {
		const argv1 = path.join(os.tmpdir(), "some dir", "storage-sanity.mjs");
		const moduleUrl = pathToFileURL(argv1).href;

		assert.equal(isMainModule(undefined, moduleUrl), false);
		assert.equal(isMainModule(path.join(os.tmpdir(), "other.mjs"), moduleUrl), false);
	});

	it("fires on direct run: node scripts/storage-sanity.mjs prints PASS", () => {
		const script = fileURLToPath(new URL("../scripts/storage-sanity.mjs", import.meta.url));
		const out = execFileSync(process.execPath, [script], { encoding: "utf8" });

		assert.match(out, /storage-sanity: PASS/);
	});
});

describe("countNotesTasks", () => {
	it("counts only folders holding a task.md", () => {
		const fixture = makeFixture();
		try {
			const tasksDir = path.join(fixture.project.notesDir, "tasks");
			fs.mkdirSync(path.join(tasksDir, "a"), { recursive: true });
			fs.writeFileSync(path.join(tasksDir, "a", "task.md"), "---\nid: a\n---\n", "utf8");
			fs.mkdirSync(path.join(tasksDir, "empty"), { recursive: true });
			fs.writeFileSync(path.join(tasksDir, "loose.md"), "not a task folder\n", "utf8");

			assert.equal(countNotesTasks(fixture.project.notesDir), 1);
		} finally {
			fixture.cleanup();
		}
	});

	it("returns 0 when the notes space has no tasks dir", () => {
		const fixture = makeFixture();
		try {
			assert.equal(countNotesTasks(fixture.project.notesDir), 0);
			assert.equal(countNotesTasks(path.join(fixture.project.notesDir, "missing")), 0);
		} finally {
			fixture.cleanup();
		}
	});
});
