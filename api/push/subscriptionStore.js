// Domain: Web Push — durable client subscription storage.
/***
 * MARK: push subscription store
 * @description Atomic JSON persistence for Web Push subscriptions at
 *   `<dir>/push-subscriptions.json`: `{ subscriptions: [...] }` where each
 *   entry is `{ endpoint, keys: { p256dh, auth }, userAgent, createdAt,
 *   lastUsedAt }`. Endpoints deduplicate (re-subscribe refreshes
 *   `lastUsedAt`); dead endpoints (push service 404/410) are pruned via
 *   `removeSubscription`. All writes are tmp + rename so a crash never
 *   leaves a half-written file. Instances are cheap: pass an isolated `dir`
 *   in tests so the live push state is never touched.
 * @example const store = new PushSubscriptionStore({ dir: "/tmp/kb-push" }); store.addSubscription(sub)
 ***/
import fs from "node:fs";
import path from "node:path";
import { writePushJsonFile } from "./atomicWrite.js";

export const SUBSCRIPTIONS_FILE_NAME = "push-subscriptions.json";

/***
 * MARK: isValidEndpoint
 * @description Whether an endpoint string is a valid HTTP/HTTPS URL.
 * @param {*} endpoint
 * @returns {boolean}
 ***/
export function isValidEndpoint(endpoint) {
	if (typeof endpoint !== "string" || endpoint.length === 0) return false;
	try {
		const parsed = new URL(endpoint);
		return parsed.protocol === "https:" || parsed.protocol === "http:";
	} catch {
		return false;
	}
}

/***
 * MARK: isValidSubscription
 * @description Whether a posted body is a well-formed push subscription
 *   (endpoint URL plus p256dh/auth keys).
 * @param {*} sub
 * @returns {boolean}
 ***/
export function isValidSubscription(sub) {
	if (!sub || typeof sub !== "object") return false;
	if (!isValidEndpoint(sub.endpoint)) return false;
	const keys = sub.keys;
	if (!keys || typeof keys !== "object") return false;
	return (
		typeof keys.p256dh === "string" &&
		keys.p256dh.length > 0 &&
		typeof keys.auth === "string" &&
		keys.auth.length > 0
	);
}

export class PushSubscriptionStore {
	constructor({ dir } = {}) {
		if (!dir || typeof dir !== "string") {
			throw new Error("PushSubscriptionStore requires a dir");
		}
		this.dir = dir;
	}

	get filePath() {
		return path.join(this.dir, SUBSCRIPTIONS_FILE_NAME);
	}

	/***
	 * MARK: readAll
	 * @description Reads the subscription list; missing/corrupt files read as
	 *   empty (never throw — push delivery must degrade, not crash).
	 * @returns {Array<Object>}
	 ***/
	readAll() {
		try {
			/* eslint-disable-next-line security/detect-non-literal-fs-filename -- dir is server-owned push state, not request input */
			const raw = fs.readFileSync(this.filePath, "utf8");
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed?.subscriptions)) return [];
			return parsed.subscriptions.filter(
				(entry) => typeof entry?.endpoint === "string",
			);
		} catch {
			return [];
		}
	}

	persist(list) {
		// Push endpoints + auth keys are bearer-capable secrets: the shared
		// writer stores them 0600 so other local users cannot mint pushes.
		writePushJsonFile(this.dir, SUBSCRIPTIONS_FILE_NAME, { subscriptions: list });
	}

	/***
	 * MARK: addSubscription
	 * @description Adds a subscription, or refreshes `lastUsedAt` when the
	 *   endpoint already exists. Throws on malformed input.
	 * @param {Object} sub - `{ endpoint, keys: { p256dh, auth }, userAgent? }`
	 * @returns {Object} The stored entry.
	 ***/
	addSubscription(sub) {
		if (!isValidSubscription(sub)) {
			throw new Error("Invalid push subscription: endpoint and keys.p256dh/auth are required");
		}
		const list = this.readAll();
		const now = new Date().toISOString();
		const existing = list.find((entry) => entry.endpoint === sub.endpoint);
		if (existing) {
			existing.keys = { p256dh: sub.keys.p256dh, auth: sub.keys.auth };
			if (typeof sub.userAgent === "string" && sub.userAgent) {
				existing.userAgent = sub.userAgent;
			}
			existing.lastUsedAt = now;
			this.persist(list);
			return existing;
		}
		const entry = {
			endpoint: sub.endpoint,
			keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
			userAgent: typeof sub.userAgent === "string" ? sub.userAgent : "",
			createdAt: now,
			lastUsedAt: now,
		};
		list.push(entry);
		this.persist(list);
		return entry;
	}

	/***
	 * MARK: removeSubscription
	 * @description Removes one endpoint; returns true when something was removed.
	 * @param {string} endpoint
	 * @returns {boolean}
	 ***/
	removeSubscription(endpoint) {
		const list = this.readAll();
		const next = list.filter((entry) => entry.endpoint !== endpoint);
		if (next.length === list.length) return false;
		this.persist(next);
		return true;
	}

	/***
	 * MARK: getSubscriptions
	 * @description Returns all stored subscriptions (shallow copies).
	 * @returns {Array<Object>}
	 ***/
	getSubscriptions() {
		return this.readAll().map((entry) => ({ ...entry }));
	}

	/***
	 * MARK: hasSubscription
	 * @description Checks whether an endpoint is already registered.
	 * @param {string} endpoint
	 * @returns {boolean}
	 ***/
	hasSubscription(endpoint) {
		if (typeof endpoint !== "string" || !endpoint) return false;
		return this.readAll().some((entry) => entry.endpoint === endpoint);
	}

	/***
	 * MARK: clear
	 * @description Removes all subscriptions (test/support seam).
	 ***/
	clear() {
		this.persist([]);
	}
}
