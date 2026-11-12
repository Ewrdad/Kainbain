// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

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
