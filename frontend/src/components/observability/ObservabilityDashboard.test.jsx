import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { invalidateObservability } from '../../services/observabilityEvents';
import { renderWithKainBain } from '../../testUtils';
import { ObservabilityDashboard, mergeMissingCatalogWidgets } from './ObservabilityDashboard';
import { api } from '../../services/api';
import '@testing-library/jest-dom';

vi.mock('../../services/api', () => ({
  api: {
    observabilityStatus: vi.fn().mockResolvedValue({
      status: 'ok',
      observability: {
        stats: {
          total: 10,
          completed: 7,
          failed: 1,
          running: 1,
          waitingHuman: 1,
          paused: 0,
          inStage: 1,
          blocked: 0,
          queueDepth: 2,
          successRate: 87.5,
          failureRate: 12.5,
        },
        engineState: {
          status: 'running',
          activeTaskId: 'task-active-1',
          activeStageName: 'Code Generation',
          activeStageType: 'agent',
        },
        queue: [
          {
            id: 'task-active-1',
            title: 'Build user auth',
            goal: 'Implement JWT authentication',
            prompt:
              'SYSTEM: You are the Pi Coding Agent.\nTask: Implement JWT authentication in auth.js',
            projectName: 'Project Alpha',
            currentStageName: 'Code Generation',
            currentStageType: 'agent',
            model: 'pi-agent-v1',
            queueOrder: 1,
            priorityReason: 'Active Execution',
            isRunning: true,
          },
          {
            id: 'task-queued-2',
            title: 'Write unit tests',
            goal: 'Write comprehensive tests for user auth',
            prompt: 'Write unit tests in auth.test.js',
            projectName: 'Project Alpha',
            currentStageName: 'Test & Verification',
            currentStageType: 'ci',
            model: 'default',
            queueOrder: 2,
            priorityReason: 'Stage 2/3 (Closest to End)',
            isRunning: false,
          },
        ],
        activeTask: {
          id: 'task-active-1',
          title: 'Build user auth',
          goal: 'Implement JWT authentication',
          prompt:
            'SYSTEM: You are the Pi Coding Agent.\nTask: Implement JWT authentication in auth.js',
          projectName: 'Project Alpha',
          currentStageName: 'Code Generation',
          currentStageType: 'agent',
          model: 'pi-agent-v1',
          reports: [{ stageName: 'Plan', content: '# Plan report' }],
        },
        recentCompleted: [
          {
            id: 'task-c1',
            title: 'Setup database schema',
            projectName: 'Project Alpha',
            completedAt: new Date().toISOString(),
          },
        ],
        recentFailed: [
          {
            id: 'task-f1',
            title: 'Deploy staging',
            projectName: 'Project Alpha',
            failureReason: 'Connection timed out',
            failedAt: new Date().toISOString(),
          },
        ],
      },
    }),
    // Global per-harness reliability for the reliability widget: independent
    // of the observability poll so tests can assert the two cycles apart.
    getHarnessReliability: vi.fn().mockResolvedValue({ reliability: [] }),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

test('tracks the application as a whole by default without bypassing the cache', async () => {
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(api.observabilityStatus).toHaveBeenCalledTimes(1);
  expect(api.observabilityStatus).toHaveBeenCalledWith(undefined, false);
});

test('renders customizable Observability Dashboard with telemetry header and widgets', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    tasks: [
      { id: 'task-active-1', title: 'Build user auth', status: 'running_agent' },
      { id: 'task-queued-2', title: 'Write unit tests', status: 'in_stage' },
    ],
    engineState: {
      status: 'running',
      activeTaskId: 'task-active-1',
      activeStageName: 'Code Generation',
    },
    processLogs: [
      { id: '1', timestamp: '12:00:01', tag: '[AGENT]', text: 'Agent analyzing task requirements' },
      { id: '2', timestamp: '12:00:05', tag: '[CI/CMD]', text: 'Running test suite' },
    ],
  });

  expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 2, name: /Observability/i })).toBeInTheDocument();

  // Check default modular widgets exist in DOM
  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('widget-queue')).toBeInTheDocument();
  expect(screen.getByTestId('widget-activeTask')).toBeInTheDocument();
  expect(screen.getByTestId('widget-console')).toBeInTheDocument();

  await waitFor(() => {
    expect(screen.getAllByText('Build user auth').length).toBeGreaterThan(0);
  });
});

