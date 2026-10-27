import fs from "node:fs";
import path from "node:path";
import { resolveTasksDir } from "../../docsPath.js";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

/***
 * MARK: materializeRunnerTaskDocs
 * @description Writes Runner-authored task files (plans, surveys, reports the
 *   agent wrote into its worktree `docs/tasks/<id>/`) into the backend's own
 *   task folder, so backend-run stages (CI `cat {{taskDocs}}/PLAN.md`,
 *   previous-reports lists) can see them. The backend never touches git
 *   remotes for Runner work (D2), so files arrive in the completion payload.
 *   Safety: bare filenames only (no traversal), `task.md` is backend-owned
 *   and never overwritten, per-file and total size caps, text only.
 * @example materializeRunnerTaskDocs({ project, taskId: 't1', files: [{ name: 'IMPLEMENTATION_PLAN.md', content: 'x' }] }) => { written: ['IMPLEMENTATION_PLAN.md'] }
 * @param {Object} opts - `{ project, taskId, files }`.
 * @returns {Object} `{ written: string[] }`.
 ***/
export function materializeRunnerTaskDocs({ project, taskId, files } = {}) {
	const written = [];
	if (!project?.cwd || !taskId || !Array.isArray(files)) return { written };
	const dir = resolveTasksDir(project.cwd, project);
	if (!dir) return { written };
	const taskDir = path.join(dir, String(taskId));
	let total = 0;
	for (const file of files) {
		const name = typeof file?.name === "string" ? path.basename(file.name) : "";
		if (!name || name === "task.md" || typeof file?.content !== "string") continue;
		const bytes = Buffer.byteLength(file.content, "utf8");
		if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) continue;
		try {
			fs.mkdirSync(taskDir, { recursive: true });
			fs.writeFileSync(path.join(taskDir, name), file.content, "utf8");
			written.push(name);
			total += bytes;
		} catch {
			// Best-effort: a failed write must never fail the completion.
		}
	}
	return { written };
}
