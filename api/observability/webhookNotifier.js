// Domain: Observability — outbound webhook delivery for human-intervention alerts.
import { createHmac, timingSafeEqual } from "node:crypto";

/***
 * MARK: webhook signature header
 * @description Header carrying the HMAC-SHA256 signature of the raw JSON
 *   body, so receivers can verify a delivery came from this engine.
 *   Omitted entirely when no secret is configured (unsigned delivery).
 * @example WEBHOOK_SIGNATURE_HEADER => 'X-KainBain-Signature'
 ***/
export const WEBHOOK_SIGNATURE_HEADER = "X-KainBain-Signature";

/***
 * MARK: webhook event header
 * @description Header naming the alert event (e.g. `task.failed`) so
 *   receivers can route without parsing the body.
 * @example WEBHOOK_EVENT_HEADER => 'X-KainBain-Event'
 ***/
export const WEBHOOK_EVENT_HEADER = "X-KainBain-Event";

/***
 * MARK: signWebhookBody
 * @description Signs raw body bytes with HMAC-SHA256 under the shared
 *   secret. The secret lives only in env and never enters the payload.
 * @example signWebhookBody('{}', 's') => 'sha256=…'
 * @param {string} bodyText - Exact bytes that will be POSTed.
 * @param {string} secret - Shared HMAC key.
 * @returns {string} `sha256=<hex>` signature value.
 ***/
export function signWebhookBody(bodyText, secret) {
	const digest = createHmac("sha256", String(secret))
		.update(String(bodyText), "utf8")
		.digest("hex");
	return `sha256=${digest}`;
}

/***
 * MARK: verifyWebhookSignature
 * @description Checks a received signature header against the expected HMAC
 *   using a timing-safe comparison, so test receivers and operators can
 *   prove a delivery is authentic.
 * @example verifyWebhookSignature('{}', 's', signWebhookBody('{}', 's')) => true
 * @param {string} bodyText - Exact bytes received.
 * @param {string} secret - Shared HMAC key.
 * @param {string} signature - The received header value.
 * @returns {boolean} Whether the signature matches.
 ***/
export function verifyWebhookSignature(bodyText, secret, signature) {
	if (typeof signature !== "string" || !signature.startsWith("sha256=")) {
		return false;
	}
	const expected = signWebhookBody(bodyText, secret);
	const received = Buffer.from(signature, "utf8");
	const wanted = Buffer.from(expected, "utf8");
	if (received.length !== wanted.length) return false;
	return timingSafeEqual(received, wanted);
}

/***
 * MARK: sleep
 * @description Interruptible-by-design delay between webhook retries.
 * @example await sleep(10) => (resolves after ~10ms)
 ***/
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/***
 * MARK: retryDelayMs
 * @description Exponential backoff with jitter for one retry attempt:
 *   `baseMs * 2^(attempt-1)` plus up to 25% random spread, so a fleet of
 *   notifiers does not hammer a recovering sink in lockstep.
 * @example retryDelayMs(500, 1) => (a number between 500 and 625)
 ***/
export function retryDelayMs(baseMs, attempt) {
	const base = Math.max(0, Number(baseMs) || 0);
	const grown = base * 2 ** Math.max(0, attempt - 1);
	return grown + Math.random() * grown * 0.25;
}

/***
 * MARK: isRetryableStatus
 * @description Whether an HTTP status is worth retrying: request timeouts,
 *   rate limits, and server errors are transient; other 4xx rejections would
 *   fail the same way on every attempt, so they settle immediately.
 * @example isRetryableStatus(503) => true
 ***/
export function isRetryableStatus(status) {
	if (status === 429 || status === 408) return true;
	return Number.isInteger(status) && status >= 500 && status <= 599;
}

/***
 * MARK: WebhookNotifier
 * @description Posts one JSON alert envelope to a generic signed webhook
 *   with bounded retries. Never throws and never fails the task: every
 *   outcome — delivered, rejected, or sink unreachable — resolves as a
 *   `{ delivered, attempts, lastError }` summary the caller may log and
 *   ignore. Implements the `Notifier` seam (`{ name, send }`) so later
 *   Slack/email adapters can sit beside it over the same envelope.
 * @example new WebhookNotifier({ url: 'https://hooks.home/a' }).send({ event: 'task.failed' })
 ***/
