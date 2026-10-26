import { describe, expect, test } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCanvasAnalytics } from './useCanvasAnalytics';

describe('useCanvasAnalytics', () => {
  test('empty tasks -> zero active, zero completed', () => {
    const { result } = renderHook(() =>
      useCanvasAnalytics({ tasks: [], stages: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    expect(result.current.activeWorkflowTasks).toEqual([]);
    expect(result.current.completedCount).toBe(0);
  });

  test('completed counting', () => {
    const tasks = [
      { id: 't1', status: 'completed', workflowId: 'wf-1' },
      { id: 't2', status: 'pending', workflowId: 'wf-1' },
    ];
    const { result } = renderHook(() =>
      useCanvasAnalytics({ tasks, stages: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } }),
    );
    expect(result.current.completedCount).toBe(1);
    expect(result.current.activeWorkflowTasks).toHaveLength(2);
  });

  test('hasActivity truth table', () => {
    const base = { tasks: [], stages: [], activeWfId: 'wf-1', activeWorkflow: { id: 'wf-1' } };
    const r0 = renderHook(() => useCanvasAnalytics(base)).result.current.hasActivity;
    expect(r0).toBe(false);

    const rMsg = renderHook(() => useCanvasAnalytics({ ...base, messages: [{ id: 1 }] })).result.current.hasActivity;
    expect(rMsg).toBe(true);

    const rTool = renderHook(() => useCanvasAnalytics({ ...base, toolCalls: [{ id: 1 }] })).result.current.hasActivity;
    expect(rTool).toBe(true);

    const rLog = renderHook(() => useCanvasAnalytics({ ...base, processLogs: ['x'] })).result.current.hasActivity;
    expect(rLog).toBe(true);

    const rRun = renderHook(() => useCanvasAnalytics({ ...base, isAgentRunning: true })).result.current.hasActivity;
    expect(rRun).toBe(true);
  });
});
