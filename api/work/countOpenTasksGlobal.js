import { isWaitingForPickup } from "../flow/scheduler/isWaitingForPickup.js";

/***
 * MARK: countOpenTasksGlobal
 * @description Counts tasks WAITING to be picked up by a runner/scheduler
 * across ALL projects — the number behind the bottom-bar queue chip
 * (`snapshot.openQueueDepth`). Waiting means the shared
 * `isWaitingForPickup` verdict: `in_stage` (or an auto-resumable
 * interruption) on an automated, unpaused stage, unblocked, unclaimed,
 * and not the actively running engine owner. Tasks already being worked
 * on, blocked, paused, failed, cancelled, or waiting-human are never
 * counted. Deliberately iterates only the in-memory maps: a state READ
 * must never mutate the cache, and `listTasks` triggers a disk rescan
 * that overwrites live in-flight statuses (e.g. a `running_agent` set
 * after the last disk write). The server scans projects at startup and
 * the scheduler scans per tick, so the maps converge on their own; the
 * depth reports the server's known state, never a fabricated number.
 * Never throws: an unreadable map contributes zero instead of breaking a
 * state read. Reads the raw `store.engineState` field (never
 * `store.getEngineState()`, which derives through this very count).
 * @example countOpenTasksGlobal(store) => 2
 * @param {Object} [store] - The TaskStore (read-only use).
 * @returns {number} The global waiting-task count.
 ***/
export function countOpenTasksGlobal(store) {
	let depth = 0;
	try {
		const projectMaps = store.tasksByProject?.entries?.() || [];
		// Read once per scan: the raw field avoids recursing into the
		// snapshot derivation that calls this count.
		let engineState = null;
		try {
			engineState = store.engineState ?? null;
		} catch {
			engineState = null;
		}
		for (const [projectId, map] of projectMaps) {
			// Isolate each project so one unreadable map cannot erase the counts
			// already gathered from the others (fail safe, not fail closed).
			try {
				let project = null;
				try {
					project =
						store.projectStore?.getProject?.(projectId) || null;
				} catch {
					project = null;
				}
				for (const task of map?.values?.() || []) {
					if (
						isWaitingForPickup(task, {
							store,
							project,
							projectId,
							engineState,
						})
					) {
						depth += 1;
					}
				}
			} catch {
				// Skip the unreadable map; the depth reflects the rest.
			}
		}
	} catch {
		// Total failure still returns 0: a fully unreadable store reads as an
		// empty queue rather than breaking the whole state read. The UI only
		// falls back to its loaded list when the snapshot is absent entirely.
	}
	return depth;
}
