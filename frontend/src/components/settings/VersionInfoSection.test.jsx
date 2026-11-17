import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import {
  VersionInfoSection,
  describeAcceptsMap,
  isSafeVersionLink,
  labelVersionStatus,
} from './VersionInfoSection';

/***
 * MARK: VersionInfoSection tests
 * @description Covers the Settings About page section in every state: the
 *   loading shimmer, the update-available warning banner, the up-to-date
 *   and unknown version rows with their compatibility map, the security
 *   summary plus full-report link, the honest no-report empty state, the
 *   load-error retry path, the manual "Check for updates" refetch, and the
 *   fail-safe rendering of hostile or malformed payloads.
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

describe('labelVersionStatus', () => {
  it('names each state honestly', () => {
    expect(labelVersionStatus('update-available')).toBe('Update available');
    expect(labelVersionStatus('up-to-date')).toBe('Up to date');
    expect(labelVersionStatus('unknown')).toBe('Unknown');
    expect(labelVersionStatus('bogus')).toBe('Unknown');
  });
});

describe('isSafeVersionLink', () => {
  it('allows the page guides, http(s) reports, and site-relative paths', () => {
    expect(isSafeVersionLink('#/docs/update-ui')).toBe(true);
    expect(isSafeVersionLink('https://sec.example/build/1')).toBe(true);
    expect(isSafeVersionLink('http://sec.example/build/1')).toBe(true);
    expect(isSafeVersionLink('/docs/update-ui')).toBe(true);
  });

  it('refuses script and sneaky URLs so a bad report file cannot arm a link', () => {
    expect(isSafeVersionLink('javascript:alert(1)')).toBe(false);
    expect(isSafeVersionLink('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeVersionLink('//evil.example/report')).toBe(false);
    expect(isSafeVersionLink('data:text/html,<h1>x</h1>')).toBe(false);
    expect(isSafeVersionLink('')).toBe(false);
    expect(isSafeVersionLink(null)).toBe(false);
    expect(isSafeVersionLink(undefined)).toBe(false);
  });
});

describe('describeAcceptsMap', () => {
  it('lists who must satisfy which range', () => {
    expect(describeAcceptsMap({ frontend: '>=1.0.0 <2.0.0' })).toBe(
      'frontend >=1.0.0 <2.0.0',
    );
    expect(
      describeAcceptsMap({ frontend: '>=1.0.0 <2.0.0', runner: '>=1.0.0 <2.0.0' }),
    ).toBe('frontend >=1.0.0 <2.0.0, runner >=1.0.0 <2.0.0');
  });

  it('stays empty for missing or malformed maps', () => {
    expect(describeAcceptsMap(undefined)).toBe('');
    expect(describeAcceptsMap(null)).toBe('');
    expect(describeAcceptsMap('>=1.0.0')).toBe('');
    expect(describeAcceptsMap(['frontend'])).toBe('');
    expect(describeAcceptsMap({})).toBe('');
    expect(describeAcceptsMap({ frontend: '' })).toBe('');
    expect(describeAcceptsMap({ frontend: 42 })).toBe('');
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

  it('shows the API compatibility map on the API row', async () => {
    const client = stubClient(updatePayload());
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalled());
    expect(screen.getByText(/Accepts: frontend >=1\.0\.0 <2\.0\.0/)).toBeInTheDocument();
  });

  it('shows a failed security report with its summary', async () => {
    const payload = updatePayload();
    payload.security = {
      status: 'fail',
      checkedAt: '2026-11-02T00:00:00.000Z',
      summary: '2 critical findings.',
      reportUrl: null,
    };
    const client = stubClient(payload);
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalled());
    expect(screen.getByText(/Status: fail/)).toBeInTheDocument();
    expect(screen.getByText('2 critical findings.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open the full report/i })).not.toBeInTheDocument();
  });

  it('never renders a hostile report URL as a link', async () => {
    const payload = updatePayload();
    payload.security = {
      status: 'pass',
      checkedAt: '2026-11-01T00:00:00.000Z',
      summary: 'Clean.',
      reportUrl: 'javascript:alert(1)',
    };
    payload.ui.updateUrl = 'javascript:alert(1)';
    const client = stubClient(payload);
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /open the full report/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /how to update ui/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how to update backend/i })).toBeInTheDocument();
  });

  it('renders honest Unknown rows for a malformed payload instead of crashing', async () => {
    const client = stubClient({
      ui: null,
      backend: { installed: 42, latest: null, status: 'bogus', updateUrl: null },
      apis: 'not-a-list',
      security: null,
      warnings: 'not-a-list',
    });
    renderSection(client);
    await waitFor(() => expect(client.getVersions).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Status: Unknown/)).not.toHaveLength(0);
    expect(screen.getByText(/no security report recorded for this build/i)).toBeInTheDocument();
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
