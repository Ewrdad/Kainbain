// Domain: Access — organisation sign-in and access-control requests.
import { notifyUnauthorized } from './notifyUnauthorized.js';
import { API_BASE } from '../apiBase.js';

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
