import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTaskSubmission } from './useTaskSubmission';

vi.mock('../services/api', () => ({
  api: {
    followUp: vi.fn(),
    steer: vi.fn(),
    previewTask: vi.fn(),
    submitTask: vi.fn(),
    startWorkflow: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

function setup(overrides = {}) {
  const notify = { notifySuccess: vi.fn(), notifyInfo: vi.fn(), notifyError: vi.fn() };
  const props = {
    isAgentRunning: false,
    currentStageId: 'stage-1',
    activeWorkflowId: 'wf-1',
    setMessages: vi.fn(),
    setToolCalls: vi.fn(),
    fetchTasks: vi.fn(),
    fetchWorkflowList: vi.fn().mockResolvedValue([]),
    ...notify,
    ...overrides,
  };
  return { props, notify };
}

/***
 * MARK: useTaskSubmission tests
 * @description Pins the orchestrator input-bar flows after the provider
 * extraction: idle submit previews, confirm dispatches, workflow start runs.
 ***/
describe('useTaskSubmission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('idle submitTask previews instead of dispatching', async () => {
    api.previewTask.mockResolvedValue({ curatedPrompt: 'do X', stageId: 'stage-1' });
    const { props } = setup();
    const { result } = renderHook(() => useTaskSubmission(props));
    act(() => {
      result.current.setNewTaskGoal('do X');
    });
    await act(async () => {
      await result.current.submitTask('proj-1');
    });
    expect(api.previewTask).toHaveBeenCalledWith('proj-1', 'do X', 'stage-1');
    expect(api.submitTask).not.toHaveBeenCalled();
    expect(result.current.previewPrompt).toEqual({
      goal: 'do X',
      curatedPrompt: 'do X',
      stageId: 'stage-1',
    });
  });

  it('running submitTask steers and clears the goal', async () => {
    const { props, notify } = setup({ isAgentRunning: true });
    const { result } = renderHook(() => useTaskSubmission(props));
    act(() => {
      result.current.setNewTaskGoal('faster');
    });
    await act(async () => {
      await result.current.submitTask('proj-1');
    });
    expect(api.steer).toHaveBeenCalledWith('proj-1', 'faster');
    expect(notify.notifyInfo).toHaveBeenCalledWith('Steering guidance sent to agent', 'Steered');
    expect(result.current.newTaskGoal).toBe('');
  });

  it('confirmSubmitTask dispatches with the workflow id and refreshes', async () => {
    api.submitTask.mockResolvedValue({});
    const { props, notify } = setup();
    const { result } = renderHook(() => useTaskSubmission(props));
    act(() => {
      result.current.setNewTaskGoal('goal-1');
    });
    await act(async () => {
      await result.current.confirmSubmitTask('proj-1');
    });
    expect(api.submitTask).toHaveBeenCalledWith('proj-1', 'goal-1', false, 'stage-1', 'wf-1');
    expect(props.fetchTasks).toHaveBeenCalledWith('proj-1');
    expect(notify.notifySuccess).toHaveBeenCalled();
  });

  it('startWorkflow starts, clears, and refreshes the list', async () => {
    api.startWorkflow.mockResolvedValue({});
    const { props, notify } = setup();
    const { result } = renderHook(() => useTaskSubmission(props));
    act(() => {
      result.current.setWorkflowId('wf-9');
    });
    await act(async () => {
      await result.current.startWorkflow('proj-1');
    });
    expect(api.startWorkflow).toHaveBeenCalledWith('proj-1', 'wf-9');
    expect(result.current.workflowId).toBe('');
    expect(props.fetchWorkflowList).toHaveBeenCalledWith('proj-1');
    expect(notify.notifySuccess).toHaveBeenCalledWith(
      'Pipeline execution started',
      'Workflow Started',
    );
  });
});
