// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

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
