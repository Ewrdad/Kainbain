import { normalizeStageType } from '../stageTypes.js';
import { isRetryInProgress, isTaskSettledStatus } from './taskRetryState';

/***
 * MARK: isTaskCompleted
 * @description Single source of truth for the task completion status vocabulary.
 * A task counts as completed when its status is 'completed' or the legacy alias 'done'.
 * Use this instead of inline status checks so the whole UI stays in sync if the
 * status vocabulary ever changes (see stageAnalytics and collapsed rail badges).
 * @example isTaskCompleted({ status: 'completed' }) => true
 * @example isTaskCompleted({ status: 'in_stage' }) => false
 * @example isTaskCompleted(null) => false
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True when the task is completed.
 ***/
export function isTaskCompleted(task) {
  return task?.status === 'completed' || task?.status === 'done';
}

/***
 * MARK: isAutoIterationInProgress
 * @description True when a task is in an automatic CROSS-STAGE re-run: the
 *   failback moved it to a different stage and the engine re-queued it there.
 *   Such a task is normal in-progress work in the new stage — it must not be
 *   labelled RETRYING (that is `isRetryInProgress` in ./taskRetryState.js,
 *   same stage only) and must not be labelled FAILED either (the stored
 *   failureReason is deliberately kept for the next attempt's prompt). New
 *   backend records flag this explicitly with `autoIterating`; payloads from
 *   an older backend only carry `autoRetrying`, so a moved task (current
 *   stage differs from the failed stage) is detected through
 *   `isRetryInProgress` being false.
 * @example isAutoIterationInProgress({ autoRetrying: true, autoIterating: true, currentStageId: '1', lastError: { stageId: '2' } }) => true
 * @example isAutoIterationInProgress({ autoRetrying: true, currentStageId: '1', lastError: { stageId: '2' } }) => true
 * @example isAutoIterationInProgress({ autoRetrying: true, currentStageId: '2', lastError: { stageId: '2' } }) => false
 * @example isAutoIterationInProgress({ autoRetrying: false, autoIterating: true }) => true
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {boolean} True when a cross-stage automatic re-run is in progress.
 ***/
export function isAutoIterationInProgress(task) {
  // Settled tasks are never iterating; the settled-status vocabulary lives in
  // exactly one place (isTaskSettledStatus) so this read and the RETRYING
  // read can never disagree about whether the task is still live.
  if (isTaskSettledStatus(task)) return false;
  if (task?.autoIterating === true) return true;
  return task?.autoRetrying === true && !isRetryInProgress(task);
}

/***
 * MARK: selectStagePresentation
 * @description Single source of truth for how the current-stage row presents:
 *   settled tasks (completed/failed/interrupted/blocked) never render a live
 *   ticking row — a parked failure shows a static PARKED label — while only
 *   genuinely executing tasks tick. A settled `failed` merge task is parked
 *   (needs operator retry), not active: rendering it ACTIVE with a growing
 *   "Nm in stage" timer is what made parked merge failures look stuck.
 * @example selectStagePresentation({ status: 'failed' }) => { label: 'PARKED', tone: 'parked', ticking: false }
 * @example selectStagePresentation({ status: 'in_stage' }) => { label: 'ACTIVE', tone: 'active', ticking: true }
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @returns {{ label: string, tone: string, ticking: boolean }} Presentation verdict.
 ***/
export function selectStagePresentation(task) {
  const status = typeof task?.status === 'string' ? task.status.trim().toLowerCase() : '';
  if (status === 'completed' || status === 'done') {
    return { label: 'DONE', tone: 'done', ticking: false };
  }
  if (status === 'failed' || status === 'interrupted' || status === 'blocked') {
    return { label: 'PARKED', tone: 'parked', ticking: false };
  }
  if (status === 'waiting_human' || status === 'waiting-human' || status === 'waiting') {
    return { label: 'WAITING', tone: 'waiting', ticking: false };
  }
  return { label: 'ACTIVE', tone: 'active', ticking: true };
}

