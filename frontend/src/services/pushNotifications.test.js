import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import {
  isPushSupported,
  getPermissionState,
  getServiceWorkerRegistration,
  urlBase64ToUint8Array,
  subscribeUser,
  unsubscribeUser,
  getSettings,
  updateSettings,
  sendTestPush,
  getSubscriptionState,
  describePushState,
  permissionLabel,
} from './pushNotifications';

/**
 * MARK: pushNotifications service tests
 * @description Covers support/permission detection, the VAPID key conversion,
 *   subscribe/unsubscribe flows (service worker, PushManager, and fetch all
 *   mocked), and the settings/test endpoints. No network, no real browser APIs.
 */

const VAPID_KEY = 'BNcRdreALRFEA1F8ZMTm8pcpVg4J2y5y4p8xJ8z6A5HxCj2X8fY4K7W9Q0';

/***
 * MARK: jsonFetchResponse
 * @description Minimal fetch Response stub carrying a JSON payload.
 * @example jsonFetchResponse({ ok: true }, 400)
 ***/
function jsonFetchResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => payload,
  };
}

function installPushMocks({ permission = 'default', subscription = null } = {}) {
  const subscribe = vi.fn().mockResolvedValue({
    endpoint: 'https://example.push/sub-1',
    toJSON: () => ({ endpoint: 'https://example.push/sub-1', keys: { p256dh: 'a', auth: 'b' } }),
  });
  const pushManager = {
    subscribe,
    getSubscription: vi.fn().mockResolvedValue(subscription),
  };
  const registration = { pushManager };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'Notification', {
    value: {
      permission,
      requestPermission: vi.fn().mockResolvedValue(permission),
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'isSecureContext', {
    value: true,
    configurable: true,
    writable: true,
  });
  return { subscribe, pushManager, registration };
}

function removePushMocks() {
  try {
    delete window.serviceWorker;
  } catch {}
  try {
    delete window.PushManager;
  } catch {}
  try {
    delete window.Notification;
  } catch {}
  try {
    delete window.isSecureContext;
  } catch {}
  try {
    delete window.navigator.serviceWorker;
  } catch {}
  try {
    delete window.navigator.PushManager;
  } catch {}
  try {
    delete window.navigator.Notification;
  } catch {}
  try {
    delete window.navigator.isSecureContext;
  } catch {}
}

beforeEach(() => {
  vi.clearAllMocks();
  removePushMocks();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  removePushMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pushNotifications service', () => {
  test('isPushSupported is false without browser APIs', () => {
    expect(isPushSupported()).toBe(false);
  });

  test('isPushSupported is true with service worker, PushManager, and secure context', () => {
    installPushMocks();
    expect(isPushSupported()).toBe(true);
  });

  test('getPermissionState reports unsupported without APIs', () => {
    expect(getPermissionState()).toBe('unsupported');
  });

  test('urlBase64ToUint8Array decodes URL-safe base64', () => {
    // "Hello" in base64url without padding.
    const bytes = urlBase64ToUint8Array('SGVsbG8');
    expect(Array.from(bytes)).toEqual([72, 101, 108, 108, 111]);
  });

  test('getSubscriptionState reports subscribed when PushManager has one', async () => {
    installPushMocks({ permission: 'granted', subscription: { endpoint: 'x' } });
    const state = await getSubscriptionState();
    expect(state).toMatchObject({ supported: true, permission: 'granted', subscribed: true });
  });

  test('getSubscriptionState reports unsubscribed when PushManager has no subscription', async () => {
    installPushMocks({ permission: 'granted', subscription: null });
    const state = await getSubscriptionState();
    expect(state).toMatchObject({ supported: true, permission: 'granted', subscribed: false });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('getSubscriptionState reports registered:true when the server has the endpoint', async () => {
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-1' },
    });
    fetch.mockResolvedValue(jsonFetchResponse({ ok: true, registered: true }));
    const state = await getSubscriptionState();
    expect(state).toMatchObject({
      supported: true,
      permission: 'granted',
      subscribed: true,
      registered: true,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/push/subscription-status');
    // The endpoint is a bearer-capable secret: it must travel in the POST
    // body, never in a query string.
    expect(fetch.mock.calls[0][0]).not.toContain('example.push/sub-1');
  });

  test('getSubscriptionState self-heals a local subscription missing on the server', async () => {
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-1' },
    });
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('/push/subscription-status')) {
        return jsonFetchResponse({ ok: true, registered: false });
      }
      if (String(url).includes('/push/subscribe')) {
        return jsonFetchResponse({
          ok: true,
          subscription: { endpoint: 'https://example.push/sub-1' },
        });
      }
      return jsonFetchResponse({}, 404);
    });
    const state = await getSubscriptionState();
    expect(state).toMatchObject({ subscribed: true, registered: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [subscribeUrl, subscribeOptions] = fetch.mock.calls[1];
    expect(String(subscribeUrl)).toContain('/push/subscribe');
    expect(JSON.parse(subscribeOptions.body).endpoint).toBe('https://example.push/sub-1');
  });

  test('getSubscriptionState reports registered:false when self-heal cannot repair', async () => {
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-1' },
    });
    fetch.mockImplementation(async (url) => {
      if (String(url).includes('/push/subscription-status')) {
        return jsonFetchResponse({ ok: true, registered: false });
      }
      return jsonFetchResponse({ error: 'Invalid subscription' }, 400);
    });
    const state = await getSubscriptionState();
    expect(state).toMatchObject({ subscribed: true, registered: false });
  });

  test('getSubscriptionState degrades to registered:null when the check fails', async () => {
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-1' },
    });
    fetch.mockRejectedValue(new Error('network down'));
    const state = await getSubscriptionState();
    expect(state).toMatchObject({ subscribed: true, registered: null });
  });

  describe('permissionLabel helper', () => {
    test('maps permission states correctly', () => {
      expect(permissionLabel('granted')).toBe('Allowed');
      expect(permissionLabel('denied')).toBe('Blocked');
      expect(permissionLabel('unsupported')).toBe('Unsupported');
      expect(permissionLabel('default')).toBe('Not asked yet');
      expect(permissionLabel(undefined)).toBe('Not asked yet');
    });
  });

  describe('describePushState helper', () => {
    test('returns unsupported when supported is false', () => {
      const desc = describePushState({ supported: false });
      expect(desc).toMatchObject({
        label: 'Unsupported',
        tone: 'muted',
        action: null,
        canTest: false,
      });
      expect(desc.detail).toMatch(/secure context/);
    });

    test('returns blocked when permission is denied', () => {
      const desc = describePushState({ supported: true, permission: 'denied' });
      expect(desc).toMatchObject({
        label: 'Blocked',
        tone: 'error',
        action: null,
        canTest: false,
      });
      expect(desc.detail).toMatch(/blocked/);
    });

    test('still offers unsubscribe when a stale subscription outlives a blocked permission', () => {
      const desc = describePushState({
        supported: true,
        permission: 'denied',
        subscribed: true,
        registered: true,
      });
      expect(desc).toMatchObject({
        label: 'Blocked',
        tone: 'error',
        action: { kind: 'unsubscribe', label: 'Disable push notifications' },
        canTest: false,
      });
    });

    test('returns not subscribed with plain guidance when permission is default', () => {
      const desc = describePushState({ supported: true, permission: 'default', subscribed: false });
      expect(desc).toMatchObject({
        label: 'Not subscribed',
        tone: 'muted',
        action: { kind: 'subscribe', label: 'Enable push notifications' },
        canTest: false,
      });
      expect(desc.detail).toMatch(/Subscribe this browser/);
    });

    test('returns not subscribed with clarifying guidance when permission is already granted', () => {
      const desc = describePushState({ supported: true, permission: 'granted', subscribed: false });
      expect(desc).toMatchObject({
        label: 'Not subscribed',
        tone: 'muted',
        action: { kind: 'subscribe', label: 'Enable push notifications' },
        canTest: false,
      });
      expect(desc.detail).toMatch(/You've allowed notifications/);
    });

    test('returns subscribed & registered when local subscription exists and verified registered', () => {
      const desc = describePushState({
        supported: true,
        permission: 'granted',
        subscribed: true,
        registered: true,
      });
      expect(desc).toMatchObject({
        label: 'Subscribed & registered',
        tone: 'ok',
        action: { kind: 'unsubscribe', label: 'Disable push notifications' },
        canTest: true,
      });
    });

    test('warns and offers a re-register action when the server is missing the subscription', () => {
      const desc = describePushState({
        supported: true,
        permission: 'granted',
        subscribed: true,
        registered: false,
      });
      expect(desc).toMatchObject({
        label: 'Not registered on server',
        tone: 'warning',
        action: { kind: 'reregister', label: 'Re-register push notifications' },
        canTest: false,
      });
      expect(desc.detail).not.toMatch(/re-registering/);
    });

    test('returns subscribed when registered status is null (unverified/degraded)', () => {
      const desc = describePushState({
        supported: true,
        permission: 'granted',
        subscribed: true,
        registered: null,
      });
      expect(desc).toMatchObject({
        label: 'Subscribed',
        tone: 'ok',
        action: { kind: 'unsubscribe', label: 'Disable push notifications' },
        canTest: true,
      });
    });
  });

  test('subscribeUser requests permission, subscribes, and posts to the server', async () => {
    const { subscribe } = installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, subscription: { endpoint: 'https://example.push/sub-1' } }),
    });

    await subscribeUser();

    expect(window.Notification.requestPermission).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][0].userVisibleOnly).toBe(true);
    expect(subscribe.mock.calls[0][0].applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][0]).toMatch(/\/push\/subscribe$/);
  });

  test('subscribeUser throws a helpful error when permission is blocked', async () => {
    installPushMocks({ permission: 'denied' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('denied');
    await expect(subscribeUser()).rejects.toThrow(/blocked/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('subscribeUser throws without browser support', async () => {
    await expect(subscribeUser()).rejects.toThrow(/HTTPS|supporting browser/);
  });

  test('subscribeUser rolls back the browser subscription when the server POST fails', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const { subscribe } = installPushMocks({ permission: 'granted' });
    subscribe.mockResolvedValue({
      endpoint: 'https://example.push/sub-1',
      unsubscribe,
      toJSON: () => ({ endpoint: 'https://example.push/sub-1', keys: { p256dh: 'a', auth: 'b' } }),
    });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });
    // Server-side subscribe POST fails (e.g. SPA-fallback HTML response).
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 200,
      json: async () => ({ error: 'unexpected token' }),
    });

    await expect(subscribeUser()).rejects.toThrow(/Could not register the push subscription/);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('unsubscribeUser unsubscribes and notifies the server', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-1', unsubscribe },
    });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });

    await expect(unsubscribeUser()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toMatch(/\/push\/unsubscribe$/);
  });

  test('unsubscribeUser treats a 404 as already-unsubscribed but surfaces other failures', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-1', unsubscribe },
    });
    fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(unsubscribeUser()).resolves.toBe(true);

    const unsubscribe2 = vi.fn().mockResolvedValue(true);
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-2', unsubscribe: unsubscribe2 },
    });
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    });
    await expect(unsubscribeUser()).rejects.toThrow('Bad request');
  });

  test('settings and test endpoints hit the right paths', async () => {
    installPushMocks();
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await getSettings();
    expect(fetch.mock.calls[0][0]).toMatch(/\/push\/settings$/);
    await updateSettings({ enabled: false });
    expect(fetch.mock.calls[1][0]).toMatch(/\/push\/settings$/);
    expect(fetch.mock.calls[1][1].method).toBe('PUT');
    await sendTestPush();
    expect(fetch.mock.calls[2][0]).toMatch(/\/push\/test$/);
  });

  test('failed requests throw with the server error', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad keys' }),
    });
    await expect(getSettings()).rejects.toThrow('Bad keys');
  });

  test('sendTestPush throws when the server reports zero delivery', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error:
          'No push subscriptions registered on the server — try disabling and re-enabling push notifications',
      }),
    });
    await expect(sendTestPush()).rejects.toThrow(/No push subscriptions/);
  });

  test('sendTestPush returns the delivery breakdown on success', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        result: { delivered: 2, pruned: 0, subscriptions: 2, errors: [] },
      }),
    });
    const result = await sendTestPush();
    expect(result).toMatchObject({ ok: true, result: { delivered: 2, subscriptions: 2 } });
  });

  // Regression cover for the "permission granted but no test notification"
  // failure: deployments that predate push support answer API paths and
  // /sw.js with the HTML shell (HTTP 200). The client must say "redeploy"
  // instead of failing cryptically (or silently).
  function htmlResponse(status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name) =>
          String(name).toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : '',
      },
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
      text: async () => '<!doctype html><html></html>',
    };
  }

  function jsonResponse(payload, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => 'application/json' },
      json: async () => payload,
    };
  }

  test('subscribeUser reports redeploy guidance when the VAPID key request answers with HTML', async () => {
    const { subscribe } = installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce(htmlResponse(200));

    await expect(subscribeUser()).rejects.toThrow(
      /does not include push-notification support.*Redeploy/i,
    );
    expect(subscribe).not.toHaveBeenCalled();
  });

  test('sendTestPush reports redeploy guidance when the test endpoint answers with HTML', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce(htmlResponse(200));
    await expect(sendTestPush()).rejects.toThrow(
      /does not include push-notification support.*Redeploy/i,
    );
  });

  test('getSettings reports redeploy guidance when the settings endpoint answers with HTML', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce(htmlResponse(200));
    await expect(getSettings()).rejects.toThrow(
      /does not include push-notification support.*Redeploy/i,
    );
  });

  test('subscribeUser reports redeploy guidance when /sw.js serves HTML', async () => {
    const mocks = installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    const registration = mocks.registration;
    registration.pushManager.subscribe = vi.fn();
    window.navigator.serviceWorker.register = vi
      .fn()
      .mockRejectedValue(new TypeError("Failed to register: unsupported MIME type ('text/html')"));
    fetch.mockResolvedValueOnce(htmlResponse(200));

    await expect(subscribeUser()).rejects.toThrow(/service worker.*not served.*redeploy/i);
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  test('subscribeUser rethrows the original error when /sw.js is served correctly', async () => {
    installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    const original = new TypeError('Failed to register: the script failed to load');
    window.navigator.serviceWorker.register = vi.fn().mockRejectedValue(original);
    fetch.mockResolvedValueOnce(jsonResponse('/* service worker */'));

    await expect(subscribeUser()).rejects.toBe(original);
  });

  test('unsubscribeUser succeeds idempotently when the backend answers with HTML (undeployed backend)', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-undeployed', unsubscribe },
    });
    fetch.mockResolvedValueOnce(htmlResponse(200));

    await expect(unsubscribeUser()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // A bare HTTP 200 that stored nothing (proxy, stale backend) must not
  // read as success: permission is granted, the UI says subscribed, and no
  // test notification can ever arrive. The browser subscription rolls back.
  test('subscribeUser rejects and rolls back when the server answers 200 without confirming the endpoint', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const { subscribe } = installPushMocks({ permission: 'granted' });
    subscribe.mockResolvedValue({
      endpoint: 'https://example.push/sub-1',
      unsubscribe,
      toJSON: () => ({ endpoint: 'https://example.push/sub-1', keys: { p256dh: 'a', auth: 'b' } }),
    });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });
    fetch.mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(subscribeUser()).rejects.toThrow(/did not confirm this browser.s subscription/);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('subscribeUser rejects and rolls back when the server confirms a different endpoint', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const { subscribe } = installPushMocks({ permission: 'granted' });
    subscribe.mockResolvedValue({
      endpoint: 'https://example.push/sub-1',
      unsubscribe,
      toJSON: () => ({ endpoint: 'https://example.push/sub-1', keys: { p256dh: 'a', auth: 'b' } }),
    });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });
    fetch.mockResolvedValueOnce(
      jsonResponse({ ok: true, subscription: { endpoint: 'https://example.push/other' } }),
    );

    await expect(subscribeUser()).rejects.toThrow(/Could not register the push subscription/);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // Deployments that predate push support answer POST /push/* with a JSON
  // 404 (the SPA fallback only serves HTML for GET). That must read as
  // redeploy guidance, not a bare "Not found".
  function notFoundResponse() {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  test('push API 404s report redeploy guidance instead of "Not found"', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce(notFoundResponse());
    await expect(getSettings()).rejects.toThrow(
      /does not include push-notification support.*Redeploy/i,
    );

    fetch.mockResolvedValueOnce(notFoundResponse());
    await expect(sendTestPush()).rejects.toThrow(
      /does not include push-notification support.*Redeploy/i,
    );
  });

  test('subscribeUser wraps a push API 404 as a failed registration with redeploy guidance', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const { subscribe } = installPushMocks({ permission: 'granted' });
    subscribe.mockResolvedValue({
      endpoint: 'https://example.push/sub-1',
      unsubscribe,
      toJSON: () => ({ endpoint: 'https://example.push/sub-1', keys: { p256dh: 'a', auth: 'b' } }),
    });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });
    fetch.mockResolvedValueOnce(notFoundResponse());

    await expect(subscribeUser()).rejects.toThrow(
      /does not include push-notification support.*Redeploy/i,
    );
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('unsubscribeUser still succeeds idempotently on a push API 404', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    installPushMocks({
      permission: 'granted',
      subscription: { endpoint: 'https://example.push/sub-404', unsubscribe },
    });
    fetch.mockResolvedValueOnce(notFoundResponse());

    await expect(unsubscribeUser()).resolves.toBe(true);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  // First-install race (fresh mobile browser): register() resolves while
  // the worker is still installing (active === null). The client must wait
  // for service-worker readiness instead of subscribing against an
  // inactive worker (AbortError, permission granted, nothing ever stored).
  test('subscribeUser waits for service-worker readiness on first install', async () => {
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://example.push/sub-ready',
      toJSON: () => ({
        endpoint: 'https://example.push/sub-ready',
        keys: { p256dh: 'a', auth: 'b' },
      }),
    });
    const readyRegistration = { active: { state: 'activated' }, pushManager: { subscribe } };
    installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    window.navigator.serviceWorker.register = vi
      .fn()
      .mockResolvedValue({ active: null, pushManager: { subscribe: vi.fn() } });
    Object.defineProperty(window.navigator.serviceWorker, 'ready', {
      value: Promise.resolve(readyRegistration),
      configurable: true,
      writable: true,
    });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        subscription: { endpoint: 'https://example.push/sub-ready' },
      }),
    });

    await subscribeUser();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[1][0]).toMatch(/\/push\/subscribe$/);
  });

  // Stale-worker refresh (repeat-tested mobile browsers): the device may
  // run an older /sw.js with no 'push' listener, so server-accepted test
  // pushes never display. Registration must pull the newest worker via
  // update() — best-effort, never fatal when the update itself fails.
  test('getServiceWorkerRegistration refreshes a stale worker via update()', async () => {
    installPushMocks({ permission: 'granted' });
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = { active: { state: 'activated' }, pushManager: {}, update };
    window.navigator.serviceWorker.register = vi.fn().mockResolvedValue(registration);

    await expect(getServiceWorkerRegistration()).resolves.toBe(registration);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test('getServiceWorkerRegistration still succeeds when the worker update fails', async () => {
    installPushMocks({ permission: 'granted' });
    const registration = {
      active: { state: 'activated' },
      pushManager: {},
      update: vi.fn().mockRejectedValue(new Error('update failed')),
    };
    window.navigator.serviceWorker.register = vi.fn().mockResolvedValue(registration);

    await expect(getServiceWorkerRegistration()).resolves.toBe(registration);
  });

  test('sendTestPush appends the first delivery error so the cause is visible', async () => {
    installPushMocks();
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error: 'Delivery failed for all 1 subscription(s) — check the server logs for details',
        result: {
          delivered: 0,
          subscriptions: 1,
          errors: [
            { endpoint: 'fcm.googleapis.com', statusCode: 401, message: 'VAPID key mismatch' },
          ],
        },
      }),
    });
    const error = await sendTestPush().catch((e) => e);
    expect(error?.message).toMatch(/VAPID key mismatch/);
    expect(error?.message).toMatch(/first delivery error from fcm\.googleapis\.com/);
  });

  // Bounded waits (flaky mobile networks): a stalled worker update or a
  // readiness promise that never settles must fall back to the original
  // registration, never hang the subscribe button forever.
  test('getServiceWorkerRegistration still succeeds when the worker update stalls', async () => {
    installPushMocks({ permission: 'granted' });
    const registration = {
      active: { state: 'activated' },
      pushManager: {},
      update: () => new Promise(() => undefined),
    };
    window.navigator.serviceWorker.register = vi.fn().mockResolvedValue(registration);

    await expect(getServiceWorkerRegistration({ settleTimeoutMs: 20 })).resolves.toBe(registration);
  });

  test('getServiceWorkerRegistration falls back when readiness never settles', async () => {
    installPushMocks({ permission: 'granted' });
    const registration = { active: null, pushManager: {} };
    window.navigator.serviceWorker.register = vi.fn().mockResolvedValue(registration);
    Object.defineProperty(window.navigator.serviceWorker, 'ready', {
      value: new Promise(() => undefined),
      configurable: true,
      writable: true,
    });

    await expect(getServiceWorkerRegistration({ settleTimeoutMs: 20 })).resolves.toBe(registration);
  });

  // Raw PushManager rejections must read as fixable guidance, not bare
  // browser error names — the "permission granted but nothing arrives" fix.
  test('subscribeUser maps a PushManager AbortError to a retryable error', async () => {
    const { subscribe } = installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    const abort = new Error('The Service Worker is not active');
    abort.name = 'AbortError';
    subscribe.mockRejectedValue(abort);
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });

    await expect(subscribeUser()).rejects.toThrow(/service worker may still be starting/i);
    // The VAPID key was fetched but the failed subscription was never
    // posted — no half-registered server state.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('subscribeUser throws actionable guidance when the registration has no push manager', async () => {
    installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    window.navigator.serviceWorker.register = vi
      .fn()
      .mockResolvedValue({ active: { state: 'activated' } });

    await expect(subscribeUser()).rejects.toThrow(/did not expose a push manager/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('urlBase64ToUint8Array rejects an empty key instead of failing cryptically', () => {
    expect(() => urlBase64ToUint8Array('')).toThrow(/usable push key/);
    expect(() => urlBase64ToUint8Array(null)).toThrow(/usable push key/);
  });

  test('subscribeUser reports an invalid server push key without touching PushManager', async () => {
    const { subscribe } = installPushMocks({ permission: 'granted' });
    window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: '!!!not-base64!!!' }),
    });

    await expect(subscribeUser()).rejects.toThrow(/invalid push key.*edeploy/i);
    expect(subscribe).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('settings requests keep the JSON content type (header merge, never dropped)', async () => {
    installPushMocks();
    fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    await getSettings();
    expect(fetch.mock.calls[0][1]?.headers?.['Content-Type']).toBe('application/json');
  });

  test('subscribeUser explains the Home-Screen requirement on iOS when subscription is rejected', async () => {
    const { subscribe } = installPushMocks({ permission: 'granted' });
    Object.defineProperty(window.navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      configurable: true,
    });
    try {
      window.Notification.requestPermission = vi.fn().mockResolvedValue('granted');
      const blocked = new Error('Push service not available');
      blocked.name = 'NotAllowedError';
      subscribe.mockRejectedValue(blocked);
      fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ publicKey: VAPID_KEY }) });

      await expect(subscribeUser()).rejects.toThrow(/Add to Home Screen/i);
    } finally {
      try {
        delete window.navigator.userAgent;
      } catch {}
    }
  });
});
