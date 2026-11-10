import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import Fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuthService } from "./service.js";
import { buildAuthRoutes, PENDING_AUTH_COOKIE } from "./routes.js";
import { startMockOidcProvider } from "../test-helpers/mockOidcProvider.js";

/***
 * MARK: auth routes tests
 * @description Drives the real `/auth/*` endpoints against a real mock OIDC
 *   provider over loopback HTTP: the full code flow (login redirect,
 *   callback exchange, session cookie), logout, `me`, and every admin API
 *   (users, project roles, disabling, group mappings, settings), in both
 *   access-control modes plus every rejection shape.
 ***/

const provider = await startMockOidcProvider({
	clientId: "kainbain",
	clientSecret: "topsecret",
});

afterAll(async () => {
	await provider.stop();
});

let stateDir = null;
let app = null;

const schemaConfig = (overrides = {}) => ({
	authEnabled: true,
	authIssuerUrl: provider.issuerUrl,
	authClientId: "kainbain",
	authClientSecret: "topsecret",
	authRedirectUri: "",
	publicKbUrl: "http://localhost:3100",
	authScopes: "openid profile email groups",
	authGroupsClaim: "groups",
	authAdminGroup: "",
	authBootstrapAdmins: [],
	authSessionTtlMs: 60 * 60 * 1000,
	authSessionIdleMs: 30 * 60 * 1000,
	authCookieName: "kb_session",
	authRoleManagerRoles: ["admin"],
	authStatePath: "",
	...overrides,
});

const buildApp = async (overrides = {}) => {
	const service = createAuthService({
		schemaConfig: schemaConfig(overrides),
		stateDir,
	});
	const next = Fastify();
	next.addHook("onRequest", service.requestHook);
	await next.register(buildAuthRoutes({ authService: service }));
	await next.ready();
	return { app: next, service };
};

const setCookiesOf = (response) => {
	const raw = response.headers["set-cookie"] || [];
	const list = Array.isArray(raw) ? raw : [raw];
	return list.map((entry) => entry.split(";")[0]).join("; ");
};

const cookieValue = (cookieHeader, name) => {
	for (const pair of cookieHeader.split(";")) {
		const index = pair.indexOf("=");
		if (pair.slice(0, index).trim() === name) return pair.slice(index + 1);
	}
	return null;
};

const pendingAttemptOf = (cookieHeader) =>
	JSON.parse(
		Buffer.from(cookieValue(cookieHeader, PENDING_AUTH_COOKIE), "base64url").toString(
			"utf8",
		),
	);

const loginAttempt = async (target) => {
	const response = await target.inject({ method: "GET", url: "/auth/login" });
	expect(response.statusCode).toBe(302);
	const location = response.headers.location;
	expect(location).toContain("/authorize");
	const cookies = setCookiesOf(response);
	const attempt = pendingAttemptOf(cookies);
	const state = new URL(location).searchParams.get("state");
	expect(state).toBe(attempt.state);
	return { location, cookies, attempt, state };
};

beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-auth-routes-"));
});

afterEach(async () => {
	if (app) {
		await app.close();
		app = null;
	}
	if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
	stateDir = null;
});

