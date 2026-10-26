/***
 * MARK: resolveFailureProject
 * @description Finds the project governing a failure decision: an explicit
 *   `opts.project` wins (unit-test seam), otherwise the task store's project
 *   lookup, otherwise undefined (global defaults apply).
 * @param {Object} taskStore - TaskStore instance.
 * @param {string} projectId
 * @example resolveFailureProject(store, "p1", { project }) => project
 * @param {Object} [opts]
 * @returns {Object|undefined}
 ***/
export function resolveFailureProject(taskStore, projectId, opts = {}) {
	if (opts && typeof opts.project === "object" && opts.project !== null) {
		return opts.project;
	}
	try {
		return taskStore?.projectStore?.getProject?.(projectId) || undefined;
	} catch {
		return undefined;
	}
}
