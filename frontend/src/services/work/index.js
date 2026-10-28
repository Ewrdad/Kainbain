// Domain: The Work — task goals and board records.
import { taskImageRequests } from '../taskImages.js';
/***
 * MARK: workRequests
 * @description Describes the work requests using the application's existing connection.
 * @example const requests = workRequests(request, isValidProjectId);
 */
export function workRequests(request, isValidProjectId) {
  return {
    ...taskImageRequests(request),
    listTasks: (projectId, { includeCompleted = true } = {}) => {
      if (projectId && !isValidProjectId(projectId)) {
        console.warn(`[api.listTasks] Invalid projectId: ${projectId}`);
        return Promise.resolve([]);
      }
      const params = new URLSearchParams();
      if (projectId) params.set('projectId', projectId);
      if (!includeCompleted) params.set('excludeCompleted', 'true');
      const query = params.toString();
      return request(`/tasks${query ? `?${query}` : ''}`);
    },
    createTask: (projectId, { title, goal, stageId, idempotencyKey, workflowId, blockedBy }) =>
      request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          title,
          goal,
          stageId,
          idempotencyKey,
          workflowId,
          blockedBy,
        }),
      }),
    deleteTask: (projectId, taskId) =>
      request(`/tasks/${taskId}${projectId ? `?projectId=${projectId}` : ''}`, {
        method: 'DELETE',
      }),
    getTask: (projectId, taskId) =>
      request(`/tasks/${taskId}${projectId ? `?projectId=${projectId}` : ''}`),
    previewTask: (projectId, goal, stageId) =>
      request('/tasks/preview', {
        method: 'POST',
        body: JSON.stringify({ projectId, goal, stageId }),
      }),
    submitTask: (projectId, goal, followUp, stageId, workflowId) =>
      request('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          goal,
          title: goal ? goal.slice(0, 60) : undefined,
          followUp,
          stageId,
          workflowId,
          execute: true,
        }),
      }),
    completeTask: (projectId, taskId) =>
      request(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    updateTask: (projectId, taskId, updates) =>
      request(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ projectId, ...updates }),
      }),
    getSurvey: (projectId, taskId) =>
      request(`/tasks/${taskId}/survey${projectId ? `?projectId=${projectId}` : ''}`),
    submitSurvey: (projectId, taskId, { answers, action } = {}) =>
      request(`/tasks/${taskId}/survey`, {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          ...(action ? { action } : {}),
          ...(answers ? { answers } : {}),
        }),
      }),
  };
}
