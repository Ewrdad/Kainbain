import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskDraftCache } from './useTaskDraftCache';
import {
  TASK_DRAFT_MAX_ENTRIES,
  countTaskDrafts,
  getTaskDraftStats,
  resetTaskDraftStats,
  taskDraftKey,
} from '../services/taskDrafts';

/***
 * MARK: seedDraft
 * @description Writes a draft record straight to the mocked localStorage.
 ***/
function seedDraft(taskId, value, { updatedAt = Date.now(), projectId = 'proj-1' } = {}) {
  window.localStorage.setItem(
    taskDraftKey(taskId),
    JSON.stringify({ value, updatedAt, projectId }),
  );
}

/***
 * MARK: dispatchStorageEvent
 * @description Simulates another tab writing to localStorage (the browser
 *   never fires `storage` in the originating tab, so tests must dispatch it).
 ***/
function dispatchStorageEvent(key, newValue) {
  window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
}

describe('useTaskDraftCache', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTaskDraftStats();
    vi.restoreAllMocks();
  });

  it('restores a draft cached by a previous session', () => {
    seedDraft('task-1', 'Half-typed goal');
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));
    expect(result.current.draftValue).toBe('Half-typed goal');
    expect(result.current.draftEntry).toMatchObject({ value: 'Half-typed goal' });
  });

  it('has no draft for a task that was never edited', () => {
    const { result } = renderHook(() => useTaskDraftCache('task-2', 'proj-1'));
    expect(result.current.draftValue).toBeNull();
    expect(result.current.draftEntry).toBeNull();
  });

  it('cacheDraft writes synchronously and updates the exposed draft', () => {
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));
    act(() => {
      result.current.cacheDraft('Typed goal');
    });
    expect(result.current.draftValue).toBe('Typed goal');
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toContain('Typed goal');
    expect(getTaskDraftStats().writes).toBe(1);
  });

  it('confirmReceived clears the cache when the backend confirmed that exact value', () => {
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));
    act(() => {
      result.current.cacheDraft('Saved goal');
    });
    let cleared;
    act(() => {
      cleared = result.current.confirmReceived('Saved goal');
    });
    expect(cleared).toBe(true);
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
    expect(result.current.draftValue).toBeNull();
    expect(getTaskDraftStats().confirms).toBe(1);
  });

  it('confirmReceived keeps a newer draft that raced the in-flight save', () => {
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));
    act(() => {
      result.current.cacheDraft('First edit');
    });
    // A second keystroke lands while the first PATCH is still in flight.
    act(() => {
      result.current.cacheDraft('Second edit');
    });
    let cleared;
    act(() => {
      // The API confirmed only the older value: the newer edit must survive.
      cleared = result.current.confirmReceived('First edit');
    });
    expect(cleared).toBe(false);
    expect(result.current.draftValue).toBe('Second edit');
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toContain('Second edit');
  });

  it('confirmReceived without a value clears the cache', () => {
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));
    act(() => {
      result.current.cacheDraft('Goal');
    });
    act(() => {
      result.current.confirmReceived();
    });
    expect(window.localStorage.getItem(taskDraftKey('task-1'))).toBeNull();
  });

  it('re-reads per task so one task never bleeds into another', () => {
    seedDraft('task-a', 'Goal A');
    seedDraft('task-b', 'Goal B');
    const { result, rerender } = renderHook(
      ({ taskId }) => useTaskDraftCache(taskId, 'proj-1'),
      { initialProps: { taskId: 'task-a' } },
    );
    expect(result.current.draftValue).toBe('Goal A');

    rerender({ taskId: 'task-b' });
    expect(result.current.draftValue).toBe('Goal B');

    rerender({ taskId: 'task-c' });
    expect(result.current.draftValue).toBeNull();
  });

  it('picks up a draft written by another tab via the storage event', () => {
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));
    expect(result.current.draftValue).toBeNull();

    act(() => {
      dispatchStorageEvent(
        taskDraftKey('task-1'),
        JSON.stringify({ value: 'From another tab', updatedAt: Date.now(), projectId: 'proj-1' }),
      );
    });

    expect(result.current.draftValue).toBe('From another tab');
  });

  it('ignores a malformed cross-tab payload instead of overwriting the draft', () => {
    seedDraft('task-1', 'Local safe goal');
    const { result } = renderHook(() => useTaskDraftCache('task-1', 'proj-1'));

    act(() => {
      dispatchStorageEvent(taskDraftKey('task-1'), '{"value":42}');
    });

    expect(result.current.draftValue).toBe('Local safe goal');
  });

  it('cacheDraft no-ops without a task so the sentinel key is never written', () => {
    const { result } = renderHook(() => useTaskDraftCache(undefined, 'proj-1'));
    act(() => {
      result.current.cacheDraft('Orphan text');
    });
    expect(result.current.draftValue).toBeNull();
  });

  it('evicts the oldest draft when a write pushes the namespace past the cap', () => {
    const now = Date.now();
    for (let i = 0; i < TASK_DRAFT_MAX_ENTRIES; i += 1) {
      seedDraft(`other-${i}`, `Goal ${i}`, {
        updatedAt: now - (TASK_DRAFT_MAX_ENTRIES - i),
      });
    }
    const { result } = renderHook(() => useTaskDraftCache('task-new', 'proj-1'));

    act(() => {
      result.current.cacheDraft('New goal');
    });

    expect(countTaskDrafts()).toBe(TASK_DRAFT_MAX_ENTRIES);
    expect(window.localStorage.getItem(taskDraftKey('other-0'))).toBeNull();
    expect(result.current.draftValue).toBe('New goal');
    expect(getTaskDraftStats().evictions).toBe(1);
  });
});
