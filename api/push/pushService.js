// Domain: Web Push — notification dispatch engine.
/***
 * MARK: push notification service
 * @description Coordinates settings, subscriptions, and Web Push protocol
 *   delivery. `PushService` is deliberately transport-agnostic: the default
 *   sender wraps `web-push` (lazy import, so the module loads even where the
 *   dependency is absent and delivery degrades to a logged skip), and tests
 *   inject a stub sender. Dead endpoints (HTTP 404/410 from the browser push
 *   service) are pruned automatically. Every send also emits an `eventBridge`
 *   system log so push activity stays observable over the existing socket.
 * @example const svc = new PushService({ dir: "/tmp/kb-push", sender: stub }); await svc.notifyQueueEmpty({})
 ***/
import { defaultPushSettings, getPushSettings } from "./pushSettings.js";
import { PushSubscriptionStore } from "./subscriptionStore.js";
import { getVapidKeys, getVapidSubject } from "./vapidKeys.js";
import { config } from "../config.js";

/***
 * MARK: isGoneStatus
 * @description Whether a send failure means the subscription is dead and must
 *   be pruned (RFC 8030 Gone + Not Found).
 * @param {*} error
 * @returns {boolean}
 ***/
export function isGoneStatus(error) {
	const status = Number(error?.statusCode ?? error?.status ?? NaN);
	if (status === 404 || status === 410) return true;
	const text = String(error?.message || error || "");
	return /\b410\b|\b404\b|\bgone\b/i.test(text);
}

/***
 * MARK: createWebPushSender
 * @description Default transport over the `web-push` package. VAPID details
 *   are (re)set per send from the live keys so key rotation needs no restart.
 * @param {Object} [opts]
 * @param {Function} [opts.getKeys] - Async key supplier.
 * @param {Function} [opts.getSubject] - Subject supplier.
 * @returns {{ sendNotification: Function }}
 ***/
/***
 * MARK: push send options
 * @description Delivery options forwarded to the push service per send.
 *   `urgency: "high"` wakes dozing/sleeping mobile devices instead of
 *   letting the push service defer delivery; the TTLs bound staleness (a
 *   test ping arriving days late is noise, while a "needs you" alert is
 *   still actionable the next morning). The library default (TTL four
 *   weeks, normal urgency) is wrong for both cases, so every trigger sets
 *   these explicitly.
 ***/
export const PUSH_SEND_OPTIONS = Object.freeze({
	alert: Object.freeze({ TTL: 86400, urgency: "high" }),
	test: Object.freeze({ TTL: 300, urgency: "high" }),
});

export function createWebPushSender({ getKeys, getSubject } = {}) {
	return {
		async sendNotification(subscription, payload, options) {
			const { default: webpush } = await import("web-push");
			const keys = getKeys ? await getKeys() : await getVapidKeys();
			const subject = getSubject ? getSubject() : getVapidSubject();
			webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
			return webpush.sendNotification(subscription, payload, options);
		},
	};
}

export class PushService {
	constructor({ dir, sender, bridge, logger, getSettings, getKeys, getSubject, isGloballyEnabled } = {}) {
		if (!dir || typeof dir !== "string") {
			throw new Error("PushService requires a dir");
		}
		this.dir = dir;
		this.store = new PushSubscriptionStore({ dir });
		this.bridge = bridge || null;
		this.logger = logger || null;
		this.getSettings =
			getSettings || (() => getPushSettings({ dir: this.dir }));
		this.getKeys =
			getKeys || (() => getVapidKeys({ dir: this.dir }));
		this.getSubject = getSubject || (() => getVapidSubject());
		// The default sender must sign with THIS service's dir-scoped keys.
		// Binding after the assignments above (not from the raw constructor
		// args) keeps subscribe-time and send-time keys identical for custom
		// dirs; otherwise direct `new PushService({ dir })` callers hit FCM 403.
		this.sender = sender || createWebPushSender({ getKeys: this.getKeys, getSubject: this.getSubject });
		// Env-level master switch (KAINBAIN_PUSH_NOTIFICATIONS_ENABLED);
		// injectable so tests never depend on process env snapshots.
		this.isGloballyEnabled =
			isGloballyEnabled || (() => config.pushNotificationsEnabled !== false);
	}

