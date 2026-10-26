/* KainBain Web Push service worker (served root-scoped at /sw.js).
 *
 * Receives Web Push events while no KainBain tab is open and shows a
 * system-level notification. Clicking the notification focuses an open
 * KainBain window (navigating it to the payload URL) or opens a new one.
 */

/* Lifecycle: activate updates immediately. Without skipWaiting, a device
 * that registered an older /sw.js (e.g. from earlier testing) keeps the old
 * worker active while any tab stays open — push events then route to a
 * worker with no 'push' listener and test notifications vanish silently
 * even though the server reports them delivered. Mobile browsers keep tabs
 * alive for days, so waiting for a natural activation is not an option. */
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    try {
      data = { title: 'KainBain', body: event.data ? event.data.text() : '' };
    } catch {
      data = {};
    }
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'KainBain';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: typeof data.tag === 'string' ? data.tag : 'kainbain',
    data: data.data && typeof data.data === 'object' ? data.data : {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = (event.notification.data && event.notification.data.url) || '/';
  // Fail safe: a malformed payload URL (or non-string data) falls back to
  // the app root instead of rejecting the click handler.
  let targetUrl = `${self.location.origin}/`;
  try {
    targetUrl = new URL(typeof rawUrl === 'string' ? rawUrl : '/', self.location.origin).href;
  } catch {
    // Keep the app-root fallback above.
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          try {
            await client.focus();
            if ('navigate' in client && targetUrl) await client.navigate(targetUrl);
            return;
          } catch {
            // Focusing this window failed; fall through to next window or open.
          }
        }
      }
      if (self.clients.openWindow) {
        try {
          await self.clients.openWindow(targetUrl);
        } catch {
          // Opening is best-effort (popup blockers); nothing else to do.
        }
      }
    })(),
  );
});

/* When the browser rotates or expires a push subscription (the push service
 * invalidated the old endpoint), PushManager fires `pushsubscriptionchange`.
 * We re-subscribe and POST the new subscription to the server so delivery
 * never silently dies. This is the most common cause of "test says sent
 * but no notification arrives" after a browser update or device sleep. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let subscription = event.newSubscription;
        if (!subscription) {
          // Fetch the VAPID public key from the API.
          const keyRes = await fetch('/push/vapid-key');
          const { publicKey } = await keyRes.json();
          if (!publicKey) return;
          // Convert the URL-safe base64 key for PushManager.subscribe.
          const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
          const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const raw = atob(base64);
          const applicationServerKey = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i += 1) {
            /* eslint-disable-next-line security/detect-object-injection -- index loops decoded key bytes */
            applicationServerKey[i] = raw.charCodeAt(i);
          }
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }
        await fetch('/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription.toJSON ? subscription.toJSON() : subscription),
        });
      } catch {
        // Re-subscription failed — the next page load will re-check state.
      }
    })(),
  );
});
