import React from 'react';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { renderWithKainBain } from '../../testUtils';
import { SystemSettingsContent } from './SystemSettingsContent';
import { SETTINGS_TAB_LABELS, SETTINGS_TABS } from './settingsTabs';

/***
 * MARK: SystemSettingsContent tests
 * @description Covers the shell-agnostic System Settings content: the tablist
 *   from SETTINGS_TABS, the Runners / Models / Engine / Storage /
 *   Notifications / Prompt Layout / UI panels, the footer Reset/Done contract,
 *   and the caller-driven chrome (onBack/onClose/headingLevel). The page shell
 *   (routing, deep links, popout) is covered by SystemSettingsPage.test.jsx;
 *   this suite proves the shared content both shells render.
 * @example renderWithKainBain(<SystemSettingsContent onClose={close} />, contentOverrides())
 ***/

const RUNNER_ROWS = vi.hoisted(() => [
  {
    runnerId: 'r1',
    status: 'active',
    facts: { versions: { runner: '0.3.0', protocol: 'v1' } },
    capabilities: { harnesses: [{ id: 'pi' }, { id: 'vibe' }] },
    projectScope: null,
    paused: false,
    lastSeenAt: null,
    operatorConfig: {
      displayName: null,
      availableTools: null,
      jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
      directories: { masterDir: '/srv/kb', worktreeDir: '/srv/kb-trees' },
      projectScope: null,
    },
  },
]);

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());
const listProjects = vi.hoisted(() => vi.fn());
const getConfigSpec = vi.hoisted(() => vi.fn());
const getModels = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getRunners, getRunnerMonitor, listProjects, getConfigSpec, getModels },
}));

const mockPushState = vi.hoisted(() => vi.fn());
const mockPushSettings = vi.hoisted(() => vi.fn());

vi.mock('../../services/pushNotifications', async () => {
  const actual = await vi.importActual('../../services/pushNotifications');
  return {
    pushNotifications: {
      // Pure helpers stay real: the section's status copy comes from them.
      describePushState: actual.describePushState,
      permissionLabel: actual.permissionLabel,
      getSubscriptionState: (...args) => mockPushState(...args),
      getSettings: (...args) => mockPushSettings(...args),
      updateSettings: vi.fn(),
      subscribeUser: vi.fn(),
      unsubscribeUser: vi.fn(),
      sendTestPush: vi.fn(),
    },
  };
});

const CONFIG_SPEC_PAYLOAD = vi.hoisted(() => ({
  entries: [
    {
      key: 'projectsRoot',
      env: 'PROJECTS_ROOT',
      value: '/home/server/projects',
      default: '/home/server/projects',
      type: 'path',
      group: 'storage',
      doc: 'Projects root doc.',
      source: 'env',
      secret: false,
    },
    {
      key: 'siteDocsDir',
      env: 'KAINBAIN_SITE_DOCS',
      value: '/repo/site-docs',
      default: '/repo/site-docs',
      type: 'path',
      group: 'storage',
      doc: 'Site docs doc.',
      source: 'default',
      secret: false,
    },
    {
      key: 'notesSpaceRoot',
      env: 'NOTES_SPACE_ROOT',
      value: '/notes',
      default: '/notes',
      type: 'path',
      group: 'storage',
      doc: 'Notes doc.',
      source: 'default',
      secret: false,
    },
    {
      key: 'agyBin',
      env: 'KAINBAIN_AGY_BIN',
      value: 'agy',
      default: 'agy',
      type: 'string',
      group: 'harnesses',
      doc: 'agy doc.',
      source: 'default',
      secret: false,
    },
    {
      key: 'museBin',
      env: 'KAINBAIN_MUSE_BIN',
      value: 'muse',
      default: 'muse',
      type: 'string',
      group: 'harnesses',
      doc: 'muse doc.',
      source: 'default',
      secret: false,
    },
    {
      key: 'opencodeBin',
      env: 'KAINBAIN_OPENCODE_BIN',
      value: 'opencode',
      default: 'opencode',
      type: 'string',
      group: 'harnesses',
      doc: 'opencode doc.',
      source: 'default',
      secret: false,
    },
    {
      key: 'distDir',
      env: 'KAINBAIN_DIST',
      value: '/repo/frontend/dist',
      default: '/repo/frontend/dist',
      type: 'path',
      group: 'storage',
      doc: 'Dist doc.',
      source: 'default',
      secret: false,
    },
  ],
  warnings: [],
}));

