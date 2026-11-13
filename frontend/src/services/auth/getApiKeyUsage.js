// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: getApiKeyUsage
 * @description Loads one key's metadata plus its recent audit-log usage,
 *   newest first.
 * @example getApiKeyUsage('key-id') => { key: {}, usage: [] }
 * @param {string} id - Key id.
 * @returns {Promise<{key: Object, usage: Object[]}>} Key plus usage entries.
 ***/
export function getApiKeyUsage(id) {
  return authFetch(`/auth/api-keys/${encodeURIComponent(id)}/usage`);
}