/***
 * MARK: formatTaskKey
 * @description Formats a task ID into a standardized #KB-XXXX key in uppercase JetBrains Mono.
 * @example formatTaskKey('73c4560d-1417-4fe1') => '#KB-73C4'
 * @example formatTaskKey('abc-1234-def') => '#KB-ABC1'
 * @example formatTaskKey('t1') => '#KB-T1'
 * @param {string} [taskId]
 * @returns {string} Standardized task key.
 ***/
export function formatTaskKey(taskId) {
  if (!taskId || typeof taskId !== 'string') return '#KB-0000';
  const clean = taskId.replace(/[^a-zA-Z0-9]/g, '');
  const snippet = (clean.length >= 4 ? clean.slice(0, 4) : taskId.slice(0, 4)).toUpperCase();
  return `#KB-${snippet || '0000'}`;
}

/***
 * MARK: formatTaskTitleFirstLine
 * @description Single source of truth for the one-line task title shown on
 * cards, inspector headers, queue rows, and the Now Playing bar. Task goals
 * are markdown: only the first line is shown and a leading `# ` heading
 * marker is stripped. Fails safe: non-string or empty input renders the
 * fallback (default `'Untitled Task'`) instead of a blank or crashed label.
 * @example formatTaskTitleFirstLine({ goal: '# Ship it\nbody' }) => 'Ship it'
 * @example formatTaskTitleFirstLine(null) => 'Untitled Task'
 * @param {Object|string} [taskOrText] - Task object (goal/title) or raw text.
 * @param {string} [fallback='Untitled Task'] - Label when no title line exists.
 * @returns {string} First title line, or the fallback.
 ***/
