// Domain: The Work — local task-edit drafts that survive a slow network.
//
// Editing a task over a slow link used to lose the user's text the moment the
// editor closed before the debounced PATCH resolved, and the reopened view
// showed the stale server value. This module is the persistence layer for the
// fix: every keystroke is cached under its own localStorage key and that entry
// is only deleted once the backend confirms receipt (see
// `hooks/useTaskDraftCache.js` and the two task editors).
//
// The namespace is kept bounded on purpose (an entry cap plus a time-to-live)
// so a long-lived app never accumulates drafts and slows down. Board-load and
// write-time sweeps drop expired, orphaned, and unreadable entries.
import { logger } from './logger';

/***
 * MARK: task draft constants
 * @description localStorage namespace and bounding limits for cached task edits.
 *   Per-task keys keep one task's draft independent of every other task, so a
 *   busy board never rewrites one large blob on each keystroke.
 ***/
/** Namespace prefix for one task's unconfirmed edit. */
export const TASK_DRAFT_KEY_PREFIX = 'kainbain:task-draft:';
/** Hard cap on cached drafts; the least-recently-edited entry is evicted first. */
export const TASK_DRAFT_MAX_ENTRIES = 50;
/** Drafts untouched for longer than this are considered abandoned and dropped. */
export const TASK_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Sentinel key used while no task is open; never holds a real draft. */
export const TASK_DRAFT_DISABLED_KEY = `${TASK_DRAFT_KEY_PREFIX}__none__`;

// Lightweight observability counters. They exist so cache behaviour can be
// asserted directly in tests instead of scraping log output (log-based tests
// are an anti-pattern here) and can be surfaced if the app ever needs to
// report cache health.
const counters = {
  writes: 0,
  confirms: 0,
  hits: 0,
  failures: 0,
  evictions: 0,
  expired: 0,
};

/***
 * MARK: storageOrNull
 * @description Resolves localStorage without throwing when it is unavailable
 *   (SSR, private mode, disabled storage).
 * @returns {Storage|null} The storage instance, or null when unreachable.
 ***/
function storageOrNull() {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/***
 * MARK: taskDraftKey
 * @description Builds the localStorage key for one task's draft.
 * @example taskDraftKey('task-9') => 'kainbain:task-draft:task-9'
 * @param {string} taskId - The task the draft belongs to.
 * @returns {string} The namespaced storage key.
 ***/
export function taskDraftKey(taskId) {
  return `${TASK_DRAFT_KEY_PREFIX}${taskId}`;
}

/***
 * MARK: isValidTaskDraft
 * @description Validates the stored draft shape. Anything else (corrupt JSON,
 *   a null sentinel write, an older incompatible shape) is treated as no draft.
 * @example isValidTaskDraft({ value: 'Goal', updatedAt: 1 }) => true
 * @param {any} draft - The parsed value to check.
 * @returns {boolean} True when the value is a usable draft record.
 ***/
export function isValidTaskDraft(draft) {
  return (
    Boolean(draft) &&
    typeof draft === 'object' &&
    typeof draft.value === 'string' &&
    Number.isFinite(draft.updatedAt)
  );
}

/***
 * MARK: parseDraft
 * @description Parses one stored string into a draft, discarding unreadable
 *   or invalid payloads instead of throwing.
 * @param {string|null} raw - The raw localStorage string.
 * @returns {Object|null} The draft record, or null.
 ***/
function parseDraft(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = JSON.parse(raw);
    return isValidTaskDraft(parsed) ? parsed : null;
  } catch (err) {
    counters.failures += 1;
    logger.warn('Discarding unreadable cached task draft', { err });
    return null;
  }
}

/***
 * MARK: readTaskDraft
 * @description Reads one task's cached draft, dropping an entry that has aged
 *   past the TTL. Returns null when there is nothing usable to restore.
 * @example const draft = readTaskDraft('task-9')
 * @param {string} taskId - The task to look up.
 * @param {number} [now=Date.now()] - Clock injection point for tests.
 * @returns {{value: string, updatedAt: number, projectId: string|null}|null}
 ***/
