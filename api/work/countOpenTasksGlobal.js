/***
 * MARK: countOpenTasksGlobal
 * @description Counts open tasks (status neither `completed` nor `done` —
 * the same rule as the frontend `isTaskCompleted`) across ALL projects.
 * Deliberately iterates only the in-memory maps: a state READ must never
 * mutate the cache, and `listTasks` triggers a disk rescan that overwrites
 * live in-flight statuses (e.g. a `running_agent` set after the last disk
 * write). The server scans projects at startup and the scheduler scans per
 * tick, so the maps converge on their own; the depth reports the server's
 * known state, never a fabricated number. Never throws: an unreadable map
 * contributes zero instead of breaking a state read.
 * @example countOpenTasksGlobal(store) => 3
 * @param {Object} [store] - The TaskStore (read-only use).
 * @returns {number} The global open-task count.
 ***/
export function countOpenTasksGlobal(store) {
	const isOpen = (task) =>
		task != null && task.status !== "completed" && task.status !== "done";
	let depth = 0;
	try {
		for (const map of store.tasksByProject?.values?.() || []) {
			for (const task of map?.values?.() || []) {
				if (isOpen(task)) depth += 1;
			}
		}
	} catch {
		// Best-effort derivation; the caller omits the depth on failure.
	}
	return depth;
}
