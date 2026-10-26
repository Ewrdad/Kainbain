// Domain: Web Push — process-wide singleton wiring.
/***
 * MARK: push singleton
 * @description Lazy process-wide `PushService` bound to the live push dir
 *   (`~/.kainbain/push`) and the shared `eventBridge`. Lazy on purpose: no
 *   disk or crypto work happens at import, so boot and unrelated test files
 *   pay nothing. `resetPushServiceForTests` drops the cached instance.
 * @example const svc = getPushService(); await svc.notifyQueueEmpty({})
 ***/
import { eventBridge } from "../eventBridge.js";
import { getVapidKeys, resolvePushDir } from "./vapidKeys.js";
import { PushService } from "./pushService.js";

let cached = null;
let appLogger = null;

/***
 * MARK: setPushServiceLogger
 * @description Wires the app's structured logger (Fastify's pino instance)
 *   into the push service so delivery outcomes are persisted in the service
 *   journal — the WebSocket bridge alone loses the record on restart. Safe
 *   to call before or after the service exists; test seams overriding
 *   `logger` explicitly always win.
 * @example setPushServiceLogger(app.log)
 * @param {Object|null} logger - pino-style logger (`info(payload, message)`).
 ***/
export function setPushServiceLogger(logger) {
	appLogger = logger || null;
	if (cached && "logger" in cached) cached.logger = appLogger;
}

/***
 * MARK: getPushService
 * @description Returns the shared PushService, creating it on first call.
 * @param {Object} [overrides] - Test seam (`{ dir, sender, bridge, logger, getKeys, getSubject }`).
 *   An explicit `bridge: null` means "no observability bridge" (silent
 *   service); only an omitted `bridge` falls back to the shared eventBridge.
 *   Same rule for `logger`: omitted falls back to the app logger wired via
 *   `setPushServiceLogger`.
 * @returns {PushService}
 ***/
export function getPushService(overrides = {}) {
	if (cached && Object.keys(overrides).length === 0) return cached;
	// The default sender signs with the VAPID keys for THIS service's dir.
	// Binding them here (instead of the global default dir inside the sender)
	// keeps subscribe-time keys (`GET /push/vapid-key`) and send-time keys
	// identical for custom dirs — a mismatch is the classic "permission
	// granted but no notification ever arrives" failure.
	const dir = overrides.dir || resolvePushDir();
	const svc = new PushService({
		dir,
		sender: overrides.sender,
		bridge: "bridge" in overrides ? overrides.bridge : eventBridge,
		logger: "logger" in overrides ? overrides.logger : appLogger,
		getKeys: overrides.getKeys || (() => getVapidKeys({ dir })),
		getSubject: overrides.getSubject,
	});
	if (Object.keys(overrides).length === 0) cached = svc;
	return svc;
}

/***
 * MARK: resetPushServiceForTests
 * @description Drops the cached singleton and the wired app logger (test
 *   seam; no disk effects).
 ***/
export function resetPushServiceForTests() {
	cached = null;
	appLogger = null;
}
