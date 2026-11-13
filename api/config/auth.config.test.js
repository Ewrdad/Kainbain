import { describe, it, expect } from "vitest";
import { loadConfig, CONFIG_SCHEMA } from "./schema.js";
import { getConfigSpec, REDACTED_VALUE } from "./index.js";

/***
 * MARK: auth config tests
 * @description Locks the Phase 1 access-control schema additions: the auth
 *   group exists, every auth knob boots to its safe default (disabled), env
 *   overrides parse, malformed values fail fast, and the client secret is
 *   redacted in the introspection endpoint.
 ***/

describe("auth config schema (access control, off by default)", () => {
	it("declares an auth group in CONFIG_GROUPS", async () => {
		const { CONFIG_GROUPS } = await import("./schema.js");
		const group = CONFIG_GROUPS.find((entry) => entry.id === "auth");
		expect(group).toBeDefined();
		expect(group.title).toMatch(/access/i);
	});

	it("boots with auth disabled and safe defaults from an empty env", () => {
		const { config } = loadConfig({});
		expect(config.authEnabled).toBe(false);
		expect(config.authIssuerUrl).toBe("");
		expect(config.authClientId).toBe("");
		expect(config.authClientSecret).toBe("");
		expect(config.authGroupsClaim).toBe("groups");
		expect(config.authAdminGroup).toBe("");
		expect(config.authBootstrapAdmins).toEqual([]);
		expect(config.authSessionTtlMs).toBe(12 * 60 * 60 * 1000);
		expect(config.authSessionIdleMs).toBe(30 * 60 * 1000);
		expect(config.authCookieName).toBe("kb_session");
		expect(config.authRoleManagerRoles).toEqual(["admin"]);
		expect(config.authStatePath).toBe("");
	});

	it("honors the auth env overrides", () => {
		const { config } = loadConfig({
			KAINBAIN_AUTH_ENABLED: "true",
			KAINBAIN_OIDC_ISSUER_URL: "https://idp.example.com",
			KAINBAIN_OIDC_CLIENT_ID: "kainbain",
			KAINBAIN_OIDC_SCOPES: "openid profile email",
			KAINBAIN_AUTH_GROUPS_CLAIM: "memberOf",
			KAINBAIN_AUTH_ADMIN_GROUP: "kainbain-admins",
			KAINBAIN_AUTH_BOOTSTRAP_ADMINS: "boss@example.com, sub-123",
			KAINBAIN_AUTH_ROLE_MANAGER_ROLES: "admin, manager",
		});
		expect(config.authEnabled).toBe(true);
		expect(config.authIssuerUrl).toBe("https://idp.example.com");
		expect(config.authScopes).toBe("openid profile email");
		expect(config.authGroupsClaim).toBe("memberOf");
		expect(config.authAdminGroup).toBe("kainbain-admins");
		expect(config.authBootstrapAdmins).toEqual([
			"boss@example.com",
			"sub-123",
		]);
		expect(config.authRoleManagerRoles).toEqual(["admin", "manager"]);
	});

	it("rejects a non-URL issuer and a too-small session TTL", () => {
		expect(() =>
			loadConfig({ KAINBAIN_OIDC_ISSUER_URL: "not-a-url" }),
		).toThrow(/KAINBAIN_OIDC_ISSUER_URL/);
		expect(() => loadConfig({ KAINBAIN_AUTH_SESSION_TTL_MS: "10" })).toThrow(
			/KAINBAIN_AUTH_SESSION_TTL_MS/,
		);
	});

	it("redacts the OIDC client secret in the config spec", () => {
		const live = loadConfig({
			KAINBAIN_OIDC_CLIENT_SECRET: "super-secret-value",
		});
		const spec = getConfigSpec({
			config: live.config,
			sources: live.sources,
			warnings: live.warnings,
		});
		const entry = spec.entries.find(
			(item) => item.env === "KAINBAIN_OIDC_CLIENT_SECRET",
		);
		expect(entry).toBeDefined();
		expect(entry.secret).toBe(true);
		expect(entry.value).toBe(REDACTED_VALUE);
	});

	it("marks only the client secret as secret among the auth knobs", () => {
		const authEnvs = CONFIG_SCHEMA.filter(
			(entry) => entry.group === "auth",
		).map((entry) => entry.env);
		expect(authEnvs).toContain("KAINBAIN_AUTH_ENABLED");
		expect(authEnvs).toContain("KAINBAIN_OIDC_CLIENT_SECRET");
		const secrets = CONFIG_SCHEMA.filter(
			(entry) => entry.group === "auth" && entry.secret === true,
		).map((entry) => entry.env);
		expect(secrets).toEqual(["KAINBAIN_OIDC_CLIENT_SECRET"]);
	});
});
