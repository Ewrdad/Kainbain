// Domain: Web Push — subscription store tests.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PushSubscriptionStore, isValidSubscription, isValidEndpoint } from "./subscriptionStore.js";

const VALID = {
	endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
	keys: { p256dh: "p256dh-key", auth: "auth-key" },
	userAgent: "test-agent",
};

let dirs = [];

function makeStore() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-subs-test-"));
	dirs.push(dir);
	return new PushSubscriptionStore({ dir });
}

afterEach(() => {
	for (const dir of dirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
	}
	dirs = [];
});

/***
 * MARK: subscription store tests
 * @description Validation, add/dedupe/refresh, removal, and corrupt-file
 *   recovery — all against isolated temp dirs.
 ***/
describe("push subscription store", () => {
	it("rejects a store without a dir", () => {
		expect(() => new PushSubscriptionStore({})).toThrow();
	});

	it("validates subscription shapes", () => {
		expect(isValidSubscription(VALID)).toBe(true);
		expect(isValidSubscription(null)).toBe(false);
		expect(isValidSubscription({})).toBe(false);
		expect(isValidSubscription({ endpoint: VALID.endpoint })).toBe(false);
		expect(
			isValidSubscription({ endpoint: "not-a-url", keys: VALID.keys }),
		).toBe(false);
		expect(
			isValidSubscription({
				endpoint: VALID.endpoint,
				keys: { p256dh: "", auth: "" },
			}),
		).toBe(false);
	});

	it("validates endpoint URLs", () => {
		expect(isValidEndpoint(VALID.endpoint)).toBe(true);
		expect(isValidEndpoint("http://localhost:3000/push")).toBe(true);
		expect(isValidEndpoint("not-a-url")).toBe(false);
		expect(isValidEndpoint("ftp://example.com/push")).toBe(false);
		expect(isValidEndpoint("")).toBe(false);
		expect(isValidEndpoint(null)).toBe(false);
		expect(isValidEndpoint(undefined)).toBe(false);
	});

	it("checks subscription existence via hasSubscription", () => {
		const store = makeStore();
		expect(store.hasSubscription(VALID.endpoint)).toBe(false);
		store.addSubscription({ ...VALID });
		expect(store.hasSubscription(VALID.endpoint)).toBe(true);
		expect(store.hasSubscription("https://other.endpoint")).toBe(false);
		expect(store.hasSubscription("")).toBe(false);
		expect(store.hasSubscription(null)).toBe(false);
	});

	it("starts empty when no file exists", () => {
		expect(makeStore().getSubscriptions()).toEqual([]);
	});

	it("adds a subscription with timestamps", () => {
		const store = makeStore();
		const entry = store.addSubscription({ ...VALID });
		expect(entry.endpoint).toBe(VALID.endpoint);
		expect(typeof entry.createdAt).toBe("string");
		expect(typeof entry.lastUsedAt).toBe("string");
		expect(store.getSubscriptions()).toHaveLength(1);
	});

	it("throws on invalid subscriptions", () => {
		expect(() => makeStore().addSubscription({})).toThrow();
	});

	it("deduplicates by endpoint, refreshing lastUsedAt", () => {
		const store = makeStore();
		const first = store.addSubscription({ ...VALID });
		const second = store.addSubscription({
			...VALID,
			keys: { p256dh: "new-p256dh", auth: "new-auth" },
		});
		expect(store.getSubscriptions()).toHaveLength(1);
		expect(second.keys.p256dh).toBe("new-p256dh");
		expect(second.createdAt).toBe(first.createdAt);
	});

	it("removes by endpoint and reports whether anything was removed", () => {
		const store = makeStore();
		store.addSubscription({ ...VALID });
		expect(store.removeSubscription(VALID.endpoint)).toBe(true);
		expect(store.getSubscriptions()).toEqual([]);
		expect(store.removeSubscription(VALID.endpoint)).toBe(false);
	});

	it("recovers from a corrupt file as empty", () => {
		const store = makeStore();
		fs.writeFileSync(
			path.join(store.dir, "push-subscriptions.json"),
			"corrupt{{{",
			"utf8",
		);
		expect(store.getSubscriptions()).toEqual([]);
	});

	it("clears all subscriptions", () => {
		const store = makeStore();
		store.addSubscription({ ...VALID });
		store.clear();
		expect(store.getSubscriptions()).toEqual([]);
	});
});
