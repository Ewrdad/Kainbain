// Domain: The Work — task creation, querying, updating, deleting, dependency checking, and scanning.
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { v4 as uuidv4 } from "uuid";
import { _sanitizeTaskTitle } from "./taskIdentity.js";
import { safeParseJsonArray } from "./taskFiles.js";
import { taskBranchName } from "./taskBranches.js";
import {
	_appendProcessLog,
	_logEntriesForFeed,
	renderLogEntriesText,
} from "../watch/index.js";
import { resolveStageLabel } from "../flow/index.js";
import { normalizeStageType } from "../projectStore.js";
import {
	docsProjectFor,
	resolveTaskDocsDir,
	resolveTasksDir,
} from "../docsPath.js";
import { kainbainProjectFor } from "../kainbainDir.js";
import { worktreesBaseFor } from "./taskWorkspace.js";

/***
 * MARK: scanTasks
 * @description Scans `<projectRoot>/docs/tasks/` on startup or project load and rehydrates tasks into memory cache from `task.md`.
 ***/
export function scanTasks(store, projectId, projectCwd) {
	const baseDir = store._resolveProjectCwd(projectId, projectCwd);
	const map = store._getMap(projectId);
	store.scannedProjects.add(projectId);
	if (!baseDir) return Array.from(map.values());

	const tasksDir =
		resolveTasksDir(baseDir, docsProjectFor(store, projectId)) ||
		path.join(baseDir, "docs", "tasks");
	/* eslint-disable security/detect-non-literal-fs-filename */
	try {
		if (!fs.existsSync(tasksDir)) {
			return Array.from(map.values());
		}

		const entries = fs.readdirSync(tasksDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const taskId = entry.name;
			const taskFolder = path.join(tasksDir, taskId);
			const taskMdFile = path.join(taskFolder, "task.md");

			let task = map.get(taskId);
			if (fs.existsSync(taskMdFile)) {
				const mdContent = fs.readFileSync(taskMdFile, "utf8");
				const parsed = store._parseTaskMarkdown(mdContent, taskId, projectId);
				if (task) {
					Object.assign(task, parsed);
				} else {
					task = parsed;
					map.set(taskId, task);
				}
			}

			if (task) {
				if (store._isBranchModeEnabled(projectId) && !task.branch) {
					task.branch = taskBranchName(task.id);
					store._saveTaskMarkdown(baseDir, task);
				}
				if (task.wasInterrupted && task.status === "interrupted") {
					store._saveTaskMarkdown(baseDir, task);
				}
				store._syncTaskReports(projectId, task, projectCwd);
			}
		}
	} catch (err) {
		// Directory read error fallback
	}
	/* eslint-enable security/detect-non-literal-fs-filename */

	// Startup hygiene: reap orphaned isolated worktrees (terminal or deleted
	// tasks) so crashed runs never accumulate stale checkouts. Best-effort
	// and silent — a scan must never fail on git.
	reapOrphanedWorktreesSync(baseDir, map, {
		project: kainbainProjectFor(store, projectId),
	});

	return Array.from(map.values());
}

/***
 * MARK: reapOrphanedWorktreesSync
 * @description Startup-scan counterpart of the async `reapOrphanedWorktrees`:
 *   removes isolated worktree dirs whose task is missing from the registry
 *   or sits in a reapable terminal status (see WORKTREE_REAPABLE_STATUSES).
 *   Active and failed tasks keep their trees (failed stays inspectable;
 *   resume re-provisions a missing tree anyway). Never throws.
 * @example reapOrphanedWorktreesSync('/repo', taskMap) => ['orphaned-task-2']
 * @param {string} baseDir - Primary project checkout.
 * @param {Map} taskMap - Task registry map (id → task).
 * @param {Object} [opts]
 * @param {Object} [opts.project] - Project record carrying `kainbainDirName`.
 * @returns {Array<string>} Reaped task ids.
 ***/
export function reapOrphanedWorktreesSync(baseDir, taskMap, opts = {}) {
	const reaped = [];
	try {
		if (!baseDir) return reaped;
		const worktreesBase = worktreesBaseFor(baseDir, opts.project);
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- worktree base derived from the engine-resolved project checkout */
		if (!fs.existsSync(worktreesBase)) return reaped;
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- worktree base derived from the engine-resolved project checkout */
		const entries = fs.readdirSync(worktreesBase, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const taskId = entry.name;
			const task = taskMap?.get?.(taskId);
			const status = String(task?.status || "").toLowerCase();
			if (task && !WORKTREE_REAPABLE_STATUSES.has(status)) continue;
			if (removeTaskWorktreeSync(baseDir, taskId, opts)) reaped.push(taskId);
		}
	} catch {
		// Best-effort startup hygiene only.
	}
	return reaped;
}

