// @vitest-environment jsdom
/**
 * MARK: logViewerState tests
 * @description Hook contract: density-aware defaults, persistence round-trip,
 *   invalid stored categories discarded, and one-way legacy migration.
 */
import { describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { baseKeyForSurface, initialCategories, useLogViewerState } from './logViewerState';
import { defaultCategorySet } from './logCategories';

function clearStorage() {
  window.localStorage.clear();
}

describe('baseKeyForSurface', () => {
  test('namespaces per surface and per task', () => {
    expect(baseKeyForSurface('task', 't1')).toBe('kainbain:logViewer:task:t1');
    expect(baseKeyForSurface('live')).toBe('kainbain:logViewer:live');
    expect(baseKeyForSurface('activity')).toBe('kainbain:logViewer:activity');
  });
});

describe('initialCategories (pure)', () => {
  test('stored unified values win over legacy keys', () => {
    const got = initialCategories({
      stored: ['output'],
      surface: 'task',
      taskId: 't1',
      density: 'full',
    });
    expect(got).toEqual(new Set(['output']));
  });

  test('drops unknown ids from stored lists', () => {
    const got = initialCategories({
      stored: ['output', 'BOGUS'],
      surface: 'task',
      taskId: 't1',
      density: 'full',
    });
    expect(got).toEqual(new Set(['output']));
  });
});

describe('useLogViewerState', () => {
  test('task surface defaults to full density with timestamps on', () => {
    clearStorage();
    const { result } = renderHook(() => useLogViewerState({ surface: 'task', taskId: 't1' }));
    expect(result.current.density).toBe('full');
    expect(result.current.showTimestamps).toBe(true);
    expect(result.current.categories).toEqual(defaultCategorySet('full'));
    expect(result.current.autoScroll).toBe(true);
  });

  test('live surface defaults to compact density with timestamps off', () => {
    clearStorage();
    const { result } = renderHook(() => useLogViewerState({ surface: 'live' }));
    expect(result.current.density).toBe('compact');
    expect(result.current.showTimestamps).toBe(false);
    expect(result.current.categories).toEqual(defaultCategorySet('compact'));
  });

  test('toggleCategory and reset round-trip through state', () => {
    clearStorage();
    const { result } = renderHook(() => useLogViewerState({ surface: 'task', taskId: 't2' }));
    act(() => result.current.toggleCategory('debug'));
    expect(result.current.categories.has('debug')).toBe(true);
    expect(result.current.hasActiveFilter).toBe(true);
    act(() => result.current.reset());
    expect(result.current.categories.has('debug')).toBe(false);
    expect(result.current.hasActiveFilter).toBe(false);
  });

  test('migrates the legacy task feed once (TOOLS -> tools only)', () => {
    clearStorage();
    window.localStorage.setItem('kainbain:taskLogs:t9:feed', JSON.stringify('TOOLS'));
    const { result } = renderHook(() => useLogViewerState({ surface: 'task', taskId: 't9' }));
    expect(result.current.categories).toEqual(new Set(['tools']));
  });

  test('migrates the legacy board tag once (ERROR -> errors only)', () => {
    clearStorage();
    window.localStorage.setItem('kainbain:board:logTag', JSON.stringify('ERROR'));
    const { result } = renderHook(() => useLogViewerState({ surface: 'activity' }));
    expect(result.current.categories).toEqual(new Set(['error']));
  });

  test('stored unified categories win over legacy keys', () => {
    clearStorage();
    window.localStorage.setItem('kainbain:taskLogs:t8:feed', JSON.stringify('TOOLS'));
    window.localStorage.setItem(
      'kainbain:logViewer:task:t8:categories',
      JSON.stringify(['output', 'ci']),
    );
    const { result } = renderHook(() => useLogViewerState({ surface: 'task', taskId: 't8' }));
    expect(result.current.categories).toEqual(new Set(['output', 'ci']));
  });

  test('migrates legacy search text for activity and task surfaces', () => {
    clearStorage();
    window.localStorage.setItem('kainbain:board:logSearch', JSON.stringify('timeout'));
    const activity = renderHook(() => useLogViewerState({ surface: 'activity' }));
    expect(activity.result.current.search).toBe('timeout');
    activity.unmount();
    clearStorage();
    window.localStorage.setItem('kainbain:taskLogs:t7:search', JSON.stringify('legacy-query'));
    const task = renderHook(() => useLogViewerState({ surface: 'task', taskId: 't7' }));
    expect(task.result.current.search).toBe('legacy-query');
  });

  test('per-task keys never bleed across tasks', () => {
    clearStorage();
    const first = renderHook(() => useLogViewerState({ surface: 'task', taskId: 'ta' }));
    act(() => first.result.current.setSearch('task-a-only'));
    first.unmount();
    const second = renderHook(() => useLogViewerState({ surface: 'task', taskId: 'tb' }));
    expect(second.result.current.search).toBe('');
  });
});
