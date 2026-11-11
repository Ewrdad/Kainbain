import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuthService } from "./service.js";
import {
	isPublicAuthPath,
	readProjectIdFromRequest,
} from "./middleware.js";
import { recordAuthAudit, auditFilePath } from "./auditLog.js";

/***
 * MARK: auth hook and guard tests
 * @description Locks the request lifecycle: OFF means builtin admin and open
 *   guards; ON means cookie → session → user → roles, with 401 for
 *   strangers and 403 for the wrong role, plus project-scoped checks and an
 *   audit trail that never throws.
 ***/

let stateDir = null;

beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-auth-hook-"));
});

afterEach(() => {
	if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
	stateDir = null;
});

const offService = () =>
	createAuthService({ schemaConfig: { authEnabled: false }, stateDir });

const onService = (overrides = {}) => {
	const service = createAuthService({
		schemaConfig: {
			authEnabled: true,
			authCookieName: "kb_session",
			authSessionTtlMs: 60 * 60 * 1000,
			authSessionIdleMs: 30 * 60 * 1000,
			authRoleManagerRoles: ["admin"],
			...overrides,
		},
		stateDir,
	});
	return service;
};

const replyDouble = () => {
	const sent = {};
	return {
		sent,
		code(status) {
			sent.status = status;
			return this;
		},
		send(payload) {
			sent.payload = payload;
			return this;
		},
	};
};

const signInUser = (service, { sub = "u1", roles = [] } = {}) => {
	const user =
		service.userStore.provisionFromSignIn({
			sub,
			email: `${sub}@example.com`,
			groups: [],
			authConfig: {},
		}) || service.userStore.findById(sub);
	if (roles.length > 0) service.userStore.setDirectRoles(user.id, roles);
	const { sessionId } = service.sessionStore.createSession({
		userId: user.id,
	});
	return { user: service.userStore.findById(user.id), sessionId };
};

describe("isPublicAuthPath", () => {
	it("opens health, docs, runners, ws, and the sign-in endpoints", () => {
		expect(isPublicAuthPath("/status/health")).toBe(true);
		expect(isPublicAuthPath("/docs")).toBe(true);
		expect(isPublicAuthPath("/agent")).toBe(true);
		expect(isPublicAuthPath("/runners/heartbeat")).toBe(true);
		expect(isPublicAuthPath("/ws?projectId=a")).toBe(true);
		expect(isPublicAuthPath("/auth/login")).toBe(true);
		expect(isPublicAuthPath("/auth/callback?code=x")).toBe(true);
		expect(isPublicAuthPath("/tasks")).toBe(false);
		expect(isPublicAuthPath("/docs-evil")).toBe(false);
		expect(isPublicAuthPath(null)).toBe(false);
	});
});

describe("readProjectIdFromRequest", () => {
	it("prefers params over query", () => {
		expect(readProjectIdFromRequest({ params: { projectId: "a" } })).toBe("a");
		expect(readProjectIdFromRequest({ query: { projectId: "b" } })).toBe("b");
		expect(readProjectIdFromRequest({})).toBeNull();
	});
});

describe("request hook with auth OFF", () => {
	it("attributes every request to the builtin admin", async () => {
		const service = offService();
		const request = { headers: {}, params: {}, query: {} };
		await service.requestHook(request);
		expect(request.user.id).toBe("admin");
		expect(request.user.builtin).toBe(true);
		expect(request.auth).toMatchObject({ enabled: false, roles: ["admin"] });
	});

	it("leaves guards open", async () => {
		const service = offService();
		const request = { headers: {}, params: {}, query: {} };
		await service.requestHook(request);
		const reply = replyDouble();
		await service.guards.requireRole(["admin"])(request, reply);
		expect(reply.sent.status).toBeUndefined();
	});
});

