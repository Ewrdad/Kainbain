// Domain: Access — organisation sign-in and access-control requests.
import { API_BASE } from '../apiBase.js';

/***
 * MARK: startLogin
 * @description Leaves the SPA for the identity provider: a full-page visit
 *   to `GET /auth/login`, which answers 302 to the provider's sign-in page.
 *   Safe outside a browser (tests) — it simply does nothing there.
 * @example startLogin()
 ***/
export function startLogin() {
  if (typeof window !== 'undefined' && window.location) {
    window.location.href = `${API_BASE}/auth/login`;
  }
}
