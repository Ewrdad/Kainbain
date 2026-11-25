import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { auditTasks, backupPathFor, formatReport, main, parseArgs, taskMarkdownSurfaces } =
	await import("../scripts/audit-task-attachments.mjs");

/***
 * MARK: audit-task-attachments tests
 * @description Gate coverage for the task-attachment backfill auditor
 *   (scripts/audit-task-attachments.mjs): argument handling stays fail-safe
 *   (errors exit non-zero before any write, the default mode never writes),
 *   dry-run reports missing-asset and out-of-task refs with recoverability,
 *   `--apply` ingests only resolvable bytes (backups first, dangling refs
 *   byte-identical), and re-running is a no-op. Fixtures live in OS temp
 *   dirs; nothing touches the live workspace.
 * @example run `node --test tests/audit-task-attachments.test.mjs`
 ***/

function seedProject() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-audit-attach-"));
	const taskDir = path.join(root, "docs", "tasks", "t1");
	fs.mkdirSync(path.join(taskDir, "assets"), { recursive: true });
	// A resolvable out-of-task source (project-relative ref target).
	fs.writeFileSync(path.join(root, "run.log"), "log-bytes");
	return { root, taskDir };
}

function seedTask(taskDir, text) {
	fs.writeFileSync(path.join(taskDir, "task.md"), text);
}

describe("parseArgs", () => {
	it("defaults to a dry run with backups on", () => {
		assert.deepEqual(parseArgs([]), {
			apply: false,
			backup: true,
			root: null,
			tasksDir: null,
			task: null,
			help: false,
			error: null,
		});
	});

	it("parses --apply, --dry-run, --no-backup, and valued flags", () => {
		assert.equal(parseArgs(["--apply"]).apply, true);
		assert.equal(parseArgs(["--apply", "--dry-run"]).apply, false);
		assert.equal(parseArgs(["--no-backup"]).backup, false);
		const opts = parseArgs(["--root", "/r", "--tasks-dir", "/t", "--task", "t1"]);
		assert.equal(opts.root, "/r");
		assert.equal(opts.tasksDir, "/t");
		assert.equal(opts.task, "t1");
		assert.equal(parseArgs(["--help"]).help, true);
	});

	it("records an error when a valued flag has no value", () => {
		assert.equal(parseArgs(["--root"]).error, "--root requires a value");
		assert.equal(parseArgs(["--tasks-dir"]).error, "--tasks-dir requires a value");
		assert.equal(parseArgs(["--task"]).error, "--task requires a value");
	});

	it("ignores unknown flags (a mistyped --apply degrades to a dry run)", () => {
		const opts = parseArgs(["--appl"]);
		assert.equal(opts.apply, false);
		assert.equal(opts.error, null);
	});
});

describe("backupPathFor", () => {
	it("appends .bak", () => {
		assert.equal(backupPathFor("task.md"), "task.md.bak");
	});
});

describe("taskMarkdownSurfaces", () => {
	it("lists task.md first, then other reports sorted, skipping backups", () => {
		const { taskDir } = seedProject();
		try {
			fs.writeFileSync(path.join(taskDir, "task.md"), "# t\n");
			fs.writeFileSync(path.join(taskDir, "b-report.md"), "# b\n");
			fs.writeFileSync(path.join(taskDir, "a-report.md"), "# a\n");
			fs.writeFileSync(path.join(taskDir, "task.md.bak"), "# bak\n");
			fs.writeFileSync(path.join(taskDir, "notes.txt"), "not markdown\n");
			const surfaces = taskMarkdownSurfaces(taskDir).map((file) => path.basename(file));
			assert.deepEqual(surfaces, ["task.md", "a-report.md", "b-report.md"]);
		} finally {
			fs.rmSync(path.join(taskDir, "..", "..", ".."), { recursive: true, force: true });
		}
	});

	it("returns [] for a missing task dir instead of throwing", () => {
		assert.deepEqual(taskMarkdownSurfaces(path.join(os.tmpdir(), "kb-audit-absent")), []);
	});
});

