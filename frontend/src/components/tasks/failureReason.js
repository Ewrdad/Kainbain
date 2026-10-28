/***
 * MARK: failureReason helpers
 * @description Small helpers that read a failed timeline entry's structured
 * reason and shorten it to a one-line preview. A failed entry carries its
 * full reason in `entry.reason` (set when the stage failed); older entries
 * without that field render exactly as before.
 * @example getFailureReason({ reason: "boom\ntrace" }) => "boom\ntrace"
 * @example firstLine("boom\ntrace") => "boom"
 ***/

export const FAILURE_REASON_PREVIEW_MAX = 120;
export const FAILURE_MESSAGE_PREVIEW_MAX = 300;

/***
 * MARK: getFailureReason
 * @description Returns the full failure reason for a timeline entry, or null
 * when the entry has no structured reason (for example entries written
 * before failure reasons were recorded).
 * @example getFailureReason({ reason: "boom" }) => "boom"
 * @example getFailureReason({ stage: "Plan" }) => null
 * @param {Object} [entry] - Timeline or audit entry, may carry `reason`.
 * @returns {string|null} Trimmed reason, or null when there is nothing to show.
 ***/
export function getFailureReason(entry) {
  if (!entry || typeof entry.reason !== 'string') return null;
  const reason = entry.reason.trim();
  return reason ? reason : null;
}

/***
 * MARK: hasFailureDetails
 * @description Tells whether a timeline entry has a failure reason worth
 * opening in the full-reason modal. Empty or whitespace-only reasons show
 * no button.
 * @example hasFailureDetails({ reason: "boom" }) => true
 * @example hasFailureDetails({ stage: "Plan" }) => false
 * @param {Object} [entry] - Timeline or audit entry, may carry `reason`.
 * @returns {boolean} True when a non-blank reason exists.
 ***/
export function hasFailureDetails(entry) {
  return getFailureReason(entry) !== null;
}

/***
 * MARK: getFailureKind
 * @description Reads the recorded failure kind for a task. The engine marks
 * deliberate rejections (a human reviewer's reject, or an agent review
 * stage's fail verdict) as "rejected" on `task.lastError.failureKind` so
 * the task view can label them REJECTED instead of FAILED; ordinary
 * runtime failures carry no kind.
 * @example getFailureKind({ lastError: { failureKind: "rejected" } }) => "rejected"
 * @example getFailureKind({ status: "failed" }) => null
 * @param {Object} [task] - Task object, may carry `lastError.failureKind`.
 * @returns {string|null} Trimmed kind, or null when none was recorded.
 ***/
export function getFailureKind(task) {
  const kind = task?.lastError?.failureKind;
  return typeof kind === 'string' && kind.trim() ? kind.trim() : null;
}

/***
 * MARK: isRejectedTask
 * @description Tells whether a task's current failure is a deliberate
 * rejection rather than a generic runtime failure. Rejected tasks stay
 * agent-ready (the next pickup snapshots the reason into its prompt), so
 * the banner keeps showing the reason even while an auto-retry is queued.
 * @example isRejectedTask({ lastError: { failureKind: "rejected" } }) => true
 * @example isRejectedTask({ status: "failed" }) => false
 * @param {Object} [task] - Task object, may carry `lastError.failureKind`.
 * @returns {boolean} True when the recorded kind is "rejected".
 ***/
export function isRejectedTask(task) {
  return getFailureKind(task) === 'rejected';
}

/***
 * MARK: firstLine
 * @description Shortens a failure reason to its first line so history rows
 * keep their current density. Longer lines are cut with an ellipsis.
 * @example firstLine("boom\ntrace") => "boom"
 * @example firstLine("  ") => ""
 * @param {string} [text] - Full failure reason, may be multi-line.
 * @param {number} [max] - Maximum characters before truncation.
 * @returns {string} First line, truncated with an ellipsis when too long.
 ***/
export function firstLine(text, max = FAILURE_REASON_PREVIEW_MAX) {
  if (typeof text !== 'string') return '';
  const line = text.split('\n', 1)[0].trim();
  if (line.length <= max) return line;
  return `${line.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/***
 * MARK: truncateFailureMessage
 * @description Shortens a task-view failure message to a capped preview so
 * the Stage Execution Failed banner never becomes a wall of text. Unlike
 * firstLine, newlines are kept up to the cap because the banner renders
 * multi-line errors with whitespace-pre-wrap. The caller shows the full
 * message when the reader asks for more.
 * @example truncateFailureMessage("boom") => { preview: "boom", truncated: false }
 * @example truncateFailureMessage("x".repeat(400)).truncated => true
 * @param {string} [text] - Full failure message, may be multi-line.
 * @param {number} [max] - Maximum characters before truncation.
 * @returns {{preview: string, truncated: boolean}} Preview with an ellipsis
 * when capped, plus whether the message exceeded the cap.
 ***/
export function truncateFailureMessage(text, max = FAILURE_MESSAGE_PREVIEW_MAX) {
  if (typeof text !== 'string') return { preview: '', truncated: false };
  if (text.length <= max) return { preview: text, truncated: false };
  return {
    preview: `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`,
    truncated: true,
  };
}
