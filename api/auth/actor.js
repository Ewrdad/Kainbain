// Role: request actor — one identity shape for users, keys, and the builtin.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

/***
 * MARK: resolveRequestActor
 * @description Reads one request's acting identity from the auth hook's
 *   `request.user` / `request.auth` shape: an API key (`api-key`), a
 *   signed-in user (`user`), the shared install identity while access
 *   control is off (`builtin`), or nobody on a guarded miss (`anonymous`).
 *   Nothing here grants access — guards decide that separately.
 * @example resolveRequestActor({ user: null, auth: { kind: 'api-key', keyId: 'k1', keyName: 'scan', roles: ['member'] } }).kind => 'api-key'
 * @param {Object} [request] - Fastify request (or hook-shaped double).
 * @returns {{ kind: string, id: string, name: string, roles: string[] }} Acting identity.
 ***/
export const resolveRequestActor = (request = {}) => {
	const auth = request.auth && typeof request.auth === "object" ? request.auth : {};
	if (auth.kind === "api-key") {
		return {
			kind: "api-key",
			id: typeof auth.keyId === "string" ? auth.keyId : "",
			name: typeof auth.keyName === "string" ? auth.keyName : "",
			roles: Array.isArray(auth.roles) ? [...auth.roles] : [],
		};
	}
	const user = request.user;
	if (!user || typeof user !== "object") {
		return { kind: "anonymous", id: "", name: "anonymous", roles: [] };
	}
	if (user.builtin === true || auth.enabled !== true) {
		return {
			kind: "builtin",
			id: typeof user.id === "string" ? user.id : "admin",
			name: typeof user.name === "string" ? user.name : "admin",
			roles: Array.isArray(auth.roles) ? [...auth.roles] : ["admin"],
		};
	}
	return {
		kind: "user",
		id: typeof user.id === "string" ? user.id : "",
		name:
			(typeof user.name === "string" && user.name !== ""
				? user.name
				: null) ||
			(typeof user.email === "string" && user.email !== "" ? user.email : "") ||
			(typeof user.id === "string" ? user.id : ""),
		roles: Array.isArray(auth.roles) ? [...auth.roles] : [],
	};
};

/***
 * MARK: actorLabel
 * @description Short human label for who acted: `api-key:<name>` for keys so
 *   every key action is flaggable by key name, otherwise the user's name.
 *   Used in task history lines and audit actors — never carries secrets.
 * @example actorLabel({ user: null, auth: { kind: 'api-key', keyName: 'scan', roles: [] } }) => 'api-key:scan'
 * @param {Object} [request] - Fastify request (or hook-shaped double).
 * @returns {string} Attribution label.
 ***/
export const actorLabel = (request = {}) => {
	const actor = resolveRequestActor(request);
	if (actor.kind === "api-key") return `api-key:${actor.name}`;
	if (actor.kind === "anonymous") return "anonymous";
	return actor.name || actor.id || "admin";
};
