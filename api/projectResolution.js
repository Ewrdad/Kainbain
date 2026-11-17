/***
 * MARK: createProjectResolvers
 * @description Factory over a projectStore that exposes project-id resolution
 *   helpers used by route handlers. Keeps api/index.js registration-only.
 *   Two flavors: the fallback resolvers (view routes may keep defaulting to
 *   the active project) and the required resolvers (every runner-mutating
 *   route must name its project explicitly — missing/blank is a 400, never
 *   the active project, so a stale or replayed lease can never write into a
 *   project it does not name; WP1 tenant fence, AUDIT H-1).
 * @example const r = createProjectResolvers(projectStore); r.resolveAndGuardRequiredProject('p1', reply) => 'p1'
 * @param {Object} projectStore
 * @returns {Object} { resolveProjectId, requireProject, resolveAndGuardProject, resolveRequiredProjectId, resolveAndGuardRequiredProject, resolveAndGuardPresentProject }
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

	/***
	 * @description Strict id resolution: trims the requested id and returns
	 *   it only when the projectStore knows it. Never consults the active
	 *   project. Returns null for missing/blank/non-string/unknown input —
	 *   callers turn that into a 400 (blank) or 404 (unknown) via the guard.
	 * @param {*} requestedId - Raw request value (body or query).
	 * @returns {string|null} Canonical project id, or null.
	 ***/
	function resolveRequiredProjectId(requestedId) {
		const trimmed =
			typeof requestedId === "string" ? requestedId.trim() : "";
		if (!trimmed) return null;
		return projectStore.getProject(trimmed) ? trimmed : null;
	}

	/***
	 * @description Strict guard for runner-mutating routes: blank/missing/
	 *   non-string projectId → 400 MISSING_PROJECT_ID (never the active
	 *   project); unknown-but-present id → 404 via requireProject; known id
	 *   → the id. Returns null after replying on any failure.
	 * @param {*} requestedId - Raw request value (body or query).
	 * @param {Object} reply - Fastify reply used to send the error.
	 * @returns {string|null} Canonical project id, or null after replying.
	 ***/
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

	/***
	 * @description Presence-only guard for the scope-keyed integration
	 *   acquire/heartbeat/report routes: blank/missing/non-string
	 *   projectId → 400 MISSING_PROJECT_ID, but an unknown-but-present
	 *   scope string passes through — the integration queue owns unknown
	 *   scopes with leased:false/STALE semantics (legacy behavior), and
	 *   its exact-match scope key is already the tenant boundary, so no
	 *   existence check is needed here.
	 * @param {*} requestedId - Raw request value (body).
	 * @param {Object} reply - Fastify reply used to send the 400.
	 * @returns {string|null} The trimmed scope string, or null after replying.
	 ***/
	function resolveAndGuardPresentProject(requestedId, reply) {
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
