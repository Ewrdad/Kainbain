import { describe, it, expect } from "vitest";
import {
	ROLE_CATALOG,
	BUILTIN_ADMIN_IDENTITY,
	KNOWN_ROLES,
	isKnownRole,
	sanitizeRoles,
	resolveEffectiveRoles,
	userHasAnyRole,
	roleHasPermission,
} from "./roles.js";

/***
 * MARK: roles tests
 * @description Locks the PoC role model: catalogue contents, fail-closed
 *   sanitising, effective-role resolution (direct + group-mapped + project),
 *   and the admin-implies-everything rule.
 ***/

describe("role catalogue", () => {
	it("ships admin, member, and viewer with plain-language labels", () => {
		expect(KNOWN_ROLES).toEqual(["admin", "member", "viewer"]);
		expect(ROLE_CATALOG.admin.label).toBe("Admin");
		expect(ROLE_CATALOG.member.label).toBe("Member");
		expect(ROLE_CATALOG.viewer.label).toBe("Viewer");
	});

	it("attributes every disabled-mode request to the shared builtin admin", () => {
		expect(BUILTIN_ADMIN_IDENTITY.id).toBe("admin");
		expect(BUILTIN_ADMIN_IDENTITY.roles).toEqual(["admin"]);
		expect(BUILTIN_ADMIN_IDENTITY.builtin).toBe(true);
	});

	it("recognises only catalogue roles", () => {
		expect(isKnownRole("admin")).toBe(true);
		expect(isKnownRole("owner")).toBe(false);
		expect(isKnownRole(null)).toBe(false);
	});

	it("drops unknown stored roles and dedupes survivors", () => {
		expect(sanitizeRoles(["viewer", "nope", "admin", "admin"])).toEqual([
			"admin",
			"viewer",
		]);
		expect(sanitizeRoles("admin")).toEqual([]);
		expect(sanitizeRoles(null)).toEqual([]);
	});
});

describe("resolveEffectiveRoles", () => {
	const accessConfig = {
		groupRoleMappings: { team: ["member"], leads: ["admin"] },
	};

	it("unions direct roles with group-mapped roles", () => {
		expect(
			resolveEffectiveRoles({
				user: {
					directRoles: ["viewer"],
					groups: ["team"],
					projectRoles: {},
				},
				accessConfig,
			}),
		).toEqual(["member", "viewer"]);
	});

	it("unions project-scoped roles only for the matching project", () => {
		const user = {
			directRoles: [],
			groups: [],
			projectRoles: { alpha: ["member"] },
		};
		expect(
			resolveEffectiveRoles({ user, accessConfig, projectId: "alpha" }),
		).toEqual(["member"]);
		expect(
			resolveEffectiveRoles({ user, accessConfig, projectId: "beta" }),
		).toEqual([]);
		expect(resolveEffectiveRoles({ user, accessConfig })).toEqual([]);
	});

	it("ignores unknown groups, unknown mapped roles, and stale stored roles", () => {
		expect(
			resolveEffectiveRoles({
				user: {
					directRoles: ["owner"],
					groups: ["ghost", 42],
					projectRoles: {},
				},
				accessConfig: { groupRoleMappings: { ghost: ["owner"] } },
			}),
		).toEqual([]);
	});

	it("gives a disabled user no roles", () => {
		expect(
			resolveEffectiveRoles({
				user: {
					directRoles: ["admin"],
					groups: ["leads"],
					projectRoles: {},
					disabled: true,
				},
				accessConfig,
			}),
		).toEqual([]);
	});

	it("resolves to no roles for a missing user", () => {
		expect(resolveEffectiveRoles({})).toEqual([]);
	});
});

describe("userHasAnyRole", () => {
	it("lets admin through any requirement", () => {
		expect(userHasAnyRole(["admin"], ["member"])).toBe(true);
		expect(userHasAnyRole(["viewer"], ["member"])).toBe(false);
		expect(userHasAnyRole(["viewer"], [])).toBe(true);
		expect(userHasAnyRole([], ["viewer"])).toBe(false);
	});
});

describe("roleHasPermission", () => {
	it("grants admin everything and scopes member/viewer", () => {
		expect(roleHasPermission("admin", "write")).toBe(true);
		expect(roleHasPermission("member", "write")).toBe(true);
		expect(roleHasPermission("member", "delete")).toBe(false);
		expect(roleHasPermission("viewer", "read")).toBe(true);
		expect(roleHasPermission("viewer", "write")).toBe(false);
		expect(roleHasPermission("owner", "read")).toBe(false);
	});
});
