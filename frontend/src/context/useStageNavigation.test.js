import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStageNavigation } from './useStageNavigation';

function setup(overrides = {}) {
  const tasks = {
    tasks: [
      { id: 't1', currentStageId: 's1', status: 'running' },
      { id: 't2', currentStageId: 's2', status: 'queued' },
    ],
    advanceTask: vi.fn(),
    ...overrides.tasks,
  };
  const workflow = {
    stages: [{ id: 's1' }, { id: 's2' }, { id: 's3' }],
    currentStageId: 's2',
    skipStage: vi.fn(),
    ...overrides.workflow,
  };
  const engineState = { activeTaskId: null, ...overrides.engineState };
  const { result } = renderHook(() => useStageNavigation({ tasks, workflow, engineState }));
  return { result, tasks, workflow };
}

/***
 * MARK: useStageNavigation tests
 * @description Pins stage-viewport focus moves and engine-owner skip routing
 * after the provider extraction.
 ***/
describe('useStageNavigation', () => {
  it('defaults focus to the current stage and moves left/right', () => {
    const { result } = setup();
    expect(result.current.focusedStageId).toBe('s2');
    act(() => {
      result.current.lookBack();
    });
    expect(result.current.focusedStageId).toBe('s1');
    act(() => {
      result.current.lookForward();
    });
    expect(result.current.focusedStageId).toBe('s2');
  });

  it('jumpToActive resets focus to the executing stage', () => {
    const { result } = setup();
    act(() => {
      result.current.lookForward();
    });
    expect(result.current.focusedStageId).toBe('s3');
    act(() => {
      result.current.jumpToActive();
    });
    expect(result.current.focusedStageId).toBe('s2');
  });

  it('skipCurrent advances the engine owner task when named', async () => {
    const { result, tasks, workflow } = setup({ engineState: { activeTaskId: 't2' } });
    await act(async () => {
      await result.current.skipCurrent('proj-1');
    });
    expect(tasks.advanceTask).toHaveBeenCalledWith('proj-1', 't2');
    expect(workflow.skipStage).not.toHaveBeenCalled();
  });

  it('skipCurrent falls back to the stage pointer with no owner', async () => {
    const { result, tasks, workflow } = setup();
    await act(async () => {
      await result.current.skipCurrent('proj-1');
    });
    // t2 sits on the current stage (s2) and is not completed.
    expect(tasks.advanceTask).toHaveBeenCalledWith('proj-1', 't2');
    expect(workflow.skipStage).not.toHaveBeenCalled();
  });

  it('skipCurrent advances the off-list owner in its owning project after a switch', async () => {
    // Project B is selected (its tasks are loaded) but the engine owner lives
    // in project A: Skip must act on the owner in A, never the selection.
    const tasks = {
      tasks: [{ id: 't-b1', currentStageId: 's1', status: 'in_stage', projectId: 'proj-B' }],
      advanceTask: vi.fn(),
    };
    const workflow = { stages: [{ id: 's1' }], currentStageId: 's1', skipStage: vi.fn() };
    const engineState = {
      status: 'running',
      activeTaskId: 't-a1',
      activeProjectId: 'proj-A',
      activeTask: { id: 't-a1', projectId: 'proj-A', status: 'running_agent' },
    };
    const { result } = renderHook(() => useStageNavigation({ tasks, workflow, engineState }));
    await act(async () => {
      await result.current.skipCurrent('proj-B');
    });
    expect(tasks.advanceTask).toHaveBeenCalledWith('proj-A', 't-a1');
    expect(workflow.skipStage).not.toHaveBeenCalled();
  });

  it('skipCurrent resolves the owner project from engine state when the task omits it', async () => {
    const tasks = {
      tasks: [{ id: 't-a1', currentStageId: 's1', status: 'running' }],
      advanceTask: vi.fn(),
    };
    const workflow = { stages: [{ id: 's1' }], currentStageId: 's1', skipStage: vi.fn() };
    const engineState = { activeTaskId: 't-a1', activeProjectId: 'proj-A' };
    const { result } = renderHook(() => useStageNavigation({ tasks, workflow, engineState }));
    await act(async () => {
      await result.current.skipCurrent('proj-B');
    });
    expect(tasks.advanceTask).toHaveBeenCalledWith('proj-A', 't-a1');
  });

  it('skipCurrent skips the stage when no task is active', async () => {
    const { result, tasks, workflow } = setup({
      tasks: { tasks: [{ id: 't9', currentStageId: 's1', status: 'completed' }] },
    });
    await act(async () => {
      await result.current.skipCurrent('proj-1');
    });
    expect(tasks.advanceTask).not.toHaveBeenCalled();
    expect(workflow.skipStage).toHaveBeenCalledWith('proj-1');
  });
});
