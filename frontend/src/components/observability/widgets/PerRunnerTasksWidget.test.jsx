import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import {
  PerRunnerTasksWidget,
  formatRunnerElapsed,
  formatShortRunnerTaskId,
  runnerFreshness,
} from './PerRunnerTasksWidget';

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());

vi.mock('../../../services/api', () => ({
  api: { getRunners, getRunnerMonitor },
}));

import { api } from '../../../services/api';
import '@testing-library/jest-dom';

describe('formatRunnerElapsed', () => {
  test('formats mm:ss and never invents a time', () => {
    expect(formatRunnerElapsed('2026-10-27T12:00:00.000Z', Date.parse('2026-10-27T12:01:30.000Z'))).toBe(
      '01:30',
    );
    expect(formatRunnerElapsed(null, Date.now())).toBe('—');
    expect(formatRunnerElapsed('not-a-date', Date.now())).toBe('—');
    // A start in the future (clock skew) never counts up from negative time.
    expect(
      formatRunnerElapsed('2026-10-27T12:05:00.000Z', Date.parse('2026-10-27T12:00:00.000Z')),
    ).toBe('—');
  });
});

describe('runnerFreshness', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  test('live within a minute, stale after, unknown without heartbeat', () => {
    expect(runnerFreshness(new Date(now - 10_000).toISOString(), now)).toBe('live');
    expect(runnerFreshness(new Date(now - 120_000).toISOString(), now)).toBe('stale');
    expect(runnerFreshness(null, now)).toBe('unknown');
  });
  test('an unusable clock reads unknown, never a stale alarm', () => {
    const fresh = new Date(now - 10_000).toISOString();
    expect(runnerFreshness(fresh, NaN)).toBe('unknown');
    expect(runnerFreshness(fresh, undefined)).toBe('unknown');
    expect(runnerFreshness(null, NaN)).toBe('unknown');
  });
});

describe('formatShortRunnerTaskId', () => {
  test('shortens to 8 characters and never prints undefined or null', () => {
    expect(formatShortRunnerTaskId('abcdef12-3456')).toBe('abcdef12');
    expect(formatShortRunnerTaskId('short')).toBe('short');
    expect(formatShortRunnerTaskId(123456789)).toBe('12345678');
    expect(formatShortRunnerTaskId(null)).toBe('…');
    expect(formatShortRunnerTaskId(undefined)).toBe('…');
    expect(formatShortRunnerTaskId('')).toBe('…');
    expect(formatShortRunnerTaskId('   ')).toBe('…');
  });
});

