import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/***
 * MARK: runGit
 * @description Minimal git runner for Runner-side project prep. Throws the
 *   git stderr on failure so the daemon reports *why* a clone/pull failed.
 * @example await runGit('/repo', ['rev-parse', 'HEAD']) => { stdout: 'abc...' }
 * @param {string} cwd - Repository to run in.
 * @param {string[]} args - Git arguments (no shell, no interpolation).
 * @returns {Promise<{stdout: string, stderr: string}>} Git output.
 ***/
export async function runGit(cwd, args) {
	return execFileAsync("git", args, { cwd });
}

function slugForRepo(repoUrl) {
	const base = String(repoUrl).split("/").filter(Boolean).pop() || "repo";
	return base.replace(/\.git$/, "").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 64) || "repo";
}

/***
 * MARK: listOrphanWorkdirs
 * @description Worktree dirs under the root that do not belong to the given
 *   task. The daemon surfaces these at boot instead of discarding them
 *   (reboot-safe startup, D14): unpushed work is never deleted by cleanup.
 * @example listOrphanWorkdirs('/work', 't1') => ['/work/kb-t0']
 * @param {string} workRoot - Runner work root.
 * @param {string} currentTaskId - Task id to exclude.
 * @returns {string[]} Absolute orphan workdir paths.
 ***/
export function listOrphanWorkdirs(workRoot, currentTaskId) {
	const keep = `kb-${currentTaskId}`;
	let entries = [];
	try {
		entries = fs.readdirSync(workRoot, { withFileTypes: true });
	} catch {
		return [];
	}
	return entries
		.filter((e) => e.isDirectory() && e.name.startsWith("kb-") && e.name !== keep)
		.map((e) => path.join(workRoot, e.name));
}

/***
 * MARK: prepareWorkdir
 * @description Project load per the transport matrix (MigrationPlan §4):
 *   remote-backed clones the origin into the Runner mirror dir and pulls,
 *   grandfathered local-only adopts the repo path (no clone-from-origin,
 *   `no-remote`). Both modes then open a per-task worktree `kb-<taskId>`
 *   on branch `kb/<taskId>` (reused when a previous run left it behind).
 *   Refuses when ~5 foreign worktrees already exist (D14 cap) and names
 *   the orphans instead of deleting them.
 * @example await prepareWorkdir({ repoUrl: 'https://...', workRoot: '/w', taskId: 't1' }) => { workdir: '/w/kb-t1', ... }
 * @param {Object} opts - Options.
 * @param {string} [opts.repoUrl] - Origin to clone (remote-backed mode).
 * @param {string} [opts.localPath] - Repo path to adopt (local-only mode).
 * @param {string} opts.workRoot - Runner work root.
 * @param {string} opts.taskId - Task id.
 * @returns {Promise<Object>} `{ workdir, branch, mode, reused }`.
 ***/
export async function prepareWorkdir({ repoUrl, localPath, workRoot, taskId }) {
	if (!repoUrl && !localPath) {
		throw new Error("prepareWorkdir needs repoUrl (clone) or localPath (adopt).");
	}
	fs.mkdirSync(workRoot, { recursive: true });
	const branch = `kb/${taskId}`;
	const workdir = path.join(workRoot, `kb-${taskId}`);
	const orphans = listOrphanWorkdirs(workRoot, taskId);
	if (orphans.length >= 5 && !fs.existsSync(workdir)) {
		const err = new Error(
			`Worktree cap reached (~5); refusing to add kb-${taskId}. Orphans: ${orphans.join(", ")}`,
		);
		err.code = "WORKTREE_CAP_REACHED";
		throw err;
	}

	let repoDir;
	let mode;
	if (repoUrl) {
		mode = "clone";
		repoDir = path.join(workRoot, "mirrors", slugForRepo(repoUrl));
		if (!fs.existsSync(path.join(repoDir, ".git"))) {
			fs.mkdirSync(path.dirname(repoDir), { recursive: true });
			await runGit(workRoot, ["clone", repoUrl, repoDir]);
		} else {
			await runGit(repoDir, ["pull", "--ff-only"]);
		}
	} else {
		mode = "adopt";
		repoDir = localPath;
	}

	if (fs.existsSync(workdir)) {
		return { workdir, branch, mode, reused: true, orphans };
	}
	try {
		await runGit(repoDir, ["worktree", "add", workdir, "-b", branch]);
	} catch (err) {
		const msg = String(err?.stderr || err?.message || "");
		if (msg.includes("already exists") || msg.includes("already used")) {
			await runGit(repoDir, ["worktree", "add", workdir, branch]);
		} else {
			throw err;
		}
	}
	return { workdir, branch, mode, reused: false, orphans };
}