/***
 * MARK: parseBlockedByValue
 * @description Normalizes a blockedBy input (string array, JSON string, or
 * comma-separated string) into a deduplicated array of task id strings.
 * @example parseBlockedByValue(["b", "a", "b"]) => ["b", "a"]
 ***/
export function parseBlockedByValue(blockedBy) {
	let parsed = [];
	if (Array.isArray(blockedBy)) {
		parsed = blockedBy.map(String).filter(Boolean);
	} else if (typeof blockedBy === "string" && blockedBy.trim()) {
		const trimmed = blockedBy.trim();
		parsed =
			trimmed.startsWith("[") && trimmed.endsWith("]")
				? safeParseJsonArray(trimmed)
				: trimmed
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean);
	}
	return [...new Set(parsed.map(String).filter(Boolean))];
}

/***
 * MARK: blockedByCreatesCycle
 * @description Checks whether giving a task a new blockedBy list would create a
 * dependency cycle (the task reachable from its own blockers). Evaluated
 * against the post-update graph so edits are rejected before they deadlock.
 * @example blockedByCreatesCycle(map, "a", ["b"]) => false
 ***/
export function blockedByCreatesCycle(map, taskId, nextBlockedBy) {
	const visit = (currentId, seen) => {
		if (String(currentId) === String(taskId)) return true;
		if (seen.has(String(currentId))) return false;
		seen.add(String(currentId));
		const current = map.get(String(currentId));
		const deps =
			String(currentId) === String(taskId) ? nextBlockedBy : current?.blockedBy;
		if (!Array.isArray(deps)) return false;
		return deps.some((dep) => visit(String(dep), seen));
	};
	return (nextBlockedBy || []).some((dep) => visit(String(dep), new Set()));
}

/***
 * MARK: validateBlockedBy
 * @description Rejects a blockedBy edit that would deadlock or silently
 * mistarget the queue: self-references, ids unknown in this project, and
 * edits that would create a dependency cycle. Throws a plain Error whose
 * message the routes surface as HTTP 400. Fail-closed on purpose so audit
 * agents never get a silent success for a mistyped blocker.
 * @example validateBlockedBy(map, "a", ["b"]) => undefined (valid)
 ***/
export function validateBlockedBy(map, taskId, blockedBy) {
	const ids = Array.isArray(blockedBy) ? blockedBy : [];
	for (const depId of ids) {
		if (String(depId) === String(taskId)) {
			throw new Error("Task cannot block itself");
		}
	}
	for (const depId of ids) {
		if (!map.has(String(depId))) {
			throw new Error(`Unknown task ID in blockedBy: ${depId}`);
		}
	}
	if (blockedByCreatesCycle(map, taskId, ids)) {
		throw new Error("blockedBy would create a dependency cycle");
	}
}

/***
 * MARK: createTask
 * @description Creates a discrete task instance, saves it to `<projectRoot>/docs/tasks/<taskId>/task.md`,
 * records workflowId, and uses an in-flight / idempotency lock to prevent duplicate creations.
 ***/
