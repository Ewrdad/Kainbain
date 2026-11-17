// Role: full frontend API client — joins the work/flow/crew/watch/house/retrospective request lists. Base-URL resolution lives in apiBase.js.
// Domain composition comes from domainRegistry.js (the single source of
// truth for domain operations); only the stable non-domain surface is listed here.
import { getFileRawUrl } from './house/index.js';
import { domainRegistry } from './domainRegistry.js';

/**
 * MARK: api
 * @description Centralized API client for the KainBain frontend.
 * Single place that joins the pieces: implementations live in
 * client/request.js (transport), client/cache.js (TTL caches), modelKeys.js
 * (model grammar), client/docs.js (markdown fetch), and the work/flow/
 * crew/watch/house/retrospective domain lists. This module only composes
 * the `api` object + re-exports.
 */

// Base resolution (loopback self-heal) lives in apiBase.js — one tiny module
// so base-only consumers import it without the whole client, and so the
// `vi.mock('services/api')` test seams stay untouched. The local import feeds
// this module's own wsUrl; the export-from re-exports for every importer.
import {
  API_BASE,
  resolveApiBase,
  isLoopbackHost,
  resolveWsBase,
  pageHostname,
  pageProtocol,
} from './apiBase.js';

export {
  API_BASE,
  resolveApiBase,
  isLoopbackHost,
  resolveWsBase,
} from './apiBase.js';

export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  MAX_GET_RETRIES,
  request,
} from './client/request.js';

export {
  MODEL_KEY_SEP,
  modelKey,
  harnessModelKey,
  parseModelKey,
  validateModelRefShape,
  splitReasoning,
  stripReasoning,
  appendReasoning,
  checkReasoningLevelText,
  classifiesForeignHarness,
  normalizeModelRef,
  resolveModel,
  resolveModelFromRegistry,
  resolveReasoningOptions,
  stripReasoningIfUnsupported,
  modelOptionValue,
  modelKeyForValue,
  isValidProjectId,
  groupModelsByProvider,
} from './modelKeys.js';

export {
  clearModelsCache,
  clearStatusCache,
  clearApiCaches,
  fetchCachedModels,
  fetchCachedComputeStatus,
  fetchCachedHealthStatus,
  fetchCachedSystemStatus,
  fetchCachedObservabilityStatus,
} from './client/cache.js';

export { fetchDocsArticle } from './client/docs.js';

import { request } from './client/request.js';
import {
  fetchCachedModels,
  fetchCachedComputeStatus,
  fetchCachedHealthStatus,
  fetchCachedSystemStatus,
  fetchCachedObservabilityStatus,
  clearModelsCache,
  clearStatusCache,
  clearApiCaches,
} from './client/cache.js';
import { fetchDocsArticle } from './client/docs.js';
import { isValidProjectId } from './modelKeys.js';

export const api = {
  API_BASE,
  isValidProjectId,
  docsIndex: () => request('/docs'),
  docsArticle: (slug) => fetchDocsArticle(slug),
  getConfigSpec: () => request('/status/config'),
  getVersions: (uiVersion, frontendContract) => {
    const parts = [];
    if (uiVersion) parts.push(`uiVersion=${encodeURIComponent(uiVersion)}`);
    if (frontendContract?.apiVersion) {
      parts.push(`frontendApiVersion=${encodeURIComponent(frontendContract.apiVersion)}`);
    }
    if (frontendContract?.requiresBackendApi) {
      parts.push(
        `requiresBackendApi=${encodeURIComponent(frontendContract.requiresBackendApi)}`,
      );
    }
    const query = parts.length > 0 ? `/status/versions?${parts.join('&')}` : '/status/versions';
    return request(query);
  },
  computeStatus: (refresh = false) => fetchCachedComputeStatus(refresh),
  computeModels: (refresh = false) => fetchCachedModels(refresh),
  getModels: (refresh = false) => fetchCachedModels(refresh),
  clearModelsCache,
  clearStatusCache,
  clearApiCaches,
  engineStatus: (refresh = false) => fetchCachedSystemStatus(refresh),
  systemStatus: (refresh = false) => fetchCachedSystemStatus(refresh),
  healthStatus: (refresh = false) => fetchCachedHealthStatus(refresh),
  observabilityStatus: (projectId, bypassCache = false) =>
    fetchCachedObservabilityStatus(projectId, bypassCache),
  // Domain operations, in registry order (later entries win on overlap,
  // exactly as the previous hand-written spreads did). The `getFileRawUrl`
  // explicit override below is kept intentionally: it is behaviorally
  // identical to the `houseRequests` key today (both resolve against the
  // same imported `API_BASE`), but keeping the override means a future
  // divergence in either definition cannot silently change `api` clients.
  ...Object.assign(
    {},
    ...domainRegistry.map((entry) => entry.build({ request, isValidProjectId })),
  ),
  getFileRawUrl: (projectId, filePath) => getFileRawUrl(API_BASE, projectId, filePath),
};

/**
 * Build a WebSocket URL for a given project.
 * @description Builds the WebSocket URL for a project, using the configured
 *   WS base (env-overridable) and the project id.
 * @param {string} projectId
 * @returns {string}
 * @example wsUrl('proj-1') => 'ws://localhost:3100/ws?projectId=proj-1'
 */
export function wsUrl(projectId) {
  const base = resolveWsBase(
    import.meta.env?.VITE_WS_URL ?? 'ws://localhost:3100',
    pageHostname(),
    pageProtocol(),
  );
  return `${base}/ws?projectId=${projectId}`;
}
