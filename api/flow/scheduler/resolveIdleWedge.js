import {
	recoverWedgedQueueEntry,
} from '../stageHeartbeat.js';
import { describeQueueWedge } from './describeQueueWedge.js';

/***
 * MARK: resolveIdleWedge
 * @description Acts on an engine-idle + queue-latched tick per
 *   `describeQueueWedge`: rescues dead entries (settle + transient route +
 *   once-per-episode push via the shared helper), re-attaches the engine
 *   owner for live entries, and counts young entries distinctly without
 *   touching them. Never throws; always leaves a distinct `lastOutcome`.
 * @param {Object} store
 * @param {Object} stats - `store.schedulerStats` (mutated).
  * @example resolveIdleWedge(store, stats) => (idle wedge rescued or no-op)
 ***/
export function resolveIdleWedge(store, stats) {
	const wedge = describeQueueWedge(store);
	if (!wedge) {
		stats.lastOutcome = "skipped-busy-while-idle";
		return;
	}
	if (wedge.kind === "idle-stuck") {
		recoverWedgedQueueEntry(store, {
			entry: wedge.entry,
			projectId: wedge.projectId,
			taskId: wedge.taskId,
			stage: wedge.stage,
			ageMs: wedge.ageMs,
			reason: "engine-idle",
			bridge: store.eventBridge,
		});
		stats.lastOutcome = "stall-recovered-wedged-entry";
		return;
	}
	if (wedge.kind === "idle-reconcilable" && wedge.taskId != null) {
		// The run is alive (fresh heartbeat); only the engine owner was
		// lost. Re-attach it so the UI, the watchdog, and the busy gate see
		// one honest state instead of a calm idle lie.
		try {
			const stage = wedge.stage;
			const owner = {
				status: "running",
				activeTaskId: wedge.taskId,
				activeProjectId: wedge.projectId,
				activeProjectName: wedge.project?.name ?? wedge.project?.id ?? null,
				activeStageId: stage?.id ?? null,
				activeStageName: stage?.name ?? stage?.id ?? null,
				activeStageType: stage?.type ?? null,
			};
			if (typeof store.setEngineState === "function") {
				store.setEngineState(owner);
			} else if (store.engineState) {
				Object.assign(store.engineState, owner);
			}
			stats.lastOutcome = "reconciled-running-owner";
		} catch {
			stats.lastOutcome = "skipped-busy-while-idle";
		}
		return;
	}
	stats.lastOutcome = "skipped-busy-while-idle";
}
