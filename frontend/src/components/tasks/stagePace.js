import { isRetryingTask } from './taskRetryState';
/***
 * MARK: stagePace
 * @description Pure helpers behind the task-card age readout and the
 * green/amber/red pace signal. A task that is running or waiting in a human
 * review stage is compared against its stage's average duration so reviewers
 * can prioritise the oldest work and spot long-running tasks worth checking.
 * No JSX, no timers — the UI wiring stays thin and all maths is unit-tested.
 * @example paceStatus(150, 100) => 'over'
 ***/

/***
 * MARK: PACE_BANDS
 * @description Tunable pace-band boundaries. The amber "close to average"
 * band starts at 75% of the stage average (an open review question — tuning
 * it is a one-line change here).
 * @example PACE_BANDS.nearRatio => 0.75
 ***/
export const PACE_BANDS = {
  nearRatio: 0.75,
};

/***
 * MARK: stageEntryTimestamp
 * @description Finds when a task entered its current stage, mirroring the
 * fallback chain in `formatTaskTimestamp` (enteredStageAt, updatedAt,
 * createdAt, timestamp). Returns null when nothing parses to a real date.
 * @example stageEntryTimestamp({ enteredStageAt: '2026-09-30T12:00:00Z' }) => 1759233600000
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {number|null} Entry time in epoch milliseconds, or null.
 ***/
