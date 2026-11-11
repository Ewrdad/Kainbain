// Role: request hook — attaching the user (or the builtin admin) to requests.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import {
	BUILTIN_ADMIN_IDENTITY,
	resolveEffectiveRoles,
} from "./roles.js";
import { readSessionIdFromHeader } from "./sessionStore.js";
import { resolveRequestActor } from "./actor.js";

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
 * MARK: readApiKeySecretFromHeaders
 * @description Pulls a presented API-key secret from the request headers:
 *   the `x-api-key` alias first, then `Authorization: Bearer <secret>`.
 *   Anything else (missing, non-Bearer, empty) reads as no key — the hook
 *   never throws on header shapes.
 * @example readApiKeySecretFromHeaders({ 'x-api-key': 'kb_abc' }) => 'kb_abc'
 * @param {Object} [headers] - Lowercased request headers.
 * @returns {string|null} Presented secret or null.
 ***/
export const readApiKeySecretFromHeaders = (headers = {}) => {
	const alias = headers?.["x-api-key"];
	if (typeof alias === "string" && alias.trim() !== "") return alias.trim();
	if (Array.isArray(alias) && typeof alias[0] === "string" && alias[0].trim() !== "") {
		return alias[0].trim();
	}
	const authorization = headers?.authorization;
	if (typeof authorization !== "string") return null;
	const match = authorization.match(/^\s*Bearer\s+(\S+)\s*$/i);
	return match ? match[1] : null;
};

/***
 * MARK: createAuthRequestHook
 * @description Builds the Fastify `onRequest` hook that gives every request
 *   a user. OFF means the shared builtin admin (zero behaviour change);
 *   ON resolves the session cookie to a session, the session to a user, and
 *   the user to effective roles (re-read per request so disabling a user or
 *   changing their roles bites immediately). When the separate API-key
 *   switch is on, a request carrying key credentials (and no valid session
 *   — sessions always win) is attributed to that key instead; presented but
 *   unusable secrets (unknown, expired, revoked) are marked for the guards
 *   to 401. While the key switch is off the key headers are ignored
 *   entirely. The hook never rejects: public routes and `requireRole`
 *   preHandlers decide that later.
 * @example createAuthRequestHook({ getAuthConfig: () => ({ enabled: false }), userStore: null, sessionStore: null })
 * @param {Object} args - Labelled inputs.
 * @param {Function} args.getAuthConfig - Returns the resolved auth config.
 * @param {Object} [args.userStore] - User store handle.
 * @param {Object} [args.sessionStore] - Session store handle.
 * @param {Object} [args.apiKeyStore] - API-key store handle (keys inert without it).
 * @returns {Function} Fastify `onRequest` hook.
 ***/
export const createAuthRequestHook = ({
	getAuthConfig,
	userStore,
	sessionStore,
	apiKeyStore,
}) => {
	if (typeof getAuthConfig !== "function") {
		throw new Error("createAuthRequestHook needs a getAuthConfig reader");
	}
	const attributeApiKey = (request, authConfig) => {
		const secret = readApiKeySecretFromHeaders(request.headers);
		if (!secret) return false;
		const verification = apiKeyStore.verifyApiKey(secret);
		if (verification.ok) {
			apiKeyStore.touchLastUsed(verification.record.id);
			request.user = null;
			request.auth = {
				enabled: authConfig.enabled === true,
				apiKeysEnabled: true,
				kind: "api-key",
				roles: verification.record.roles,
				scopes: verification.record.scopes,
				userId: null,
				keyId: verification.record.id,
				keyName: verification.record.name,
			};
			request.actor = resolveRequestActor(request);
			return true;
		}
		request.user = null;
		request.auth = {
			enabled: authConfig.enabled === true,
			apiKeysEnabled: true,
			kind: "api-key-invalid",
			roles: [],
			scopes: [],
			userId: null,
			apiKeyError: verification.reason,
			keyId: verification.record?.id || null,
			keyName: verification.record?.name || null,
		};
		request.actor = resolveRequestActor(request);
		return true;
	};
	return async (request) => {
		const authConfig = getAuthConfig();
		const keysOn =
			!!apiKeyStore && !!authConfig && authConfig.apiKeysEnabled === true;
		if (!authConfig || authConfig.enabled !== true) {
			if (keysOn && attributeApiKey(request, authConfig)) return;
			request.user = { ...BUILTIN_ADMIN_IDENTITY };
			request.auth = {
				enabled: false,
				apiKeysEnabled: keysOn,
				kind: "builtin",
				roles: ["admin"],
				userId: "admin",
			};
			request.actor = resolveRequestActor(request);
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
		if (user && user.disabled !== true) {
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
				apiKeysEnabled: keysOn,
				kind: "user",
				roles,
				userId: user.id,
				membership: {
					directRoles: user.directRoles,
					groups: user.groups,
					projectRoles: user.projectRoles,
					disabled: false,
				},
			};
			request.actor = resolveRequestActor(request);
			return;
		}
		if (keysOn && attributeApiKey(request, authConfig)) return;
		request.user = null;
		request.auth = {
			enabled: true,
			apiKeysEnabled: keysOn,
			kind: "anonymous",
			roles: [],
			userId: null,
		};
		request.actor = resolveRequestActor(request);
	};
};
