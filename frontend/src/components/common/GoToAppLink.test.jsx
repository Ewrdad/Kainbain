import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { GoToAppLink, appLinkState } from './GoToAppLink';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { checkAppHealth: vi.fn() },
}));

vi.mock('../../services/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}));

import { api } from '../../services/api';

/***
 * MARK: GoToAppLink tests
 * @description Verifies the shared "Go to App" link: hidden without a safe
 *   URL, resolved through the network override, status dot per lifecycle
 *   state, and the on-demand health probe.
 ***/
describe('appLinkState', () => {
  it('maps lifecycle states and failed probes to dot states', () => {
    expect(appLinkState(null)).toBe('hidden');
    expect(appLinkState({})).toBe('hidden');
    expect(appLinkState({ url: 'http://localhost:3000' })).toBe('running');
    expect(appLinkState({ url: 'http://localhost:3000', status: 'starting' })).toBe('starting');
    expect(appLinkState({ url: 'http://localhost:3000', status: 'degraded' })).toBe('degraded');
    expect(appLinkState({ url: 'http://localhost:3000', status: 'stopped' })).toBe('stopped');
    expect(appLinkState({ url: 'http://localhost:3000', status: 'running', isHealthy: true })).toBe('running');
    expect(appLinkState({ url: 'http://localhost:3000', status: 'running', isHealthy: false })).toBe('down');
  });

  it('reports hidden for non-string and blank URLs (matching the null render)', () => {
    expect(appLinkState({ url: 42 })).toBe('hidden');
    expect(appLinkState({ url: '' })).toBe('hidden');
    expect(appLinkState({ url: '   ' })).toBe('hidden');
    expect(appLinkState('http://localhost:3000')).toBe('hidden');
  });
});

describe('GoToAppLink', () => {
  it('renders nothing when the project has no link', () => {
    const { container } = renderWithKainBain(
      <GoToAppLink projectId="p1" appStatus={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a malicious stored URL', () => {
    const { container } = renderWithKainBain(
      <GoToAppLink projectId="p1" appStatus={{ url: 'javascript:alert(1)' }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the network-override URL with a running dot and tooltip', () => {
    renderWithKainBain(
      <GoToAppLink
        projectId="p1"
        appStatus={{
          url: 'http://localhost:5173',
          networkHost: 'home.home',
          status: 'running',
          healthEndpoint: '/health',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: /Open app \(running\)/i });
    expect(link).toHaveAttribute('href', 'http://home.home:5173/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
    expect(link).toHaveAttribute('title', expect.stringContaining('http://home.home:5173/'));
    expect(link).toHaveAttribute('title', expect.stringContaining('Health: /health'));
  });

  it('shows the starting pulse and header label in the header variant', () => {
    renderWithKainBain(
      <GoToAppLink
        projectId="p1"
        variant="header"
        appStatus={{ url: 'http://localhost:3000', status: 'starting' }}
      />,
    );
    expect(screen.getByRole('link', { name: /Open app \(starting\)/i })).toHaveTextContent('Go to App');
  });

  it('shows a red dot when the last probe failed', () => {
    renderWithKainBain(
      <GoToAppLink
        projectId="p1"
        appStatus={{ url: 'http://localhost:3000', status: 'running', isHealthy: false }}
      />,
    );
    expect(screen.getByRole('link', { name: /Open app \(unreachable\)/i })).toBeInTheDocument();
  });

  it('hides the probe button without a project id', () => {
    renderWithKainBain(
      <GoToAppLink appStatus={{ url: 'http://localhost:3000' }} />,
    );
    expect(screen.getByRole('link', { name: /Open app/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Check app health/i })).not.toBeInTheDocument();
  });

  it('probes on demand and reports the fresh link record', async () => {
    const fresh = { url: 'http://localhost:3000', isHealthy: true, lastHealthCheck: '2026-10-04T16:05:00.000Z' };
    api.checkAppHealth.mockResolvedValue({ healthy: true, appStatus: fresh });
    const onHealthChange = vi.fn();
    renderWithKainBain(
      <GoToAppLink projectId="p1" appStatus={{ url: 'http://localhost:3000' }} onHealthChange={onHealthChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Check app health now/i }));
    await waitFor(() => expect(api.checkAppHealth).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(onHealthChange).toHaveBeenCalledWith(fresh));
  });

  it('drops a malformed probe payload instead of corrupting the stored link', async () => {
    api.checkAppHealth.mockResolvedValue({ healthy: true, appStatus: 'not-a-record' });
    const onHealthChange = vi.fn();
    renderWithKainBain(
      <GoToAppLink projectId="p1" appStatus={{ url: 'http://localhost:3000' }} onHealthChange={onHealthChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Check app health now/i }));
    await waitFor(() => expect(api.checkAppHealth).toHaveBeenCalledWith('p1'));
    expect(onHealthChange).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Open app/i })).toBeInTheDocument();
  });

  it('renders nothing for a non-string stored URL', () => {
    const { container } = renderWithKainBain(
      <GoToAppLink projectId="p1" appStatus={{ url: 42 }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('survives a failed probe without throwing', async () => {
    api.checkAppHealth.mockRejectedValue(new Error('boom'));
    const onHealthChange = vi.fn();
    renderWithKainBain(
      <GoToAppLink projectId="p1" appStatus={{ url: 'http://localhost:3000' }} onHealthChange={onHealthChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Check app health now/i }));
    await waitFor(() => expect(api.checkAppHealth).toHaveBeenCalledWith('p1'));
    expect(onHealthChange).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /Open app/i })).toBeInTheDocument();
  });
});
