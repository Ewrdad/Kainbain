// Domain: The Work — disk-authoritative listing of a task's docs folder.
// Stage prompts must name only files that actually exist under
// `<projectCwd>/<docsDirName>/tasks/<taskId>/`, so the Previous Reports
// section is enumerated from disk at render time instead of trusting
// `task.reports` metadata (which can reference phantom files). Mirrors the
// traversal safety and never-throw conventions of `taskAssetDir` /
// `listTaskImages` in `./taskAssets.js`.
import path from "node:path";
import fs from "node:fs";
import { resolveTaskDocsDir, resolveDocsDirName } from "../docsPath.js";

/***
 * MARK: listTaskDocsFiles
 * @description Lists the top-level files actually present in a task's docs
 *   folder (`<projectCwd>/<docsDirName>/tasks/<taskId>/`), newest first
 *   (mtime descending, filename ascending tiebreak) — the disk-authoritative
 *   source for the `# Previous Reports` prompt section. `task.md` (the
 *   task's own metadata file) and subdirectories are excluded; every other
 *   extension is included. A missing or unreadable folder yields
 *   `{ files: [], dirExists: false }` and never throws.
 * @example listTaskDocsFiles('/repo', 'task-1').files => [{ filename: 'SURVEY.md', path: './docs/tasks/task-1/SURVEY.md', mtimeMs: 123 }]
 * @param {string} projectCwd - Absolute project working directory.
 * @param {string} taskId - Task id (also the folder's final segment).
 * @param {Object|string} [docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @returns {{files: Array<{filename: string, path: string, mtimeMs: number}>, dirExists: boolean, docsDirName: string}}
 ***/
export const listTaskDocsFiles = (projectCwd, taskId, docsProject) => {
	const docsDirName = resolveDocsDirName(
		typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject,
	);
	if (!projectCwd || !taskId || typeof taskId !== "string") {
		return { files: [], dirExists: false, docsDirName };
	}
	const taskDocsDir = resolveTaskDocsDir(projectCwd, docsProject, taskId);
	if (!taskDocsDir || path.basename(taskDocsDir) !== taskId) {
		return { files: [], dirExists: false, docsDirName };
	}
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		if (!fs.existsSync(taskDocsDir)) return { files: [], dirExists: false, docsDirName };
		const entries = fs.readdirSync(taskDocsDir, { withFileTypes: true });
		const files = [];
		for (const entry of entries) {
			if (!entry.isFile()) continue;
			if (entry.name === "task.md") continue;
			let mtimeMs = 0;
			try {
				mtimeMs = fs.statSync(path.join(taskDocsDir, entry.name)).mtimeMs || 0;
			} catch {
				mtimeMs = 0;
			}
			files.push({
				filename: entry.name,
				path: `./${docsDirName}/tasks/${taskId}/${entry.name}`,
				mtimeMs,
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
