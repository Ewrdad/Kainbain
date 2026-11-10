// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

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
