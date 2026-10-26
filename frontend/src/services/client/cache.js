// Domain: services/client — TTL read caches with in-flight promise sharing.
// Every fetchCached* wrapper keeps its function name; api.js re-exports them.
import { request } from './request.js';

// Shared in-memory model cache with in-flight promise sharing and TTL (#5)
let cachedModelsData = null;
let cachedModelsTimestamp = 0;
let inFlightModelsPromise = null;
const MODELS_CACHE_TTL_MS = 60000; // 60s TTL

// Shared in-memory status caches with in-flight promise sharing and TTL
let cachedComputeStatusData = null;
let cachedComputeStatusTimestamp = 0;
let inFlightComputeStatusPromise = null;
const COMPUTE_STATUS_CACHE_TTL_MS = 5000; // 5s TTL

let cachedHealthData = null;
let cachedHealthTimestamp = 0;
let inFlightHealthPromise = null;
const HEALTH_CACHE_TTL_MS = 10000; // 10s TTL

let cachedSystemData = null;
let cachedSystemTimestamp = 0;
let inFlightSystemPromise = null;
const SYSTEM_CACHE_TTL_MS = 5000; // 5s TTL

const cachedObservabilityMap = new Map();
const OBSERVABILITY_CACHE_TTL_MS = 5000; // 5s TTL

/***
 * MARK: clearModelsCache
 * @description Clears the shared client-side model cache and resets in-flight promises.
 ***/
export function clearModelsCache() {
  cachedModelsData = null;
  cachedModelsTimestamp = 0;
  inFlightModelsPromise = null;
}

/***
 * MARK: clearStatusCache
 * @description Clears all client-side status caches and resets in-flight promises.
 ***/
export function clearStatusCache() {
  cachedComputeStatusData = null;
  cachedComputeStatusTimestamp = 0;
  inFlightComputeStatusPromise = null;

  cachedHealthData = null;
  cachedHealthTimestamp = 0;
  inFlightHealthPromise = null;

  cachedSystemData = null;
  cachedSystemTimestamp = 0;
  inFlightSystemPromise = null;

  cachedObservabilityMap.clear();
}

/***
 * MARK: clearApiCaches
 * @description Clears all shared client-side caches (models, compute, health, system, observability).
 ***/
export function clearApiCaches() {
  clearModelsCache();
  clearStatusCache();
}

/***
 * MARK: fetchCachedModels
 * @description Fetches available models from /compute/models sharing in-flight promises and caching for TTL.
 *   The response carries the flat catalogue plus an additive per-harness view
 *   (`harnesses`) for the harness-first model selector; callers always receive
 *   a `harnesses` array (empty when an older backend omits it).
 * @param {boolean} [refresh=false] - Force cache bypass and refetch.
 * @returns {Promise<{ models: Array<Object>, harnesses: Array<Object> }>}
 ***/
export function fetchCachedModels(refresh = false) {
  const now = Date.now();
  if (!refresh && cachedModelsData && now - cachedModelsTimestamp < MODELS_CACHE_TTL_MS) {
    return Promise.resolve(cachedModelsData);
  }
  if (!refresh && inFlightModelsPromise) {
    return inFlightModelsPromise;
  }
  const promise = request(`/compute/models${refresh ? '?refresh=true' : ''}`)
    .then((data) => {
      // Defensive default: a cached response from an older backend (or a
      // mocked test double) carries no harnesses — normalize to an array so
      // callers never branch on undefined.
      cachedModelsData = { ...data, harnesses: data?.harnesses ?? [] };
      cachedModelsTimestamp = Date.now();
      inFlightModelsPromise = null;
      return cachedModelsData;
    })
    .catch((err) => {
      inFlightModelsPromise = null;
      throw err;
    });
  inFlightModelsPromise = promise;
  return promise;
}

/***
 * MARK: fetchCachedComputeStatus
 * @description Fetches compute engine status from /compute/status sharing in-flight promises and caching for TTL.
 * @param {boolean} [refresh=false]
 * @returns {Promise<any>}
 ***/
