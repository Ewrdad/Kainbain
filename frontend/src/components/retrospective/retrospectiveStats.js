/***
 * MARK: retrospectiveStats
 * @description Pure derived data for the retrospective histories panel:
 *   wall-clock vs active totals, failure verdicts, client-side sort/filter,
 *   and the stats strip. Per-stage second counts render through the shared
 *   `formatDuration` (stageAnalytics); wall-clock spans use the compact
 *   hours-aware formatter here.
 ***/
import { isRejectedTask } from '../tasks/failureReason';

/***
 * MARK: TERMINAL_TASK_STATUSES
 * @description Task statuses whose wall-clock ends at `updatedAt` (everything
 *   else is still open, so wall-clock runs to now).
 ***/
const TERMINAL_TASK_STATUSES = new Set(['completed', 'done', 'failed', 'aborted']);

/***
 * MARK: sumActiveSeconds
 * @description Sums a task's per-stage duration samples into active seconds.
 * @example sumActiveSeconds({ stageDurationSamples: [{ seconds: [60, 30] }] }) => 90
 * @param {Object} [task]
 * @returns {number} Active seconds (>= 0).
 ***/
export function sumActiveSeconds(task) {
  const samples = Array.isArray(task?.stageDurationSamples) ? task.stageDurationSamples : [];
  return samples.reduce((total, sample) => {
    const seconds = Array.isArray(sample?.seconds) ? sample.seconds : [];
    return total + seconds.reduce((sum, s) => sum + (Number(s) > 0 ? Number(s) : 0), 0);
  }, 0);
}

/***
 * MARK: wallClockSeconds
 * @description Wall-clock span from `createdAt` to `updatedAt` (terminal
 *   tasks) or now (open tasks). Never negative, 0 when unparseable.
 * @example wallClockSeconds({ status: 'completed', createdAt, updatedAt }) => 3600
 * @param {Object} [task]
 * @param {number} [nowMs=Date.now()]
 * @returns {number} Wall-clock seconds (>= 0).
 ***/
