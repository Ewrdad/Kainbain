import { tempProjectsRoot, tempNotesRoot } from "../isolatedTestRoots.js";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/***
 * MARK: apiKeys enforcement tests
 * @description Proves the API-key system on the REAL wired server with both
 *   switches on: keys are authorised exactly per their grants on task
 *   creation (unknown/expired/revoked → 401, out-of-grant → 403, granted →
 *   200), every key action is flagged by key name in task history and the
 *   audit log, sessions win over keys, keys stay off management routes, and
 *   the Runner credential channel plus UI session flows work unchanged with
 *   the feature on and off. The app is imported dynamically AFTER pointing
 *   KAINBAIN_AUTH_STATE_PATH at a temp dir, so live state is never touched.
 ***/

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-apikey-enforce-"));
process.env.KAINBAIN_AUTH_STATE_PATH = stateDir;
process.env.KAINBAIN_AUTH_ENABLED = "true";
process.env.KAINBAIN_API_KEYS_ENABLED = "true";
process.env.KAINBAIN_RUNNER_JOIN_TOKEN = "test-join-token";

const { default: app, authService } = await import("../index.js");

await app.ready();

afterAll(async () => {
	await app.close();
	fs.rmSync(stateDir, { recursive: true, force: true });
	try {
		fs.rmSync(tempProjectsRoot, { recursive: true, force: true });
		fs.rmSync(tempNotesRoot, { recursive: true, force: true });
	} catch {
		// ignore cleanup errors
	}
});

const FACTS = {
	harnesses: [{ id: "mock", version: "0.0.0" }],
	models: ["mock-model"],
	tiers: ["T0", "T1"],
	diskHeadroomMb: 1024,
	versions: { protocol: "v1", runner: "test" },
};

const sessionCookieFor = async (sub, roles = []) => {
	authService.userStore.provisionFromSignIn({ sub, groups: [] });
	if (roles.length > 0) authService.userStore.setDirectRoles(sub, roles);
	const { sessionId } = authService.sessionStore.createSession({
		userId: sub,
	});
	return `kb_session=${sessionId}`;
};

const makeKey = (fields) =>
	authService.apiKeyStore.createApiKey({
		createdBy: "admin-1",
		...fields,
	});

const keyHeaders = (secret, style = "bearer") =>
	style === "alias"
		? { "x-api-key": secret }
		: { authorization: `Bearer ${secret}` };

let projectId = null;
let adminCookie = null;
let memberCookie = null;
let viewerCookie = null;

beforeAll(async () => {
	adminCookie = await sessionCookieFor("admin-1", ["admin"]);
	memberCookie = await sessionCookieFor("member-1", ["member"]);
	viewerCookie = await sessionCookieFor("viewer-1", ["viewer"]);
	const created = await app.inject({
		method: "POST",
		url: "/projects",
		headers: { cookie: adminCookie },
		payload: {
			name: "API Key Fixture",
			gitUrl: "https://git.example.com/team/apikey-fixture.git",
		},
	});
	expect(created.statusCode).toBe(201);
	projectId = JSON.parse(created.payload).id;
});

let ticketCounter = 0;
const createTask = (headers, extra = {}) => {
	ticketCounter += 1;
	return app.inject({
		method: "POST",
		url: "/tasks",
		headers,
		payload: { projectId, goal: `Scanner ticket ${ticketCounter}`, ...extra },
	});
};

