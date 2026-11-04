import fs from "node:fs";
import path from "node:path";
import { resolveTasksDir } from "../../docsPath.js";
import { mergeSurveyDocuments, parseSurvey } from "../../../shared/survey.js";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

/***
 * MARK: materializeRunnerTaskDocs
 * @description Writes Runner-authored task files (plans, surveys, reports the
 *   agent wrote into its worktree `docs/tasks/<id>/`) into the backend's own
 *   task folder, so backend-run stages (CI `cat {{taskDocs}}/PLAN.md`,
 *   previous-reports lists) can see them. The backend never touches git
 *   remotes for Runner work (D2), so files arrive in the completion payload.
 *   Survey files merge instead of overwrite: a Runner copy can lag behind
 *   answers the human already saved (a remote Runner never sees them), so the
 *   backend answers are backfilled into the incoming rounds and backend-only
 *   rounds are re-appended — the shipment can add questions but never wipe
 *   answers. Safety: bare filenames only (no traversal), `task.md` is
 *   backend-owned and never overwritten, per-file and total size caps, text
 *   only.
 * @example materializeRunnerTaskDocs({ project, taskId: 't1', files: [{ name: 'IMPLEMENTATION_PLAN.md', content: 'x' }] }) => { written: ['IMPLEMENTATION_PLAN.md'], merged: [] }
 * @param {Object} opts - `{ project, taskId, files }`.
 * @returns {Object} `{ written: string[], merged: string[] }` — `merged`
 *   names the survey files whose backend answers or rounds survived the merge.
 ***/
export function materializeRunnerTaskDocs({ project, taskId, files } = {}) {
	const written = [];
	const merged = [];
	if (!project?.cwd || !taskId || !Array.isArray(files)) return { written, merged };
	const dir = resolveTasksDir(project.cwd, project);
	if (!dir) return { written, merged };
	const taskDir = path.join(dir, String(taskId));
	let total = 0;
	for (const file of files) {
		const name = typeof file?.name === "string" ? path.basename(file.name) : "";
		if (!name || name === "task.md" || typeof file?.content !== "string") continue;
		let content = file.content;
		// A stale Runner shipment must never wipe a backend survey: whenever
		// the backend file already holds survey rounds, merge instead of
		// overwriting — even when the incoming copy carries no survey
		// content at all (the merge then keeps the backend copy).
		// (Inline by design: this file keeps one top-level function.)
		try {
			const dest = path.join(taskDir, name);
			if (fs.existsSync(dest)) {
				const backendContent = fs.readFileSync(dest, "utf8");
				if (parseSurvey(backendContent).rounds.length > 0) {
					// Labels keep the sides explicit: backend copy (answers to
					// keep), Runner shipment (questions to land). The merge never
					// throws — it keeps the backend copy on any unexpected
					// shape — so this catch only covers an unreadable file.
					const result = mergeSurveyDocuments({ backendMarkdown: backendContent, incomingMarkdown: content });
					if (result.merged) merged.push(name);
					if (result.markdown === backendContent) continue;
					content = result.markdown;
				}
			}
		} catch {
			// Unreadable backend copy: fall through to the plain write below.
		}
		const bytes = Buffer.byteLength(content, "utf8");
		if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) continue;
		try {
			fs.mkdirSync(taskDir, { recursive: true });
			fs.writeFileSync(path.join(taskDir, name), content, "utf8");
			written.push(name);
			total += bytes;
		} catch {
			// Best-effort: a failed write must never fail the completion.
		}
	}
	return { written, merged };
}
