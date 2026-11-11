// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: getGroupMappings
 * @description Loads the IdP-group to role mappings.
 * @example getGroupMappings() => { mappings: {} }
 * @returns {Promise<{mappings: Object}>} Group mappings.
 ***/
export function getGroupMappings() {
  return authFetch('/auth/group-mappings');
}