export function fetchCachedComputeStatus(refresh = false) {
  const now = Date.now();
  if (
    !refresh &&
    cachedComputeStatusData &&
    now - cachedComputeStatusTimestamp < COMPUTE_STATUS_CACHE_TTL_MS
  ) {
    return Promise.resolve(cachedComputeStatusData);
  }
  if (!refresh && inFlightComputeStatusPromise) {
    return inFlightComputeStatusPromise;
  }
  const promise = request(`/compute/status${refresh ? '?refresh=true' : ''}`)
    .then((data) => {
      cachedComputeStatusData = data;
      cachedComputeStatusTimestamp = Date.now();
      inFlightComputeStatusPromise = null;
      return data;
    })
    .catch((err) => {
      inFlightComputeStatusPromise = null;
      throw err;
    });
  inFlightComputeStatusPromise = promise;
  return promise;
}

/***
 * MARK: fetchCachedHealthStatus
 * @description Fetches subsystem health check status from /status/health sharing in-flight promises and caching for TTL.
 * @param {boolean} [refresh=false]
 * @returns {Promise<any>}
 ***/
export function fetchCachedHealthStatus(refresh = false) {
  const now = Date.now();
  if (!refresh && cachedHealthData && now - cachedHealthTimestamp < HEALTH_CACHE_TTL_MS) {
    return Promise.resolve(cachedHealthData);
  }
  if (!refresh && inFlightHealthPromise) {
    return inFlightHealthPromise;
  }
  const promise = request(`/status/health${refresh ? '?refresh=true' : ''}`)
    .then((data) => {
      cachedHealthData = data;
      cachedHealthTimestamp = Date.now();
      inFlightHealthPromise = null;
      return data;
    })
    .catch((err) => {
      inFlightHealthPromise = null;
      throw err;
    });
  inFlightHealthPromise = promise;
  return promise;
}

/***
 * MARK: fetchCachedSystemStatus
 * @description Fetches global system status from /status sharing in-flight promises and caching for TTL.
 * @param {boolean} [refresh=false]
 * @returns {Promise<any>}
 ***/
export function fetchCachedSystemStatus(refresh = false) {
  const now = Date.now();
  if (!refresh && cachedSystemData && now - cachedSystemTimestamp < SYSTEM_CACHE_TTL_MS) {
    return Promise.resolve(cachedSystemData);
  }
  if (!refresh && inFlightSystemPromise) {
    return inFlightSystemPromise;
  }
  const promise = request(`/status${refresh ? '?refresh=true' : ''}`)
    .then((data) => {
      cachedSystemData = data;
      cachedSystemTimestamp = Date.now();
      inFlightSystemPromise = null;
      return data;
    })
    .catch((err) => {
      inFlightSystemPromise = null;
      throw err;
    });
  inFlightSystemPromise = promise;
  return promise;
}

/***
 * MARK: fetchCachedObservabilityStatus
 * @description Fetches task telemetry with cached health, sharing in-flight reads and a local TTL.
 * Cache bypass never forces provider/harness health probes; use systemStatus(true)
 * for an explicit health refresh.
 * @param {string} [projectId]
 * @param {boolean} [bypassCache=false]
 * @returns {Promise<any>}
 ***/
export function fetchCachedObservabilityStatus(projectId, bypassCache = false) {
  const cacheKey = projectId || '__all__';
  let entry = cachedObservabilityMap.get(cacheKey);
  if (!entry) {
    entry = { data: null, timestamp: 0, inFlightPromise: null };
    cachedObservabilityMap.set(cacheKey, entry);
  }
  const now = Date.now();
  if (!bypassCache && entry.data && now - entry.timestamp < OBSERVABILITY_CACHE_TTL_MS) {
    return Promise.resolve(entry.data);
  }
  if (entry.inFlightPromise) {
    if (!bypassCache || entry.refreshing) return entry.inFlightPromise;
    // An invalidation during an older poll must get one fresh read AFTER that poll.
    // Share that follow-up with other invalidations instead of losing it or racing.
    if (!entry.refreshPromise) {
      entry.refreshPromise = entry.inFlightPromise
        .catch(() => {})
        .then(() => {
          entry.refreshPromise = null;
          return fetchCachedObservabilityStatus(projectId, true);
        });
    }
    return entry.refreshPromise;
  }
  entry.refreshing = bypassCache;
  const searchParams = new URLSearchParams();
  if (projectId) searchParams.set('projectId', projectId);
  const queryStr = searchParams.toString();
  const path = `/status/observability${queryStr ? `?${queryStr}` : ''}`;

  const promise = request(path)
    .then((data) => {
      entry.data = data;
      entry.timestamp = Date.now();
      entry.inFlightPromise = null;
      return data;
    })
    .catch((err) => {
      entry.inFlightPromise = null;
      throw err;
    });
  entry.inFlightPromise = promise;
  return promise;
}