export function createTask(
	store,
	projectId,
	{
		title,
		goal,
		stageId,
		status = "in_stage",
		workflowId,
		idempotencyKey,
		blockedBy = [],
		projectCwd,
	} = {},
) {
	const now = new Date().toISOString();
	const nowMs = Date.now();
	const taskTitle = _sanitizeTaskTitle(
		title || (goal ? goal.slice(0, 60) : "Untitled task"),
	);
	const taskGoal = goal || taskTitle || "Untitled task";
	const resolvedStageId = stageId || null;

	let resolvedWorkflowId = workflowId;
	if (
		!resolvedWorkflowId &&
		store.projectStore &&
		typeof store.projectStore.getProject === "function"
	) {
		const proj = store.projectStore.getProject(projectId);
		resolvedWorkflowId = proj?.activeWorkflowId || "wf-default";
	}
	if (!resolvedWorkflowId) resolvedWorkflowId = "wf-default";

	// Deduplication check: key-based or (title + goal + stageId) window
	const dedupeKey =
		idempotencyKey ||
		`${projectId}::${resolvedWorkflowId}::${resolvedStageId || ""}::${taskTitle.trim()}::${taskGoal.trim()}`;

	// Clean up old dedupe cache entries (> 30s)
	for (const [k, v] of store.dedupeMap.entries()) {
		if (nowMs - v.timestamp > 30000) {
			store.dedupeMap.delete(k);
		}
	}

	if (store.dedupeMap.has(dedupeKey)) {
		const existingEntry = store.dedupeMap.get(dedupeKey);
		if (idempotencyKey || nowMs - existingEntry.timestamp < 2500) {
			return existingEntry.task;
		}
	}

	const parsedBlockedBy = parseBlockedByValue(blockedBy);

	const map = store._getMap(projectId);
	const id = uuidv4();
	validateBlockedBy(map, id, parsedBlockedBy);

	let initialStatus = status;
	let resolvedStages = [];
	if (
		store.projectStore &&
		typeof store.projectStore.getProject === "function"
	) {
		const proj = store.projectStore.getProject(projectId);
		if (proj) {
			resolvedStages =
				store._resolveStagesForTask(proj, {
					workflowId: resolvedWorkflowId,
				}) || [];
		}
	}
	if (
		initialStatus === "in_stage" &&
		resolvedStageId &&
		resolvedStages.length > 0
	) {
		const currentStage = resolvedStages.find(
			(s) =>
				String(s.id) === String(resolvedStageId) ||
				(s.name &&
					String(s.name).toLowerCase() === String(resolvedStageId).toLowerCase()),
		);
		if (normalizeStageType(currentStage?.type) === "human") {
			initialStatus = "waiting_human";
		}
	}

	const task = {
		id,
		projectId,
		workflowId: resolvedWorkflowId,
		title: taskTitle,
		goal: taskGoal,
		body: taskGoal,
		prompt: "",
		currentStageId: resolvedStageId,
		status: initialStatus,
		blockedBy: parsedBlockedBy,
		reports: [],
		createdAt: now,
		updatedAt: now,
		enteredStageAt: now,
		timeInStage: 0,
		history: [
			{
				timestamp: now,
				action: resolvedStageId
					? `Created and placed in stage '${resolveStageLabel(resolvedStageId, resolvedStages)}'`
					: "Created",
			},
		],
		timeline: [],
		stats: {},
		outputReport: "",
		logEntries: [],
		keywords: [],
		feedback: null,
	};

	if (store._isBranchModeEnabled(projectId)) {
		task.branch = taskBranchName(id);
		// Provision at creation: consumers of a fresh task (PR-review pages,
		// canary suites, operators auditing `task.branch`) expect the branch
		// to materialize right after create, matching the engine branch
		// contract ("task creation provisions kb/<taskId>"). This runs
		// OUTSIDE the execution queue, but every git op it makes goes through
		// the per-repo mutex inside api/git.js's `git()`, so it serializes
		// with a concurrently running stage's branch ops instead of colliding
		// on `.git/index.lock` (the 2026-10-05 multi-task pile-up). Unawaited
		// on purpose (POST /tasks stays instant); a failure defers with a
		// warning — ensureTaskBranch stays non-throwing at the call site and
		// the first work-stage pickup (idempotent) still guarantees the
		// branch exists before any work stage.
		const branchCwd = store._resolveProjectCwd(projectId, projectCwd);
		if (branchCwd) {
			store.ensureTaskBranch(task, branchCwd).catch((e) => {
				task.branchProvisionError = e?.message || String(e);
				_appendProcessLog(
					task,
					`[WARN] Task branch provisioning deferred: ${e?.message || e}`,
				);
				task.history.push({
					timestamp: new Date().toISOString(),
					action: `Warning: branch provisioning deferred (${e?.message || e})`,
				});
				store._saveTaskMarkdown(branchCwd, task);
			});
		}
	}

	map.set(id, task);
	store.dedupeMap.set(dedupeKey, { task, timestamp: nowMs });

	store._saveTaskMarkdown(projectCwd, task);
	store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);

	return task;
}

/***
 * MARK: listTasks
 * @description Lists all discrete tasks for a project from memory cache, with optional workflow filtering.
 ***/
export function listTasks(store, projectId, projectCwd, workflowId) {
	if (!store.scannedProjects.has(projectId) && projectCwd) {
		scanTasks(store, projectId, projectCwd);
	}
	const tasks = Array.from(store._getMap(projectId).values());
	if (workflowId) {
		return tasks.filter((t) => t.workflowId === workflowId);
	}
	return tasks;
}

/***
 * MARK: getTasks
 * @description Returns tasks for a project strictly filtered by workflowId.
 ***/
export function getTasks(store, projectId, workflowId, projectCwd) {
	const tasks = listTasks(store, projectId, projectCwd);
	if (!workflowId) return tasks;
	return tasks.filter((t) => t.workflowId === workflowId);
}

/***
 * MARK: getTask
 * @description Retrieves a single task by its id.
 ***/
