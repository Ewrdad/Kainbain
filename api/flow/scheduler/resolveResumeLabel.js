import { cleanSingleLineText } from "../cleanSingleLineText.js";

const SERVER_RESTART_LABEL = "Auto-resumed after server restart — prioritised in queue";
const RUNNER_INTERRUPT_LABEL = "Auto-resumed after runner interrupt — prioritised in queue";

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
 *
 *   Marker contract: the marker names the CURRENT interruption only. Every
 *   path out of `interrupted` that can observe it (auto resume, manual
 *   resume, abort, retry) deletes it right after reading, stage completion
 *   clears it, and it is never persisted to task.md — so a crash-path resume
 *   can never inherit a stale runner id, and a post-restart resume always
 *   reads as the restart route it is.
 *
 *   Both detail fields are cleaned to one bounded line, so even a hand-built
 *   marker cannot break the single-line history format or grow the label
 *   without bound. Fails safe: anything but a well-formed marker object
 *   reads as the restart route, and a marker without a usable runner id
 *   reads as the bare runner string (never "undefined").
 * @example resolveResumeLabel({ status: 'interrupted' }) => 'Auto-resumed after server restart — prioritised in queue'
 * @example resolveResumeLabel({ status: 'interrupted', interruptedBy: { runnerId: 'r-1', reason: 'socket hangup' } }) => 'Auto-resumed after runner interrupt — prioritised in queue (runner r-1, reason: socket hangup)'
 * @param {Object} [task] - The interrupted task (or null/undefined for safety).
 * @returns {string} The history action string for the resume.
 ***/
export function resolveResumeLabel(task) {
	const marker =
		task && typeof task === "object" && task.interruptedBy && typeof task.interruptedBy === "object"
			? task.interruptedBy
			: null;
	if (!marker) return SERVER_RESTART_LABEL;
	const runnerId = cleanSingleLineText({ text: marker.runnerId });
	const reason = cleanSingleLineText({ text: marker.reason });
	if (!runnerId) return RUNNER_INTERRUPT_LABEL;
	if (!reason) return `${RUNNER_INTERRUPT_LABEL} (runner ${runnerId})`;
	return `${RUNNER_INTERRUPT_LABEL} (runner ${runnerId}, reason: ${reason})`;
}
