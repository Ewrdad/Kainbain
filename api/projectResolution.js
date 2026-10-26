/**
 * @description Factory over a projectStore that exposes project-id resolution
 *   helpers used by route handlers. Keeps api/index.js registration-only.
 * @param {Object} projectStore
 * @returns {Object} { resolveProjectId, requireProject, resolveAndGuardProject }
 */
export function createProjectResolvers(projectStore) {
	function resolveProjectId(requestedId) {
		if (requestedId) {
			return projectStore.getProject(requestedId) ? requestedId : null;
		}
		const active = projectStore.getActiveProject();
		return active ? active.id : null;
	}

	function requireProject(id, reply) {
		if (!id) {
			reply.status(404).send({ error: "Project not found" });
			return false;
		}
		return true;
	}

	function resolveAndGuardProject(requestedId, reply) {
		const id = resolveProjectId(requestedId);
		if (!requireProject(id, reply)) return null;
		return id;
	}

	return { resolveProjectId, requireProject, resolveAndGuardProject };
}