test('toggles edit mode to rearrange and resize widgets', async () => {
  renderWithKainBain(<ObservabilityDashboard />);

  // Configuration controls are behind the configure toggle (clean monitor view).
  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));

  const editBtn = screen.getByRole('button', { name: /Edit/i });
  expect(editBtn).toBeInTheDocument();

  // Enter Edit Mode
  fireEvent.click(editBtn);

  expect(screen.getByText(/DASHBOARD CUSTOMIZATION MODE ACTIVE/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Done/i })).toBeInTheDocument();

  // Check that resize dropdowns appear in widget headers during Edit Mode
  const widthDropdowns = screen.getAllByTitle(/Resize Widget Width/i);
  expect(widthDropdowns.length).toBeGreaterThan(0);

  // Resize a widget width to 50% (col-span-6)
  fireEvent.change(widthDropdowns[0], { target: { value: '6' } });

  // Check Move button
  const moveBtns = screen.getAllByTitle(/Move Widget/i);
  expect(moveBtns.length).toBeGreaterThan(0);
  fireEvent.click(moveBtns[0]);

  // Exit Edit Mode
  const doneBtn = screen.getByTitle(/Lock Dashboard Layout/i);
  fireEvent.click(doneBtn);

  expect(screen.queryByText(/DASHBOARD CUSTOMIZATION MODE ACTIVE/i)).not.toBeInTheDocument();
});

test('opens Widget Manager modal to customize widgets and apply presets', async () => {
  renderWithKainBain(<ObservabilityDashboard />);

  // Configuration controls are behind the configure toggle (clean monitor view).
  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));

  const manageBtn = screen.getByRole('button', { name: /Manage Widgets/i });
  fireEvent.click(manageBtn);

  expect(screen.getByText(/Customize Observability Widgets & Layout/i)).toBeInTheDocument();
  expect(screen.getByText(/Rate Gauges/i)).toBeInTheDocument();

  // Switch to Layout Presets tab
  const presetsTab = screen.getByRole('button', { name: /Layout Presets/i });
  fireEvent.click(presetsTab);

  expect(screen.getAllByText(/Deep Debugger/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Executive Telemetry/i).length).toBeGreaterThan(0);

  // Apply Deep Debugger preset
  const applyButtons = screen.getAllByRole('button', { name: /Apply Preset/i });
  fireEvent.click(applyButtons[0]);

  // Verify modal closes
  expect(screen.queryByText(/Customize Observability Widgets & Layout/i)).not.toBeInTheDocument();
});

test('displays active task full prompt in viewer', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: {
      status: 'running',
      activeTaskId: 'task-active-1',
      activeStageName: 'Code Generation',
    },
  });

  await waitFor(() => {
    expect(screen.getByTestId('active-prompt-viewer')).toBeInTheDocument();
    expect(screen.getByText(/SYSTEM: You are the Pi Coding Agent/i)).toBeInTheDocument();
  });
});

test('displays scheduled queue order with rank and priority tags', async () => {
  renderWithKainBain(<ObservabilityDashboard />);

  await waitFor(() => {
    expect(screen.getByTestId('queue-item-task-active-1')).toBeInTheDocument();
    expect(screen.getByTestId('queue-item-task-queued-2')).toBeInTheDocument();
    expect(screen.getByText(/Active Execution/i)).toBeInTheDocument();
    expect(screen.getByText(/Stage 2\/3/i)).toBeInTheDocument();
  });
});

test('filters process logs by category chip', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    processLogs: [
      { id: '1', timestamp: '12:00:01', tag: '[AGENT]', text: 'Agent reasoning started' },
      { id: '2', timestamp: '12:00:02', tag: '[ERROR]', text: 'Connection timed out' },
      { id: '3', timestamp: '12:00:03', tag: '[CI/CMD]', text: 'npm test passed' },
    ],
  });

  expect(screen.getByText('Agent reasoning started')).toBeInTheDocument();
  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  expect(screen.getByText('npm test passed')).toBeInTheDocument();

  // Filters are collapsed by default on first paint; reveal them first.
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  // Toggle the Direct output lane off: the narrative hides, errors and CI stay.
  fireEvent.click(screen.getByRole('button', { name: 'Direct output' }));

  expect(screen.getByText('Connection timed out')).toBeInTheDocument();
  expect(screen.getByText('npm test passed')).toBeInTheDocument();
  expect(screen.queryByText('Agent reasoning started')).not.toBeInTheDocument();
});