describe("sign-in flow against the mock provider", () => {
	it("completes the code flow and attributes later requests", async () => {
		const built = await buildApp();
		app = built.app;
		const { cookies, attempt, state } = await loginAttempt(app);
		const { code } = await provider.issueCode({
			nonce: attempt.nonce,
			sub: "ada-1",
			email: "ada@example.com",
			name: "Ada",
			groups: ["team"],
		});
		const callback = await app.inject({
			method: "GET",
			url: `/auth/callback?code=${code}&state=${state}`,
			headers: { cookie: cookies },
		});
		expect(callback.statusCode).toBe(302);
		expect(callback.headers.location).toBe("/");
		const session = setCookiesOf(callback);
		expect(session).toContain("kb_session=");

		const me = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: session },
		});
		expect(me.statusCode).toBe(200);
		expect(JSON.parse(me.payload)).toMatchObject({
			authEnabled: true,
			user: { id: "ada-1", email: "ada@example.com", name: "Ada" },
			roles: [],
		});

		// Group mappings apply from the next request without re-sign-in.
		built.service.authConfig.save({ groupRoleMappings: { team: ["member"] } });
		const meAfter = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: session },
		});
		expect(JSON.parse(meAfter.payload).roles).toEqual(["member"]);

		const logout = await app.inject({
			method: "POST",
			url: "/auth/logout",
			headers: { cookie: session },
		});
		expect(JSON.parse(logout.payload)).toEqual({ ok: true });
		const afterLogout = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: session },
		});
		expect(JSON.parse(afterLogout.payload).user).toBeNull();
	});

	it("bounces provider refusals back to the login page", async () => {
		const built = await buildApp();
		app = built.app;
		const refused = await app.inject({
			method: "GET",
			url: "/auth/callback?error=access_denied&error_description=not+today",
		});
		expect(refused.statusCode).toBe(302);
		expect(refused.headers.location).toContain("/#/login?error=access_denied");
	});

	it("rejects replayed state, wrong nonces, and disabled accounts", async () => {
		const built = await buildApp();
		app = built.app;
		const { cookies, attempt, state } = await loginAttempt(app);

		const tampered = await app.inject({
			method: "GET",
			url: `/auth/callback?code=whatever&state=nope`,
			headers: { cookie: cookies },
		});
		expect(tampered.statusCode).toBe(400);
		expect(JSON.parse(tampered.payload).code).toBe("invalid_state");

		const wrongNonce = await provider.issueCode({
			nonce: "not-the-attempt-nonce",
			sub: "mallory",
		});
		const nonceMismatch = await app.inject({
			method: "GET",
			url: `/auth/callback?code=${wrongNonce.code}&state=${state}`,
			headers: { cookie: cookies },
		});
		expect(nonceMismatch.statusCode).toBe(401);

		const { code } = await provider.issueCode({
			nonce: attempt.nonce,
			sub: "blocked-1",
		});
		built.service.userStore.provisionFromSignIn({ sub: "blocked-1" });
		built.service.userStore.setDisabled("blocked-1", true);
		const blocked = await app.inject({
			method: "GET",
			url: `/auth/callback?code=${code}&state=${state}`,
			headers: { cookie: cookies },
		});
		expect(blocked.statusCode).toBe(403);
		expect(JSON.parse(blocked.payload).code).toBe("account_disabled");
	});

	it("maps the admin group and bootstrap admins to admin", async () => {
		const built = await buildApp({ authAdminGroup: "kainbain-admins" });
		app = built.app;
		const { cookies, attempt, state } = await loginAttempt(app);
		const { code } = await provider.issueCode({
			nonce: attempt.nonce,
			sub: "boss-1",
			groups: ["kainbain-admins"],
		});
		const callback = await app.inject({
			method: "GET",
			url: `/auth/callback?code=${code}&state=${state}`,
			headers: { cookie: cookies },
		});
		expect(callback.statusCode).toBe(302);
		const me = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: setCookiesOf(callback) },
		});
		expect(JSON.parse(me.payload).roles).toEqual(["admin"]);
	});
});

