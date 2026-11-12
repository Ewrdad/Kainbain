import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import {
  PerRunnerTasksWidget,
  formatRunnerElapsed,
  formatShortRunnerTaskId,
  resolveAssignmentStageName,
  resolveAssignmentTask,
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

  test('assignments with a non-text runnerId read as idle, never a crashed row', async () => {
    // An object id would crash the row that renders it (React cannot render
    // an object child), so malformed assignments are ignored on both the
    // override path and the polled path.
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        compact
        assignmentsOverride={[{ runnerId: { id: 'r1' } }, { runnerId: true }]}
        registryOverride={[]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
    });
  });

  test('polled assignments with a non-text runnerId read as idle', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [{ runnerId: { id: 'r1' }, taskId: 't1' }],
    });
    render(<PerRunnerTasksWidget tasks={[]} compact />);
    await waitFor(() => {
      expect(getRunnerMonitor).toHaveBeenCalled();
    });
    expect(screen.getByText(/Fleet idle/)).toBeInTheDocument();
  });

  test('a numeric runnerId renders its row without crashing', async () => {
    // The text-or-numeric gate accepts numeric ids end to end: the row
    // renders under its numeric hook id instead of falling back to idle.
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[{ id: 'build', name: 'Build' }]}
        compact
        assignmentsOverride={[{ runnerId: 7, taskId: 't1', stageId: 'build' }]}
        registryOverride={[{ runnerId: 7 }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-7')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-row-7')).toHaveTextContent('Build');
  });

  test('object-typed serving and epoch fields render without crashing', async () => {
    // Serving data crosses the fleet API boundary untyped: a malformed
    // object renders as text instead of crashing the row or the card.
    const assignment = {
      runnerId: 'local-alpha',
      taskId: 't1',
      stageId: 'build',
      epoch: { n: 1 },
      serving: { harness: { id: 'pi' }, model: ['m'] },
      startedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    const { unmount } = render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[{ id: 'build', name: 'Build' }]}
        compact
        assignmentsOverride={[assignment]}
        registryOverride={[{ runnerId: 'local-alpha' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('per-runner-compact-harness-local-alpha'),
    ).toBeInTheDocument();
    unmount();

    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[{ id: 'build', name: 'Build' }]}
        compact={false}
        assignmentsOverride={[assignment]}
        registryOverride={[{ runnerId: 'local-alpha' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-local-alpha')).toBeInTheDocument();
    });
  });

  test('a cross-pipeline assignment renders its own title and stage with no local tasks or stages', async () => {
    // Regression guard for the multi-pipeline issue: the operator views
    // pipeline A (empty local tasks/stages) while the Runner works on B.
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[]}
        compact={false}
        assignmentsOverride={[
          {
            runnerId: 'remote-1',
            projectId: 'project-b',
            projectName: 'Project B',
            taskId: 'task-b-1',
            taskTitle: 'Fix login on B',
            taskGoal: 'Repair the login flow',
            executionId: 'exec-b-1',
            epoch: 1,
            startedAt: new Date().toISOString(),
            stageId: 'verify',
            stageName: 'Verify',
            lastSeenAt: new Date().toISOString(),
          },
        ]}
        registryOverride={[{ runnerId: 'remote-1' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-remote-1')).toBeInTheDocument();
    });
    const card = screen.getByTestId('per-runner-card-remote-1');
    expect(card).toHaveTextContent('Fix login on B');
    expect(card).toHaveTextContent('Verify');
    expect(card).not.toHaveTextContent('Task details unavailable');
    expect(screen.getByTestId('per-runner-project-remote-1')).toHaveTextContent('Project B');
  });

  test('a cross-pipeline compact row names the foreign stage without local stages', async () => {
    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[]}
        compact
        assignmentsOverride={[
          {
            runnerId: 'remote-2',
            projectId: 'project-b',
            taskId: 'task-b-2',
            taskTitle: 'Other job',
            stageId: 'verify',
            stageName: 'Verify',
            startedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
        ]}
        registryOverride={[{ runnerId: 'remote-2' }]}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-remote-2')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-row-remote-2')).toHaveTextContent('Verify');
  });

  test('clicking the open-task affordance calls onOpenTask with the assignment', async () => {
    const onOpenTask = vi.fn();
    const assignment = {
      runnerId: 'remote-3',
      projectId: 'project-b',
      projectName: 'Project B',
      taskId: 'task-b-3',
      taskTitle: 'Foreign job',
      stageId: 'build',
      stageName: 'Build',
      startedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };
    const { unmount } = render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[]}
        compact={false}
        assignmentsOverride={[assignment]}
        registryOverride={[{ runnerId: 'remote-3' }]}
        onOpenTask={onOpenTask}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-open-remote-3')).toBeInTheDocument();
    });
    screen.getByTestId('per-runner-open-remote-3').click();
    expect(onOpenTask).toHaveBeenCalledTimes(1);
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ runnerId: 'remote-3', taskId: 'task-b-3' }));
    unmount();

    render(
      <PerRunnerTasksWidget
        tasks={[]}
        stages={[]}
        compact
        assignmentsOverride={[assignment]}
        registryOverride={[{ runnerId: 'remote-3' }]}
        onOpenTask={onOpenTask}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-open-remote-3')).toBeInTheDocument();
    });
    screen.getByTestId('per-runner-open-remote-3').click();
    expect(onOpenTask).toHaveBeenCalledTimes(2);
  });

  test('a rejected cross-pipeline hydrate leaves title and stage intact without crashing', async () => {
    api.getTask = vi.fn().mockRejectedValue(new Error('task gone'));
    try {
      render(
        <PerRunnerTasksWidget
          tasks={[]}
          stages={[]}
          compact={false}
          assignmentsOverride={[
            {
              runnerId: 'remote-4',
              projectId: 'project-b',
              taskId: 'task-b-4',
              taskTitle: 'Foreign job',
              stageId: 'build',
              stageName: 'Build',
              startedAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            },
          ]}
          registryOverride={[{ runnerId: 'remote-4' }]}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('per-runner-card-remote-4')).toBeInTheDocument();
      });
      const card = screen.getByTestId('per-runner-card-remote-4');
      expect(card).toHaveTextContent('Foreign job');
      expect(card).toHaveTextContent('Build');
      await waitFor(() => {
        expect(api.getTask).toHaveBeenCalledWith('project-b', 'task-b-4');
      });
      // One attempt only: the failed hydrate never retries in a loop.
      await new Promise((r) => setTimeout(r, 50));
      expect(api.getTask).toHaveBeenCalledTimes(1);
    } finally {
      delete api.getTask;
    }
  });

  test('a resolved cross-pipeline hydrate fills the log tail', async () => {
    api.getTask = vi.fn().mockResolvedValue({
      id: 'task-b-5',
      title: 'Foreign job',
      logEntries: [{ id: 'l1', text: '[runner remote-5] hello', meta: { runnerId: 'remote-5' } }],
    });
    try {
      render(
        <PerRunnerTasksWidget
          tasks={[]}
          stages={[]}
          compact={false}
          assignmentsOverride={[
            {
              runnerId: 'remote-5',
              projectId: 'project-b',
              taskId: 'task-b-5',
              taskTitle: 'Foreign job',
              stageId: 'build',
              stageName: 'Build',
              startedAt: new Date().toISOString(),
              lastSeenAt: new Date().toISOString(),
            },
          ]}
          registryOverride={[{ runnerId: 'remote-5' }]}
        />,
      );
      await waitFor(() => {
        expect(screen.getByTestId('per-runner-tail-remote-5')).toBeInTheDocument();
      });
      expect(screen.getByTestId('per-runner-tail-remote-5')).toHaveTextContent('hello');
    } finally {
      delete api.getTask;
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

describe('resolveAssignmentTask', () => {
  test('prefers the matching local task so the log tail stays available', () => {
    const local = { id: 't1', projectId: 'p1', title: 'Local', logEntries: [] };
    expect(
      resolveAssignmentTask({ taskId: 't1', projectId: 'p1', taskTitle: 'Remote' }, local),
    ).toBe(local);
  });

  test('rejects a local task from another pipeline and falls back to the assignment identity', () => {
    const local = { id: 't1', projectId: 'p-other', title: 'Wrong pipe' };
    const resolved = resolveAssignmentTask(
      { taskId: 't1', projectId: 'p1', taskTitle: 'Right pipe', taskGoal: 'g' },
      local,
    );
    expect(resolved).toMatchObject({ id: 't1', projectId: 'p1', title: 'Right pipe' });
  });

  test('builds a lightweight task from assignment identity when local is missing', () => {
    expect(
      resolveAssignmentTask({ taskId: 't1', projectId: 'p1', taskTitle: 'Remote job' }, null),
    ).toMatchObject({ id: 't1', title: 'Remote job' });
  });

  test('returns null when nothing names the task, preserving the honest empty state', () => {
    expect(resolveAssignmentTask({ taskId: 't1', projectId: 'p1' }, null)).toBeNull();
    expect(resolveAssignmentTask({ projectId: 'p1' }, null)).toBeNull();
    expect(resolveAssignmentTask(null, null)).toBeNull();
  });
});

describe('resolveAssignmentStageName', () => {
  test('prefers the view stages, then the assignment stageName, then the raw id', () => {
    const stages = [{ id: 'build', name: 'Local Build' }];
    expect(
      resolveAssignmentStageName({ stageId: 'build', stageName: 'Remote Build' }, stages),
    ).toBe('Local Build');
    expect(resolveAssignmentStageName({ stageId: 'verify', stageName: 'Verify' }, stages)).toBe(
      'Verify',
    );
    expect(resolveAssignmentStageName({ stageId: 'verify' }, stages)).toBe('verify');
  });

  test('a missing stage id renders as an ellipsis, never undefined', () => {
    expect(resolveAssignmentStageName({ stageId: null }, [])).toBe('…');
    expect(resolveAssignmentStageName({}, [])).toBe('…');
  });
});