describe("request hook with auth ON", () => {
	it("resolves a live session to its user and roles", async () => {
		const service = onService();
		const { user, sessionId } = signInUser(service, { roles: ["member"] });
		const request = {
			headers: { cookie: `kb_session=${sessionId}` },
			params: {},
			query: {},
		};
		await service.requestHook(request);
		expect(request.user.id).toBe(user.id);
		expect(request.auth).toMatchObject({
			enabled: true,
			roles: ["member"],
			userId: user.id,
		});
	});

	it("yields no user for a missing, unknown, or disabled identity", async () => {
		const service = onService();
		const bare = { headers: {}, params: {}, query: {} };
		await service.requestHook(bare);
		expect(bare.user).toBeNull();
		expect(bare.auth.roles).toEqual([]);

		const { user, sessionId } = signInUser(service);
		service.userStore.setDisabled(user.id, true);
		const disabled = {
			headers: { cookie: `kb_session=${sessionId}` },
			params: {},
			query: {},
		};
		await service.requestHook(disabled);
		expect(disabled.user).toBeNull();
	});
});

describe("requireRole with auth ON", () => {
	it("sends 401 without a user and 403 without the role", async () => {
		const service = onService();
		const stranger = { headers: {}, user: null, auth: { enabled: true, roles: [] } };
		const noUser = replyDouble();
		await service.guards.requireRole(["admin"])(stranger, noUser);
		expect(noUser.sent.status).toBe(401);

		const { sessionId } = signInUser(service, { sub: "viewer-1", roles: ["viewer"] });
		const viewer = {
			headers: { cookie: `kb_session=${sessionId}` },
			params: {},
			query: {},
		};
		await service.requestHook(viewer);
		const denied = replyDouble();
		await service.guards.requireRole(["admin"])(viewer, denied);
		expect(denied.sent.status).toBe(403);
		expect(denied.sent.payload.code).toBe("forbidden");

		const allowed = replyDouble();
		await service.guards.requireRole(["viewer"])(viewer, allowed);
		expect(allowed.sent.status).toBeUndefined();
	});

	it("lets admin through any requirement and honours project scope", async () => {
		const service = onService();
		const { sessionId } = signInUser(service, { sub: "admin-1", roles: ["admin"] });
		const request = {
			headers: { cookie: `kb_session=${sessionId}` },
			params: {},
			query: {},
		};
		await service.requestHook(request);
		const reply = replyDouble();
		await service.guards.requireRole(["member"])(request, reply);
		expect(reply.sent.status).toBeUndefined();

		const scoped = signInUser(service, { sub: "scoped-1", roles: [] });
		service.userStore.setProjectRoles(scoped.user.id, "alpha", ["member"]);
		const scopedRequest = {
			headers: { cookie: `kb_session=${scoped.sessionId}` },
			params: {},
			query: {},
		};
		await service.requestHook(scopedRequest);
		const projectGuard = service.guards.requireRole(["member"], {
			projectIdFrom: () => "alpha",
		});
	 const ok = replyDouble();
		await projectGuard(scopedRequest, ok);
		expect(ok.sent.status).toBeUndefined();
		const otherGuard = service.guards.requireRole(["member"], {
			projectIdFrom: () => "beta",
		});
		const denied = replyDouble();
		await otherGuard(scopedRequest, denied);
		expect(denied.sent.status).toBe(403);
	});
});

describe("createAuthService", () => {
	it("resolves websocket users per mode", () => {
		const off = offService();
		expect(off.resolveWsUser({ headers: {} }).id).toBe("admin");
		const on = onService();
		expect(on.resolveWsUser({ headers: {} })).toBeNull();
		const { sessionId } = signInUser(on);
		expect(
			on.resolveWsUser({ headers: { cookie: `kb_session=${sessionId}` } }).id,
		).toBe("u1");
	});
});

describe("recordAuthAudit", () => {
	it("appends JSON lines and never throws", () => {
		expect(
			recordAuthAudit({
				stateDir,
				actor: "admin",
				action: "user.role.set",
				detail: { userId: "u1", roles: ["member"] },
			}),
		).toBe(true);
		const lines = fs
			.readFileSync(auditFilePath(stateDir), "utf8")
			.trim()
			.split("\n");
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0])).toMatchObject({
			actor: "admin",
			action: "user.role.set",
		});
		expect(recordAuthAudit({ stateDir: "", action: "x" })).toBe(false);
		expect(recordAuthAudit({ stateDir, action: "" })).toBe(false);
	});
});
