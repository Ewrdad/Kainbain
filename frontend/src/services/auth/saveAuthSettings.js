// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: saveAuthSettings
 * @description Persists one settings-page change (enable toggle, provider
 *   details, groups claim, TTLs, role managers).
 * @example saveAuthSettings({ authEnabled: true }) => { enabled: true, ... }
 * @param {Object} partial - Settings keys to store.
 * @returns {Promise<Object>} Updated settings view.
 ***/
export function saveAuthSettings(partial) {
  return authFetch('/auth/settings', {
    method: 'PUT',
    body: JSON.stringify(partial || {}),
  });
}