/**
 * MARK: configSpecWithRefresh
 * @description Builds the config-spec payload with the model-refresh toggle
 *   pinned, so the runtime-config precedence path can be exercised (the
 *   default fixture omits the key and falls back to the build-time flag).
 */
function configSpecWithRefresh(value) {
  return {
    ...CONFIG_SPEC_PAYLOAD,
    entries: [
      ...CONFIG_SPEC_PAYLOAD.entries,
      {
        key: 'refreshModelsOnHarnessRefresh',
        env: 'KAINBAIN_REFRESH_MODELS_ON_HARNESS_REFRESH',
        value,
        default: true,
        type: 'bool',
        group: 'health',
        doc: 'System Settings harness Refresh also re-runs the shared model catalogue.',
        source: 'env',
        secret: false,
      },
    ],
  };
}

function contentOverrides(overrides = {}) {
  return {
    harnessPrefs: {},
    updateHarnessPref: vi.fn(),
    resetHarnessPrefs: vi.fn(),
    ...overrides,
  };
}

function renderContent(props = {}, overrides = {}) {
  return renderWithKainBain(
    <SystemSettingsContent onClose={vi.fn()} {...props} />,
    contentOverrides(overrides),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  getRunners.mockReset();
  getRunnerMonitor.mockReset();
  listProjects.mockReset();
  getConfigSpec.mockReset();
  getModels.mockReset();
  getRunners.mockResolvedValue(structuredClone(RUNNER_ROWS));
  getRunnerMonitor.mockResolvedValue({ liveAssignments: [] });
  listProjects.mockResolvedValue([{ id: 'p1', name: 'Project One' }]);
  getConfigSpec.mockResolvedValue(CONFIG_SPEC_PAYLOAD);
  getModels.mockResolvedValue({
    models: [{ id: 'model-1', name: 'Model One', provider: 'ollama-cloud' }],
    harnesses: [{ id: 'pi', label: 'pi', modelSelection: 'list', isDefault: true, models: [] }],
  });
  mockPushState.mockReset();
  mockPushSettings.mockReset();
  mockPushState.mockResolvedValue({ supported: true, permission: 'granted', subscribed: false });
  mockPushSettings.mockResolvedValue({
    enabled: true,
    triggers: { queueEmpty: true, unrecoverableStageError: true },
    stages: {},
  });
});

