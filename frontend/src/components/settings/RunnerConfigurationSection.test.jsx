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
  },
}));

const OPERATOR_CONFIG = {
  displayName: null,
  availableTools: null,
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
    jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
    directories: { masterDir: '', worktreeDir: '' },
    projectScope: null,
  },
};

const PROJECTS = [
  { id: 'p1', name: 'Project One' },
  { id: 'p2', name: 'Project Two' },
];

/***
 * MARK: RunnerConfigurationSection tests
 * @description Covers the Runner settings screen that replaces the legacy
 *   harness list: roster loading/error/empty states, pending approve/deny,
 *   active pause/resume/revoke, the one-time credential, runner selection,
 *   and the detail form — name, Available/Loaded projects, tool toggles,
 *   directory save-with-confirm, job switches, and reload. Credentials
 *   never render.
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

  it('selects the first Runner and shows all five detail areas', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r1')).toBeTruthy();
    });
    // 1. Runner name, 2. projects, 3. tools, 4. directories, 5. job switches.
    expect(screen.getByTestId('runner-name-r1')).toBeTruthy();
    expect(screen.getByText('Projects')).toBeTruthy();
    expect(screen.getByText('Harnesses Available')).toBeTruthy();
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
    fireEvent.click(screen.getByTestId('runner-select-r2'));
    await waitFor(() => {
      expect(screen.getByTestId('runner-detail-r2')).toBeTruthy();
    });
    expect(screen.getByTestId('runner-detail-status-r2')).toHaveTextContent('Needs setup');
    expect(screen.queryByTestId('runner-detail-r1')).toBeNull();
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

  it('denies a pending Runner and revokes an active one', async () => {
    runnersFixture();
    denyRunner.mockResolvedValue({ status: 'denied' });
    revokeRunner.mockResolvedValue({ status: 'revoked' });
    render(<RunnerConfigurationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deny runner r2' }));
    await waitFor(() => {
      expect(denyRunner).toHaveBeenCalledWith('r2');
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke runner r1' }));
    await waitFor(() => {
      expect(revokeRunner).toHaveBeenCalledWith('r1');
    });
  });

  it('pauses an active Runner and resumes a paused one', async () => {
    getRunners
      .mockResolvedValueOnce(structuredClone([{ ...ACTIVE_RUNNER, paused: false }]))
      .mockResolvedValueOnce(structuredClone([{ ...ACTIVE_RUNNER, paused: true }]))
      .mockResolvedValue(structuredClone([{ ...ACTIVE_RUNNER, paused: false }]));
    pauseRunner.mockResolvedValue({ status: 'active', paused: true });
    render(<RunnerConfigurationSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause runner r1' }));
    await waitFor(() => {
      expect(pauseRunner).toHaveBeenCalledWith('r1');
    });
    expect(screen.getByTestId('runner-paused-r1')).toBeTruthy();
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

  it('requires confirmation before saving a directory', async () => {
    runnersFixture([ACTIVE_RUNNER]);
    render(<RunnerConfigurationSection />);
    await screen.findByTestId('runner-detail-r1');
    const input = screen.getByTestId('runner-masterdir-r1');
    fireEvent.change(input, { target: { value: ' /srv/new-master ' } });
    const save = screen.getByTestId('runner-masterdir-r1-save');
    // First click only arms the confirmation — no network call.
    fireEvent.click(save);
    expect(updateRunnerConfig).not.toHaveBeenCalled();
    expect(screen.getByTestId('runner-masterdir-r1-confirm')).toBeTruthy();
    // Second click confirms and trims.
    fireEvent.click(save);
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
    const save = screen.getByTestId('runner-worktreedir-r1-save');
    fireEvent.click(save);
    fireEvent.click(save);
    await waitFor(() => {
      expect(screen.getByTestId('runner-worktreedir-r1-error')).toBeTruthy();
    });
    expect(updateRunnerConfig).not.toHaveBeenCalled();
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
      scheduler: { ticks: 41, dispatched: 3, deferredDispatch: 12, deferredTripped: 0, lastOutcome: 'deferred-runner-dispatch', lastDispatchAt: null },
    });
    render(<RunnerConfigurationSection />);
    await waitFor(() => {
      expect(screen.getByTestId('runner-scheduler-deferrals').textContent).toContain(
        '12 deferred to Runners',
      );
    });
  });

  it('never renders credential values', async () => {
    runnersFixture([
      { ...ACTIVE_RUNNER, credential: 'SHOULD-NOT-RENDER' },
    ]);
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
});
