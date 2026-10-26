import { useMemo } from 'react';
import { filterActiveWorkflowTasks } from '../nodeModel';
import { computeStageAnalytics } from '../stageAnalytics';

/***
 * MARK: useCanvasAnalytics
 * @description Analytics seam extracted from WorkflowCanvas: active workflow
 *   tasks, stage analytics, completed count, and activity flag.
 * @example const analytics = useCanvasAnalytics({ tasks, stages, activeWfId, activeWorkflow, messages, toolCalls, processLogs, isAgentRunning });
 ***/
export function useCanvasAnalytics({
  tasks = [],
  stages = [],
  activeWfId,
  activeWorkflow,
  messages = [],
  toolCalls = [],
  processLogs = [],
  isAgentRunning = false,
} = {}) {
  const activeWorkflowTasks = useMemo(
    () => filterActiveWorkflowTasks(tasks, activeWfId, activeWorkflow),
    [tasks, activeWfId, activeWorkflow],
  );

  const stageAnalytics = useMemo(
    () => computeStageAnalytics(stages, activeWorkflowTasks),
    [stages, activeWorkflowTasks],
  );

  const completedCount = activeWorkflowTasks.filter((t) => t.status === 'completed').length;

  const hasActivity =
    messages.length > 0 || toolCalls.length > 0 || processLogs.length > 0 || isAgentRunning;

  return {
    activeWorkflowTasks,
    stageAnalytics,
    completedCount,
    hasActivity,
  };
}
