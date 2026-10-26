import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWorkflow } from './useWorkflow';

vi.mock('../services/api', () => ({
  api: {
    getWorkflow: vi.fn(),
    getWorkflows: vi.fn(),
    createProjectWorkflow: vi.fn(),
    switchProjectWorkflow: vi.fn(),
    updateProjectWorkflow: vi.fn(),
    deleteProjectWorkflow: vi.fn(),
    updateWorkflow: vi.fn(),
    jumpToStage: vi.fn(),
    skipStage: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { api } from '../services/api';

/***
 * MARK: useWorkflow tests
 * @description Verifies workflow stage state: fetch, stage editing (update /
 *   add / remove / reorder), saving, named workflow switching, creating, deleting,
 *   localStorage persistence, and the non-linear jump/skip controls.
 ***/
describe('useWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  const baseStages = [{ id: '1', name: 'Idea', type: 'agent' }];
  const baseWorkflows = [
    { id: 'wf-1', name: 'Feature Pipeline', isDefault: true, stages: baseStages },
    {
      id: 'wf-2',
      name: 'Hotfix Pipeline',
      isDefault: false,
      stages: [{ id: 'hf-1', name: 'Fix', type: 'agent' }],
    },
  ];

  it('fetchWorkflow stores stages, workflows and the active workflow pointer', async () => {
    api.getWorkflow.mockResolvedValue({
      stages: baseStages,
      currentStageId: '1',
      activeWorkflowId: 'wf-1',
      workflows: baseWorkflows,
    });
    const { result } = renderHook(() => useWorkflow());
    await act(async () => {
      await result.current.fetchWorkflow('proj-1');
    });
    expect(result.current.stages).toEqual(baseStages);
    expect(result.current.currentStageId).toBe('1');
    expect(result.current.activeWorkflowId).toBe('wf-1');
    expect(result.current.workflows).toEqual(baseWorkflows);
    expect(window.localStorage.getItem('kainbain:activeWorkflowId')).toBe('wf-1');
  });

  it('switchWorkflow switches active workflow, updates stages, and saves to localStorage', async () => {
    api.switchProjectWorkflow.mockResolvedValue({
      status: 'switched',
      activeWorkflowId: 'wf-2',
      stages: [{ id: 'hf-1', name: 'Fix', type: 'agent' }],
    });
    api.getWorkflow.mockResolvedValue({
      stages: [{ id: 'hf-1', name: 'Fix', type: 'agent' }],
      currentStageId: 'hf-1',
      activeWorkflowId: 'wf-2',
      workflows: baseWorkflows,
    });

    const { result } = renderHook(() => useWorkflow());
    await act(async () => {
      await result.current.switchWorkflow('proj-1', 'wf-2');
    });

    expect(api.switchProjectWorkflow).toHaveBeenCalledWith('proj-1', 'wf-2');
    expect(result.current.activeWorkflowId).toBe('wf-2');
    expect(result.current.stages[0].name).toBe('Fix');
    expect(window.localStorage.getItem('kainbain:activeWorkflowId')).toBe('wf-2');
  });

  it('createWorkflow calls api.createProjectWorkflow and refetches', async () => {
    api.createProjectWorkflow.mockResolvedValue({
      id: 'wf-3',
      name: 'CI Release',
      isDefault: false,
      stages: [],
    });
    api.getWorkflow.mockResolvedValue({
      stages: baseStages,
      currentStageId: '1',
      activeWorkflowId: 'wf-1',
      workflows: [...baseWorkflows, { id: 'wf-3', name: 'CI Release', stages: [] }],
    });

    const { result } = renderHook(() => useWorkflow());
    await act(async () => {
      await result.current.createWorkflow('proj-1', { name: 'CI Release' });
    });

    expect(api.createProjectWorkflow).toHaveBeenCalledWith('proj-1', {
      name: 'CI Release',
      stages: undefined,
      isDefault: false,
    });
    expect(api.getWorkflow).toHaveBeenCalledWith('proj-1');
  });

  it('deleteWorkflow calls api.deleteProjectWorkflow and refetches', async () => {
    api.deleteProjectWorkflow.mockResolvedValue({ status: 'deleted', workflowId: 'wf-2' });
    api.getWorkflow.mockResolvedValue({
      stages: baseStages,
      currentStageId: '1',
      activeWorkflowId: 'wf-1',
      workflows: [baseWorkflows[0]],
    });

    const { result } = renderHook(() => useWorkflow());
    await act(async () => {
      await result.current.deleteWorkflow('proj-1', 'wf-2');
    });

    expect(api.deleteProjectWorkflow).toHaveBeenCalledWith('proj-1', 'wf-2');
    expect(api.getWorkflow).toHaveBeenCalledWith('proj-1');
  });

  it('handleUpdateStage merges updates into a stage', () => {
    const { result } = renderHook(() => useWorkflow());
    act(() => {
      result.current.setStages(baseStages);
      result.current.handleUpdateStage('1', { paused: true });
    });
    expect(result.current.stages[0].paused).toBe(true);
  });

  it('handleUpdateStage normalises stage tags at the edit boundary', () => {
    const { result } = renderHook(() => useWorkflow());
    act(() => {
      result.current.setStages(baseStages);
      result.current.handleUpdateStage('1', { tags: [' PO ', 'po', 'Dev', ''] });
    });
    expect(result.current.stages[0].tags).toEqual(['PO', 'Dev']);
  });

  it('handleUpdateStage normalises a comma-string tags update to an array', () => {
    const { result } = renderHook(() => useWorkflow());
    act(() => {
      result.current.setStages(baseStages);
      result.current.handleUpdateStage('1', { tags: 'PO, Dev' });
    });
    expect(result.current.stages[0].tags).toEqual(['PO', 'Dev']);
  });

  it('saveStages applies a final tags normalisation pass before persisting', async () => {
    api.updateWorkflow.mockResolvedValue({});
    api.getWorkflow.mockResolvedValue({ stages: baseStages, currentStageId: '1' });
    const { result } = renderHook(() => useWorkflow());
    const dirty = [
      { id: '1', name: 'Idea', type: 'agent', tags: [' PO ', 'po', 'x'.repeat(30)] },
      { id: '2', name: 'Plan', type: 'agent' },
    ];
    await act(async () => {
      await result.current.saveStages('proj-1', dirty);
    });
    expect(api.updateWorkflow).toHaveBeenCalledWith('proj-1', [
      { id: '1', name: 'Idea', type: 'agent', tags: ['PO'] },
      { id: '2', name: 'Plan', type: 'agent' },
    ]);
  });

  it('handleAddStage appends a new stage', () => {
    const { result } = renderHook(() => useWorkflow());
    act(() => {
      result.current.setStages(baseStages);
      result.current.handleAddStage();
    });
    expect(result.current.stages).toHaveLength(2);
    expect(result.current.stages[1].type).toBe('agent');
  });

  it('handleRemoveStage removes a stage by id', () => {
    const { result } = renderHook(() => useWorkflow());
    act(() => {
      result.current.setStages([...baseStages, { id: '2', name: 'Plan', type: 'agent' }]);
      result.current.handleRemoveStage('2');
    });
    expect(result.current.stages).toHaveLength(1);
  });

  it('handleReorderStages moves a stage to a new index', () => {
    const { result } = renderHook(() => useWorkflow());
    act(() => {
      result.current.setStages([
        { id: '1', name: 'A', type: 'agent' },
        { id: '2', name: 'B', type: 'agent' },
        { id: '3', name: 'C', type: 'human' },
      ]);
      result.current.handleReorderStages(0, 2);
    });
    expect(result.current.stages.map((s) => s.id)).toEqual(['2', '3', '1']);
  });

  it('saveStages persists current stages without firing transition toast (#18)', async () => {
    api.updateWorkflow.mockResolvedValue({});
    api.getWorkflow.mockResolvedValue({ stages: baseStages, currentStageId: '1' });
    const onNotification = vi.fn();
    const { result } = renderHook(() => useWorkflow({ onNotification }));
    act(() => result.current.setStages(baseStages));
    await act(async () => {
      await result.current.saveStages('proj-1');
    });
    expect(api.updateWorkflow).toHaveBeenCalledWith('proj-1', baseStages);
    expect(onNotification).not.toHaveBeenCalled();
  });

  it('saveStages persists the exact array passed, not a stale closure (delete path)', async () => {
    // The delete path computes the post-delete array and passes it explicitly to
    // saveStages. This test locks in that saveStages persists the passed array
    // (the post-delete one) rather than the stale `stages` closure.
    api.updateWorkflow.mockResolvedValue({});
    api.getWorkflow.mockResolvedValue({ stages: baseStages, currentStageId: '1' });
    const { result } = renderHook(() => useWorkflow());
    act(() =>
      result.current.setStages([
        { id: '1', name: 'Idea', type: 'agent' },
        { id: '2', name: 'Plan', type: 'agent' },
      ]),
    );
    const postDelete = [{ id: '1', name: 'Idea', type: 'agent' }];
    await act(async () => {
      await result.current.saveStages('proj-1', postDelete);
    });
    expect(api.updateWorkflow).toHaveBeenCalledWith('proj-1', postDelete);
  });

  it('jumpToStage updates the current stage pointer', async () => {
    api.jumpToStage.mockResolvedValue({ currentStageId: '3' });
    const { result } = renderHook(() => useWorkflow());
    await act(async () => {
      await result.current.jumpToStage('proj-1', '3');
    });
    expect(api.jumpToStage).toHaveBeenCalledWith('proj-1', '3');
    expect(result.current.currentStageId).toBe('3');
  });

  it('skipStage advances the pipeline', async () => {
    api.skipStage.mockResolvedValue({ currentStageId: '2' });
    const { result } = renderHook(() => useWorkflow());
    await act(async () => {
      await result.current.skipStage('proj-1');
    });
    expect(api.skipStage).toHaveBeenCalledWith('proj-1');
    expect(result.current.currentStageId).toBe('2');
  });

  it('exposes isSwitching while a workflow switch is in flight', async () => {
    let resolveSwitch;
    api.switchProjectWorkflow.mockReturnValue(
      new Promise((resolve) => {
        resolveSwitch = resolve;
      }),
    );
    const { result } = renderHook(() => useWorkflow());
    expect(result.current.isSwitching).toBe(false);
    let switchPromise;
    act(() => {
      switchPromise = result.current.switchWorkflow('proj-1', 'wf-2');
    });
    expect(result.current.isSwitching).toBe(true);
    await act(async () => {
      resolveSwitch({ activeWorkflowId: 'wf-2' });
      await switchPromise;
    });
    expect(result.current.isSwitching).toBe(false);
  });

  it('exposes isLoading while the workflow fetch is in flight', async () => {
    let resolveFetch;
    api.getWorkflow.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const { result } = renderHook(() => useWorkflow());
    expect(result.current.isLoading).toBe(false);
    let fetchPromise;
    act(() => {
      fetchPromise = result.current.fetchWorkflow('proj-1');
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => {
      resolveFetch({ stages: [], currentStageId: null, workflows: [] });
      await fetchPromise;
    });
    expect(result.current.isLoading).toBe(false);
  });
});
