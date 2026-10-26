import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fastify from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pushRoutes from "./push.js";
import { PushService } from "../push/pushService.js";
import { resetVapidCache } from "../push/vapidKeys.js";

const SUB = {
	endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
	keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

let dirs = [];

/***
 * MARK: push routes tests
 * @description Covers every `/push/*` endpoint against an isolated service
 *   (temp dir + stub sender): VAPID key, settings get/put (+400s), subscribe
 *   (+400s), unsubscribe, test send, and status. No network, no live state.
 ***/
describe("push routes", () => {
	let app;
	let service;

	beforeEach(async () => {
		resetVapidCache();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-routes-test-"));
		dirs.push(dir);
		service = new PushService({
			dir,
			sender: { sendNotification: async () => ({}) },
			isGloballyEnabled: () => true,
		});
		app = fastify();
		await app.register(pushRoutes, { deps: { pushService: service } });
		await app.ready();
	});

	afterEach(async () => {
		try {
			await app?.close();
		} catch {
			// ignore teardown errors
		}
		resetVapidCache();
		for (const dir of dirs) {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {
				// ignore cleanup errors
			}
		}
		dirs = [];
	});

	it("serves the VAPID public key", async () => {
		const res = await app.inject({ method: "GET", url: "/push/vapid-key" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(typeof body.publicKey).toBe("string");
		expect(body.publicKey.length).toBeGreaterThan(0);
	});

	it("reads and patches settings", async () => {
		const initial = JSON.parse(
			(await app.inject({ method: "GET", url: "/push/settings" })).payload,
		);
		expect(initial.enabled).toBe(true);
		const patched = JSON.parse(
			(
				await app.inject({
					method: "PUT",
					url: "/push/settings",
					payload: { triggers: { queueEmpty: false } },
				})
			).payload,
		);
		expect(patched.triggers.queueEmpty).toBe(false);
		expect(patched.triggers.unrecoverableStageError).toBe(true);
	});

	it("rejects invalid settings patches with 400", async () => {
		const res = await app.inject({
			method: "PUT",
			url: "/push/settings",
			payload: { triggers: { nope: true } },
		});
		expect(res.statusCode).toBe(400);
	});

	it("subscribes, dedupes, and unsubscribes", async () => {
		const first = await app.inject({
			method: "POST",
			url: "/push/subscribe",
			payload: { ...SUB },
		});
		expect(first.statusCode).toBe(200);
		expect(JSON.parse(first.payload).ok).toBe(true);
		const second = await app.inject({
			method: "POST",
			url: "/push/subscribe",
			payload: { ...SUB },
		});
		expect(second.statusCode).toBe(200);
		const status = JSON.parse(
			(await app.inject({ method: "GET", url: "/push/status" })).payload,
		);
		expect(status.subscriptionCount).toBe(1);
		const unsub = await app.inject({
			method: "POST",
			url: "/push/unsubscribe",
			payload: { endpoint: SUB.endpoint },
		});
		expect(JSON.parse(unsub.payload)).toMatchObject({ ok: true, removed: true });
		const after = JSON.parse(
			(await app.inject({ method: "GET", url: "/push/status" })).payload,
		);
		expect(after.subscriptionCount).toBe(0);
	});

	it("rejects invalid subscriptions with 400", async () => {
		const res = await app.inject({
			method: "POST",
			url: "/push/subscribe",
			payload: { endpoint: "nope" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("checks subscription status correctly via POST /push/subscription-status", async () => {
		// Not registered yet
		const resBefore = await app.inject({
			method: "POST",
			url: "/push/subscription-status",
			payload: { endpoint: SUB.endpoint },
		});
		expect(resBefore.statusCode).toBe(200);
		expect(JSON.parse(resBefore.payload)).toEqual({ ok: true, registered: false });

		// Register subscription
		await app.inject({ method: "POST", url: "/push/subscribe", payload: { ...SUB } });

		// Now registered
		const resAfter = await app.inject({
			method: "POST",
			url: "/push/subscription-status",
			payload: { endpoint: SUB.endpoint },
		});
		expect(resAfter.statusCode).toBe(200);
		expect(JSON.parse(resAfter.payload)).toEqual({ ok: true, registered: true });

		// Different endpoint is not registered
		const resOther = await app.inject({
			method: "POST",
			url: "/push/subscription-status",
			payload: { endpoint: "https://example.com/push/other" },
		});
		expect(resOther.statusCode).toBe(200);
		expect(JSON.parse(resOther.payload)).toEqual({ ok: true, registered: false });
	});

	it("rejects invalid or missing endpoint in /push/subscription-status with 400", async () => {
		const resMissing = await app.inject({
			method: "POST",
			url: "/push/subscription-status",
			payload: {},
		});
		expect(resMissing.statusCode).toBe(400);
		expect(JSON.parse(resMissing.payload)).toHaveProperty("error");

		const resBadUrl = await app.inject({
			method: "POST",
			url: "/push/subscription-status",
			payload: { endpoint: "not-a-valid-url" },
		});
		expect(resBadUrl.statusCode).toBe(400);
		expect(JSON.parse(resBadUrl.payload)).toHaveProperty("error");
	});

	it("degrades gracefully to registered:false when the store throws an error", async () => {
		service.store.hasSubscription = () => {
			throw new Error("Disk unreadable");
		};
		const res = await app.inject({
			method: "POST",
			url: "/push/subscription-status",
			payload: { endpoint: SUB.endpoint },
		});
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toEqual({ ok: true, registered: false });
	});

	it("sends a test notification and reports the result", async () => {
		await app.inject({ method: "POST", url: "/push/subscribe", payload: { ...SUB } });
		const res = await app.inject({ method: "POST", url: "/push/test" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.ok).toBe(true);
		expect(body.result.delivered).toBe(1);
	});

	it("reports ok:false when a test send reaches zero subscriptions", async () => {
		// No subscription registered.
		const res = await app.inject({ method: "POST", url: "/push/test" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.ok).toBe(false);
		expect(body.result.delivered).toBe(0);
		expect(body.result.subscriptions).toBe(0);
		expect(body.error).toMatch(/no push subscriptions/i);
	});

	it("reports ok:false with a diagnostic error when all deliveries fail", async () => {
		service.sender = {
			sendNotification: async () => {
				throw new Error("VAPID key mismatch");
			},
		};
		await app.inject({ method: "POST", url: "/push/subscribe", payload: { ...SUB } });
		const res = await app.inject({ method: "POST", url: "/push/test" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.ok).toBe(false);
		expect(body.result.delivered).toBe(0);
		expect(body.result.subscriptions).toBe(1);
		expect(body.error).toMatch(/delivery failed/i);
		expect(body.result.errors).toHaveLength(1);
		expect(body.result.errors[0].message).toMatch(/VAPID key mismatch/);
	});

	it("reports skipped when the master switch is off", async () => {
		service.isGloballyEnabled = () => false;
		await app.inject({ method: "POST", url: "/push/subscribe", payload: { ...SUB } });
		const res = await app.inject({ method: "POST", url: "/push/test" });
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.payload);
		expect(body.ok).toBe(false);
		expect(body.skipped).toBe("disabled");
		expect(body.error).toMatch(/disabled/i);
	});
	it("serves defaults (not a 500) when persisted settings are invalid", async () => {
		fs.writeFileSync(
			path.join(service.dir, "push-settings.json"),
			JSON.stringify({ triggers: { nope: true } }),
			"utf8",
		);
		const settingsRes = await app.inject({ method: "GET", url: "/push/settings" });
		expect(settingsRes.statusCode).toBe(200);
		expect(JSON.parse(settingsRes.payload)).toMatchObject({ enabled: true });
		const statusRes = await app.inject({ method: "GET", url: "/push/status" });
		expect(statusRes.statusCode).toBe(200);
		expect(JSON.parse(statusRes.payload)).toMatchObject({
			enabled: true,
			subscriptionCount: 0,
		});
		// The bad file is still repaired by the next valid PUT.
		const repaired = await app.inject({
			method: "PUT",
			url: "/push/settings",
			payload: { triggers: { queueEmpty: false } },
		});
		expect(repaired.statusCode).toBe(200);
		expect(JSON.parse(repaired.payload).triggers.queueEmpty).toBe(false);
	});

	it("returns 500 (not a crash) when unsubscribe storage fails", async () => {
		service.store.removeSubscription = () => {
			throw new Error("Disk unwritable");
		};
		const res = await app.inject({
			method: "POST",
			url: "/push/unsubscribe",
			payload: { endpoint: SUB.endpoint },
		});
		expect(res.statusCode).toBe(500);
		expect(JSON.parse(res.payload)).toHaveProperty("error");
	});

	it("reports status with settings and subscription count", async () => {
		const res = await app.inject({ method: "GET", url: "/push/status" });
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.payload)).toMatchObject({
			enabled: true,
			subscriptionCount: 0,
		});
	});
});
