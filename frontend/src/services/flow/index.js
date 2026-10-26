// Domain: The Flow — stages, queues, and moving work.
/***
 * MARK: flowRequests
 * @description Describes the flow requests using the application's existing connection.
 * @example const requests = flowRequests(request);
 */
export function flowRequests(request) {
  return {
    getWorkflow: (projectId) =>
      request(`/projects/${projectId ? `${projectId}/workflow` : 'workflow'}`),
    updateWorkflow: (projectId, stages) =>
      request(`/projects/${projectId ? `${projectId}/workflow` : 'workflow'}`, {
        method: 'PUT',
        body: JSON.stringify({ stages }),
      }),
    getWorkflows: (projectId) => request(`/projects/${projectId}/workflows`),
    createProjectWorkflow: (projectId, payload) =>
      request(`/projects/${projectId}/workflows`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    switchProjectWorkflow: (projectId, workflowId) =>
      request(`/projects/${projectId}/workflows/${workflowId}/switch`, {
        method: 'POST',
      }),
    updateProjectWorkflow: (projectId, workflowId, payload) =>
      request(`/projects/${projectId}/workflows/${workflowId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    deleteProjectWorkflow: (projectId, workflowId) =>
      request(`/projects/${projectId}/workflows/${workflowId}`, {
        method: 'DELETE',
      }),
    jumpToStage: (projectId, stageId) =>
      request(`/projects/${projectId}/workflow/jump`, {
        method: 'POST',
        body: JSON.stringify({ stageId }),
      }),
    skipStage: (projectId) =>
      request(`/projects/${projectId}/workflow/skip`, {
        method: 'POST',
      }),
    getTaskQueue: (projectId) =>
      request(`/tasks/queue${projectId ? `?projectId=${projectId}` : ''}`),
    advanceTask: (projectId, taskId, guidance) =>
      request(`/tasks/${taskId}/advance`, {
        method: 'POST',
        body: JSON.stringify({ projectId, guidance }),
      }),
    failbackTask: (projectId, taskId, fallbackStageId) =>
      request(`/tasks/${taskId}/failback`, {
        method: 'POST',
        body: JSON.stringify({ projectId, fallbackStageId }),
      }),
    jumpTask: (projectId, taskId, stageId) =>
      request(`/tasks/${taskId}/jump`, {
        method: 'POST',
        body: JSON.stringify({ projectId, stageId }),
      }),
    moveTask: (projectId, taskId, stageId) =>
      request(`/tasks/${taskId}/move`, {
        method: 'POST',
        body: JSON.stringify({ projectId, stageId }),
      }),
    executeTaskStage: (projectId, taskId) =>
      request(`/tasks/${taskId}/execute`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    pauseTask: (projectId, taskId) =>
      request(`/tasks/${taskId}/pause`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    resumeTask: (projectId, taskId) =>
      request(`/tasks/${taskId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    retryTask: (projectId, taskId) =>
      request(`/tasks/${taskId}/retry`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    abortTask: (projectId, taskId) =>
      request(`/tasks/${taskId}/abort`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
      }),
    // Tier-5 global containment (host-wide, not project-scoped).
    engineState: () => request('/engine/state'),
    engineTrip: (reason, operator) =>
      request('/engine/trip', {
        method: 'POST',
        body: JSON.stringify({ reason, operator }),
      }),
    engineReset: (reason, operator) =>
      request('/engine/reset', {
        method: 'POST',
        body: JSON.stringify({ reason, operator }),
      }),
    listWorkflows: () => request('/workflows'),
    startWorkflow: (projectId, workflowId) =>
      request('/workflows/start', {
        method: 'POST',
        body: JSON.stringify({ projectId, workflowId }),
      }),
  };
}