describe('PerRunnerTasksWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRunners.mockResolvedValue([]);
    getRunnerMonitor.mockResolvedValue({ liveAssignments: [] });
  });

  test('shows the idle state when no Runner holds a lease', async () => {
    render(<PerRunnerTasksWidget tasks={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-tasks')).toBeInTheDocument();
    });
    expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
  });

  test('fleet endpoint failures keep the idle state without crashing', async () => {
    getRunnerMonitor.mockRejectedValue(new Error('fleet monitor down'));
    getRunners.mockRejectedValue(new Error('registry down'));
    render(<PerRunnerTasksWidget tasks={[]} compact />);
    // The rejected reads must land quietly: idle state stays, nothing throws.
    await waitFor(() => {
      expect(getRunnerMonitor).toHaveBeenCalled();
    });
    expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
  });

  test('a synchronously throwing fleet client keeps the idle state without crashing', async () => {
    getRunnerMonitor.mockImplementation(() => {
      throw new Error('fleet client exploded');
    });
    getRunners.mockResolvedValue([]);
    render(<PerRunnerTasksWidget tasks={[]} compact />);
    await waitFor(() => {
      expect(getRunnerMonitor).toHaveBeenCalled();
    });
    expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
  });

  test('missing fleet endpoint methods read as empty fleet without crashing', async () => {
    // Old backends expose no fleet endpoints (mixed-version rollout): the
    // hook reads that as empty fleet — legacy fallback stays visible — and
    // never calls what is not there.
    const originalMonitor = api.getRunnerMonitor;
    const originalRunners = api.getRunners;
    api.getRunnerMonitor = undefined;
    api.getRunners = undefined;
    try {
      render(<PerRunnerTasksWidget tasks={[]} compact />);
      await waitFor(() => {
        expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
      });
      expect(getRunnerMonitor).not.toHaveBeenCalled();
      expect(getRunners).not.toHaveBeenCalled();
    } finally {
      api.getRunnerMonitor = originalMonitor;
      api.getRunners = originalRunners;
    }
  });

  test('renders one full card per live assignment with elapsed and tail', async () => {
    const startedAt = new Date(Date.now() - 90_000).toISOString();
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'abcdef12-3456',
          executionId: 'exec-1',
          epoch: 1,
          startedAt,
          stageId: 'build',
          prompt: '# Build auth\n\nImplement login.',
          serving: { harness: 'pi', model: 'muse-spark' },
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    getRunners.mockResolvedValue([
      { runnerId: 'local-alpha', status: 'active', capabilities: { harnesses: [{ id: 'pi' }] } },
    ]);
    const tasks = [
      {
        id: 'abcdef12-3456',
        title: 'Build auth',
        goal: 'Implement login',
        logEntries: [
          { id: 'l1', kind: 'runner', text: '[runner local-alpha] hello', meta: { runnerId: 'local-alpha' } },
        ],
      },
    ];
    render(
      <PerRunnerTasksWidget tasks={tasks} stages={[{ id: 'build', name: 'Build' }]} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-local-alpha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-task-local-alpha')).toHaveTextContent('abcdef12');
    expect(screen.getByTestId('per-runner-elapsed-local-alpha')).toHaveTextContent('01:3');
    expect(screen.getByTestId('per-runner-tail-local-alpha')).toHaveTextContent('hello');
    expect(screen.getByTestId('per-runner-prompt-local-alpha')).toHaveTextContent('Implement login');
    expect(screen.getByTestId('per-runner-card-local-alpha')).toHaveTextContent('Harness:');
    expect(screen.getByTestId('per-runner-card-local-alpha')).toHaveTextContent('pi');
    expect(screen.getByTestId('per-runner-card-local-alpha')).toHaveTextContent('muse-spark');
    expect(screen.getByTestId('per-runner-card-local-alpha')).toHaveTextContent('Build');
  });

  test('full card shows a placeholder until the Runner reports its prompt', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'abcdef12-3456',
          executionId: 'exec-1',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'build',
          prompt: null,
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    render(<PerRunnerTasksWidget tasks={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-prompt-empty-local-alpha')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('per-runner-prompt-local-alpha')).not.toBeInTheDocument();
  });

  test('compact variant renders one row per runner', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-bravo',
          projectId: 'p1',
          taskId: 'ffff0000-1111',
          executionId: 'exec-9',
          epoch: 2,
          startedAt: new Date().toISOString(),
          stageId: 'test',
          lastSeenAt: null,
        },
      ],
    });
    render(<PerRunnerTasksWidget tasks={[]} compact />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-local-bravo')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('per-runner-prompt-local-bravo')).not.toBeInTheDocument();
  });

  test('compact row shows serving harness/model pills while running, hidden for CI (no serving)', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-agent',
          projectId: 'p1',
          taskId: 'aaaa1111-2222',
          executionId: 'exec-a',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'build',
          serving: { harness: 'pi', model: 'kimi-k3:cloud' },
          lastSeenAt: new Date().toISOString(),
        },
        {
          runnerId: 'local-ci',
          projectId: 'p1',
          taskId: 'bbbb3333-4444',
          executionId: 'exec-c',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'test',
          serving: null,
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    render(<PerRunnerTasksWidget tasks={[]} compact />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-local-agent')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-compact-harness-local-agent')).toHaveTextContent('pi');
    expect(screen.getByTestId('per-runner-compact-model-local-agent')).toHaveTextContent('kimi-k3:cloud');
    expect(screen.queryByTestId('per-runner-compact-harness-local-ci')).not.toBeInTheDocument();
    expect(screen.queryByTestId('per-runner-compact-model-local-ci')).not.toBeInTheDocument();
  });

  test('compact row truncates long runner, stage, harness, and model text on one line', async () => {
    const longRunnerId = 'local-alpha-with-an-extremely-long-runner-name-that-must-truncate';
    const longStageName = 'An extremely long stage name that must not push the row sideways';
    const longHarness = 'an-extremely-long-harness-name';
    const longModel = 'an-extremely-long-model-identifier-that-must-truncate';
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[{ id: 'build', name: longStageName }]}
        compact
        assignmentsOverride={[
          {
            runnerId: longRunnerId,
            taskId: 't1',
            stageId: 'build',
            serving: { harness: longHarness, model: longModel },
            startedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
        ]}
        registryOverride={[{ runnerId: longRunnerId }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId(`per-runner-row-${longRunnerId}`)).toBeInTheDocument();
    });
    const row = screen.getByTestId(`per-runner-row-${longRunnerId}`);
    // Flex children need min-w-0 before truncate can bite; the freshness
    // dot and the elapsed clock never shrink.
    expect(row.querySelector('summary').className).toContain('min-w-0');
    const runnerName = row.querySelector('strong');
    expect(runnerName).toHaveClass('truncate');
    expect(runnerName).toHaveAttribute('title', longRunnerId);
    const harness = screen.getByTestId(`per-runner-compact-harness-${longRunnerId}`);
    expect(harness).toHaveClass('truncate');
    expect(harness).toHaveAttribute('title', longHarness);
    const model = screen.getByTestId(`per-runner-compact-model-${longRunnerId}`);
    expect(model).toHaveClass('truncate');
    expect(model).toHaveAttribute('title', longModel);
    expect(row).toHaveTextContent(longStageName);
  });

  test('injected overrides render without polling the fleet endpoints', async () => {
    // The mobile header's single poller: polling must stay off while set.
    getRunnerMonitor.mockRejectedValue(new Error('must not poll'));
    getRunners.mockRejectedValue(new Error('must not poll'));
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        compact
        assignmentsOverride={[{ runnerId: 'local-alpha', taskId: 't1', stageId: 'build' }]}
        registryOverride={[{ runnerId: 'local-alpha' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
    });
    expect(getRunnerMonitor).not.toHaveBeenCalled();
    expect(getRunners).not.toHaveBeenCalled();
  });

  test('compact row shows an ellipsis for a missing task id, never undefine', async () => {
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[{ id: 'build', name: 'Build' }]}
        compact
        assignmentsOverride={[{ runnerId: 'local-alpha', stageId: 'build' }]}
        registryOverride={[{ runnerId: 'local-alpha' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
    });
    const row = screen.getByTestId('per-runner-row-local-alpha');
    expect(row).toHaveTextContent('…');
    expect(row).not.toHaveTextContent('undefine');
    expect(row).not.toHaveTextContent('null');
  });

  test('full card shows an ellipsis for a missing task id, never undefine', async () => {
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        compact={false}
        assignmentsOverride={[{ runnerId: 'local-alpha', stageId: 'build' }]}
        registryOverride={[{ runnerId: 'local-alpha' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-local-alpha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-task-local-alpha')).toHaveTextContent(/^…$/);
  });

  test('an unusable poll interval falls back to the default cadence, never a busy loop', async () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<PerRunnerTasksWidget tasks={[]} pollMs={0} />);
      // Advance inside act so each poll's state update lands within act.
      // Initial load plus default-cadence ticks only.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(11_000);
      });
      unmount();
      expect(getRunnerMonitor.mock.calls.length).toBe(3);
      expect(getRunners.mock.calls.length).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test('full card hides the model pill for CI stages with no serving model', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-ci',
          projectId: 'p1',
          taskId: 'cccc5555-6666',
          executionId: 'exec-c2',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'test',
          prompt: null,
          serving: { harness: 'pi', model: null },
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    render(<PerRunnerTasksWidget tasks={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-local-ci')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-card-local-ci')).not.toHaveTextContent('Model:');
  });
});