export class WebhookNotifier {
	/***
	 * MARK: constructor
	 * @description Captures the sink settings; nothing is sent until `send`.
	 * @example new WebhookNotifier({ url, secret, retries: 3 })
	 * @param {Object} [opts]
	 * @param {string} opts.url - Webhook endpoint (required to deliver).
	 * @param {string} [opts.secret] - HMAC key; when empty the delivery is unsigned.
	 * @param {number} [opts.retries] - Total POST attempts before giving up.
	 *   `0` disables delivery (resolves undelivered without fetching).
	 * @param {number} [opts.baseMs] - Base backoff between attempts in ms.
	 * @param {number} [opts.timeoutMs] - Per-attempt fetch timeout in ms.
	 * @param {Function} [opts.fetchImpl] - Fetch override (tests inject a stub).
	 ***/
	constructor({ url, secret = "", retries = 3, baseMs = 500, timeoutMs = 5000, fetchImpl } = {}) {
		this.name = "webhook";
		this.url = typeof url === "string" ? url.trim() : "";
		this.secret = typeof secret === "string" ? secret : "";
		const parsedRetries = Math.floor(Number(retries));
		this.retries = Number.isFinite(parsedRetries) ? Math.max(0, parsedRetries) : 3;
		this.baseMs = Math.max(0, Number(baseMs) || 0);
		this.timeoutMs = Math.max(0, Number(timeoutMs) || 0);
		this.fetchImpl = typeof fetchImpl === "function" ? fetchImpl : globalThis.fetch?.bind(globalThis);
	}

	/***
	 * MARK: send
	 * @description POSTs the envelope once, retrying network errors, 5xx,
	 *   and 429 with backoff. Resolves — never rejects — with the outcome.
	 * @example await notifier.send(payload) => { delivered: true, attempts: 1, lastError: null }
	 * @param {Object} payload - The alert envelope (JSON-serializable).
	 * @returns {Promise<{ delivered: boolean, attempts: number, lastError: string|null }>}
	 ***/
	async send(payload) {
		if (!this.url) {
			return { delivered: false, attempts: 0, lastError: "webhook URL is not configured" };
		}
		if (typeof this.fetchImpl !== "function") {
			return { delivered: false, attempts: 0, lastError: "no fetch implementation available" };
		}
		if (this.retries <= 0) {
			return { delivered: false, attempts: 0, lastError: "webhook delivery disabled (retries is 0)" };
		}
		let body = "";
		try {
			body = JSON.stringify(payload);
		} catch (error) {
			return {
				delivered: false,
				attempts: 0,
				lastError: `payload is not JSON-serializable: ${error?.message || error}`,
			};
		}
		const headers = { "Content-Type": "application/json" };
		if (this.secret) {
			/* eslint-disable-next-line security/detect-object-injection -- header name is the module constant above */
			headers[WEBHOOK_SIGNATURE_HEADER] = signWebhookBody(body, this.secret);
		}
		if (payload?.event) {
			/* eslint-disable-next-line security/detect-object-injection -- header name is the module constant above */
			headers[WEBHOOK_EVENT_HEADER] = String(payload.event);
		}
		let attempts = 0;
		let lastError = null;
		for (let attempt = 1; attempt <= this.retries; attempt += 1) {
			attempts = attempt;
			const controller = new AbortController();
			let timer = null;
			try {
				if (this.timeoutMs > 0) {
					timer = setTimeout(() => controller.abort(), this.timeoutMs);
					// The abort timer guards one attempt; it must never keep a
					// fire-and-forget process alive on its own (the in-flight
					// fetch socket already holds the loop while it matters).
					timer.unref?.();
				}
				const response = await this.fetchImpl(this.url, {
					method: "POST",
					headers,
					body,
					signal: controller.signal,
				});
				const status = response?.status;
				if (!Number.isInteger(status)) {
					// A fetch that resolves without an HTTP status proves
					// nothing: treat it as a transient failure and retry.
					lastError = "webhook returned no HTTP status";
				} else if (status < 200 || status >= 300) {
					lastError = `webhook responded with HTTP ${status}`;
					if (!isRetryableStatus(status)) break;
				} else {
					return { delivered: true, attempts, lastError: null };
				}
			} catch (error) {
				lastError = error?.message || String(error || "fetch failed");
			} finally {
				if (timer) clearTimeout(timer);
			}
			if (attempt < this.retries) {
				await sleep(retryDelayMs(this.baseMs, attempt));
			}
		}
		return { delivered: false, attempts, lastError };
	}
}