test('fits the monitor on one page: grid is no-scroll and KPI ribbon is compact', async () => {
  renderWithKainBain(<ObservabilityDashboard />);

  // The main grid must not scroll (the "one page" requirement).
  const grid = document.getElementById('observability-grid');
  expect(grid).toBeTruthy();
  expect(grid.className).toContain('overflow-hidden');
  expect(grid.className).not.toContain('overflow-y-auto');

  // The KPI ribbon cards use compact classes (smaller text / tighter padding).
  const kpiSuccess = screen.getByTestId('kpi-successes');
  expect(kpiSuccess.className).toContain('px-2 py-1'); // compact padding
  expect(kpiSuccess.className).toContain('justify-center'); // single-row, not full-height
  // Numbers are compact (text-sm/base), not the large text-2xl/3xl.
  expect(kpiSuccess.querySelector('.text-sm, .text-base')).toBeTruthy();
});

test('clean monitor header: config controls hidden by default, monitoring info visible', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    projects: [{ id: 'p1', name: 'Project Alpha' }],
  });

  // Monitoring info is visible by default.
  expect(screen.getByRole('heading', { level: 2, name: /Observability/i })).toBeInTheDocument();
  expect(screen.getByTestId('engine-state-badge')).toBeInTheDocument();

  // Configuration controls (project select, presets, edit, customize) are hidden.
  expect(screen.queryByLabelText(/Filter project observability scope/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Manage Widgets/i })).not.toBeInTheDocument();

  // Clicking the configure toggle reveals them.
  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  expect(screen.getByLabelText(/Filter project observability scope/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Manage Widgets/i })).toBeInTheDocument();
});

test('monitor console is a pure terminal stream: no Active Tool Calls block or Tool Inspector widget', () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    toolCalls: [{ id: 'tc1', toolName: 'bash', args: { cmd: 'ls' }, status: 'executing' }],
    processLogs: [
      { id: '1', timestamp: '12:00:01', tag: '[AGENT]', text: 'Agent analyzing task requirements' },
    ],
  });

  // The inline "Active Tool Calls" overlay block is gone.
  expect(screen.queryByText(/Active Tool Calls/i)).not.toBeInTheDocument();

  // The dedicated "Tool Inspector" widget is gone from the catalog and layout.
  expect(
    screen.queryByText(/Active Tool Invocations & Payload Inspector/i),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Tool Inspector/i)).not.toBeInTheDocument();

  // The console still renders as a pure terminal-style log stream.
  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
  expect(screen.getByTestId('live-log-console')).toBeInTheDocument();
  expect(screen.getByText('Agent analyzing task requirements')).toBeInTheDocument();
});

test('widget manager no longer lists the Tool Inspector widget', () => {
  renderWithKainBain(<ObservabilityDashboard />);

  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  fireEvent.click(screen.getByRole('button', { name: /Manage Widgets/i }));

  expect(screen.getByText(/Customize Observability Widgets & Layout/i)).toBeInTheDocument();
  expect(screen.queryByText(/Tool Inspector/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/Active Tool Invocations/i)).not.toBeInTheDocument();
});

test('saved layout entries referencing removed widgets are dropped without placeholder boxes', () => {
  // A layout saved by a previous version that still contained the removed
  // "toolCalls" widget. It must be filtered out; all other entries kept.
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([
      { id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      { id: 'toolCalls', colSpan: 6, height: 'normal', enabled: true },
      { id: 'console', colSpan: 6, height: 'tall', enabled: true },
    ]),
  );

  renderWithKainBain(<ObservabilityDashboard />);

  // The stale "toolCalls" entry must not render a "not found in registry"
  // placeholder box.
  expect(screen.queryByText(/not found in registry/i)).not.toBeInTheDocument();

  // All other saved customizations are preserved.
  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
  expect(screen.queryByText(/Tool Inspector/i)).not.toBeInTheDocument();
});

test('a corrupt version 2 store falls back to the legacy key instead of losing the layout', () => {
  // A half-written version 2 value must not orphan the good legacy layout:
  // the loader reads the legacy key before settling for the factory layout.
  localStorage.setItem('kainbain_observability_layout_v2', 'half-written-json{{{');
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([{ id: 'console', colSpan: 6, height: 'tall', enabled: true }]),
  );

  renderWithKainBain(<ObservabilityDashboard />);

  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
});

