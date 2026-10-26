import { API_BASE } from './apiBase.js';

/***
 * MARK: Web Push client service
 * @description Browser-side Web Push lifecycle for KainBain: service-worker
 *   registration (`/sw.js`), permission handling, VAPID-key subscription
 *   against `PushManager`, and the `/push/*` settings/test API. Same-origin
 *   fetch throughout (the API serves the built frontend, so no CORS applies).
 * @example await pushNotifications.subscribeUser()
 ***/

const SW_URL = '/sw.js';

function apiUrl(path) {
  const base = typeof API_BASE === 'string' ? API_BASE.replace(/\/$/, '') : '';
  return `${base}${path}`;
}

/***
 * MARK: responseContentType
 * @description Best-effort Content-Type of a fetch response ("" when the
 *   transport or mock exposes no headers).
 * ***/
function responseContentType(res) {
  try {
    return res?.headers?.get?.('content-type') || '';
  } catch {
    return '';
  }
}

/***
 * MARK: undeployedBackendError
 * @description Actionable error for the undeployed-backend signature: the
 *   server answered an API path with the HTML shell (the SPA fallback serves
 *   index.html for unknown routes, including on deployments that predate
 *   push support). Without this, callers destructure `null` and report a
 *   cryptic TypeError after permission was already granted.
 * ***/
function undeployedBackendError() {
  return new Error(
    'The server answered with a web page instead of push data — this deployment does not include push-notification support yet. Redeploy KainBain, then try again',
  );
}

/***
 * MARK: isPushApiPath
 * @description Whether a request URL targets the push API. Used to map
 *   transport-level failures to redeploy guidance: deployments that predate
 *   push support answer `POST /push/*` with a JSON 404 (`Not found`) rather
 *   than the HTML shell, so a bare "Not found" would otherwise hide the fix.
 * ***/
function isPushApiPath(url) {
  return typeof url === 'string' && url.includes('/push/');
}

async function requestJson(url, options = {}) {
  const { headers: optionHeaders, ...restOptions } = options;
  const res = await fetch(url, {
    ...restOptions,
    headers: { 'Content-Type': 'application/json', ...(optionHeaders || {}) },
  });
  const contentType = responseContentType(res);
  if (typeof contentType === 'string' && contentType.includes('text/html')) {
    throw undeployedBackendError();
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    // A 404 on a push path means the backend has no such route — an
    // undeployed backend, not a bad request. Say so instead of "Not found".
    if (res?.status === 404 && isPushApiPath(url)) {
      throw undeployedBackendError();
    }
    const message = payload?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return payload;
}

/***
 * MARK: isPushSupported
 * @description Whether this browser context can do Web Push at all
 *   (service workers + PushManager + secure context).
 * @example isPushSupported() => true
 * @returns {boolean}
 ***/
export function isPushSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  try {
    if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) return false;
  } catch {
    return false;
  }
  return (
    'serviceWorker' in navigator && typeof PushManager !== 'undefined' && 'Notification' in window
  );
}

/***
 * MARK: getPermissionState
 * @description Current notification permission: 'granted' | 'denied' |
 *   'default' | 'unsupported'.
 * @example getPermissionState() => 'granted'
 ***/
export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported';
  try {
    return Notification.permission || 'default';
  } catch {
    return 'default';
  }
}

/***
 * MARK: urlBase64ToUint8Array
 * @description Converts a URL-safe base64 VAPID key to the Uint8Array that
 *   `PushManager.subscribe({ applicationServerKey })` requires.
 * @example urlBase64ToUint8Array("BNc...").length => 65
 ***/
