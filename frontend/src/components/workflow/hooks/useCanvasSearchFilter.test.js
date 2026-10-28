import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCanvasSearchFilter } from './useCanvasSearchFilter';

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('useCanvasSearchFilter', () => {
  test('hydration merges URL tags and removes legacy storage key', () => {
    window.localStorage.setItem('kainbain:board:stageTagFilter', JSON.stringify(['QA']));
    window.history.replaceState(null, '', '/?tags=PO');
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages: [],
        tasks: [],
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
      }),
    );
    expect(result.current.searchQuery).toContain('#PO');
    expect(window.localStorage.getItem('kainbain:board:stageTagFilter')).toBeNull();
  });

  test('URL sync skips initial mount then writes on change', () => {
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages: [],
        tasks: [],
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
      }),
    );
    expect(window.location.search).not.toContain('tags=');
    act(() => {
      result.current.setSearchQuery('auth #Dev');
    });
    expect(window.location.search).toContain('tags=Dev');
  });

  test('clearTagFilter keeps free text', () => {
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages: [],
        tasks: [],
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
      }),
    );
    act(() => {
      result.current.setSearchQuery('auth #Dev');
    });
    act(() => {
      result.current.clearTagFilter();
    });
    expect(result.current.searchQuery).toBe('auth');
  });

  test('pipeline switch resets selection state but keeps query', () => {
    const stages = [{ id: 's1', name: 'Idea', tags: ['PO'] }];
    const { result, rerender } = renderHook((props) => useCanvasSearchFilter(props), {
      initialProps: {
        stages,
        tasks: [],
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
        currentStageId: null,
        uiPreferences: {},
      },
    });
    act(() => {
      result.current.setSearchQuery('auth #Dev');
    });
    act(() => {
      result.current.setSelectedMobileStageId('s1');
    });
    act(() => {
      result.current.setAddingTaskStageId('s1');
    });
    rerender({
      stages,
      tasks: [],
      activeWfId: 'wf-2',
      activeWorkflow: { id: 'wf-2' },
      currentStageId: null,
      uiPreferences: {},
    });
    expect(result.current.selectedMobileStageId).toBeNull();
    expect(result.current.addingTaskStageId).toBeNull();
    expect(result.current.searchQuery).toContain('auth');
  });

  test('tagRenderEntries collapses non-matching stages', () => {
    const stages = [
      { id: 's1', name: 'Idea', tags: ['PO'] },
      { id: 's2', name: 'Build', tags: ['Dev'] },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages,
        tasks: [],
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
      }),
    );
    act(() => {
      result.current.setSearchQuery('#PO');
    });
    expect(result.current.tagRenderEntries.some((e) => e.kind === 'collapsed')).toBe(true);
  });

  test('! system filters flow from the query into filteredTasks', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    const tasks = [
      {
        id: 'KB-1',
        goal: 'build login',
        status: 'failed',
        currentStageId: 's1',
        workflowId: 'wf-1',
      },
      {
        id: 'KB-2',
        goal: 'review auth',
        status: 'waiting_human',
        currentStageId: 's2',
        workflowId: 'wf-1',
      },
      {
        id: 'KB-3',
        goal: 'build search',
        status: 'active',
        currentStageId: 's1',
        workflowId: 'wf-1',
      },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks, activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    act(() => {
      result.current.setSearchQuery('!failed');
    });
    expect(result.current.systemFilters).toEqual(['failed']);
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-1']);
    act(() => {
      result.current.setSearchQuery('!human');
    });
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-2']);
    // Text ANDs with the system filter.
    act(() => {
      result.current.setSearchQuery('review !human');
    });
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-2']);
    act(() => {
      result.current.setSearchQuery('build !human');
    });
    expect(result.current.filteredTasks).toEqual([]);
  });

  test('URL tag hydration preserves committed ! system filters', () => {
    // Regression (task c213d3a9): hydrating ?tags= used to rebuild the query
    // without the systemFilters half, silently dropping !failed/!human.
    window.localStorage.setItem('kainbain:board:search', JSON.stringify('auth !failed'));
    window.history.replaceState(null, '', '/?tags=PO');
    const stages = [
      { id: 's1', name: 'Idea', tags: ['PO'] },
      { id: 's2', name: 'Build', tags: ['Dev'] },
    ];
    const tasks = [
      {
        id: 'KB-1',
        goal: 'auth login',
        status: 'failed',
        currentStageId: 's1',
        workflowId: 'wf-1',
      },
      { id: 'KB-2', goal: 'auth spec', status: 'active', currentStageId: 's1', workflowId: 'wf-1' },
      {
        id: 'KB-3',
        goal: 'auth build',
        status: 'failed',
        currentStageId: 's2',
        workflowId: 'wf-1',
      },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks, activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    expect(result.current.searchQuery).toContain('#PO');
    expect(result.current.searchQuery).toContain('!failed');
    expect(result.current.systemFilters).toEqual(['failed']);
    // #PO hides s2 (KB-3), !failed hides the active KB-2 — only KB-1 survives.
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-1']);
  });
});
