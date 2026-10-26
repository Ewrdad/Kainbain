#!/usr/bin/env node
/***
 * MARK: remediate-no-verdict-rejections
 * @description One-off repair for the pre-revert strict no-verdict gate. The
 *   deployed build that predated commit b2806f3 failed agent stages that
 *   changed nothing and rendered no `KAINBAIN_VERDICT`, stamping
 *   `[Agent Review Rejection] No changes made and no verdict rendered` into
 *   persisted task timelines/reports. This CLI scans each `docs/tasks`
 *   task's `task.md`, reports every victim, and (with `--apply`) rewrites the
 *   spurious failure out of the task and its stage reports. Dry-run by
 *   default; `--apply` writes byte-backups first. Idempotent — re-running
 *   after `--apply` reports zero remaining victims.
 *
 *   Fail-safe by construction: argument errors and a missing tasks dir exit
 *   non-zero before touching any file, and the default mode never writes.
 *   `parseArgs`, `remediateTasks`, and `main` are exported so the harness
 *   self-tests (`tests/remediate-no-verdict-rejections.test.mjs`) can drive
 *   them against temp fixtures; the process side effects (printing, exit
 *   code) only run when the file is the node entry point.
 * @example node scripts/remediate-no-verdict-rejections.mjs
 * @example node scripts/remediate-no-verdict-rejections.mjs --apply
 * @example node scripts/remediate-no-verdict-rejections.mjs --tasks-dir docs/tasks --apply --log /tmp/remediation.log
 ***/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	remediateReportMarkdown,
	remediateTaskMarkdown,
} from "../api/work/remediateNoVerdictRejections.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/***
 * MARK: parseArgs
 * @description Parses the CLI flags into options. Never throws: a flag that
 *   requires a value but has none records `error`, and `main` turns that
 *   into a usage message with a non-zero exit before any file is touched.
 *   Unknown flags are ignored; a bare `--apply` typo therefore degrades to
 *   a dry run (no writes), never to an unintended repair.
 * @example parseArgs(["--apply"]).apply => true
 * @example parseArgs(["--tasks-dir"]).error => "--tasks-dir requires a value"
 * @param {Array<string>} [argv] - Argument list (without node/script).
 * @returns {{apply:boolean,backup:boolean,tasksDir:string|null,log:string|null,help:boolean,error:string|null}}
 ***/
export function parseArgs(argv = []) {
	const opts = {
		apply: false,
		backup: true,
		tasksDir: null,
		log: null,
		help: false,
		error: null,
	};
	const args = Array.isArray(argv) ? argv : [];
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--apply") opts.apply = true;
		else if (arg === "--dry-run") opts.apply = false;
		else if (arg === "--no-backup") opts.backup = false;
		else if (arg === "--tasks-dir" || arg === "--log") {
			const value = args[++i];
			if (value === undefined) {
				opts.error = `${arg} requires a value`;
				break;
			}
			if (arg === "--tasks-dir") opts.tasksDir = value;
			else opts.log = value;
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
 * MARK: remediateTasks
 * @description Scans `tasksDir` for tasks carrying the spurious no-verdict
 *   rejection and, when `apply` is set, repairs them (task frontmatter plus
 *   the paired stage-report files, with byte-backups first). Dry-run never
 *   writes. Returns — never throws for — expected operational conditions
 *   (missing tasks dir); only genuine I/O failures propagate.
 * @example remediateTasks({ tasksDir: "/tmp/tasks", apply: false }).victims => []
 * @param {Object} [opts]
 * @param {string} opts.tasksDir - Absolute tasks directory to scan.
 * @param {boolean} [opts.apply] - Write repairs (default false).
 * @param {boolean} [opts.backup] - Write `.bak` copies before repairing.
 * @returns {{error:string|null,victims:Array<Object>,lines:Array<string>}}
 ***/
export function remediateTasks({ tasksDir, apply = false, backup = true } = {}) {
	if (!tasksDir || !fs.existsSync(tasksDir)) {
		return { error: `tasks dir not found: ${tasksDir}`, victims: [], lines: [] };
	}

	const victims = [];
	const lines = [];
	const entries = fs
		.readdirSync(tasksDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory());

	for (const entry of entries) {
		const taskDir = path.join(tasksDir, entry.name);
		const taskFile = path.join(taskDir, "task.md");
		if (!fs.existsSync(taskFile)) continue;
		const original = fs.readFileSync(taskFile, "utf8");
		const taskResult = remediateTaskMarkdown(original);
		if (!taskResult.changed) continue;

		victims.push({
			id: entry.name,
			removedFailures: taskResult.removedFailures,
			repairedReports: taskResult.repairedReports,
			removedLedger: taskResult.removedLedger,
		});
		lines.push(
			`${entry.name}: removed ${taskResult.removedFailures} spurious failure(s), repaired ${taskResult.repairedReports} report(s)${
				taskResult.removedLedger ? ", removed stale verdictImplicitPassStages" : ""
			}`,
		);

		if (!apply) continue;

		writeBackup(taskFile, backup);
		fs.writeFileSync(taskFile, taskResult.text);

		for (const filename of taskResult.reportFilenames) {
			const reportFile = path.join(taskDir, filename);
			if (!fs.existsSync(reportFile)) continue;
			const reportText = fs.readFileSync(reportFile, "utf8");
			const reportResult = remediateReportMarkdown(reportText);
			if (!reportResult.changed) continue;
			writeBackup(reportFile, backup);
			fs.writeFileSync(reportFile, reportResult.text);
		}
	}

	return { error: null, victims, lines };
}

/***
 * MARK: usage
 * @description CLI usage text.
 ***/
export const USAGE =
	"Usage: node scripts/remediate-no-verdict-rejections.mjs [--apply] [--tasks-dir <dir>] [--log <file>] [--no-backup]";

/***
 * MARK: main
 * @description CLI entry point: parses `argv`, prints the human-readable
 *   repair summary, optionally appends it to `--log`, and returns the
 *   process exit code. Argument errors exit 2, a missing tasks dir exits 1,
 *   success exits 0 — all before/without writes except an explicit `--apply`.
 * @example main(["--help"]) => 0
 * @param {Array<string>} [argv] - Argument list (without node/script).
 * @returns {number} Process exit code.
 ***/
export function main(argv = process.argv.slice(2)) {
	const opts = parseArgs(argv);
	if (opts.error) {
		console.error(`[remediate] ${opts.error}`);
		console.error(USAGE);
		return 2;
	}
	if (opts.help) {
		console.log(USAGE);
		return 0;
	}

	const tasksDir = path.resolve(repoRoot, opts.tasksDir || "docs/tasks");
	const { error, victims, lines } = remediateTasks({
		tasksDir,
		apply: opts.apply,
		backup: opts.backup,
	});
	if (error) {
		console.error(`[remediate] ${error}`);
		return 1;
	}

	const header = opts.apply
		? `[remediate] applied to ${victims.length} task(s)`
		: `[remediate] dry-run: ${victims.length} task(s) would be repaired (re-run with --apply)`;
	console.log(header);
	for (const line of lines) console.log(`  - ${line}`);
	if (victims.length === 0) {
		console.log("  (no spurious no-verdict rejections remain)");
	}

	const logText = [header, ...lines.map((line) => `  - ${line}`), ""].join("\n");
	if (opts.log) {
		fs.mkdirSync(path.dirname(path.resolve(repoRoot, opts.log)), {
			recursive: true,
		});
		fs.writeFileSync(path.resolve(repoRoot, opts.log), logText);
	}
	return 0;
}

const invokedDirectly =
	process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
	process.exitCode = main();
}