export function urlBase64ToUint8Array(base64String) {
  if (typeof base64String !== 'string' || base64String.length === 0) {
    throw new Error('Server did not provide a usable push key (empty VAPID key)');
  }
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    /* eslint-disable-next-line security/detect-object-injection -- index loops the decoded key bytes */
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/***
 * MARK: isServiceWorkerAssetMissing
 * @description Best-effort probe for the missing-asset signature behind a
 *   service-worker registration failure: the deployed static host answers
 *   `/sw.js` with the HTML shell (or a 404) when the built frontend predates
 *   push support. True only on positive evidence; any probe failure reads as
 *   "not proven missing" so the original registration error still surfaces.
 * ***/
async function isServiceWorkerAssetMissing() {
  try {
    const res = await fetch(SW_URL);
    if (!res) return false;
    const contentType = responseContentType(res);
    if (typeof contentType === 'string' && contentType.includes('text/html')) return true;
    if (!res.ok && res.status === 404) return true;
    return false;
  } catch {
    return false;
  }
}

/***
 * MARK: service-worker settle bound
 * @description Upper bound for each best-effort service-worker wait
 *   (stale-worker `update()`, first-install `ready`). Without a bound, a
 *   stalled worker on a flaky mobile connection hangs the subscribe button
 *   on "Subscribing…" forever; with it, the flow falls through to the
 *   original registration and either succeeds or fails with an actionable
 *   error. Overridable per call for tests.
 ***/
const SERVICE_WORKER_SETTLE_TIMEOUT_MS = 8000;

const SETTLE_TIMED_OUT = Symbol('push-settle-timed-out');

/***
 * MARK: settleWithin
 * @description Awaits `promise` for at most `ms`, resolving to
 *   `{ timedOut: true }` on expiry or `{ timedOut: false, value }` on
 *   settle. A rejection propagates (the caller decides whether the wait
 *   was best-effort). Non-promises resolve immediately with their value.
 ***/
async function settleWithin(promise, ms) {
  if (!promise || typeof promise.then !== 'function') {
    return { timedOut: false, value: promise };
  }
  let timer = null;
  try {
    const value = await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(SETTLE_TIMED_OUT), ms);
      }),
    ]);
    if (value === SETTLE_TIMED_OUT) return { timedOut: true };
    return { timedOut: false, value };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/***
 * MARK: getServiceWorkerRegistration
 * @description Registers (or reuses) the KainBain push service worker. When
 *   registration itself fails because the deployment does not serve
 *   `/sw.js`, the operator gets redeploy guidance instead of the browser's
 *   raw MIME-type TypeError.
 * @param {Object} [opts]
 * @param {number} [opts.settleTimeoutMs] - Bound for the best-effort
 *   update/readiness waits (test seam; defaults to 8s).
 ***/
export async function getServiceWorkerRegistration({
  settleTimeoutMs = SERVICE_WORKER_SETTLE_TIMEOUT_MS,
} = {}) {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser');
  }
  try {
    let registration = await navigator.serviceWorker.register(SW_URL);
    // Stale-worker refresh (notably repeat-tested mobile browsers): the
    // device may still run an older /sw.js without a 'push' listener, in
    // which case server-accepted test pushes never display. update() pulls
    // the newest worker immediately; combined with the worker's skipWaiting
    // it activates without waiting for every tab to close. Best-effort and
    // bounded: a failed or stalled update still leaves a usable registration.
    try {
      await settleWithin(registration?.update?.(), settleTimeoutMs);
    } catch {
      // Fall through with the original registration.
    }
    // First-install race (notably fresh mobile browsers): register()
    // resolves while the worker is still installing (active === null), and
    // pushManager.subscribe() then throws AbortError ("no active Service
    // Worker") even though permission was granted. Waiting for readiness
    // turns that into a working subscription instead of a silent no-delivery.
    // Bounded: a worker that never activates falls back to the original
    // registration (whose subscribe then throws an actionable error below)
    // instead of hanging the UI forever.
    try {
      if (registration && !registration.active && navigator.serviceWorker.ready) {
        const settled = await settleWithin(navigator.serviceWorker.ready, settleTimeoutMs);
        if (!settled.timedOut && settled.value) {
          registration = settled.value;
        }
      }
    } catch {
      // Readiness wait is best-effort; the original registration still works
      // once the worker activates, so fall through with it.
    }
    return registration;
  } catch (error) {
    if (await isServiceWorkerAssetMissing()) {
      throw new Error(
        'The push service worker (/sw.js) is not served by this deployment — redeploy KainBain so the built frontend includes it, then try again',
      );
    }
    throw error;
  }
}

/***
 * MARK: subscriptionJson
 * @description Serializable form of a PushSubscription (its own `toJSON`
 *   when the browser provides one, otherwise the raw object).
 * @example subscriptionJson(sub) => { endpoint, keys: { p256dh, auth } }
 ***/
function subscriptionJson(subscription) {
  return subscription?.toJSON ? subscription.toJSON() : subscription;
}

/***
 * MARK: verifyServerRegistration
 * @description Cross-checks that the server still has this browser's
 *   subscription. Permission alone never delivers anything — the endpoint
 *   must be registered server-side too — so a local subscription that the
 *   server lost is reported as missing and repaired on the spot:
 *   `POST /push/subscribe` is an idempotent upsert keyed on endpoint, so
 *   re-posting the existing subscription is always safe.
 * @param {PushSubscription} subscription
 * @returns {Promise<boolean|null>} `true` when the server has the endpoint
 *   (or re-registered it), `false` when the server is reachable but does not
 *   carry the endpoint after a repair attempt, `null` when the check itself
 *   failed (network/backend) — callers degrade to local-only display.
 ***/
