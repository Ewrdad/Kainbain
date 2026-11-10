import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	createSessionStore,
	hashSessionId,
	newSessionId,
	shouldUseSecureCookie,
	buildSessionCookie,
	buildClearedCookie,
	readSessionIdFromHeader,
} from "./sessionStore.js";

/***
 * MARK: sessionStore tests
 * @description Locks opaque session ids, at-rest hashing, absolute and idle
 *   expiry, sliding refresh, revocation, and cookie flag rules.
 ***/

let stateDir = null;

beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-auth-sessions-"));
});

afterEach(() => {
	if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
	stateDir = null;
});

describe("hashSessionId and newSessionId", () => {
	it("hashes deterministically and mints unique ids", () => {
		expect(hashSessionId("abc")).toBe(hashSessionId("abc"));
		expect(hashSessionId("abc")).not.toBe(hashSessionId("abd"));
		expect(newSessionId()).not.toBe(newSessionId());
	});
});

describe("shouldUseSecureCookie", () => {
	it("secures https everywhere and plain http only on loopback", () => {
		expect(
			shouldUseSecureCookie({ protocol: "https:", hostname: "example.com" }),
		).toBe(true);
		expect(
			shouldUseSecureCookie({ protocol: "http:", hostname: "localhost" }),
		).toBe(true);
		expect(
			shouldUseSecureCookie({ protocol: "http:", hostname: "127.0.0.1" }),
		).toBe(true);
		expect(
			shouldUseSecureCookie({ protocol: "http:", hostname: "kb.lan" }),
		).toBe(false);
		expect(shouldUseSecureCookie({})).toBe(false);
	});
});

describe("buildSessionCookie and buildClearedCookie", () => {
	it("renders HttpOnly SameSite=Lax cookies with optional Secure", () => {
		expect(
			buildSessionCookie({
				sessionId: "s",
				cookieName: "kb_session",
				secure: false,
			}),
		).toBe("kb_session=s; Path=/; HttpOnly; SameSite=Lax");
		expect(
			buildSessionCookie({
				sessionId: "s",
				cookieName: "kb_session",
				secure: true,
				maxAgeMs: 60000,
			}),
		).toContain("Secure");
		expect(buildClearedCookie("kb_session")).toContain("Max-Age=0");
	});
});

describe("readSessionIdFromHeader", () => {
	it("finds the session cookie among pairs and skips garbage", () => {
		expect(
			readSessionIdFromHeader("a=1; kb_session=s3cr3t; b=2", "kb_session"),
		).toBe("s3cr3t");
		expect(readSessionIdFromHeader("a=1", "kb_session")).toBeNull();
		expect(readSessionIdFromHeader(null, "kb_session")).toBeNull();
		expect(readSessionIdFromHeader("kb_session=%ZZ", "kb_session")).toBeNull();
	});
});

describe("createSessionStore", () => {
	it("creates, looks up, and destroys sessions", () => {
		const store = createSessionStore({ stateDir });
		const { sessionId, record } = store.createSession({ userId: "u1" });
		expect(typeof sessionId).toBe("string");
		expect(record.userId).toBe("u1");
		expect(store.lookupSession(sessionId, {}).userId).toBe("u1");
		expect(store.lookupSession("nope", {})).toBeNull();
		expect(store.destroySession(sessionId)).toBe(true);
		expect(store.lookupSession(sessionId, {})).toBeNull();
		expect(store.destroySession(sessionId)).toBe(false);
		expect(() => store.createSession({ userId: "" })).toThrow(/userId/);
	});

	it("expires sessions past the absolute TTL", () => {
		const store = createSessionStore({ stateDir });
		const { sessionId } = store.createSession({ userId: "u1", ttlMs: 1000 });
		expect(
			store.lookupSession(sessionId, { now: Date.now() + 2000, ttlMs: 1000 }),
		).toBeNull();
	});

	it("expires idle sessions and slides the window on use", () => {
		const store = createSessionStore({ stateDir });
		const start = Date.now();
		const { sessionId } = store.createSession({
			userId: "u1",
			ttlMs: 60 * 60 * 1000,
		});
		// Touch halfway through the idle window: stays alive.
		expect(
			store.lookupSession(sessionId, {
				now: start + 10 * 60 * 1000,
				ttlMs: 60 * 60 * 1000,
				idleMs: 30 * 60 * 1000,
			}),
		).not.toBeNull();
		// Untouched for a full idle window after the last touch: gone.
		expect(
			store.lookupSession(sessionId, {
				now: start + 10 * 60 * 1000 + 30 * 60 * 1000,
				ttlMs: 60 * 60 * 1000,
				idleMs: 30 * 60 * 1000,
			}),
		).toBeNull();
	});

	it("never stores the raw session id at rest", () => {
		const store = createSessionStore({ stateDir });
		const { sessionId } = store.createSession({ userId: "u1" });
		const files = fs.readdirSync(stateDir);
		expect(files).toEqual(["sessions.json"]);
		const raw = fs.readFileSync(
			path.join(stateDir, "sessions.json"),
			"utf8",
		);
		expect(raw).not.toContain(sessionId);
		expect(raw).toContain(hashSessionId(sessionId));
		expect(store.countSessions()).toBe(1);
	});
});
