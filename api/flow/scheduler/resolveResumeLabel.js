/***
 * MARK: resolveResumeLabel
 * @description Picks the history label `autoResumeTask` writes when it flips
 *   an `interrupted` task back to runnable. Genuine reconcile recoveries
 *   (crash orphans, startup recovery, deploy reconcile — no runner marker)
 *   keep the server-restart string; runner-path resumes (the task carries the
 *   `interruptedBy` marker stamped by `interruptExecution`) write the runner
 *   string including the runner id and the interrupt reason, so ~100
 *   runner-path resumes no longer display as server restarts that never
 *   happened. Read-only over the task; already-written histories keep their
 *   old string (no migration).
 * @example resolveResumeLabel({ status: 'interrupted' }) => 'Auto-resumed after server restart — prioritised in queue'
 * @example resolveResumeLabel({ status: 'interrupted', interruptedBy: { runnerId: 'r-1', reason: 'socket hangup' } }) => 'Auto-resumed after runner interrupt — prioritised in queue (runner r-1, reason: socket hangup)'
 * @param {Object} [task] - The interrupted task (or null/undefined for safety).
 * @returns {string} The history action string for the resume.
 ***/
export function resolveResumeLabel(task) {
	const RESTART_LABEL = "Auto-resumed after server restart — prioritised in queue";
	const marker =
		task && typeof task === "object" && task.interruptedBy && typeof task.interruptedBy === "object"
			? task.interruptedBy
			: null;
	if (!marker) return RESTART_LABEL;
	const runnerId =
		typeof marker.runnerId === "string" && marker.runnerId.trim()
			? marker.runnerId.trim()
			: "";
	const reason =
		typeof marker.reason === "string" && marker.reason.trim()
			? marker.reason.trim()
			: "";
	const base = "Auto-resumed after runner interrupt — prioritised in queue";
	if (!runnerId) return base;
	if (!reason) return `${base} (runner ${runnerId})`;
	return `${base} (runner ${runnerId}, reason: ${reason})`;
}