async function verifyServerRegistration(subscription) {
  const endpoint = subscription?.endpoint;
  if (!endpoint) return null;
  let registered;
  try {
    const status = await requestJson(apiUrl('/push/subscription-status'), {
      method: 'POST',
      body: JSON.stringify({ endpoint }),
    });
    registered = Boolean(status?.registered);
  } catch {
    // The check is best-effort: a transient failure reads as "unknown",
    // never as "missing" (which would trigger needless re-registration).
    return null;
  }
  if (registered) return true;
  try {
    const confirmation = await requestJson(apiUrl('/push/subscribe'), {
      method: 'POST',
      body: JSON.stringify(subscriptionJson(subscription)),
    });
    return confirmation?.subscription?.endpoint === endpoint;
  } catch {
    return false;
  }
}

/***
 * MARK: getSubscriptionState
 * @description Current push state: permission, whether a PushManager
 *   subscription exists, and whether the server actually knows this
 *   browser's endpoint (`registered`: true/false, or null when the
 *   server check could not be made — the UI then degrades to today's
 *   local-only display). A local subscription missing on the server is
 *   re-registered (self-heal) instead of silently reporting a state
 *   that would never deliver. Never throws.
 ***/
export async function getSubscriptionState() {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false, registered: null };
  }
  const permission = getPermissionState();
  try {
    const registration =
      (await navigator.serviceWorker.getRegistration(SW_URL)) ||
      (await navigator.serviceWorker.getRegistration());
    const subscription = await registration?.pushManager?.getSubscription?.();
    if (!subscription) {
      return { supported: true, permission, subscribed: false, registered: null };
    }
    const registered = await verifyServerRegistration(subscription);
    return { supported: true, permission, subscribed: true, registered };
  } catch {
    return { supported: true, permission, subscribed: false, registered: null };
  }
}

/***
 * MARK: isIOSBrowser
 * @description Best-effort iOS Safari/WebKit detection for subscribe-error
 *   guidance. Apple delivers Web Push only to web apps added to the Home
 *   Screen — the single most common "permission granted but nothing ever
 *   arrives" cause on iPhone/iPad — so a rejected mobile subscription must
 *   say so instead of surfacing a bare AbortError/NotAllowedError.
 ***/
function isIOSBrowser() {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    // `standalone` exists only on iOS Safari/WebKit (installed or not).
    if (typeof navigator !== 'undefined' && 'standalone' in navigator) return true;
  } catch {
    return false;
  }
  return false;
}

/***
 * MARK: mapSubscribeError
 * @description Maps a raw `PushManager.subscribe` rejection to an actionable
 *   error the operator can fix (permission, Home-Screen install, or a still-
 *   starting worker) while preserving the browser's original detail.
 ***/
function mapSubscribeError(error) {
  const name = error?.name || '';
  const detail = error?.message ? ` (${error.message})` : '';
  if (isIOSBrowser()) {
    return new Error(
      `Push subscription was rejected${detail} — on iPhone/iPad, Safari delivers web push only to apps added to the Home Screen: open the share menu, choose "Add to Home Screen", reopen KainBain from the new icon, then try again`,
    );
  }
  if (name === 'NotAllowedError') {
    return new Error(
      `Push subscription was blocked${detail} — allow notifications in the browser site settings, then try again`,
    );
  }
  if (name === 'AbortError' || name === 'InvalidStateError') {
    return new Error(
      `Push subscription failed${detail} — the service worker may still be starting. Close other KainBain tabs, wait a few seconds, then try again`,
    );
  }
  return new Error(`Push subscription failed${detail} — try again`);
}

/***
 * MARK: subscribeUser
 * @description Requests permission, subscribes via PushManager with the
 *   server VAPID key, and registers the subscription server-side. If the
 *   server-side registration fails, the browser-side subscription is
 *   rolled back (unsubscribed) so the UI never reports a half-registered
 *   state that would silently never deliver. The server reply must confirm
 *   our exact endpoint: a bare HTTP 200 that stored nothing (proxy, stale
 *   backend) is treated as a failure, not a success.
 ***/
