// Domain: The Work — ingest-time commit of task attachment bytes.
import path from "node:path";
import { resolveDocsDirName } from "../docsPath.js";
import {
	currentBranch,
	ensureGitIdentity,
	git,
	hasCommits,
	isGitRepository,
	resolveSha,
} from "../git.js";
import { taskAssetDir } from "./taskAssets.js";

/***
 * MARK: commitTaskAssets
 * @description Best-effort ingest-time commit of a task's `assets/` folder on
 *   the task branch, so an uploaded/ingested attachment becomes branch
 *   content promptly instead of sitting untracked until the next stage
 *   auto-commit sweeps it. Scoped by construction: only the `assets/`
 *   directory is staged (never `task.md`, never `git add -A`), and the
 *   commit refuses unless the checkout is currently on the task's branch
 *   (`branch`, defaulting to `kb/<taskId>`). No push: delivery to remote
 *   Runners rides the claim payload, and pushing on every upload would
 *   serialize all concurrent uploads on the remote. `.gitignore` is
 *   respected like the finalize sweep (no force-add): an ignored name
 *   (e.g. `*.log` under the scaffold gitignore) resolves `clean` and
 *   still reaches Runners through the claim payload. Never throws: every
 *   refusal and every git failure resolves to `{ committed: false }`
 *   with a `reason` (`invalid-location`, `not-a-repo`, `no-commits`,
 *   `wrong-branch`, `clean`, `nothing-staged`, `failed`), so callers
 *   treat the commit as assurance, not as a gate — the existing
 *   finalize sweep stays the backstop.
 * @example await commitTaskAssets({ projectCwd: '/repo', taskId: 't1' }) => { committed: true, hash: 'abc…', reason: 'committed' }
 * @param {Object} opts
 * @param {string} opts.projectCwd - Project checkout to commit in.
 * @param {string} opts.taskId - Task whose `assets/` dir is staged.
 * @param {string} [opts.branch] - Expected branch (default `kb/<taskId>`).
 * @param {Object|string} [opts.docsProject] - Project record (or bare folder name) carrying `docsDirName`.
 * @param {string[]} [opts.names] - Ingested file names for the commit subject.
 * @param {Object} [opts.logger] - Optional logger (`warn`/`info`).
 * @returns {Promise<{committed: boolean, hash: string|null, reason: string}>}
 ***/
export async function commitTaskAssets({
	projectCwd,
	taskId,
	branch,
	docsProject,
	names,
	logger,
}) {
	const done = (committed, hash, reason) => ({ committed, hash, reason });
	try {
		if (!projectCwd || !taskId || typeof taskId !== "string") {
			return done(false, null, "invalid-location");
		}
		const assetsDir = taskAssetDir(projectCwd, taskId, docsProject);
		if (!assetsDir) return done(false, null, "invalid-location");
		if (!(await isGitRepository(projectCwd))) return done(false, null, "not-a-repo");
		if (!(await hasCommits(projectCwd))) return done(false, null, "no-commits");
		// Branch affinity (fail closed): ingested bytes must never land on
		// a sibling task's branch when a concurrent stage moved the shared
		// checkout. An unreadable HEAD refuses like a mismatch.
		const expected =
			typeof branch === "string" && branch ? branch : `kb/${taskId}`;
		const actual = await currentBranch(projectCwd).catch(() => null);
		if (actual !== expected) {
			logger?.warn?.(
				{ taskId, expected, actual: actual || "unknown" },
				"task attachment commit skipped: checkout is on another branch",
			);
			return done(false, null, "wrong-branch");
		}
		const project =
			typeof docsProject === "string" ? { docsDirName: docsProject } : docsProject;
		const assetsRel = `${resolveDocsDirName(project)}/tasks/${taskId}/assets`;
		// Scoped staging: the assets dir only. `task.md` (backend store
		// state) and every other worktree path stay out of the commit.
		await git(projectCwd, ["add", "--", assetsRel]);
		const staged = await git(projectCwd, [
			"diff",
			"--cached",
			"--name-only",
			"-z",
			"--",
			assetsRel,
		]);
		const stagedNames = String(staged.stdout || "")
			.split(String.fromCharCode(0))
			.map((line) => line.trim())
			.filter(Boolean);
		if (stagedNames.length === 0) return done(false, null, "clean");
		await ensureGitIdentity(projectCwd);
		const fileList = (Array.isArray(names) ? names : [])
			.filter((name) => typeof name === "string" && name)
			.slice(0, 5)
			.join(", ");
		const subject =
			stagedNames.length === 1 && !fileList
				? `KainBain: attach ${path.posix.basename(stagedNames[0])} to task ${taskId}`
				: `KainBain: attach ${fileList || `${stagedNames.length} file(s)`} to task ${taskId}`;
		await git(projectCwd, ["commit", "-m", subject, "--", assetsRel]);
		const hash = await resolveSha(projectCwd, "HEAD").catch(() => null);
		logger?.info?.({ taskId, hash }, "task attachments committed");
		return done(true, hash, "committed");
	} catch (err) {
		logger?.warn?.(
			{ taskId, error: err?.message || String(err) },
			"task attachment commit failed",
		);
		return done(false, null, "failed");
	}
}
