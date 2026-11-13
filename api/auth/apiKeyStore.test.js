import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	apiKeysFilePath,
	hashApiKeySecret,
	newApiKeySecret,
	normalizeApiKeyExpiry,
	createApiKeyStore,
} from "./apiKeyStore.js";

/***
 * MARK: apiKeyStore tests
 * @description Locks the API-key store: secrets are returned once and
 *   persisted hashed, verification is revocation- and expiry-aware, names
 *   are unique, listings never carry secret material, and revocation bites
 *   immediately.
 ***/

let stateDir = null;

beforeEach(() => {
	stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-apikey-store-"));
});

afterEach(() => {
	if (stateDir) fs.rmSync(stateDir, { recursive: true, force: true });
	stateDir = null;
});

describe("apiKeyStore secrets", () => {
	it("mints prefixed unguessable secrets with stable hashing", () => {
		const first = newApiKeySecret();
		const second = newApiKeySecret();
		expect(first.secret.startsWith("kb_")).toBe(true);
		expect(first.secret).not.toBe(second.secret);
		expect(first.prefix).toHaveLength(8);
		expect(hashApiKeySecret(first.secret)).toBe(hashApiKeySecret(first.secret));
		expect(hashApiKeySecret(first.secret)).not.toBe(first.secret);
	});

	it("normalises expiries and fails loud on garbage", () => {
		expect(normalizeApiKeyExpiry(null)).toBeNull();
		expect(normalizeApiKeyExpiry("")).toBeNull();
		expect(normalizeApiKeyExpiry("2030-01-01T00:00:00.000Z")).toBe(
			"2030-01-01T00:00:00.000Z",
		);
		expect(() => normalizeApiKeyExpiry("next friday-ish")).toThrow(
			/ISO date/,
		);
	});
});

describe("apiKeyStore lifecycle", () => {
	it("creates keys with metadata and returns the secret once", () => {
		const store = createApiKeyStore({ stateDir });
		const created = store.createApiKey({
			name: "scanner",
			roles: ["member"],
			scopes: ["tasks:create"],
			createdBy: "root",
		});
		expect(created.secret.startsWith("kb_")).toBe(true);
		expect(created.key).toMatchObject({
			name: "scanner",
			roles: ["member"],
			scopes: ["tasks:create"],
			revoked: false,
			createdBy: "root",
		});
		expect(created.key.secret).toBeUndefined();
		expect(created.key.hash).toBeUndefined();
		expect(store.countApiKeys()).toBe(1);
	});

	it("persists hashes, never secrets", () => {
		const store = createApiKeyStore({ stateDir });
		const created = store.createApiKey({ name: "scanner", roles: ["member"] });
		const raw = fs.readFileSync(apiKeysFilePath(stateDir), "utf8");
		expect(raw).not.toContain(created.secret);
		expect(raw).toContain(hashApiKeySecret(created.secret));
		// A fresh handle over the same file verifies the same secret.
		const reopened = createApiKeyStore({ stateDir });
		expect(reopened.verifyApiKey(created.secret).ok).toBe(true);
	});

	it("rejects empty, overlong, and duplicate names", () => {
		const store = createApiKeyStore({ stateDir });
		expect(() => store.createApiKey({ name: "  " })).toThrow(/non-empty/);
		expect(() => store.createApiKey({ name: "x".repeat(81) })).toThrow(
			/80 characters/,
		);
		store.createApiKey({ name: "Scanner" });
		expect(() => store.createApiKey({ name: "scanner" })).toThrow(
			/already exists/,
		);
		// Revoked names free up: rotation can reuse the same name.
		const listed = store.listApiKeys();
		store.revokeApiKey(listed[0].id);
		expect(() =>
			store.createApiKey({ name: "scanner" }),
		).not.toThrow();
	});

	it("fails closed on roles and scopes", () => {
		const store = createApiKeyStore({ stateDir });
		const defaulted = store.createApiKey({ name: "a" });
		expect(defaulted.key.roles).toEqual(["viewer"]);
		const cleaned = store.createApiKey({
			name: "b",
			roles: ["member", "nope"],
			scopes: ["tasks:create", "nope"],
		});
		expect(cleaned.key.roles).toEqual(["member"]);
		expect(cleaned.key.scopes).toEqual(["tasks:create"]);
	});

	it("verifies secrets and reports unknown, expired, and revoked", () => {
		const store = createApiKeyStore({ stateDir });
		const live = store.createApiKey({ name: "live", roles: ["member"] });
		const old = store.createApiKey({
			name: "old",
			roles: ["member"],
			expiresAt: "2000-01-01T00:00:00.000Z",
		});
		const gone = store.createApiKey({ name: "gone", roles: ["member"] });
		store.revokeApiKey(gone.key.id);

		expect(store.verifyApiKey(live.secret)).toMatchObject({
			ok: true,
			record: { name: "live" },
		});
		expect(store.verifyApiKey(live.secret).record.hash).toBeUndefined();
		expect(store.verifyApiKey("kb_nonexistent")).toMatchObject({
			ok: false,
			reason: "unknown",
		});
		expect(store.verifyApiKey("")).toMatchObject({ ok: false, reason: "unknown" });
		expect(store.verifyApiKey(null)).toMatchObject({
			ok: false,
			reason: "unknown",
		});
		expect(store.verifyApiKey(old.secret)).toMatchObject({
			ok: false,
			reason: "expired",
			record: { name: "old" },
		});
		expect(store.verifyApiKey(gone.secret)).toMatchObject({
			ok: false,
			reason: "revoked",
			record: { name: "gone" },
		});
	});

	it("revokes immediately and tracks last use", () => {
		const store = createApiKeyStore({ stateDir });
		const created = store.createApiKey({ name: "scanner" });
		expect(store.revokeApiKey("missing")).toBeNull();
		const revoked = store.revokeApiKey(created.key.id);
		expect(revoked.revoked).toBe(true);
		expect(typeof revoked.revokedAt).toBe("string");
		expect(store.verifyApiKey(created.secret).ok).toBe(false);

		const live = store.createApiKey({ name: "live" });
		expect(store.findById(live.key.id).lastUsedAt).toBeNull();
		store.touchLastUsed(live.key.id, { now: 1794357720000 });
		expect(store.findById(live.key.id).lastUsedAt).toBe(
			new Date(1794357720000).toISOString(),
		);
		// Revoked keys are never touched.
		store.touchLastUsed(created.key.id);
		expect(store.findById(created.key.id).lastUsedAt).toBeNull();
	});

	it("lists metadata sorted by creation without secret material", () => {
		const store = createApiKeyStore({ stateDir });
		const first = store.createApiKey({ name: "first", now: 1000 });
		const second = store.createApiKey({ name: "second", now: 2000 });
		const keys = store.listApiKeys();
		expect(keys.map((key) => key.name)).toEqual(["first", "second"]);
		for (const key of keys) {
			expect(key.hash).toBeUndefined();
			expect(key.secret).toBeUndefined();
		}
		expect(first.key.createdAt < second.key.createdAt).toBe(true);
		expect(store.findById("missing")).toBeNull();
	});
});
