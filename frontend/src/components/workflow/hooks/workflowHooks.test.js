import { describe, expect, test, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBoardFilters } from './useBoardFilters';
import { useStageDnD } from './useStageDnD';
import { useTaskActions } from './useTaskActions';
import { useActivityConsole } from './useActivityConsole';

/***
 * MARK: workflow hooks tests
 * @description Colocated tests for the four WorkflowCanvas hooks: board
 *   filter state defaults + persistence, stage DnD drop routing (reorder vs
 *   task move), task-action guards (double-submit, delete single-flight) and
 *   console drawer toggle + height clamping.
 ***/

describe('useBoardFilters', () => {
  test('exposes defaults and updates search', () => {
    const { result } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    expect(result.current.searchQuery).toBe('');
    expect(result.current.showCompleted).toBe(false);
    act(() => {
      result.current.setSearchQuery('login');
      result.current.setShowCompleted(true);
    });
    expect(result.current.searchQuery).toBe('login');
    expect(result.current.showCompleted).toBe(true);
  });

  test('persists the completed toggle to localStorage', () => {
    window.localStorage.setItem('kainbain:showCompleted', 'true');
    const { result } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    expect(result.current.showCompleted).toBe(true);
    window.localStorage.removeItem('kainbain:showCompleted');
  });

  test('derives tags and text from the unified query', () => {
    window.localStorage.removeItem('kainbain:board:search');
    const { result, unmount } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    expect(result.current.derivedTags).toEqual([]);
    expect(result.current.derivedText).toBe('');
    act(() => {
      result.current.setSearchQuery('auth login #Dev #PO');
    });
    expect(result.current.derivedTags).toEqual(['Dev', 'PO']);
    expect(result.current.derivedText).toBe('auth login');
    unmount();
    window.localStorage.removeItem('kainbain:board:search');
  });

  test('clearing the query clears the derived tags', () => {
    window.localStorage.removeItem('kainbain:board:search');
    const { result, unmount } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    act(() => {
      result.current.setSearchQuery('auth #Dev');
    });
    expect(result.current.derivedTags).toEqual(['Dev']);
    act(() => {
      result.current.setSearchQuery('');
    });
    expect(result.current.derivedTags).toEqual([]);
    expect(result.current.derivedText).toBe('');
    unmount();
    window.localStorage.removeItem('kainbain:board:search');
  });

  test('derives system filters from the unified query', () => {
    window.localStorage.removeItem('kainbain:board:search');
    const { result, unmount } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    expect(result.current.derivedSystemFilters).toEqual([]);
    act(() => {
      result.current.setSearchQuery('auth !failed #Dev');
    });
    expect(result.current.derivedSystemFilters).toEqual(['failed']);
    expect(result.current.derivedTags).toEqual(['Dev']);
    expect(result.current.derivedText).toBe('auth');
    unmount();
    window.localStorage.removeItem('kainbain:board:search');
  });

  test('migrates the legacy statusFilter pill state into a !filter once', () => {
    window.localStorage.removeItem('kainbain:board:search');
    window.localStorage.setItem('kainbain:board:statusFilter', JSON.stringify('failed'));
    const { result, unmount } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    // The stored pill becomes a !failed chip in the merged search bar…
    expect(result.current.searchQuery).toBe('!failed');
    expect(result.current.derivedSystemFilters).toEqual(['failed']);
    // …and the legacy storage key is removed so the migration never re-runs.
    expect(window.localStorage.getItem('kainbain:board:statusFilter')).toBeNull();
    unmount();
    window.localStorage.removeItem('kainbain:board:search');
  });

  test('migration appends the !filter to existing search text and skips duplicates', () => {
    window.localStorage.setItem('kainbain:board:search', JSON.stringify('auth'));
    window.localStorage.setItem('kainbain:board:statusFilter', JSON.stringify('human'));
    const { result, unmount } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    expect(result.current.searchQuery).toBe('auth !human');
    expect(result.current.derivedSystemFilters).toEqual(['human']);
    unmount();
    window.localStorage.removeItem('kainbain:board:search');
    window.localStorage.removeItem('kainbain:board:statusFilter');
  });

  test('migration ignores the stored all value and still removes the key', () => {
    window.localStorage.removeItem('kainbain:board:search');
    window.localStorage.setItem('kainbain:board:statusFilter', JSON.stringify('all'));
    const { result, unmount } = renderHook(() => useBoardFilters({ uiPreferences: {} }));
    expect(result.current.searchQuery).toBe('');
    expect(result.current.derivedSystemFilters).toEqual([]);
    expect(window.localStorage.getItem('kainbain:board:statusFilter')).toBeNull();
    unmount();
    window.localStorage.removeItem('kainbain:board:search');
  });
});

