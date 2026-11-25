#!/usr/bin/env node
/***
 * MARK: audit-task-attachments
 * @description Backfill auditor for task attachments (plan Phase 3, q3
 *   opt-in). Scans each `docs/tasks` task's markdown surfaces (`task.md`
 *   plus the task folder's other top-level `*.md` reports/notes) for
 *   dangling `assets/...` refs (bytes missing from the task folder) and
 *   out-of-task file destinations (absolute paths, `/tmp/...` paths, and
 *   worktree-relative paths that a Runner on another box cannot resolve),
 *   reporting `surface -> ref -> expected path -> recoverable?`.
 *
 *   Dry-run by default and read-only. With `--apply`, refs whose bytes are
 *   still resolvable on this box are ingested into the task's `assets/`
 *   folder and rewritten to the stored `assets/<name>` form (byte-backups
 *   first, best-effort branch commit per repaired task); dangling refs
 *   (bytes nowhere) are left in place, never auto-deleted, never
 *   cross-task-merged. Idempotent — re-running after `--apply` reports
 *   zero remaining recoverable refs.
 *
 *   Fail-safe by construction: argument errors and a missing tasks dir
 *   resolve before touching any file, and the default mode never writes.
 *   `parseArgs`, `auditTasks`, and `main` are exported so the harness
 *   self-tests (`tests/audit-task-attachments.test.mjs`) can drive them
 *   against temp fixtures; the process side effects (printing, exit code)
 *   only run when the file is the node entry point.
 * @example node scripts/audit-task-attachments.mjs
 * @example node scripts/audit-task-attachments.mjs --task 0a5cad0b --apply
 * @example node scripts/audit-task-attachments.mjs --root /path/to/project --apply --no-backup
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	auditTaskAttachmentRefs,
	ingestOutOfTaskRefs,
} from "../api/work/taskAssets.js";
import { commitTaskAssets } from "../api/work/commitTaskAssets.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/***
 * MARK: parseArgs
 * @description Parses the CLI flags into options. Never throws: a flag that
 *   requires a value but has none records `error`, and `main` turns that
 *   into a usage message with a non-zero exit before any file is touched.
 *   Unknown flags are ignored; a bare `--apply` typo therefore degrades to
 *   a dry run (no writes), never to an unintended repair.
 * @example parseArgs(["--apply"]).apply => true
 * @example parseArgs(["--root"]).error => "--root requires a value"
 * @param {Array<string>} [argv] - Argument list (without node/script).
 * @returns {{apply:boolean,backup:boolean,root:string|null,tasksDir:string|null,task:string|null,help:boolean,error:string|null}}
 ***/
export function parseArgs(argv = []) {
	const opts = {
		apply: false,
		backup: true,
		root: null,
		tasksDir: null,
		task: null,
		help: false,
		error: null,
	};
	const args = Array.isArray(argv) ? argv : [];
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--apply") opts.apply = true;
		else if (arg === "--dry-run") opts.apply = false;
		else if (arg === "--no-backup") opts.backup = false;
		else if (arg === "--root" || arg === "--tasks-dir" || arg === "--task") {
			const value = args[++i];
			if (value === undefined) {
				opts.error = `${arg} requires a value`;
				break;
			}
			if (arg === "--root") opts.root = value;
			else if (arg === "--tasks-dir") opts.tasksDir = value;
			else opts.task = value;
		} else if (arg === "--help" || arg === "-h") opts.help = true;
	}
	return opts;
}

/***
 * MARK: backupPathFor
 * @description Returns the byte-backup path for a file under repair.
 * @example backupPathFor("task.md") => "task.md.bak"
 * @param {string} file - File path.
 * @returns {string} Backup path.
 ***/
export function backupPathFor(file) {
	return `${file}.bak`;
}

function writeBackup(file, backup) {
	if (backup && !fs.existsSync(backupPathFor(file))) {
		fs.copyFileSync(file, backupPathFor(file));
	}
}

/***
 * MARK: taskMarkdownSurfaces
 * @description The auditable markdown surfaces of one task folder: `task.md`
 *   first, then the folder's other top-level `*.md` files (stage reports,
 *   plans, surveys) in sorted order. Byte-backups (`*.bak`) and the
 *   `assets/` dir are never surfaces.
 * @example taskMarkdownSurfaces("/tasks/t1") => ["/tasks/t1/task.md", ...]
 * @param {string} taskDir - Absolute task folder.
 * @returns {Array<string>} Absolute surface paths (existing files only).
 ***/
