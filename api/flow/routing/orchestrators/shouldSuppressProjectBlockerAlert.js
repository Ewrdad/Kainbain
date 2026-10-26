import {
	PROJECT_BLOCKER_ALERT_MEMORY_LIMIT,
} from '../tables/index.js';

/***
 * MARK: shouldSuppressProjectBlockerAlert
 * @description Project-blocker alert dedupe (C3): one red shared gate parks N
 *   tasks, but only the FIRST park per gate@sha pages the operator — later
 *   parks record the same reason in history/timeline without re-alerting.
 *   Returns true when this gate@sha has already alerted, and records it
 *   otherwise. Best-effort and in-memory by design (a restart may re-alert
 *   once); the map is capped at `PROJECT_BLOCKER_ALERT_MEMORY_LIMIT`. Total:
 *   a missing store, blank key, or malformed map returns false (never
 *   suppress) so an alert is never lost to a bookkeeping failure.
 * @example shouldSuppressProjectBlockerAlert(store, 'canary-e2e@abc') => false (first time)
 * @param {Object} [store] - Task store carrying the dedupe memory.
 * @param {string} [blockerKey] - `gate@sha` token.
 * @param {Object} [context] - `{ taskId, projectId }` recorded for debugging.
 * @returns {boolean} True when the alert should be suppressed.
 ***/
export function shouldSuppressProjectBlockerAlert(store, blockerKey, context = {}) {
	try {
		const key = typeof blockerKey === "string" ? blockerKey.trim() : "";
		if (!key || !store || typeof store !== "object") return false;
		let table = store.sharedGateBlockerAlerts;
		if (!table || typeof table !== "object" || Array.isArray(table)) {
			table = {};
			store.sharedGateBlockerAlerts = table;
		}
		/* eslint-disable-next-line security/detect-object-injection -- key is a bounded gate@sha token, never raw input */
		if (table[key]) return true;
		/* eslint-disable-next-line security/detect-object-injection -- key is a bounded gate@sha token, never raw input */
		table[key] = {
			taskId: typeof context?.taskId === "string" ? context.taskId : "",
			projectId: typeof context?.projectId === "string" ? context.projectId : "",
			alertedAt: new Date().toISOString(),
		};
		const keys = Object.keys(table);
		if (keys.length > PROJECT_BLOCKER_ALERT_MEMORY_LIMIT) {
			keys.sort((a, b) => {
				/* eslint-disable security/detect-object-injection -- keys are this table's own properties */
				const at = String(table[a]?.alertedAt || "");
				const bt = String(table[b]?.alertedAt || "");
				/* eslint-enable security/detect-object-injection */
				return at.localeCompare(bt);
			});
			for (const stale of keys.slice(
				0,
				keys.length - PROJECT_BLOCKER_ALERT_MEMORY_LIMIT,
			)) {
				/* eslint-disable-next-line security/detect-object-injection -- stale is this table's own property name */
				delete table[stale];
			}
		}
		return false;
	} catch {
		return false;
	}
}