	/***
	 * MARK: safeSettings
	 * @description Reads notification settings without ever throwing: a
	 *   missing/unreadable file reads as defaults, and a persisted-but-invalid
	 *   file (unknown trigger, wrong types) also falls back to defaults rather
	 *   than breaking scheduling, failure routing, or the settings API.
	 * @returns {{ enabled: boolean, triggers: Object, stages: Object }}
	 ***/
	safeSettings() {
		try {
			const settings = this.getSettings();
			if (settings && typeof settings === "object") return settings;
		} catch {
			// Fall through to defaults: push degrades, never crashes.
		}
		return defaultPushSettings();
	}

	/***
	 * MARK: isEnabled
	 * @description Whether any push may send: the shared `gate(null)` check
	 *   (env master switch + user master switch), so the predicate can never
	 *   drift from the per-trigger gates. Never throws.
	 * @returns {boolean}
	 ***/
	isEnabled() {
		try {
			return !this.gate(null).skipped;
		} catch {
			return false;
		}
	}

	/***
	 * MARK: log
	 * @description Broadcasts one observability line to both sinks, best-effort:
	 *   the WebSocket event bridge (live UI) and the optional structured logger
	 *   (persisted journal). Either sink may be absent — a test service passes
	 *   `bridge: null` / `logger: null` explicitly — and a throwing sink is
	 *   swallowed, because observability must never break delivery.
	 * @param {string} message - Human-readable line.
	 * @param {Object} [payload] - Structured context (pino argument order:
	 *   `logger.info(payload, message)`).
	 ***/
	log(message, payload) {
		const text = String(message);
		const data = payload || {};
		try {
			this.bridge?.emitSystemLog?.("push", text, data);
		} catch {
			// Observability must never break delivery.
		}
		try {
			// Pino-style structured logger (Fastify's `app.log`): payload first.
			this.logger?.info?.(data, text);
		} catch {
			// Observability must never break delivery.
		}
	}

	/***
	 * MARK: sendToAll
	 * @description Sends one payload to every stored subscription concurrently.
	 *   Prunes dead endpoints (404/410); never throws (returns a result
	 *   summary). Individual delivery failures are collected into `errors`
	 *   (endpoint + message) and logged per-subscription so operators can
	 *   diagnose why a notification never arrived (VAPID mismatch, push
	 *   service rejection, network block) instead of seeing a bare "0
	 *   delivered" with no explanation.
	 * @param {Object} notification - `{ title, body, tag?, data?, url? }`.
	 * @param {Object} [sendOptions] - Web Push send options (`{ TTL, urgency }`);
	 *   callers pass `PUSH_SEND_OPTIONS.alert` / `.test`, never the lib default.
	 * @returns {Promise<{ delivered: number, pruned: number, subscriptions: number, errors: Array<{endpoint: string, statusCode: number|null, message: string}> }>}
	 ***/
	async sendToAll(notification = {}, sendOptions) {
		const title = String(notification.title || "KainBain");
		const body = String(notification.body || "");
		const payload = JSON.stringify({
			title,
			body,
			icon: "/favicon.svg",
			badge: "/favicon.svg",
			tag: notification.tag || "kainbain",
			data: {
				url: notification.url || "/",
				...(notification.data && typeof notification.data === "object"
					? notification.data
					: {}),
			},
		});
		let subscriptions = [];
		try {
			subscriptions = this.store.getSubscriptions();
		} catch (error) {
			this.log(`[PUSH] subscription store unreadable — skipping send: ${String(error?.message || error).slice(0, 200)}`, { tag: notification.tag });
			return { delivered: 0, pruned: 0, subscriptions: 0, errors: [] };
		}
		// Corrupt/stale rows (endpoint or keys missing) can never be sent —
		// skip them without failing the whole fan-out.
		const sendable = subscriptions.filter(
			(sub) =>
				typeof sub?.endpoint === "string" &&
				sub.endpoint.length > 0 &&
				typeof sub?.keys?.p256dh === "string" &&
				typeof sub?.keys?.auth === "string",
		);
		if (sendable.length === 0) {
			return { delivered: 0, pruned: 0, subscriptions: subscriptions.length, errors: [] };
		}
		const outcomes = await Promise.allSettled(
			sendable.map((sub) =>
				// Deferred through Promise.resolve().then so a sender that
				// throws synchronously is recorded as a rejection, not a
				// fan-out crash.
				Promise.resolve().then(() =>
					this.sender.sendNotification(
						{ endpoint: sub.endpoint, keys: sub.keys },
						payload,
						sendOptions,
					),
				),
			),
		);
		let delivered = 0;
		let pruned = 0;
		const errors = [];
		outcomes.forEach((outcome, index) => {
			if (outcome.status === "fulfilled") {
				delivered += 1;
				return;
			}
			/* eslint-disable-next-line security/detect-object-injection -- index from Promise.allSettled order */
			const sub = sendable[index];
			const reason = outcome.reason;
			const statusCode = Number(reason?.statusCode ?? reason?.status ?? NaN);
			const errMsg = String(reason?.message || reason || "unknown error");
			if (isGoneStatus(reason)) {
				try {
					if (this.store.removeSubscription(sub.endpoint)) pruned += 1;
				} catch {
					// Prune failure must not break the summary.
				}
				// Gone subscriptions are pruned, not errors — the browser
				// already discarded them client-side.
				return;
			}
			// Non-gone failure: collect for the caller and log so the
			// operator can see WHY delivery failed (VAPID, network, etc.).
			const endpointHost = (() => {
				try {
					return new URL(sub.endpoint).host;
				} catch {
					return "unknown-host";
				}
			})();
			errors.push({
				endpoint: endpointHost,
				statusCode: Number.isNaN(statusCode) ? null : statusCode,
				message: errMsg.slice(0, 300),
			});
			this.log(
				`[PUSH] delivery failed for ${endpointHost}: ${errMsg.slice(0, 200)}`,
				{ tag: notification.tag, statusCode: Number.isNaN(statusCode) ? null : statusCode },
			);
		});
		this.log(
			`[PUSH] "${title}" → ${delivered}/${sendable.length} delivered, ${pruned} pruned${errors.length > 0 ? `, ${errors.length} failed` : ""}`,
			{
				tag: notification.tag,
				delivered,
				pruned,
				subscriptions: subscriptions.length,
				// First failure only — enough to diagnose, never a secret dump
				// (endpoints are already reduced to host names above).
				errors: errors.length > 0 ? [errors[0]] : [],
			},
		);
		return { delivered, pruned, subscriptions: subscriptions.length, errors };
	}

