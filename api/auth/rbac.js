// Role: route guards — one-line role checks for Fastify preHandlers.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import { userHasAnyRole } from "./roles.js";
import { resolveEffectiveRoles } from "./roles.js";

/***
 * MARK: unauthenticatedReply
 * @description Sends the 401 JSON shape for requests with no signed-in user
 *   on a guarded route while access control is on.
 * @example unauthenticatedReply(reply)
 * @param {Object} reply - Fastify reply.
 * @returns {Object} The sent reply.
 ***/
export const unauthenticatedReply = (reply) =>
	reply.code(401).send({
		error: "Sign-in required",
		code: "unauthenticated",
	});

/***
 * MARK: forbiddenReply
 * @description Sends the 403 JSON shape for signed-in users whose roles do
 *   not satisfy the guarded route's requirement.
 * @example forbiddenReply(reply, ['admin']) => reply
 * @param {Object} reply - Fastify reply.
 * @param {string[]} requiredRoles - Roles the route demands (echoed back).
 * @returns {Object} The sent reply.
 ***/
export const forbiddenReply = (reply, requiredRoles) =>
	reply.code(403).send({
		error: "Insufficient role",
		code: "forbidden",
		requiredRoles: Array.isArray(requiredRoles) ? requiredRoles : [],
	});

/***
 * MARK: createAccessGuards
 * @description Builds the `requireRole` preHandler factory bound to the
 *   live access config. Guarded routes declare one line —
 *   `preHandler: requireRole(["admin"])` — and stay open while access
 *   control is OFF, so the default install behaves exactly as today.
 * @example createAccessGuards({ getAuthConfig: () => ({ enabled: false }) }).requireRole(['admin'])
 * @param {Object} args - Labelled inputs.
 * @param {Function} args.getAuthConfig - Returns the resolved auth config.
 * @returns {{ requireRole: Function }} Guard factory.
 ***/
export const createAccessGuards = ({ getAuthConfig }) => {
	if (typeof getAuthConfig !== "function") {
		throw new Error("createAccessGuards needs a getAuthConfig reader");
	}
	const requireRole = (requiredRoles, options = {}) => {
		const required = Array.isArray(requiredRoles) ? requiredRoles : [];
		return async (request, reply) => {
			const authConfig = getAuthConfig();
			if (!authConfig || authConfig.enabled !== true) return;
			if (!request.user) {
				unauthenticatedReply(reply);
				return;
			}
			// A route carrying an explicit project scope re-resolves roles
			// for that project (projectRoles union in for the check).
			let roles = request.auth?.roles || [];
			if (typeof options.projectIdFrom === "function") {
				const scopedProjectId = options.projectIdFrom(request);
				if (scopedProjectId) {
					roles = resolveEffectiveRoles({
						user: { ...request.user, ...(request.auth?.membership || {}) },
						accessConfig: authConfig,
						projectId: scopedProjectId,
					});
				}
			}
			if (!userHasAnyRole(roles, required)) {
				forbiddenReply(reply, required);
			}
		};
	};
	return { requireRole };
};
