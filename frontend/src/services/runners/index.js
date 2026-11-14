// Domain: Runners — out-of-process task executors (Phase 2, ADR 0009).
/***
 * MARK: runnerRequests
 * @description Runner endpoints for the System Settings › Runners screen:
 *   list registrations, approve/deny join requests, pause/resume/revoke,
 *   live monitor assignments, and the operator-owned per-Runner
 *   configuration (display name, project scope, tool filter, job-type
 *   switches, directories). Heartbeat and claim are Runner-side calls,
 *   not UI calls.
 * @example const requests = runnerRequests(request);
 */
export function runnerRequests(request) {
  return {
    getRunners: () => request('/runners'),
    getRunnerMonitor: () => request('/runners/monitor'),
    getFleetModelCatalog: () => request('/runners/models/catalogue'),
    deleteFleetCatalogueModel: (id) =>
      request(`/runners/models/catalogue/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    deleteFleetQuarantinedModel: (id) =>
      request(`/runners/models/catalogue/quarantine/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    getRunnerConfig: (id) =>
      request(`/runners/${encodeURIComponent(id)}/config`),
    updateRunnerConfig: (id, patch) =>
      request(`/runners/${encodeURIComponent(id)}/config`, {
        method: 'PATCH',
        body: JSON.stringify(patch || {}),
      }),
    approveRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
    denyRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/deny`, { method: 'POST' }),
    revokeRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
    pauseRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
    resumeRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
    skipRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/skip`, { method: 'POST' }),
    requestModelRediscovery: (id) =>
      request(`/runners/${encodeURIComponent(id)}/commands`, { method: 'POST', body: JSON.stringify({ command: 'requestModelRediscovery' }) }),
    requestRunnerUpdate: (id) =>
      request(`/runners/${encodeURIComponent(id)}/commands`, { method: 'POST', body: JSON.stringify({ command: 'requestUpdate' }) }),
  };
}
