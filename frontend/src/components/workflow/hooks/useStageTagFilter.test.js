import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStageTagFilter } from './useStageTagFilter';
import {
  STAGE_TAG_FILTER_STORAGE_KEY,
  STAGE_TAG_FILTER_MODE_STORAGE_KEY,
} from '../stageTagFilter';

/***
 * MARK: useStageTagFilter tests
 * @description Colocated tests for the board tag-filter state hook:
 *   URL-first hydration (`?tags=` / `?tagMode=` win over localStorage),
 *   localStorage fallback, and mutation sync into both localStorage and the
 *   URL query string (shareable view).
 ***/

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('useStageTagFilter', () => {
  test('defaults to no selection and any-mode', () => {
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual([]);
    expect(result.current.stageTagFilterMode).toBe('any');
  });

  test('hydrates the selection from the URL query string', () => {
    window.history.replaceState(null, '', '/?tags=PO,Dev');
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual(['PO', 'Dev']);
    expect(result.current.stageTagFilterMode).toBe('any');
  });

  test('hydrates a non-default mode from the URL', () => {
    window.history.replaceState(null, '', '/?tags=PO,Dev&tagMode=all');
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual(['PO', 'Dev']);
    expect(result.current.stageTagFilterMode).toBe('all');
  });

  test('URL wins over localStorage when ?tags= is present', () => {
    window.localStorage.setItem(STAGE_TAG_FILTER_STORAGE_KEY, JSON.stringify(['QA']));
    window.localStorage.setItem(STAGE_TAG_FILTER_MODE_STORAGE_KEY, 'all');
    window.history.replaceState(null, '', '/?tags=PO');
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual(['PO']);
    // No tagMode in the URL: falls back to the stored/default mode.
    expect(['any', 'all']).toContain(result.current.stageTagFilterMode);
  });

  test('falls back to localStorage when the URL has no tags param', () => {
    window.localStorage.setItem(STAGE_TAG_FILTER_STORAGE_KEY, JSON.stringify(['QA', 'Dev']));
    window.localStorage.setItem(STAGE_TAG_FILTER_MODE_STORAGE_KEY, 'all');
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual(['QA', 'Dev']);
    expect(result.current.stageTagFilterMode).toBe('all');
  });

  test('corrupt localStorage payloads degrade to defaults', () => {
    window.localStorage.setItem(STAGE_TAG_FILTER_STORAGE_KEY, '{not json');
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual([]);
  });

  test('setSelectedStageTags normalises, persists to localStorage and writes the URL', () => {
    const { result } = renderHook(() => useStageTagFilter());
    act(() => {
      result.current.setSelectedStageTags([' PO ', 'po', 'Dev']);
    });
    expect(result.current.selectedStageTags).toEqual(['PO', 'Dev']);
    expect(JSON.parse(window.localStorage.getItem(STAGE_TAG_FILTER_STORAGE_KEY))).toEqual([
      'PO',
      'Dev',
    ]);
    expect(window.location.search).toContain('tags=PO%2CDev');
  });

  test('clearing the selection removes the URL params and the storage key', () => {
    window.history.replaceState(null, '', '/?tags=PO');
    const { result } = renderHook(() => useStageTagFilter());
    expect(result.current.selectedStageTags).toEqual(['PO']);
    act(() => {
      result.current.setSelectedStageTags([]);
    });
    expect(result.current.selectedStageTags).toEqual([]);
    expect(window.location.search).not.toContain('tags=');
    expect(window.localStorage.getItem(STAGE_TAG_FILTER_STORAGE_KEY)).toBeNull();
  });

  test('setStageTagFilterMode writes tagMode only when non-default', () => {
    const { result } = renderHook(() => useStageTagFilter());
    act(() => {
      result.current.setSelectedStageTags(['PO']);
    });
    expect(window.location.search).not.toContain('tagMode=');
    act(() => {
      result.current.setStageTagFilterMode('all');
    });
    expect(result.current.stageTagFilterMode).toBe('all');
    expect(window.location.search).toContain('tagMode=all');
    expect(window.localStorage.getItem(STAGE_TAG_FILTER_MODE_STORAGE_KEY)).toBe('all');
    act(() => {
      result.current.setStageTagFilterMode('any');
    });
    expect(window.location.search).not.toContain('tagMode=');
  });

  test('mode changes keep the current selection in the URL', () => {
    const { result } = renderHook(() => useStageTagFilter());
    act(() => {
      result.current.setSelectedStageTags(['PO', 'Dev']);
    });
    act(() => {
      result.current.setStageTagFilterMode('all');
    });
    expect(window.location.search).toContain('tags=PO%2CDev');
    expect(window.location.search).toContain('tagMode=all');
  });

  test('unknown mode values read as any', () => {
    const { result } = renderHook(() => useStageTagFilter());
    act(() => {
      result.current.setStageTagFilterMode('bogus');
    });
    expect(result.current.stageTagFilterMode).toBe('any');
  });
});
