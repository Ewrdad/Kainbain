import {
	isRetryStuck,
} from "../../../shared/taskRetryState.js";

/***
 * MARK: reconcileDueRetries
 * @description Startup-recovery pass for orphaned retry arms: a retry armed
 *   while the scheduler was stopped (or lost to a crash/restart) leaves
 *   `retryState === "scheduled"` with a `nextRetryAt` deadline but no live
 *   timer. Retries whose deadline is only just past are left alone — the
 *   normal tick picks them up because they stay `in_stage` and runnable.
 *   Retries overdue beyond the stuck grace window (`isRetryStuck`) can never
 *   run again, so they park as `failed`/`exhausted` with the last error
 *   preserved instead of rendering `RETRYING` forever. Idempotent: a second
 *   pass finds nothing to do. Never rejects: one unreadable task never
 *   blocks the rest of the pass — or boot.
 * @param {Object} store - TaskStore (projectStore.listProjects, listTasks, _saveTaskMarkdown).
 * @param {number} [nowMs] - Injectable clock (deterministic tests; default `Date.now()`).
 * @returns {Array<Object>} `[{ projectId, taskId }]` parked by this pass.
 * @example reconcileDueRetries(store) => []
 ***/
export function reconcileDueRetries(store, nowMs = Date.now()) {
	const reconciled = [];
	const projects =
		store?.projectStore && typeof store.projectStore.listProjects === "function"
			? store.projectStore.listProjects()
			: [];
	for (const project of projects) {
		let tasks;
		try {
			tasks = store.listTasks(project.id, project.cwd);
		} catch {
			continue;
		}
		for (const task of tasks) {
			try {
				if (!task || task.retryState !== "scheduled") continue;
				if (!isRetryStuck(task, nowMs)) continue;
				task.retryState = "exhausted";
				task.autoRetrying = false;
				task.nextRetryAt = null;
				task.retryScheduledInStandby = false;
				if (task.status === "in_stage") task.status = "failed";
				task.updatedAt = new Date(nowMs).toISOString();
				if (!Array.isArray(task.history)) task.history = [];
				task.history.push({
					timestamp: new Date(nowMs).toISOString(),
					action:
						"Retry deadline passed while the engine was stopped; parked as failed instead of retrying forever — use retry to run again",
				});
				try {
					store._saveTaskMarkdown?.(project.cwd, task);
				} catch {
					// Persistence is best-effort; the park already happened.
				}
				reconciled.push({ projectId: project.id, taskId: task.id });
			} catch {
				// One unreadable task never blocks the rest of the pass.
				continue;
			}
		}
	}
	return reconciled;
}
