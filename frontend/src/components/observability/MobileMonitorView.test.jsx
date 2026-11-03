import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import {
  MobileMonitorView,
  formatMobileMonitorTitle,
  resolveMobileModelLine,
} from './MobileMonitorView';

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());

vi.mock('../../services/api', () => ({
  api: { getRunners, getRunnerMonitor },
}));

import '@testing-library/jest-dom';

beforeEach(() => {
  vi.clearAllMocks();
  // Empty fleet by default: no test touches the real network, and the legacy
  // pill fallback renders unless a test injects fleet state.
  getRunners.mockResolvedValue([]);
  getRunnerMonitor.mockResolvedValue({ liveAssignments: [] });
});

// Renders the view, then flushes the header's single fleet poll inside act
// so every assertion runs on the settled state and no state update lands
// after the test body (the same flush pattern the dashboard's compact tests
// use). Tests that inject fleet overrides skip polling, so the flush is a
// no-op for them.
const renderView = async (ui) => {
  const result = renderWithKainBain(ui);
  await act(async () => {});
  return result;
};

const baseProps = {
  engineState: { status: 'running', activeStageName: 'Code Generation' },
  activeTask: {
    id: 't1',
    title: 'Build user auth',
    stageType: 'agent',
    harness: 'pi',
    model: 'pi::ollama-cloud::gemma4:31b-cloud',
  },
  processLogs: [
    { id: '1', timestamp: '12:00:01', tag: '[AGENT]', text: 'Agent reasoning started' },
    { id: '2', timestamp: '12:00:02', tag: '[ERROR]', text: 'Connection timed out' },
  ],
};

test('slim header shows engine pill, active task, and model details instead of task counts', async () => {
  await renderView(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument();
  const pill = screen.getByTestId('mobile-engine-state');
  expect(pill).toHaveTextContent(/ACTIVE: Code Generation/i);
  const headerText = screen.getByTestId('mobile-active-stage');
  expect(headerText).toHaveTextContent('Build user auth');
  expect(headerText).not.toHaveTextContent('Code Generation');

  expect(screen.queryByTestId('mobile-monitor-counts')).not.toBeInTheDocument();
  const details = screen.getByTestId('mobile-monitor-model-details');
  expect(details).toHaveTextContent(/Harness:/);
  expect(details).toHaveTextContent('pi');
  expect(details).toHaveTextContent(/Model:/);
  expect(details).toHaveTextContent('gemma4:31b-cloud');
});

test('engine pill names the active task stage over a stranded engine stage', async () => {
  await renderView(
    <MobileMonitorView
      engineState={{
        status: 'running',
        activeTaskId: 't1',
        activeStageId: 'merge',
        activeStageName: 'Merge and deploy',
      }}
      activeTask={{ id: 't1', title: 'Build user auth', currentStageId: '5' }}
      stages={[{ id: '5', name: 'Catchup', type: 'agent' }]}
      processLogs={[]}
      onExit={() => {}}
    />,
  );
  // Task 072e2cfa: mobile showed the stage the task had already left.
  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('ACTIVE: Catchup');
  expect(screen.getByTestId('mobile-engine-state')).not.toHaveTextContent('Merge and deploy');
});

test('legacy stats and queueCount props are ignored without crashing', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      stats={{ completed: 7, failed: 1, waitingHuman: 2 }}
      queueCount={3}
      onExit={() => {}}
    />,
  );

  expect(screen.queryByTestId('mobile-monitor-counts')).not.toBeInTheDocument();
  expect(screen.getByTestId('mobile-monitor-model-details')).toBeInTheDocument();
});