export async function subscribeUser() {
  if (!isPushSupported()) {
    throw new Error('Push notifications require HTTPS (or localhost) and a supporting browser');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked — allow them in the browser site settings, then try again'
        : 'Notification permission was dismissed — try again to allow notifications',
    );
  }
  const registration = await getServiceWorkerRegistration();
  if (!registration?.pushManager || typeof registration.pushManager.subscribe !== 'function') {
    throw new Error(
      'This browser did not expose a push manager for the service worker — update the browser, and on iPhone/iPad reopen KainBain from a Home-Screen icon, then try again',
    );
  }
  const { publicKey } = await requestJson(apiUrl('/push/vapid-key'));
  if (!publicKey) throw new Error('Server did not provide a VAPID key');
  let applicationServerKey;
  try {
    applicationServerKey = urlBase64ToUint8Array(publicKey);
  } catch {
    throw new Error(
      'Server provided an invalid push key — redeploy KainBain so the server VAPID key is valid, then try again',
    );
  }
  let subscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  } catch (error) {
    throw mapSubscribeError(error);
  }
  try {
    const confirmation = await requestJson(apiUrl('/push/subscribe'), {
      method: 'POST',
      body: JSON.stringify(subscriptionJson(subscription)),
    });
    const endpoint = subscription?.endpoint;
    if (endpoint && confirmation?.subscription?.endpoint !== endpoint) {
      throw new Error(
        'The server answered but did not confirm this browser\u2019s subscription — it may not have been saved. Try disabling and re-enabling push notifications, and redeploy KainBain if the problem persists',
      );
    }
  } catch (error) {
    // Roll back the browser-side subscription so the operator is not left
    // in a "subscribed" state the server has never seen — that mismatch
    // is the classic cause of "test says sent but nothing arrives".
    try {
      await subscription.unsubscribe();
    } catch {
      // Best-effort rollback; the server-side error is the one to surface.
    }
    throw new Error(
      `Could not register the push subscription with the server: ${error?.message || 'unknown error'}. The browser subscription was rolled back — try again.`,
    );
  }
  return subscription;
}

/***
 * MARK: unsubscribeUser
 * @description Removes the PushManager subscription and unregisters it
 *   server-side. Returns true (idempotent when nothing was subscribed).
 ***/
export async function unsubscribeUser() {
  try {
    const registration =
      (await navigator.serviceWorker?.getRegistration?.(SW_URL)) ||
      (await navigator.serviceWorker?.getRegistration?.());
    const subscription = await registration?.pushManager?.getSubscription?.();
    let endpoint = null;
    if (subscription) {
      endpoint = subscription.endpoint;
      await subscription.unsubscribe();
    }
    await requestJson(apiUrl('/push/unsubscribe'), {
      method: 'POST',
      body: JSON.stringify(endpoint ? { endpoint } : {}),
    });
  } catch (error) {
    // Idempotent offline cleanup: the local PushManager subscription above is
    // already gone, so a 404 (unknown endpoint / older server without the
    // route) or undeployed backend still counts as unsubscribed. Any other failure
    // surfaces — a blanket 4xx swallow would hide real validation or auth problems.
    if (
      /Request failed \(404\)|does not include push-notification support/i.test(
        error?.message || '',
      )
    )
      return true;
    throw error;
  }
  return true;
}

/***
 * MARK: getSettings / updateSettings / sendTestPush
 * @description Thin wrappers over the `/push/*` settings API.
 ***/
export async function getSettings() {
  return requestJson(apiUrl('/push/settings'));
}

export async function updateSettings(patch) {
  return requestJson(apiUrl('/push/settings'), {
    method: 'PUT',
    body: JSON.stringify(patch || {}),
  });
}

export async function sendTestPush() {
  const response = await requestJson(apiUrl('/push/test'), { method: 'POST', body: '{}' });
  // The server returns ok:false when delivery could not happen (disabled,
  // zero subscriptions, or all sends failed). Surface that as a thrown
  // error so the UI shows an actionable message instead of a false success.
  // When every send failed, the first per-subscription error (VAPID
  // mismatch, push-service rejection, network block) is appended so the
  // operator sees WHY instead of a bare "check the server logs".
  if (response?.ok === false) {
    const base =
      response.error || 'Test notification was not delivered — check the server logs for details';
    const firstError = response?.result?.errors?.[0];
    const detail = firstError?.message
      ? ` (first delivery error from ${firstError.endpoint || 'the push service'}: ${firstError.message})`
      : '';
    throw new Error(`${base}${detail}`);
  }
  return response;
}

