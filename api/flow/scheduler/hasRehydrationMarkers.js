/***
 * MARK: hasRehydrationMarkers
 * @description Whether a task carries a durable rehydration marker
 *   proving which stage attempt was in flight when the interruption hit:
 *   `preMergeMainSha` / `mergeAttemptId` (pre-merge write), or a landed
 *   `reviewBaseline.mergedAt` marker. Marker presence is what makes a merge
 *   interruption safe to resume: the stage re-runs from a known-safe point
 *   (idempotent merge re-entry) instead of blindly. A ci stage whose command
 *   happens to run the deploy script needs no marker: it is an ordinary
 *   automated stage and re-dispatches like any other ci stage. Total on
 *   untrusted input.
 * @param {Object} task
 * @returns {boolean}
 * @example hasRehydrationMarkers({ mergeAttemptId: "merge-t-1-123" }) => true
 ***/
export function hasRehydrationMarkers(task) {
	try {
		if (!task || typeof task !== "object") return false;
		if (typeof task.preMergeMainSha === "string" && task.preMergeMainSha.trim()) {
			return true;
		}
		if (typeof task.mergeAttemptId === "string" && task.mergeAttemptId.trim()) {
			return true;
		}
		const baseline = task.reviewBaseline;
		if (
			baseline &&
			typeof baseline === "object" &&
			!Array.isArray(baseline) &&
			typeof baseline.mergedAt === "string" &&
			baseline.mergedAt.trim()
		) {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}
