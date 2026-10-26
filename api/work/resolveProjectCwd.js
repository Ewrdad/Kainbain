/***
 * MARK: resolveProjectCwd
 * @description Resolves the working directory for a project without falling
 *   back to `process.cwd()`. An explicit cwd wins, then the linked
 *   ProjectStore's record. Never throws: an unresolvable or invalid cwd
 *   degrades to `null` so the caller can defer or park instead of crashing
 *   the scheduler mid-tick.
 * @example resolveProjectCwd(store, 'proj-1', '/custom/cwd') => '/custom/cwd'
 * @example resolveProjectCwd(store, 'unknown-proj') => null
 * @param {Object} [store] - TaskStore (or any holder with an optional linked ProjectStore).
 * @param {string} projectId
 * @param {string} [explicitCwd]
 * @returns {string|null}
 ***/
import path from 'node:path';

export function resolveProjectCwd(store, projectId, explicitCwd) {
	if (explicitCwd && typeof explicitCwd === 'string' && explicitCwd.trim()) {
		try {
			return path.resolve(explicitCwd);
		} catch {
			return null;
		}
	}
	const projectStore = store?.projectStore;
	if (projectStore && typeof projectStore.getProject === 'function') {
		try {
			const project = projectStore.getProject(projectId);
			if (project?.cwd && typeof project.cwd === 'string' && project.cwd.trim()) {
				return path.resolve(project.cwd);
			}
		} catch {
			return null;
		}
	}
	return null;
}
