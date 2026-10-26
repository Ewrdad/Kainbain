// Domain: House Setup — projects, skills, documents, and deployment.
import { API_BASE } from '../apiBase.js';
/***
 * MARK: getFileRawUrl
 * @description Builds the direct raw-bytes URL for a project file (used as an
 *   `<img src>` and download href — no fetch, so the browser decodes and
 *   caches the bytes itself). Pure helper: the caller supplies the API base.
 * @example getFileRawUrl('http://localhost:3100', 'proj-1', 'img/logo.png') => 'http://localhost:3100/projects/proj-1/files/raw?path=img%2Flogo.png'
 * @param {string} apiBase
 * @param {string} projectId
 * @param {string} filePath
 * @returns {string}
 */
export function getFileRawUrl(apiBase, projectId, filePath) {
  return `${apiBase || ''}/projects/${projectId}/files/raw?path=${encodeURIComponent(filePath)}`;
}

/***
 * MARK: houseRequests
 * @description Describes the house requests using the application's existing connection.
 * @example const requests = houseRequests(request);
 */
export function houseRequests(request) {
  return {
    listProjects: () => request('/projects'),
    createProject: (payload) =>
    request('/projects', { method: 'POST', body: JSON.stringify(payload) }),
    registerProject: (payload) =>
    request('/projects/register', { method: 'POST', body: JSON.stringify(payload) }),
    getProject: (id) => request(`/projects/${id}`),
    updateProject: (id, payload, opts = {}) => {
      const body = { ...(payload || {}) };
      // Optimistic concurrency: the caller passes the `updatedAt` it loaded
      // so a rival save from another tab/browser surfaces HTTP 409 instead
      // of silently clobbering (last-writer-wins wiped alias lists).
      if (opts.expectedUpdatedAt && body.expectedUpdatedAt === undefined) {
        body.expectedUpdatedAt = opts.expectedUpdatedAt;
      }
      const headers = { ...(opts.headers || {}) };
      if (opts.ifMatch && headers['If-Match'] === undefined) {
        headers['If-Match'] = opts.ifMatch;
      }
      return request(`/projects/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      });
    },
    activateProject: (id) => request(`/projects/${id}/activate`, { method: 'POST' }),
    getAliasReliability: (projectId) =>
    request(`/projects/${encodeURIComponent(projectId)}/aliases/reliability`),
    updateAppStatus: (projectId, payload) =>
    request(`/projects/${projectId}/app-status`, { method: 'PATCH', body: JSON.stringify(payload || {}) }),
    checkAppHealth: (projectId) =>
    request(`/projects/${projectId}/app-status/health`),
    getSkills: (projectId) =>
    request(`/skills${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`),
    getSkill: (name, projectId) =>
    request(
      `/skills/${encodeURIComponent(name)}${
        projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
      }`,
    ),
    importSkill: (projectId, { file, name, overwrite } = {}) => {
      const formData = new FormData();
      formData.append('file', file, file?.name || 'skill.md');
      if (name) formData.append('name', name);
      if (overwrite) formData.append('overwrite', 'true');
      return request(`/projects/${projectId}/skills/import`, {
        method: 'POST',
        body: formData,
      });
    },
    deleteSkill: (projectId, name) =>
    request(`/projects/${projectId}/skills/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
    listFiles: (projectId, subpath = '') =>
    request(`/projects/${projectId}/files${subpath ? `?path=${encodeURIComponent(subpath)}` : ''}`),
    getFileContent: (projectId, filePath) =>
    request(`/projects/${projectId}/files/content?path=${encodeURIComponent(filePath)}`),
    getFileRawUrl: (projectId, filePath) =>
    `${API_BASE}/projects/${projectId}/files/raw?path=${encodeURIComponent(filePath)}`,
    deployStatus: () => request('/deploy/status'),
    triggerDeploy: (fast = false) =>
    request('/deploy', { method: 'POST', body: JSON.stringify({ fast }) }),
    triggerRollback: () => request('/deploy/rollback', { method: 'POST' }),
    deployLog: (maxLines = 200) => request(`/deploy/log?maxLines=${maxLines}`),
    deployChangelog: (limit) =>
      request(
        `/deploy/changelog${Number.isInteger(limit) && limit > 0 ? `?limit=${limit}` : ''}`,
      ),
    getPromptLayout: () => request('/settings/prompt-layout'),
    updatePromptLayout: (layout) =>
      request('/settings/prompt-layout', {
        method: 'PUT',
        body: JSON.stringify({ layout }),
      }),
    resetPromptLayout: () =>
      request('/settings/prompt-layout/reset', { method: 'POST' }),
    dryRunPromptLayout: (payload = {}) =>
      request('/settings/prompt-layout/dry-run', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  };
}