test('corrupt stores under both keys settle for the factory layout', () => {
  localStorage.setItem('kainbain_observability_layout_v2', 'half-written-json{{{');
  localStorage.setItem('kainbain_observability_layout_v1', 'also-broken{{{');

  renderWithKainBain(<ObservabilityDashboard />);

  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
});

test('shows a Back exit control when the global header is hidden', async () => {
  const setView = vi.fn();
  renderWithKainBain(<ObservabilityDashboard />, { view: 'observability', setView });

  const backBtn = screen.getByRole('button', { name: 'Exit monitor view' });
  expect(backBtn).toBeInTheDocument();
  expect(backBtn).toHaveTextContent(/Back/i);

  fireEvent.click(backBtn);
  expect(setView).toHaveBeenCalledWith('orchestrator');
});

test('hides the Back exit control when the global header is shown', async () => {
  renderWithKainBain(<ObservabilityDashboard />, { view: 'orchestrator', setView: vi.fn() });

  expect(screen.queryByRole('button', { name: 'Exit monitor view' })).not.toBeInTheDocument();
  // The monitor's own telemetry header is still present.
  expect(screen.getByRole('heading', { level: 2, name: /Observability/i })).toBeInTheDocument();
});

test('tracks the application as a whole by default (no project filter)', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    view: 'observability',
    projects: [{ id: 'p1', name: 'Project Alpha' }],
  });

  await waitFor(() => {
    expect(api.observabilityStatus).toHaveBeenCalled();
  });
  // Default scope is "all": the backend is called with no project id (and no forced refresh).
  expect(api.observabilityStatus).toHaveBeenCalledWith(undefined, false);
});

test('pauses polling when tab is hidden and refreshes on visibility return', async () => {
  renderWithKainBain(<ObservabilityDashboard />);
  expect(api.observabilityStatus).toHaveBeenCalledTimes(1);

  // Simulate tab hidden
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
  expect(api.observabilityStatus).toHaveBeenCalledTimes(1);

  // Simulate tab visible again
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    writable: true,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
  await waitFor(() => expect(api.observabilityStatus).toHaveBeenCalledTimes(2));
});