export function taskMarkdownSurfaces(taskDir) {
	let entries;
	try {
		entries = fs.readdirSync(taskDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const files = entries
		.filter((entry) => entry.isFile())
		.map((entry) => entry.name)
		.filter((name) => name.endsWith(".md") && !name.endsWith(".bak.md") && !name.endsWith(".md.bak"))
		.sort();
	const ordered = [
		...files.filter((name) => name === "task.md"),
		...files.filter((name) => name !== "task.md"),
	];
	return ordered.map((name) => path.join(taskDir, name));
}

/***
 * MARK: auditTasks
 * @description Scans the tasks dir for attachment refs that a Runner on
 *   another box cannot resolve, and (when `apply` is set) repairs the
 *   resolvable ones: bytes still on this box are ingested into the task's
 *   `assets/` folder, the surface rewritten to the stored names
 *   (byte-backups first), and the assets commit-assured on the task branch
 *   (best-effort). Dangling refs keep their text and are reported as
 *   still-dangling. Dry-run never writes. Returns — never throws for —
 *   expected operational conditions (missing tasks dir, unknown `--task`);
 *   only genuine I/O failures propagate.
 * @example (await auditTasks({ root: "/tmp/proj", apply: false })).tasks => []
 * @param {Object} [opts]
 * @param {string} [opts.root] - Project checkout (resolves relative refs; default repo root).
 * @param {string} [opts.tasksDir] - Tasks directory (default `<root>/docs/tasks`).
 * @param {string} [opts.task] - Audit only this task id.
 * @param {boolean} [opts.apply] - Write repairs (default false).
 * @param {boolean} [opts.backup] - Write `.bak` copies before repairing.
 * @returns {Promise<{error:string|null,tasks:Array<Object>,repaired:number,recoverable:number,dangling:number}>}
 ***/
export async function auditTasks({ root, tasksDir, task, apply = false, backup = true } = {}) {
	const projectCwd = root ? path.resolve(root) : repoRoot;
	const dir = tasksDir ? path.resolve(tasksDir) : path.join(projectCwd, "docs", "tasks");
	if (!fs.existsSync(dir)) {
		return { error: `tasks dir not found: ${dir}`, tasks: [], repaired: 0, recoverable: 0, dangling: 0 };
	}
	let entries;
	try {
		entries = fs
			.readdirSync(dir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch (err) {
		return { error: `cannot list tasks dir: ${err?.message || err}`, tasks: [], repaired: 0, recoverable: 0, dangling: 0 };
	}
	if (task) {
		if (!entries.includes(task)) {
			return { error: `task not found: ${task}`, tasks: [], repaired: 0, recoverable: 0, dangling: 0 };
		}
		entries = [task];
	}
	const tasks = [];
	let repaired = 0;
	let recoverable = 0;
	let dangling = 0;
	for (const taskId of entries) {
		const taskDir = path.join(dir, taskId);
		const surfaces = [];
		const repairedRefs = [];
		for (const surface of taskMarkdownSurfaces(taskDir)) {
			let original;
			try {
				original = fs.readFileSync(surface, "utf8");
			} catch {
				continue;
			}
			const before = auditTaskAttachmentRefs({
				projectCwd,
				taskId,
				markdown: original,
			});
			const file = path.basename(surface);
			if (apply && before.outOfTask.some((entry) => entry.resolvable)) {
				const outcome = ingestOutOfTaskRefs({ projectCwd, taskId, markdown: original });
				if (outcome.ingested.length > 0) {
					writeBackup(surface, backup);
					fs.writeFileSync(surface, outcome.markdown);
					for (const entry of outcome.ingested) {
						repairedRefs.push({ file, from: entry.from, to: entry.to, name: entry.name });
					}
					const after = auditTaskAttachmentRefs({
						projectCwd,
						taskId,
						markdown: outcome.markdown,
					});
					surfaces.push({ file, missing: after.missing, outOfTask: after.outOfTask });
					continue;
				}
			}
			surfaces.push({ file, missing: before.missing, outOfTask: before.outOfTask });
		}
		const taskRecoverable = surfaces.reduce(
			(count, surface) => count + surface.outOfTask.filter((entry) => entry.resolvable).length,
			0,
		);
		const taskDangling = surfaces.reduce(
			(count, surface) =>
				count +
				surface.missing.length +
				surface.outOfTask.filter((entry) => !entry.resolvable).length,
			0,
		);
		// A repaired surface re-audits clean, so `repairedRefs` (not the
		// before/after delta) is the repair count of record. Post-state
		// counts in both modes: after `--apply`, a still-resolvable ref is
		// one ingest skipped (caps, disallowed type), not one it missed.
		repaired += repairedRefs.length;
		recoverable += taskRecoverable;
		dangling += taskDangling;
		let commit = null;
		if (apply && repairedRefs.length > 0) {
			try {
				commit = await commitTaskAssets({
					projectCwd,
					taskId,
					names: [...new Set(repairedRefs.map((entry) => entry.name))],
				});
			} catch {
				commit = { committed: false, hash: null, reason: "failed" };
			}
		}
		const interesting =
			repairedRefs.length > 0 ||
			surfaces.some((surface) => surface.missing.length > 0 || surface.outOfTask.length > 0);
		if (interesting) {
			tasks.push({ id: taskId, surfaces, repaired: repairedRefs, commit });
		}
	}
	return { error: null, tasks, repaired, recoverable, dangling };
}

/***
 * MARK: formatReport
 * @description Renders the human-readable audit lines for one `auditTasks`
 *   outcome: per task, per surface, each ref with its expected path and
 *   whether its bytes are still recoverable on this box, plus the repair
 *   and commit record for `--apply` runs.
 * @example formatReport({ tasks: [], repaired: 0, recoverable: 0, dangling: 0 }, false) => ["no attachment refs need attention."]
 * @param {Object} outcome - The `auditTasks` outcome.
 * @param {boolean} apply - Whether repairs were written.
 * @returns {Array<string>} Report lines.
 ***/
export function formatReport(outcome, apply) {
	const lines = [];
	for (const task of outcome.tasks) {
		lines.push(`task ${task.id}:`);
		for (const surface of task.surfaces) {
			for (const entry of surface.missing) {
				lines.push(
					`  ${surface.file}: ${entry.ref} — bytes missing (expected at ${entry.expectedPath}; dangling)`,
				);
			}
			for (const entry of surface.outOfTask) {
				lines.push(
					`  ${surface.file}: ${entry.ref} — out-of-task ref (${entry.resolvable ? "recoverable on this box" : "dangling"})`,
				);
			}
		}
		for (const entry of task.repaired) {
			lines.push(`  ${entry.file}: repaired ${entry.from} -> ${entry.to}`);
		}
		if (task.commit) {
			lines.push(
				task.commit.committed
					? `  assets committed (${task.commit.hash || "unresolved hash"})`
					: `  assets left for the auto-commit sweep (commit ${task.commit.reason})`,
			);
		}
	}
	if (outcome.tasks.length === 0) {
		lines.push("no attachment refs need attention.");
		return lines;
	}
	if (apply) {
		lines.push(
			`repaired ${outcome.repaired} ref(s); ${outcome.dangling} dangling ref(s) remain (left visible, never deleted).`,
		);
		if (outcome.recoverable > 0) {
			lines.push(
				`${outcome.recoverable} resolvable ref(s) skipped by ingest (caps or disallowed type; see above).`,
			);
		}
	} else {
		lines.push(
			`${outcome.recoverable} recoverable ref(s), ${outcome.dangling} dangling ref(s) (re-run with --apply to repair the recoverable ones).`,
		);
	}
	return lines;
}

/***
 * MARK: usage
 * @description CLI usage text.
 ***/
export const USAGE =
	"Usage: node scripts/audit-task-attachments.mjs [--apply] [--root <dir>] [--tasks-dir <dir>] [--task <id>] [--no-backup]";

/***
 * MARK: main
 * @description CLI entry point: parses `argv`, prints the human-readable
 *   audit report, and resolves the process exit code. Argument errors exit
 *   2, a missing tasks dir or unknown task exits 1, a completed audit
 *   exits 0 — all before/without writes except an explicit `--apply`.
 * @example await main(["--help"]) => 0
 * @param {Array<string>} [argv] - Argument list (without node/script).
 * @returns {Promise<number>} Process exit code.
 ***/
export async function main(argv = process.argv.slice(2)) {
	const opts = parseArgs(argv);
	if (opts.error) {
		console.error(`[audit-attachments] ${opts.error}`);
		console.error(USAGE);
		return 2;
	}
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}
	const outcome = await auditTasks({
		root: opts.root,
		tasksDir: opts.tasksDir,
		task: opts.task,
		apply: opts.apply,
		backup: opts.backup,
	});
	if (outcome.error) {
		console.error(`[audit-attachments] ${outcome.error}`);
		return 1;
	}
	const header = opts.apply ? "[audit-attachments] repair pass" : "[audit-attachments] dry-run (no writes)";
	console.log(header);
	for (const line of formatReport(outcome, opts.apply)) console.log(line);
	return 0;
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	await main().then(
		(code) => {
			process.exitCode = code;
		},
		(err) => {
			console.error(`[audit-attachments] ${err?.message || err}`);
			process.exitCode = 1;
		},
	);
}
