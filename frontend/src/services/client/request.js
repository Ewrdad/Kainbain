// Domain: services/client — JSON transport core (timeout + GET-only retry).
// Used by every domain request list; api.js re-exports it unchanged.
import { API_BASE } from '../apiBase.js';

/** Default ceiling for one REST attempt before it is aborted. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;
/***
 * MARK: NO_REQUEST_TIMEOUT
 * @description Opt-out sentinel for `request()`'s `timeoutMs`: pass `0`
 *   (or null/undefined) to run with no client timer — the attempt settles
 *   when the server answers or the caller's `signal` aborts (Cancel).
 *   Retrospective chat turns use this so long agent turns never die to a
 *   client budget; every other caller keeps the 30s default.
 * @example request('/retrospective/chat', { method: 'POST', body }, { timeoutMs: NO_REQUEST_TIMEOUT })
 ***/
export const NO_REQUEST_TIMEOUT = 0;
/***
 * MARK: normalizeTimeoutMs
 * @description Reduces any `timeoutMs` input to an armable budget or
 *   `NO_REQUEST_TIMEOUT` (disabled): only a finite number `> 0` arms the
 *   client timer. Every other input — `0`/nullish (the documented opt-out),
 *   `NaN`, negative, `Infinity`, or a non-number — degrades to disabled so a
 *   malformed budget can never abort a healthy request instantly; the attempt
 *   runs until the server settles or the caller's `signal` aborts (fail-safe).
 *   Mirrors `normalizeTimeoutMs` in `api/routes/retrospectiveChat.js` — the
 *   two packages cannot import each other, so the timeout tests on both sides
 *   pin the shared rule.
 * @example normalizeTimeoutMs(1000) => 1000
 * @example normalizeTimeoutMs(0) => 0
 * @example normalizeTimeoutMs(NaN) => 0
 * @param {unknown} timeoutMs - The raw budget input.
 * @returns {number} The armable budget, or `NO_REQUEST_TIMEOUT` for disabled.
 ***/
export function normalizeTimeoutMs(timeoutMs) {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs)) return NO_REQUEST_TIMEOUT;
  if (timeoutMs <= 0) return NO_REQUEST_TIMEOUT;
  return timeoutMs;
}
/** Extra attempts for idempotent GETs on network failure/timeout (POSTs never retry). */
export const MAX_GET_RETRIES = 1;

/**
 * Generic JSON request helper with timeout and GET-only retry.
 * @description Aborts hung requests (slow/flaky remote links) instead of
 *   hanging the boot waterfall forever, and retries idempotent GETs once on
 *   network failure. HTTP error statuses are never retried. Callers may pass
 *   their own `signal` (e.g. a chat Cancel button): an external abort rejects
 *   with AbortError and is never retried, even for GETs. Pass
 *   `timeoutMs: NO_REQUEST_TIMEOUT` (0) to disable the client timer for
 *   calls that must run until the server settles or the caller cancels.
 * @param {string} path
 * @param {Object} [options]
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs] - Per-attempt budget; 0/null/undefined disables the timer (degenerate inputs like NaN/negatives also disable via `normalizeTimeoutMs`).
 * @param {number} [opts.retries]
 * @param {AbortSignal} [opts.signal] - External abort (caller cancel). Linked to the attempt; never retried.
 * @returns {Promise<any>}
 */
export async function request(
  path,
  options = {},
  { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, retries, signal } = {},
) {
  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = retries ?? (method === 'GET' ? MAX_GET_RETRIES : 0);
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const onExternalAbort = () => {
      if (controller) controller.abort();
    };
    if (signal && controller) {
      if (signal.aborted) controller.abort();
      else if (typeof signal.addEventListener === 'function') {
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    const unlinkExternalAbort = () => {
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onExternalAbort);
      }
    };
    // Fail-safe budget: only a finite positive number arms the client timer
    // — anything else runs until the server settles or the caller's signal
    // aborts, instead of aborting a healthy request instantly.
    const budgetMs = normalizeTimeoutMs(timeoutMs);
    const timeoutArmed = budgetMs > 0;
    let timer = null;
    // Race explicitly (not just signal-abort): a hung fetch that never
    // settles must still release the boot waterfall on a slow remote link.
    const timeoutPromise = timeoutArmed
      ? new Promise((_, reject) => {
          timer = setTimeout(() => {
            if (controller) controller.abort();
            const err = new Error(`API request timed out after ${budgetMs}ms on ${path}`);
            err.name = 'AbortError';
            reject(err);
          }, budgetMs);
        })
      : null;
    if (timer && typeof timer.unref === 'function') timer.unref();
    try {
      const headers = {};
      // Multipart bodies (FormData) must reach the browser untouched: it sets
      // its own Content-Type WITH the boundary, and a forced application/json
      // header would corrupt the request. JSON bodies keep the explicit type.
      if (options.body && !(typeof FormData !== 'undefined' && options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      const attemptFetch = fetch(`${API_BASE}${path}`, {
        signal: controller ? controller.signal : undefined,
        ...options,
        headers: { ...headers, ...options.headers },
      });
      const res = timeoutArmed
        ? await Promise.race([attemptFetch, timeoutPromise])
        : await attemptFetch;
      clearTimeout(timer);
      unlinkExternalAbort();
      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`API ${res.status} on ${path}: ${body}`);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      unlinkExternalAbort();
      lastError = err;
      const timedOut = err && err.name === 'AbortError';
      const networkFailure = timedOut || err instanceof TypeError;
      const callerCancelled = Boolean(signal && signal.aborted);
      if (attempt >= maxRetries || !networkFailure || callerCancelled) throw lastError;
    }
  }
  throw lastError;
}