export function getTask(store, projectId, taskId) {
	return store._getMap(projectId).get(taskId);
}

/***
 * MARK: getTaskLogFeed
 * @description Returns one dedicated log feed for a task. `format: 'text'
 *   renders the feed's structured entries through the shared renderer
 *   (`renderLogEntriesText`) — a pure derived view; nothing is stored as text.
 ***/
export function getTaskLogFeed(
	store,
	projectId,
	taskId,
	{ feed = "main", format = "entries" } = {},
) {
	const task = getTask(store, projectId, taskId);
	if (!task) return null;
	const all = _logEntriesForFeed(task, feed);
	if (format === "text") {
		return { taskId, feed, format, text: renderLogEntriesText(all, { feed }) };
	}
	return { taskId, feed, format, entries: all };
}

/***
 * MARK: isTaskBlocked
 * @description Checks whether a task is blocked by unfinished prerequisite tasks.
 ***/
export function isTaskBlocked(store, projectId, taskId) {
	const task = getTask(store, projectId, taskId);
	if (!task || !Array.isArray(task.blockedBy) || task.blockedBy.length === 0) {
		return { blocked: false, blockers: [], hasCycle: false };
	}
	const map = store._getMap(projectId);
	const blockers = [];
	let hasCycle = false;

	const visited = new Set();
	const checkCycle = (currentId) => {
		if (visited.has(currentId)) {
			return currentId === taskId;
		}
		visited.add(currentId);
		const current = map.get(currentId);
		if (current && Array.isArray(current.blockedBy)) {
			for (const depId of current.blockedBy) {
				if (depId === taskId || checkCycle(depId)) {
					return true;
				}
			}
		}
		return false;
	};

	if (checkCycle(taskId)) {
		hasCycle = true;
	}

	for (const blockerId of task.blockedBy) {
		const blocker = map.get(blockerId);
		if (blocker && blocker.status !== "completed") {
			blockers.push(blocker.id);
		}
	}
	return {
		blocked: blockers.length > 0 || hasCycle,
		blockers,
		hasCycle,
	};
}

/***
 * MARK: updateTask
 * @description Updates a task's scalar fields, history, or status, touches updatedAt, and persists to disk.
 ***/
export function updateTask(store, projectId, taskId, updates, projectCwd) {
	const task = getTask(store, projectId, taskId);
	if (!task) return null;
	if (typeof updates.title === "string") {
		updates.title = _sanitizeTaskTitle(updates.title);
	}
	if (updates.blockedBy !== undefined) {
		const parsed = parseBlockedByValue(updates.blockedBy);
		validateBlockedBy(store._getMap(projectId), taskId, parsed);
		updates.blockedBy = parsed;
	}
	Object.assign(task, updates, { updatedAt: new Date().toISOString() });
	store._saveTaskMarkdown(projectCwd, task);
	return task;
}

/***
 * MARK: WORKTREE_REAPABLE_STATUSES
 * @description Task statuses whose isolated worktree may be reaped: the work
 *   already landed (or was deliberately abandoned), so no future stage needs
 *   the isolated tree. `failed` is deliberately excluded — a failed task may
 *   be retried or inspected, and resume re-provisions a missing worktree
 *   anyway (falling back to the primary checkout).
 ***/
export const WORKTREE_REAPABLE_STATUSES = new Set([
	"completed",
	"done",
	"cancelled",
]);

/***
 * MARK: removeTaskWorktreeSync
 * @description Best-effort synchronous removal of one task's isolated
 *   worktree (`git worktree remove --force`, falling back to a recursive
 *   delete + `git worktree prune`). Never throws: cleanup failures are
 *   invisible to the caller (the async `removeTaskWorktree` reports them
 *   instead). Sync by design — deletion and startup-scan paths are sync.
 * @example removeTaskWorktreeSync('/repo', 'task-1') => true
 * @param {string} baseDir - Primary project checkout.
 * @param {string} taskId - Task whose worktree to remove.
 * @param {Object} [opts]
 * @param {Object} [opts.project] - Project record carrying `kainbainDirName`.
 * @returns {boolean} True when a worktree dir existed (whether or not git agreed).
 ***/