test('coalesces socket invalidations, ignores unrelated tasks and cleans up on unmount', async () => {
  vi.useFakeTimers();
  try {
    const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
      engineState: { activeTaskId: 'task-active-1' },
    });
    await act(async () => {});
    act(() => {
      invalidateObservability('TASK_UPDATED', { id: 'unrelated' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.observabilityStatus).toHaveBeenCalledTimes(1);
    act(() => {
      invalidateObservability('ENGINE_STATE', {});
      invalidateObservability('PROCESS_START', { prompt: 'Never use socket prompt' });
      invalidateObservability('TASK_UPDATED', { id: 'task-active-1' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.observabilityStatus).toHaveBeenCalledTimes(2);
    expect(api.observabilityStatus).toHaveBeenLastCalledWith(undefined, true);
    expect(screen.getByTestId('active-prompt-viewer')).not.toHaveTextContent(
      'Never use socket prompt',
    );
    unmount();
    invalidateObservability('PROCESS_START', {});
    await vi.advanceTimersByTimeAsync(16000);
    expect(api.observabilityStatus).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test('an event during a pending read schedules a fresh read rather than accepting the stale response', async () => {
  vi.useFakeTimers();
  try {
    let resolveOld;
    api.observabilityStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    renderWithKainBain(<ObservabilityDashboard />);
    act(() => invalidateObservability('PROCESS_START', {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.observabilityStatus).toHaveBeenCalledTimes(1);
    await act(async () =>
      resolveOld({ observability: { activeTask: { prompt: 'Stale prompt' } } }),
    );
    expect(screen.getByTestId('active-prompt-viewer')).not.toHaveTextContent('Stale prompt');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(api.observabilityStatus).toHaveBeenCalledTimes(2);
    expect(api.observabilityStatus).toHaveBeenLastCalledWith(undefined, true);
  } finally {
    vi.useRealTimers();
  }
});

test('continuous invalidations publish fresh prompts without starvation and coalesce follow-up reads', async () => {
  vi.useFakeTimers();
  try {
    const finish = [];
    for (let i = 0; i < 3; i++) {
      api.observabilityStatus.mockImplementationOnce(
        () => new Promise((resolve) => finish.push(resolve)),
      );
    }
    const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
      engineState: { activeTaskId: 'task-active-1', activeStageId: 'build' },
    });
    const result = (prompt) => ({
      observability: {
        engineState: { activeStageId: 'build' },
        activeTask: { id: 'task-active-1', prompt },
      },
    });
    await act(async () => finish[0](result('Initial prompt')));
    act(() => invalidateObservability('PROCESS_START', {}));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    for (let i = 1; i <= 2; i++) {
      expect(api.observabilityStatus).toHaveBeenCalledTimes(i + 1);
      // Events continue throughout each pending fresh read, even beyond debounce.
      for (let event = 0; event < 6; event++) {
        act(() => invalidateObservability('TASK_UPDATED', { id: 'task-active-1' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      }
      expect(api.observabilityStatus).toHaveBeenCalledTimes(i + 1);
      await act(async () => finish[i](result(`Fresh prompt ${i}`)));
      expect(screen.getByTestId('active-prompt-viewer')).toHaveTextContent(`Fresh prompt ${i}`);
      if (i < 2)
        await act(async () => {
          await vi.advanceTimersByTimeAsync(500);
        });
    }
    unmount();
    await vi.advanceTimersByTimeAsync(16000);
    expect(api.observabilityStatus).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});

test('never shows the previous task prompt when live engine already names a new task', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: {
      activeTaskId: 'new-task',
      activeStageId: 'new-stage',
      activeStageName: 'New stage',
    },
    tasks: [{ id: 'new-task', title: 'New task', goal: 'New goal', prompt: 'Previous dispatch' }],
  });
  await act(async () => {});
  expect(screen.getByTestId('active-prompt-viewer')).not.toHaveTextContent('Previous dispatch');
  expect(screen.getByTestId('active-prompt-viewer')).not.toHaveTextContent('SYSTEM:');
  expect(screen.getByText('New task')).toBeInTheDocument();
});

test('never shows the previous run alias when live engine already names a new task', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: {
      activeTaskId: 'new-task',
      activeStageId: 'new-stage',
      activeStageName: 'New stage',
    },
    tasks: [
      {
        id: 'new-task',
        title: 'New task',
        goal: 'New goal',
        prompt: 'Previous dispatch',
        model: 'pi::p::stale',
        harness: 'pi',
        alias: { name: 'stale-alias', targetIndex: 0 },
        aliasMissing: null,
      },
    ],
  });
  await act(async () => {});
  const card = within(screen.getByTestId('widget-activeTask'));
  expect(card.queryByText('stale-alias')).not.toBeInTheDocument();
  expect(card.queryByText(/alias:/)).not.toBeInTheDocument();
  expect(screen.getByText('New task')).toBeInTheDocument();
});

test('restores the selected project scope from localStorage after refresh', async () => {
  localStorage.setItem('kainbain:observability:projectId', JSON.stringify('proj-2'));
  renderWithKainBain(<ObservabilityDashboard />, {
    projects: [
      { id: 'proj-1', name: 'Alpha' },
      { id: 'proj-2', name: 'Beta' },
    ],
  });
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  expect(screen.getByLabelText('Filter project observability scope')).toHaveValue('proj-2');
});

test('writes the project scope choice and falls back to all on corrupt storage', async () => {
  localStorage.setItem('kainbain:observability:projectId', 'not-json{{{');
  renderWithKainBain(<ObservabilityDashboard />, {
    projects: [
      { id: 'proj-1', name: 'Alpha' },
      { id: 'proj-2', name: 'Beta' },
    ],
  });
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  const select = screen.getByLabelText('Filter project observability scope');
  expect(select).toHaveValue('all');
  fireEvent.change(select, { target: { value: 'proj-1' } });
  expect(localStorage.getItem('kainbain:observability:projectId')).toBe(JSON.stringify('proj-1'));
});

test('merges the reliability widget into an existing saved layout as disabled, ready to enable', async () => {
  // A layout saved before the widget existed: no reliability entry at all.
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([{ id: 'kpis', colSpan: 12, height: 'compact', enabled: true }]),
  );
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  // The merge keeps the saved customization and adds the new widget disabled:
  // no surprise reshuffle for existing users.
  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-reliability')).not.toBeInTheDocument();

  // It is listed in the widget manager as its own (hidden) instance and can
  // be revealed from there without adding a duplicate copy.
  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  fireEvent.click(screen.getByRole('button', { name: /Manage Widgets/i }));
  expect(screen.getByText(/Harness Reliability & Intervention Flags/i)).toBeInTheDocument();

  const reliabilityRow = within(screen.getByTestId('widget-catalog-reliability'));
  expect(reliabilityRow.getByTestId('widget-count-reliability')).toHaveTextContent('×1');
  fireEvent.click(reliabilityRow.getByRole('button', { name: 'Show reliability' }));
  fireEvent.click(screen.getByRole('button', { name: /^Done$/i }));

  // Enabled through the manager, the widget fetches and renders its honest
  // empty state until reliability data exists.
  expect(screen.getByTestId('widget-reliability')).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByTestId('harness-reliability-empty')).toBeInTheDocument();
  });
});

test('renders harness reliability rows worst-first with attention flags when the widget is enabled', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([
      { id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      { id: 'reliability', colSpan: 6, height: 'normal', enabled: true },
    ]),
  );
  api.getHarnessReliability.mockResolvedValueOnce({
    reliability: [
      {
        harnessId: 'pi',
        runs: 40,
        successes: 40,
        infraFailures: 0,
        excludedRejected: 0,
        successRate: 100,
        lastRunAt: '2026-10-14T08:30:00Z',
        recent: {
          runs: 40,
          successes: 40,
          infraFailures: 0,
          excludedRejected: 0,
          successRate: 100,
        },
      },
      {
        harnessId: 'custom',
        runs: 12,
        successes: 8,
        infraFailures: 4,
        excludedRejected: 1,
        successRate: 66.7,
        lastRunAt: '2026-10-14T09:00:00Z',
        recent: {
          runs: 12,
          successes: 8,
          infraFailures: 4,
          excludedRejected: 0,
          successRate: 66.7,
        },
      },
    ],
  });

  renderWithKainBain(<ObservabilityDashboard />);

  await waitFor(() => {
    expect(screen.getByTestId('reliability-row-custom')).toBeInTheDocument();
  });
  expect(api.getHarnessReliability).toHaveBeenCalledTimes(1);

  // The failing harness sorts first and carries the intervention flag; the
  // healthy one does not.
  const rows = screen
    .getAllByTestId(/^reliability-row-/)
    .map((node) => node.getAttribute('data-testid'));
  expect(rows).toEqual(['reliability-row-custom', 'reliability-row-pi']);
  expect(screen.getByTestId('reliability-flag-custom')).toHaveTextContent('Needs attention');
  expect(screen.queryByTestId('reliability-flag-pi')).not.toBeInTheDocument();
});

