// Role: user records — just-in-time provisioning and role assignment storage.
// Domain: Access — organisation-level user control (OIDC + RBAC, togglable).

import fs from "node:fs";
import path from "node:path";
import { _atomicWriteFileSync } from "../house/fileWriting.js";
import { sanitizeRoles } from "./roles.js";

/***
 * MARK: USERS_FILENAME
 * @description Provisioned user records live in this JSON file, so accounts
 *   survive restarts without any local password ever existing.
 * @example USERS_FILENAME => 'users.json'
 ***/
export const USERS_FILENAME = "users.json";

/***
 * MARK: usersFilePath
 * @description Absolute path of the user-records file for a state dir.
 * @example usersFilePath('/tmp/x') => '/tmp/x/users.json'
 * @param {string} stateDir - Auth state directory.
 * @returns {string} Path of `users.json` inside it.
 ***/
export const usersFilePath = (stateDir) => path.join(stateDir, USERS_FILENAME);

/***
 * MARK: normalizeUserRecord
 * @description Shapes one stored record: strings stay strings, role lists
 *   are sanitised to known roles, and timestamps stay ISO strings.
 * @example normalizeUserRecord({ sub: 's1' }).directRoles => []
 * @param {Object} [record] - Raw stored record.
 * @returns {Object} Clean user record.
 ***/
export const normalizeUserRecord = (record = {}) => {
	const projectRoles =
		record.projectRoles && typeof record.projectRoles === "object"
			? record.projectRoles
			: {};
	const scoped = {};
	for (const [projectId, roles] of Object.entries(projectRoles)) {
		if (typeof projectId !== "string" || projectId === "") continue;
		const kept = sanitizeRoles(roles);
		if (kept.length === 0) continue;
		// eslint-disable-next-line security/detect-object-injection -- projectId is a validated non-empty engine key
		scoped[projectId] = kept;
	}
	return {
		id: typeof record.id === "string" ? record.id : "",
		sub: typeof record.sub === "string" ? record.sub : "",
		email: typeof record.email === "string" ? record.email : "",
		name: typeof record.name === "string" ? record.name : "",
		provider: typeof record.provider === "string" ? record.provider : "",
		groups: Array.isArray(record.groups)
			? record.groups.filter((entry) => typeof entry === "string")
			: [],
		directRoles: sanitizeRoles(record.directRoles),
		projectRoles: scoped,
		createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
		lastLoginAt:
			typeof record.lastLoginAt === "string" ? record.lastLoginAt : "",
		disabled: record.disabled === true,
	};
};

/***
 * MARK: isBootstrapAdmin
 * @description Whether a freshly signed-in identity must hold `admin`: their
 *   subject or email is on the bootstrap list, or they arrive in the
 *   configured admin group. This is the lockout-recovery path — these users
 *   can never lose admin through group drift.
 * @example isBootstrapAdmin({ sub: 'boss', email: '', groups: [], authConfig: { bootstrapAdmins: ['boss'], adminGroup: '' } }) => true
 * @param {Object} args - Labelled inputs.
 * @param {string} [args.sub] - IdP subject id.
 * @param {string} [args.email] - IdP email claim.
 * @param {string[]} [args.groups] - IdP group membership.
 * @param {Object} [args.authConfig] - Resolved auth config.
 * @returns {boolean} True when the identity must be admin.
 ***/
export const isBootstrapAdmin = ({ sub, email, groups, authConfig } = {}) => {
	const seeds = Array.isArray(authConfig?.bootstrapAdmins)
		? authConfig.bootstrapAdmins
		: [];
	if (typeof sub === "string" && sub !== "" && seeds.includes(sub)) return true;
	if (typeof email === "string" && email !== "" && seeds.includes(email)) {
		return true;
	}
	const adminGroup =
		typeof authConfig?.adminGroup === "string" ? authConfig.adminGroup : "";
	return (
		adminGroup !== "" &&
		Array.isArray(groups) &&
		groups.includes(adminGroup)
	);
};

/***
 * MARK: createUserStore
 * @description Builds the user-record store bound to one state dir. The
 *   JSON file loads once at creation; every mutation rewrites it atomically.
 *   There are no local passwords anywhere: accounts only appear through
 *   just-in-time provisioning at first OIDC sign-in.
 * @example createUserStore({ stateDir: '/tmp/x' }).listUsers() => []
 * @param {Object} [args] - Labelled inputs.
 * @param {string} [args.stateDir] - Auth state directory.
 * @returns {{ findById: Function, findBySub: Function, listUsers: Function, provisionFromSignIn: Function, setDirectRoles: Function, setProjectRoles: Function, setDisabled: Function }} User store handle.
 ***/
