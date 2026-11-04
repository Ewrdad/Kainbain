import { expect, test, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ImageGenSection, providerStatusLabel } from './ImageGenSection';
import '@testing-library/jest-dom';

/***
 * MARK: ImageGenSection tests
 * @description Verifies System Settings › Images: provider rows with honest
 *   configured/env/keyless states, immediate key save/clear (keys never
 *   displayed back), dry-run test flows, and load-error recovery.
 ***/

const catalogue = [
  {
    id: 'muse',
    label: 'Muse Image (Meta)',
    description: 'Meta Muse Image via the Meta Model API.',
    requiresKey: true,
    configured: false,
    source: null,
  },
  {
    id: 'mock',
    label: 'Mock (offline tests)',
    description: 'Deterministic fixture PNG.',
    requiresKey: false,
    configured: true,
    source: null,
  },
];

const mockClient = (overrides = {}) => ({
  getImageGenProviders: vi.fn(async () => ({ providers: catalogue })),
  saveImageGenKey: vi.fn(async () => ({ providerId: 'muse', configured: true, source: 'stored' })),
  clearImageGenKey: vi.fn(async () => ({ providerId: 'muse', configured: false, source: null })),
  testImageGenProvider: vi.fn(async () => ({ ok: true, bytes: 68, ms: 12 })),
  ...overrides,
});

test('providerStatusLabel distinguishes keyless, env, stored, and missing keys', () => {
  expect(providerStatusLabel({ requiresKey: false, configured: true })).toBe('No key needed');
  expect(providerStatusLabel({ requiresKey: true, configured: false })).toBe('Not configured');
  expect(providerStatusLabel({ requiresKey: true, configured: true, source: 'env' })).toBe(
    'Configured via environment',
  );
  expect(providerStatusLabel({ requiresKey: true, configured: true, source: 'stored' })).toBe('Configured');
});

test('renders one row per provider with honest statuses', async () => {
  renderWithKainBain(<ImageGenSection client={mockClient()} />);
  expect(await screen.findByTestId('image-gen-provider-muse')).toBeInTheDocument();
  expect(screen.getByTestId('image-gen-status-muse')).toHaveTextContent('Not configured');
  expect(screen.getByTestId('image-gen-status-mock')).toHaveTextContent('No key needed');
  // The keyless mock row has no key input — only Test.
  expect(screen.queryByLabelText('API key for Mock (offline tests)')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Test Mock (offline tests)' })).toBeInTheDocument();
});

test('shows the env-configured state for environment-backed keys', async () => {
  const client = mockClient({
    getImageGenProviders: async () => ({
      providers: [{ ...catalogue[0], configured: true, source: 'env' }, catalogue[1]],
    }),
  });
  renderWithKainBain(<ImageGenSection client={client} />);
  expect(await screen.findByTestId('image-gen-status-muse')).toHaveTextContent('Configured via environment');
});

test('saving a key persists immediately, clears the input, and never echoes the key', async () => {
  const client = mockClient();
  renderWithKainBain(<ImageGenSection client={client} />);
  const input = await screen.findByLabelText('API key for Muse Image (Meta)');
  fireEvent.change(input, { target: { value: 'sk-live-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save API key for Muse Image (Meta)' }));
  await waitFor(() => expect(client.saveImageGenKey).toHaveBeenCalledWith('muse', 'sk-live-secret'));
  expect(await screen.findByText('API key saved for Muse Image (Meta).')).toBeInTheDocument();
  expect(input.value).toBe('');
  expect(screen.getByTestId('image-gen-status-muse')).toHaveTextContent('Configured');
  expect(document.body.textContent).not.toContain('sk-live-secret');
});

test('clearing reports honestly when an environment key stays active', async () => {
  const client = mockClient({
    clearImageGenKey: async () => ({ providerId: 'muse', configured: true, source: 'env' }),
  });
  renderWithKainBain(<ImageGenSection client={client} />);
  await screen.findByTestId('image-gen-provider-muse');
  fireEvent.click(screen.getByRole('button', { name: 'Clear API key for Muse Image (Meta)' }));
  expect(await screen.findByText(/environment key is still active/)).toBeInTheDocument();
  expect(screen.getByTestId('image-gen-status-muse')).toHaveTextContent('Configured via environment');
});

test('test runs a dry run and reports bytes, surfacing failures', async () => {
  const client = mockClient();
  renderWithKainBain(<ImageGenSection client={client} />);
  await screen.findByTestId('image-gen-provider-mock');
  fireEvent.click(screen.getByRole('button', { name: 'Test Mock (offline tests)' }));
  expect(await screen.findByText(/generated a test image \(68 bytes in 12ms\)/)).toBeInTheDocument();

  client.testImageGenProvider.mockRejectedValueOnce(new Error('provider down'));
  fireEvent.click(screen.getByRole('button', { name: 'Test Muse Image (Meta)' }));
  expect(await screen.findByText(/test failed: provider down/)).toBeInTheDocument();
});

test('load failure shows an alert with a working retry', async () => {
  const client = mockClient({
    getImageGenProviders: vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ providers: catalogue }),
  });
  renderWithKainBain(<ImageGenSection client={client} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('image-gen-provider-muse')).toBeInTheDocument();
});