test.each(['ci', 'deploy', 'merge'])(
  'scripted stage %s renders Automated — no model instead of pills',
  async (stageType) => {
    await renderView(
      <MobileMonitorView
        {...baseProps}
        activeTask={{
          id: 't1',
          title: 'Run checks',
          stageType,
          harness: 'pi',
          model: 'pi::ollama-cloud::gemma4:31b-cloud',
        }}
        onExit={() => {}}
      />,
    );

    const details = screen.getByTestId('mobile-monitor-model-details');
    expect(details).toHaveTextContent('Automated — no model');
    expect(details).not.toHaveTextContent(/Harness:/);
    expect(details).not.toHaveTextContent(/Model:/);
  },
);

test("harness-managed stage (modelSelection 'none') hides only the model pill", async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      activeTask={{
        id: 't1',
        title: 'Delegate to harness',
        stageType: 'agent',
        harness: 'muse',
        modelSelection: 'none',
      }}
      onExit={() => {}}
    />,
  );

  const details = screen.getByTestId('mobile-monitor-model-details');
  expect(details).toHaveTextContent(/Harness:/);
  expect(details).toHaveTextContent('muse');
  expect(details).not.toHaveTextContent(/Model:/);
  expect(details).not.toHaveTextContent(/Provider:/);
});

test('provider and source render when the active task reports them', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      activeTask={{
        id: 't1',
        title: 'Build user auth',
        stageType: 'agent',
        harness: 'pi',
        modelDetails: {
          key: 'pi::ollama-cloud::gemma4:31b-cloud',
          provider: 'ollama-cloud',
          source: 'stage-override',
        },
      }}
      onExit={() => {}}
    />,
  );

  const details = screen.getByTestId('mobile-monitor-model-details');
  expect(details).toHaveTextContent(/Model:/);
  expect(details).toHaveTextContent('gemma4:31b-cloud');
  expect(details).toHaveTextContent(/Provider: ollama-cloud/);
  expect(details).toHaveTextContent(/Source: stage-override/);
});

test('idle view shows the no-active-model fallback instead of blanking', async () => {
  await renderView(<MobileMonitorView engineState={{}} stats={{}} onExit={() => {}} />);

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('No active stage');
  expect(screen.getByTestId('mobile-monitor-model-details')).toHaveTextContent(
    'Idle — no active model',
  );
  expect(screen.queryByTestId('mobile-monitor-counts')).not.toBeInTheDocument();
});

test('long model names truncate on one line with a full-text tooltip', async () => {
  const longModel =
    'pi::ollama-cloud::an-extremely-long-model-identifier-that-must-not-overflow-a-360px-viewport';
  await renderView(
    <MobileMonitorView
      {...baseProps}
      activeTask={{
        id: 't1',
        title: 'Build user auth',
        stageType: 'agent',
        harness: 'pi',
        model: longModel,
      }}
      onExit={() => {}}
    />,
  );

  // Row 2 is a single truncated line: no wrapping, full text in the tooltip.
  const details = screen.getByTestId('mobile-monitor-model-details');
  expect(details).toHaveClass('truncate');
  expect(details.className).toMatch(/whitespace-nowrap/);
  expect(details.className).not.toMatch(/flex-wrap/);
  expect(details).toHaveAttribute('title', expect.stringContaining(longModel));
  expect(details).toHaveTextContent(/Model:/);
});

test('renders only the log console: no other dashboard widgets', async () => {
  await renderView(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  expect(screen.getByTestId('live-log-console')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-queue')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-activeTask')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-health')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-outcomes')).not.toBeInTheDocument();
});

test('idle engine shows IDLE pill and logs empty-state without crashing', async () => {
  await renderView(<MobileMonitorView engineState={{}} stats={{}} onExit={() => {}} />);

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('No active stage');
  expect(screen.getByText(/Waiting for process logs stream/i)).toBeInTheDocument();
});

