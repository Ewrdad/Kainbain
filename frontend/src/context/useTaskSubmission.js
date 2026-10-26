// Domain: context — task submission + workflow start (the orchestrator input bar).
// Owns goal/workflowId/follow-up/preview state and the dispatch actions.
import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { logger } from '../services/logger';
export function useTaskSubmission({
  isAgentRunning,
  currentStageId,
  activeWorkflowId,
  setMessages,
  setToolCalls,
  fetchTasks,
  fetchWorkflowList,
  notifySuccess,
  notifyInfo,
  notifyError,
}) {
  const [newTaskGoal, setNewTaskGoal] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [previewPrompt, setPreviewPrompt] = useState(null); // { goal, curatedPrompt, stageId }
  const isSubmittingRef = useRef(false);

  // ---- Workflow runs (list) ----
  const fetchWorkflows = useCallback(
    async (projectId) => {
      if (!projectId) return;
      try {
        await fetchWorkflowList(projectId);
      } catch (e) {
        logger.error('Failed to fetch workflows', e);
      }
    },
    [fetchWorkflowList],
  );

  // ---- Task submission ----
  const submitTask = useCallback(
    async (projectId, e) => {
      if (e) e.preventDefault();
      try {
        if (isAgentRunning) {
          if (isFollowUp) {
            await api.followUp(projectId, newTaskGoal);
            notifyInfo('Follow-up prompt sent to agent', 'Follow-up');
          } else {
            await api.steer(projectId, newTaskGoal);
            notifyInfo('Steering guidance sent to agent', 'Steered');
          }
          setNewTaskGoal('');
          setIsFollowUp(false);
          setMessages([]);
          setToolCalls([]);
          fetchTasks(projectId);
        } else {
          // Not running: show the "Review Prompt" step before executing.
          const preview = await api.previewTask(projectId, newTaskGoal, currentStageId);
          setPreviewPrompt({
            goal: newTaskGoal,
            curatedPrompt: preview.curatedPrompt,
            stageId: preview.stageId,
          });
        }
      } catch (e) {
        logger.error('Failed to submit task', e);
        notifyError('Failed to submit task', 'Submission Error');
      }
    },
    [
      isAgentRunning,
      isFollowUp,
      newTaskGoal,
      currentStageId,
      setMessages,
      setToolCalls,
      fetchTasks,
      notifyInfo,
      notifyError,
    ],
  );

  // Confirm the reviewed prompt and actually dispatch the task.
  const confirmSubmitTask = useCallback(
    async (projectId) => {
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      const goal = previewPrompt?.goal || newTaskGoal;
      const stage = previewPrompt?.stageId || currentStageId;
      const followUp = isFollowUp;
      const targetWorkflowId = activeWorkflowId;
      setNewTaskGoal('');
      setIsFollowUp(false);
      setPreviewPrompt(null);
      setMessages([]);
      setToolCalls([]);
      try {
        // The prompt is always composed fresh by the curation engine at
        // dispatch time; the review modal is read-only.
        await api.submitTask(projectId, goal, followUp, stage, targetWorkflowId);
        await fetchTasks(projectId);
        notifySuccess(`Task dispatched: "${goal}"`, 'Task Dispatched');
      } catch (e) {
        logger.error('Failed to submit task', e);
        notifyError('Failed to dispatch task', 'Dispatch Error');
      } finally {
        isSubmittingRef.current = false;
      }
    },
    [
      previewPrompt,
      newTaskGoal,
      isFollowUp,
      currentStageId,
      activeWorkflowId,
      setMessages,
      setToolCalls,
      fetchTasks,
      notifySuccess,
      notifyError,
    ],
  );

  const cancelPreview = useCallback(() => setPreviewPrompt(null), []);

  const startWorkflow = useCallback(
    async (projectId, e) => {
      if (e) e.preventDefault();
      try {
        await api.startWorkflow(projectId, workflowId);
        setWorkflowId('');
        setMessages([]);
        setToolCalls([]);
        fetchWorkflows(projectId);
        notifySuccess('Pipeline execution started', 'Workflow Started');
      } catch (e) {
        logger.error('Failed to start workflow', e);
        notifyError('Failed to start workflow', 'Workflow Error');
      }
    },
    [workflowId, setMessages, setToolCalls, fetchWorkflows, notifySuccess, notifyError],
  );

  return {
    newTaskGoal,
    setNewTaskGoal,
    workflowId,
    setWorkflowId,
    isFollowUp,
    setIsFollowUp,
    previewPrompt,
    setPreviewPrompt,
    fetchWorkflows,
    submitTask,
    confirmSubmitTask,
    cancelPreview,
    startWorkflow,
  };
}
