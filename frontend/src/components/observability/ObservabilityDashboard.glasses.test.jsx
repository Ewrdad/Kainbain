import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ObservabilityDashboard } from './ObservabilityDashboard';
import { api } from '../../services/api';
import { setNarrowViewportOverride } from './monitorCompact';
import { setGlassesViewportOverride } from '../util/viewport';
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
        engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
        queue: [],
        activeTask: null,
        recentCompleted: [],
        recentFailed: [],
      },
    }),
  },
}));

/***
 * MARK: ObservabilityDashboard glasses tests
 * @description Guards the Meta Ray-Ban branch of the monitor: a
 *   glasses-shaped viewport renders the glasses task summary instead of
 *   the cockpit or the phone console, the View button routes to quick
 *   review, and every other viewport renders exactly as before.
 ***/

const stages = [
  { id: 'plan', name: 'Plan' },
  { id: 'build', name: 'Build' },
];

const tasks = [
  { id: 't1', title: 'Fix the auth race', status: 'running_agent', currentStageId: 'build' },
  { id: 't2', title: 'Polish landing copy', status: 'waiting_human', currentStageId: 'plan' },
];

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.sessionStorage.clear();
  setNarrowViewportOverride(null);
  setGlassesViewportOverride(null);
});

afterEach(() => {
  setNarrowViewportOverride(null);
  setGlassesViewportOverride(null);
  window.sessionStorage.clear();
});

function renderMonitor(overrides = {}) {
  const setView = overrides.setView || vi.fn();
  renderWithKainBain(<ObservabilityDashboard />, {
    setView,
    view: 'observability',
    tasks,
    stages,
    activeProjectId: 'proj-1',
    refreshTasks: vi.fn(),
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
    processLogs: [],
    ...overrides,
    setView,
  });
  return { setView };
}

test('glasses viewport renders the glasses summary, not cockpit or console', async () => {
  setGlassesViewportOverride(true);
  renderMonitor();
  await act(async () => {});

  expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
  expect(screen.getByTestId('glasses-task-list')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
  expect(screen.queryByTestId('mobile-monitor-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('glasses-running-name')).toHaveTextContent('Fix the auth race');
  expect(screen.getByTestId('glasses-count-waiting')).toHaveTextContent('1');
});

test('glasses mode wins over the phone compact view', async () => {
  setNarrowViewportOverride(true);
  setGlassesViewportOverride(true);
  renderMonitor();
  await act(async () => {});

  expect(screen.getByTestId('glasses-task-list')).toBeInTheDocument();
  expect(screen.queryByTestId('mobile-monitor-view')).not.toBeInTheDocument();
});

test('non-glasses viewport renders exactly as before (parity)', async () => {
  setGlassesViewportOverride(false);
  renderMonitor();
  await act(async () => {});

  expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
  expect(screen.queryByTestId('glasses-task-list')).not.toBeInTheDocument();
  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('live-log-console')).toBeInTheDocument();
});

test('phone-narrow viewport still renders the mobile console, not glasses', async () => {
  setNarrowViewportOverride(true);
  setGlassesViewportOverride(false);
  renderMonitor();
  await act(async () => {});

  expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument();
  expect(screen.queryByTestId('glasses-task-list')).not.toBeInTheDocument();
});

test('glasses View routes to quick review for the review-ready task', async () => {
  setGlassesViewportOverride(true);
  const { setView } = renderMonitor();
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: 'View Polish landing copy for review' }));
  expect(setView).toHaveBeenCalledWith('task-review', { taskId: 't2' });
});

test('glasses Refresh refetches the active project tasks', async () => {
  setGlassesViewportOverride(true);
  const refreshTasks = vi.fn();
  renderMonitor({ refreshTasks });
  await act(async () => {});

  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(refreshTasks).toHaveBeenCalledWith('proj-1');
});