test('filter chips and Clear still operate in the compact view', async () => {
  const onClearLogs = vi.fn();
  await renderView(<MobileMonitorView {...baseProps} onClearLogs={onClearLogs} onExit={() => {}} />);

  // Filters are collapsed by default: reveal them first.
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  // Multi-select lanes: toggling Errors off hides the error line only.
  fireEvent.click(screen.getByRole('button', { name: 'Errors' }));
  expect(screen.queryByText('Connection timed out')).not.toBeInTheDocument();
  expect(screen.getByText('Agent reasoning started')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
  expect(onClearLogs).toHaveBeenCalledTimes(1);
});

test('Back exits the monitor', async () => {
  const onExit = vi.fn();
  await renderView(<MobileMonitorView {...baseProps} onExit={onExit} />);

  fireEvent.click(screen.getByRole('button', { name: 'Back to orchestrator' }));
  expect(onExit).toHaveBeenCalledTimes(1);
});

test('header falls back to the goal first line when the task has no title', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      activeTask={{ id: 't2', goal: '# Ship the widget\nSecond line' }}
      onExit={() => {}}
    />,
  );

  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('Ship the widget');
});

test('running without a resolved task shows a no-task label, not the stage twice', async () => {
  await renderView(<MobileMonitorView {...baseProps} activeTask={null} onExit={() => {}} />);

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent(
    /ACTIVE: Code Generation/i,
  );
  const headerText = screen.getByTestId('mobile-active-stage');
  expect(headerText).toHaveTextContent('No active task');
  expect(headerText).not.toHaveTextContent('Code Generation');
});

test('long task titles truncate with a full-text tooltip', async () => {
  const longTitle = 'Implement the extremely long task title that must not overflow a 360px viewport';
  await renderView(
    <MobileMonitorView
      {...baseProps}
      activeTask={{ id: 't3', title: longTitle }}
      onExit={() => {}}
    />,
  );

  const headerText = screen.getByTestId('mobile-active-stage');
  expect(headerText).toHaveTextContent(longTitle);
  expect(headerText).toHaveClass('truncate');
  expect(headerText).toHaveAttribute('title', longTitle);
});

