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
 * MARK: refreshMirror
 * @description Self-healing mirror refresh (G6, D14): fetches the origin
 *   and hard-resets the mirror checkout to its upstream so a diverged
 *   local master heals instead of failing pulls forever. Masters only —
 *   per-task worktrees (`kb-*`) are never touched here.
 * @example await refreshMirror('/work/mirrors/repo')
 * @param {string} repoDir - Mirror checkout directory.
 * @returns {Promise<void>}
 ***/
export async function refreshMirror(repoDir) {
	await runGit(repoDir, ["fetch", "origin"]);
	try {
		await runGit(repoDir, ["reset", "--hard", "@{u}"]);
	} catch {
		// No upstream configured (e.g. a detached or hand-made mirror):
		// fall back to the old fast-forward pull, which errors loudly
		// when there is truly nothing to update from.
		await runGit(repoDir, ["pull", "--ff-only"]);
	}
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
 * MARK: refreshWorktreeToRemote
 * @description Re-syncs a reused per-task worktree to the remote branch:
 *   fetches the origin and force-checkouts `branch` at `origin/branch` so
 *   a rerun never executes stale code left behind by a dead run. Only
 *   unpushed residue can be lost — stage work is committed and pushed per
 *   stage, and the refresh runs before the harness starts. When the remote
 *   branch does not exist yet (nothing pushed), the local branch is simply
 *   checked out as-is.
 * @example await refreshWorktreeToRemote('/w/kb-t1', 'kb/t1')
 * @param {string} workdir - Task worktree directory.
 * @param {string} branch - Task branch (`kb/<taskId>`).
 * @returns {Promise<void>}
 ***/
export async function refreshWorktreeToRemote(workdir, branch) {
	await runGit(workdir, ["fetch", "origin"]);
	let remoteRef = true;
	try {
		await runGit(workdir, ["rev-parse", "--verify", `origin/${branch}`]);
	} catch {
		remoteRef = false;
	}
	if (remoteRef) {
		await runGit(workdir, ["checkout", "-f", "-B", branch, `origin/${branch}`]);
	} else {
		await runGit(workdir, ["checkout", "-f", branch]);
	}
}

/***
 * MARK: syncTaskDocs
 * @description Copies the task's docs folder (`docs/tasks/<id>`, including
 *   `assets/` such as reference screenshots) from the primary checkout into
 *   the per-task worktree. Prompt inputs (idea files, images) are written to
 *   the live task folder — outside the task branch — so a fresh worktree
 *   would otherwise hide them from the agent (9010e2e0 hit exactly this:
 *   the brief's image was missing). Existing worktree files the agent
 *   created are kept; incoming files overwrite by name.
 * @example await syncTaskDocs({ primaryCwd: '/repo', workdir: '/w/kb-t', taskId: 't1' }) => 3
 * @param {Object} opts - `{ primaryCwd, workdir, taskId }`.
 * @returns {Promise<number>} Number of files copied (0 when nothing to copy).
 ***/
export async function syncTaskDocs({ primaryCwd, workdir, taskId } = {}) {
	if (!primaryCwd || !workdir || !taskId) return 0;
	const src = path.join(primaryCwd, "docs", "tasks", taskId);
	const dest = path.join(workdir, "docs", "tasks", taskId);
	let entries;
	try {
		entries = fs.readdirSync(src, { withFileTypes: true });
	} catch {
		return 0;
	}
	if (!entries.length) return 0;
	fs.mkdirSync(dest, { recursive: true });
	let copied = 0;
	for (const entry of entries) {
		const from = path.join(src, entry.name);
		const to = path.join(dest, entry.name);
		try {
			const stat = fs.statSync(from);
			if (stat.isDirectory()) {
				fs.cpSync(from, to, { recursive: true });
				for (const f of walkFiles(to)) copied += 1;
			} else if (stat.isFile()) {
				fs.copyFileSync(from, to);
				copied += 1;
			}
		} catch {
			// Best-effort: one unreadable asset must not block the stage.
		}
	}
	return copied;
}

function walkFiles(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walkFiles(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/***
 * MARK: prepareWorkdir
 * @description Project load per the transport matrix (MigrationPlan §4):
 *   remote-backed clones the origin into the Runner mirror dir and pulls,
 *   grandfathered local-only adopts the repo path (no clone-from-origin,
 *   `no-remote`). Both modes then open a per-task worktree `kb-<taskId>`
 *   on branch `kb/<taskId>` (reused when a previous run left it behind;
 *   a reused clone-mode worktree is fetched and force-reset to
 *   `origin/kb/<taskId>` first so reruns never execute stale leftovers).
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
			await refreshMirror(repoDir);
		}
	} else {
		mode = "adopt";
		repoDir = localPath;
	}

	if (fs.existsSync(workdir)) {
		if (mode === "clone") {
			await refreshWorktreeToRemote(workdir, branch);
		}
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