export function removeTaskWorktreeSync(baseDir, taskId, opts = {}) {
	try {
		if (!baseDir || !taskId) return false;
		const worktreeDir = path.join(
			worktreesBaseFor(baseDir, opts.project),
			String(taskId),
		);
		/* eslint-disable security/detect-non-literal-fs-filename -- worktree dir derived from the engine-resolved project checkout + task id */
		if (!fs.existsSync(worktreeDir)) return false;
		try {
			execFileSync("git", ["worktree", "remove", "--force", worktreeDir], {
				cwd: baseDir,
				stdio: "ignore",
			});
		} catch {
			try {
				fs.rmSync(worktreeDir, { recursive: true, force: true });
			} catch {
				return false;
			}
			try {
				execFileSync("git", ["worktree", "prune"], {
					cwd: baseDir,
					stdio: "ignore",
				});
			} catch {
				// Prune is hygiene only; the dir itself is gone.
			}
		}
		return true;
	} catch {
		return false;
	}
}

/***
 * MARK: deleteTask
 * @description Removes a task from the project registry and deletes `<projectRoot>/docs/tasks/<taskId>` from disk.
 ***/
export function deleteTask(store, projectId, taskId, projectCwd) {
	const removed = store._getMap(projectId).delete(taskId);
	const baseDir = store._resolveProjectCwd(projectId, projectCwd);
	if (baseDir) {
		const taskDocsDir =
			resolveTaskDocsDir(baseDir, docsProjectFor(store, projectId), taskId) ||
			path.join(baseDir, "docs", "tasks", taskId);
		/* eslint-disable security/detect-non-literal-fs-filename */
		try {
			if (fs.existsSync(taskDocsDir)) {
				fs.rmSync(taskDocsDir, { recursive: true, force: true });
			}
		} catch (err) {
			// Cleanup error ignore
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
		// A deleted task never resumes: its isolated worktree (if any) goes
		// with it. Best-effort and silent — deletion must never fail on git.
		removeTaskWorktreeSync(baseDir, taskId, {
			project: kainbainProjectFor(store, projectId),
		});
	}
	store.eventBridge?.broadcastGlobal?.("TASK_DELETED", {
		projectId,
		taskId,
	});
	return removed;
}

/***
 * MARK: removeTask
 * @description Alias for deleteTask.
 ***/
export function removeTask(store, projectId, taskId, projectCwd) {
	return deleteTask(store, projectId, taskId, projectCwd);
}

/***
 * MARK: cancelProjectExecutions
 * @description Resets engine execution state and cancels pending task executions for a project upon compute stop.
 ***/
export function cancelProjectExecutions(store, projectId) {
	store.executionQueue.clear(projectId);
	// A queued clear never stops the job already running, so halt live runs
	// directly: kill their child process groups and park them as interrupted
	// (never silently back to in_stage) so resume/retry has a clean state.
	const cwd =
		typeof store._resolveProjectCwd === "function"
			? store._resolveProjectCwd(projectId)
			: null;
	const now = new Date().toISOString();
	try {
		const map =
			typeof store._getMap === "function" ? store._getMap(projectId) : null;
		for (const task of map?.values?.() || []) {
			if (!task || !String(task.status || "").startsWith("running_")) continue;
			try {
				store.killTaskProcess?.(task.id);
			} catch {
				// already gone
			}
			task.status = "interrupted";
			task.wasInterrupted = true;
			task.updatedAt = now;
			try {
				store._recordHistory?.(
					task,
					"Stage execution stopped with the engine",
					now,
				);
			} catch {
				// history is best-effort here
			}
			try {
				store._saveTaskMarkdown?.(cwd, task);
			} catch {
				// persistence is best-effort here
			}
			store.eventBridge?.broadcastGlobal?.("TASK_UPDATED", task);
		}
	} catch {
		// teardown must never fail the stop request
	}
	if (store.engineState.activeProjectId === projectId) {
		store.setEngineState({
			status: "idle",
			activeTaskId: null,
			activeProjectId: null,
			activeProjectName: null,
			activeStageId: null,
			activeStageName: null,
			activeStageType: null,
		});
	}
}

/***
 * MARK: clearProject
 * @description Clears all tasks for a project from memory and removes its docs/tasks folder from disk.
 ***/
export function clearProject(store, projectId, projectCwd) {
	cancelProjectExecutions(store, projectId);
	store.tasksByProject.delete(projectId);
	store.scannedProjects.add(projectId);
	store.dedupeMap.clear();
	const baseDir = store._resolveProjectCwd(projectId, projectCwd);
	if (baseDir) {
		const tasksDir =
			resolveTasksDir(baseDir, docsProjectFor(store, projectId)) ||
			path.join(baseDir, "docs", "tasks");
		/* eslint-disable security/detect-non-literal-fs-filename */
		try {
			if (fs.existsSync(tasksDir)) {
				fs.rmSync(tasksDir, { recursive: true, force: true });
			}
		} catch (err) {
			// Cleanup error ignore
		}
		/* eslint-enable security/detect-non-literal-fs-filename */
	}
}
