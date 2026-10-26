/***
 * MARK: wakeLock
 * @description Thin never-throw wrapper around the platform Screen Wake Lock
 * API (`navigator.wakeLock.request("screen")`), the browser's purpose-built
 * way to keep the screen from dimming, sleeping, or locking while a visible
 * document needs attention — the same mechanism video players use. Every
 * export degrades to a silent no-op (plus a log line) where the API is
 * missing or denied: old browsers and non-secure origins such as LAN
 * `http://` installs simply get no lock instead of an error.
 * @example isWakeLockSupported() => true
 * @example await requestScreenWakeLock() => sentinel | null
 ***/
import { logger } from './logger';

/***
 * MARK: isWakeLockSupported
 * @description Whether this browser exposes a callable Screen Wake Lock API.
 * Feature-detects `navigator.wakeLock.request`; never throws.
 * @example isWakeLockSupported() => true
 * @returns {boolean}
 ***/
export function isWakeLockSupported() {
  try {
    return (
      typeof navigator !== 'undefined' &&
      'wakeLock' in navigator &&
      typeof navigator.wakeLock?.request === 'function'
    );
  } catch {
    return false;
  }
}

/***
 * MARK: requestScreenWakeLock
 * @description Asks the platform to keep the screen awake. Resolves to the
 * lock sentinel on success or `null` when unsupported, denied, or failed —
 * never throws, so callers need no try/catch.
 * @example const sentinel = await requestScreenWakeLock();
 * @returns {Promise<Object|null>} The wake-lock sentinel, or null.
 ***/
export async function requestScreenWakeLock() {
  if (!isWakeLockSupported()) return null;
  try {
    const sentinel = await navigator.wakeLock.request('screen');
    logger.info('Screen wake lock acquired');
    return sentinel ?? null;
  } catch (e) {
    logger.warn('Screen wake lock request failed', e);
    return null;
  }
}

/***
 * MARK: releaseWakeLock
 * @description Releases a sentinel from `requestScreenWakeLock`. Safe to call
 * with `null`, `undefined`, or an already-released sentinel (all no-ops);
 * never throws.
 * @example await releaseWakeLock(sentinel);
 * @param {Object|null} [sentinel] - The sentinel to release.
 * @returns {Promise<boolean>} True when a held lock was released.
 ***/
export async function releaseWakeLock(sentinel) {
  if (!sentinel) return false;
  try {
    if (sentinel.released) return true;
    await sentinel.release();
    logger.info('Screen wake lock released');
    return true;
  } catch (e) {
    logger.warn('Screen wake lock release failed', e);
    return false;
  }
}
