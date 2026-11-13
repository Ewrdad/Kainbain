// Role: API-key scope vocabulary — narrow abilities that subtract from a key's roles.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import { sanitizeRoles } from "./roles.js";

/***
 * MARK: KNOWN_API_KEY_SCOPES
 * @description Every scope name an API key may carry, in catalogue order.
 *   Task and status scopes gate the key-accessible surface today; run,
 *   settings, and admin scopes are reserved names for later steps and no
 *   route grants them yet, so storing them is harmless but grants nothing.
 * @example KNOWN_API_KEY_SCOPES.includes('tasks:create') => true
 ***/
export const KNOWN_API_KEY_SCOPES = Object.freeze([
	"tasks:read",
	"tasks:create",
	"tasks:update",
	"tasks:delete",
	"status:read",
	"runs:control",
	"settings:write",
	"admin:users",
	"admin:keys",
]);

/***
 * MARK: isKnownApiKeyScope
 * @description Whether a value names a scope in this build's vocabulary.
 * @example isKnownApiKeyScope('tasks:create') => true
 * @param {*} value - Candidate scope name.
 * @returns {boolean} True for vocabulary scopes only.
 ***/
export const isKnownApiKeyScope = (value) =>
	typeof value === "string" && KNOWN_API_KEY_SCOPES.includes(value);

/***
 * MARK: sanitizeApiKeyScopes
 * @description Keeps only known vocabulary scopes from a stored list,
 *   deduped in catalogue order. Unknown names from stale data never grant
 *   access.
 * @example sanitizeApiKeyScopes(['tasks:create', 'nope', 'tasks:create']) => ['tasks:create']
 * @param {*} value - Candidate scope list (anything; non-arrays yield []).
 * @returns {string[]} Known scopes only.
 ***/
export const sanitizeApiKeyScopes = (value) => {
	if (!Array.isArray(value)) return [];
	const wanted = new Set(value.filter((entry) => isKnownApiKeyScope(entry)));
	return KNOWN_API_KEY_SCOPES.filter((scope) => wanted.has(scope));
};

/***
 * MARK: ROLE_API_KEY_SCOPES
 * @description The scopes each catalogue role implies for an API key: the
 *   same permissions structure as user accounts (`admin` everything,
 *   `member` task writes, `viewer` reads). A key's scope allowlist can only
 *   narrow this down, never widen it.
 * @example ROLE_API_KEY_SCOPES.viewer => ['tasks:read', 'status:read']
 ***/
export const ROLE_API_KEY_SCOPES = Object.freeze({
	admin: Object.freeze([...KNOWN_API_KEY_SCOPES]),
	member: Object.freeze([
		"tasks:read",
		"tasks:create",
		"tasks:update",
		"tasks:delete",
		"status:read",
	]),
	viewer: Object.freeze(["tasks:read", "status:read"]),
});

/***
 * MARK: impliedApiKeyScopes
 * @description Union of the scopes implied by a key's roles. Unknown role
 *   names are ignored (fail closed to known roles).
 * @example impliedApiKeyScopes(['member']) => ['tasks:read', 'tasks:create', 'tasks:update', 'tasks:delete', 'status:read']
 * @param {*} roles - Candidate role list (anything; garbage yields []).
 * @returns {string[]} Implied scopes in catalogue order.
 ***/
export const impliedApiKeyScopes = (roles) => {
	const collected = new Set();
	for (const role of sanitizeRoles(roles)) {
		// eslint-disable-next-line security/detect-object-injection -- role comes from sanitizeRoles (catalogue names only)
		const implied = ROLE_API_KEY_SCOPES[role] || [];
		for (const scope of implied) collected.add(scope);
	}
	return KNOWN_API_KEY_SCOPES.filter((scope) => collected.has(scope));
};

/***
 * MARK: effectiveApiKeyScopes
 * @description The scopes a key may actually use: its roles' implied scopes
 *   intersected with its allowlist. A key with no allowlist gets its full
 *   role (the task text's "same permissions structure as user accounts"); a
 *   key with an allowlist gets exactly the overlap (the survey's narrow
 *   abilities) — scopes only ever subtract.
 * @example effectiveApiKeyScopes({ roles: ['member'], scopes: ['tasks:create'] }) => ['tasks:create']
 * @param {Object} [args] - Labelled inputs.
 * @param {*} [args.roles] - Key's catalogue roles.
 * @param {*} [args.scopes] - Key's scope allowlist (empty means full role).
 * @returns {string[]} Usable scopes in catalogue order.
 ***/
export const effectiveApiKeyScopes = ({ roles, scopes } = {}) => {
	const implied = new Set(impliedApiKeyScopes(roles));
	if (!Array.isArray(scopes) || scopes.length === 0) {
		return KNOWN_API_KEY_SCOPES.filter((scope) => implied.has(scope));
	}
	const wanted = new Set(sanitizeApiKeyScopes(scopes));
	return KNOWN_API_KEY_SCOPES.filter(
		(scope) => implied.has(scope) && wanted.has(scope),
	);
};

/***
 * MARK: keyHasScope
 * @description Whether a key's grants include one route scope: the scope
 *   must be implied by the key's roles and (when the key carries an
 *   allowlist) be on that allowlist.
 * @example keyHasScope({ roles: ['viewer'], scopes: [] }, 'tasks:create') => false
 * @param {Object} [args] - Labelled inputs.
 * @param {*} [args.roles] - Key's catalogue roles.
 * @param {*} [args.scopes] - Key's scope allowlist (empty means full role).
 * @param {string} [args.scope] - Route scope to check.
 * @returns {boolean} True when the key may use the scope.
 ***/
export const keyHasScope = ({ roles, scopes, scope } = {}) => {
	if (!isKnownApiKeyScope(scope)) return false;
	return effectiveApiKeyScopes({ roles, scopes }).includes(scope);
};