describe("API-key grant matrix on task creation", () => {
	it("answers 401 without credentials and for unknown secrets", async () => {
		const anon = await createTask({});
		expect(anon.statusCode).toBe(401);
		expect(JSON.parse(anon.payload).code).toBe("unauthenticated");

		const bogus = await createTask(keyHeaders("kb_thiskeydoesnotexist"));
		expect(bogus.statusCode).toBe(401);
		expect(JSON.parse(bogus.payload).code).toBe("unauthenticated");
	});

	it("answers 401 for expired and revoked keys", async () => {
		const expired = makeKey({
			name: "expired-key",
			roles: ["member"],
			expiresAt: "2000-01-01T00:00:00.000Z",
		});
		const expiredRes = await createTask(keyHeaders(expired.secret));
		expect(expiredRes.statusCode).toBe(401);

		const doomed = makeKey({ name: "doomed-key", roles: ["member"] });
		authService.apiKeyStore.revokeApiKey(doomed.key.id);
		const revokedRes = await createTask(keyHeaders(doomed.secret));
		expect(revokedRes.statusCode).toBe(401);
	});

	it("answers 403 for valid keys outside their grants", async () => {
		const viewerKey = makeKey({ name: "viewer-key", roles: ["viewer"] });
		const roleDenied = await createTask(keyHeaders(viewerKey.secret));
		expect(roleDenied.statusCode).toBe(403);
		expect(JSON.parse(roleDenied.payload).code).toBe("forbidden");

		const readOnly = makeKey({
			name: "read-only-key",
			roles: ["member"],
			scopes: ["tasks:read"],
		});
		const scopeDenied = await createTask(keyHeaders(readOnly.secret));
		expect(scopeDenied.statusCode).toBe(403);
	});

	it("lets granted keys and sessions create tasks", async () => {
		const writer = makeKey({
			name: "writer-key",
			roles: ["member"],
			scopes: ["tasks:create"],
		});
		const viaBearer = await createTask(keyHeaders(writer.secret));
		expect(viaBearer.statusCode).toBe(200);

		const aliasWriter = makeKey({ name: "alias-key", roles: ["member"] });
		const viaAlias = await createTask(keyHeaders(aliasWriter.secret, "alias"));
		expect(viaAlias.statusCode).toBe(200);

		const viaSession = await createTask({ cookie: memberCookie });
		expect(viaSession.statusCode).toBe(200);

		const adminViaSession = await createTask({ cookie: adminCookie });
		expect(adminViaSession.statusCode).toBe(200);
	});

	it("lets sessions win when both a session and a key are sent", async () => {
		const adminKey = makeKey({ name: "spare-admin-key", roles: ["admin"] });
		// The admin key alone could create; paired with a viewer session,
		// the viewer session decides → 403.
		const both = await createTask({
			cookie: viewerCookie,
			...keyHeaders(adminKey.secret),
		});
		expect(both.statusCode).toBe(403);
	});
});

describe("API-key attribution", () => {
	it("flags key creations and edits by key name in task history", async () => {
		const scanner = makeKey({ name: "security-scanner", roles: ["member"] });
		const created = await createTask(keyHeaders(scanner.secret), {
			goal: "Patch the thing",
		});
		expect(created.statusCode).toBe(200);
		const taskId = JSON.parse(created.payload).id;

		const read = await app.inject({
			method: "GET",
			url: `/tasks/${taskId}?projectId=${projectId}`,
		});
		expect(read.statusCode).toBe(200);
		const actions = (JSON.parse(read.payload).history || []).map(
			(entry) => entry.action,
		);
		expect(actions).toContain("Task created by api-key:security-scanner");

		const patched = await app.inject({
			method: "PATCH",
			url: `/tasks/${taskId}`,
			headers: keyHeaders(scanner.secret),
			payload: { projectId, title: "Patched by scanner" },
		});
		expect(patched.statusCode).toBe(200);

		const reread = await app.inject({
			method: "GET",
			url: `/tasks/${taskId}?projectId=${projectId}`,
		});
		const actionsAfter = (JSON.parse(reread.payload).history || []).map(
			(entry) => entry.action,
		);
		expect(actionsAfter).toContain(
			"Task details edited by api-key:security-scanner",
		);
	});

	it("keeps human history strings identical", async () => {
		const created = await createTask({ cookie: memberCookie });
		const taskId = JSON.parse(created.payload).id;
		const patched = await app.inject({
			method: "PATCH",
			url: `/tasks/${taskId}`,
			headers: { cookie: memberCookie },
			payload: { projectId, title: "Patched by human" },
		});
		expect(patched.statusCode).toBe(200);
		const read = await app.inject({
			method: "GET",
			url: `/tasks/${taskId}?projectId=${projectId}`,
		});
		const actions = (JSON.parse(read.payload).history || []).map(
			(entry) => entry.action,
		);
		expect(actions).toContain("Task details edited");
		expect(actions.some((action) => action.includes("api-key:"))).toBe(false);
	});

	it("records key usage in the audit log and usage view, never secrets", async () => {
		const watched = makeKey({ name: "watched-key", roles: ["member"] });
		await createTask(keyHeaders(watched.secret));
		await createTask(keyHeaders("kb_bogus-secret-value"));

		const usage = await app.inject({
			method: "GET",
			url: `/auth/api-keys/${watched.key.id}/usage`,
			headers: { cookie: adminCookie },
		});
		expect(usage.statusCode).toBe(200);
		const entries = JSON.parse(usage.payload).usage;
		expect(entries.length).toBeGreaterThan(0);
		expect(
			entries.every((entry) => entry.detail?.keyId === watched.key.id),
		).toBe(true);
		expect(entries.some((entry) => entry.action === "apikey.used")).toBe(true);

		const auditRaw = fs.readFileSync(path.join(stateDir, "audit.jsonl"), "utf8");
		expect(auditRaw).toContain("api-key:watched-key");
		expect(auditRaw).not.toContain(watched.secret);
		expect(auditRaw).not.toContain("kb_bogus-secret-value");
	});
});

