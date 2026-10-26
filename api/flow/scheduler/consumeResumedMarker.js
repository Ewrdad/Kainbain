import {
	clearResumedMarker,
} from '../stagePolicy.js';

/***
 * MARK: consumeResumedMarker
 * @description Consumes the startup-recovery priority marker after a task
 *   wins Rule 0 and is dispatched: the task was picked up straight where it
 *   left off, so on later ticks it competes as normal work instead of
 *   outranking fresh tasks forever. Clears via `clearResumedMarker`
 *   (stagePolicy) and persists the change when the store can (best-effort:
 *   the in-memory clear already stops re-prioritisation, so a failed save
 *   only means the next successful save persists it).
 * @param {Object} store
 * @param {Object} task - The dispatched task (mutated in place).
 * @param {string} [projectCwd]
 * @returns {boolean} Whether a marker was consumed.
  * @example consumeResumedMarker(store, task) => true (marker cleared)
 ***/
export function consumeResumedMarker(store, task, projectCwd) {
	if (!clearResumedMarker(task)) return false;
	try {
		if (typeof store?._saveTaskMarkdown === "function") {
			const cwd =
				typeof store?._resolveProjectCwd === "function"
					? store._resolveProjectCwd(task.projectId, projectCwd)
					: projectCwd;
			store._saveTaskMarkdown(cwd, task);
		}
	} catch {
		// Best-effort: the in-memory flag already stops re-prioritisation;
		// the next successful save persists it.
	}
	return true;
}
