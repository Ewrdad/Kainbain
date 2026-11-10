// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: listUsers
 * @description Lists provisioned users (admin-only while access control is on).
 * @example listUsers() => { users: [] }
 * @returns {Promise<{users: Object[]}>} User records.
 ***/
export function listUsers() {
  return authFetch('/auth/users');
}