function stageEntryTimestamp(task) {
  const raw = task?.enteredStageAt || task?.updatedAt || task?.createdAt || task?.timestamp;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/***
 * MARK: elapsedStageSeconds
 * @description Seconds the task has spent in its current stage. Clock skew
 * (a future entry time) and missing or invalid timestamps read as 0 —
 * never negative, never NaN.
 * @example elapsedStageSeconds({ enteredStageAt: '...' }, Date.now()) => 90
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @param {number} [nowMs=Date.now()] - The moment to measure against.
 * @returns {number} Elapsed whole seconds, 0 or more.
 ***/
export function elapsedStageSeconds(task, nowMs = Date.now()) {
  const now = Number(nowMs);
  if (!Number.isFinite(now)) return 0;
  const entered = stageEntryTimestamp(task);
  if (entered === null) return 0;
  return Math.max(0, Math.floor((now - entered) / 1000));
}

/***
 * MARK: paceStatus
 * @description Compares elapsed time against the stage average and returns
 * the pace band: 'under' (below 75% — green), 'near' (75–100% — amber),
 * 'over' (past the average — red), or 'unknown' when there is no usable
 * average (missing, zero, or negative), which must render neutrally.
 * @example paceStatus(74, 100) => 'under'
 * @example paceStatus(80, 100) => 'near'
 * @example paceStatus(150, 100) => 'over'
 * @example paceStatus(10, 0) => 'unknown'
 * @param {number} elapsedSec - Seconds in the current stage.
 * @param {number} avgSec - Stage average duration in seconds.
 * @returns {'under'|'near'|'over'|'unknown'} The pace band.
 ***/
export function paceStatus(elapsedSec, avgSec) {
  const elapsed = Number(elapsedSec);
  const avg = Number(avgSec);
  if (!Number.isFinite(elapsed) || !Number.isFinite(avg) || avg <= 0) return 'unknown';
  if (elapsed > avg) return 'over';
  if (elapsed >= avg * PACE_BANDS.nearRatio) return 'near';
  return 'under';
}

/***
 * MARK: isPaceExcluded
 * @description Whether a task must never carry a pace colour: failed,
 * interrupted, blocked, paused, or completed tasks keep their existing
 * stronger signals, and pace must never override an error state.
 * @example isPaceExcluded({ status: 'failed' }) => true
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True when pace colour is suppressed.
 ***/
function isPaceExcluded(task) {
  if (!task) return false;
  // Auto-retry is active engine work, not a settled failure: it wins over the
  // failed status, matching the card's RETRYING label precedence.
  const isRetrying = isRetryingTask(task);
  if (task.status === 'failed' && !isRetrying) return true;
  if (Boolean(task.failureReason) && !isRetrying) return true;
  if (task.wasInterrupted === true || task.status === 'interrupted') return true;
  if (task.isBlocked === true) return true;
  if (task.status === 'paused') return true;
  if (task.status === 'completed' || task.status === 'done') return true;
  return false;
}

/***
 * MARK: shouldShowPace
 * @description The running/review-only gate for pace colour. True when the
 * task is running or waiting in a human review stage and carries no
 * excluding state. Auto-retrying tasks count as running work (they are
 * active engine work, not settled failures).
 * @example shouldShowPace(task, { isRunning: true, isReview: false }) => true
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @param {Object} [flags] - Liveness flags derived by the caller.
 * @param {boolean} [flags.isRunning=false] - The task currently owns the running engine.
 * @param {boolean} [flags.isReview=false] - The task waits in a human review stage.
 * @returns {boolean} True when the pace colour may render.
 ***/
export function shouldShowPace(task, { isRunning = false, isReview = false } = {}) {
  if (isPaceExcluded(task)) return false;
  if (isRetryingTask(task)) return true;
  return Boolean(isRunning || isReview);
}

/***
 * MARK: compareStageAge
 * @description Oldest-in-stage-first comparator for the opt-in board sort.
 * Stable: equal ages return 0 so insertion (manual drag) order is kept for
 * ties. Tasks without a readable entry time sort as newest.
 * @example [young, old].sort((a, b) => compareStageAge(a, b, Date.now())) => [old, young]
 * @param {Object} [a] - First task.
 * @param {Object} [b] - Second task.
 * @param {number} [nowMs=Date.now()] - The moment to measure against.
 * @returns {number} Negative when a is older, positive when b is older, 0 on ties.
 ***/
export function compareStageAge(a, b, nowMs = Date.now()) {
  return elapsedStageSeconds(b, nowMs) - elapsedStageSeconds(a, nowMs);
}

/***
 * MARK: formatStageAge
 * @description Short age string for the card meta row in both densities
 * (e.g. `45s`, `45m`, `3h`, `2d`). Floors partial units; unknown or future
 * entry times read as `0s`.
 * @example formatStageAge({ enteredStageAt: '...' }, Date.now()) => '45m'
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @param {number} [nowMs=Date.now()] - The moment to measure against.
 * @returns {string} Compact age string.
 ***/
export function formatStageAge(task, nowMs = Date.now()) {
  const seconds = elapsedStageSeconds(task, nowMs);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/***
 * MARK: formatAvgDuration
 * @description Human-readable duration for pace tooltips and the inspector's
 * per-stage average hints (e.g. `45s`, `1m 40s`). Kept local so this module
 * never imports across layers.
 * @example formatAvgDuration(100) => '1m 40s'
 * @param {number} seconds - Duration in seconds.
 * @returns {string} Readable duration, or '--' when unusable.
 ***/
export function formatAvgDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value < 60) return `${value.toFixed(value < 10 ? 1 : 0)}s`;
  const rounded = Math.round(value);
  return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
}

/***
 * MARK: describePace
 * @description Tooltip copy for the pace signal: names the band and shows
 * elapsed time versus the stage average so colour is never the only signal.
 * The unknown band makes no colour claim at all.
 * @example describePace(150, 100) => { title: 'Over stage average', description: '...' }
 * @param {number} elapsedSec - Seconds in the current stage.
 * @param {number} avgSec - Stage average duration in seconds.
 * @returns {{ title: string, description: string }} Tooltip title and body.
 ***/
export function describePace(elapsedSec, avgSec) {
  const band = paceStatus(elapsedSec, avgSec);
  const elapsed = formatAvgDuration(elapsedSec);
  const average = formatAvgDuration(avgSec);
  if (band === 'over') {
    return {
      title: 'Over stage average',
      description: `${elapsed} in stage vs ${average} average — worth checking on.`,
    };
  }
  if (band === 'near') {
    return {
      title: 'Near stage average',
      description: `${elapsed} in stage vs ${average} average — approaching the average.`,
    };
  }
  if (band === 'under') {
    return {
      title: 'Under stage average',
      description: `${elapsed} in stage vs ${average} average — on pace.`,
    };
  }
  return {
    title: 'No stage average yet',
    description: `${elapsed} in stage — not enough completed visits to compare against.`,
  };
}
