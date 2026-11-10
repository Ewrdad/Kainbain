// Role: request hook — attaching the user (or the builtin admin) to requests.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import {
	BUILTIN_ADMIN_IDENTITY,
	resolveEffectiveRoles,
} from "./roles.js";
import { readSessionIdFromHeader } from "./sessionStore.js";

/***
 * MARK: PUBLIC_AUTH_PATH_PREFIXES
 * @description Routes that never need a signed-in user, even with access
 *   control on: health checks, the in-app docs, the agent guide, the
 *   runner credential channel, the websocket handshake (guarded inside the
 *   route), and the sign-in endpoints themselves. Everything else is
 *   attributed and enforced by `requireRole` preHandlers.
 * @example isPublicAuthPath('/status/health') => true
 ***/
export const PUBLIC_AUTH_PATH_PREFIXES = [
	"/status",
	"/health",
	"/docs",
	"/agent",
	"/runners",
	"/ws",
	"/documentation",
	"/auth/login",
	"/auth/callback",
];

/***
 * MARK: isPublicAuthPath
 * @description Whether a request path skips user attribution. Exact match
 *   or a `/`-bounded prefix match, so `/docs-evil` never sneaks through.
 * @example isPublicAuthPath('/auth/callback?code=x') => true
 * @param {*} url - Request URL or path (query strings are ignored).
 * @returns {boolean} True when the path is public.
 ***/
export const isPublicAuthPath = (url) => {
	if (typeof url !== "string") return false;
	const pathname = url.split("?")[0];
	return PUBLIC_AUTH_PATH_PREFIXES.some(
		(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
	);
};

/***
 * MARK: readProjectIdFromRequest
 * @description Finds the project scope for a request from the usual Fastify
 *   spots, so project-scoped roles apply without each route opting in.
 * @example readProjectIdFromRequest({ params: { projectId: 'a' } }) => 'a'
 * @param {Object} [request] - Fastify request.
 * @returns {string|null} Project id or null.
 ***/
export const readProjectIdFromRequest = (request = {}) => {
	const fromParams =
		request.params && typeof request.params.projectId === "string"
			? request.params.projectId
			: null;
	if (fromParams) return fromParams;
	const fromQuery =
		request.query && typeof request.query.projectId === "string"
			? request.query.projectId
			: null;
	return fromQuery || null;
};

/***
 * MARK: createAuthRequestHook
 * @description Builds the Fastify `onRequest` hook that gives every request
 *   a user. OFF means the shared builtin admin (zero behaviour change);
 *   ON resolves the session cookie to a session, the session to a user, and
 *   the user to effective roles (re-read per request so disabling a user or
 *   changing their roles bites immediately). The hook never rejects: public
 *   routes and `requireRole` preHandlers decide that later.
 * @example createAuthRequestHook({ getAuthConfig: () => ({ enabled: false }), userStore: null, sessionStore: null })
 * @param {Object} args - Labelled inputs.
 * @param {Function} args.getAuthConfig - Returns the resolved auth config.
 * @param {Object} [args.userStore] - User store handle.
 * @param {Object} [args.sessionStore] - Session store handle.
 * @returns {Function} Fastify `onRequest` hook.
 ***/
export const createAuthRequestHook = ({
	getAuthConfig,
	userStore,
	sessionStore,
}) => {
	if (typeof getAuthConfig !== "function") {
		throw new Error("createAuthRequestHook needs a getAuthConfig reader");
	}
	return async (request) => {
		const authConfig = getAuthConfig();
		if (!authConfig || authConfig.enabled !== true) {
			request.user = { ...BUILTIN_ADMIN_IDENTITY };
			request.auth = { enabled: false, roles: ["admin"], userId: "admin" };
			return;
		}
		const sessionId = readSessionIdFromHeader(
			request.headers?.cookie,
			authConfig.cookieName || "kb_session",
		);
		const record = sessionId
			? sessionStore?.lookupSession(sessionId, {
					ttlMs: authConfig.sessionTtlMs,
					idleMs: authConfig.sessionIdleMs,
				})
			: null;
		const user = record ? userStore?.findById(record.userId) : null;
		if (!user || user.disabled === true) {
			request.user = null;
			request.auth = { enabled: true, roles: [], userId: null };
			return;
		}
		const projectId = readProjectIdFromRequest(request);
		const roles = resolveEffectiveRoles({
			user,
			accessConfig: authConfig,
			projectId,
		});
		request.user = {
			id: user.id,
			sub: user.sub,
			email: user.email,
			name: user.name,
			provider: user.provider,
			groups: user.groups,
			disabled: false,
		};
		request.auth = {
			enabled: true,
			roles,
			userId: user.id,
			membership: {
				directRoles: user.directRoles,
				groups: user.groups,
				projectRoles: user.projectRoles,
				disabled: false,
			},
		};
	};
};
