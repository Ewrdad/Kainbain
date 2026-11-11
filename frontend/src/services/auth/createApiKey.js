// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: createApiKey
 * @description Creates an API key. The secret is returned exactly once in
 *   the response — the caller must display it immediately.
 * @example createApiKey({ name: 'scanner' }) => { key: {}, secret: 'kb_…' }
 * @param {Object} body - Key fields ({ name, roles?, scopes?, expiresAt? }).
 * @returns {Promise<{key: Object, secret: string}>} Metadata plus the one-time secret.
 ***/
export function createApiKey(body) {
  return authFetch('/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify(body || {}),
  });
}