test('stage name appears exactly once in the header row while running', async () => {
  await renderView(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  const header = screen.getByTestId('mobile-monitor-view').querySelector('header');
  const occurrences = (header.textContent.match(/Code Generation/g) || []).length;
  expect(occurrences).toBe(1);
});

test('fleet shown: legacy pill hides and the chip names task plus stage', async () => {
  await renderView(
    <MobileMonitorView
      engineState={{ status: 'running', activeStageName: 'Code Generation' }}
      activeTask={{ id: 't1', title: 'Build user auth', currentStageId: '5' }}
      stages={[{ id: '5', name: 'Catchup', type: 'agent' }]}
      runnerAssignmentsOverride={[{ runnerId: 'local-alpha', taskId: 't1' }]}
      runnerRegistryOverride={[{ runnerId: 'local-alpha' }]}
      processLogs={[]}
      onExit={() => {}}
    />,
  );

  // The single-threaded-era global pill is gone; per-runner rows carry state.
  expect(screen.queryByTestId('mobile-engine-state')).not.toBeInTheDocument();
  // Header and rows share the one injected fleet read: the row renders too.
  expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
  const chip = screen.getByTestId('mobile-active-stage');
  expect(chip).toHaveTextContent('Build user auth · Catchup');
  expect(chip).toHaveAttribute('title', 'Build user auth · Catchup');
  expect(chip).toHaveAttribute('role', 'status');
  // The stage still appears exactly once in the header — inside the chip.
  const header = screen.getByTestId('mobile-monitor-view').querySelector('header');
  const occurrences = (header.textContent.match(/Catchup/g) || []).length;
  expect(occurrences).toBe(1);
});

test('fleet shown but task unnamed: pill stays hidden and the legacy label remains', async () => {
  await renderView(
    <MobileMonitorView
      engineState={{ status: 'running', activeStageName: 'Code Generation' }}
      activeTask={null}
      runnerAssignmentsOverride={[{ runnerId: 'local-alpha', taskId: 't9' }]}
      runnerRegistryOverride={[{ runnerId: 'local-alpha' }]}
      processLogs={[]}
      onExit={() => {}}
    />,
  );

  expect(screen.queryByTestId('mobile-engine-state')).not.toBeInTheDocument();
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('No active task');
});

test('fleet shown, task unnamed, and idle: chip falls back to the no-stage label, not blank', async () => {
  await renderView(
    <MobileMonitorView
      engineState={{ status: 'idle' }}
      activeTask={null}
      runnerAssignmentsOverride={[{ runnerId: 'local-alpha', taskId: 't9' }]}
      runnerRegistryOverride={[{ runnerId: 'local-alpha' }]}
      processLogs={[]}
      onExit={() => {}}
    />,
  );

  // With a fleet shown the pill is gone, so the chip must still name
  // something readable: the idle fallback, never an empty header.
  expect(screen.queryByTestId('mobile-engine-state')).not.toBeInTheDocument();
  const chip = screen.getByTestId('mobile-active-stage');
  expect(chip).toHaveTextContent('No active stage');
  expect(chip).toHaveAttribute('role', 'status');
});

test('fleet registered but idle: pill hidden and the fleet-idle state shows', async () => {
  await renderView(
    <MobileMonitorView
      engineState={{ status: 'idle', activeStageName: 'Code Generation' }}
      activeTask={{ id: 't1', title: 'Build user auth', currentStageId: '5' }}
      stages={[{ id: '5', name: 'Catchup', type: 'agent' }]}
      runnerAssignmentsOverride={[]}
      runnerRegistryOverride={[{ runnerId: 'local-alpha' }]}
      processLogs={[]}
      onExit={() => {}}
    />,
  );

  // A registered fleet owns the status signal even between assignments.
  expect(screen.queryByTestId('mobile-engine-state')).not.toBeInTheDocument();
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent(
    'Build user auth · Catchup',
  );
  expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
});

test('pill fallback keeps a single status announcer for screen readers', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      runnerAssignmentsOverride={[]}
      runnerRegistryOverride={[]}
      onExit={() => {}}
    />,
  );

  // The pill announces; the task-only title stays silent so state changes
  // are read once, not twice.
  expect(screen.getByTestId('mobile-engine-state')).toHaveAttribute('role', 'status');
  expect(screen.getByTestId('mobile-active-stage')).not.toHaveAttribute('role');
});

test('null engine snapshot renders the idle fallback without crashing', async () => {
  await renderView(
    <MobileMonitorView
      engineState={null}
      activeTask={{ id: 't1', title: 'Build user auth' }}
      runnerAssignmentsOverride={[]}
      runnerRegistryOverride={[]}
      processLogs={[]}
      onExit={() => {}}
    />,
  );

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('Build user auth');
  // Fail-visible, not blank: the task names no model, so Unknown labels show.
  expect(screen.getByTestId('mobile-monitor-model-details')).toHaveTextContent(
    'Harness: Unknown',
  );
});

test('null list props render fallbacks without crashing', async () => {
  await renderView(
    <MobileMonitorView
      engineState={null}
      activeTask={null}
      stages={null}
      runnerTasks={null}
      runnerStages={null}
      processLogs={null}
      runnerAssignmentsOverride={[]}
      runnerRegistryOverride={[]}
      onExit={() => {}}
    />,
  );

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('No active stage');
  expect(screen.getByTestId('mobile-monitor-model-details')).toHaveTextContent(
    'Idle — no active model',
  );
  expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
  expect(screen.getByText(/Waiting for process logs stream/i)).toBeInTheDocument();
});

test('header formatters stay importable from the view after the module split', () => {
  expect(formatMobileMonitorTitle({ title: 'Build auth' }, {}, true)).toBe('Build auth');
  expect(resolveMobileModelLine(null)).toBeNull();
});

