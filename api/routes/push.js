// Domain: Web Push — HTTP API for subscriptions, settings, and test sends.
/***
 * MARK: pushRoutes
 * @description Fastify routes under `/push`:
 *   - `GET /push/vapid-key` — public VAPID key for `PushManager.subscribe`.
 *   - `GET /push/settings` / `PUT /push/settings` — general notification prefs.
 *   - `POST /push/subscribe` / `POST /push/unsubscribe` — subscription lifecycle.
 *   - `POST /push/subscription-status` — server-side registration check for an endpoint.
 *   - `POST /push/test` — immediate verification push to all subscribers.
 *   - `GET /push/status` — `{ enabled, subscriptionCount }` for the settings UI.
 *   The service comes from `deps.pushService` (tests inject an isolated
 *   instance) or the process singleton. Subscription validation failures are
 *   400s; delivery itself never fails the request (result summary returned).
 * @example app.register(pushRoutes, { deps: { pushService } })
 ***/
import { getPublicVapidKey } from "../push/vapidKeys.js";
import { getPushService } from "../push/index.js";
import { defaultPushSettings, getPushSettings, updatePushSettings } from "../push/pushSettings.js";
import { isValidSubscription, isValidEndpoint } from "../push/subscriptionStore.js";

export default async function pushRoutes(app, { deps } = {}) {
	const service = deps?.pushService || getPushService();
	const dir = service.dir;

	app.get("/push/vapid-key", async () => {
		const publicKey = await getPublicVapidKey({ dir });
		return { publicKey };
	});

	app.get("/push/settings", async () => {
		// A persisted-but-invalid file must not break the settings UI:
		// serve defaults (the next PUT overwrites the bad file). Truly
		// invalid patches are still rejected loudly by PUT with a 400.
		try {
			return getPushSettings({ dir });
		} catch {
			return defaultPushSettings();
		}
	});

	app.put("/push/settings", async (request, reply) => {
		try {
			return updatePushSettings({ dir, patch: request.body || {} });
		} catch (error) {
			const message = error?.message || "Invalid push settings";
			if (String(message).startsWith("Invalid push settings")) {
				return reply.status(400).send({ error: message });
			}
			return reply.status(500).send({ error: "Could not save push settings — check server storage and permissions, then retry" });
		}
	});

	app.post("/push/subscribe", async (request, reply) => {
		const body = request.body || {};
		const candidate = {
			endpoint: body.endpoint,
			keys: body.keys,
			userAgent: request.headers?.["user-agent"] || "",
		};
		if (!isValidSubscription(candidate)) {
			return reply.status(400).send({ error: "Invalid subscription: endpoint and keys.p256dh/auth are required" });
		}
		try {
			const entry = service.store.addSubscription(candidate);
			return { ok: true, subscription: entry };
		} catch (error) {
			if (String(error?.message || "").startsWith("Invalid push subscription")) {
				return reply.status(400).send({ error: error.message });
			}
			// Storage (disk/permissions) failure: a 500 with an actionable
			// message, never an unhandled throw or leaked fs path.
			return reply.status(500).send({ error: "Could not store the push subscription — check server storage and permissions, then retry" });
		}
	});

	app.post("/push/unsubscribe", async (request, reply) => {
		const endpoint = request.body?.endpoint;
		if (typeof endpoint !== "string") return { ok: true, removed: false };
		try {
			const removed = service.store.removeSubscription(endpoint);
			return { ok: true, removed };
		} catch {
			return reply.status(500).send({ error: "Could not remove the push subscription — check server storage and permissions, then retry" });
		}
	});

	app.post("/push/subscription-status", async (request, reply) => {
		const endpoint = request.body?.endpoint;
		if (!isValidEndpoint(endpoint)) {
			return reply.status(400).send({ error: "Invalid endpoint: a valid HTTP/HTTPS URL is required" });
		}
		let registered = false;
		try {
			registered = service.store.hasSubscription(endpoint);
		} catch {
			// An unreadable store reads as "not registered": the client then
			// retries registration (an idempotent upsert) and, if that also
			// fails, reports the unverified state instead of a false success.
			registered = false;
		}
		return { ok: true, registered: Boolean(registered) };
	});

	app.post("/push/test", async (request, reply) => {
		const result = await service.sendTestNotification();
		if (result.skipped) {
			return {
				ok: false,
				skipped: result.skipped,
				error:
					result.skipped === "disabled"
						? "Push notifications are disabled — enable them in the master switch, then retry"
						: "Push notifications are skipped by configuration",
			};
		}
		// Surface the delivery breakdown so the UI can tell the operator
		// when a test "succeeded" but reached zero subscriptions (the
		// common sign of a server-side subscription store that never
		// received the browser's subscription, e.g. an SPA-fallback
		// HTML response to POST /push/subscribe).
		const delivered = result.delivered || 0;
		const subs = result.subscriptions || 0;
		const errors = result.errors || [];
		return {
			ok: delivered > 0,
			result: { ...result, delivered, subscriptions: subs, errors },
			error:
				delivered > 0
					? null
					: subs === 0
						? "No push subscriptions registered on the server — the browser subscription may not have been saved. Try disabling and re-enabling push notifications"
						: `Delivery failed for all ${subs} subscription(s) — check the server logs for details`,
		};
	});

	app.get("/push/status", async () => {
		let settings;
		try {
			settings = getPushSettings({ dir });
		} catch {
			settings = defaultPushSettings();
		}
		let subscriptionCount = 0;
		try {
			subscriptionCount = service.store.getSubscriptions().length;
		} catch {
			// Unreadable store reads as empty; delivery paths degrade the same way.
		}
		return {
			enabled: settings.enabled,
			triggers: settings.triggers,
			subscriptionCount,
		};
	});
}