export const createUserStore = ({ stateDir } = {}) => {
	const filePath = usersFilePath(stateDir);
	const byId = new Map();
	const loadFromDisk = () => {
		let parsed = null;
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- path built by usersFilePath from the resolved state dir */
			parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
		} catch {
			parsed = null;
		}
		byId.clear();
		const rows = parsed && Array.isArray(parsed.users) ? parsed.users : [];
		for (const row of rows) {
			const user = normalizeUserRecord(row);
			if (user.id === "") continue;
			byId.set(user.id, user);
		}
	};
	const persist = () => {
		if (!fs.existsSync(stateDir)) {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- state dir resolved by resolveAuthStateDir */
			fs.mkdirSync(stateDir, { recursive: true });
		}
		_atomicWriteFileSync(
			filePath,
			`${JSON.stringify({ users: [...byId.values()] }, null, 2)}\n`,
		);
	};
	loadFromDisk();

	const publicUser = (user) => ({ ...user });

	return {
		findById: (id) => {
			if (typeof id !== "string" || id === "") return null;
			const user = byId.get(id);
			return user ? publicUser(user) : null;
		},
		findBySub: (sub) => {
			if (typeof sub !== "string" || sub === "") return null;
			for (const user of byId.values()) {
				if (user.sub === sub) return publicUser(user);
			}
			return null;
		},
		listUsers: () => [...byId.values()].map(publicUser),
		provisionFromSignIn: ({
			sub,
			email = "",
			name = "",
			provider = "",
			groups = [],
			authConfig = {},
		} = {}) => {
			if (typeof sub !== "string" || sub === "") {
				throw new Error("provisionFromSignIn needs an IdP subject id");
			}
			const now = new Date().toISOString();
			const cleanGroups = Array.isArray(groups)
				? groups.filter((entry) => typeof entry === "string")
				: [];
			const existing = byId.get(sub);
			if (!existing) {
				const user = normalizeUserRecord({
					id: sub,
					sub,
					email,
					name,
					provider,
					groups: cleanGroups,
					directRoles: [],
					createdAt: now,
					lastLoginAt: now,
				});
				if (
					isBootstrapAdmin({ sub, email, groups: cleanGroups, authConfig })
				) {
					user.directRoles = ["admin"];
				}
				byId.set(sub, user);
				persist();
				return publicUser(user);
			}
			const refreshed = normalizeUserRecord({
				...existing,
				email: email || existing.email,
				name: name || existing.name,
				provider: provider || existing.provider,
				groups: cleanGroups,
				lastLoginAt: now,
			});
			if (
				isBootstrapAdmin({ sub, email, groups: cleanGroups, authConfig }) &&
				!refreshed.directRoles.includes("admin")
			) {
				refreshed.directRoles = [...refreshed.directRoles, "admin"];
			}
			byId.set(sub, refreshed);
			persist();
			return publicUser(refreshed);
		},
		setDirectRoles: (userId, roles) => {
			const user = byId.get(userId);
			if (!user) return null;
			byId.set(
				userId,
				normalizeUserRecord({ ...user, directRoles: sanitizeRoles(roles) }),
			);
			persist();
			return publicUser(byId.get(userId));
		},
		setProjectRoles: (userId, projectId, roles) => {
			const user = byId.get(userId);
			if (!user || typeof projectId !== "string" || projectId === "") {
				return null;
			}
			const scoped = { ...user.projectRoles };
			const kept = sanitizeRoles(roles);
			if (kept.length === 0) {
				delete scoped[projectId];
			} else {
				// eslint-disable-next-line security/detect-object-injection -- projectId is a validated non-empty engine key
				scoped[projectId] = kept;
			}
			byId.set(userId, normalizeUserRecord({ ...user, projectRoles: scoped }));
			persist();
			return publicUser(byId.get(userId));
		},
		setDisabled: (userId, disabled) => {
			const user = byId.get(userId);
			if (!user) return null;
			byId.set(
				userId,
				normalizeUserRecord({ ...user, disabled: disabled === true }),
			);
			persist();
			return publicUser(byId.get(userId));
		},
	};
};