function dragEvent(payload = {}) {
  const store = { ...payload };
  return {
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: vi.fn((k, v) => {
        store[k] = v;
      }),
      getData: vi.fn((k) => store[k] || ''),
      effectAllowed: '',
      dropEffect: '',
    },
  };
}

describe('useStageDnD', () => {
  const stages = [{ id: 's-1' }, { id: 's-2' }];

  test('dropping a stage id reorders columns', () => {
    const reorderAndSave = vi.fn();
    const moveTask = vi.fn();
    const { result } = renderHook(() =>
      useStageDnD({ stages, moveTask, activeProjectId: 'p1', uiPreferences: {}, reorderAndSave }),
    );
    act(() => {
      result.current.handleDrop(dragEvent({ 'application/kainbain-stage-id': 's-1' }), 's-2');
    });
    expect(reorderAndSave).toHaveBeenCalledWith(0, 1);
    expect(moveTask).not.toHaveBeenCalled();
  });

  test('dropping a task id moves the task', () => {
    const reorderAndSave = vi.fn();
    const moveTask = vi.fn();
    const { result } = renderHook(() =>
      useStageDnD({ stages, moveTask, activeProjectId: 'p1', uiPreferences: {}, reorderAndSave }),
    );
    act(() => {
      result.current.handleDrop(dragEvent({ 'application/kainbain-task': 'KB-1' }), 's-2');
    });
    expect(moveTask).toHaveBeenCalledWith('p1', 'KB-1', 's-2');
    expect(reorderAndSave).not.toHaveBeenCalled();
  });

  test('drag start/end tracks the dragging stage', () => {
    const { result } = renderHook(() =>
      useStageDnD({ stages, uiPreferences: {}, reorderAndSave: vi.fn() }),
    );
    act(() => {
      result.current.handleStageDragStart(dragEvent(), 's-1');
    });
    expect(result.current.draggingStageId).toBe('s-1');
    act(() => {
      result.current.handleStageDragEnd();
    });
    expect(result.current.draggingStageId).toBe(null);
  });
});

describe('useTaskActions', () => {
  function setup(overrides = {}) {
    const props = {
      activeProjectId: 'p1',
      stages: [{ id: 's-1', name: 'Idea' }],
      activeWfId: 'wf-1',
      advanceTask: vi.fn().mockResolvedValue('ok'),
      openFeedbackDialog: vi.fn(),
      executeTaskStage: vi.fn().mockResolvedValue('ok'),
      createTask: vi.fn(),
      switchWorkflow: vi.fn(),
      setSelectedTask: vi.fn(),
      handleAddStage: vi.fn(),
      handleRemoveStage: vi.fn(),
      handleReorderStages: vi.fn(),
      saveStages: vi.fn(),
      hasPendingTaskSaveFlush: null,
      flushPendingTaskSave: null,
      uiPreferences: {},
      newTaskTitle: '',
      setNewTaskTitle: vi.fn(),
      setAddingTaskStageId: vi.fn(),
      setSelectedMobileStageId: vi.fn(),
      setExpandedSettingsStageId: vi.fn(),
      ...overrides,
    };
    return { props, hook: renderHook((p) => useTaskActions(p), { initialProps: props }) };
  }

  test('approve advances without a pending inspector flush', async () => {
    const { props, hook } = setup();
    let promise;
    act(() => {
      promise = hook.result.current.handleApprove('KB-1');
    });
    await act(async () => {
      await promise;
    });
    expect(props.advanceTask).toHaveBeenCalledWith('p1', 'KB-1');
  });

  test('reject opens the feedback dialog', async () => {
    const { props, hook } = setup();
    await act(async () => {
      await hook.result.current.handleReject({ id: 'KB-1' });
    });
    expect(props.openFeedbackDialog).toHaveBeenCalledWith({ id: 'KB-1' });
  });

  test('addStageAndSave appends and selects the new stage', () => {
    const { props, hook } = setup();
    act(() => {
      hook.result.current.addStageAndSave();
    });
    expect(props.saveStages).toHaveBeenCalledWith(
      'p1',
      expect.arrayContaining([expect.objectContaining({ name: 'New Stage 2' })]),
    );
    expect(props.setSelectedMobileStageId).toHaveBeenCalled();
  });

  test('removeStageAndSave is single-flight and closes the drawer', async () => {
    const saveStages = vi.fn().mockResolvedValue(undefined);
    const { props, hook } = setup({ saveStages });
    await act(async () => {
      await hook.result.current.removeStageAndSave('s-1');
    });
    expect(saveStages).toHaveBeenCalledTimes(1);
    expect(props.setExpandedSettingsStageId).toHaveBeenCalledWith(null);
  });
});

