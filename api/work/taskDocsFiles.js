// Domain: The Work — disk-authoritative listing of a task's docs folder.
// Stage prompts must name only files that actually exist under
// `<projectCwd>/<docsDirName>/tasks/<taskId>/`, so the Previous Reports
// section is enumerated from disk at render time instead of trusting
// `task.reports` metadata (which can reference phantom files). Mirrors the
// traversal safety and never-throw conventions of `taskAssetDir` /
// `listTaskImages` in `./taskAssets.js`.
import path from "node:path";
import fs from "node:fs";
import {
	resolveTaskDocsDir,
	resolveTasksDir,
	resolveDocsDirName,
} from "../docsPath.js";

/***
 * MARK: listTaskDocsFiles
 * @description Lists the top-level files actually present in a task's docs
 *   folder (`<projectCwd>/<docsDirName>/tasks/<taskId>/`), newest first
 *   (mtime descending, filename ascending tiebreak) — the disk-authoritative
 *   source for the `# Previous Reports` prompt section. `task.md` (the
 *   task's own metadata file) and subdirectories are excluded; every other
 *   extension is included, including links that resolve to a regular file.
 *   How it can fail: a missing or unreadable folder yields
 *   `{ files: [], dirExists: false }`; a taskId that escapes the tasks root
 *   is rejected the same way; an entry that cannot be stat'ed (deleted
 *   mid-read, broken link) is omitted rather than listed with a zero time,
 *   so the prompt never names a file the agent cannot open. Never throws.
 * @example listTaskDocsFiles('/repo', 'task-1').files => [{ filename: 'SURVEY.md', path: './docs/tasks/task-1/SURVEY.md', mtimeMs: 123 }]
 * @param {string} projectCwd - Absolute project working directory.
 * @param {string} taskId - Task id (also the folder's final segment).
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {{files: Array<{filename: string, path: string, mtimeMs: number}>, dirExists: boolean, docsDirName: string}}
 ***/
export const listTaskDocsFiles = (projectCwd, taskId, docsProject) => {
	const docsProjectRecord =
		typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject;
	const docsDirName = resolveDocsDirName(docsProjectRecord);
	if (!projectCwd || !taskId || typeof taskId !== "string") {
		return { files: [], dirExists: false, docsDirName };
	}
	const taskDocsDir = resolveTaskDocsDir(projectCwd, docsProjectRecord, taskId);
	const tasksRoot = resolveTasksDir(projectCwd, docsProjectRecord);
	if (
		!taskDocsDir ||
		!tasksRoot ||
		path.basename(taskDocsDir) !== taskId ||
		path.relative(tasksRoot, taskDocsDir).startsWith("..")
	) {
		return { files: [], dirExists: false, docsDirName };
	}
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		if (!fs.existsSync(taskDocsDir)) return { files: [], dirExists: false, docsDirName };
		const entries = fs.readdirSync(taskDocsDir, { withFileTypes: true });
		const files = [];
		for (const entry of entries) {
			if (entry.name === "task.md") continue;
			if (!entry.isFile() && !entry.isSymbolicLink()) continue;
			let entryStat = null;
			try {
				entryStat = fs.statSync(path.join(taskDocsDir, entry.name));
			} catch {
				entryStat = null;
			}
			// Fail closed: an entry that cannot be stat'ed (or that is not a
			// regular file once links are followed) is omitted. Listing it
			// would reintroduce the phantom-file problem this module exists
			// to fix: every named file must open successfully.
			if (!entryStat || !entryStat.isFile()) continue;
			files.push({
				filename: entry.name,
				path: `./${docsDirName}/tasks/${taskId}/${entry.name}`,
				mtimeMs: entryStat.mtimeMs || 0,
			});
		}
		files.sort((a, b) => {
			if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs;
			return String(a.filename).localeCompare(String(b.filename));
		});
		return { files, dirExists: true, docsDirName };
	} catch {
		return { files: [], dirExists: false, docsDirName };
	}
	/* eslint-enable security/detect-non-literal-fs-filename */
};
