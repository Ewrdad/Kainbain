import { normalizeStageType } from '../stageTypes.js';

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
 * MARK: isFailedTimelineOutcome
 * @description True for stored Failed rows: the outcome of a visit to the
 *   row's stage, carrying the failure reason. Never suppressed.
 * @example isFailedTimelineOutcome('Failed') => true
 * @example isFailedTimelineOutcome('Failed back') => false
 * @param {string} [status] - Stored timeline row status.
 * @returns {boolean} True for Failed outcome rows.
 ***/
function isFailedTimelineOutcome(status) {
  return typeof status === 'string' && status.trim().toLowerCase() === 'failed';
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
 *   every stored row newer than it is a same-stage Failed outcome (the live
 *   row supersedes exactly the current visit's arrival, never a past visit's).
 *   Failed, Completed, other-stage, and unknown-status rows are never
 *   suppressed, so failure reasons and past visits stay visible. When the
 *   live row supersedes the current visit's arrival row it inherits that
 *   row's run attribution (the stage's dispatch-stamped model choice).
 *   Completed tasks and the full-page view pass includeLiveRow false and see
 *   the full stored history.
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
      return [settledRow, ...displayStored];
    }
    const liveRow = {
      stage: fallbackStageName,
      duration: liveDurationLabel || 'In progress',
      timestamp: 'Active',
      status: 'Active',
    };
    const arrivalIndex = displayStored.findIndex(
      (entry) => entry?.stage === liveRow.stage && isArrivalTimelineStatus(entry?.status),
    );
    const superseded =
      arrivalIndex !== -1 &&
      displayStored
        .slice(0, arrivalIndex)
        .every(
          (entry) =>
            entry?.stage === liveRow.stage && isFailedTimelineOutcome(entry?.status),
        );
    if (!superseded) return [liveRow, ...displayStored];
    // The live row replaces the current visit's arrival row, so it inherits
    // that row's run attribution (stamped at the stage's dispatch): the
    // current agent run's badge stays visible while the stage is live, and a
    // human / CI stage's live row stays completely blank.
    return [
      { ...liveRow, ...pickRunAttribution(displayStored[arrivalIndex]) },
      ...displayStored.slice(0, arrivalIndex),
      ...displayStored.slice(arrivalIndex + 1),
    ];
  }
  if (displayStored.length > 0) return displayStored;
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

/***
 * MARK: getNotesViewerBaseUrl
 * @description Base URL of the external notes viewer (SilverBullet), from
 *   `VITE_NOTES_VIEWER_URL` (Vite inlines `VITE_*` vars at build) or an
 *   explicit override. Empty when unconfigured — callers then stay in-app.
 * @example getNotesViewerBaseUrl({ baseUrl: 'http://notes.example.com/' }) => 'http://notes.example.com'
 * @example getNotesViewerBaseUrl({ baseUrl: '' }) => ''
 * @param {Object} [opts] - Options.
 * @param {string} [opts.baseUrl] - Explicit base URL (wins over the env var, even when empty).
 * @returns {string} Trimmed base URL without trailing slashes, or '' when unconfigured.
 ***/
export function getNotesViewerBaseUrl({ baseUrl } = {}) {
  const raw =
    baseUrl !== undefined ? baseUrl : import.meta.env?.VITE_NOTES_VIEWER_URL;
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
}

/***
 * MARK: getSilverBulletUrl
 * @description Constructs a deep link to open project markdown files and reports inside the notes space.
 *   The viewer base comes from `VITE_NOTES_VIEWER_URL` (or `opts.baseUrl`):
 *   when it carries `${PROJECT}`/`${PATH}` placeholders they are expanded,
 *   otherwise the legacy `/Projects/Personal/<project>/<subpath>` shape is
 *   appended. When no viewer is configured the link degrades to the in-app
 *   file browser (`#/explorer`) — a relative route with no external host, so
 *   it can never hang on an unreachable `.home` lookup (audit N-4).
 * @example getSilverBulletUrl('KainBain', 'docs/tasks/task-1/plan.md', { baseUrl: 'http://notes.example.com' }) => 'http://notes.example.com/Projects/Personal/KainBain/tasks/task-1/plan.md'
 * @example getSilverBulletUrl('KainBain', 'docs/tasks/task-1/plan.md', { baseUrl: '' }) => '#/explorer'
 * @param {string} [projectName='KainBain'] - The active project name.
 * @param {string} [filePath=''] - The markdown file path (e.g. docs/..., ./docs/..., or subpath).
 * @param {Object} [opts] - Options.
 * @param {string} [opts.baseUrl] - Explicit viewer base URL (wins over the env var, even when empty).
 * @returns {string} Notes deep link URL, or '#/explorer' when no viewer is configured.
 ***/
export function getSilverBulletUrl(projectName = 'KainBain', filePath = '', { baseUrl } = {}) {
  const pName = (projectName || 'KainBain').trim();
  let subpath = String(filePath || '')
    .trim()
    .replace(/\\/g, '/');
  subpath = subpath.replace(/^\.\//, '');
  if (subpath.startsWith('space/')) {
    subpath = subpath.slice(6);
  }
  if (subpath.startsWith('docs/')) {
    subpath = subpath.slice(5);
  }
  subpath = subpath.replace(/^\//, '');
  const base = getNotesViewerBaseUrl({ baseUrl });
  if (!base) return '#/explorer';
  if (base.includes('${PATH}') || base.includes('${PROJECT}')) {
    return base.split('${PROJECT}').join(encodeURIComponent(pName)).split('${PATH}').join(subpath);
  }
  return `${base}/Projects/Personal/${encodeURIComponent(pName)}/${subpath}`;
}

/***
 * MARK: isSilverBulletPath
 * @description Returns true iff a repo-relative file path lives inside the
 *   SilverBullet notes space (i.e. under `docs/`). Mirrors the normalization
 *   in `getSilverBulletUrl` so visibility and link generation never disagree.
 * @example isSilverBulletPath('docs/a.md') => true
 * @example isSilverBulletPath('./docs/a.md') => true
 * @example isSilverBulletPath('README.md') => false
 * @example isSilverBulletPath('docs2/a.md') => false
 * @param {string} [filePath=''] - Repo-relative file path.
 * @returns {boolean} True when the path is `docs` or under `docs/`.
 ***/
export function isSilverBulletPath(filePath = '') {
  if (typeof filePath !== 'string') return false;
  let p = filePath.trim().replace(/\\/g, '/');
  p = p.replace(/^\.\//, '');
  if (p.startsWith('space/')) p = p.slice(6);
  p = p.replace(/^\//, '');
  return p === 'docs' || p.startsWith('docs/');
}