export function readTaskDraft(taskId, now = Date.now()) {
  if (!taskId) return null;
  const store = storageOrNull();
  if (!store) return null;
  let raw = null;
  try {
    raw = store.getItem(taskDraftKey(taskId));
  } catch (err) {
    counters.failures += 1;
    logger.warn('Failed to read a cached task draft', { taskId, err });
    return null;
  }
  const draft = parseDraft(raw);
  if (!draft) return null;
  counters.hits += 1;
  if (now - draft.updatedAt > TASK_DRAFT_TTL_MS) {
    removeTaskDraft(taskId);
    counters.expired += 1;
    return null;
  }
  return draft;
}

/***
 * MARK: countTaskDrafts
 * @description Cheaply counts the keys in the draft namespace without parsing
 *   them. Used to skip the expensive prune scan while the cache is well under
 *   its cap (the write path runs on every keystroke).
 * @example countTaskDrafts() => 3
 * @returns {number} The number of draft-namespace keys currently stored.
 ***/
export function countTaskDrafts() {
  const store = storageOrNull();
  if (!store) return 0;
  let count = 0;
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (typeof key === 'string' && key.startsWith(TASK_DRAFT_KEY_PREFIX)) count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

/***
 * MARK: listTaskDrafts
 * @description Lists every readable draft in the namespace (expired entries
 *   included; callers such as prune decide what to drop).
 * @example listTaskDrafts().map((d) => d.taskId)
 * @returns {Array<{taskId: string, value: string, updatedAt: number, projectId: string|null}>}
 ***/
export function listTaskDrafts() {
  const store = storageOrNull();
  if (!store) return [];
  const keys = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (typeof key === 'string' && key.startsWith(TASK_DRAFT_KEY_PREFIX)) keys.push(key);
    }
  } catch (err) {
    counters.failures += 1;
    logger.warn('Failed to enumerate cached task drafts', { err });
    return [];
  }
  const drafts = [];
  for (const key of keys) {
    let raw = null;
    try {
      raw = store.getItem(key);
    } catch {
      continue;
    }
    const draft = parseDraft(raw);
    if (draft) drafts.push({ taskId: key.slice(TASK_DRAFT_KEY_PREFIX.length), ...draft });
  }
  return drafts;
}

/***
 * MARK: removeTaskDraft
 * @description Deletes one task's cached draft. Called when the backend
 *   confirms the edit and when a task is deleted.
 * @example removeTaskDraft('task-9')
 * @param {string} taskId - The task whose draft should be dropped.
 ***/
export function removeTaskDraft(taskId) {
  if (!taskId) return;
  const store = storageOrNull();
  if (!store) return;
  try {
    store.removeItem(taskDraftKey(taskId));
  } catch (err) {
    counters.failures += 1;
    logger.warn('Failed to clear a cached task draft', { taskId, err });
  }
}

/***
 * MARK: pruneTaskDrafts
 * @description Keeps the draft namespace bounded. Removes unreadable keys
 *   (including the null sentinel the single-key persistence helper may write),
 *   drops drafts past the TTL, then evicts the least-recently-edited entries
 *   until the count is within the cap.
 * @example pruneTaskDrafts()
 * @param {number} [now=Date.now()] - Clock injection point for tests.
 * @returns {{removed: number}} How many entries were dropped.
 ***/
