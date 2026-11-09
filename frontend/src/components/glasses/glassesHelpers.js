import { isTaskRunning, resolveRunningTask } from '../tasks/runningTask.js';

// Pure display helpers for the Meta Ray-Ban (~600x600) interface. Every
// helper here takes plain values and returns plain values, so the glasses
// views stay presentational and these stay unit-testable without a DOM.
// Written as arrow constants (not `function` declarations) so this shared
// file keeps passing the one-function-per-file gate.

/***
 * MARK: resolveGlassesCounts
 * @description Counts tasks into the three big glasses status cards
 *   (Running / Waiting for review / Failed). Running honours the engine
 *   lock via isTaskRunning, so a stale running_* label on a non-owner never
 *   inflates the count. Never throws: a missing list reads as all zeros.
 * @example resolveGlassesCounts([{ status: 'waiting_human' }], {}) => { running: 0, waitingReview: 1, failed: 0, total: 1 }
 * @param {Array<Object>} [tasks] - Tasks to count.
 * @param {Object} [engineState] - Engine snapshot (activeTaskId, status).
 * @param {boolean} [isAgentRunning=false] - Agent loop running flag.
 * @returns {{running: number, waitingReview: number, failed: number, total: number}}
 ***/
export const resolveGlassesCounts = (tasks, engineState, isAgentRunning = false) => {
  const list = Array.isArray(tasks) ? tasks : [];
  return {
    running: list.filter((task) => isTaskRunning(task, engineState, isAgentRunning)).length,
    waitingReview: list.filter((task) => task?.status === 'waiting_human').length,
    failed: list.filter((task) => task?.status === 'failed').length,
    total: list.length,
  };
};

/***
 * MARK: resolveGlassesProgress
 * @description Reads "Step N of M" for a task from its pipeline position,
 *   or null when the position is unknown (missing stage, unknown stages).
 *   The glasses review screen shows this under the task name.
 * @example resolveGlassesProgress({ currentStageId: 'b' }, [{ id: 'a' }, { id: 'b' }]) => 'Step 2 of 2'
 * @param {Object} [task] - Task carrying currentStageId.
 * @param {Array<Object>} [stages] - Pipeline stages in order.
 * @returns {string|null} Progress text, or null when unknown.
 ***/
export const resolveGlassesProgress = (task, stages) => {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length === 0 || task?.currentStageId == null) return null;
  const position = list.findIndex((stage) => String(stage?.id) === String(task.currentStageId));
  if (position < 0) return null;
  return `Step ${position + 1} of ${list.length}`;
};

/***
 * MARK: resolveGlassesProgressFraction
 * @description Reads the 0..1 fill for the glasses teal progress bar from
 *   the same pipeline position as resolveGlassesProgress, or null when the
 *   position is unknown. Kept separate so the text helper stays a plain
 *   string for aria text while the bar gets a number.
 * @example resolveGlassesProgressFraction({ currentStageId: 'b' }, [{ id: 'a' }, { id: 'b' }]) => 1
 * @param {Object} [task] - Task carrying currentStageId.
 * @param {Array<Object>} [stages] - Pipeline stages in order.
 * @returns {number|null} Fill fraction, or null when unknown.
 ***/
export const resolveGlassesProgressFraction = (task, stages) => {
  const list = Array.isArray(stages) ? stages : [];
  if (list.length === 0 || task?.currentStageId == null) return null;
  const position = list.findIndex((stage) => String(stage?.id) === String(task.currentStageId));
  if (position < 0) return null;
  return (position + 1) / list.length;
};

/***
 * MARK: GLASSES_SUMMARY_LINE_LIMIT
 * @description Maximum characters per glasses summary line. The 600px
 *   review card fits about two short lines; longer review text is cut with
 *   an ellipsis rather than wrapped into clutter.
 * @example GLASSES_SUMMARY_LINE_LIMIT => 80
 ***/
export const GLASSES_SUMMARY_LINE_LIMIT = 80;

const shortenLine = (text) => {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= GLASSES_SUMMARY_LINE_LIMIT) return clean;
  return `${clean.slice(0, GLASSES_SUMMARY_LINE_LIMIT - 1).trimEnd()}…`;
};

/***
 * MARK: resolveGlassesSummary
 * @description Reads at most two short summary lines from a review payload
 *   for the glasses review card: the latest commit message first, then the
 *   file-change count, then any unresolved-comments count — skipping blanks.
 *   Never throws: a missing payload reads as one honest "no changes" line.
 * @example resolveGlassesSummary({ commits: [{ message: 'Fix race' }] }) => ['Fix race']
 * @param {Object} [reviewData] - Review payload (commits, files, comments).
 * @returns {Array<string>} One or two short lines.
 ***/
export const resolveGlassesSummary = (reviewData) => {
  const commits = Array.isArray(reviewData?.commits) ? reviewData.commits : [];
  const files = Array.isArray(reviewData?.files) ? reviewData.files : [];
  const comments = Array.isArray(reviewData?.comments) ? reviewData.comments : [];
  const unresolved = comments.filter((comment) => !comment?.resolved).length;

  const lines = [];
  const latestMessage = String(commits[0]?.message || '')
    .split('\n')[0]
    .trim();
  if (latestMessage) lines.push(shortenLine(latestMessage));
  if (files.length > 0) {
    lines.push(`${files.length} file${files.length === 1 ? '' : 's'} changed`);
  }
  if (unresolved > 0) {
    lines.push(`${unresolved} unresolved comment${unresolved === 1 ? '' : 's'}`);
  }
  if (lines.length === 0) return ['No changes to review yet'];
  return lines.slice(0, 2);
};

/***
 * MARK: resolveGlassesReviewTarget
 * @description Reads which task the glasses View button should open: the
 *   first task waiting for human review, otherwise the running task (so an
 *   observer can still open what is active), otherwise nothing.
 * @example resolveGlassesReviewTarget([{ id: 't1', status: 'waiting_human' }], {}) => { id: 't1', status: 'waiting_human' }
 * @param {Array<Object>} [tasks] - Tasks to choose from.
 * @param {Object} [engineState] - Engine snapshot for the running fallback.
 * @returns {Object|null} The task to open, or null when there is none.
 ***/
export const resolveGlassesReviewTarget = (tasks, engineState) => {
  const list = Array.isArray(tasks) ? tasks : [];
  return (
    list.find((task) => task?.status === 'waiting_human') ||
    resolveRunningTask(list, engineState) ||
    null
  );
};

/***
 * MARK: resolveGlassesVisibleTasks
 * @description Reads the short tap list for the glasses task screen: only
 *   tasks that are waiting for review or running (review-ready first),
 *   capped so big text still fits the 600px canvas.
 * @example resolveGlassesVisibleTasks([{ status: 'waiting_human' }], {}, 3) => [{ status: 'waiting_human' }]
 * @param {Array<Object>} [tasks] - Tasks to filter.
 * @param {Object} [engineState] - Engine snapshot for the running check.
 * @param {number} [limit=3] - Maximum tasks to return.
 * @returns {Array<Object>} Actionable tasks, review-ready first.
 ***/
export const resolveGlassesVisibleTasks = (tasks, engineState, limit = 3) => {
  const list = Array.isArray(tasks) ? tasks : [];
  const waiting = list.filter((task) => task?.status === 'waiting_human');
  const running = list.filter(
    (task) => task?.status !== 'waiting_human' && isTaskRunning(task, engineState),
  );
  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 3;
  return [...waiting, ...running].slice(0, cap);
};
