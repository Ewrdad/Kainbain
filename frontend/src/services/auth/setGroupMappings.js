// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

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
