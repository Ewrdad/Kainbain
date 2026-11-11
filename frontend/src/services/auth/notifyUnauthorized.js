// Domain: Access — organisation sign-in and access-control requests.
import { UNAUTHORIZED_EVENT } from './unauthorizedEvent.js';

/***
 * MARK: notifyUnauthorized
 * @description Broadcasts a session-loss event to the app shell. Safe to
 *   call outside a browser (tests, SSR) — it simply does nothing there.
 * @example notifyUnauthorized()
 ***/
export function notifyUnauthorized() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new window.CustomEvent(UNAUTHORIZED_EVENT));
  }
}
