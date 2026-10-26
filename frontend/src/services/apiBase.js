// Role: API/WS base-URL resolution only (loopback self-heal) — import this,
// not api.js, when you need just the base (e.g. MarkdownViewer image URLs).
// Base-only seam keeps `vi.mock('services/api')` client mocks untouched.

/***
 * MARK: loopback self-heal
 * @description Rewrites a loopback API/WS base baked into the bundle
 *   (`frontend/.env` pins `localhost:3100`) to the host that actually served
 *   the page. A stale/dev bundle opened from a phone over Tailscale would
 *   otherwise point fetch+WS at the phone's own localhost and render a
 *   totally empty UI. Same-origin builds (empty base) are untouched, and a
 *   page genuinely served from loopback keeps its configured base.
 * @example resolveApiBase('http://localhost:3100', '192.0.2.10') => 'http://192.0.2.10:3100'
 ***/
export function resolveApiBase(configuredBase, pageHost) {
  if (!configuredBase) return '';
  if (!pageHost || isLoopbackHost(pageHost)) return configuredBase;
  let url;
  try {
    url = new URL(configuredBase);
  } catch {
    return configuredBase;
  }
  if (!isLoopbackHost(url.hostname)) return configuredBase;
  url.hostname = pageHost;
  return url.toString().replace(/\/$/, '');
}

/***
 * MARK: isLoopbackHost
 * @description Whether a hostname is a loopback address.
 * @example isLoopbackHost('localhost') => true
 ***/
export function isLoopbackHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1';
}

/***
 * MARK: resolveWsBase
 * @description Same loopback self-heal as resolveApiBase for the WebSocket
 *   base, plus ws://→wss:// upgrade when the page itself is https:// (mixed
 *   content would otherwise kill the socket on remote https origins).
 * @example resolveWsBase('ws://localhost:3100', '192.0.2.10', 'http:') => 'ws://192.0.2.10:3100'
 ***/
export function resolveWsBase(configuredBase, pageHost, pageProtocol) {
  const healed = resolveApiBase(configuredBase, pageHost);
  if (!healed) return '';
  if (pageProtocol === 'https:' && healed.startsWith('ws://')) {
    return `wss://${healed.slice('ws://'.length)}`;
  }
  return healed;
}

/** @private Internal helpers shared with the api client module. */
export function pageHostname() {
  return typeof window !== 'undefined' && window.location ? window.location.hostname : '';
}

export function pageProtocol() {
  return typeof window !== 'undefined' && window.location ? window.location.protocol : '';
}

// API base. In dev this is set to the local API origin (frontend/.env). For
// production builds we set VITE_API_BASE/VITE_WS_URL to an empty string so the
// frontend talks to the same origin it is served from (relative URLs), which
// works behind the nginx reverse proxy at https://kainbain.local. `??` (not
// `||`) is deliberate: an explicitly-empty value means "same origin", while a
// genuinely unset value falls back to localhost:3100.
export const API_BASE = resolveApiBase(
  import.meta.env?.VITE_API_BASE ?? 'http://localhost:3100',
  pageHostname(),
);