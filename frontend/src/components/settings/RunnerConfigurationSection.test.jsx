import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RunnerConfigurationSection } from './RunnerConfigurationSection';

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());
const approveRunner = vi.hoisted(() => vi.fn());
const denyRunner = vi.hoisted(() => vi.fn());
const revokeRunner = vi.hoisted(() => vi.fn());
const pauseRunner = vi.hoisted(() => vi.fn());
const resumeRunner = vi.hoisted(() => vi.fn());
const listProjects = vi.hoisted(() => vi.fn());
const getRunnerConfig = vi.hoisted(() => vi.fn());
const updateRunnerConfig = vi.hoisted(() => vi.fn());
const requestModelRediscovery = vi.hoisted(() => vi.fn());
const requestRunnerUpdate = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: {
    getRunners,
    getRunnerMonitor,
    approveRunner,
    denyRunner,
    revokeRunner,
    pauseRunner,
    resumeRunner,
    listProjects,
    getRunnerConfig,
    updateRunnerConfig,
    requestModelRediscovery,
    requestRunnerUpdate,
  },
}));

const OPERATOR_CONFIG = {
  displayName: null,
  availableTools: null,
  availableModels: null,
  jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
  directories: { masterDir: '/srv/kb', worktreeDir: '/srv/kb-trees' },
  projectScope: null,
};

const ACTIVE_RUNNER = {
  runnerId: 'r1',
  status: 'active',
  facts: { versions: { runner: '0.3.0', protocol: 'v1' } },
  capabilities: { harnesses: [{ id: 'pi' }, { id: 'vibe' }] },
  projectScope: null,
  paused: false,
  lastSeenAt: null,
  operatorConfig: { ...OPERATOR_CONFIG },
};

const PENDING_RUNNER = {
  runnerId: 'r2',
  status: 'pending',
  facts: {},
  capabilities: null,
  projectScope: null,
  paused: false,
  lastSeenAt: null,
  operatorConfig: {
    displayName: null,
    availableTools: null,
    availableModels: null,
    jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
    directories: { masterDir: '', worktreeDir: '' },
    projectScope: null,
  },
};

const PROJECTS = [
  { id: 'p1', name: 'Project One' },
  { id: 'p2', name: 'Project Two' },
];

const SUPPORTED_RUNNER = {
  ...ACTIVE_RUNNER,
  facts: { ...ACTIVE_RUNNER.facts, commands: ['requestModelRediscovery', 'requestUpdate'] },
  commands: {
    pending: [],
    results: {},
    supported: ['requestModelRediscovery', 'requestUpdate'],
  },
};

/***
 * MARK: RunnerConfigurationSection tests
 * @description Covers the Runner settings screen that replaces the legacy
 *   harness list: roster loading/error/empty states, pending approve/deny,
 *   active pause/resume/revoke, the one-time credential, runner selection,
 *   and the detail form — name, Available/Loaded projects, tool toggles,
 *   models allowlist save/reset, directory save-with-confirm, job switches,
 *   and reload. Credentials never render.
 ***/
