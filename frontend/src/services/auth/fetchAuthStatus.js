// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

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
