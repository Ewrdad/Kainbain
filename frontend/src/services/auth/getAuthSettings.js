// Domain: Access — organisation sign-in and access-control requests.
import { authFetch } from './authFetch.js';

/***
 * MARK: getAuthSettings
 * @description Loads the effective access-control settings (the client
 *   secret itself is never returned — only whether one is set).
 * @example getAuthSettings() => { enabled, ... }
 * @returns {Promise<Object>} Settings view.
 ***/
export function getAuthSettings() {
  return authFetch('/auth/settings');
}
