// Role: route guards — one-line role checks for Fastify preHandlers.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import { userHasAnyRole } from "./roles.js";
import { resolveEffectiveRoles } from "./roles.js";
import { keyHasScope } from "./apiKeyScopes.js";
import { recordAuthAudit } from "./auditLog.js";

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
 *   Routes may also declare a key scope (`{ scope: "tasks:create" }`):
 *   requests attributed to an API key then pass only when the key's roles
 *   satisfy the route's roles AND the scope is within the key's grants,
 *   while human sessions behave exactly as before (scopes ignored).
 *   Routes that keys must never touch (user/key administration) pass
 *   `{ allowApiKeys: false }`. Key allows and denials are audit-logged by
 *   key name; secrets never enter the log.
 * @example createAccessGuards({ getAuthConfig: () => ({ enabled: false }) }).requireRole(['admin'])
 * @param {Object} args - Labelled inputs.
 * @param {Function} args.getAuthConfig - Returns the resolved auth config.
 * @param {string} [args.authStateDir] - Auth state dir for key-usage auditing (auditing skipped without it).
 * @returns {{ requireRole: Function }} Guard factory.
 ***/
export const createAccessGuards = ({ getAuthConfig, authStateDir }) => {
	if (typeof getAuthConfig !== "function") {
		throw new Error("createAccessGuards needs a getAuthConfig reader");
	}
	const auditKeyUse = ({ request, action, detail }) => {
		if (typeof authStateDir !== "string" || authStateDir === "") return;
		recordAuthAudit({
			stateDir: authStateDir,
			actor:
				request.auth?.keyName != null
					? `api-key:${request.auth.keyName}`
					: "api-key:unknown",
			action,
			detail: {
				keyId: request.auth?.keyId || null,
				keyName: request.auth?.keyName || null,
				method: request.method || null,
				route: request.routeOptions?.url || request.url || null,
				...detail,
			},
		});
	};
	const requireRole = (requiredRoles, options = {}) => {
		const required = Array.isArray(requiredRoles) ? requiredRoles : [];
		const scope =
			typeof options.scope === "string" && options.scope !== ""
				? options.scope
				: null;
		const allowApiKeys = options.allowApiKeys !== false;
		return async (request, reply) => {
			const authConfig = getAuthConfig();
			const authOn = !!authConfig && authConfig.enabled === true;
			const keysOn = !!authConfig && authConfig.apiKeysEnabled === true;
			if (!authOn && !keysOn) return;
			const kind = request.auth?.kind;
			if (kind === "api-key" || kind === "api-key-invalid") {
				if (!keysOn) {
					unauthenticatedReply(reply);
					return;
				}
				if (kind !== "api-key" || !request.auth?.keyId) {
					auditKeyUse({
						request,
						action: "apikey.used_denied",
						detail: { reason: request.auth?.apiKeyError || "unknown" },
					});
					unauthenticatedReply(reply);
					return;
				}
				if (!allowApiKeys) {
					auditKeyUse({
						request,
						action: "apikey.used_denied",
						detail: { reason: "keys_forbidden" },
					});
					forbiddenReply(reply, required);
					return;
				}
				const keyRoles = request.auth?.roles || [];
				if (!userHasAnyRole(keyRoles, required)) {
					auditKeyUse({
						request,
						action: "apikey.used_denied",
						detail: { reason: "insufficient_role", requiredRoles: required },
					});
					forbiddenReply(reply, required);
					return;
				}
				if (
					scope &&
					!keyHasScope({
						roles: keyRoles,
						scopes: request.auth?.scopes,
						scope,
					})
				) {
					auditKeyUse({
						request,
						action: "apikey.used_denied",
						detail: { reason: "insufficient_scope", scope },
					});
					forbiddenReply(reply, required);
					return;
				}
				auditKeyUse({
					request,
					action: "apikey.used",
					detail: { scope, roles: keyRoles },
				});
				return;
			}
			if (!authOn) return;
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
