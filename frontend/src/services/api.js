// Role: full frontend API client — barrel over work/flow/crew/watch/house/retrospective request lists. Base-URL resolution lives in apiBase.js.
import { workRequests } from './work/index.js';
import { flowRequests } from './flow/index.js';
import { crewRequests } from './crew/index.js';
import { watchRequests } from './watch/index.js';
import { runnerRequests } from './runners/index.js';
import { houseRequests, getFileRawUrl } from './house/index.js';
import { retrospectiveRequests } from './retrospective/index.js';

/**
 * MARK: api
 * @description Centralized API client for the KainBain frontend.
 * Backward-compatible barrel: implementations live in client/request.js
 * (transport), client/cache.js (TTL caches), modelKeys.js (model grammar),
 * client/docs.js (markdown fetch), and the work/flow/crew/watch/house/
 * retrospective domain lists. This module only composes the `api` object +
 * re-exports.
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
  ...workRequests(request, isValidProjectId),
  ...flowRequests(request),
  ...crewRequests(request),
  ...watchRequests(request),
  ...runnerRequests(request),
  ...houseRequests(request),
  ...retrospectiveRequests(request),
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
