/**
 * @description Factory over a projectStore that exposes project-id resolution
 *   helpers used by route handlers. Keeps api/index.js registration-only.
 *   Two flavors: the fallback resolvers (view routes may keep defaulting to
 *   the active project) and the required resolvers (every runner-mutating
 *   route must name its project explicitly — missing/blank is a 400, never
 *   the active project, so a stale or replayed lease can never write into a
 *   project it does not name; WP1 tenant fence, AUDIT H-1).
 * @param {Object} projectStore
 * @returns {Object} { resolveProjectId, requireProject, resolveAndGuardProject, resolveRequiredProjectId, resolveAndGuardRequiredProject }
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

	function resolveRequiredProjectId(requestedId) {
		const trimmed =
			typeof requestedId === "string" ? requestedId.trim() : "";
		if (!trimmed) return null;
		return projectStore.getProject(trimmed) ? trimmed : null;
	}

	function resolveAndGuardRequiredProject(requestedId, reply) {
		const trimmed =
			typeof requestedId === "string" ? requestedId.trim() : "";
		if (!trimmed) {
			reply
				.status(400)
				.send({
					error:
						"projectId is required — runner writes never fall back to the active project.",
					code: "MISSING_PROJECT_ID",
				});
			return null;
		}
		const id = resolveRequiredProjectId(trimmed);
		if (!requireProject(id, reply)) return null;
		return id;
	}

	function resolveAndGuardPresentProject(requestedId, reply) {
		// Presence-only variant for scope-keyed routes (the integration
		// acquire/heartbeat/report routes): a blank projectId is a 400, but
		// an unknown-but-present scope string passes through — the
		// integration queue owns unknown scopes with leased:false/STALE
		// semantics (legacy behavior), and its exact-match scope key is
		// already the tenant boundary, so no existence check is needed.
		const trimmed =
			typeof requestedId === "string" ? requestedId.trim() : "";
		if (!trimmed) {
			reply
				.status(400)
				.send({
					error:
						"projectId is required — runner writes never fall back to the active project.",
					code: "MISSING_PROJECT_ID",
				});
			return null;
		}
		return trimmed;
	}

	return {
		resolveProjectId,
		requireProject,
		resolveAndGuardProject,
		resolveRequiredProjectId,
		resolveAndGuardRequiredProject,
		resolveAndGuardPresentProject,
	};
}