	/***
	 * MARK: gate
	 * @description Single settings read + gate check shared by every trigger.
	 *   Reads settings once (never throws — see `safeSettings`), then applies
	 *   the env-level master switch, the user master switch, and optionally
	 *   one per-trigger toggle.
	 * @param {string|null} triggerKey - e.g. `"queueEmpty"`, or null to skip
	 *   the per-trigger check (test sends bypass trigger gates).
	 * @returns {{ settings: Object }|{ skipped: string }}
	 ***/
	gate(triggerKey = null) {
		const settings = this.safeSettings();
		let globallyEnabled = true;
		try {
			globallyEnabled = this.isGloballyEnabled() !== false;
		} catch {
			globallyEnabled = false;
		}
		if (!globallyEnabled || settings?.enabled === false) {
			return { skipped: "disabled" };
		}
		/* eslint-disable-next-line security/detect-object-injection -- triggerKey is an internal literal ("queueEmpty"/"unrecoverableStageError"), never request input */
		const triggerOff = triggerKey && settings?.triggers?.[triggerKey] === false;
		if (triggerOff) {
			return { skipped: "trigger-off" };
		}
		return { settings };
	}

	/***
	 * MARK: notifyQueueEmpty
	 * @description Queue-empty trigger: fires only when the master switch and
	 *   the `queueEmpty` trigger are both on. Returns `{ skipped }` when gated.
	 *   The `humanPendingCount` enriches the body: the automated runner being
	 *   idle does not mean everything is done — tasks may wait for human
	 *   input, and the notification says so explicitly.
	 * @param {Object} [opts]
	 * @param {number} [opts.taskCount] - Tasks finished this run (completed-run body).
	 * @param {number} [opts.humanPendingCount] - Tasks waiting for human input.
	 * @example await svc.notifyQueueEmpty({ humanPendingCount: 2 })
	 ***/
	async notifyQueueEmpty({ taskCount, humanPendingCount } = {}) {
		const gated = this.gate("queueEmpty");
		if (gated.skipped) return gated;
		const humanCount =
			Number.isFinite(humanPendingCount) && humanPendingCount > 0
				? Math.floor(humanPendingCount)
				: 0;
		let body;
		if (humanCount > 0) {
			body =
				humanCount === 1
					? "No automated work left to run — 1 task waiting for human input."
					: `No automated work left to run — ${humanCount} tasks waiting for human input.`;
		} else if (typeof taskCount === "number" && Number.isFinite(taskCount)) {
			body = `All work is complete — no tasks left to run (${taskCount} finished this run).`;
		} else {
			body = "All work is complete — no tasks left to run.";
		}
		return this.sendToAll(
			{
				title: "KainBain: queue empty",
				body,
				tag: "queue-empty",
				url: "/",
				data: {
					kind: "queue-empty",
					humanPendingCount: humanCount,
				},
			},
			PUSH_SEND_OPTIONS.alert,
		);
	}

