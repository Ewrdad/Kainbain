import {
	getStageHeartbeat,
} from '../stageHeartbeat.js';

/***
 * MARK: wedgeHeartbeatFresh
 * @description Whether a task's heartbeat proves its run is still alive:
 *   beaten within the stuck budget (and never in the future). A missing,
 *   corrupt, or stale record is NOT fresh — an unprovable run is treated as
 *   dead by the wedge classifiers below, never as healthy.
 * @param {Object} store
 * @param {string|null} taskId
 * @param {number} stuckMs - Stuck budget the beat is measured against.
 * @param {number} now - Reference time.
 * @returns {boolean}
 * @private
  * @example wedgeHeartbeatFresh(store, taskId, 30000, Date.now()) => true
 ***/
export function wedgeHeartbeatFresh(store, taskId, stuckMs, now) {
	try {
		if (taskId == null || !(stuckMs > 0)) return false;
		const hb = getStageHeartbeat(store, taskId);
		if (!hb || typeof hb.lastBeatAt !== "number") return false;
		const age = now - hb.lastBeatAt;
		return Number.isFinite(age) && age >= 0 && age <= stuckMs;
	} catch {
		return false;
	}
}
