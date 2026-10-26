/***
 * MARK: Task Workspace Isolation
 * @description Workspace isolation management for tasks. Supports scoped
 *   artifact quarantine (default) and opt-in per-task git worktrees.
 ***/

import fs from "node:fs";
import path from "node:path";
import { git } from "../git.js";
import {
	DEFAULT_KAINBAIN_DIR_NAME,
	kainbainProjectFor,
	resolveQuarantineDir,
	resolveWorktreesDir,
} from "../kainbainDir.js";

export const WORKTREE_BASE_DIR = path.join(DEFAULT_KAINBAIN_DIR_NAME, "worktrees");

/***
 * MARK: worktreesBaseFor
 * @description The task-worktrees base directory for a checkout, honouring
 *   the project's custom state folder. Falls back to the `.kainbain`
 *   default when no project record is available.
 * @example worktreesBaseFor('/repo', { kainbainDirName: '.kb' }) => '/repo/.kb/worktrees'
 * @param {string} projectCwd
 * @param {Object} [project]
 * @returns {string}
 * @private
 ***/
export function worktreesBaseFor(projectCwd, project) {
	return (
		resolveWorktreesDir(projectCwd, project) ||
		path.join(path.resolve(projectCwd), WORKTREE_BASE_DIR)
	);
}

/***
 * MARK: quarantineDirFor
 * @description The task-quarantine directory for a checkout, honouring the
 *   project's custom state folder. Falls back to the `.kainbain` default
 *   when no project record is available.
 * @example quarantineDirFor('/repo', {}) => '/repo/.kainbain/quarantine'
 * @param {string} projectCwd
 * @param {Object} [project]
 * @returns {string}
 * @private
 ***/
export function quarantineDirFor(projectCwd, project) {
	return (
		resolveQuarantineDir(projectCwd, project) ||
		path.join(path.resolve(projectCwd), DEFAULT_KAINBAIN_DIR_NAME, "quarantine")
	);
}

/***
 * MARK: workspaceProjectFor
 * @description Best-effort project record lookup for workspace path
 *   resolution: an explicit record wins, then the store's linked
 *   ProjectStore, then the `.kainbain` default (null record).
 * @example workspaceProjectFor(store, 'p1', null) => { id: 'p1' }
 * @param {Object} [store] - TaskStore or ProjectStore instance.
 * @param {string} [projectId]
 * @param {Object} [explicit] - Explicit project record (wins when given).
 * @returns {Object|null}
 ***/
export function workspaceProjectFor(store, projectId, explicit) {
	if (explicit && typeof explicit === "object") return explicit;
	return kainbainProjectFor(store, projectId);
}

/***
 * MARK: resolveProjectCwdForStore
 * @description Resolves the working directory for a project without falling
 *   back to `process.cwd()`. An explicit cwd wins, then the linked
 *   ProjectStore's record. Never throws: an unresolvable or invalid cwd
 *   degrades to `null` so the caller can defer or park instead of crashing
 *   the scheduler mid-tick.
 * @example resolveProjectCwdForStore(store, 'proj-1', '/custom/cwd') => '/custom/cwd'
 * @example resolveProjectCwdForStore(store, 'unknown-proj') => null
 * @param {Object} [store] - TaskStore (or any holder with an optional linked ProjectStore).
 * @param {string} projectId
 * @param {string} [explicitCwd]
 * @returns {string|null}
 ***/
export { resolveProjectCwd as resolveProjectCwdForStore } from './resolveProjectCwd.js';

/***
 * MARK: repairDocsLinkAfterSwitch
 * @description Re-verifies a project's `<cwd>/docs` symlink ahead of a
 *   task save, recreating a missing link (or repointing a dangling one)
 *   before the write lands. A branch checkout may have removed the
 *   `<cwd>/docs` symlink (old kb/* branches still track it while master
 *   ignores it); saving without the link would cement a one-task shadow
 *   directory that hides every other task from the UI. The single seam
 *   every engine save passes through, so the check runs on every save at
 *   negligible cost and silently no-ops when the link is healthy or no
 *   notes space exists. Never throws: link verification must not fail a save.
 * @example repairDocsLinkAfterSwitch(store, 'proj-1', '/repo') => { state: 'ok', ... } | null
 * @param {Object} [store] - TaskStore (or any holder with an optional linked ProjectStore).
 * @param {string} projectId
 * @param {string} [projectCwd]
 * @returns {Object|null} The `ensureDocsLink` result, or null when the project or link cannot be resolved.
 ***/
export { repairDocsLink as repairDocsLinkAfterSwitch } from './repairDocsLink.js';

/***
 * MARK: QUARANTINE_DIR
 * @description Designated drop zone for task-scoped scratch artifacts in the
 *   default quarantine isolation mode. Lives under `.kainbain/` (covered by
 *   DEFAULT_IGNORED_PATHS), so files staged here never enter the
 *   working-tree cleanliness guard and stray sibling artifacts cannot block
 *   other tasks' branch switches.
 ***/
export const QUARANTINE_DIR = path.join(DEFAULT_KAINBAIN_DIR_NAME, "quarantine");

