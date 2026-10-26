/***
 * MARK: kickIfRunnable
 * @description Kicks the scheduler when a mutation just left a task runnable
 *   (`status === "in_stage"`), so create/resume/retry/approve/abort pick up
 *   within one debounce instead of one full interval. No-op otherwise.
 *   Never throws: a missing or throwing scheduler must not break a mutation.
 * @param {Object} [store] - The TaskStore.
 * @param {Object|null} [task] - The task that may have become runnable.
 * @returns {Object|null} The task, unchanged.
 ***/
export function kickIfRunnable(store, task) {
	try {
		if (task && task.status === "in_stage") {
			if (typeof store?.kickScheduler === "function") store.kickScheduler();
		}
	} catch {
		// A scheduler kick failure must not break the triggering mutation.
	}
	return task;
}
