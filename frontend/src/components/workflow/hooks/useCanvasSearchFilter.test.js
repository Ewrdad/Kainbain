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
      useCanvasSearchFilter({ stages: [], tasks: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    expect(result.current.searchQuery).toContain('#PO');
    expect(window.localStorage.getItem('kainbain:board:stageTagFilter')).toBeNull();
  });

  test('URL sync skips initial mount then writes on change', () => {
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages: [], tasks: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    expect(window.location.search).not.toContain('tags=');
    act(() => {
      result.current.setSearchQuery('auth #Dev');
    });
    expect(window.location.search).toContain('tags=Dev');
  });

  test('clearTagFilter keeps free text', () => {
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages: [], tasks: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
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
    const { result, rerender } = renderHook(
      (props) => useCanvasSearchFilter(props),
      {
        initialProps: {
          stages,
          tasks: [],
          activeWfId: 'wf-1',
          activeWorkflow: { id: 'wf-1' },
          currentStageId: null,
          uiPreferences: {},
        },
      },
    );
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
      useCanvasSearchFilter({ stages, tasks: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
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
      { id: 'KB-1', goal: 'build login', status: 'failed', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-2', goal: 'review auth', status: 'waiting_human', currentStageId: 's2', workflowId: 'wf-1' },
      { id: 'KB-3', goal: 'build search', status: 'active', currentStageId: 's1', workflowId: 'wf-1' },
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

  test('!tasked hides columns without tasks and omits them (no collapsed rail)', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Empty', type: 'agent' },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'build login', status: 'active', currentStageId: 's1', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks, activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    act(() => {
      result.current.setSearchQuery('!tasked');
    });
    expect(result.current.systemFilters).toEqual(['tasked']);
    expect(result.current.activeColumnFilterIds).toEqual(['tasked']);
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1']);
    expect(result.current.hiddenStageCount).toBe(1);
    expect(result.current.tagRenderEntries.some((e) => e.kind === 'collapsed')).toBe(false);
    // !tasked never filters tasks — only columns.
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-1']);
    expect(result.current.allStagesHiddenByColumnFilters).toBe(false);
  });

  test('!running shows only the engine-owner column', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'build login', status: 'running_agent', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-2', goal: 'review auth', status: 'waiting_human', currentStageId: 's2', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages,
        tasks,
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
        engineState: { status: 'running', activeTaskId: 'KB-1' },
        isAgentRunning: true,
      }),
    );
    act(() => {
      result.current.setSearchQuery('!running');
    });
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1']);
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-1']);
    expect(result.current.hasActiveColumnFilters).toBe(true);
    expect(result.current.hasActiveTagFilter).toBe(false);
  });

  test('!running visibility flips live when engineState changes, tasks untouched', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'build login', status: 'running_agent', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-2', goal: 'review auth', status: 'running_agent', currentStageId: 's2', workflowId: 'wf-1' },
    ];
    const props = (activeTaskId) => ({
      stages,
      tasks,
      activeWfId: 'wf-1',
      activeWorkflow: { id: 'wf-1' },
      engineState: { status: 'running', activeTaskId },
      isAgentRunning: true,
    });
    const { result, rerender } = renderHook((p) => useCanvasSearchFilter(p), {
      initialProps: props('KB-1'),
    });
    act(() => {
      result.current.setSearchQuery('!running');
    });
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1']);
    // The engine lock moves to KB-2 with the very same tasks array: no refresh.
    rerender(props('KB-2'));
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s2']);
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-2']);
    // The engine goes idle: every column hides and the empty state arms.
    rerender({ ...props('KB-2'), engineState: { status: 'idle', activeTaskId: null }, isAgentRunning: false });
    expect(result.current.visibleStages).toEqual([]);
    expect(result.current.allStagesHiddenByColumnFilters).toBe(true);
  });

  test('!running follows a task that moves stage', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
    ];
    const tasksIn = (stageId) => [
      { id: 'KB-1', goal: 'build login', status: 'running_agent', currentStageId: stageId, workflowId: 'wf-1' },
    ];
    const props = (stageId) => ({
      stages,
      tasks: tasksIn(stageId),
      activeWfId: 'wf-1',
      activeWorkflow: { id: 'wf-1' },
      engineState: { status: 'running', activeTaskId: 'KB-1' },
      isAgentRunning: true,
    });
    const { result, rerender } = renderHook((p) => useCanvasSearchFilter(p), {
      initialProps: props('s1'),
    });
    act(() => {
      result.current.setSearchQuery('!running');
    });
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1']);
    rerender(props('s2'));
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s2']);
  });

  test('text ANDs with !running at the task level; columns still scope by running', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Idle', type: 'agent' },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'build login', status: 'running_agent', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-2', goal: 'idle note', status: 'active', currentStageId: 's2', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages,
        tasks,
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
        engineState: { status: 'running', activeTaskId: 'KB-1' },
        isAgentRunning: true,
      }),
    );
    act(() => {
      result.current.setSearchQuery('review !running');
    });
    // No running task matches "review": no tasks, but the running column stays.
    expect(result.current.filteredTasks).toEqual([]);
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1']);
    expect(result.current.allStagesHiddenByColumnFilters).toBe(false);
  });

  test('task-level !failed never hides columns', () => {
    const stages = [
      { id: 's1', name: 'Build', type: 'agent' },
      { id: 's2', name: 'Empty', type: 'agent' },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'build login', status: 'failed', currentStageId: 's1', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks, activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    act(() => {
      result.current.setSearchQuery('!failed');
    });
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(result.current.activeColumnFilterIds).toEqual([]);
    expect(result.current.allStagesHiddenByColumnFilters).toBe(false);
    expect(result.current.filteredTasks.map((t) => t.id)).toEqual(['KB-1']);
  });

  test('clearColumnFilters strips column !tokens and preserves text, tags, and task filters', () => {
    const stages = [{ id: 's1', name: 'Build', type: 'agent' }];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    act(() => {
      result.current.setSearchQuery('auth #Dev !failed !running !tasked');
    });
    act(() => {
      result.current.clearColumnFilters();
    });
    expect(result.current.searchQuery).toBe('auth #Dev !failed');
    expect(result.current.hasActiveColumnFilters).toBe(false);
  });

  test('clearStageVisibilityFilters strips tags and column !tokens but keeps text and task filters', () => {
    const stages = [{ id: 's1', name: 'Build', type: 'agent' }];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    act(() => {
      result.current.setSearchQuery('auth #Dev !failed !running');
    });
    act(() => {
      result.current.clearStageVisibilityFilters();
    });
    expect(result.current.searchQuery).toBe('auth !failed');
  });

  test('#tag and !running intersect; an emptied intersection arms the column empty state', () => {
    const stages = [
      { id: 's1', name: 'Idea', type: 'agent', tags: ['PO'] },
      { id: 's2', name: 'Build', type: 'agent', tags: ['Dev'] },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'build login', status: 'running_agent', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-2', goal: 'idle note', status: 'active', currentStageId: 's2', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({
        stages,
        tasks,
        activeWfId: 'wf-1',
        activeWorkflow: { id: 'wf-1' },
        engineState: { status: 'running', activeTaskId: 'KB-1' },
        isAgentRunning: true,
      }),
    );
    act(() => {
      result.current.setSearchQuery('#Dev !running');
    });
    // #Dev matches s2, !running matches s1 — the intersection is empty, but
    // neither dimension alone hides everything, so the TAG flag stays false.
    expect(result.current.visibleStages).toEqual([]);
    expect(result.current.allStagesHiddenByTags).toBe(false);
    expect(result.current.allStagesHiddenByColumnFilters).toBe(true);
  });

  test('[ASSUMPTION — survey Q2] !tasked hides completed-only columns while showCompleted is off', () => {
    const stages = [
      { id: 's1', name: 'Done', type: 'agent' },
      { id: 's2', name: 'Empty', type: 'agent' },
    ];
    const tasks = [
      { id: 'KB-1', goal: 'finished work', status: 'completed', currentStageId: 's1', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasSearchFilter({ stages, tasks, activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    expect(result.current.showCompleted).toBe(false);
    act(() => {
      result.current.setSearchQuery('!tasked');
    });
    // The completed task is hidden by the toggle, so s1 counts as empty.
    expect(result.current.visibleStages).toEqual([]);
    expect(result.current.allStagesHiddenByColumnFilters).toBe(true);
    act(() => {
      result.current.setShowCompleted(true);
    });
    expect(result.current.visibleStages.map((s) => s.id)).toEqual(['s1']);
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
      { id: 'KB-1', goal: 'auth login', status: 'failed', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-2', goal: 'auth spec', status: 'active', currentStageId: 's1', workflowId: 'wf-1' },
      { id: 'KB-3', goal: 'auth build', status: 'failed', currentStageId: 's2', workflowId: 'wf-1' },
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
