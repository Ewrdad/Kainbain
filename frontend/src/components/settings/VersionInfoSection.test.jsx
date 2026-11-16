import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import { VersionInfoSection, versionStatusLabel } from './VersionInfoSection';

/***
 * MARK: VersionInfoSection tests
 * @description Covers the Settings About page section in every state: the
 *   loading shimmer, the update-available warning banner, the up-to-date
 *   and unknown version rows, the security summary plus full-report link,
 *   the honest no-report empty state, the load-error retry path, and the
 *   manual "Check for updates" refetch.
 * @example renderWithKainBain(<VersionInfoSection client={stub} />)
 ***/

const updatePayload = () => ({
  ui: { installed: '1.0.0', latest: '1.2.0', status: 'update-available', updateUrl: '#/docs/update-ui' },
  backend: { installed: '1.0.0', latest: '1.0.0', status: 'up-to-date', updateUrl: '#/docs/update-backend' },
  apis: [
    {
      name: 'screen-to-server',
      installed: '1.0.0',
      latest: null,
      status: 'unknown',
      accepts: { frontend: '>=1.0.0 <2.0.0' },
      updateUrl: '#/docs/update-api',
    },
  ],
  security: {
    status: 'pass',
    checkedAt: '2026-11-01T00:00:00.000Z',
    summary: 'Clean.',
    reportUrl: 'https://sec.example/build/1',
  },
  checkedAt: '2026-11-16T00:00:00.000Z',
  warnings: ['UI update available: 1.0.0 → 1.2.0'],
});

const stubClient = (payload) => ({
  getVersions: vi.fn().mockResolvedValue(payload),
});

const renderSection = (client, uiVersion = '1.0.0') =>
  renderWithKainBain(<VersionInfoSection client={client} uiVersion={uiVersion} />);

describe('versionStatusLabel', () => {
  it('names each state honestly', () => {
    expect(versionStatusLabel('update-available')).toBe('Update available');
    expect(versionStatusLabel('up-to-date')).toBe('Up to date');
    expect(versionStatusLabel('unknown')).toBe('Unknown');
    expect(versionStatusLabel('bogus')).toBe('Unknown');
  });
});

describe('VersionInfoSection', () => {
  it('shows a loading state before the fetch settles', () => {
    const client = { getVersions: vi.fn().mockReturnValue(new Promise(() => {})) };
    renderSection(client);
    expect(screen.getByText(/loading version information/i)).toBeInTheDocument();
  });

  it('shows the update banner, version rows, guide links, and security summary', async () => {
    const client = stubClient(updatePayload());
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalledWith('1.0.0'));

    expect(screen.getByRole('alert')).toHaveTextContent('UI update available: 1.0.0 → 1.2.0');
    expect(screen.getAllByText(/Installed: 1\.0\.0/)).toHaveLength(3);
    expect(screen.getByText(/Status: Update available/)).toBeInTheDocument();
    expect(screen.getByText(/Status: Up to date/)).toBeInTheDocument();
    expect(screen.getByText(/Status: Unknown/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /how to update ui/i })).toHaveAttribute(
      'href',
      '#/docs/update-ui',
    );
    expect(screen.getByRole('link', { name: /how to update backend/i })).toHaveAttribute(
      'href',
      '#/docs/update-backend',
    );
    expect(screen.getByRole('link', { name: /how to update api/i })).toHaveAttribute(
      'href',
      '#/docs/update-api',
    );

    expect(screen.getByText(/Status: pass/)).toBeInTheDocument();
    expect(screen.getByText('Clean.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the full report/i })).toHaveAttribute(
      'href',
      'https://sec.example/build/1',
    );
  });

  it('shows no banner when everything is up to date', async () => {
    const payload = updatePayload();
    payload.ui = { installed: '1.2.0', latest: '1.2.0', status: 'up-to-date', updateUrl: '#/docs/update-ui' };
    payload.warnings = [];
    const client = stubClient(payload);
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Status: Up to date/)).not.toHaveLength(0);
  });

  it('shows the honest empty state when no security report is recorded', async () => {
    const payload = updatePayload();
    payload.security = { status: 'unknown', checkedAt: null, summary: '', reportUrl: null };
    const client = stubClient(payload);
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalled());
    expect(screen.getByText(/no security report recorded for this build/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open the full report/i })).not.toBeInTheDocument();
  });

  it('retries after a load failure and refetches on Check for updates', async () => {
    const client = {
      getVersions: vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue(updatePayload()),
    };
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('alert')).toHaveTextContent(/could not check versions/i);

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(client.getVersions).toHaveBeenCalledTimes(2));
    expect(await screen.findAllByText(/Installed: 1\.0\.0/)).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
    await waitFor(() => expect(client.getVersions).toHaveBeenCalledTimes(3));
  });
});