test('reliability is a global payload: changing project scope never refetches it', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([{ id: 'reliability', colSpan: 6, height: 'normal', enabled: true }]),
  );
  renderWithKainBain(<ObservabilityDashboard />, {
    projects: [
      { id: 'proj-1', name: 'Alpha' },
      { id: 'proj-2', name: 'Beta' },
    ],
  });
  await waitFor(() => {
    expect(api.getHarnessReliability).toHaveBeenCalledTimes(1);
  });

  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  fireEvent.change(screen.getByLabelText(/Filter project observability scope/i), {
    target: { value: 'proj-1' },
  });
  await act(async () => {});

  // The observability snapshot refetches for the new project scope; the
  // all-projects reliability payload does not.
  await waitFor(() => {
    expect(api.observabilityStatus).toHaveBeenCalledWith('proj-1', false);
  });
  expect(api.getHarnessReliability).toHaveBeenCalledTimes(1);
});

/***
 * MARK: instance-based layouts
 * @description Proves the same widget type can be placed several times, each
 *   copy resized / hidden / titled on its own, and that the version 1 layout is
 *   migrated without losing a saved customization.
 ***/

test('renders two copies of one widget type, each resized independently', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      { instanceId: 'queue', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
      { instanceId: 'queue-2', id: 'queue', colSpan: 6, height: 'normal', enabled: true },
    ]),
  );
  renderWithKainBain(<ObservabilityDashboard />);
  await waitFor(() => {
    expect(screen.getAllByTestId('queue-item-task-active-1')).toHaveLength(2);
  });

  const firstQueue = screen.getByTestId('widget-queue');
  const secondQueue = screen.getByTestId('widget-queue-2');
  expect(firstQueue.className).toContain('lg:col-span-4');
  expect(secondQueue.className).toContain('lg:col-span-6');

  // Resize only the second copy; the first must not move.
  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
  fireEvent.change(
    within(screen.getByTestId('widget-queue-2')).getByLabelText(/Resize width for/i),
    { target: { value: '8' } },
  );

  expect(screen.getByTestId('widget-queue').className).toContain('lg:col-span-4');
  expect(screen.getByTestId('widget-queue-2').className).toContain('lg:col-span-8');
});