describe('RunnerConfigurationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRunnerMonitor.mockResolvedValue({ liveAssignments: [] });
    listProjects.mockResolvedValue(PROJECTS);
    updateRunnerConfig.mockImplementation(async (id, patch) => ({
      runnerId: id,
      operatorConfig: { ...OPERATOR_CONFIG, ...patch },
    }));
    requestModelRediscovery.mockResolvedValue({ command: 'requestModelRediscovery', status: 'queued' });
    requestRunnerUpdate.mockResolvedValue({ command: 'requestUpdate', status: 'queued' });
  });

  function runnersFixture(rows = [ACTIVE_RUNNER, PENDING_RUNNER]) {
    getRunners.mockResolvedValue(structuredClone(rows));
  }

  it('shows loading then the empty state when no Runners registered', async () => {
    getRunners.mockResolvedValue([]);
    render(<RunnerConfigurationSection />);
    expect(screen.getByTestId('runner-config-loading')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('runner-config-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('runner-detail-r1')).toBeNull();
  });

  it('shows an error with retry when the list fetch fails', async () => {
    getRunners.mockRejectedValueOnce(new Error('backend down'));
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-config-error')).toBeTruthy();
    });
    getRunners.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByTestId('runner-config-empty')).toBeTruthy();
    });
  });

  it('selects the first Runner and shows all six detail areas', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r1')).toBeTruthy();
    });
    // 1. Runner name, 2. projects, 3. tools, 4. models, 5. directories, 6. job switches.
    expect(screen.getByTestId('runner-name-r1')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByText('Harnesses Available')).toBeTruthy();
    expect(screen.getByTestId('runner-redetect-models-r1')).toBeTruthy();
    expect(screen.getByTestId('runner-masterdir-r1')).toBeTruthy();
    expect(screen.getByTestId('runner-worktreedir-r1')).toBeTruthy();
    expect(screen.getByTestId('runner-job-r1-runsCi')).toBeTruthy();
    expect(screen.getByTestId('runner-job-r1-runsMerges')).toBeTruthy();
    expect(screen.getByTestId('runner-job-r1-runsImpromptu')).toBeTruthy();
    // Advertised tools render as toggles, all enabled by default.
    expect(screen.getByTestId('runner-tool-r1-pi')).toBeChecked();
    expect(screen.getByTestId('runner-tool-r1-vibe')).toBeChecked();
    // Null scope serves every project: all land in Loaded.
    expect(screen.getByTestId('runner-unload-project-p1')).toBeTruthy();
    expect(screen.getByTestId('runner-unload-project-p2')).toBeTruthy();
  });

  it('switches the detail form when another roster Runner is selected', async () => {
    runnersFixture();
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.click(screen.getByTestId('runner-row-r2'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
    });
    expect(screen.getByTestId('runner-detail-status-r2')).toHaveTextContent('Needs setup');
    expect(screen.queryByTestId('runner-detail-r1')).toBeNull();
  });

  it('selects a Runner by clicking anywhere on its roster row', async () => {
    runnersFixture();
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    // Click the row container itself, not the name button: the whole box
    // is the hit target.
    fireEvent.click(screen.getByTestId('runner-row-r2'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
    });
    expect(screen.getByTestId('runner-row-r2')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('runner-row-r1')).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a Runner from the roster with the keyboard', async () => {
    runnersFixture();
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const row = screen.getByTestId('runner-row-r2');
    expect(screen.getByTestId('runner-roster')).toHaveAttribute('role', 'listbox');
    expect(row).toHaveAttribute('role', 'option');
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('runner-row-r1'));
    await screen.findByTestId('runner-detail-r1');
    const row2 = screen.getByTestId('runner-row-r2');
    row2.focus();
    fireEvent.keyDown(row2, { key: ' ' });
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
    });
  });

  it('approves a pending Runner and shows the one-time credential once', async () => {
    runnersFixture([PENDING_RUNNER]);
    approveRunner.mockResolvedValue({ status: 'active', credential: 'ONE-TIME-1' });
    getRunners.mockResolvedValueOnce(structuredClone([PENDING_RUNNER]));
    render(<RunnerConfigurationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve runner r2' }));
    await waitFor(() => {
      expect(approveRunner).toHaveBeenCalledWith('r2');
      expect(screen.getByTestId('runner-credential-once')).toBeTruthy();
    });
    expect(screen.getByTestId('runner-credential-value').textContent).toBe('ONE-TIME-1');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss credential' }));
    await waitFor(() => {
      expect(screen.queryByTestId('runner-credential-once')).toBeNull();
    });
  });

  it('offers approve on a denied Runner so it is never a dead end', async () => {
    const denied = { ...PENDING_RUNNER, runnerId: 'r3', status: 'denied' };
    runnersFixture([denied]);
    approveRunner.mockResolvedValue({ status: 'active', credential: 'ONE-TIME-3' });
    render(<RunnerConfigurationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve runner r3' }));
    await waitFor(() => {
      expect(approveRunner).toHaveBeenCalledWith('r3');
      expect(screen.getByTestId('runner-credential-once')).toBeTruthy();
    });
    // Deny is not offered for denied Runners: denying a denied Runner 409s.
    expect(screen.queryByRole('button', { name: 'Deny runner r3' })).toBeNull();
  });

  it('hides revoked Runners: no row, no detail, selection skips them', async () => {
    const revoked = { ...ACTIVE_RUNNER, runnerId: 'rx', status: 'revoked' };
    runnersFixture([revoked, ACTIVE_RUNNER, PENDING_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.queryByTestId('runner-row-rx')).toBeNull();
    expect(screen.queryByTestId('runner-detail-rx')).toBeNull();
    expect(screen.getByTestId('runner-row-r1')).toBeTruthy();
    expect(screen.getByTestId('runner-row-r2')).toBeTruthy();
    // Selection skipped the revoked first row and landed on r1.
    expect(screen.getByTestId('runner-detail-r1')).toBeTruthy();
  });

  it('shows the empty message when every Runner is revoked', async () => {
    runnersFixture([
      { ...ACTIVE_RUNNER, runnerId: 'rx', status: 'revoked' },
      { ...PENDING_RUNNER, runnerId: 'ry', status: 'revoked' },
    ]);
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-config-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('runner-roster')).toBeNull();
    expect(screen.queryByTestId('runner-detail-rx')).toBeNull();
    expect(screen.queryByTestId('runner-detail-ry')).toBeNull();
  });

  it('revoking the selected Runner moves selection to the next visible one', async () => {
    runnersFixture([ACTIVE_RUNNER, PENDING_RUNNER]);
    revokeRunner.mockResolvedValue({ status: 'revoked' });
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    // The revoked record stays in the backend list; the screen filters it.
    getRunners.mockResolvedValue([{ ...ACTIVE_RUNNER, status: 'revoked' }, { ...PENDING_RUNNER }]);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke runner r1' }));
    // Needs confirm step
    fireEvent.click(await screen.findByTestId('runner-revoke-confirm-r1'));
    await waitFor(() => {
      expect(revokeRunner).toHaveBeenCalledWith('r1');
    });
    await waitFor(() => {
      expect(screen.queryByTestId('runner-row-r1')).toBeNull();
    });
    expect(screen.queryByTestId('runner-detail-r1')).toBeNull();
    expect(screen.getByTestId('runner-row-r2')).toBeTruthy();
    expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
  });

  it('guides the operator when the selected Runner vanishes without a roster reload', async () => {
    runnersFixture([ACTIVE_RUNNER, PENDING_RUNNER]);
    render(<RunnerConfigurationSection />);
    fireEvent.click(await screen.findByTestId('runner-row-r2'));
    await screen.findByTestId('runner-detail-r2');
    // Another operator revoked r2 mid-session: the reload merges the revoked
    // record, the roster filter drops its row, and the stale selection must
    // render guidance — never a revoked detail panel, never a blank column.
    getRunnerConfig.mockResolvedValue({ ...PENDING_RUNNER, status: 'revoked' });
    fireEvent.click(screen.getByTestId('runner-reload-r2'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-empty')).toBeTruthy();
    });
    expect(screen.queryByTestId('runner-row-r2')).toBeNull();
    expect(screen.queryByTestId('runner-detail-r2')).toBeNull();
    expect(screen.getByTestId('runner-row-r1')).toBeTruthy();
    expect(screen.getByTestId('runner-detail-empty')).toHaveTextContent(
      'Select a Runner on the left',
    );
  });

  it('lays the roster and detail side by side with the detail on the right', async () => {
    runnersFixture();
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const layout = screen.getByTestId('runner-layout');
    expect(layout.className).toContain('md:grid-cols-[240px_minmax(0,1fr)]');
    expect(layout).toContainElement(screen.getByTestId('runner-roster'));
    expect(layout).toContainElement(screen.getByTestId('runner-detail-r1'));
    // Clicking a left row swaps the right panel.
    fireEvent.click(screen.getByTestId('runner-row-r2'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
    });
    expect(screen.queryByTestId('runner-detail-r1')).toBeNull();
  });

  it('denies a pending Runner and revokes an active one (with confirm)', async () => {
    runnersFixture();
    denyRunner.mockResolvedValue({ status: 'denied' });
    revokeRunner.mockResolvedValue({ status: 'revoked' });
    render(<RunnerConfigurationSection />);
    // Actions live in the selected Runner's detail panel: select r2 first.
    fireEvent.click(await screen.findByTestId('runner-row-r2'));
    fireEvent.click(await screen.findByRole('button', { name: 'Deny runner r2' }));
    await waitFor(() => {
      expect(denyRunner).toHaveBeenCalledWith('r2');
    });
    fireEvent.click(screen.getByTestId('runner-row-r1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke runner r1' }));
    fireEvent.click(await screen.findByTestId('runner-revoke-confirm-r1'));
    await waitFor(() => {
      expect(revokeRunner).toHaveBeenCalledWith('r1');
    });
  });

  it('pauses an active Runner and resumes a paused one', async () => {
    let call = 0;
    getRunners.mockImplementation(async () => {
      call += 1;
      if (call === 1) return structuredClone([{ ...ACTIVE_RUNNER, paused: false }]);
      if (call === 2) return structuredClone([{ ...ACTIVE_RUNNER, paused: true }]);
      return structuredClone([{ ...ACTIVE_RUNNER, paused: false }]);
    });
    pauseRunner.mockResolvedValue({ status: 'active', paused: true });
    render(<RunnerConfigurationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause runner r1' }));
    await waitFor(() => {
      expect(pauseRunner).toHaveBeenCalledWith('r1');
    });
    await waitFor(() => expect(screen.getByTestId('runner-paused-r1')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Resume runner r1' }));
    await waitFor(() => {
      expect(resumeRunner).toHaveBeenCalledWith('r1');
    });
  });

  it('saves the Runner name', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const input = screen.getByTestId('runner-name-r1');
    fireEvent.change(input, { target: { value: 'Primary' } });
    fireEvent.click(screen.getByTestId('runner-name-save-r1'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', { displayName: 'Primary' });
    });
    expect(await screen.findByTestId('runner-config-notice')).toHaveTextContent(
      'Runner name saved.',
    );
  });

  it('clears the Runner name back to the Runner id default', async () => {
    runnersFixture([
      {
        ...ACTIVE_RUNNER,
        operatorConfig: { ...OPERATOR_CONFIG, displayName: 'Primary' },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const input = screen.getByTestId('runner-name-r1');
    expect(input).toHaveValue('Primary');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('runner-name-save-r1'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', { displayName: null });
    });
    expect(await screen.findByTestId('runner-config-notice')).toHaveTextContent(
      'Runner name reset to the Runner id.',
    );
  });

  it('loads and unloads projects through the picker', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, operatorConfig: { ...OPERATOR_CONFIG } }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    // Both projects start Loaded (null scope serves all): unload one.
    fireEvent.click(screen.getByTestId('runner-unload-project-p1'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', { projectScope: ['p2'] });
    });
  });

  it('loads an Available project back to Loaded with a null serves-all scope', async () => {
    runnersFixture([
      {
        ...ACTIVE_RUNNER,
        operatorConfig: { ...OPERATOR_CONFIG, projectScope: ['p2'] },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-load-project-p1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('runner-load-project-p1'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', { projectScope: null });
    });
  });

  it('saves a directory with a single click and trims', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const input = screen.getByTestId('runner-masterdir-r1');
    fireEvent.change(input, { target: { value: ' /srv/new-master ' } });
    fireEvent.click(screen.getByTestId('runner-masterdir-r1-save'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', {
        directories: { masterDir: '/srv/new-master' },
      });
    });
  });

  it('blocks a blank directory save with an inline error and no network call', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.change(screen.getByTestId('runner-worktreedir-r1'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('runner-worktreedir-r1-save'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-worktreedir-r1-error')).toBeTruthy();
    });
    expect(updateRunnerConfig).not.toHaveBeenCalled();
  });

  it('clears a directory error while the operator retypes', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.change(screen.getByTestId('runner-worktreedir-r1'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('runner-worktreedir-r1-save'));
    await screen.findByTestId('runner-worktreedir-r1-error');
    // Typing a new value clears the stale error before the next save attempt.
    fireEvent.change(screen.getByTestId('runner-worktreedir-r1'), {
      target: { value: '/srv/fixed-trees' },
    });
    await waitFor(() => {
      expect(screen.queryByTestId('runner-worktreedir-r1-error')).toBeNull();
    });
    expect(updateRunnerConfig).not.toHaveBeenCalled();
  });

  it('disables detail actions while a config save is in flight', async () => {
    runnersFixture([ACTIVE_RUNNER, PENDING_RUNNER]);
    // A save that never settles keeps the busy state observable.
    updateRunnerConfig.mockImplementation(() => new Promise(() => {}));
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.click(screen.getByTestId('runner-job-r1-runsCi'));
    // One write at a time: an action racing the save could overwrite
    // the shared busy flag and reload the roster over the in-flight patch.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Pause runner r1' })).toBeDisabled();
    });
    // The pending Runner's actions disable too once it is selected.
    fireEvent.click(screen.getByTestId('runner-row-r2'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Approve runner r2' })).toBeDisabled();
    });
  });

  it('shows Runner default hint when directory is empty', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, operatorConfig: { ...OPERATOR_CONFIG, directories: { masterDir: '', worktreeDir: '' } }, facts: { directories: { masterDir: '/srv/default-master', worktreeDir: '/srv/default-trees' } } }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-masterdir-r1')).toHaveValue('/srv/default-master');
  });

  it('toggles job switches with the expected payload', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.click(screen.getByTestId('runner-job-r1-runsCi'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', {
        jobTypes: { runsCi: false },
      });
    });
    fireEvent.click(screen.getByTestId('runner-job-r1-runsMerges'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', {
        jobTypes: { runsMerges: false },
      });
    });
  });

  it('toggles an available tool off the Runner subset', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.click(screen.getByTestId('runner-tool-r1-vibe'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', { availableTools: ['pi'] });
    });
  });

  it('toggles models via checkboxes and adds a custom model', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, capabilities: { harnesses: [{ id: 'pi' }], models: ['m1', 'm2'] } }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    // m1 starts checked (advertised)
    expect(screen.getByTestId('runner-model-r1-m1')).toBeChecked();
    fireEvent.click(screen.getByTestId('runner-model-r1-m1'));
    await waitFor(() => { expect(updateRunnerConfig).toHaveBeenCalledWith('r1', { availableModels: expect.any(Array) }); });
    // Add custom
    fireEvent.change(screen.getByTestId('runner-custom-model-r1'), { target: { value: 'custom-m9' } });
    fireEvent.click(screen.getByTestId('runner-add-model-r1'));
    await waitFor(() => { expect(updateRunnerConfig).toHaveBeenCalledWith('r1', expect.objectContaining({ availableModels: expect.arrayContaining(['custom-m9']) })); });
  });

  it('reloads the selected Runner through getRunnerConfig', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    getRunnerConfig.mockResolvedValue({
      ...ACTIVE_RUNNER,
      operatorConfig: { ...OPERATOR_CONFIG, displayName: 'Fresh' },
    });
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.click(screen.getByTestId('runner-reload-r1'));
    await waitFor(() => {
      expect(getRunnerConfig).toHaveBeenCalledWith('r1');
    });
    expect(await screen.findByTestId('runner-config-notice')).toHaveTextContent('Reloaded');
  });

  it('shows the live assignment under a running Runner', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'r1',
          projectId: 'p1',
          taskId: 'abcdef12-3456',
          executionId: 'exec-1',
          epoch: 1,
          startedAt: new Date(Date.now() - 65_000).toISOString(),
          stageId: 'build',
        },
      ],
    });
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-assignment-r1').textContent).toContain('abcdef12');
    });
    expect(screen.getByTestId('runner-assignment-r1').textContent).toContain('build');
  });

  it('hides assignments but keeps the list when the monitor is down', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    getRunnerMonitor.mockRejectedValueOnce(new Error('monitor down'));
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.queryByTestId('runner-assignment-r1')).toBeNull();
  });

  it('shows scheduler deferral counts when the monitor reports them', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [],
      scheduler: {
        ticks: 41,
        dispatched: 3,
        deferredDispatch: 12,
        deferredTripped: 0,
        lastOutcome: 'deferred-runner-dispatch',
        lastDispatchAt: null,
      },
    });
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-scheduler-deferrals').textContent).toContain(
        '12 deferred to Runners',
      );
    });
  });

  it('never renders credential values', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, credential: 'SHOULD-NOT-RENDER' }]);
    const { container } = render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(container.textContent).not.toContain('SHOULD-NOT-RENDER');
  });

  it('shows the picker fallback when projects fail to load', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    listProjects.mockRejectedValueOnce(new Error('projects down'));
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-projects-error')).toBeTruthy();
    });
  });

  it('badges update-available Runners with the recommended version', async () => {
    runnersFixture([
      {
        ...ACTIVE_RUNNER,
        runnerId: 'r9',
        runnerVersion: '0.1.0',
        updateAvailable: true,
        belowMinimum: false,
        recommendedVersion: '0.2.0',
      },
    ]);
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      const badge = screen.getByTestId('runner-update-available-r9');
      expect(badge.textContent).toContain('update available');
      expect(badge.title).toContain('0.2.0');
    });
    expect(screen.getByTestId('runner-version-r9').textContent).toContain('0.1.0');
    expect(screen.queryByTestId('runner-below-minimum-r9')).toBeNull();
  });

  it('flags below-minimum Runners and surfaces failed update attempts', async () => {
    runnersFixture([
      {
        ...ACTIVE_RUNNER,
        runnerId: 'r8',
        runnerVersion: '0.0.1',
        updateAvailable: true,
        belowMinimum: true,
        minimumVersion: '0.1.0',
        updateStatus: { state: 'failed', reason: 'sig mismatch', at: '2026-10-31T00:00:00.000Z' },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-below-minimum-r8').textContent).toContain('below minimum');
      const failed = screen.getByTestId('runner-update-failed-r8');
      expect(failed.title).toContain('sig mismatch');
    });
  });

  it('shows no badges for an up-to-date Runner without status', async () => {
    runnersFixture([
      { ...ACTIVE_RUNNER, runnerVersion: '0.2.0', updateAvailable: false, belowMinimum: false },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.queryByTestId('runner-update-available-r1')).toBeNull();
    expect(screen.queryByTestId('runner-below-minimum-r1')).toBeNull();
    expect(screen.queryByTestId('runner-update-failed-r1')).toBeNull();
  });

  it('queues model re-detection through the API and shows the queued notice', async () => {
    runnersFixture([SUPPORTED_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const button = screen.getByTestId('runner-redetect-models-r1');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => {
      expect(requestModelRediscovery).toHaveBeenCalledWith('r1');
    });
    expect(await screen.findByTestId('runner-config-notice')).toHaveTextContent(
      'Re-detection queued',
    );
  });

  it('disables re-detection with guidance for runners that predate commands', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-redetect-models-r1')).toBeDisabled();
    expect(screen.getByTestId('runner-redetect-status-r1')).toHaveTextContent('too old');
    expect(requestModelRediscovery).not.toHaveBeenCalled();
  });

  it('disables re-detection for runners that never heartbeat (pending)', async () => {
    runnersFixture([PENDING_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r2');
    expect(screen.getByTestId('runner-redetect-models-r2')).toBeDisabled();
    expect(screen.getByTestId('runner-redetect-status-r2')).toHaveTextContent(
      'Needs an active Runner',
    );
  });

  it('shows Update now exactly when an update is available and queues on click', async () => {
    runnersFixture([{ ...SUPPORTED_RUNNER, updateAvailable: true, recommendedVersion: '0.2.0' }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const button = screen.getByTestId('runner-update-now-r1');
    expect(button).not.toBeDisabled();
    expect(button.title).toContain('0.2.0');
    fireEvent.click(button);
    await waitFor(() => {
      expect(requestRunnerUpdate).toHaveBeenCalledWith('r1');
    });
    expect(await screen.findByTestId('runner-config-notice')).toHaveTextContent('Update queued');
    expect(screen.getByTestId('runner-update-status-r1')).toHaveTextContent('idle');
  });

  it('hides Update now when no update is available', async () => {
    runnersFixture([{ ...SUPPORTED_RUNNER, updateAvailable: false }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.queryByTestId('runner-update-now-r1')).toBeNull();
    expect(screen.queryByTestId('runner-update-status-r1')).toBeNull();
  });

  it('disables Update now with manual guidance for old runners with an update available', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, updateAvailable: true, recommendedVersion: '0.2.0' }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-update-now-r1')).toBeDisabled();
    expect(screen.getByTestId('runner-update-status-r1')).toHaveTextContent('update it manually');
    expect(requestRunnerUpdate).not.toHaveBeenCalled();
  });

  it('surfaces queued and failed command states without a reload', async () => {
    runnersFixture([
      {
        ...SUPPORTED_RUNNER,
        updateAvailable: true,
        commands: {
          pending: [{ command: 'requestModelRediscovery', requestedAt: new Date().toISOString() }],
          results: { requestUpdate: { ok: false, detail: 'disk full', at: new Date().toISOString() } },
          supported: ['requestModelRediscovery', 'requestUpdate'],
        },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-redetect-status-r1')).toHaveTextContent('Re-detection queued');
    const failed = screen.getByTestId('runner-update-status-r1');
    expect(failed).toHaveTextContent('Update failed: disk full');
    expect(failed).toHaveAttribute('role', 'alert');
  });

  it('shows per-harness auto-detect counts from discoveryStatus', async () => {
    runnersFixture([
      {
        ...SUPPORTED_RUNNER,
        capabilities: {
          harnesses: [{ id: 'pi' }, { id: 'muse' }],
          models: ['pi::mistral::x', 'muse::meta::m'],
          discoveryStatus: {
            pi: { ok: true, count: 77, atMs: 1 },
            muse: { ok: true, count: 5, atMs: 2 },
          },
        },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-discovery-status-r1')).toHaveTextContent(
      'Auto-detect: muse:5, pi:77',
    );
    expect(screen.queryByTestId('runner-discovery-warning-r1')).toBeNull();
  });

  it('shows the first leg warning from discoveryStatus', async () => {
    runnersFixture([
      {
        ...SUPPORTED_RUNNER,
        capabilities: {
          harnesses: [{ id: 'pi' }, { id: 'antigravity' }],
          models: ['pi::mistral::x'],
          discoveryStatus: {
            pi: { ok: true, count: 1, atMs: 1 },
            antigravity: {
              ok: false,
              count: 0,
              atMs: 2,
              error: { code: 'AGY_BIN_MISSING', message: 'agy CLI not found' },
            },
          },
        },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-discovery-status-r1')).toHaveTextContent(
      'Auto-detect: antigravity:0, pi:1',
    );
    expect(screen.getByTestId('runner-discovery-warning-r1')).toHaveTextContent(
      'antigravity: AGY_BIN_MISSING — agy CLI not found',
    );
  });

  it('renders no discovery lines for runners that predate discoveryStatus', async () => {
    runnersFixture([SUPPORTED_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.queryByTestId('runner-discovery-status-r1')).toBeNull();
    expect(screen.queryByTestId('runner-discovery-warning-r1')).toBeNull();
  });

  it('keeps the old model rows visible when re-detection failed', async () => {
    runnersFixture([
      {
        ...SUPPORTED_RUNNER,
        capabilities: {
          harnesses: [{ id: 'pi' }],
          models: ['pi::mistral::x', 'pi::mistral::y'],
        },
        commands: {
          pending: [],
          results: {
            requestModelRediscovery: { ok: false, detail: 'scan failed', at: new Date().toISOString() },
          },
          supported: ['requestModelRediscovery', 'requestUpdate'],
        },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    expect(screen.getByTestId('runner-redetect-status-r1')).toHaveTextContent(
      'Re-detection failed: scan failed',
    );
    expect(screen.getByTestId('runner-models-list-r1')).toBeTruthy();
    expect(screen.getByTestId('runner-model-r1-pi::mistral::x')).toBeTruthy();
    expect(screen.getByTestId('runner-model-r1-pi::mistral::y')).toBeTruthy();
  });

  it('ignores an over-long custom model id with no network call', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, capabilities: { harnesses: [{ id: 'pi' }], models: ['m1'] } }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    updateRunnerConfig.mockClear();
    fireEvent.change(screen.getByTestId('runner-custom-model-r1'), { target: { value: `  ${'x'.repeat(300)}  ` } });
    fireEvent.click(screen.getByTestId('runner-add-model-r1'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-models-list-r1')).toBeTruthy();
    });
    expect(updateRunnerConfig).not.toHaveBeenCalled();
  });

  it('ignores a blank custom model id with no network call', async () => {
    runnersFixture([{ ...ACTIVE_RUNNER, capabilities: { harnesses: [{ id: 'pi' }], models: ['m1'] } }]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    updateRunnerConfig.mockClear();
    fireEvent.change(screen.getByTestId('runner-custom-model-r1'), { target: { value: '   ' } });
    // The Add button stays disabled for blank input.
    expect(screen.getByTestId('runner-add-model-r1')).toBeDisabled();
    expect(updateRunnerConfig).not.toHaveBeenCalled();
  });

  it('filters the roster by Runner name', async () => {
    const named = (id, name) => ({
      ...ACTIVE_RUNNER,
      runnerId: id,
      operatorConfig: { ...OPERATOR_CONFIG, displayName: name },
    });
    runnersFixture([
      named('r1', 'Primary'),
      named('r2', 'Secondary'),
      named('r3', 'Tertiary'),
      named('r4', 'Fourth'),
      named('r5', 'Fifth'),
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.change(screen.getByTestId('runner-filter'), { target: { value: 'secondary' } });
    await waitFor(() => {
      expect(screen.queryByTestId('runner-row-r1')).toBeNull();
    });
    expect(screen.getByTestId('runner-row-r2')).toBeTruthy();
  });

  it('clears the custom-model box when the operator moves to another Runner', async () => {
    runnersFixture();
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.change(screen.getByTestId('runner-custom-model-r1'), { target: { value: 'typed-for-r1' } });
    fireEvent.click(screen.getByTestId('runner-row-r2'));
    await screen.findByTestId('runner-detail-r2');
    expect(screen.getByTestId('runner-custom-model-r2')).toHaveValue('');
  });

  it('keeps both directory edits when the operator types in both fields fast', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    fireEvent.change(screen.getByTestId('runner-masterdir-r1'), { target: { value: '/srv/new-master' } });
    fireEvent.change(screen.getByTestId('runner-worktreedir-r1'), { target: { value: '/srv/new-trees' } });
    fireEvent.click(screen.getByTestId('runner-masterdir-r1-save'));
    await waitFor(() => {
      expect(updateRunnerConfig).toHaveBeenCalledWith('r1', {
        directories: { masterDir: '/srv/new-master' },
      });
    });
  });

  it('names the models reset distinctly from the footer Reset', async () => {
    runnersFixture([
      {
        ...SUPPORTED_RUNNER,
        capabilities: { harnesses: [{ id: 'pi' }], models: ['m1', 'm2'] },
        operatorConfig: { ...OPERATOR_CONFIG, availableModels: ['m1'] },
      },
    ]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    // The footer Reset collision (an exact 'Reset' name) broke the settings
    // tabs test: the models reset keeps its distinct accessible name.
    expect(screen.getByTestId('runner-models-reset-r1')).toHaveTextContent('Reset to auto-detected');
    expect(screen.queryByRole('button', { name: 'Reset', exact: true })).toBeNull();
  });
});