/***
 * MARK: resolveTaskCwd
 * @description Resolves the working directory for a task. If workspaceIsolation
 *   is 'worktree' for the project, provisions/resolves the task's isolated
 *   worktree under `<projectCwd>/.kainbain/worktrees/<taskId>`.
 *   Otherwise returns the primary project.cwd.
 * @example await resolveTaskCwd(store, task, '/repo') => '/repo/.kainbain/worktrees/<taskId>'
 * @param {Object} store - TaskStore or ProjectStore instance.
 * @param {Object} task - The task entity.
 * @param {string} [projectCwd] - Base project working directory.
 * @param {Object} [opts]
 * @param {boolean} [opts.ensure=false] - Whether to provision the worktree if missing.
 * @returns {Promise<string|null>}
 ***/
export async function resolveTaskCwd(store, task, projectCwd, opts = {}) {
	const fallbackCwd = projectCwd ? path.resolve(projectCwd) : null;
	if (!task) {
		return store?._resolveProjectCwd?.(null, projectCwd) || fallbackCwd;
	}
	const baseCwd = store?._resolveProjectCwd
		? store._resolveProjectCwd(task.projectId, projectCwd)
		: fallbackCwd;
	if (!baseCwd) return null;

	const project = workspaceProjectFor(store, task.projectId, opts.project);
	if (project?.workspaceIsolation !== "worktree") {
		return baseCwd;
	}

	const worktreeDir = path.join(
		worktreesBaseFor(baseCwd, project),
		String(task.id),
	);
	if (opts.ensure) {
		const branch = task.branch || `kb/${task.id}`;
		// `project` already carries the explicit hint when one was given
		// (workspaceProjectFor prefers it), so the worktree base resolves
		// under the project's custom state folder, not the `.kainbain` default.
		await ensureTaskWorktree(baseCwd, task, branch, {
			...opts,
			project,
		});
	}
	if (fs.existsSync(worktreeDir)) {
		return worktreeDir;
	}
	return baseCwd;
}

/***
 * MARK: ensureTaskWorktree
 * @description Provisions a git worktree for a task branch. Idempotent.
 * @example await ensureTaskWorktree('/repo', task, 'kb/task-1') => '/repo/.kainbain/worktrees/task-1'
 * @param {string} projectCwd
 * @param {Object} task
 * @param {string} branch
 * @param {Object} [opts]
 * @returns {Promise<string>}
 ***/
export async function ensureTaskWorktree(projectCwd, task, branch, opts = {}) {
	const taskId = String(task?.id || "");
	const worktreeDir = path.join(
		worktreesBaseFor(projectCwd, opts.project),
		taskId,
	);
	if (fs.existsSync(worktreeDir)) {
		return worktreeDir;
	}
	await fs.promises.mkdir(path.dirname(worktreeDir), { recursive: true });
	try {
		await git(projectCwd, ["worktree", "add", worktreeDir, branch]);
	} catch (err) {
		// If branch is not yet created, create with -b from current base
		try {
			await git(projectCwd, ["worktree", "add", "-b", branch, worktreeDir]);
		} catch (bErr) {
			if (!fs.existsSync(worktreeDir)) {
				throw new Error(
					`Failed to provision worktree for task '${taskId}' on branch '${branch}': ${bErr?.message || bErr}`,
				);
			}
		}
	}
	return worktreeDir;
}

/***
 * MARK: removeTaskWorktree
 * @description Removes a task's git worktree with cleanup guarantees.
 * @example await removeTaskWorktree('/repo', 'task-1') => true
 * @param {string} projectCwd
 * @param {string} taskId
 * @param {Object} [opts]
 * @returns {Promise<boolean>}
 ***/
export async function removeTaskWorktree(projectCwd, taskId, opts = {}) {
	const worktreeDir = path.join(
		worktreesBaseFor(projectCwd, opts.project),
		String(taskId),
	);
	if (!fs.existsSync(worktreeDir)) return false;
	try {
		await git(projectCwd, ["worktree", "remove", "--force", worktreeDir]);
	} catch {
		// Best effort filesystem removal if git worktree command failed
		try {
			await fs.promises.rm(worktreeDir, { recursive: true, force: true });
		} catch {
			// Swallow
		}
	}
	return true;
}

/***
 * MARK: reapOrphanedWorktrees
 * @description Removes worktrees for terminal or deleted tasks on startup.
 * @example await reapOrphanedWorktrees('/repo', new Set(['active-task-1'])) => ['orphaned-task-2']
 * @param {string} projectCwd
 * @param {Set<string>|Array<string>} [activeTaskIds]
 * @returns {Promise<Array<string>>} List of reaped task IDs.
 ***/
export async function reapOrphanedWorktrees(
	projectCwd,
	activeTaskIds = new Set(),
	opts = {},
) {
	const baseDir = worktreesBaseFor(projectCwd, opts.project);
	if (!fs.existsSync(baseDir)) return [];
	const activeSet = activeTaskIds instanceof Set ? activeTaskIds : new Set(activeTaskIds || []);
	const reaped = [];
	try {
		const entries = await fs.promises.readdir(baseDir);
		for (const entry of entries) {
			if (!activeSet.has(entry)) {
				const fullPath = path.join(baseDir, entry);
				try {
					await git(projectCwd, ["worktree", "remove", "--force", fullPath]);
				} catch {
					await fs.promises.rm(fullPath, { recursive: true, force: true }).catch(() => {});
				}
				reaped.push(entry);
			}
		}
	} catch {
		// Best-effort
	}
	return reaped;
}