describe("keys stay off management surfaces", () => {
	it("answers 403 for keys on key/user/settings administration", async () => {
		const adminKey = makeKey({ name: "admin-key", roles: ["admin"] });
		for (const target of [
			{ method: "GET", url: "/auth/api-keys" },
			{ method: "POST", url: "/auth/api-keys", payload: { name: "x" } },
			{ method: "GET", url: "/auth/users" },
			{ method: "PUT", url: "/settings/prompt-layout", payload: {} },
			{ method: "PUT", url: "/push/settings", payload: {} },
		]) {
			const response = await app.inject({
				...target,
				headers: keyHeaders(adminKey.secret),
			});
			expect(`${target.method} ${target.url}: ${response.statusCode}`).toContain(
				"403",
			);
		}
	});
});

describe("Runner and UI flows with keys ON", () => {
	it("runs register → approve → heartbeat → claim → read → progress on the runner channel", async () => {
		const taskRes = await createTask({ cookie: adminCookie });
		const taskId = JSON.parse(taskRes.payload).id;

		const reg = await app.inject({
			method: "POST",
			url: "/runners/register",
			payload: {
				runnerId: "keys-on-runner",
				joinToken: "test-join-token",
				facts: FACTS,
			},
		});
		expect(reg.statusCode).toBe(202);

		const approval = await app.inject({
			method: "POST",
			url: "/runners/keys-on-runner/approve",
		});
		expect(approval.statusCode).toBe(200);
		const credential = JSON.parse(approval.payload).credential;
		const runnerHeaders = { "x-runner-credential": credential };

		const beat = await app.inject({
			method: "POST",
			url: "/runners/heartbeat",
			headers: runnerHeaders,
			payload: { runnerId: "keys-on-runner", facts: FACTS },
		});
		expect(beat.statusCode).toBe(200);

		const claim = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/claim`,
			headers: runnerHeaders,
			payload: { runnerId: "keys-on-runner", projectId },
		});
		expect(claim.statusCode).toBe(200);
		const { executionId, epoch } = JSON.parse(claim.payload);

		// The daemon fetches task detail over plain GET with only its runner
		// credential: reads stay open so this works in every mode.
		const read = await app.inject({
			method: "GET",
			url: `/tasks/${taskId}?projectId=${projectId}`,
			headers: runnerHeaders,
		});
		expect(read.statusCode).toBe(200);

		const progress = await app.inject({
			method: "POST",
			url: `/tasks/${taskId}/progress`,
			headers: runnerHeaders,
			payload: {
				projectId,
				executionId,
				epoch,
				stageId: "Development",
				event: "started",
			},
		});
		expect(progress.statusCode).toBe(200);
	});

	it("keeps cookie login, guarded settings, and logout working", async () => {
		const me = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: adminCookie },
		});
		expect(JSON.parse(me.payload)).toMatchObject({
			authEnabled: true,
			apiKeysEnabled: true,
			user: { id: "admin-1" },
		});

		const allowed = await app.inject({
			method: "POST",
			url: "/settings/prompt-layout/reset",
			headers: { cookie: adminCookie },
		});
		expect(allowed.statusCode).toBe(200);

		const freshCookie = await sessionCookieFor("logout-1", ["member"]);
		const logout = await app.inject({
			method: "POST",
			url: "/auth/logout",
			headers: { cookie: freshCookie },
		});
		expect(logout.statusCode).toBe(200);
		const meAfter = await app.inject({
			method: "GET",
			url: "/auth/me",
			headers: { cookie: freshCookie },
		});
		expect(JSON.parse(meAfter.payload).user).toBeNull();
	});
});

describe("key switch OFF ignores key headers", () => {
	it("reads keys as strangers while access control stays on", async () => {
		const key = makeKey({ name: "toggle-key", roles: ["member"] });
		const before = await createTask(keyHeaders(key.secret));
		expect(before.statusCode).toBe(200);

		const saved = await app.inject({
			method: "PUT",
			url: "/auth/settings",
			headers: { cookie: adminCookie },
			payload: { apiKeysEnabled: false },
		});
		expect(JSON.parse(saved.payload).apiKeysEnabled).toBe(false);

		try {
			const ignored = await createTask(keyHeaders(key.secret));
			expect(ignored.statusCode).toBe(401);
		} finally {
			await app.inject({
				method: "PUT",
				url: "/auth/settings",
				headers: { cookie: adminCookie },
				payload: { apiKeysEnabled: true },
			});
		}

		const after = await createTask(keyHeaders(key.secret));
		expect(after.statusCode).toBe(200);
	});
});

describe("2x2 cell: access control OFF with keys ON", () => {
	it("keeps allow-all for keyless traffic, still recognises and scopes keys, and leaves the runner channel alone", async () => {
		const key = makeKey({ name: "keys-only-cell", roles: ["member"] });

		// Flip access control off while keys stay on (runtime settings).
		const saved = await app.inject({
			method: "PUT",
			url: "/auth/settings",
			headers: { cookie: adminCookie },
			payload: { authEnabled: false },
		});
		expect(JSON.parse(saved.payload).enabled).toBe(false);

		try {
			// Keyless requests stay allow-all — byte-identical to the
			// default install: no credentials, no 401.
			const anon = await createTask({});
			expect(anon.statusCode).toBe(200);

			// A valid key is still attributed and scoped, and the task
			// history still flags the key name.
			const viaKey = await createTask(keyHeaders(key.secret), {
				goal: "Key-only cell ticket",
			});
			expect(viaKey.statusCode).toBe(200);
			const keyTaskId = JSON.parse(viaKey.payload).id;
			const keyRead = await app.inject({
				method: "GET",
				url: `/tasks/${keyTaskId}?projectId=${projectId}`,
			});
			const keyActions = (JSON.parse(keyRead.payload).history || []).map(
				(entry) => entry.action,
			);
			expect(keyActions).toContain("Task created by api-key:keys-only-cell");

			// A presented-but-unknown key is still rejected on guarded
			// routes — bad credentials never silently degrade to allow-all.
			const bogus = await createTask(keyHeaders("kb_not-a-real-key"));
			expect(bogus.statusCode).toBe(401);

			// /auth/me reflects the cell: builtin for keyless traffic,
			// key identity for key traffic.
			const meAnon = await app.inject({ method: "GET", url: "/auth/me" });
			expect(JSON.parse(meAnon.payload)).toMatchObject({
				authEnabled: false,
				apiKeysEnabled: true,
				user: { builtin: true },
			});
			const meKey = await app.inject({
				method: "GET",
				url: "/auth/me",
				headers: keyHeaders(key.secret),
			});
			expect(JSON.parse(meKey.payload).user).toMatchObject({
				name: "api-key:keys-only-cell",
				apiKey: true,
			});

			// The runner credential channel is untouched in this cell too.
			const reg = await app.inject({
				method: "POST",
				url: "/runners/register",
				payload: {
					runnerId: "keys-only-runner",
					joinToken: "test-join-token",
					facts: FACTS,
				},
			});
			expect(reg.statusCode).toBe(202);
			const approval = await app.inject({
				method: "POST",
				url: "/runners/keys-only-runner/approve",
			});
			expect(approval.statusCode).toBe(200);
			const beat = await app.inject({
				method: "POST",
				url: "/runners/heartbeat",
				headers: {
					"x-runner-credential": JSON.parse(approval.payload).credential,
				},
				payload: { runnerId: "keys-only-runner", facts: FACTS },
			});
			expect(beat.statusCode).toBe(200);
		} finally {
			await app.inject({
				method: "PUT",
				url: "/auth/settings",
				headers: { cookie: adminCookie },
				payload: { authEnabled: true },
			});
		}

		// Back in the (ON, ON) cell: keyless traffic is 401 again.
		const anonAgain = await createTask({});
		expect(anonAgain.statusCode).toBe(401);
	});
});