describe("auditTasks", () => {
	it("dry-run reports missing, recoverable, and dangling refs without writing", async () => {
		const { root, taskDir } = seedProject();
		try {
			const before = [
				"# t1",
				"",
				"Goal with ![gone](assets/gone.png) missing bytes,",
				"a [resolvable](../../../run.log) source,",
				"and a [dangling](/tmp/kb-audit-never-there-1.log) path.",
				"",
			].join("\n");
			seedTask(taskDir, before);
			const outcome = await auditTasks({ root, apply: false });
			assert.equal(outcome.error, null);
			assert.equal(outcome.tasks.length, 1);
			const [task] = outcome.tasks;
			assert.equal(task.id, "t1");
			const [surface] = task.surfaces;
			assert.equal(surface.file, "task.md");
			assert.deepEqual(
				surface.missing.map((entry) => entry.ref),
				["assets/gone.png"],
			);
			assert.deepEqual(
				surface.outOfTask.map((entry) => `${entry.ref}:${entry.resolvable}`),
				["../../../run.log:true", "/tmp/kb-audit-never-there-1.log:false"],
			);
			assert.equal(outcome.recoverable, 1);
			assert.equal(outcome.dangling, 2);
			assert.equal(outcome.repaired, 0);
			// Dry-run never writes: no ingested bytes, no backup, text intact.
			assert.equal(fs.readFileSync(path.join(taskDir, "task.md"), "utf8"), before);
			assert.deepEqual(fs.readdirSync(path.join(taskDir, "assets")), []);
			assert.equal(fs.existsSync(path.join(taskDir, "task.md.bak")), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("--apply ingests resolvable refs, backs up, and leaves dangling refs visible", async () => {
		const { root, taskDir } = seedProject();
		try {
			const before = ["# t1", "", "See [log](../../../run.log) and ![gone](assets/gone.png).", ""].join(
				"\n",
			);
			seedTask(taskDir, before);
			const outcome = await auditTasks({ root, apply: true });
			assert.equal(outcome.error, null);
			assert.equal(outcome.repaired, 1);
			const [task] = outcome.tasks;
			assert.deepEqual(
				task.repaired.map((entry) => `${entry.from} -> ${entry.to}`),
				["../../../run.log -> assets/run.log"],
			);
			// The surface now references the stored copy; the dangling ref stays.
			const after = fs.readFileSync(path.join(taskDir, "task.md"), "utf8");
			assert.match(after, /\[log\]\(assets\/run\.log\)/);
			assert.match(after, /!\[gone\]\(assets\/gone\.png\)/);
			assert.equal(
				fs.readFileSync(path.join(taskDir, "assets", "run.log"), "utf8"),
				"log-bytes",
			);
			assert.equal(fs.readFileSync(path.join(taskDir, "task.md.bak"), "utf8"), before);
			// Re-running is a no-op: nothing left to repair, dangling kept.
			const rerun = await auditTasks({ root, apply: true });
			assert.equal(rerun.repaired, 0);
			assert.equal(rerun.dangling, 1);
			assert.equal(fs.readFileSync(path.join(taskDir, "task.md"), "utf8"), after);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("--apply skips --no-backup writes no .bak file", async () => {
		const { root, taskDir } = seedProject();
		try {
			seedTask(taskDir, "See [log](../../../run.log).\n");
			const outcome = await auditTasks({ root, apply: true, backup: false });
			assert.equal(outcome.repaired, 1);
			assert.equal(fs.existsSync(path.join(taskDir, "task.md.bak")), false);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("scopes to --task and errors on unknown tasks and missing dirs", async () => {
		const { root, taskDir } = seedProject();
		try {
			seedTask(taskDir, "See [log](../../../run.log).\n");
			const t2 = path.join(root, "docs", "tasks", "t2");
			fs.mkdirSync(t2, { recursive: true });
			seedTask(t2, "See [log](../../../run.log).\n");
			const scoped = await auditTasks({ root, task: "t2", apply: false });
			assert.equal(scoped.error, null);
			assert.deepEqual(
				scoped.tasks.map((entry) => entry.id),
				["t2"],
			);
			const unknown = await auditTasks({ root, task: "nope", apply: false });
			assert.match(unknown.error, /task not found/);
			const missing = await auditTasks({
				tasksDir: path.join(os.tmpdir(), "kb-audit-absent"),
				apply: false,
			});
			assert.match(missing.error, /tasks dir not found/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("reports clean tasks as needing no attention", async () => {
		const { root, taskDir } = seedProject();
		try {
			fs.writeFileSync(path.join(taskDir, "assets", "shot.png"), "png");
			seedTask(taskDir, "See ![shot](assets/shot.png).\n");
			const outcome = await auditTasks({ root, apply: false });
			assert.equal(outcome.error, null);
			assert.deepEqual(outcome.tasks, []);
			assert.deepEqual(formatReport(outcome, false), ["no attachment refs need attention."]);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("formatReport", () => {
	it("names each ref with its surface and recoverability", () => {
		const lines = formatReport(
			{
				tasks: [
					{
						id: "t1",
						surfaces: [
							{
								file: "task.md",
								missing: [
									{
										ref: "assets/gone.png",
										name: "gone.png",
										expectedPath: "docs/tasks/t1/assets/gone.png",
									},
								],
								outOfTask: [{ ref: "/tmp/o.log", resolvable: true }],
							},
						],
						repaired: [],
						commit: null,
					},
				],
				repaired: 0,
				recoverable: 1,
				dangling: 1,
			},
			false,
		);
		assert.ok(lines.some((line) => line.includes("task t1:")));
		assert.ok(lines.some((line) => line.includes("assets/gone.png") && line.includes("dangling")));
		assert.ok(lines.some((line) => line.includes("/tmp/o.log") && line.includes("recoverable")));
	});
});

describe("main", () => {
	it("exits 2 with usage on argument errors before touching files", async () => {
		assert.equal(await main(["--root"]), 2);
	});

	it("prints usage and exits 0 on --help", async () => {
		assert.equal(await main(["--help"]), 0);
	});

	it("exits 1 on a missing tasks dir", async () => {
		assert.equal(
			await main(["--tasks-dir", path.join(os.tmpdir(), "kb-audit-absent")]),
			1,
		);
	});

	it("dry-runs a temp project and exits 0", async () => {
		const { root, taskDir } = seedProject();
		try {
			seedTask(taskDir, "See [log](../../../run.log).\n");
			assert.equal(await main(["--root", root]), 0);
			// Still a dry run: the surface is untouched.
			assert.match(fs.readFileSync(path.join(taskDir, "task.md"), "utf8"), /\.\.\/\.\.\/\.\.\/run\.log/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});
});