export function wallClockSeconds(task, nowMs = Date.now()) {
  const start = new Date(task?.createdAt).getTime();
  if (Number.isNaN(start)) return 0;
  const terminal = TERMINAL_TASK_STATUSES.has(task?.status);
  const rawEnd = terminal ? new Date(task?.updatedAt).getTime() : nowMs;
  const end = Number.isNaN(rawEnd) ? nowMs : rawEnd;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/***
 * MARK: formatCompactDuration
 * @description Hours-aware compact duration ("45s", "3m", "8h 12m", "2d 3h").
 * @example formatCompactDuration(295200) => '3d 10h'
 * @param {number} seconds
 * @returns {string} Compact label ('--' when invalid).
 ***/
export function formatCompactDuration(seconds) {
  if (seconds === undefined || seconds === null || Number.isNaN(seconds) || seconds < 0) {
    return '--';
  }
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const remMins = mins % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

/***
 * MARK: formatTaskTotals
 * @description Wall-clock vs active one-liner ("8h (3h active)") for cards.
 * @example formatTaskTotals(task) => '8h (3h active)'
 * @param {Object} [task]
 * @param {number} [nowMs=Date.now()]
 * @returns {string} Totals label.
 ***/
export function formatTaskTotals(task, nowMs = Date.now()) {
  return `${formatCompactDuration(wallClockSeconds(task, nowMs))} (${formatCompactDuration(sumActiveSeconds(task))} active)`;
}

/***
 * MARK: isRetrospectiveTaskFailed
 * @description Failure verdict mirroring `TaskCard.jsx`: explicit `failed`
 *   status, or failure evidence on a non-retrying task. A deliberate
 *   rejection still reads as failed while its auto-retry is queued.
 * @example isRetrospectiveTaskFailed({ status: 'failed' }) => true
 * @param {Object} [task]
 * @returns {boolean} True when the task reads as failed.
 ***/
export function isRetrospectiveTaskFailed(task) {
  return (
    task?.status === 'failed' ||
    (Boolean(task?.failureReason) && (!task?.autoRetrying || isRejectedTask(task)))
  );
}

/***
 * MARK: stageSampleFailed
 * @description Whether a duration sample's stage carries a FAILED report
 *   marker (report metadata keeps `{stageName, stageId, status}`).
 * @example stageSampleFailed(task, { stageId: 'implement' }) => true
 * @param {Object} [task]
 * @param {Object} [sample] - One `stageDurationSamples` entry.
 * @returns {boolean} True when a FAILED report matches the stage.
 ***/
export function stageSampleFailed(task, sample) {
  const reports = Array.isArray(task?.reports) ? task.reports : [];
  return reports.some(
    (report) =>
      report?.status === 'FAILED' &&
      (report.stageId === sample?.stageId || report.stageName === sample?.stageName),
  );
}

/***
 * MARK: selectVisibleTasks
 * @description Client-side sort/filter over the summaries response: recency
 *   (newest/oldest by updatedAt), status bucket, and workflow id.
 * @example selectVisibleTasks(tasks, { sort: 'recent', statusFilter: 'failed' }) => [...]
 * @param {Array<Object>} [tasks=[]]
 * @param {Object} [opts]
 * @param {string} [opts.sort='recent'] - 'recent' | 'oldest'.
 * @param {string} [opts.statusFilter='all'] - 'all' | 'completed' | 'failed' | 'active'.
 * @param {string} [opts.workflowFilter='all'] - Workflow id or 'all'.
 * @returns {Array<Object>} Visible tasks (new array, input untouched).
 ***/
export function selectVisibleTasks(
  tasks = [],
  { sort = 'recent', statusFilter = 'all', workflowFilter = 'all' } = {},
) {
  const list = Array.isArray(tasks) ? [...tasks] : [];
  const byRecency = (a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    const aSafe = Number.isNaN(aTime) ? 0 : aTime;
    const bSafe = Number.isNaN(bTime) ? 0 : bTime;
    return sort === 'oldest' ? aSafe - bSafe : bSafe - aSafe;
  };
  return list
    .filter((task) => {
      if (workflowFilter !== 'all' && task?.workflowId !== workflowFilter) return false;
      if (statusFilter === 'completed')
        return task?.status === 'completed' || task?.status === 'done';
      if (statusFilter === 'failed') return isRetrospectiveTaskFailed(task);
      if (statusFilter === 'active') {
        return (
          task?.status !== 'completed' &&
          task?.status !== 'done' &&
          !isRetrospectiveTaskFailed(task)
        );
      }
      return true;
    })
    .sort(byRecency);
}

/***
 * MARK: computeRetrospectiveStats
 * @description Stats-strip counts derived from the fetched summaries.
 * @example computeRetrospectiveStats(tasks) => { total: 4, completed: 1, failed: 1, active: 2 }
 * @param {Array<Object>} [tasks=[]]
 * @returns {{total: number, completed: number, failed: number, active: number}}
 ***/
export function computeRetrospectiveStats(tasks = []) {
  const list = Array.isArray(tasks) ? tasks : [];
  let completed = 0;
  let failed = 0;
  for (const task of list) {
    if (task?.status === 'completed' || task?.status === 'done') completed += 1;
    else if (isRetrospectiveTaskFailed(task)) failed += 1;
  }
  return { total: list.length, completed, failed, active: list.length - completed - failed };
}

/***
 * MARK: listWorkflows
 * @description Distinct workflow ids present in the summaries, for the filter.
 * @example listWorkflows(tasks) => ['wf-default', 'wf-experiment']
 * @param {Array<Object>} [tasks=[]]
 * @returns {Array<string>} Sorted workflow ids.
 ***/
export function listWorkflows(tasks = []) {
  const ids = new Set();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (task?.workflowId) ids.add(task.workflowId);
  }
  return [...ids].sort();
}
