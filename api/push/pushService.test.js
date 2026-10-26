// Domain: Web Push — dispatcher service tests.
import { describe, it, expect, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PushService, PUSH_SEND_OPTIONS, isGoneStatus } from "./pushService.js";
import { resetVapidCache } from "./vapidKeys.js";

vi.mock("web-push", () => ({
	default: {
		setVapidDetails: vi.fn(),
		sendNotification: vi.fn(async () => ({})),
	},
}));

const SUB = {
	endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
	keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

let dirs = [];

function makeService({ sender, settings, isGloballyEnabled, bridge, logger } = {}) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-svc-test-"));
	dirs.push(dir);
	return new PushService({
		dir,
		sender: sender || { sendNotification: async () => ({}) },
		bridge: bridge || null,
		logger: logger || null,
		getSettings: settings ? () => settings : undefined,
		isGloballyEnabled: isGloballyEnabled || (() => true),
	});
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
 * MARK: push service tests
 * @description Trigger gating (master + per-trigger + env switch), fan-out
 *   delivery, dead-endpoint pruning, and the never-throw contract — with a
 *   stub sender so no network is ever touched.
 ***/
describe("push notification service", () => {
	it("requires a dir", () => {
		expect(
			() => new PushService({ sender: { sendNotification: async () => ({}) } }),
		).toThrow();
	});

	it("routes log messages through both bridge and logger sinks", () => {
		const bridgeLogs = [];
		const loggerLogs = [];
		const bridge = {
			emitSystemLog: (channel, text, payload) => bridgeLogs.push({ channel, text, payload }),
		};
		const logger = {
			info: (payload, text) => loggerLogs.push({ text, payload }),
		};
		const svc = makeService({ bridge, logger });
		svc.log("test notification sent", { tag: "test-tag", count: 1 });

		expect(bridgeLogs).toEqual([
			{ channel: "push", text: "test notification sent", payload: { tag: "test-tag", count: 1 } },
		]);
		expect(loggerLogs).toEqual([
			{ text: "test notification sent", payload: { tag: "test-tag", count: 1 } },
		]);
	});

	it("classifies gone statuses for pruning", () => {
		expect(isGoneStatus({ statusCode: 410 })).toBe(true);
		expect(isGoneStatus({ statusCode: 404 })).toBe(true);
		expect(isGoneStatus(new Error("push service Gone (410)"))).toBe(true);
		expect(isGoneStatus(new Error("boom"))).toBe(false);
		expect(isGoneStatus(null)).toBe(false);
	});

	it("reports zero delivery with no subscriptions", async () => {
		const svc = makeService();
		await expect(
			svc.notifyQueueEmpty({}),
		).resolves.toMatchObject({ delivered: 0, subscriptions: 0 });
	});

	it("fans out to every subscription", async () => {
		const sent = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload) => {
					sent.push({ sub, payload: JSON.parse(payload) });
					return {};
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		svc.store.addSubscription({
			...SUB,
			endpoint: "https://updates.push.services.mozilla.com/wpush/v2/other",
		});
		const result = await svc.notifyQueueEmpty({ taskCount: 3 });
		expect(result).toMatchObject({ delivered: 2, subscriptions: 2 });
		expect(sent).toHaveLength(2);
		expect(sent[0].payload.tag).toBe("queue-empty");
		expect(sent[0].payload.title).toContain("queue empty");
	});

	it("indicates human action is pending in the queue-empty body", async () => {
		const sent = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload) => {
					sent.push(JSON.parse(payload));
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({ humanPendingCount: 2 });
		expect(sent).toHaveLength(1);
		expect(sent[0].body).toContain("2");
		expect(sent[0].body.toLowerCase()).toContain("human");
		expect(sent[0].data).toMatchObject({ kind: "queue-empty", humanPendingCount: 2 });
	});

	it("uses the singular human-pending body for one waiting task", async () => {
		const sent = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload) => {
					sent.push(JSON.parse(payload));
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({ humanPendingCount: 1 });
		expect(sent).toHaveLength(1);
		expect(sent[0].body).toContain("1 task waiting");
		expect(sent[0].body).not.toContain("tasks waiting");
	});

	it("keeps the completed-run body when no human work is pending", async () => {
		const sent = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload) => {
					sent.push(JSON.parse(payload));
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({ taskCount: 3 });
		expect(sent).toHaveLength(1);
		expect(sent[0].body).toContain("3");
		expect(sent[0].data).toMatchObject({ kind: "queue-empty", humanPendingCount: 0 });
	});

	it("safely handles non-finite, negative, or NaN humanPendingCount", async () => {
		const sent = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload) => {
					sent.push(JSON.parse(payload));
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({ humanPendingCount: NaN });
		await svc.notifyQueueEmpty({ humanPendingCount: -5 });
		await svc.notifyQueueEmpty({ humanPendingCount: "invalid" });
		expect(sent).toHaveLength(3);
		for (const msg of sent) {
			expect(msg.body).toBe("All work is complete — no tasks left to run.");
			expect(msg.data).toMatchObject({ kind: "queue-empty", humanPendingCount: 0 });
		}
	});

	it("prunes dead (410) endpoints automatically", async () => {
		const gone = Object.assign(new Error("Gone"), { statusCode: 410 });
		const svc = makeService({
			sender: {
				sendNotification: async (sub) => {
					if (sub.endpoint === SUB.endpoint) throw gone;
					return {};
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		svc.store.addSubscription({
			...SUB,
			endpoint: "https://updates.push.services.mozilla.com/wpush/v2/live",
		});
		const result = await svc.notifyStageError({
			taskId: "t1",
			stage: { id: "impl", name: "Implementation" },
			error: "401 unauthorized",
		});
		expect(result.pruned).toBe(1);
		expect(svc.store.getSubscriptions().map((s) => s.endpoint)).toEqual([
			"https://updates.push.services.mozilla.com/wpush/v2/live",
		]);
	});

	it("skips sends when the master switch is off", async () => {
		const sendNotification = vi.fn();
		const svc = makeService({
			sender: { sendNotification },
			settings: {
				enabled: false,
				triggers: { queueEmpty: true, unrecoverableStageError: true },
				stages: {},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await expect(svc.notifyQueueEmpty({})).resolves.toMatchObject({
			skipped: "disabled",
		});
		await expect(svc.sendTestNotification()).resolves.toMatchObject({
			skipped: "disabled",
		});
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it("skips sends when the env-level switch is off", async () => {
		const sendNotification = vi.fn();
		const svc = makeService({
			sender: { sendNotification },
			isGloballyEnabled: () => false,
		});
		svc.store.addSubscription({ ...SUB });
		await expect(
			svc.notifyStageError({ error: "x" }),
		).resolves.toMatchObject({ skipped: "disabled" });
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it("honors per-trigger toggles independently", async () => {
		const sendNotification = vi.fn(async () => ({}));
		const svc = makeService({
			sender: { sendNotification },
			settings: {
				enabled: true,
				triggers: { queueEmpty: false, unrecoverableStageError: true },
				stages: {},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await expect(svc.notifyQueueEmpty({})).resolves.toMatchObject({
			skipped: "trigger-off",
		});
		const result = await svc.notifyStageError({ error: "quota" });
		expect(result.delivered).toBe(1);
	});

	it("sends test pushes even with triggers off", async () => {
		const sendNotification = vi.fn(async () => ({}));
		const svc = makeService({
			sender: { sendNotification },
			settings: {
				enabled: true,
				triggers: { queueEmpty: false, unrecoverableStageError: false },
				stages: {},
			},
		});
		svc.store.addSubscription({ ...SUB });
		const result = await svc.sendTestNotification();
		expect(result.delivered).toBe(1);
		expect(sendNotification).toHaveBeenCalledTimes(1);
	});

	it("keeps delivering when one endpoint fails transiently", async () => {
		const svc = makeService({
			sender: {
				sendNotification: async (sub) => {
					if (sub.endpoint === SUB.endpoint) throw new Error("503 boom");
					return {};
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		svc.store.addSubscription({
			...SUB,
			endpoint: "https://updates.push.services.mozilla.com/wpush/v2/live",
		});
		const result = await svc.notifyQueueEmpty({});
		expect(result.delivered).toBe(1);
		expect(result.pruned).toBe(0);
		expect(svc.store.getSubscriptions()).toHaveLength(2);
		// Non-gone failures are collected in `errors` for diagnostics.
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0].message).toMatch(/503 boom/);
		expect(result.errors[0].endpoint).toBe("fcm.googleapis.com");
	});

	it("collects delivery errors with endpoint host and status code", async () => {
		const svc = makeService({
			sender: {
				sendNotification: async () => {
					const err = new Error("VAPID key mismatch");
					err.statusCode = 401;
					throw err;
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		const result = await svc.sendTestNotification();
		expect(result.delivered).toBe(0);
		expect(result.subscriptions).toBe(1);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toMatchObject({
			endpoint: "fcm.googleapis.com",
			statusCode: 401,
		});
		expect(result.errors[0].message).toMatch(/VAPID key mismatch/);
	});

	it("sends a scheduler-stall alert naming the wedged task and cause", async () => {
		const sendNotification = vi.fn(async () => ({}));
		const svc = makeService({ sender: { sendNotification } });
		svc.store.addSubscription({ ...SUB });
		const result = await svc.notifySchedulerStall({
			taskId: "abcdef123456",
			projectId: "p1",
			ageMs: 901000,
			reason: "entry-timeout",
		});
		expect(result.delivered).toBe(1);
		expect(sendNotification).toHaveBeenCalledTimes(1);
		const [sub, rawPayload] = sendNotification.mock.calls[0];
		expect(sub.endpoint).toBe(SUB.endpoint);
		const payload = JSON.parse(rawPayload);
		expect(payload.tag).toBe("scheduler-stall");
		expect(payload.title).toMatch(/scheduler recovered/i);
		expect(payload.body).toMatch(/#abcdef12/);
		expect(payload.body).toMatch(/settle guarantee/);
		expect(payload.data).toMatchObject({ kind: "scheduler-stall", projectId: "p1" });
	});

	it("skips scheduler-stall sends when the trigger is off, and honors the master switch", async () => {
		const sendNotification = vi.fn(async () => ({}));
		const off = makeService({
			sender: { sendNotification },
			settings: {
				enabled: true,
				triggers: { queueEmpty: true, unrecoverableStageError: true, schedulerStall: false },
				stages: {},
			},
		});
		off.store.addSubscription({ ...SUB });
		await expect(off.notifySchedulerStall({ taskId: "t1" })).resolves.toMatchObject({
			skipped: "trigger-off",
		});
		const disabled = makeService({
			sender: { sendNotification },
			settings: {
				enabled: false,
				triggers: { queueEmpty: true, unrecoverableStageError: true, schedulerStall: true },
				stages: {},
			},
		});
		disabled.store.addSubscription({ ...SUB });
		await expect(disabled.notifySchedulerStall({ taskId: "t1" })).resolves.toMatchObject({
			skipped: "disabled",
		});
		expect(sendNotification).not.toHaveBeenCalled();
	});

	it("does not collect gone (404/410) endpoints as errors — they are pruned", async () => {
		const gone = Object.assign(new Error("Gone"), { statusCode: 410 });
		const svc = makeService({
			sender: {
				sendNotification: async () => {
					throw gone;
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		const result = await svc.sendTestNotification();
		expect(result.delivered).toBe(0);
		expect(result.pruned).toBe(1);
		expect(result.errors).toHaveLength(0);
	});

	it("falls back to defaults when persisted settings are invalid (never throws)", async () => {
		const svc = makeService();
		fs.writeFileSync(
			path.join(svc.dir, "push-settings.json"),
			JSON.stringify({ triggers: { nope: true } }),
			"utf8",
		);
		expect(() => svc.isEnabled()).not.toThrow();
		expect(svc.isEnabled()).toBe(true);
		await expect(svc.notifyQueueEmpty({})).resolves.toMatchObject({
			delivered: 0,
			subscriptions: 0,
		});
		await expect(svc.sendTestNotification()).resolves.toMatchObject({
			delivered: 0,
			subscriptions: 0,
		});
	});

	it("survives a synchronously-throwing sender without failing the fan-out", async () => {
		const svc = makeService({
			sender: {
				sendNotification() {
					throw new Error("sync boom");
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		svc.store.addSubscription({
			...SUB,
			endpoint: "https://updates.push.services.mozilla.com/wpush/v2/live",
		});
		await expect(svc.notifyQueueEmpty({})).resolves.toMatchObject({
			delivered: 0,
			pruned: 0,
			subscriptions: 2,
		});
		expect(svc.store.getSubscriptions()).toHaveLength(2);
	});

	it("skips corrupt stored rows without failing the fan-out", async () => {
		const sent = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload) => {
					sent.push({ sub, payload: JSON.parse(payload) });
					return {};
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		// Bypass validation to simulate a stale/corrupt row (endpoint kept,
		// keys lost): it must be skipped, never sent, never crash.
		const raw = JSON.parse(
			fs.readFileSync(path.join(svc.dir, "push-subscriptions.json"), "utf8"),
		);
		raw.subscriptions.push({ endpoint: "https://example.push/stale", keys: {} });
		fs.writeFileSync(
			path.join(svc.dir, "push-subscriptions.json"),
			JSON.stringify(raw),
			"utf8",
		);
		const result = await svc.notifyQueueEmpty({});
		expect(result).toMatchObject({ delivered: 1, subscriptions: 2 });
		expect(sent).toHaveLength(1);
		expect(sent[0].sub.endpoint).toBe(SUB.endpoint);
	});

	it("signs the default sender with dir-scoped keys when constructed directly", async () => {
		// Regression cover: the constructor must bind the default sender to
		// THIS service's dir-scoped keys, not the global default dir.
		// Otherwise direct `new PushService({ dir })` callers sign with the
		// wrong VAPID pair and every send is rejected (FCM 403) while the
		// client looks subscribed.
		resetVapidCache();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-svc-dirkeys-"));
		dirs.push(dir);
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is an isolated mkdtemp test dir, not request input */
		fs.writeFileSync(
			path.join(dir, "push-vapid.json"),
			JSON.stringify({ publicKey: "public-direct", privateKey: "private-direct" }),
			"utf8",
		);
		const svc = new PushService({ dir, isGloballyEnabled: () => true });
		svc.store.addSubscription({ ...SUB });
		const { default: webpush } = await import("web-push");
		webpush.setVapidDetails.mockClear();
		const result = await svc.sendTestNotification();
		expect(result.delivered).toBe(1);
		expect(webpush.setVapidDetails).toHaveBeenCalledWith(
			expect.any(String),
			"public-direct",
			"private-direct",
		);
	});

	it("emits a system log per send when a bridge is wired", async () => {
		const logged = [];
		const svc = makeService({
			bridge: { emitSystemLog: (session, message) => logged.push(message) },
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({});
		expect(logged.some((m) => m.includes("[PUSH]"))).toBe(true);
	});

	it("persists one structured delivery-outcome log line per send", async () => {
		// The forensic gap behind "did the server deliver to the phone?":
		// outcomes used to exist only on the WebSocket bridge. With a
		// logger wired, one structured line carries the full summary
		// (delivered/pruned/subscriptions + first error) so the journal
		// can answer the question after the fact.
		const logged = [];
		const svc = makeService({
			logger: {
				info: (payload, message) => logged.push({ message, payload }),
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({});
		const summary = logged.find((entry) => entry.message.includes("[PUSH]"));
		expect(summary).toBeTruthy();
		expect(summary.payload).toMatchObject({
			tag: "queue-empty",
			delivered: 1,
			pruned: 0,
			subscriptions: 1,
			errors: [],
		});
	});

	it("logs each failed endpoint to the logger with the host, never the full endpoint", async () => {
		const logged = [];
		const svc = makeService({
			logger: {
				info: (payload, message) => logged.push({ message, payload }),
			},
			sender: {
				sendNotification: async () => {
					throw Object.assign(new Error("VAPID mismatch"), { statusCode: 401 });
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		const result = await svc.notifyQueueEmpty({});
		expect(result.delivered).toBe(0);
		expect(result.errors).toHaveLength(1);
		const failure = logged.find((entry) => /delivery failed for/.test(entry.message));
		expect(failure).toBeTruthy();
		// Secrets rule: the endpoint is reduced to its host in both the
		// message and the structured error summary.
		expect(failure.message).toContain("fcm.googleapis.com");
		expect(failure.message).not.toContain("abc123");
		const summary = logged.find((entry) => /delivered, \d+ pruned/.test(entry.message));
		expect(summary.payload.errors).toEqual([
			expect.objectContaining({ endpoint: "fcm.googleapis.com", message: "VAPID mismatch" }),
		]);
		expect(summary.payload.delivered).toBe(0);
	});

	it("sends alerts with high urgency and a day-long TTL (mobile Doze fix)", async () => {
		// Regression cover for "permission granted but no test notification
		// on mobile": the web-push library defaults (normal urgency, four
		// week TTL) let the push service defer delivery to sleeping phones
		// and surface stale alerts weeks late. Every trigger sets explicit
		// options instead.
		const seen = [];
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload, options) => {
					seen.push(options);
					return {};
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.notifyQueueEmpty({});
		await svc.notifyStageError({ error: "quota exhausted" });
		expect(seen).toHaveLength(2);
		for (const options of seen) {
			expect(options).toMatchObject(PUSH_SEND_OPTIONS.alert);
		}
		expect(PUSH_SEND_OPTIONS.alert).toMatchObject({ urgency: "high" });
		expect(PUSH_SEND_OPTIONS.alert.TTL).toBeGreaterThan(0);
	});

	it("sends test pings with a short TTL so a late test never surfaces as news", async () => {
		let seen;
		const svc = makeService({
			sender: {
				sendNotification: async (sub, payload, options) => {
					seen = options;
					return {};
				},
			},
		});
		svc.store.addSubscription({ ...SUB });
		await svc.sendTestNotification();
		expect(seen).toMatchObject(PUSH_SEND_OPTIONS.test);
		expect(PUSH_SEND_OPTIONS.test).toMatchObject({ urgency: "high", TTL: 300 });
	});

	it("degrades to empty (and logs) when the subscription store is unreadable", async () => {
		const logged = [];
		const svc = makeService({
			logger: { info: (payload, message) => logged.push({ message, payload }) },
		});
		svc.store.getSubscriptions = () => {
			throw new Error("Disk unreadable");
		};
		const result = await svc.sendTestNotification();
		expect(result).toMatchObject({ delivered: 0, pruned: 0, subscriptions: 0, errors: [] });
		expect(logged.some((entry) => /subscription store unreadable/.test(entry.message))).toBe(true);
	});

	it("forwards send options to web-push instead of the library defaults", async () => {
		resetVapidCache();
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-svc-opts-"));
		dirs.push(dir);
		/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is an isolated mkdtemp test dir, not request input */
		fs.writeFileSync(
			path.join(dir, "push-vapid.json"),
			JSON.stringify({ publicKey: "public-opts", privateKey: "private-opts" }),
			"utf8",
		);
		const svc = new PushService({ dir, isGloballyEnabled: () => true });
		svc.store.addSubscription({ ...SUB });
		const { default: webpush } = await import("web-push");
		webpush.sendNotification.mockClear();
		await svc.sendTestNotification();
		expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
		expect(webpush.sendNotification.mock.calls[0][2]).toMatchObject(
			PUSH_SEND_OPTIONS.test,
		);
	});
});
