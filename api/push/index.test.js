// Domain: Web Push — singleton wiring tests.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPushService, resetPushServiceForTests, setPushServiceLogger } from "./index.js";
import { resetVapidCache } from "./vapidKeys.js";
import { eventBridge } from "../eventBridge.js";

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

function makeDirWithKeys(publicKey, privateKey) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-singleton-test-"));
	dirs.push(dir);
	/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is an isolated mkdtemp test dir, not request input */
	fs.writeFileSync(
		path.join(dir, "push-vapid.json"),
		JSON.stringify({ publicKey, privateKey }),
		"utf8",
	);
	return dir;
}

beforeEach(() => {
	resetPushServiceForTests();
	resetVapidCache();
	vi.clearAllMocks();
});

afterEach(() => {
	resetPushServiceForTests();
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

/***
 * MARK: push singleton tests
 * @description Guards the VAPID binding between subscribe-time keys (served
 *   from the service dir) and send-time keys (used by the default sender).
 *   A mismatch is the classic silent failure: permission is granted, the
 *   subscription stores fine, the test reports success, but the push service
 *   rejects every send and nothing ever arrives.
 ***/
describe("push singleton", () => {
	it("signs sends with the VAPID keys of the service dir, not the global default", async () => {
		const dir = makeDirWithKeys("public-for-this-dir", "private-for-this-dir");
		const svc = getPushService({ dir });
		svc.store.addSubscription({ ...SUB });
		const { default: webpush } = await import("web-push");

		const result = await svc.sendTestNotification();

		expect(result.delivered).toBe(1);
		expect(webpush.setVapidDetails).toHaveBeenCalledWith(
			expect.any(String),
			"public-for-this-dir",
			"private-for-this-dir",
		);
	});

	it("keeps per-dir key bindings isolated", async () => {
		const dirA = makeDirWithKeys("public-A", "private-A");
		const dirB = makeDirWithKeys("public-B", "private-B");
		const { default: webpush } = await import("web-push");

		const svcA = getPushService({ dir: dirA });
		svcA.store.addSubscription({ ...SUB });
		await svcA.sendTestNotification();
		expect(webpush.setVapidDetails).toHaveBeenLastCalledWith(
			expect.any(String),
			"public-A",
			"private-A",
		);

		const svcB = getPushService({ dir: dirB });
		svcB.store.addSubscription({ ...SUB });
		await svcB.sendTestNotification();
		expect(webpush.setVapidDetails).toHaveBeenLastCalledWith(
			expect.any(String),
			"public-B",
			"private-B",
		);
	});

	it("honors an explicit null bridge (silent service, no fallback)", () => {
		const dir = makeDirWithKeys("public-N", "private-N");
		const svc = getPushService({ dir, bridge: null });
		expect(svc.bridge).toBeNull();
	});

	it("falls back to the shared event bridge only when bridge is omitted", () => {
		const dir = makeDirWithKeys("public-E", "private-E");
		const svc = getPushService({ dir });
		expect(svc.bridge).toBe(eventBridge);
	});

	it("still allows an explicit sender override for tests", async () => {
		const dir = makeDirWithKeys("public-X", "private-X");
		const sendNotification = vi.fn(async () => ({}));
		const svc = getPushService({ dir, sender: { sendNotification } });
		svc.store.addSubscription({ ...SUB });
		const result = await svc.sendTestNotification();
		expect(result.delivered).toBe(1);
		expect(sendNotification).toHaveBeenCalledTimes(1);
	});

	/***
	 * MARK: app logger wiring
	 * @description Delivery outcomes must reach the app's structured (pino)
	 *   logger so "did the server deliver to this browser?" stays answerable
	 *   from the journal after the fact.
	 ***/
	describe("app logger wiring", () => {
		it("uses the app logger wired before the singleton exists", () => {
			const dir = makeDirWithKeys("public-L1", "private-L1");
			const logger = { info: vi.fn() };
			setPushServiceLogger(logger);
			const svc = getPushService({ dir });
			expect(svc.logger).toBe(logger);
			setPushServiceLogger(null);
		});

		it("updates the cached singleton when the logger is wired later", () => {
			// Isolated fake home so the no-override singleton never binds to
			// the live push dir (~/.kainbain/push).
			const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "kb-push-home-"));
			dirs.push(fakeHome);
			const previousHome = process.env.HOME;
			process.env.HOME = fakeHome;
			try {
				const svc = getPushService();
				expect(svc.logger).toBeNull();
				const logger = { info: vi.fn() };
				setPushServiceLogger(logger);
				expect(getPushService()).toBe(svc);
				expect(svc.logger).toBe(logger);
			} finally {
				process.env.HOME = previousHome;
				setPushServiceLogger(null);
			}
		});

		it("lets an explicit logger override win over the app logger", () => {
			const dir = makeDirWithKeys("public-L3", "private-L3");
			const appLoggerInstance = { info: vi.fn() };
			setPushServiceLogger(appLoggerInstance);
			const explicit = { info: vi.fn() };
			const svc = getPushService({ dir, logger: explicit });
			expect(svc.logger).toBe(explicit);
			// An explicit null keeps the service silent, same rule as bridge.
			const silent = getPushService({ dir, logger: null });
			expect(silent.logger).toBeNull();
			setPushServiceLogger(null);
		});
	});
});
