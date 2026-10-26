import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TASK_DRAFT_KEY_PREFIX,
  TASK_DRAFT_MAX_ENTRIES,
  TASK_DRAFT_TTL_MS,
  countTaskDrafts,
  getTaskDraftStats,
  isValidTaskDraft,
  listTaskDrafts,
  noteTaskDraftConfirmed,
  noteTaskDraftFailure,
  noteTaskDraftWritten,
  pruneTaskDrafts,
  readTaskDraft,
  removeTaskDraft,
  resetTaskDraftStats,
  sweepTaskDrafts,
  taskDraftKey,
} from './taskDrafts';

/***
 * MARK: seedDraft
 * @description Writes a draft record straight to the mocked localStorage so
 *   read/prune behaviour can be exercised without the React hook.
 ***/
function seedDraft(taskId, value, { updatedAt = Date.now(), projectId = 'proj-1' } = {}) {
  window.localStorage.setItem(
    taskDraftKey(taskId),
    JSON.stringify({ value, updatedAt, projectId }),
  );
}

describe('taskDrafts store', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTaskDraftStats();
    vi.restoreAllMocks();
  });

  it('builds a namespaced per-task key', () => {
    expect(taskDraftKey('task-9')).toBe(`${TASK_DRAFT_KEY_PREFIX}task-9`);
  });

  it('accepts a valid draft shape and rejects everything else', () => {
    expect(isValidTaskDraft({ value: 'Goal', updatedAt: 1 })).toBe(true);
    expect(isValidTaskDraft(null)).toBe(false);
    expect(isValidTaskDraft(undefined)).toBe(false);
    expect(isValidTaskDraft({ value: 42, updatedAt: 1 })).toBe(false);
    expect(isValidTaskDraft({ value: 'Goal' })).toBe(false);
    expect(isValidTaskDraft('Goal')).toBe(false);
  });

  it('round-trips a cached draft', () => {
    seedDraft('task-1', 'Cached goal');
    expect(readTaskDraft('task-1')).toMatchObject({
      value: 'Cached goal',
      projectId: 'proj-1',
    });
  });

  it('returns null for a missing task, corrupt payload, or wrong shape', () => {
    expect(readTaskDraft('missing')).toBeNull();

    window.localStorage.setItem(taskDraftKey('corrupt'), 'not-json{{{');
    expect(readTaskDraft('corrupt')).toBeNull();

    // The single-key persistence helper writes a bare `null` when a task with
    // no draft is opened; it must never be mistaken for an edit.
    window.localStorage.setItem(taskDraftKey('sentinel'), 'null');
    expect(readTaskDraft('sentinel')).toBeNull();
  });

  it('drops a draft older than the TTL and reports it as expired', () => {
    const now = Date.now();
    seedDraft('task-old', 'Stale goal', { updatedAt: now - TASK_DRAFT_TTL_MS - 1 });
    expect(readTaskDraft('task-old', now)).toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('task-old'))).toBeNull();
    expect(getTaskDraftStats().expired).toBe(1);
  });

  it('keeps a draft inside the TTL', () => {
    const now = Date.now();
    seedDraft('task-fresh', 'Fresh goal', { updatedAt: now - 1000 });
    expect(readTaskDraft('task-fresh', now)).toMatchObject({ value: 'Fresh goal' });
  });

  it('removes a single draft', () => {
    seedDraft('task-1', 'Goal');
    removeTaskDraft('task-1');
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
  });

  it('countTaskDrafts counts namespace keys cheaply, including unreadable ones', () => {
    seedDraft('task-1', 'Goal');
    seedDraft('task-2', 'Goal');
    window.localStorage.setItem(taskDraftKey('sentinel'), 'null');
    window.localStorage.setItem('kainbain:unrelated', 'x');
    expect(countTaskDrafts()).toBe(3);
  });

  it('enforces the entry cap by evicting the least-recently-edited drafts', () => {
    const now = Date.now();
    for (let i = 0; i < TASK_DRAFT_MAX_ENTRIES + 3; i += 1) {
      // Oldest first: task-0 is the least recently edited.
      seedDraft(`task-${i}`, `Goal ${i}`, { updatedAt: now - (TASK_DRAFT_MAX_ENTRIES + 3 - i) });
    }

    pruneTaskDrafts(now);

    expect(listTaskDrafts()).toHaveLength(TASK_DRAFT_MAX_ENTRIES);
    expect(window.localStorage.getItem(taskDraftKey('task-0'))).toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('task-2'))).toBeNull();
    // The newest entry always survives.
    expect(readTaskDraft(`task-${TASK_DRAFT_MAX_ENTRIES + 2}`, now)).not.toBeNull();
    expect(getTaskDraftStats().evictions).toBe(3);
  });

  it('prune drops unreadable keys written into the namespace', () => {
    window.localStorage.setItem(taskDraftKey('sentinel'), 'null');
    window.localStorage.setItem(taskDraftKey('junk'), '{"value":42}');
    seedDraft('task-keep', 'Goal');

    pruneTaskDrafts();

    expect(window.localStorage.getItem(taskDraftKey('sentinel'))).toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('junk'))).toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('task-keep'))).not.toBeNull();
  });

  it('sweep drops expired drafts and drafts for tasks no longer on the board', () => {
    const now = Date.now();
    seedDraft('task-live', 'Live goal', { updatedAt: now, projectId: 'proj-1' });
    seedDraft('task-deleted', 'Deleted goal', { updatedAt: now, projectId: 'proj-1' });
    seedDraft('task-expired', 'Old goal', {
      updatedAt: now - TASK_DRAFT_TTL_MS - 1,
      projectId: 'proj-1',
    });
    seedDraft('task-other-project', 'Other goal', { updatedAt: now, projectId: 'proj-2' });

    sweepTaskDrafts({ projectId: 'proj-1', validTaskIds: ['task-live'], now });

    expect(readTaskDraft('task-live', now)).not.toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('task-deleted'))).toBeNull();
    expect(window.localStorage.getItem(taskDraftKey('task-expired'))).toBeNull();
    // A different project's drafts are never touched.
    expect(readTaskDraft('task-other-project', now)).not.toBeNull();
  });

  it('sweep ignores an empty board list so a transient fetch cannot wipe drafts', () => {
    seedDraft('task-live', 'Live goal');
    sweepTaskDrafts({ projectId: 'proj-1', validTaskIds: [] });
    expect(readTaskDraft('task-live')).not.toBeNull();
  });

  it('prune is a no-op when the namespace is empty', () => {
    expect(pruneTaskDrafts()).toEqual({ removed: 0 });
    expect(listTaskDrafts()).toEqual([]);
  });

  it('tracks write/confirm/failure counters for diagnostics', () => {
    noteTaskDraftWritten();
    noteTaskDraftWritten();
    noteTaskDraftConfirmed();
    noteTaskDraftFailure({ taskId: 'task-1' });

    expect(getTaskDraftStats()).toMatchObject({
      writes: 2,
      confirms: 1,
      failures: 1,
    });
  });

  it('survives localStorage being unavailable', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage blocked');
      },
    });
    try {
      expect(readTaskDraft('task-1')).toBeNull();
      expect(listTaskDrafts()).toEqual([]);
      expect(pruneTaskDrafts()).toEqual({ removed: 0 });
    } finally {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: original,
      });
    }
  });
});
