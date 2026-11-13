// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: signOut
 * @description Ends the browser session server-side and clears the cookie.
 * @example signOut() => { ok: true }
 * @returns {Promise<{ok: boolean}>} Logout result.
 ***/
export function signOut() {
  return authFetch('/auth/logout', { method: 'POST' });
}
