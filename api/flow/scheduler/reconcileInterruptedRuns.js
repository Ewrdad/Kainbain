import { ORPHANED_RUNNING_STATUSES } from './orphanedRunningStatuses.js';

/***
 * MARK: reconcileInterruptedRuns
 * @description Reconciles tasks stuck in a live running_* status with no
 *   engine owner (e.g. after a server restart): transitions them to
 *   'interrupted'. Covers every running variant the executors can leave
 *   behind (running_agent/ci/merge, advancing) plus the legacy
 *   `running_deploy` label kept so pre-migration task records still
 *   reconcile; the disk-load path (parseTaskMarkdown) applies the same
 *   rule, so both reads agree. The engine owner's live status is never
 *   touched. Status-label-only and idempotent: a second pass finds
 *   nothing to do. Fails safe at every level — a project list, project,
 *   or task that cannot be read degrades to "skipped" for that scope
 *   only, so one corrupt record can never block the rest of the pass or
 *   boot; the worst case is an orphan left for the operator, never a
 *   thrown error.
 * @example reconcileInterruptedRuns(store) => [{ projectId, taskId }]
 ***/
export function reconcileInterruptedRuns(store) {
	// Fail-safe: a store whose project list cannot be read (or is not an
	// array) reconciles nothing instead of throwing — boot calls this and
	// must survive any store shape.
	let projects = [];
	try {
		projects =
			store.projectStore && typeof store.projectStore.listProjects === "function"
				? store.projectStore.listProjects()
				: [];
	} catch {
		projects = [];
	}
	if (!Array.isArray(projects)) projects = [];
	const reconciled = [];

	for (const project of projects) {
		let tasks;
		try {
			tasks = store.listTasks(project.id, project.cwd);
		} catch {
			continue;
		}
		// Fail-safe: a non-array task list skips only this project, never
		// the projects after it.
		if (!Array.isArray(tasks)) continue;
		for (const task of tasks) {
			// Fail-safe: one unreadable or unpersistable task must never block
			// the rest of the pass — or boot, when called from startup
			// recovery. The failure is recorded in history and reconciliation
			// continues with the next task.
			try {
				// The engine owner's live task is recognised by a real id match
				// only: a record without an id can never be the active task, so
				// it still reconciles (fail towards "interrupted", never towards
				// a stuck running_*).
				const isEngineOwnedTask =
					task?.id != null && store.engineState?.activeTaskId === task.id;
				if (ORPHANED_RUNNING_STATUSES.has(task?.status) && !isEngineOwnedTask) {
					task.status = "interrupted";
					task.wasInterrupted = true;
					task.updatedAt = new Date().toISOString();
					// Best-effort persistence: a store without markdown/history
					// helpers (tests, partial seams) still reconciles the
					// status — the flip is what recovery depends on.
					try {
						store._recordHistory?.(
							task,
							"Stage execution interrupted by server restart",
							task.updatedAt,
						);
					} catch {
						// History is best-effort; the flip already happened.
					}
					try {
						store._saveTaskMarkdown?.(project.cwd, task);
					} catch {
						// Persistence is best-effort; the flip already happened.
					}
					reconciled.push({ projectId: project.id, taskId: task.id });
				}
			} catch (taskError) {
				try {
					store._recordHistory?.(
						task,
						`Run reconciliation skipped: ${taskError?.message || taskError}`,
						new Date().toISOString(),
					);
				} catch {
					// History write is best-effort; reconciliation continues.
				}
			}
		}
	}

	return reconciled;
}
