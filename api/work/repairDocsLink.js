/***
 * MARK: repairDocsLink
 * @description Re-verifies a project's `<cwd>/docs` symlink ahead of a task
 *   save, recreating a missing link (or repointing a dangling one) before
 *   the write lands. A branch checkout may have removed the `<cwd>/docs`
 *   symlink; saving without the link would cement a one-task shadow
 *   directory. The single seam every engine save passes through. Never
 *   throws: link verification must not fail a save.
 * @example repairDocsLink(store, 'proj-1', '/repo') => { state: 'ok', ... } | null
 * @param {Object} [store] - TaskStore (or any holder with an optional linked ProjectStore).
 * @param {string} projectId
 * @param {string} [projectCwd]
 * @returns {Object|null} The `ensureDocsLink` result, or null when unresolvable.
 ***/
import { resolveProjectCwd } from './resolveProjectCwd.js';

export function repairDocsLink(store, projectId, projectCwd) {
	try {
		const projectStore = store?.projectStore;
		if (!projectStore || typeof projectStore.ensureDocsLink !== 'function')
			return null;
		const project =
			typeof projectStore.getProject === 'function'
				? projectStore.getProject(projectId)
				: null;
		const cwd = resolveProjectCwd(store, projectId, projectCwd);
		if (!project || !cwd) return null;
		return projectStore.ensureDocsLink({ ...project, cwd });
	} catch {
		return null;
	}
}
