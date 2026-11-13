import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  getApiKeyUsage,
} from './index.js';

/***
 * MARK: api key service tests
 * @description Locks the API-key client facades: list, create (secret
 *   returned once), revoke, and per-key usage request shapes.
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

describe('api key facades', () => {
  it('lists keys', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ keys: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(listApiKeys()).resolves.toEqual({ keys: [] });
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/api-keys');
  });

  it('creates a key with its fields', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ key: { name: 's' }, secret: 'kb_x' }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const body = { name: 's', roles: ['member'], scopes: ['tasks:create'] };
    await expect(createApiKey(body)).resolves.toMatchObject({ secret: 'kb_x' });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);
  });

  it('revokes a key by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ key: {} }));
    vi.stubGlobal('fetch', fetchMock);
    await revokeApiKey('k 1');
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/api-keys/k%201');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE' });
  });

  it('loads one key usage view', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ key: {}, usage: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getApiKeyUsage('k1')).resolves.toEqual({ key: {}, usage: [] });
    expect(fetchMock.mock.calls[0][0]).toContain('/auth/api-keys/k1/usage');
  });
});
