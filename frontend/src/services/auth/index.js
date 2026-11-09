// Domain: Access — organisation sign-in and access-control requests.
import { API_BASE } from '../apiBase.js';

/***
 * MARK: UNAUTHORIZED_EVENT
 * @description Window event fired when an auth request answers 401 (the
 *   session expired or was revoked). The router guard listens for it and
 *   sends the user back to the login page.
 * @example UNAUTHORIZED_EVENT => 'kainbain:unauthorized'
 ***/
export const UNAUTHORIZED_EVENT = 'kainbain:unauthorized';

/***
 * MARK: notifyUnauthorized
 * @description Broadcasts a session-loss event to the app shell. Safe to
 *   call outside a browser (tests, SSR) — it simply does nothing there.
 * @example notifyUnauthorized()
 ***/
export function notifyUnauthorized() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent(UNAUTHORIZED_EVENT));
  }
}

/***
 * MARK: authFetch
 * @description JSON fetch for the `/auth/*` endpoints. Always sends the
 *   session cookie (`credentials: 'include'` so split-origin setups work),
 *   throws an `Error` carrying `.status` on HTTP failures, and broadcasts
 *   `UNAUTHORIZED_EVENT` on 401 so the app can bounce to the login page.
 * @example authFetch('/auth/me')
 * @param {string} path - API path starting with `/auth/`.
 * @param {Object} [options] - Fetch options (method, body, signal).
 * @returns {Promise<any>} Parsed JSON response.
 ***/
export async function authFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (response.status === 401) notifyUnauthorized();
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let code = '';
    try {
      code = JSON.parse(text)?.code || '';
    } catch {
      code = '';
    }
    const error = new Error(`Auth API ${response.status} on ${path}${code ? ` (${code})` : ''}`);
    error.status = response.status;
    error.code = code;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

/***
 * MARK: fetchAuthStatus
 * @description Loads `GET /auth/me`: whether access control is on, who is
 *   signed in, and their effective roles. Never throws — an unreachable API
 *   reads as "access control off", keeping the default install and every
 *   existing test on today's behaviour.
 * @example fetchAuthStatus() => { authEnabled: false, ... }
 * @param {Object} [options] - Fetch options (e.g. an abort signal).
 * @returns {Promise<{authEnabled: boolean, user: Object|null, roles: string[]}>} Auth status.
 ***/
export async function fetchAuthStatus(options = {}) {
  try {
    return await authFetch('/auth/me', options);
  } catch {
    return { authEnabled: false, user: null, roles: ['admin'] };
  }
}

/***
 * MARK: startLogin
 * @description Leaves the SPA for the identity provider: a full-page visit
 *   to `GET /auth/login`, which answers 302 to the provider's sign-in page.
 *   Safe outside a browser (tests) — it simply does nothing there.
 * @example startLogin()
 ***/
export function startLogin() {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = `${API_BASE}/auth/login`;
  }
}

/***
 * MARK: signOut
 * @description Ends the browser session server-side and clears the cookie.
 * @example signOut() => { ok: true }
 * @returns {Promise<{ok: boolean}>} Logout result.
 ***/
export function signOut() {
  return authFetch('/auth/logout', { method: 'POST' });
}

/***
 * MARK: listUsers
 * @description Lists provisioned users (admin-only while access control is on).
 * @example listUsers() => { users: [] }
 * @returns {Promise<{users: Object[]}>} User records.
 ***/
export function listUsers() {
  return authFetch('/auth/users');
}

/***
 * MARK: setUserRoles
 * @description Replaces a user's installation-wide direct roles.
 * @example setUserRoles('ada-1', ['member']) => { user }
 * @param {string} userId - User id.
 * @param {string[]} roles - Catalogue role names.
 * @returns {Promise<{user: Object}>} Updated user.
 ***/
export function setUserRoles(userId, roles) {
  return authFetch(`/auth/users/${encodeURIComponent(userId)}/roles`, {
    method: 'PUT',
    body: JSON.stringify({ roles }),
  });
}

/***
 * MARK: setUserProjectRoles
 * @description Replaces a user's roles for one project.
 * @example setUserProjectRoles('ada-1', 'alpha', ['viewer']) => { user }
 * @param {string} userId - User id.
 * @param {string} projectId - Project id.
 * @param {string[]} roles - Catalogue role names.
 * @returns {Promise<{user: Object}>} Updated user.
 ***/
export function setUserProjectRoles(userId, projectId, roles) {
  return authFetch(
    `/auth/users/${encodeURIComponent(userId)}/projects/${encodeURIComponent(projectId)}/roles`,
    { method: 'PUT', body: JSON.stringify({ roles }) },
  );
}

/***
 * MARK: setUserDisabled
 * @description Disables or re-enables a user account.
 * @example setUserDisabled('ada-1', true) => { user }
 * @param {string} userId - User id.
 * @param {boolean} disabled - True to disable, false to re-enable.
 * @returns {Promise<{user: Object}>} Updated user.
 ***/
export function setUserDisabled(userId, disabled) {
  return authFetch(`/auth/users/${encodeURIComponent(userId)}/disabled`, {
    method: 'PUT',
    body: JSON.stringify({ disabled }),
  });
}

/***
 * MARK: getGroupMappings
 * @description Loads the IdP-group to role mappings.
 * @example getGroupMappings() => { mappings: {} }
 * @returns {Promise<{mappings: Object}>} Group mappings.
 ***/
export function getGroupMappings() {
  return authFetch('/auth/group-mappings');
}

/***
 * MARK: setGroupMappings
 * @description Replaces the IdP-group to role mappings.
 * @example setGroupMappings({ team: ['member'] }) => { mappings }
 * @param {Object} mappings - `{ [idpGroup]: [role] }` map.
 * @returns {Promise<{mappings: Object}>} Stored mappings.
 ***/
export function setGroupMappings(mappings) {
  return authFetch('/auth/group-mappings', {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
}

/***
 * MARK: getAuthSettings
 * @description Loads the effective access-control settings (the client
 *   secret itself is never returned — only whether one is set).
 * @example getAuthSettings() => { enabled, ... }
 * @returns {Promise<Object>} Settings view.
 ***/
export function getAuthSettings() {
  return authFetch('/auth/settings');
}

/***
 * MARK: saveAuthSettings
 * @description Persists one settings-page change (enable toggle, provider
 *   details, groups claim, TTLs, role managers).
 * @example saveAuthSettings({ authEnabled: true }) => { enabled: true, ... }
 * @param {Object} partial - Settings keys to store.
 * @returns {Promise<Object>} Updated settings view.
 ***/
export function saveAuthSettings(partial) {
  return authFetch('/auth/settings', {
    method: 'PUT',
    body: JSON.stringify(partial || {}),
  });
}