	/***
	 * MARK: notifyStageError
	 * @description Human-intervention trigger: fires only when the master
	 *   switch and the `unrecoverableStageError` trigger are both on.
	 ***/
	async notifyStageError({ projectId, taskId, stage, error, reason } = {}) {
		const gated = this.gate("unrecoverableStageError");
		if (gated.skipped) return gated;
		const stageLabel =
			stage?.name || stage?.id || "unknown stage";
		const detail = typeof error === "string" ? error : error?.message || "Stage error";
		return this.sendToAll(
			{
				title: `KainBain: "${stageLabel}" needs you`,
				body: `Task #${String(taskId || "?").slice(0, 8)} parked — human intervention required: ${detail}`.slice(0, 300),
				tag: "stage-error",
				url: "/",
				data: {
					kind: "stage-error",
					projectId: projectId || null,
					taskId: taskId || null,
					stageId: stage?.id || null,
					reason: reason || "human_intervention_required",
				},
			},
			PUSH_SEND_OPTIONS.alert,
		);
	}

	/***
	 * MARK: notifySchedulerStall
	 * @description Wedge-recovery trigger: fires once per episode when the
	 *   scheduler force-settles a queue entry that never settled and routes
	 *   its occupant to the transient ladder. Gated on the master switch
	 *   and the `schedulerStall` trigger only — routine stalls the watchdog
	 *   absorbs silently never reach here.
	 * @param {Object} [opts]
	 * @param {string} [opts.taskId] - Wedged occupant task id.
	 * @param {string} [opts.projectId] - Occupant project id.
	 * @param {number} [opts.ageMs] - Entry age at rescue (for the message).
	 * @param {string} [opts.reason] - Rescue cause: `engine-idle` | `engine-running` | `entry-timeout`.
	 * @example await svc.notifySchedulerStall({ taskId: "t1", reason: "engine-idle" })
	 ***/
	async notifySchedulerStall({ taskId, projectId, ageMs, reason } = {}) {
		const gated = this.gate("schedulerStall");
		if (gated.skipped) return gated;
		const shortId =
			typeof taskId === "string" && taskId.length > 0 ? taskId.slice(0, 8) : "?";
		const ageLabel =
			typeof ageMs === "number" && Number.isFinite(ageMs) && ageMs >= 0
				? ` after ${Math.round(ageMs / 1000)}s with no progress`
				: "";
		const cause =
			reason === "entry-timeout"
				? "outlived the queue settle guarantee"
				: reason === "engine-running"
					? "stopped settling while the engine still showed it running"
					: "stopped settling while the engine showed idle";
		return this.sendToAll(
			{
				title: "KainBain: scheduler recovered stuck work",
				body: `Task #${shortId} ${cause}${ageLabel} — force-settled and queued for retry. Check the run before trusting its output.`.slice(0, 300),
				tag: "scheduler-stall",
				url: "/",
				data: {
					kind: "scheduler-stall",
					projectId: projectId || null,
					taskId: taskId || null,
					reason: reason || "wedged-queue-entry",
				},
			},
			PUSH_SEND_OPTIONS.alert,
		);
	}

	/***
	 * MARK: sendTestNotification
	 * @description Immediate verification push. Honors the master switch but
	 *   bypasses per-trigger gates (a test must work even with triggers off).
	 ***/
	async sendTestNotification() {
		const gated = this.gate(null);
		if (gated.skipped) return gated;
		return this.sendToAll(
			{
				title: "KainBain: test notification",
				body: "Push notifications are working — you can leave this site and still be notified.",
				tag: "push-test",
				url: "/",
				data: { kind: "push-test" },
			},
			PUSH_SEND_OPTIONS.test,
		);
	}
}
