import {
	recoverWedgedQueueEntry,
} from '../stageHeartbeat.js';
import { describeQueueWedge } from './describeQueueWedge.js';

/***
 * MARK: resolveRunningWedge
 * @description Acts on an engine-running + queue-latched tick per
 *   `describeQueueWedge`: rescues only entries that outlived their stuck
 *   budget with no fresh heartbeat. Returns true when a rescue ran (the
 *   caller must end the tick with the rescue outcome, not `skipped-busy`).
 * @param {Object} store
 * @param {Object} stats - `store.schedulerStats` (mutated).
 * @returns {boolean} Whether a wedge rescue ran.
  * @example resolveRunningWedge(store, stats) => false (no wedge rescue ran)
 ***/
export function resolveRunningWedge(store, stats) {
	const wedge = describeQueueWedge(store);
	if (!wedge || wedge.kind !== "running-stuck") return false;
	recoverWedgedQueueEntry(store, {
		entry: wedge.entry,
		projectId: wedge.projectId,
		taskId: wedge.taskId,
		stage: wedge.stage,
		ageMs: wedge.ageMs,
		reason: "engine-running",
		bridge: store.eventBridge,
	});
	stats.lastOutcome = "stall-recovered-wedged-entry";
	return true;
}
