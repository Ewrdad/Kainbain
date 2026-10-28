// Domain: Runners — out-of-process task executors (Phase 2, ADR 0009).
/***
 * MARK: runnerRequests
 * @description Runner identity endpoints for the minimal onboarding UI:
 *   list registrations, approve/deny join requests, revoke a Runner.
 *   Heartbeat and claim are Runner-side calls, not UI calls.
 * @example const requests = runnerRequests(request);
 */
export function runnerRequests(request) {
  return {
    getRunners: () => request('/runners'),
    getRunnerMonitor: () => request('/runners/monitor'),
    approveRunner: (id) =>
      request(`/runners/${encodeURIComponent(id)}/approve`, { method: 'POST' }),
    denyRunner: (id) => request(`/runners/${encodeURIComponent(id)}/deny`, { method: 'POST' }),
    revokeRunner: (id) => request(`/runners/${encodeURIComponent(id)}/revoke`, { method: 'POST' }),
  };
}
