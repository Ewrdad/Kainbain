import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: auth enforcement tests
 * @description Proves the PoC enforcement surface on the REAL wired server:
 *   with access control on, settings mutations answer 401 without a
 *   session and 403 for a viewer, admins pass through, runner routes and
 *   health checks stay untouched, and `/auth/me` reports the mode. The app
 *   is imported dynamically AFTER pointing KAINBAIN_AUTH_STATE_PATH at a
 *   temp dir, so the live `~/.kainbain/engine/auth/` is never touched.
 ***/

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-auth-enforce-"));
process.env.KAINBAIN_AUTH_STATE_PATH = stateDir;
process.env.KAINBAIN_AUTH_ENABLED = "true";

const { default: app, authService } = await import("../index.js");

await app.ready();

afterAll(async () => {
	await app.close();
	fs.rmSync(stateDir, { recursive: true, force: true });
});

const sessionCookieFor = async (sub, roles = []) => {
	authService.userStore.provisionFromSignIn({ sub, groups: [] });
	if (roles.length > 0) authService.userStore.setDirectRoles(sub, roles);
	const { sessionId } = authService.sessionStore.createSession({
		userId: sub,
	});
	return `kb_session=${sessionId}`;
};

describe("enforcement surface with access control ON", () => {
	it("answers 401 without a session on the settings mutations", async () => {
		for (const target of [
			{ method: "PUT", url: "/settings/prompt-layout", payload: {} },
			{ method: "POST", url: "/settings/prompt-layout/reset" },
			{ method: "PUT", url: "/push/settings", payload: {} },
		]) {
			const response = await app.inject(target);
			expect(`${target.method} ${target.url}: ${response.statusCode}`).toContain(
				"401",
			);
			expect(JSON.parse(response.payload).code).toBe("unauthenticated");
		}
	});

	it("answers 403 for a viewer and lets an admin through", async () => {
		const viewer = await sessionCookieFor("viewer-1", ["viewer"]);
		const denied = await app.inject({
			method: "POST",
			url: "/settings/prompt-layout/reset",
			headers: { cookie: viewer },
		});
		expect(denied.statusCode).toBe(403);
		expect(JSON.parse(denied.payload).code).toBe("forbidden");

		const admin = await sessionCookieFor("admin-1", ["admin"]);
		const allowed = await app.inject({
			method: "POST",
			url: "/settings/prompt-layout/reset",
			headers: { cookie: admin },
		});
		expect(allowed.statusCode).toBe(200);
	});

	it("leaves runner routes, health, docs, and the sign-in endpoints open", async () => {
		const runners = await app.inject({ method: "GET", url: "/runners" });
		expect(runners.statusCode).toBe(200);
		const health = await app.inject({ method: "GET", url: "/status/health" });
		expect(health.statusCode).toBe(200);
		const me = await app.inject({ method: "GET", url: "/auth/me" });
		expect(me.statusCode).toBe(200);
		expect(JSON.parse(me.payload)).toMatchObject({
			authEnabled: true,
			user: null,
		});
		const login = await app.inject({
			method: "GET",
			url: "/auth/login",
		});
		// No provider is configured in this environment: the endpoint must
		// fail as "unconfigured" (503), never as unauthenticated (401).
		expect(login.statusCode).toBe(503);
		expect(JSON.parse(login.payload).code).toBe("oidc_unconfigured");
	});

	it("attributes viewer sessions to their user on open routes", async () => {
		const viewer = await sessionCookieFor("viewer-2", ["viewer"]);
		const me = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: viewer },
		});
		expect(JSON.parse(me.payload)).toMatchObject({
			authEnabled: true,
			user: { id: "viewer-2" },
			roles: ["viewer"],
		});
	});
});
