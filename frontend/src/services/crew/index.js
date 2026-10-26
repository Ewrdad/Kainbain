// Domain: The Crew — sessions and instructions for crew members.
/***
 * MARK: crewRequests
 * @description Describes the crew requests using the application's existing connection.
 * @example const requests = crewRequests(request);
 */
export function crewRequests(request) {
  return {
    getHarnesses: () => request('/harnesses'),
    getHarnessModels: (id, refresh = false) =>
      request(`/harnesses/${encodeURIComponent(id)}/models${refresh ? '?refresh=true' : ''}`),
    getHarnessReliability: () => request('/harnesses/reliability'),
    computeStart: (projectId) =>
    request('/compute/start', { method: 'POST', body: JSON.stringify({ projectId }) }),
    computeStop: (projectId) =>
    request('/compute/stop', { method: 'POST', body: JSON.stringify({ projectId }) }),
    steer: (projectId, goal) =>
    request('/compute/steer', { method: 'POST', body: JSON.stringify({ projectId, goal }) }),
    followUp: (projectId, goal) =>
    request('/compute/follow-up', { method: 'POST', body: JSON.stringify({ projectId, goal }) }),
    sessionHistory: (projectId) =>
    request(`/session/history${projectId ? `?projectId=${projectId}` : ''}`),
    sessionStatus: (projectId) =>
    request(`/session/status${projectId ? `?projectId=${projectId}` : ''}`),
    restoreSession: (projectId) =>
    request('/session/restore', { method: 'POST', body: JSON.stringify({ projectId }) }),
    followUpTask: (projectId, taskId, prompt) =>
    request(`/tasks/${taskId}/follow-up`, {
      method: 'POST',
      body: JSON.stringify({ projectId, prompt }),
    }),
    steerTask: (projectId, taskId, guidance) =>
    request(`/tasks/${taskId}/steer`, {
      method: 'POST',
      body: JSON.stringify({ projectId, guidance }),
    }),
  };
}