test('hides one copy of a widget type without touching its sibling', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      { instanceId: 'queue', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
      { instanceId: 'queue-2', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
    ]),
  );
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: /Toggle dashboard configuration controls/i }));
  fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
  fireEvent.click(
    within(screen.getByTestId('widget-queue-2')).getByTitle('Hide / Remove this widget'),
  );

  expect(screen.getByTestId('widget-queue')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-queue-2')).not.toBeInTheDocument();
});

test('applies a per-instance config title so two copies are distinguishable', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      {
        instanceId: 'queue',
        id: 'queue',
        colSpan: 4,
        height: 'tall',
        enabled: true,
        config: { title: 'Queue (prod)' },
      },
      { instanceId: 'queue-2', id: 'queue', colSpan: 4, height: 'tall', enabled: true },
    ]),
  );
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(within(screen.getByTestId('widget-queue')).getByText('Queue (prod)')).toBeInTheDocument();
  expect(
    within(screen.getByTestId('widget-queue-2')).getByText(/Execution Queue Order/i),
  ).toBeInTheDocument();
});

test('renders atomic KPI and health widgets as their own dashboard widgets', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      {
        instanceId: 'kpi-successes',
        id: 'kpi-successes',
        colSpan: 3,
        height: 'compact',
        enabled: true,
      },
      { instanceId: 'kpi-engine', id: 'kpi-engine', colSpan: 3, height: 'compact', enabled: true },
      {
        instanceId: 'health-litellm',
        id: 'health-litellm',
        colSpan: 3,
        height: 'compact',
        enabled: true,
      },
    ]),
  );
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: {
      status: 'running',
      activeTaskId: 'task-active-1',
      activeStageName: 'Code Generation',
      activeStageType: 'agent',
    },
  });
  await act(async () => {});

  expect(screen.getByTestId('widget-kpi-successes')).toBeInTheDocument();
  expect(
    within(screen.getByTestId('widget-kpi-successes')).getByTestId('kpi-successes'),
  ).toHaveTextContent('Completed tasks');
  expect(screen.getByTestId('widget-kpi-engine')).toBeInTheDocument();
  expect(
    within(screen.getByTestId('widget-kpi-engine')).getByTestId('kpi-pipeline'),
  ).toHaveTextContent('Code Generation');
  expect(screen.getByTestId('widget-health-litellm')).toBeInTheDocument();
  expect(
    within(screen.getByTestId('widget-health-litellm')).getByTestId('health-litellm'),
  ).toHaveTextContent('LiteLLM Proxy');
});

test('migrates a version 1 layout to version 2 and retires the legacy key', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([
      { id: 'kpis', colSpan: 12, height: 'compact', enabled: true },
      { id: 'console', colSpan: 6, height: 'tall', enabled: true },
    ]),
  );
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('widget-console')).toBeInTheDocument();

  const migrated = JSON.parse(localStorage.getItem('kainbain_observability_layout_v2'));
  expect(migrated[0]).toMatchObject({ instanceId: 'kpis', id: 'kpis', enabled: true });
  expect(migrated[1]).toMatchObject({ instanceId: 'console', id: 'console', enabled: true });
  // The successful v2 write retires the legacy key.
  expect(localStorage.getItem('kainbain_observability_layout_v1')).toBeNull();
});

test('round-trips a version 2 layout with duplicate instances across reloads', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      { instanceId: 'kpi-queue', id: 'kpi-queue', colSpan: 3, height: 'compact', enabled: true },
      { instanceId: 'kpi-queue-2', id: 'kpi-queue', colSpan: 6, height: 'normal', enabled: false },
    ]),
  );
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});
  expect(screen.getByTestId('widget-kpi-queue')).toBeInTheDocument();

  unmount();
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(screen.getByTestId('widget-kpi-queue')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpi-queue-2')).not.toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem('kainbain_observability_layout_v2'));
  const savedQueues = saved.filter((entry) => entry.id === 'kpi-queue');
  expect(savedQueues.map((entry) => entry.instanceId)).toEqual(['kpi-queue', 'kpi-queue-2']);
  expect(savedQueues[1].enabled).toBe(false);
});

test('falls back to the factory layout when the saved layout is corrupt', async () => {
  localStorage.setItem('kainbain_observability_layout_v2', 'not-json{{{');
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('widget-queue')).toBeInTheDocument();
});