export function formatTaskTitleFirstLine(taskOrText, fallback = 'Untitled Task') {
  // `||` (not `??`) matches every call site this replaces: an empty goal
  // falls through to the title, exactly like `(goal || title || '')` did.
  const raw =
    typeof taskOrText === 'string'
      ? taskOrText
      : (taskOrText?.goal || taskOrText?.title || '');
  const line =
    typeof raw === 'string' ? raw.split('\n')[0].replace(/^#\s+/, '') : '';
  return line || fallback;
}

/***
 * MARK: getBlockedState
 * @description Single source of truth for whether a task is held up by
 * unfinished prerequisite tasks, and which tasks those are. Prefers the
 * scheduler's isBlocked verdict when the payload carries it so every surface
 * agrees; otherwise derives from blockedBy plus the live task list.
 * @example getBlockedState({ blockedBy: ['a'] }, [{ id: 'a', status: 'in_stage' }]) => { isBlocked: true, blockerIds: ['a'] }
 * @example getBlockedState({ isBlocked: false, blockedBy: ['a'] }, [{ id: 'a', status: 'in_stage' }]) => { isBlocked: false, blockerIds: ['a'] }
 * @param {Object} [task] - The task object (or null/undefined for safety).
 * @param {Array<Object>} [allTasks=[]] - Live task list used to check blocker statuses.
 * @returns {{ isBlocked: boolean, blockerIds: Array<string> }} Blocked verdict plus blocker ids.
 ***/
export function getBlockedState(task, allTasks = []) {
  const liveTasks = Array.isArray(allTasks) ? allTasks : [];
  const blockedBy = Array.isArray(task?.blockedBy) ? task.blockedBy : [];
  const blockerIds =
    Array.isArray(task?.blockers) && task.blockers.length > 0 ? [...task.blockers] : [...blockedBy];
  if (typeof task?.isBlocked === 'boolean') {
    return { isBlocked: task.isBlocked, blockerIds };
  }
  const isBlocked =
    blockedBy.length > 0 &&
    liveTasks.some((t) => blockedBy.includes(t?.id) && t?.status !== 'completed');
  return { isBlocked: Boolean(isBlocked), blockerIds };
}

/***
 * MARK: formatBlockerKeys
 * @description Formats blocker ids as short human-readable #KB-XXXX keys,
 * capped so long blocker lists cannot break a one-line layout.
 * @example formatBlockerKeys(['abc-1234-def']) => '#KB-ABC1'
 * @example formatBlockerKeys(['a-1', 'b-2', 'c-3', 'd-4']) => '#KB-A1, #KB-B2, #KB-C3 +1 more'
 * @param {Array<string>} [blockerIds=[]] - Blocker task ids.
 * @param {Object} [options] - Formatting options.
 * @param {number} [options.max=3] - Maximum keys shown before the +N more suffix.
 * @returns {string} Comma-separated keys, empty string when there are no blockers.
 ***/
export function formatBlockerKeys(blockerIds, { max = 3 } = {}) {
  if (!Array.isArray(blockerIds) || blockerIds.length === 0) return '';
  const limit = Number.isInteger(max) && max > 0 ? max : 3;
  const keys = blockerIds.map((id) => formatTaskKey(id));
  const shown = keys.slice(0, limit);
  const hidden = keys.length - shown.length;
  return hidden > 0 ? `${shown.join(', ')} +${hidden} more` : shown.join(', ');
}

/***
 * MARK: formatTaskTimestamp
 * @description Formats real timestamp with formatted absolute time and/or relative elapsed time in stage.
 * Never outputs hardcoded "Just now".
 * @example formatTaskTimestamp({ enteredStageAt: '2026-08-19T09:00:00Z' }) => '9:00 AM (0m in stage)'
 * @example formatTaskTimestamp({ timeInStage: '2m' }) => '2m in stage'
 * @param {Object} [task] - The task object.
 * @returns {string} Formatted timestamp string.
 ***/
export function formatTaskTimestamp(task) {
  if (!task) return '0m in stage';

  const tsString = task.enteredStageAt || task.updatedAt || task.createdAt || task.timestamp;

  if (!tsString) {
    if (
      typeof task.timeInStage === 'string' &&
      task.timeInStage.trim() &&
      task.timeInStage !== 'Just now'
    ) {
      return task.timeInStage.includes('stage') ? task.timeInStage : `${task.timeInStage} in stage`;
    }
    if (typeof task.timeInStage === 'number' && task.timeInStage > 0) {
      return `${task.timeInStage}m in stage`;
    }
    return '0m in stage';
  }

  const d = new Date(tsString);
  const isValidDate = !Number.isNaN(d.getTime());

  if (!isValidDate) {
    if (
      typeof task.timeInStage === 'string' &&
      task.timeInStage.trim() &&
      task.timeInStage !== 'Just now'
    ) {
      return task.timeInStage.includes('stage') ? task.timeInStage : `${task.timeInStage} in stage`;
    }
    return '0m in stage';
  }

  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const now = Date.now();
  const elapsedMs = Math.max(0, now - d.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);

  let elapsedStr = '0m in stage';
  if (
    typeof task.timeInStage === 'string' &&
    task.timeInStage.trim() &&
    task.timeInStage !== 'Just now'
  ) {
    elapsedStr = task.timeInStage.includes('stage')
      ? task.timeInStage
      : `${task.timeInStage} in stage`;
    return `${timeStr} (${elapsedStr})`;
  }

  if (elapsedDays > 0) {
    elapsedStr = `${elapsedDays}d in stage`;
  } else if (elapsedHours > 0) {
    elapsedStr = `${elapsedHours}h in stage`;
  } else {
    elapsedStr = `${elapsedMinutes}m in stage`;
  }

  return `${timeStr} (${elapsedStr})`;
}

/***
 * MARK: resolveTimelineStageLabel
 * @description Maps a timeline stage label to a human-readable stage name for
 *   display. Stage ids are positional numbers that can change when the
 *   workflow is edited, so legacy timeline entries that recorded a bare
 *   numeric id are mapped (best-effort) onto the current stage with that id.
 *   Labels that are already human-readable names, or numeric labels that match
 *   no current stage, are returned unchanged.
 * @example resolveTimelineStageLabel('1', [{ id: '1', name: 'Idea' }]) => 'Idea'
 * @example resolveTimelineStageLabel('Idea', [{ id: '1', name: 'Idea' }]) => 'Idea'
 * @example resolveTimelineStageLabel('9', [{ id: '1', name: 'Idea' }]) => '9'
 * @param {string} [stageLabel] - Timeline stage label (legacy numeric id or name).
 * @param {Array<Object>} [stages=[]] - The current workflow stages.
 * @returns {string} Display label for the timeline entry.
 ***/
export function resolveTimelineStageLabel(stageLabel, stages = []) {
  const label =
    stageLabel === undefined || stageLabel === null
      ? ''
      : String(stageLabel).trim();
  if (!label || !/^\d+$/.test(label) || !Array.isArray(stages)) return label;
  const match = stages.find((s) => String(s?.id) === label);
  return match?.name || label;
}

/***
 * MARK: RUN_ATTRIBUTION_KEYS
 * @description The timeline run-attribution vocabulary, identical to the
 *   backend `reportMetadata` field names (one concept = one name). Listed
 *   once so the display fail-safe below and any future consumer strip the
 *   same fields.
 ***/
const RUN_ATTRIBUTION_KEYS = ['harnessId', 'modelRef', 'aliasName', 'targetIndex'];

/***
 * MARK: resolveTimelineStageRecord
 * @description Finds the workflow stage record a stored timeline row is
 *   headed with, matching the raw stored label against stage ids and names
 *   (case-insensitive for names, so legacy numeric ids still match). Returns
 *   null when no stage resolves — callers fail open (keep stored fields)
 *   rather than destroy signal for an unknown or renamed stage.
 * @example resolveTimelineStageRecord([{ id: '2', name: 'Review Plan', type: 'human' }], 'Review Plan') => { id: '2', name: 'Review Plan', type: 'human' }
 * @example resolveTimelineStageRecord([{ id: '2', name: 'Review Plan', type: 'human' }], '2') => { id: '2', name: 'Review Plan', type: 'human' }
 * @example resolveTimelineStageRecord([], 'Review Plan') => null
 * @param {Array<Object>} [stages=[]] - The current workflow stages.
 * @param {*} [label] - Raw stored timeline stage label.
 * @returns {Object|null} The matching stage record, or null when unresolved.
 ***/
function resolveTimelineStageRecord(stages, label) {
  if (!Array.isArray(stages) || label === undefined || label === null) return null;
  const raw = String(label).trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  for (const candidate of stages) {
    if (!candidate || typeof candidate !== 'object') continue;
    if (
      candidate.id !== undefined &&
      candidate.id !== null &&
      String(candidate.id).trim() === raw
    ) {
      return candidate;
    }
    if (
      typeof candidate.name === 'string' &&
      candidate.name.trim().toLowerCase() === lowered
    ) {
      return candidate;
    }
  }
  return null;
}

/***
 * MARK: selectDisplayTimeline
 * @description Prepares stored timeline entries for display in the task
 *   history UI, newest entry first. Stored entries are chronological
 *   (oldest first) and must stay that way for persistence, durations, and
 *   analytics — so this maps legacy numeric stage labels to names, drops
 *   exact duplicates, then returns a reversed copy. Never mutates its input
 *   or the stored timeline: stripping happens on the display copies only.
 *
 *   Display fail-safe for run attribution: a row headed with a stage that
 *   positively resolves to a non-agent type (human / ci / merge) has its
 *   run-attribution fields removed, whatever the stored row carries. Stored
 *   rows written before the dispatch-time stamping fix can carry a previous
 *   agent stage's badge on a human / CI arrival row — rendering those fields
 *   would misattribute a model to a stage that never ran one, so display
 *   drops them. Rows whose stage does not resolve (renamed stages, empty
 *   stage list) keep their stored fields: an unknown stage is never assumed
 *   to be human or CI.
 * @example selectDisplayTimeline([{ stage: 'Idea' }, { stage: 'Plan' }]) => [{ stage: 'Plan' }, { stage: 'Idea' }]
 * @example selectDisplayTimeline([], []) => []
 * @param {Array<Object>} [rawTimeline=[]] - Stored timeline entries, oldest first.
 * @param {Array<Object>} [stages=[]] - The current workflow stages.
 * @returns {Array<Object>} Display entries, most recent first.
 ***/
export function selectDisplayTimeline(rawTimeline = [], stages = []) {
  const raw = Array.isArray(rawTimeline) ? rawTimeline : [];
  const seen = new Set();
  // Stage ids are positional and can change when the workflow is edited, so
  // legacy numeric labels are mapped (best-effort) onto the current stage's
  // human-readable name for display; names pass through unchanged.
  const deduped = raw
    .map((item) => {
      const mapped = {
        ...item,
        stage: resolveTimelineStageLabel(item?.stage, stages),
      };
      // Fail-safe, display copies only: a non-agent stage never ran a model,
      // so its rows never show a badge — even for legacy stored rows that
      // still carry a previous agent run's fields.
      const record =
        resolveTimelineStageRecord(stages, item?.stage) ||
        resolveTimelineStageRecord(stages, mapped.stage);
      if (record && normalizeStageType(record.type) !== 'agent') {
        for (const key of RUN_ATTRIBUTION_KEYS) {
          delete mapped[key];
        }
      }
      return mapped;
    })
    .filter((item) => {
      const key = `${item.stage || ''}::${item.timestamp || ''}::${item.status || ''}::${item.duration || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return [...deduped].reverse();
}

/***
 * MARK: STAGE_RUN_TRY_COUNT_CAP
 * @description Upper bound for the per-stage try count shown in history, so a
 *   pathological task with hundreds of failback cycles still renders a sane
 *   "Tried 99 times" instead of an unbounded number.
 * @example STAGE_RUN_TRY_COUNT_CAP => 99
 ***/
export const STAGE_RUN_TRY_COUNT_CAP = 99;

/***
 * MARK: summarizeStageRuns
 * @description Collapses the display timeline to ONE row per stage so repeated
 *   failback/retry cycles stop spamming the same stage across many history
 *   lines (survey Q3: "one line per step with a try count"). Entries are
 *   grouped by their resolved stage label; each group keeps the position of
 *   its first occurrence in the input array and renders the chronologically
 *   LATEST entry of the group (latest status, reason, duration, and run
 *   attribution), with `tryCount` set to the number of grouped rows (capped at
 *   STAGE_RUN_TRY_COUNT_CAP). Try-count source decision: count the observed
 *   timeline rows per stage (no schema migration needed; `autoIterationCount`
 *   is global, not per stage). Rows with no stage label are never grouped.
 *   Display-only projection: never mutates its input or the stored timeline.
 * @example summarizeStageRuns([{ stage: 'Plan', status: 'Failed', timestamp: 't2', reason: 'x' }, { stage: 'Plan', status: 'Moved', timestamp: 't1' }, { stage: 'Idea', status: 'Advanced', timestamp: 't0' }]) => [{ stage: 'Plan', status: 'Failed', timestamp: 't2', reason: 'x', tryCount: 2 }, { stage: 'Idea', status: 'Advanced', timestamp: 't0' }]
 * @example summarizeStageRuns([{ stage: 'Idea', timestamp: 't1' }, { stage: 'Plan', timestamp: 't2' }]) => [{ stage: 'Idea', timestamp: 't1' }, { stage: 'Plan', timestamp: 't2' }]
 * @param {Array<Object>} [entries=[]] - Display timeline entries, newest first
 *   (as returned by selectDisplayTimeline); groups keep first-occurrence order.
 * @param {Array<Object>} [stages=[]] - The current workflow stages, for legacy numeric label mapping.
 * @returns {Array<Object>} One display row per stage, each carrying `tryCount` when its group had more than one row.
 ***/
export function summarizeStageRuns(entries = [], stages = []) {
  const list = Array.isArray(entries) ? entries : [];
  const groups = new Map();
  const order = [];
  for (const entry of list) {
    const label = resolveTimelineStageLabel(entry?.stage, stages);
    if (!label) {
      // No stage label: never grouped, always kept as its own row.
      order.push({ label: null, entry });
      continue;
    }
    // Stage-name matching is case-insensitive everywhere else (the backend
    // matches names case-insensitively), so grouping is too: 'Design' and
    // 'design' are one stage, rendered under the first-seen spelling.
    const groupKey = label.toLowerCase();
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { label, rows: [] });
      order.push({ label: groupKey, entry: null });
    }
    groups.get(groupKey).rows.push(entry);
  }
  const result = [];
  for (const slot of order) {
    if (slot.label === null) {
      // A copy, like every other display row: rendering must never be able
      // to mutate the stored timeline through this array.
      result.push({ ...slot.entry });
      continue;
    }
    const { label: displayLabel, rows: group } = groups.get(slot.label);
    // Representative: the chronologically latest row of the group (latest
    // status/reason/attribution); ties and unparseable timestamps fall back
    // to the first row encountered.
    let latest = null;
    let latestMs = -Infinity;
    for (const candidate of group) {
      const raw = Date.parse(candidate?.timestamp);
      const ms = Number.isNaN(raw) ? -Infinity : raw;
      // Strictly greater only: on ties (or unparseable timestamps) the first
      // row encountered wins — in newest-first display order that IS the
      // latest row.
      if (latest === null || ms > latestMs) {
        latest = candidate;
        latestMs = ms;
      }
    }
    const row = { ...latest, stage: displayLabel };
    if (group.length > 1) {
      row.tryCount = Math.min(group.length, STAGE_RUN_TRY_COUNT_CAP);
    }
    result.push(row);
  }
  return result;
}

/***
 * MARK: formatTryCount
 * @description Renders a collapsed history row's try count as
 *   `Tried {n} times`, or null when the row ran only once (no badge needed).
 *   Fails safe on unexpected input: fractional counts are floored and counts
 *   above STAGE_RUN_TRY_COUNT_CAP are clamped, so no caller can render an
 *   unbounded or fractional label even with a hand-built row.
 * @example formatTryCount({ tryCount: 3 }) => 'Tried 3 times'
 * @example formatTryCount({ tryCount: 1 }) => null
 * @example formatTryCount({ stage: 'Plan' }) => null
 * @example formatTryCount({ tryCount: 500 }) => 'Tried 99 times'
 * @param {Object} [entry] - A display timeline row (see summarizeStageRuns).
 * @returns {string|null} The label, or null when the stage ran once.
 ***/
export function formatTryCount(entry) {
  const count = Number(entry?.tryCount);
  if (!Number.isFinite(count) || count <= 1) return null;
  return `Tried ${Math.min(Math.floor(count), STAGE_RUN_TRY_COUNT_CAP)} times`;
}

/***
 * MARK: isArrivalTimelineStatus
 * @description True for stored timeline statuses that record an arrival into
 *   the row's stage (destination), as opposed to outcome rows (Failed,
 *   Completed) that record what happened in the row's stage (source). The
 *   backend only writes Moved/Advanced arrivals today, but the match is
 *   case-insensitive and prefix-tolerant ('Advanced (First Stage)',
 *   'Failed back') so a status-string drift reintroduces no duplicate; any
 *   other status fails open (treated as an outcome, never suppressed).
 * @example isArrivalTimelineStatus('Advanced (First Stage)') => true
 * @example isArrivalTimelineStatus('Failed') => false
 * @param {string} [status] - Stored timeline row status.
 * @returns {boolean} True when the row is an arrival into its stage.
 ***/
function isArrivalTimelineStatus(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return (
    normalized === 'moved' ||
    normalized.startsWith('moved ') ||
    normalized === 'advanced' ||
    normalized.startsWith('advanced ') ||
    normalized === 'failed back' ||
    normalized.startsWith('failed back ')
  );
}

/***
 * MARK: isVisitOutcomeTimelineStatus
 * @description True for stored rows that record the OUTCOME of a visit to
 *   the row's stage without the task leaving it: `Failed` (the visit failed),
 *   `Retrying` (a same-stage transient retry fired), and `Resumed` (the task
 *   was re-parked into the stage after a restart). The live-row suppression
 *   guard accepts exactly these as "the current visit is still in this
 *   stage", so a current visit carrying any of them still supersedes its own
 *   arrival row (keeping the live row's run attribution and the try count
 *   exact). Arrival rows, Completed rows, and unknown statuses are NOT
 *   outcomes — they fail open and never trigger suppression.
 * @example isVisitOutcomeTimelineStatus('Failed') => true
 * @example isVisitOutcomeTimelineStatus('Retrying') => true
 * @example isVisitOutcomeTimelineStatus('Resumed') => true
 * @example isVisitOutcomeTimelineStatus('Failed back') => false
 * @example isVisitOutcomeTimelineStatus('Completed') => false
 * @param {string} [status] - Stored timeline row status.
 * @returns {boolean} True for same-stage visit outcome rows.
 ***/
function isVisitOutcomeTimelineStatus(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return normalized === 'failed' || normalized === 'retrying' || normalized === 'resumed';
}

/***
 * MARK: pickRunAttribution
 * @description Picks a timeline entry's run-attribution fields
 *   (`harnessId`, `modelRef`, `aliasName`, `targetIndex`) for display,
 *   passing only fields that exist — a row without attribution yields an
 *   empty object, so nothing (never a placeholder) renders for it.
 * @example pickRunAttribution({ harnessId: 'pi' }) => { harnessId: 'pi' }
 * @example pickRunAttribution({ stage: 'CI' }) => {}
 * @param {Object} [entry] - Timeline entry.
 * @returns {Object} Only the attribution fields present on the entry.
 ***/
function pickRunAttribution(entry) {
  if (!entry || typeof entry !== 'object') return {};
  const picked = {};
  for (const key of ['harnessId', 'modelRef', 'aliasName', 'targetIndex']) {
    if (entry[key] !== undefined) picked[key] = entry[key];
  }
  return picked;
}

/***
 * MARK: buildDisplayTimeline
 * @description Builds the history rows the inspector shows, newest first, from
 *   stored arrivals plus one live current-stage row. Stored arrivals record
 *   stage = destination, so the newest arrival into the live stage would render
 *   the same stage twice (live Active row plus stored Moved/Advanced row with
 *   the previous stage's duration) — that row is suppressed, but only when
 *   every stored row newer than it is a same-stage visit outcome (Failed,
 *   Retrying, or Resumed — the live row supersedes exactly the current
 *   visit's arrival, never a past visit's).
 *   Failed, Completed, other-stage, and unknown-status rows are never
 *   suppressed, so failure reasons and past visits stay visible. When the
 *   live row supersedes the current visit's arrival row it inherits that
 *   row's run attribution (the stage's dispatch-stamped model choice).
 *   The stored rows are then collapsed by `summarizeStageRuns` to one row per
 *   stage carrying a `tryCount`, so repeated failback/retry cycles render one
 *   history line per stage ("Tried N times") instead of spamming the same
 *   stage. Completed tasks and the full-page view pass includeLiveRow false
 *   and see the full stored history (collapsed per stage).
 * @example buildDisplayTimeline({ storedTimeline: [{ stage: 'Plan', status: 'Moved', duration: '9s', timestamp: 't2' }], stages: [{ id: '2', name: 'Plan' }], currentStageName: 'Plan', liveDurationLabel: '3s in stage', includeLiveRow: true }) => [{ stage: 'Plan', status: 'Active' }]
 * @example buildDisplayTimeline({ storedTimeline: [], currentStageName: 'In Progress', includeLiveRow: false }) => [{ stage: 'In Progress', status: 'Active' }]
 * @param {Object} [args] - Timeline display inputs.
 * @param {Array<Object>} [args.storedTimeline=[]] - Stored entries, oldest first.
 * @param {Array<Object>} [args.stages=[]] - Current workflow stages for label mapping.
 * @param {string} [args.currentStageName] - Live stage name for the Active row.
 * @param {string} [args.liveDurationLabel] - Live row duration text.
 * @param {boolean} [args.includeLiveRow=false] - True for open tasks in the inspector.
 * @param {{ label?: string, tone?: string, ticking?: boolean }} [args.presentation] - Stage presentation verdict
 *   (see selectStagePresentation). A non-ticking verdict (PARKED/WAITING/DONE) renders a static settled
 *   row — never a live ACTIVE row with a growing timer.
 * @returns {Array<Object>} Display entries, most recent first. Never mutates its input.
 ***/
export function buildDisplayTimeline({
  storedTimeline = [],
  stages = [],
  currentStageName,
  liveDurationLabel,
  includeLiveRow = false,
  presentation = null,
} = {}) {
  const displayStored = selectDisplayTimeline(storedTimeline, stages);
  const fallbackStageName =
    typeof currentStageName === 'string' && currentStageName.trim()
      ? currentStageName.trim()
      : 'Current Stage';
  if (includeLiveRow) {
    // Settled tasks never tick: a parked failure renders a static PARKED row
    // (frozen text, no growing "Nm in stage" timer) so it cannot read as live.
    const settledLabel =
      presentation && presentation.ticking === false && typeof presentation.label === 'string'
        ? presentation.label.trim().toUpperCase()
        : '';
    const isSettledRow = settledLabel === 'PARKED' || settledLabel === 'WAITING' || settledLabel === 'DONE';
    if (isSettledRow) {
      const settledRow = {
        stage: fallbackStageName,
        duration: settledLabel === 'PARKED' ? 'Parked — awaiting retry' : liveDurationLabel || 'Settled',
        timestamp: settledLabel.charAt(0) + settledLabel.slice(1).toLowerCase(),
        status: settledLabel.charAt(0) + settledLabel.slice(1).toLowerCase(),
      };
      return [settledRow, ...summarizeStageRuns(displayStored, stages)];
    }
    const liveRow = {
      stage: fallbackStageName,
      duration: liveDurationLabel || 'In progress',
      timestamp: 'Active',
      status: 'Active',
    };
    // The live-row suppression runs on the exact-deduped rows (one row per
    // stored event); the per-stage collapsing happens afterwards, on the
    // rows the live row did not supersede, so the current stage still renders
    // exactly once (live Active row) while past visits of any stage —
    // including the live one — collapse to one row with a try count.
    const arrivalIndex = displayStored.findIndex(
      (entry) => entry?.stage === liveRow.stage && isArrivalTimelineStatus(entry?.status),
    );
    const superseded =
      arrivalIndex !== -1 &&
      displayStored
        .slice(0, arrivalIndex)
        .every(
          (entry) =>
            entry?.stage === liveRow.stage &&
            isVisitOutcomeTimelineStatus(entry?.status),
        );
    if (!superseded) return [liveRow, ...summarizeStageRuns(displayStored, stages)];
    // The live row replaces the current visit's arrival row, so it inherits
    // that row's run attribution (stamped at the stage's dispatch): the
    // current agent run's badge stays visible while the stage is live, and a
    // human / CI stage's live row stays completely blank.
    const rest = [
      ...displayStored.slice(0, arrivalIndex),
      ...displayStored.slice(arrivalIndex + 1),
    ];
    return [
      { ...liveRow, ...pickRunAttribution(displayStored[arrivalIndex]) },
      ...summarizeStageRuns(rest, stages),
    ];
  }
  if (displayStored.length > 0) return summarizeStageRuns(displayStored, stages);
  return [
    {
      stage: fallbackStageName,
      duration: 'In progress',
      timestamp: 'Active',
      status: 'Active',
    },
  ];
}

/***
 * MARK: formatDiffStat
 * @description Renders a timeline entry's per-stage lines-changed delta as
 *   a small "+N -M" badge (added / removed lines). Returns null when the entry
 *   carries no diff data, so legacy entries render exactly as before.
 * @example formatDiffStat({ additions: 12, deletions: 3 }) => '+12 -3'
 * @example formatDiffStat({ stage: 'Idea' }) => null
 * @param {Object} [entry] - Timeline entry.
 * @returns {string|null} Badge text, or null when there is no diff data.
 ***/
export function formatDiffStat(entry) {
  const additions = entry?.additions;
  const deletions = entry?.deletions;
  if (!Number.isInteger(additions) || !Number.isInteger(deletions)) return null;
  if (additions < 0 || deletions < 0) return null;
  return `+${additions} -${deletions}`;
}