describe("admin APIs", () => {
	const signInAs = async (target, service, { sub, roles }) => {
		service.userStore.provisionFromSignIn({ sub, groups: [] });
		if (roles?.length) service.userStore.setDirectRoles(sub, roles);
		const { sessionId } = service.sessionStore.createSession({ userId: sub });
		const request = {
			headers: { cookie: `kb_session=${sessionId}` },
			params: {},
			query: {},
		};
		await service.requestHook(request);
		return { request, cookie: `kb_session=${sessionId}` };
	};

	it("lets managers list users, set roles, and map groups", async () => {
		const built = await buildApp();
		app = built.app;
		const admin = await signInAs(app, built.service, {
			sub: "root",
			roles: ["admin"],
		});
		const member = await signInAs(app, built.service, { sub: "pleb" });

		const strangerList = await app.inject({
			method: "GET",
			url: "/auth/users",
		});
		expect(strangerList.statusCode).toBe(401);

		const viewerList = await app.inject({
			method: "GET",
			url: "/auth/users",
			headers: { cookie: member.cookie },
		});
		expect(viewerList.statusCode).toBe(403);

		const list = await app.inject({
			method: "GET",
			url: "/auth/users",
			headers: { cookie: admin.cookie },
		});
		expect(list.statusCode).toBe(200);
		expect(JSON.parse(list.payload).users.map((user) => user.id).sort()).toEqual([
			"pleb",
			"root",
		]);

		const setRole = await app.inject({
			method: "PUT",
			url: "/auth/users/pleb/roles",
			headers: { cookie: admin.cookie },
			payload: { roles: ["member", "owner"] },
		});
		expect(JSON.parse(setRole.payload).user.directRoles).toEqual(["member"]);

		const setProjectRole = await app.inject({
			method: "PUT",
			url: "/auth/users/pleb/projects/alpha/roles",
			headers: { cookie: admin.cookie },
			payload: { roles: ["viewer"] },
		});
		expect(
			JSON.parse(setProjectRole.payload).user.projectRoles,
		).toEqual({ alpha: ["viewer"] });

		const missing = await app.inject({
			method: "PUT",
			url: "/auth/users/ghost/roles",
			headers: { cookie: admin.cookie },
			payload: { roles: ["member"] },
		});
		expect(missing.statusCode).toBe(404);

		const mappings = await app.inject({
			method: "PUT",
			url: "/auth/group-mappings",
			headers: { cookie: admin.cookie },
			payload: { mappings: { team: ["member", "owner"] } },
		});
		expect(JSON.parse(mappings.payload).mappings).toEqual({
			team: ["member"],
		});

		const badMappings = await app.inject({
			method: "PUT",
			url: "/auth/group-mappings",
			headers: { cookie: admin.cookie },
			payload: { mappings: ["nope"] },
		});
		expect(badMappings.statusCode).toBe(400);
	});

	it("disables users but never lets an admin disable themselves", async () => {
		const built = await buildApp();
		app = built.app;
		const admin = await signInAs(app, built.service, {
			sub: "root",
			roles: ["admin"],
		});
		await signInAs(app, built.service, { sub: "pleb" });

		const self = await app.inject({
			method: "PUT",
			url: "/auth/users/root/disabled",
			headers: { cookie: admin.cookie },
			payload: { disabled: true },
		});
		expect(self.statusCode).toBe(400);
		expect(JSON.parse(self.payload).code).toBe("cannot_disable_self");

		const bad = await app.inject({
			method: "PUT",
			url: "/auth/users/pleb/disabled",
			headers: { cookie: admin.cookie },
			payload: { disabled: "yes" },
		});
		expect(bad.statusCode).toBe(400);

		const disabled = await app.inject({
			method: "PUT",
			url: "/auth/users/pleb/disabled",
			headers: { cookie: admin.cookie },
			payload: { disabled: true },
		});
		expect(JSON.parse(disabled.payload).user.disabled).toBe(true);
	});

	it("reads and writes settings without leaking the client secret", async () => {
		const built = await buildApp();
		app = built.app;
		const admin = await signInAs(app, built.service, {
			sub: "root",
			roles: ["admin"],
		});

		const settings = await app.inject({
			method: "GET",
			url: "/auth/settings",
			headers: { cookie: admin.cookie },
		});
		const view = JSON.parse(settings.payload);
		expect(view.knownRoles).toEqual(["admin", "member", "viewer"]);
		expect(view.hasClientSecret).toBe(true);
		expect(view.clientSecret).toBeUndefined();
		expect(view.effectiveRedirectUri).toContain("/api/auth/callback");

		const saved = await app.inject({
			method: "PUT",
			url: "/auth/settings",
			headers: { cookie: admin.cookie },
			payload: { authGroupsClaim: "memberOf", authSessionTtlMs: 1000 },
		});
		expect(JSON.parse(saved.payload).groupsClaim).toBe("memberOf");

		const badTtl = await app.inject({
			method: "PUT",
			url: "/auth/settings",
			headers: { cookie: admin.cookie },
			payload: { authSessionTtlMs: -5 },
		});
		expect(badTtl.statusCode).toBe(400);

		const badFlag = await app.inject({
			method: "PUT",
			url: "/auth/settings",
			headers: { cookie: admin.cookie },
			payload: { authEnabled: "yes" },
		});
		expect(badFlag.statusCode).toBe(400);
	});
});

describe("access control OFF", () => {
	it("reports the builtin admin and leaves login unavailable", async () => {
		const built = await buildApp({ authEnabled: false });
		app = built.app;
		const me = await app.inject({ method: "GET", url: "/auth/me" });
		expect(JSON.parse(me.payload)).toMatchObject({
			authEnabled: false,
			user: { id: "admin", builtin: true },
			roles: ["admin"],
		});
		const login = await app.inject({ method: "GET", url: "/auth/login" });
		expect(login.statusCode).toBe(404);
		const users = await app.inject({ method: "GET", url: "/auth/users" });
		expect(users.statusCode).toBe(200);
	});
});
