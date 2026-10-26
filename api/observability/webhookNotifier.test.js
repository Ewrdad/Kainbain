// Domain: Observability — subject unit tests for the signed webhook sink.
import { describe, it, expect } from "vitest";
import {
	WEBHOOK_SIGNATURE_HEADER,
	WEBHOOK_EVENT_HEADER,
	WebhookNotifier,
	isRetryableStatus,
	retryDelayMs,
	signWebhookBody,
	verifyWebhookSignature,
} from "./webhookNotifier.js";

/**
 * MARK: webhookNotifier contract tests
 * @description Pins the outbound sink contract WP10 will rely on: HMAC
 * signing, retry-without-task-failure, and the never-throws guarantee.
 */
describe("webhook signatures (HMAC-SHA256)", () => {
	it("signs with a stable sha256= vector", () => {
		const first = signWebhookBody('{"event":"task.failed"}', "secret-1");
		expect(first).toMatch(/^sha256=[0-9a-f]{64}$/);
		expect(signWebhookBody('{"event":"task.failed"}', "secret-1")).toBe(first);
		expect(signWebhookBody('{"event":"task.failed"}', "secret-2")).not.toBe(first);
	});

	it("verifies its own signatures and rejects forgeries", () => {
		const body = '{"event":"task.failed","severity":"critical"}';
		const good = signWebhookBody(body, "s3cret");
		expect(verifyWebhookSignature(body, "s3cret", good)).toBe(true);
		expect(verifyWebhookSignature(`${body} `, "s3cret", good)).toBe(false);
		expect(verifyWebhookSignature(body, "wrong", good)).toBe(false);
		expect(verifyWebhookSignature(body, "s3cret", "sha256=dead")).toBe(false);
		expect(verifyWebhookSignature(body, "s3cret", "")).toBe(false);
	});
});

describe("webhook retry policy", () => {
	it("retries 5xx, 429, and 408 but settles other 4xx immediately", () => {
		expect(isRetryableStatus(500)).toBe(true);
		expect(isRetryableStatus(503)).toBe(true);
		expect(isRetryableStatus(429)).toBe(true);
		expect(isRetryableStatus(408)).toBe(true);
		expect(isRetryableStatus(400)).toBe(false);
		expect(isRetryableStatus(401)).toBe(false);
		expect(isRetryableStatus(404)).toBe(false);
		expect(isRetryableStatus(200)).toBe(false);
	});

	it("backs off exponentially from the base", () => {
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			const delay = retryDelayMs(500, attempt);
			const floor = 500 * 2 ** (attempt - 1);
			expect(delay).toBeGreaterThanOrEqual(floor);
			expect(delay).toBeLessThanOrEqual(floor * 1.25);
		}
	});
});

describe("WebhookNotifier delivery", () => {
	function payload() {
		return {
			version: 1,
			event: "task.failed",
			severity: "critical",
			occurredAt: new Date().toISOString(),
		};
	}

	it("posts JSON with the signature and event headers", async () => {
		const calls = [];
		const fetchImpl = async (url, init) => {
			calls.push({ url, init });
			return { status: 200 };
		};
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			secret: "s3cret",
			fetchImpl,
		});
		const result = await notifier.send(payload());
		expect(result).toMatchObject({ delivered: true, attempts: 1, lastError: null });
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toBe("https://hooks.home/alerts");
		expect(calls[0].init.method).toBe("POST");
		expect(calls[0].init.headers["Content-Type"]).toBe("application/json");
		/* eslint-disable-next-line security/detect-object-injection -- test reads the header the sink just wrote */
		expect(calls[0].init.headers[WEBHOOK_SIGNATURE_HEADER]).toMatch(/^sha256=/);
		/* eslint-disable-next-line security/detect-object-injection -- test reads the header the sink just wrote */
		expect(calls[0].init.headers[WEBHOOK_EVENT_HEADER]).toBe("task.failed");
		const body = calls[0].init.body;
		expect(JSON.parse(body).event).toBe("task.failed");
		expect(
			/* eslint-disable-next-line security/detect-object-injection -- test reads the header the sink just wrote */
			verifyWebhookSignature(body, "s3cret", calls[0].init.headers[WEBHOOK_SIGNATURE_HEADER]),
		).toBe(true);
	});

	it("omits the signature header when no secret is configured", async () => {
		const calls = [];
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			fetchImpl: async (url, init) => {
				calls.push(init);
				return { status: 200 };
			},
		});
		await notifier.send(payload());
		/* eslint-disable-next-line security/detect-object-injection -- test reads the header the sink just wrote */
		expect(calls[0].headers[WEBHOOK_SIGNATURE_HEADER]).toBeUndefined();
	});

	it("retries a flaky sink and then delivers", async () => {
		let calls = 0;
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			retries: 3,
			baseMs: 1,
			fetchImpl: async () => {
				calls += 1;
				return { status: calls < 3 ? 503 : 200 };
			},
		});
		const result = await notifier.send(payload());
		expect(result).toMatchObject({ delivered: true, attempts: 3, lastError: null });
		expect(calls).toBe(3);
	});

	it("gives up on a dead sink without throwing", async () => {
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			retries: 3,
			baseMs: 1,
			fetchImpl: async () => {
				throw new Error("connection refused");
			},
		});
		const result = await notifier.send(payload());
		expect(result.delivered).toBe(false);
		expect(result.attempts).toBe(3);
		expect(result.lastError).toContain("connection refused");
	});

	it("settles a 4xx rejection without retrying", async () => {
		let calls = 0;
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			retries: 3,
			baseMs: 1,
			fetchImpl: async () => {
				calls += 1;
				return { status: 400 };
			},
		});
		const result = await notifier.send(payload());
		expect(result.delivered).toBe(false);
		expect(calls).toBe(1);
	});

	it("resolves instead of throwing when the URL is missing", async () => {
		const notifier = new WebhookNotifier({ url: "" });
		const result = await notifier.send(payload());
		expect(result).toMatchObject({ delivered: false, attempts: 0 });
		expect(typeof result.lastError).toBe("string");
	});

	it("retries a response without an HTTP status instead of calling it delivered", async () => {
		let calls = 0;
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			retries: 2,
			baseMs: 1,
			fetchImpl: async () => {
				calls += 1;
				return {};
			},
		});
		const result = await notifier.send(payload());
		expect(result.delivered).toBe(false);
		expect(result.attempts).toBe(2);
		expect(result.lastError).toContain("no HTTP status");
		expect(calls).toBe(2);
	});

	it("performs zero fetches when retries is 0 (delivery disabled)", async () => {
		let calls = 0;
		const notifier = new WebhookNotifier({
			url: "https://hooks.home/alerts",
			retries: 0,
			fetchImpl: async () => {
				calls += 1;
				return { status: 200 };
			},
		});
		const result = await notifier.send(payload());
		expect(result).toMatchObject({ delivered: false, attempts: 0 });
		expect(typeof result.lastError).toBe("string");
		expect(calls).toBe(0);
	});

	it("falls back to 3 attempts for a non-numeric retry budget", () => {
		const notifier = new WebhookNotifier({ url: "https://hooks.home/alerts", retries: "many" });
		expect(notifier.retries).toBe(3);
	});
});
