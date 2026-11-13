// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: revokeApiKey
 * @description Revokes an API key immediately (already-issued secrets stop
 *   working at once).
 * @example revokeApiKey('key-id') => { key: {} }
 * @param {string} id - Key id.
 * @returns {Promise<{key: Object}>} Revoked key metadata.
 ***/
export function revokeApiKey(id) {
  return authFetch(`/auth/api-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