export function pruneTaskDrafts(now = Date.now()) {
  const store = storageOrNull();
  if (!store) return { removed: 0 };
  const result = { removed: 0 };
  const valid = listTaskDrafts();
  const validKeys = new Set(valid.map((draft) => taskDraftKey(draft.taskId)));

  const namespaceKeys = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (typeof key === 'string' && key.startsWith(TASK_DRAFT_KEY_PREFIX)) namespaceKeys.push(key);
    }
  } catch (err) {
    counters.failures += 1;
    logger.warn('Failed to enumerate cached task drafts', { err });
    return result;
  }

  for (const key of namespaceKeys) {
    if (validKeys.has(key)) continue;
    try {
      store.removeItem(key);
      result.removed += 1;
    } catch {
      // Best effort: a key we cannot remove is retried on the next sweep.
    }
  }

  const fresh = [];
  for (const draft of valid) {
    if (now - draft.updatedAt > TASK_DRAFT_TTL_MS) {
      removeTaskDraft(draft.taskId);
      counters.expired += 1;
      result.removed += 1;
      continue;
    }
    fresh.push(draft);
  }

  if (fresh.length > TASK_DRAFT_MAX_ENTRIES) {
    fresh.sort((a, b) => a.updatedAt - b.updatedAt);
    const overflow = fresh.length - TASK_DRAFT_MAX_ENTRIES;
    const evicted = fresh.slice(0, overflow);
    for (const draft of evicted) {
      removeTaskDraft(draft.taskId);
      counters.evictions += 1;
      result.removed += 1;
    }
    logger.info('Evicted oldest cached task drafts to stay under the cap', {
      evicted: overflow,
    });
  }

  return result;
}

/***
 * MARK: sweepTaskDrafts
 * @description Board-load hygiene: prunes the namespace, then drops drafts
 *   that belong to the freshly loaded project but no longer match a task
 *   (deleted or completed-away tasks). Drafts from other projects are left
 *   alone. An empty task list is ignored so one transient empty fetch cannot
 *   wipe every draft.
 * @example sweepTaskDrafts({ projectId: 'proj-1', validTaskIds: ['task-9'] })
 * @param {Object} [options]
 * @param {string} [options.projectId] - The project whose list was just loaded.
 * @param {Array<string>} [options.validTaskIds] - Task ids present on the board.
 * @param {number} [options.now=Date.now()] - Clock injection point for tests.
 * @returns {{removed: number}}
 ***/
export function sweepTaskDrafts({ projectId, validTaskIds = [], now = Date.now() } = {}) {
  const result = pruneTaskDrafts(now);
  if (!projectId || !Array.isArray(validTaskIds) || validTaskIds.length === 0) return result;
  const valid = new Set(validTaskIds.map((id) => String(id)));
  for (const draft of listTaskDrafts()) {
    if (draft.projectId !== projectId) continue;
    if (valid.has(String(draft.taskId))) continue;
    removeTaskDraft(draft.taskId);
    result.removed += 1;
  }
  return result;
}

/***
 * MARK: noteTaskDraftWritten
 * @description Records that a draft was cached (one keystroke batch).
 ***/
export function noteTaskDraftWritten() {
  counters.writes += 1;
}

/***
 * MARK: noteTaskDraftConfirmed
 * @description Records that the backend confirmed an edit and its draft was
 *   cleared.
 ***/
export function noteTaskDraftConfirmed() {
  counters.confirms += 1;
}

/***
 * MARK: noteTaskDraftFailure
 * @description Records that a save attempt failed while its draft was kept,
 *   and logs it for production triage.
 * @example noteTaskDraftFailure({ taskId: 'task-9' })
 * @param {Object} [meta] - Context for the warning log.
 ***/
export function noteTaskDraftFailure(meta) {
  counters.failures += 1;
  logger.warn('Task edit stayed cached after a failed save', meta);
}

/***
 * MARK: getTaskDraftStats
 * @description Snapshot of the cache counters for tests and diagnostics.
 * @returns {{writes: number, confirms: number, hits: number, failures: number, evictions: number, expired: number}}
 ***/
export function getTaskDraftStats() {
  return { ...counters };
}

/***
 * MARK: resetTaskDraftStats
 * @description Zeroes the counters (test isolation).
 ***/
export function resetTaskDraftStats() {
  counters.writes = 0;
  counters.confirms = 0;
  counters.hits = 0;
  counters.failures = 0;
  counters.evictions = 0;
  counters.expired = 0;
}