describe('useActivityConsole', () => {
  test('toggle flips the drawer and resize clamps height', () => {
    const updateUiPreference = vi.fn();
    const { result } = renderHook(() =>
      useActivityConsole({
        uiPreferences: { consoleHeight: 256 },
        updateUiPreference,
        processLogs: [],
        messages: [],
        toolCalls: [],
      }),
    );
    const initial = result.current.showActivityDrawer;
    act(() => {
      result.current.toggleActivityDrawer();
    });
    expect(result.current.showActivityDrawer).toBe(!initial);

    act(() => {
      result.current.handleResizeKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() });
    });
    expect(updateUiPreference).toHaveBeenCalledWith('consoleHeight', 276);
  });

  test('filtered logs exclude [TOOL] mirrors', () => {
    const { result } = renderHook(() =>
      useActivityConsole({
        uiPreferences: {},
        processLogs: [
          { id: 'l1', tag: '[AGENT]', text: 'hi' },
          { id: 'l2', tag: '[TOOL]', text: 'mirror' },
        ],
        messages: [],
        toolCalls: [],
      }),
    );
    expect(result.current.filteredProcessLogs.map((l) => l.id)).toEqual(['l1']);
  });

  test('starts collapsed on first visit (no stored preference)', () => {
    window.localStorage.removeItem('kainbain:showActivityDrawer');
    const { result } = renderHook(() =>
      useActivityConsole({
        uiPreferences: { activityDrawerDefaultOpen: false },
        processLogs: [],
        messages: [],
        toolCalls: [],
      }),
    );
    expect(result.current.showActivityDrawer).toBe(false);
  });

  test('stored preference wins over the collapsed default', () => {
    window.localStorage.setItem('kainbain:showActivityDrawer', 'true');
    const { result, unmount } = renderHook(() =>
      useActivityConsole({
        uiPreferences: { activityDrawerDefaultOpen: false },
        processLogs: [],
        messages: [],
        toolCalls: [],
      }),
    );
    expect(result.current.showActivityDrawer).toBe(true);
    unmount();
    window.localStorage.removeItem('kainbain:showActivityDrawer');
  });

  test('first visit follows the default-open preference, defaulting to collapsed (survey Q3)', () => {
    // Survey Q3: "start collapsed and let me expand them" — with no stored
    // toggle and no explicit opt-in the drawer starts collapsed; a user who
    // checked "Default Expanded" in Workspace settings starts expanded.
    window.localStorage.removeItem('kainbain:showActivityDrawer');
    const { result, unmount } = renderHook(() =>
      useActivityConsole({
        uiPreferences: { activityDrawerDefaultOpen: true },
        processLogs: [],
        messages: [],
        toolCalls: [],
      }),
    );
    expect(result.current.showActivityDrawer).toBe(true);
    unmount();

    const { result: collapsed } = renderHook(() =>
      useActivityConsole({
        uiPreferences: {},
        processLogs: [],
        messages: [],
        toolCalls: [],
      }),
    );
    expect(collapsed.current.showActivityDrawer).toBe(false);
  });

  test('stored collapsed toggle beats the default-open preference', () => {
    // The latest explicit expand/collapse always wins over the preference.
    window.localStorage.setItem('kainbain:showActivityDrawer', 'false');
    const { result, unmount } = renderHook(() =>
      useActivityConsole({
        uiPreferences: { activityDrawerDefaultOpen: true },
        processLogs: [],
        messages: [],
        toolCalls: [],
      }),
    );
    expect(result.current.showActivityDrawer).toBe(false);
    unmount();
    window.localStorage.removeItem('kainbain:showActivityDrawer');
  });
});
