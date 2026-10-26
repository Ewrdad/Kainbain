import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { AppLinkSection } from './AppLinkSection';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: { updateAppStatus: vi.fn(), checkAppHealth: vi.fn() },
}));

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

import { api } from '../../services/api';

/***
 * MARK: AppLinkSection tests
 * @description Verifies the Application Link & Health settings card: drafts
 *   prefill from the stored link, save PATCHes the endpoint, blank clears,
 *   invalid URLs refuse locally, and the probe reports its outcome.
 ***/
describe('AppLinkSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const project = {
    id: 'p1',
    name: 'Alpha',
    appStatus: {
      url: 'http://localhost:5173',
      networkHost: 'home.home',
      resolvedUrl: 'http://home.home:5173/',
      status: 'running',
      healthEndpoint: '/health',
    },
  };

  it('prefills drafts and previews the resolved LAN URL', () => {
    renderWithKainBain(<AppLinkSection project={project} projectId="p1" />);
    expect(screen.getByLabelText('App URL')).toHaveValue('http://localhost:5173');
    expect(screen.getByLabelText('Network Host Override')).toHaveValue('home.home');
    expect(screen.getByLabelText('Health Endpoint')).toHaveValue('/health');
    expect(screen.getByText('http://home.home:5173/')).toBeInTheDocument();
  });

  it('saves the edited link through the endpoint and reports the update', async () => {
    const updated = {
      id: 'p1',
      appStatus: { ...project.appStatus, status: 'starting' },
    };
    api.updateAppStatus.mockResolvedValue(updated);
    const onChanged = vi.fn();
    renderWithKainBain(
      <AppLinkSection project={project} projectId="p1" onChanged={onChanged} />,
    );
    fireEvent.change(screen.getByLabelText('App URL'), {
      target: { value: 'http://localhost:3000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Link' }));
    await waitFor(() =>
      expect(api.updateAppStatus).toHaveBeenCalledWith('p1', {
        url: 'http://localhost:3000',
        networkHost: 'home.home',
        healthEndpoint: '/health',
        status: 'running',
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  });

  it('clears the link when the URL is blanked', async () => {
    api.updateAppStatus.mockResolvedValue({ id: 'p1' });
    renderWithKainBain(<AppLinkSection project={project} projectId="p1" />);
    fireEvent.change(screen.getByLabelText('App URL'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Link' }));
    await waitFor(() =>
      expect(api.updateAppStatus).toHaveBeenCalledWith('p1', { url: null }),
    );
  });

  it('refuses an invalid URL locally without calling the API', async () => {
    renderWithKainBain(<AppLinkSection project={project} projectId="p1" />);
    fireEvent.change(screen.getByLabelText('App URL'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'App URL must be an absolute http(s) URL.',
    );
    expect(api.updateAppStatus).not.toHaveBeenCalled();
  });

  it('probes health on demand and shows the outcome', async () => {
    const fresh = { ...project.appStatus, isHealthy: true, lastHealthCheck: '2026-10-04T16:05:00.000Z' };
    api.checkAppHealth.mockResolvedValue({
      healthy: true,
      statusCode: 200,
      latencyMs: 12,
      appStatus: fresh,
    });
    const onChanged = vi.fn();
    renderWithKainBain(
      <AppLinkSection project={project} projectId="p1" onChanged={onChanged} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Test Health' }));
    await waitFor(() => expect(api.checkAppHealth).toHaveBeenCalledWith('p1'));
    expect(await screen.findByTestId('applink-probe-result')).toHaveTextContent(
      '✓ Healthy — HTTP 200 in 12ms',
    );
    expect(onChanged).toHaveBeenCalledWith({ id: 'p1', appStatus: fresh });
  });

  it('disables probing until a link is saved', () => {
    renderWithKainBain(
      <AppLinkSection project={{ id: 'p1', name: 'Bare' }} projectId="p1" />,
    );
    expect(screen.getByRole('button', { name: 'Test Health' })).toBeDisabled();
  });

  it('surfaces save failures without throwing', async () => {
    api.updateAppStatus.mockRejectedValue(new Error('API 400 bad override'));
    renderWithKainBain(<AppLinkSection project={project} projectId="p1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save Link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('API 400 bad override');
  });
});
