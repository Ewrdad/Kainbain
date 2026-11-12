import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiKeysSection } from './ApiKeysSection.jsx';

/***
 * MARK: api keys section tests
 * @description Locks the Access tab › API keys section: the enable toggle,
 *   the key table, the create flow with its one-time secret reveal, revoke
 *   with confirm, per-key usage, and the admin-only denied state.
 ***/

const mocks = vi.hoisted(() => ({
  getAuthSettings: vi.fn(),
  saveAuthSettings: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  getApiKeyUsage: vi.fn(),
}));

vi.mock('../../services/auth/index.js', () => mocks);
vi.mock('../../services/clipboard.js', () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

const settingsView = {
  knownRoles: ['admin', 'member', 'viewer'],
  knownApiKeyScopes: ['tasks:read', 'tasks:create'],
  enabled: true,
  apiKeysEnabled: false,
};

const keyRow = (overrides = {}) => ({
  id: 'k1',
  name: 'scanner',
  prefix: 'abcd1234',
  roles: ['member'],
  scopes: ['tasks:create'],
  expiresAt: null,
  createdBy: 'root',
  createdAt: '2026-01-01T00:00:00.000Z',
  lastUsedAt: null,
  revoked: false,
  revokedAt: null,
  ...overrides,
});

afterEach(() => {
  vi.clearAllMocks();
});

const loadSection = async (list = { keys: [], knownScopes: settingsView.knownApiKeyScopes }) => {
  mocks.getAuthSettings.mockResolvedValue(settingsView);
  mocks.listApiKeys.mockResolvedValue(list);
  render(<ApiKeysSection />);
  expect(await screen.findByTestId('api-keys-section')).toBeInTheDocument();
};

describe('ApiKeysSection', () => {
  it('toggles API keys on through the settings save', async () => {
    await loadSection();
    mocks.saveAuthSettings.mockResolvedValue({ ...settingsView, apiKeysEnabled: true });
    fireEvent.click(screen.getByLabelText('Enable API keys'));
    await waitFor(() => {
      expect(mocks.saveAuthSettings).toHaveBeenCalledWith({ apiKeysEnabled: true });
    });
    expect(await screen.findByText('API keys enabled.')).toBeInTheDocument();
  });

  it('lists keys with roles, scopes, and last-used state', async () => {
    await loadSection({
      keys: [keyRow(), keyRow({ id: 'k2', name: 'old', revoked: true, revokedAt: '2026-02-01T00:00:00.000Z' })],
      knownScopes: settingsView.knownApiKeyScopes,
    });
    expect(screen.getByTestId('apikey-row-k1')).toHaveTextContent('scanner');
    expect(screen.getByTestId('apikey-row-k1')).toHaveTextContent('tasks:create');
    expect(screen.getByTestId('apikey-row-k2')).toHaveTextContent('revoked');
  });

  it('creates a key and reveals the secret once with a copy button', async () => {
    await loadSection();
    const created = { key: keyRow(), secret: 'kb_test-secret-value' };
    mocks.createApiKey.mockResolvedValue(created);
    mocks.listApiKeys.mockResolvedValue({
      keys: [created.key],
      knownScopes: settingsView.knownApiKeyScopes,
    });

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'scanner' } });
    fireEvent.click(screen.getByRole('button', { name: /create key/i }));

    await waitFor(() => {
      expect(mocks.createApiKey).toHaveBeenCalledTimes(1);
    });
    const body = mocks.createApiKey.mock.calls[0][0];
    expect(body).toMatchObject({ name: 'scanner', roles: ['member'] });
    expect(typeof body.expiresAt).toBe('string');

    const reveal = await screen.findByTestId('apikey-secret-once');
    expect(reveal).toHaveTextContent('kb_test-secret-value');
    fireEvent.click(screen.getByRole('button', { name: /copy secret/i }));
    expect(await screen.findByText('Copied.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByTestId('apikey-secret-once')).not.toBeInTheDocument();
  });

  it('revokes only after confirm and reloads the list', async () => {
    await loadSection({ keys: [keyRow()], knownScopes: settingsView.knownApiKeyScopes });
    const originalConfirm = window.confirm;
    const confirm = vi.fn().mockReturnValue(false);
    window.confirm = confirm;
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    mocks.revokeApiKey.mockResolvedValue({ key: keyRow({ revoked: true }) });
    mocks.listApiKeys.mockResolvedValue({
      keys: [keyRow({ revoked: true })],
      knownScopes: settingsView.knownApiKeyScopes,
    });
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await waitFor(() => {
      expect(mocks.revokeApiKey).toHaveBeenCalledWith('k1');
    });
    expect(await screen.findByText('Key “scanner” revoked.')).toBeInTheDocument();
    window.confirm = originalConfirm;
  });

  it('expands per-key usage from the audit view', async () => {
    await loadSection({ keys: [keyRow()], knownScopes: settingsView.knownApiKeyScopes });
    mocks.getApiKeyUsage.mockResolvedValue({
      key: keyRow(),
      usage: [
        { at: '2026-03-01T00:00:00.000Z', action: 'apikey.used', detail: { method: 'POST', route: '/tasks' } },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /usage/i }));
    await waitFor(() => {
      expect(mocks.getApiKeyUsage).toHaveBeenCalledWith('k1');
    });
    const usage = await screen.findByTestId('apikey-usage-k1');
    expect(usage).toHaveTextContent('apikey.used');
    expect(usage).toHaveTextContent('POST /tasks');
  });

  it('shows the denied state for non-managers', async () => {
    mocks.getAuthSettings.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    mocks.listApiKeys.mockResolvedValue({ keys: [] });
    render(<ApiKeysSection />);
    expect(await screen.findByTestId('apikeys-denied')).toBeInTheDocument();
  });
});
