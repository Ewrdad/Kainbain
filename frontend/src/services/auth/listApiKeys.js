// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: listApiKeys
 * @description Lists API-key metadata (never secrets; admin-only while
 *   access control is on).
 * @example listApiKeys() => { keys: [] }
 * @returns {Promise<{apiKeysEnabled: boolean, knownScopes: string[], keys: Object[]}>} Key list view.
 ***/
export function listApiKeys() {
  return authFetch('/auth/api-keys');
}
