import React from 'react';
import { Routes, Route, useLocation } from 'react-router';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import { SystemSettingsPage } from './SystemSettingsPage';
import { SYSTEM_SETTINGS_POPOUT_NAME } from './openSystemSettings';
import { SETTINGS_TAB_LABELS } from './settingsTabs';

/***
 * MARK: SystemSettingsPage tests
 * @description Covers the dedicated `/system-settings` screen shell: it renders
 *   at both canonical paths, drives the tab from the URL (deep link, query
 *   param, unknown-id fail-safe), routes tab clicks back into the URL, and
 *   turns the primary affordance into a window close inside the popout. The
 *   panels themselves are covered by SystemSettingsContent.test.jsx.
 * @example renderWithKainBain(<PageRoutes />, {}, { initialEntries: ['/system-settings/models'] })
 ***/

const HARNESS_ROWS = vi.hoisted(() => [
  {
    id: 'pi',
    name: 'pi coding agent',
    description: 'pi-backed AgentHarness.',
    capabilities: { createSession: true, listModels: true },
    modelSelection: 'list',
    modelFlag: null,
    isDefault: true,
    available: null,
    detectionSource: 'unknown',
  },
]);

const getHarnesses = vi.hoisted(() => vi.fn());
const getHarnessModels = vi.hoisted(() => vi.fn());
const getConfigSpec = vi.hoisted(() => vi.fn());
const getModels = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getHarnesses, getHarnessModels, getConfigSpec, getModels },
}));

vi.mock('../../services/pushNotifications', async () => {
  const actual = await vi.importActual('../../services/pushNotifications');
  return {
    pushNotifications: {
      describePushState: actual.describePushState,
      permissionLabel: actual.permissionLabel,
      getSubscriptionState: vi
        .fn()
        .mockResolvedValue({ supported: true, permission: 'granted', subscribed: false }),
      getSettings: vi.fn().mockResolvedValue({
        enabled: true,
        triggers: { queueEmpty: true, unrecoverableStageError: true },
        stages: {},
      }),
      updateSettings: vi.fn(),
      subscribeUser: vi.fn(),
      unsubscribeUser: vi.fn(),
      sendTestPush: vi.fn(),
    },
  };
});

function PathProbe() {
  const location = useLocation();
  return <span data-testid="pathname">{location.pathname}</span>;
}

function PageRoutes() {
  return (
    <>
      <Routes>
        <Route path="/system-settings" element={<SystemSettingsPage />} />
        <Route path="/system-settings/:section" element={<SystemSettingsPage />} />
        <Route path="/" element={<span data-testid="board" />} />
      </Routes>
      <PathProbe />
    </>
  );
}

function renderAt(entry, overrides = {}) {
  return renderWithKainBain(<PageRoutes />, overrides, { initialEntries: [entry] });
}

beforeEach(() => {
  window.localStorage.clear();
  getHarnesses.mockReset();
  getHarnessModels.mockReset();
  getConfigSpec.mockReset();
  getModels.mockReset();
  getHarnesses.mockResolvedValue({ harnesses: HARNESS_ROWS });
  getHarnessModels.mockResolvedValue({ models: [] });
  getConfigSpec.mockResolvedValue({ entries: [], warnings: [] });
  getModels.mockResolvedValue({
    models: [],
    harnesses: [{ id: 'pi', label: 'pi', modelSelection: 'list', isDefault: true, models: [] }],
  });
  delete window.name;
});

afterEach(() => {
  delete window.name;
});

describe('SystemSettingsPage', () => {
  it('renders the full screen at /system-settings with an h1 and the default Harness tab', async () => {
    renderAt('/system-settings');
    expect(screen.getByTestId('system-settings-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'System Settings' })).toBeInTheDocument();
    // Default section: no /:section segment means the first tab.
    expect(screen.getByRole('tab', { name: 'Harness' })).toHaveAttribute('aria-selected', 'true');
    for (const label of SETTINGS_TAB_LABELS) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    // No modal shell remains: the screen is not a dialog.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deep-links the tab from the /:section path segment', async () => {
    renderAt('/system-settings/models');
    expect(screen.getByRole('tab', { name: 'Models' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Harness' })).toHaveAttribute('aria-selected', 'false');
  });

  it('deep-links the tab from the ?section= query param', async () => {
    renderAt('/system-settings?section=storage');
    expect(screen.getByRole('tab', { name: 'Storage' })).toHaveAttribute('aria-selected', 'true');
  });

  it('falls back to the first tab for an unknown section without breaking the screen', async () => {
    renderAt('/system-settings/does-not-exist');
    expect(screen.getByTestId('system-settings-page')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Harness' })).toHaveAttribute('aria-selected', 'true');
  });

  it('routes tab clicks into the URL so the tab is refresh-safe and shareable', async () => {
    renderAt('/system-settings');
    expect(screen.getByTestId('pathname')).toHaveTextContent('/system-settings');

    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
    await waitFor(() =>
      expect(screen.getByTestId('pathname')).toHaveTextContent('/system-settings/notifications'),
    );
    expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('Back to Board navigates same-tab (setView orchestrator) outside a popout', async () => {
    const setView = vi.fn();
    renderAt('/system-settings', { setView });

    fireEvent.click(screen.getByRole('button', { name: 'Back to Board' }));
    expect(setView).toHaveBeenCalledWith('orchestrator');
  });

  it('Done navigates same-tab (setView orchestrator) outside a popout', async () => {
    const setView = vi.fn();
    renderAt('/system-settings', { setView });

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(setView).toHaveBeenCalledWith('orchestrator');
  });

  it('renders a Close window affordance and closes the popout document', async () => {
    const close = vi.fn();
    const setView = vi.fn();
    Object.defineProperty(window, 'name', {
      value: SYSTEM_SETTINGS_POPOUT_NAME,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'opener', {
      value: {},
      configurable: true,
      writable: true,
    });
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(close);

    try {
      renderAt('/system-settings', { setView });
      const closeButton = screen.getByRole('button', { name: 'Close window' });
      fireEvent.click(closeButton);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      // A popout close must NOT drag the shared board history along.
      expect(setView).not.toHaveBeenCalled();
    } finally {
      closeSpy.mockRestore();
      delete window.opener;
    }
  });
});