test('no runners configured: pill fallback stays with the legacy task-only title', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      runnerAssignmentsOverride={[]}
      runnerRegistryOverride={[]}
      onExit={() => {}}
    />,
  );

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent(
    /ACTIVE: Code Generation/i,
  );
  const headerText = screen.getByTestId('mobile-active-stage');
  expect(headerText).toHaveTextContent('Build user auth');
  expect(headerText).not.toHaveTextContent('Code Generation');
});

test('assignments-only override keeps header and rows consistent with no polling', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      runnerAssignmentsOverride={[{ runnerId: 'local-alpha', taskId: 't1' }]}
      onExit={() => {}}
    />,
  );

  // One override still skips the fleet poll; the live assignment alone is
  // fleet presence, so the pill hides and the row renders.
  expect(screen.queryByTestId('mobile-engine-state')).not.toBeInTheDocument();
  expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
  expect(getRunnerMonitor).not.toHaveBeenCalled();
  expect(getRunners).not.toHaveBeenCalled();
});

test('malformed fleet overrides fail safe to the pill fallback, never a crash', async () => {
  await renderView(
    <MobileMonitorView
      {...baseProps}
      runnerAssignmentsOverride="not-a-fleet"
      runnerRegistryOverride="not-a-registry"
      onExit={() => {}}
    />,
  );

  // Unknown fleet shapes count as no fleet: the pill stays visible and the
  // rows keep the idle state, so status is never hidden on bad input.
  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent(
    /ACTIVE: Code Generation/i,
  );
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('Build user auth');
  expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
  expect(getRunnerMonitor).not.toHaveBeenCalled();
  expect(getRunners).not.toHaveBeenCalled();
});

test('header and rows share one fleet poller: one read per tick, never doubled', async () => {
  vi.useFakeTimers();
  try {
    const now = new Date().toISOString();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        { runnerId: 'local-alpha', taskId: 't1', stageId: 'build', startedAt: now, lastSeenAt: now },
      ],
    });
    getRunners.mockResolvedValue([{ runnerId: 'local-alpha' }]);
    const { unmount } = await renderView(<MobileMonitorView {...baseProps} onExit={() => {}} />);
    // Advance inside act so the rows' 1s elapsed-clock interval updates
    // land within act instead of warning.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // The one shared read feeds both the header and the row: the legacy
    // pill drops away and the live assignment renders.
    expect(screen.queryByTestId('mobile-engine-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
    expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent(
      'Build user auth · Code Generation',
    );
    expect(getRunnerMonitor).toHaveBeenCalledTimes(1);
    expect(getRunners).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    // Initial read plus one read per 5s tick — the rows reuse the header's
    // read instead of polling themselves (6 calls would mean double polling).
    expect(getRunnerMonitor).toHaveBeenCalledTimes(3);
    expect(getRunners).toHaveBeenCalledTimes(3);
    unmount();
  } finally {
    vi.useRealTimers();
  }
});

test('compressed header is two rows: chip row plus one model line', async () => {
  await renderView(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  const header = screen.getByTestId('mobile-monitor-view').querySelector('header');
  expect(header.querySelectorAll(':scope > div')).toHaveLength(2);
});

test('console wrappers keep min-w-0 so wide log rows cannot push the page sideways', async () => {
  await renderView(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  const root = screen.getByTestId('mobile-monitor-view');
  expect(root).toHaveClass('min-w-0');
  expect(root).toHaveClass('overflow-hidden');

  // The console wrapper directly above the live console widget must stay
  // width-constrained down the flex chain into LogViewer.
  const consoleWrapper = root.querySelector(':scope > div:last-child');
  expect(consoleWrapper.className).toContain('min-w-0');

  // The live scroll region clamps horizontally as the final fail-safe.
  const consoleEl = screen.getByTestId('live-log-console');
  expect(consoleEl.className).toContain('overflow-x-hidden');
  expect(consoleEl.className).toContain('min-w-0');
});