describe('SystemSettingsContent', () => {
  it('renders the title, close control, and one tab per SETTINGS_TABS entry', async () => {
    renderContent();
    // Flush the Harness tab's async registry load so its state updates land
    // inside act() rather than after the assertions below.
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.getByText('System Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Close system settings/i })).toBeInTheDocument();
    // Drift guard: the rendered tablist derives from SETTINGS_TABS, so a new
    // tab can never silently outrun the expectations again.
    for (const tab of SETTINGS_TAB_LABELS) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(SETTINGS_TAB_LABELS.length);
    expect(screen.getByRole('tab', { name: 'Runners' })).toHaveAttribute('aria-selected', 'true');
  });

  it('renders an h1 when headingLevel is h1 (page chrome) and an h2 by default', async () => {
    const { unmount } = renderContent({ headingLevel: 'h1' });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'System Settings' })).toBeInTheDocument();
    unmount();

    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'System Settings' })).toBeInTheDocument();
  });

  it('renders the back affordance only when onBack is given, with a caller-supplied label', async () => {
    const onBack = vi.fn();
    renderContent({ onBack });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    const back = screen.getByRole('button', { name: 'Back to Board' });
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('uses the custom backLabel for the page popout ("Close window")', async () => {
    const onBack = vi.fn();
    renderContent({ onBack, backLabel: 'Close window' });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Board' })).not.toBeInTheDocument();
  });

  it('renders neither back nor close control when the shell passes neither callback', async () => {
    renderWithKainBain(<SystemSettingsContent />, contentOverrides());
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back to Board/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Close system settings/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the footer Reset exactly on the tabs that declare it', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    for (const tab of SETTINGS_TABS) {
      fireEvent.click(screen.getByRole('tab', { name: tab.label }));
      if (tab.showFooterReset) {
        expect(screen.getByRole('button', { name: 'Reset', exact: true })).toBeInTheDocument();
      } else {
        expect(
          screen.queryByRole('button', { name: 'Reset', exact: true }),
        ).not.toBeInTheDocument();
      }
    }
  });

  it('lists one roster row per registered Runner with the detail form', async () => {
    renderContent();

    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.getByTestId('runner-row-r1')).toBeInTheDocument();
    expect(screen.getByTestId('runner-status-r1')).toHaveTextContent('active');
    // All five detail areas render for the selected Runner.
    expect(screen.getByTestId('runner-name-r1')).toBeInTheDocument();
    expect(screen.getByTestId('runner-unload-project-p1')).toBeInTheDocument();
    expect(screen.getByTestId('runner-tool-r1-pi')).toBeInTheDocument();
    expect(screen.getByTestId('runner-masterdir-r1')).toBeInTheDocument();
    expect(screen.getByTestId('runner-job-r1-runsCi')).toBeInTheDocument();
  });

  it('shows the draft-only note on non-runners tabs and closes via Done', async () => {
    const onClose = vi.fn();
    renderContent({ onClose });
    // Flush the Runners tab's async registry load (see above).
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    expect(screen.getByText(/Wireframe — changes here are not saved yet/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to onBack for Done when no onClose is supplied', async () => {
    const onBack = vi.fn();
    renderContent({ onClose: undefined, onBack });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('edits draft fields locally without touching persistence', async () => {
    const onClose = vi.fn();
    renderContent({ onClose });
    // Flush the Runners tab's async registry load (see above).
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    const defaultModel = screen.getByLabelText('Default model');
    fireEvent.change(defaultModel, { target: { value: 'pi::ollama-cloud::glm-5' } });
    expect(defaultModel).toHaveValue('pi::ollama-cloud::glm-5');

    // Draft-only: no persistence write and no close on change.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Reset restores the draft defaults and the close button closes', async () => {
    const onClose = vi.fn();
    renderContent({ onClose });
    // Flush the Runners tab's async registry load (see above).
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Engine' }));
    const maxConcurrent = screen.getByLabelText('Max concurrent tasks');
    fireEvent.change(maxConcurrent, { target: { value: '8' } });
    expect(maxConcurrent).toHaveValue(8);
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByLabelText('Max concurrent tasks')).toHaveValue(1);

    fireEvent.click(screen.getByRole('button', { name: /Close system settings/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Storage tab renders live backend values with no wireframe note or fake paths', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
    expect(screen.getByLabelText('Projects folder')).toHaveValue('/home/server/projects');
    expect(screen.getByLabelText('Installation directory')).toHaveValue('/repo');
    expect(
      screen.queryByText(/Wireframe — changes here are not saved yet/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('~/.kainbain')).not.toBeInTheDocument();
  });

  it('Reset on the Storage tab reloads live values instead of draft constants', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
    const callsAfterOpen = getConfigSpec.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => {
      expect(getConfigSpec.mock.calls.length).toBeGreaterThan(callsAfterOpen);
    });
    expect(await screen.findByTestId('storage-section')).toBeInTheDocument();
    expect(screen.getByLabelText('Projects folder')).toHaveValue('/home/server/projects');
  });

  it('keeps header, tab bar, and footer unshrunk while the details pane scrolls (task 5ad55777)', async () => {
    // Layout invariant: on short phone screens the flex column runs out of
    // room, and only the details pane may shrink/scroll — the bars must hold
    // their full height so no tab label clips at the content edge.
    const { container } = renderContent();
    // Flush the Runners tab's async registry load (see above).
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    expect(container.querySelector('header')).toHaveClass('shrink-0');
    expect(screen.getByRole('tablist', { name: 'System settings sections' })).toHaveClass(
      'shrink-0',
    );
    expect(container.querySelector('footer')).toHaveClass('shrink-0');

    const tablist = screen.getByRole('tablist', {
      name: 'System settings sections',
    });
    const content = tablist.nextElementSibling;
    expect(content).toHaveClass('flex-1', 'min-h-0', 'overflow-y-auto');
  });

  it('Models tab shows the live catalogue count and a Refresh action that bypasses both caches', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    expect(await screen.findByTestId('model-catalogue-count')).toHaveTextContent(
      '1 models across 1 harnesses',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Refresh models' }));
    await waitFor(() => expect(getModels).toHaveBeenCalledWith(true));
  });

  it('Models tab explains itself instead of offering Refresh when config disables it', async () => {
    getConfigSpec.mockResolvedValue(configSpecWithRefresh(false));
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    const note = await screen.findByTestId('model-refresh-disabled-note');
    expect(note).toHaveTextContent('refreshModelsOnHarnessRefresh');
    expect(screen.queryByRole('button', { name: 'Refresh models' })).not.toBeInTheDocument();
  });

  it('Runners tab selects the first Runner by default', async () => {
    renderContent();
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-select-r1')).toHaveAttribute('aria-pressed', 'true');
  });

  it('Models Refresh bypasses both caches when config enables it', async () => {
    renderContent();
    await screen.findByTestId('runner-detail-r1');

    fireEvent.click(screen.getByRole('tab', { name: 'Models' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh models' }));

    await waitFor(() => expect(getModels).toHaveBeenCalledWith(true));
  });

  it('Notifications tab renders the push section with permission status', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
    expect(await screen.findByTestId('push-permission-badge')).toHaveTextContent('Allowed');
    expect(screen.getByRole('button', { name: /Enable push notifications/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send test notification/i })).toBeInTheDocument();
  });

  it('UI tab renders the app-wide preferences panel without the draft note', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'UI' }));
    expect(screen.getByRole('tab', { name: 'UI' })).toHaveAttribute('aria-selected', 'true');
    // UiPreferencesPanel sections land in the UI tabpanel — the same panel
    // that used to live under Project Settings.
    expect(screen.getByText('🎨 Appearance')).toBeInTheDocument();
    expect(screen.getByText('🗂️ Workspace')).toBeInTheDocument();
    // The UI panel persists to localStorage immediately, so unlike the
    // draft-only Models/Engine tabs there is no wireframe note here.
    expect(
      screen.queryByText(/Wireframe — changes here are not saved yet/i),
    ).not.toBeInTheDocument();
  });

  it('UI tab closes via Done like every other section', async () => {
    const onClose = vi.fn();
    renderContent({ onClose });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'UI' }));
    expect(screen.getByText('🎨 Appearance')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Sound & Alerts tab links through to the Notifications section', async () => {
    const onSectionChange = vi.fn();
    renderContent({ onSectionChange });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'UI' }));
    fireEvent.click(screen.getByText('🔔 Sound & Alerts'));
    expect(screen.getByText('System Notifications (Web Push)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Manage push notifications/i }));
    // The link switches the content straight to the push notifications tab
    // and reports the change to the owning shell (the page routes on it).
    expect(await screen.findByTestId('push-permission-badge')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Notifications' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(onSectionChange).toHaveBeenCalledWith('notifications');
  });

  it('Reset is hidden on the auto-saving UI and Notifications tabs', async () => {
    renderContent();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();

    // Draft-backed tab: Reset is offered (it restores the in-memory draft).
    fireEvent.click(screen.getByRole('tab', { name: 'Engine' }));
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();

    // UI tab: the panel persists to localStorage through its own controls,
    // so the draft Reset would be a misleading no-op — it is hidden
    // and the footer says autosave instead.
    fireEvent.click(screen.getByRole('tab', { name: 'UI' }));
    expect(screen.getByText('🎨 Appearance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    expect(screen.getByText(/Changes save automatically/i)).toBeInTheDocument();

    // Notifications tab: same immediate-persistence story, same treatment.
    fireEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
    expect(await screen.findByTestId('push-permission-badge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
    expect(screen.getByText(/Changes save automatically/i)).toBeInTheDocument();
  });

  it('controlled section prop selects the tab and reports changes to the shell', async () => {
    const onSectionChange = vi.fn();
    renderContent({ activeSection: 'engine', onSectionChange });
    // The Engine tab renders immediately (no async harness registry load on
    // this section), so assert on its own field rather than a Harness row.
    expect(screen.getByRole('tab', { name: 'Engine' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Max concurrent tasks')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Storage' }));
    expect(onSectionChange).toHaveBeenCalledWith('storage');
  });

  it('unknown controlled section falls back to the first tab', async () => {
    renderContent({ activeSection: 'not-a-section' });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Runners' })).toHaveAttribute('aria-selected', 'true');
  });
});
