import {
	resolveWedgeOccupant,
	resolveWedgeStuckMs,
} from '../stageHeartbeat.js';
import { wedgeHeartbeatFresh } from './wedgeHeartbeatFresh.js';

/***
 * MARK: describeQueueWedge
 * @description Classifies a latched ExecutionQueue (`isRunning`) that the
 *   busy gate would otherwise lump into `skipped-busy`. Pure decision step
 *   (no settling, no routing): callers act on the returned kind.
 *   - `idle-starting`: engine idle, entry younger than its stuck budget (or
 *     guards disabled). A dispatch may be mid-start; count distinctly and
 *     touch nothing.
 *   - `idle-reconcilable`: engine idle, but the occupant's heartbeat is
 *     fresh — the run is alive and only the engine owner was lost (e.g. a
 *     watchdog kill of a *different* task clobbered the shared state).
 *     Re-attach the owner; never settle a live run.
 *   - `idle-stuck`: engine idle and the entry outlived its budget with no
 *     fresh heartbeat — the occupant is dead; settle + route.
 *   - `running-stuck`: engine running and the entry outlived its budget with
 *     no fresh heartbeat — the heartbeat watchdog is blind to this run.
 *     Settle + route.
 *   Returns null when there is no wedge to classify (queue idle, healthy
 *   busy, young running entry, paused/checkpoint engine, or guards off).
 * @param {Object} store
 * @param {Object} [opts]
 * @param {number} [opts.now] - Reference time for age/heartbeat checks.
 * @returns {Object|null} `{ kind, entry, taskId, projectId, project, stage, ageMs, stuckMs }`.
  * @example describeQueueWedge(store) => null (healthy) | { kind, taskId, … }
 ***/
export function describeQueueWedge(store, { now = Date.now() } = {}) {
	try {
		const queue = store?.executionQueue;
		if (!queue || !queue.isRunning) return null;
		const referenceNow = Number.isFinite(now) ? now : Date.now();
		const entry = queue.activeEntry ?? null;
		let ageMs = 0;
		try {
			if (typeof queue.activeAgeMs === "number") ageMs = queue.activeAgeMs;
		} catch {
			ageMs = 0;
		}
		if (!Number.isFinite(ageMs) || ageMs < 0) ageMs = 0;
		const status = store?.engineState?.status;
		const engineBusy = status === "running";
		const ownerTaskId = store?.engineState?.activeTaskId ?? null;
		const entryTaskId = entry?.taskId ?? null;
		const entryProjectId = entry?.projectId ?? null;

		if (!engineBusy && ownerTaskId == null) {
			const occupant = resolveWedgeOccupant(store, entryProjectId, entryTaskId);
			const stage = occupant.stage || null;
			const stuckMs = resolveWedgeStuckMs(store, stage);
			const base = {
				entry,
				taskId: entryTaskId,
				projectId: entryProjectId ?? occupant.project?.id ?? null,
				project: occupant.project,
				stage,
				ageMs,
				stuckMs,
			};
			if (wedgeHeartbeatFresh(store, entryTaskId, stuckMs, referenceNow)) {
				return { ...base, kind: "idle-reconcilable" };
			}
			if (stuckMs > 0 && ageMs >= stuckMs) {
				return { ...base, kind: "idle-stuck" };
			}
			return { ...base, kind: "idle-starting" };
		}

		if (engineBusy) {
			const runTaskId = entryTaskId ?? ownerTaskId;
			if (runTaskId == null) return null;
			const occupant = resolveWedgeOccupant(
				store,
				entryProjectId ?? store?.engineState?.activeProjectId ?? null,
				runTaskId,
			);
			const stage = occupant.stage || null;
			const stuckMs = resolveWedgeStuckMs(store, stage);
			if (!(stuckMs > 0) || ageMs < stuckMs) return null;
			if (wedgeHeartbeatFresh(store, runTaskId, stuckMs, referenceNow)) return null;
			return {
				kind: "running-stuck",
				entry,
				taskId: runTaskId,
				projectId: entryProjectId ?? occupant.project?.id ?? null,
				project: occupant.project,
				stage,
				ageMs,
				stuckMs,
			};
		}

		// Paused / checkpoint / unknown engine states with a latched queue
		// keep today's behavior (plain skipped-busy): wedge rescue owns only
		// the idle and running shapes.
		return null;
	} catch {
		return null;
	}
}
