import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PerRunnerTasksWidget, formatRunnerElapsed, runnerFreshness } from './PerRunnerTasksWidget';

const getRunners = vi.hoisted(() => vi.fn());
const getRunnerMonitor = vi.hoisted(() => vi.fn());

vi.mock('../../../services/api', () => ({
  api: { getRunners, getRunnerMonitor },
}));

import '@testing-library/jest-dom';

describe('formatRunnerElapsed', () => {
  test('formats mm:ss and never invents a time', () => {
    expect(formatRunnerElapsed('2026-10-27T12:00:00.000Z', Date.parse('2026-10-27T12:01:30.000Z'))).toBe(
      '01:30',
    );
    expect(formatRunnerElapsed(null, Date.now())).toBe('—');
    expect(formatRunnerElapsed('not-a-date', Date.now())).toBe('—');
  });
});

describe('runnerFreshness', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  test('live within a minute, stale after, unknown without heartbeat', () => {
    expect(runnerFreshness(new Date(now - 10_000).toISOString(), now)).toBe('live');
    expect(runnerFreshness(new Date(now - 120_000).toISOString(), now)).toBe('stale');
    expect(runnerFreshness(null, now)).toBe('unknown');
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

  test('two assignments for one Runner render one BUSY slot plus a converging warning', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'aaaaaaaa-0000',
          executionId: 'exec-1',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'build',
          prompt: null,
          lastSeenAt: new Date().toISOString(),
        },
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'bbbbbbbb-1111',
          executionId: 'exec-2',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'test',
          prompt: null,
          lastSeenAt: new Date().toISOString(),
        },
      ],
      runnerLoad: [
        { runnerId: 'local-alpha', liveHoldCount: 2, currentTaskId: 'aaaaaaaa-0000' },
      ],
    });
    getRunners.mockResolvedValue([{ runnerId: 'local-alpha', status: 'active' }]);
    render(<PerRunnerTasksWidget tasks={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-local-alpha')).toBeInTheDocument();
    });
    // Exactly one current-task slot…
    expect(screen.getAllByTestId('per-runner-card-local-alpha')).toHaveLength(1);
    expect(screen.getByTestId('per-runner-task-local-alpha')).toHaveTextContent('aaaaaaaa');
    expect(screen.getByTestId('per-runner-state-local-alpha')).toHaveTextContent(/busy/i);
    // …and the extra hold is flagged, never rendered as a second live card.
    expect(screen.getByTestId('per-runner-extras-local-alpha')).toHaveTextContent(
      /fence converging/,
    );
    expect(screen.queryByTestId('per-runner-card-local-alpha-2')).not.toBeInTheDocument();
  });

  test('compact rows group by Runner too: one row, one BUSY pill, extras flagged', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'aaaaaaaa-0000',
          executionId: 'exec-1',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'build',
          lastSeenAt: new Date().toISOString(),
        },
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'bbbbbbbb-1111',
          executionId: 'exec-2',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'test',
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    render(<PerRunnerTasksWidget tasks={[]} compact />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-row-local-alpha')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('per-runner-row-local-alpha')).toHaveLength(1);
    expect(screen.getByTestId('per-runner-state-local-alpha')).toHaveTextContent(/busy/i);
    expect(screen.getByTestId('per-runner-extras-local-alpha')).toBeInTheDocument();
  });

  test('busy card shows the memory posture and warns when free memory is low', async () => {
    getRunnerMonitor.mockResolvedValue({
      liveAssignments: [
        {
          runnerId: 'local-alpha',
          projectId: 'p1',
          taskId: 'aaaaaaaa-0000',
          executionId: 'exec-1',
          epoch: 1,
          startedAt: new Date().toISOString(),
          stageId: 'build',
          prompt: null,
          lastSeenAt: new Date().toISOString(),
        },
      ],
    });
    getRunners.mockResolvedValue([
      { runnerId: 'local-alpha', status: 'active', facts: { memoryFreeMb: 128 } },
    ]);
    render(<PerRunnerTasksWidget tasks={[]} />);
    await waitFor(() => {
      expect(screen.getByTestId('per-runner-card-local-alpha')).toBeInTheDocument();
    });
    expect(screen.getByTestId('per-runner-memory-local-alpha')).toHaveTextContent(/128 MB free/);
    expect(screen.getByTestId('per-runner-memory-local-alpha')).toHaveTextContent(/low/);
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
