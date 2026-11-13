// Role: role catalogue — the proof-of-concept roles and how they combine.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

/***
 * MARK: ROLE_CATALOG
 * @description The built-in proof-of-concept role catalogue. Each role names
 *   the plain-language abilities it grants; growing the catalogue later is
 *   data plus one line here. `admin` keeps full control of settings and
 *   users; `member` creates and updates work; `viewer` reads.
 * @example ROLE_CATALOG.admin.label => 'Admin'
 ***/
export const ROLE_CATALOG = {
	admin: {
		label: "Admin",
		description: "Full control of settings and users.",
		permissions: ["*"],
	},
	member: {
		label: "Member",
		description: "Create and update work.",
		permissions: ["read", "write"],
	},
	viewer: {
		label: "Viewer",
		description: "Read-only access.",
		permissions: ["read"],
	},
};

/***
 * MARK: BUILTIN_ADMIN_IDENTITY
 * @description The shared identity every request is attributed to while
 *   access control is OFF (the default). Downstream code always sees a user
 *   object with the admin role, so behaviour is byte-identical to today.
 * @example BUILTIN_ADMIN_IDENTITY.roles => ['admin']
 ***/
export const BUILTIN_ADMIN_IDENTITY = Object.freeze({
	id: "admin",
	name: "admin",
	roles: Object.freeze(["admin"]),
	builtin: true,
});

/***
 * MARK: KNOWN_ROLES
 * @description Sorted names of the roles this build recognises. Stored data
 *   naming anything else is ignored (fail closed to known roles).
 * @example KNOWN_ROLES => ['admin', 'member', 'viewer']
 ***/
export const KNOWN_ROLES = Object.freeze(Object.keys(ROLE_CATALOG).sort());

/***
 * MARK: isKnownRole
 * @description Whether a value names a role in this build's catalogue.
 * @example isKnownRole('member') => true
 * @param {*} value - Candidate role name.
 * @returns {boolean} True for catalogue roles only.
 ***/
export const isKnownRole = (value) =>
	typeof value === "string" && Object.hasOwn(ROLE_CATALOG, value);

/***
 * MARK: sanitizeRoles
 * @description Keeps only known catalogue roles from a stored list, deduped
 *   in catalogue order. Unknown names from stale data never grant access.
 * @example sanitizeRoles(['viewer', 'nope', 'admin', 'admin']) => ['admin', 'viewer']
 * @param {*} value - Candidate role list (anything; non-arrays yield []).
 * @returns {string[]} Known roles only.
 ***/
export const sanitizeRoles = (value) => {
	if (!Array.isArray(value)) return [];
	const wanted = new Set(value.filter((entry) => isKnownRole(entry)));
	return KNOWN_ROLES.filter((role) => wanted.has(role));
};

/***
 * MARK: resolveEffectiveRoles
 * @description Computes one request's effective roles: the user's direct
 *   roles union the roles mapped from each of their IdP groups, plus (when
 *   the route carries a project id) that project's scoped roles. A disabled
 *   user resolves to no roles. Unknown stored role names are ignored.
 * @example resolveEffectiveRoles({ user: { directRoles: ['viewer'], groups: ['team'], projectRoles: {} }, accessConfig: { groupRoleMappings: { team: ['member'] } } }) => ['member', 'viewer']
 * @param {Object} args - Labelled inputs.
 * @param {Object} [args.user] - User record (directRoles, groups, projectRoles, disabled).
 * @param {Object} [args.accessConfig] - Resolved access config (groupRoleMappings).
 * @param {string} [args.projectId] - Project scope for per-project roles.
 * @returns {string[]} Effective catalogue roles, deduped, in catalogue order.
 ***/
export const resolveEffectiveRoles = ({ user, accessConfig, projectId } = {}) => {
	if (!user || user.disabled === true) return [];
	const collected = new Set(sanitizeRoles(user.directRoles));
	const mappings =
		accessConfig && typeof accessConfig.groupRoleMappings === "object"
			? accessConfig.groupRoleMappings
			: {};
	for (const group of Array.isArray(user.groups) ? user.groups : []) {
		if (typeof group !== "string") continue;
		for (const role of sanitizeRoles(mappings[group])) collected.add(role);
	}
	if (typeof projectId === "string" && projectId !== "") {
		const scoped =
			user.projectRoles && typeof user.projectRoles === "object"
				? user.projectRoles[projectId]
				: [];
		for (const role of sanitizeRoles(scoped)) collected.add(role);
	}
	return KNOWN_ROLES.filter((role) => collected.has(role));
};

/***
 * MARK: userHasAnyRole
 * @description Whether an effective-role list satisfies a requirement. An
 *   empty requirement means "any signed-in identity"; `admin` always passes
 *   because the catalogue grants it every permission.
 * @example userHasAnyRole(['viewer'], ['member']) => false
 * @param {string[]} [effectiveRoles] - Roles resolved for the request.
 * @param {string[]} [requiredRoles] - Roles that may proceed.
 * @returns {boolean} True when the request may proceed.
 ***/
export const userHasAnyRole = (effectiveRoles = [], requiredRoles = []) => {
	if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) return true;
	if (!Array.isArray(effectiveRoles)) return false;
	if (effectiveRoles.includes("admin")) return true;
	return requiredRoles.some((role) => effectiveRoles.includes(role));
};

/***
 * MARK: roleHasPermission
 * @description Whether a single catalogue role grants a PoC permission.
 *   `admin` grants everything (`*`); unknown roles grant nothing.
 * @example roleHasPermission('member', 'write') => true
 * @param {string} role - Catalogue role name.
 * @param {string} permission - Permission to check ('read' or 'write').
 * @returns {boolean} True when the role grants the permission.
 ***/
export const roleHasPermission = (role, permission) => {
	if (!isKnownRole(role) || typeof permission !== "string") return false;
	const permissions = ROLE_CATALOG[role].permissions;
	return permissions.includes("*") || permissions.includes(permission);
};