/***
 * MARK: permissionLabel
 * @description Human-readable permission state for the status badge.
 * @example permissionLabel('denied') => 'Blocked'
 ***/
export function permissionLabel(permission) {
  switch (permission) {
    case 'granted':
      return 'Allowed';
    case 'denied':
      return 'Blocked';
    case 'unsupported':
      return 'Unsupported';
    default:
      return 'Not asked yet';
  }
}

/***
 * MARK: describePushState
 * @description Pure helper mapping the four raw flags (supported, permission,
 *   subscribed, registered) into everything the status row needs: label, tone,
 *   detail, the single next action, and whether a test send is meaningful.
 *   Keeping it pure means the copy and the CTA logic live in one place,
 *   independent of React, and are unit-testable without a DOM.
 *
 *   The `action` shape is `{ kind, label } | null` where `kind` is one of
 *   `'subscribe' | 'unsubscribe' | 'reregister'`; the component dispatches on
 *   `kind` rather than re-deriving it from the same flags (which is how the
 *   old string `cta` drifted from the state it described).
 * @example describePushState({ permission: 'granted', subscribed: false })
 *   => { label: 'Not subscribed', action: { kind: 'subscribe', ... } }
 * @param {Object} [state]
 * @param {boolean} [state.supported=true] - Web Push availability in this context.
 * @param {string} [state.permission='default'] - Browser permission state.
 * @param {boolean} [state.subscribed=false] - Local PushManager subscription exists.
 * @param {boolean|null} [state.registered=null] - Server has the endpoint
 *   (`true`/`false`), or the check could not be made (`null`).
 * @returns {{label: string, tone: string, detail: string, action: Object|null, canTest: boolean}}
 ***/
export function describePushState({
  supported = true,
  permission = 'default',
  subscribed = false,
  registered = null,
} = {}) {
  if (!supported) {
    return {
      label: 'Unsupported',
      tone: 'muted',
      detail:
        'Push needs a secure context (HTTPS or localhost) and a browser with service-worker support.',
      action: null,
      canTest: false,
    };
  }

  if (permission === 'denied') {
    // A blocked browser normally drops its push subscription, but a stale
    // one can linger; still offer the cleanup action so the operator is not
    // stuck with a subscription the UI refuses to acknowledge.
    return {
      label: 'Blocked',
      tone: 'error',
      detail: subscribed
        ? 'Notifications are blocked for this site, so nothing can be delivered. Allow them in the browser site settings, then reload and subscribe again.'
        : 'Notifications are blocked for this site. Allow them in the browser site settings, then come back and subscribe.',
      action: subscribed ? { kind: 'unsubscribe', label: 'Disable push notifications' } : null,
      canTest: false,
    };
  }

  if (!subscribed) {
    const detail =
      permission === 'granted'
        ? "You've allowed notifications \u2014 now subscribe this browser to receive them."
        : 'Subscribe this browser to receive notifications even after leaving the site.';
    return {
      label: 'Not subscribed',
      tone: 'muted',
      detail,
      action: { kind: 'subscribe', label: 'Enable push notifications' },
      canTest: false,
    };
  }

  if (registered === true) {
    return {
      label: 'Subscribed & registered',
      tone: 'ok',
      detail: 'This browser is subscribed and confirmed registered with the server.',
      action: { kind: 'unsubscribe', label: 'Disable push notifications' },
      canTest: true,
    };
  }

  if (registered === false) {
    // `getSubscriptionState` already tried the idempotent re-register before
    // reporting this, so the copy must not imply a repair is still running.
    return {
      label: 'Not registered on server',
      tone: 'warning',
      detail:
        'Subscribed in this browser, but the server does not have it. It is repaired automatically when the server is reachable \u2014 retry, or disable and re-enable push notifications.',
      action: { kind: 'reregister', label: 'Re-register push notifications' },
      canTest: false,
    };
  }

  return {
    label: 'Subscribed',
    tone: 'ok',
    detail: 'This browser is subscribed (server registration not verified).',
    action: { kind: 'unsubscribe', label: 'Disable push notifications' },
    canTest: true,
  };
}

export const pushNotifications = {
  isPushSupported,
  getPermissionState,
  permissionLabel,
  describePushState,
  urlBase64ToUint8Array,
  getServiceWorkerRegistration,
  getSubscriptionState,
  subscribeUser,
  unsubscribeUser,
  getSettings,
  updateSettings,
  sendTestPush,
};
