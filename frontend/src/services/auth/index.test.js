import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  UNAUTHORIZED_EVENT,
  authFetch,
  fetchAuthStatus,
  listUsers,
  notifyUnauthorized,
  saveAuthSettings,
  setGroupMappings,
  setUserDisabled,
  setUserProjectRoles,
  setUserRoles,
  signOut,
  startLogin,
} from './index.js';

/***
 * MARK: auth service tests
 * @description Locks the frontend auth client: cookie credentials on every
 *   call, 401 broadcasts, request shapes for the admin APIs, and the
 *   fail-safe status read that keeps the default install working.
 ***/

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
  text: () => Promise.resolve(JSON.stringify(payload)),
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authFetch', () => {
  it('sends cookies and parses JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(authFetch('/auth/me')).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include' });
  });

  it('broadcasts on 401 and throws with the server code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'x', code: 'unauthenticated' }, 401)));
    const seen = [];
    window.addEventListener(UNAUTHORIZED_EVENT, () => seen.push(true), { once: true });
    await expect(authFetch('/auth/me')).rejects.toMatchObject({ status: 401, code: 'unauthenticated' });
    expect(seen).toEqual([true]);
  });

  it('notifies nothing outside a browser', () => {
    expect(() => notifyUnauthorized()).not.toThrow();
  });
});

describe('fetchAuthStatus', () => {
  it('fails safe to access-control-off when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    await expect(fetchAuthStatus()).resolves.toEqual({
      authEnabled: false,
      user: null,
      roles: ['admin'],
    });
  });
});

describe('auth request shapes', () => {
  it('posts logout and redirects the browser to the provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(signOut()).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/logout');

    startLogin();
    expect(window.location.href).toContain('/auth/login');
  });

  it('builds the admin API calls with encoded ids and JSON bodies', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    await listUsers();
    await setUserRoles('a/b', ['member']);
    await setUserProjectRoles('u', 'p/1', ['viewer']);
    await setUserDisabled('u', true);
    await setGroupMappings({ team: ['member'] });
    await saveAuthSettings({ authEnabled: true });
    const calls = fetchMock.mock.calls.map(
      ([url, opts]) => `${opts?.method || 'GET'} ${String(url).replace(/^https?:\/\/[^/]+/, '')}`,
    );
    expect(calls).toEqual([
      'GET /auth/users',
      'PUT /auth/users/a%2Fb/roles',
      'PUT /auth/users/u/projects/p%2F1/roles',
      'PUT /auth/users/u/disabled',
      'PUT /auth/group-mappings',
      'PUT /auth/settings',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ roles: ['member'] });
  });
});