test('polls harness reliability once even when two reliability widgets are placed', async () => {
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      { instanceId: 'reliability', id: 'reliability', colSpan: 6, height: 'normal', enabled: true },
      {
        instanceId: 'reliability-2',
        id: 'reliability',
        colSpan: 6,
        height: 'normal',
        enabled: true,
      },
    ]),
  );
  renderWithKainBain(<ObservabilityDashboard />);

  // Wait for the settled state, not just the call: the fetch landing swaps
  // the loading placeholder for the honest empty state in both instances,
  // which can happen after the call itself under slow CI conditions.
  await waitFor(() => {
    expect(screen.getAllByTestId('harness-reliability-empty')).toHaveLength(2);
  });
  expect(api.getHarnessReliability).toHaveBeenCalledTimes(1);
});

test('a version 2 layout loads exactly: removed widgets stay removed across reloads', async () => {
  // The operator removed every widget except the console via the manager, so
  // the v2 store holds a single entry. Reloading must NOT resurrect the
  // cockpit defaults — a v2 store is the operator's exact arrangement.
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      { instanceId: 'console', id: 'console', colSpan: 6, height: 'tall', enabled: true },
    ]),
  );
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-queue')).not.toBeInTheDocument();

  unmount();
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
  const saved = JSON.parse(localStorage.getItem('kainbain_observability_layout_v2'));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ instanceId: 'console', id: 'console', enabled: true });
});

test('version 1 migration still appends the cockpit defaults the layout predates', async () => {
  // A pre-split v1 store holds only the console entry. Migrating must keep
  // the saved customization AND append the missing cockpit defaults, so the
  // operator never upgrades into a half-empty cockpit.
  localStorage.setItem(
    'kainbain_observability_layout_v1',
    JSON.stringify([{ id: 'console', colSpan: 6, height: 'tall', enabled: true }]),
  );
  renderWithKainBain(<ObservabilityDashboard />);
  await act(async () => {});

  expect(screen.getByTestId('widget-console')).toBeInTheDocument();
  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('widget-queue')).toBeInTheDocument();
});

test('re-keys a colliding factory instanceId when merging missing catalog defaults', () => {
  // A layout legitimately uses the factory instanceId `kpis` on a DIFFERENT
  // widget type (queue). Merging the missing cockpit defaults appends a
  // `kpis` entry that would collide; the merged layout must be re-normalized
  // so no two entries share an instanceId (otherwise one resize/hide control
  // would drive both widgets). Migration-only helper: covered directly here
  // because v2 stores load exactly and never merge.
  const merged = mergeMissingCatalogWidgets([
    { instanceId: 'kpis', id: 'queue', colSpan: 6, height: 'normal', enabled: true, config: {} },
  ]);
  const ids = merged.map((entry) => entry.instanceId);
  expect(new Set(ids).size).toBe(ids.length);
  // The saved queue keeps its instanceId; the merged kpis entry is re-keyed.
  expect(merged.find((entry) => entry.id === 'queue').instanceId).toBe('kpis');
  expect(merged.find((entry) => entry.id === 'kpis').instanceId).not.toBe('kpis');
});

/***
 * MARK: ObservabilityDashboard a11y structure
 * @description The monitor view exposes a level-one heading and does not nest
 *   a second main landmark; its scrollable widget bodies are keyboard-
 *   scrollable labelled groups (WCAG 1.3.1/1.3.6, 2.1.1, 2.4.6). Guards the
 *   axe findings the 2026-10-15 re-audit fixed on this delta surface.
 ***/
test('exposes a level-one heading and no nested main landmark', () => {
  const { container } = renderWithKainBain(<ObservabilityDashboard />, {
    projects: [{ id: 'p1', name: 'Project Alpha' }],
  });
  expect(screen.getByRole('heading', { level: 1, name: /Observability/i })).toBeInTheDocument();
  expect(container.querySelectorAll('main')).toHaveLength(0);
});

test('makes scrollable widget bodies keyboard-scrollable labelled groups', () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    projects: [{ id: 'p1', name: 'Project Alpha' }],
  });
  const groups = document.querySelectorAll('[role="group"][tabindex="0"]');
  expect(groups.length).toBeGreaterThan(0);
  for (const group of groups) {
    expect((group.getAttribute('aria-label') || '').trim().length).toBeGreaterThan(0);
  }
});
