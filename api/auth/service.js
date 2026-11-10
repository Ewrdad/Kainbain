// Role: auth wiring — one built service composing the access-control pieces.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import { createAccessConfig, resolveAuthStateDir } from "./accessConfig.js";
import { createUserStore } from "./userStore.js";
import { createSessionStore, readSessionIdFromHeader } from "./sessionStore.js";
import { createAuthRequestHook } from "./middleware.js";
import { createAccessGuards } from "./rbac.js";

/***
 * MARK: createAuthService
 * @description Builds the whole access-control service from the validated
 *   schema config: live access config (env + settings-page overrides), the
 *   user and session stores, the Fastify request hook, the `requireRole`
 *   guard factory, and the websocket-upgrade user resolver. One call in
 *   `api/index.js` wires everything; tests pass a temp `stateDir` for
 *   isolation. No singletons live here — the caller owns the instance.
 * @example createAuthService({ schemaConfig: { authEnabled: false }, stateDir: '/tmp/x' }).authConfig.get().enabled => false
 * @param {Object} [args] - Labelled inputs.
 * @param {Object} [args.schemaConfig] - Validated schema config object.
 * @param {string} [args.stateDir] - Auth state directory (tests win).
 * @returns {{ authConfig: Object, userStore: Object, sessionStore: Object, requestHook: Function, guards: Object, resolveWsUser: Function, stateDir: string }} Wired auth service.
 ***/
export const createAuthService = ({ schemaConfig = {}, stateDir } = {}) => {
	const dir = resolveAuthStateDir({
		configuredDir: stateDir ?? schemaConfig.authStatePath,
	});
	const authConfig = createAccessConfig({ schemaConfig, stateDir: dir });
	const getAuthConfig = () => authConfig.get();
	const userStore = createUserStore({ stateDir: dir });
	const sessionStore = createSessionStore({ stateDir: dir });
	const requestHook = createAuthRequestHook({
		getAuthConfig,
		userStore,
		sessionStore,
	});
	const guards = createAccessGuards({ getAuthConfig });
	const resolveWsUser = (request = {}) => {
		const resolved = getAuthConfig();
		if (!resolved || resolved.enabled !== true) {
			return { id: "admin", builtin: true, roles: ["admin"] };
		}
		const sessionId = readSessionIdFromHeader(
			request.headers?.cookie,
			resolved.cookieName || "kb_session",
		);
		const record = sessionId
			? sessionStore.lookupSession(sessionId, {
					ttlMs: resolved.sessionTtlMs,
					idleMs: resolved.sessionIdleMs,
				})
			: null;
		const user = record ? userStore.findById(record.userId) : null;
		return user && user.disabled !== true ? user : null;
	};
	return {
		authConfig,
		userStore,
		sessionStore,
		requestHook,
		guards,
		resolveWsUser,
		stateDir: dir,
	};
};
