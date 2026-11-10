import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createAccessConfig,
	resolveAuthConfig,
	writeAccessOverrides,
	readAccessOverrides,
	sanitizeGroupRoleMappings,
	toPositiveInt,
	accessOverridesPath,
} from "./accessConfig.js";

/***
 * MARK: accessConfig tests
 * @description Locks the env-plus-overrides merge: runtime beats env beats
 *   default, role lists fail safe, corrupt override files never crash boot,
 *   and writes are atomic JSON.
 ***/

let stateDir = null;

beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-auth-config-"));
});

afterEach(() => {
	if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
	stateDir = null;
});

const schemaConfig = () => ({
	authEnabled: false,
	authIssuerUrl: "https://idp.example.com",
	authClientId: "cid",
	authClientSecret: "shh",
	authRedirectUri: "",
	authScopes: "openid profile email groups",
	authGroupsClaim: "groups",
	authAdminGroup: "",
	authBootstrapAdmins: [],
	authSessionTtlMs: 12 * 60 * 60 * 1000,
	authSessionIdleMs: 30 * 60 * 1000,
	authCookieName: "kb_session",
	authRoleManagerRoles: ["admin"],
});

describe("toPositiveInt", () => {
	it("keeps positive numbers and falls back otherwise", () => {
		expect(toPositiveInt("60000", 30)).toBe(60000);
		expect(toPositiveInt(0, 30)).toBe(30);
		expect(toPositiveInt("nope", 30)).toBe(30);
		expect(toPositiveInt(undefined, 30)).toBe(30);
	});
});

describe("resolveAuthConfig", () => {
	it("resolves env values when no overrides file exists", () => {
		const resolved = resolveAuthConfig({ schemaConfig: schemaConfig(), stateDir });
		expect(resolved.enabled).toBe(false);
		expect(resolved.publicKbUrl).toBe("http://localhost:3100");
		expect(resolved.issuerUrl).toBe("https://idp.example.com");
		expect(resolved.roleManagerRoles).toEqual(["admin"]);
		expect(resolved.groupRoleMappings).toEqual({});
	});

	it("lets runtime overrides beat env values", () => {
		writeAccessOverrides({
			stateDir,
			partial: { authEnabled: true, authGroupsClaim: "memberOf" },
		});
		const resolved = resolveAuthConfig({ schemaConfig: schemaConfig(), stateDir });
		expect(resolved.enabled).toBe(true);
		expect(resolved.groupsClaim).toBe("memberOf");
		expect(resolved.issuerUrl).toBe("https://idp.example.com");
	});

	it("fails safe to admin-only managers on empty or unknown roles", () => {
		writeAccessOverrides({
			stateDir,
			partial: { authRoleManagerRoles: ["owner"] },
		});
		expect(
			resolveAuthConfig({ schemaConfig: schemaConfig(), stateDir })
				.roleManagerRoles,
		).toEqual(["admin"]);
	});

	it("reads an empty object from a missing or corrupt overrides file", () => {
		expect(readAccessOverrides(stateDir)).toEqual({});
		fs.writeFileSync(accessOverridesPath(stateDir), "not json{{{", "utf8");
		expect(readAccessOverrides(stateDir)).toEqual({});
		expect(
			resolveAuthConfig({ schemaConfig: schemaConfig(), stateDir }).enabled,
		).toBe(false);
	});
});

describe("sanitizeGroupRoleMappings", () => {
	it("drops malformed groups and unknown roles", () => {
		expect(
			sanitizeGroupRoleMappings({
				team: ["member", "owner"],
				"": ["admin"],
				empty: [],
				leads: "admin",
			}),
		).toEqual({ team: ["member"] });
		expect(sanitizeGroupRoleMappings(null)).toEqual({});
		expect(sanitizeGroupRoleMappings([])).toEqual({});
	});
});

describe("writeAccessOverrides", () => {
	it("persists known keys atomically and ignores unknown keys", () => {
		const stored = writeAccessOverrides({
			stateDir,
			partial: {
				authEnabled: true,
				groupRoleMappings: { team: ["member"] },
				someFutureKey: "nope",
			},
		});
		expect(stored.authEnabled).toBe(true);
		expect(stored.groupRoleMappings).toEqual({ team: ["member"] });
		expect(stored.someFutureKey).toBeUndefined();
		const reread = JSON.parse(
			fs.readFileSync(accessOverridesPath(stateDir), "utf8"),
		);
		expect(reread.authEnabled).toBe(true);
	});

	it("requires a stateDir", () => {
		expect(() => writeAccessOverrides({ partial: {} })).toThrow(/stateDir/);
	});
});

describe("createAccessConfig", () => {
	it("reads live so a save applies without a restart", () => {
		const access = createAccessConfig({
			schemaConfig: schemaConfig(),
			stateDir,
		});
		expect(access.get().enabled).toBe(false);
		access.save({ authEnabled: true });
		expect(access.get().enabled).toBe(true);
	});
});
