import path from "node:path";
import { resolveWorktreesDir } from "../kainbainDir.js";
import { WORKTREE_BASE_DIR } from "./taskWorkspace.js";

/***
 * MARK: resolveTaskWorkingLocation
 * @description Answers "where is task X working" for developers editing
 *   alongside KainBain: the task branch, the project's workspace-isolation
 *   mode, and the worktree path when worktree isolation is on (`null`
 *   otherwise — quarantine/off modes share the primary checkout, so there
 *   is no per-task directory). Read-only and additive: powers the
 *   `workingLocation` field on `GET /tasks/:id` (see
 *   `registerTaskWorkRoutes`), and mirrors the frontend fallback in
 *   `getTaskBranchName` for the branch default. A `null` branch means the
 *   project does not use per-task branches, so the task works on the
 *   primary checkout.
 * @example resolveTaskWorkingLocation({ id: 't-1' }, {}) => { branch: 'kb/t-1', workspaceIsolation: 'quarantine', worktreePath: null }
 * @param {Object} task - The task entity (id and optional persisted branch).
 * @param {Object} [opts]
 * @param {Object} [opts.project] - Project record (`useBranches`, `workspaceIsolation`, `kainbainDirName`).
 * @param {string} [opts.projectCwd] - Primary checkout path (worktree paths resolve under it).
 * @returns {{ branch: string|null, workspaceIsolation: string, worktreePath: string|null }}
 ***/
export function resolveTaskWorkingLocation(
	task,
	{ project = null, projectCwd = null } = {},
) {
	const persisted =
		task?.branch && typeof task.branch === "string" ? task.branch : null;
	// Without a persisted branch the task works on `kb/<id>` — but only when
	// the project actually uses per-task branches. A project record that opts
	// out of branches means the primary checkout, so report `null` instead of
	// a branch name the task will never check out. No project record means
	// "unknown": keep the historical `kb/<id>` default.
	const branch =
		persisted ||
		(project && project.useBranches !== true
			? null
			: task?.id
				? `kb/${task.id}`
				: null);
	const workspaceIsolation =
		project?.workspaceIsolation === "worktree" ||
		project?.workspaceIsolation === "off"
			? project.workspaceIsolation
			: "quarantine";
	let worktreePath = null;
	if (workspaceIsolation === "worktree" && task?.id && projectCwd) {
		const base =
			resolveWorktreesDir(projectCwd, project) ||
			path.join(path.resolve(projectCwd), WORKTREE_BASE_DIR);
		worktreePath = path.join(base, String(task.id));
	}
	return { branch, workspaceIsolation, worktreePath };
}
