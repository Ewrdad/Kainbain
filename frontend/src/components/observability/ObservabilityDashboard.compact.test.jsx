import React from 'react';
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { ObservabilityDashboard } from './ObservabilityDashboard';
import { api } from '../../services/api';
import { setNarrowViewportOverride } from './monitorCompact';
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.sessionStorage.clear();
  setNarrowViewportOverride(null);
});

afterEach(() => {
  setNarrowViewportOverride(null);
  window.sessionStorage.clear();
});

test('desktop default renders the full cockpit, not the compact view', async () => {
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
    processLogs: [{ id: '1', timestamp: 't', tag: '[AGENT]', text: 'hello' }],
  });
  await act(async () => {});

  expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
  expect(screen.queryByTestId('mobile-monitor-view')).not.toBeInTheDocument();
  expect(screen.getByTestId('widget-kpis')).toBeInTheDocument();
  expect(screen.getByTestId('live-log-console')).toBeInTheDocument();
});

test('explicit compact request renders slim header plus logs only', async () => {
  window.sessionStorage.setItem('kainbain:observability:compact', '1');
  const setView = vi.fn();
  renderWithKainBain(<ObservabilityDashboard setView={setView} />, {
    setView,
    view: 'observability',
    engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
    processLogs: [{ id: '1', timestamp: 't', tag: '[AGENT]', text: 'hello compact' }],
  });
  await act(async () => {});

  expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument();
  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('ACTIVE: Build');
  expect(screen.getByText('hello compact')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-queue')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-activeTask')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-health')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-outcomes')).not.toBeInTheDocument();

  // Leaving clears the one-off request and navigates home.
  fireEvent.click(screen.getByRole('button', { name: 'Back to orchestrator' }));
  expect(setView).toHaveBeenCalledWith('orchestrator');
  expect(window.sessionStorage.getItem('kainbain:observability:compact')).toBeNull();
});

test('compact header shows the active task title, not the stage twice', async () => {
  window.sessionStorage.setItem('kainbain:observability:compact', '1');
  api.observabilityStatus.mockResolvedValueOnce({
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
      activeTask: { id: 't1', title: 'Wire up the deploy pipeline' },
      recentCompleted: [],
      recentFailed: [],
    },
  });
  renderWithKainBain(<ObservabilityDashboard />, {
    view: 'observability',
    engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
    processLogs: [{ id: '1', timestamp: 't', tag: '[AGENT]', text: 'hello compact' }],
  });
  await act(async () => {});

  expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument();
  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('ACTIVE: Build');
  const headerText = screen.getByTestId('mobile-active-stage');
  expect(headerText).toHaveTextContent('Wire up the deploy pipeline');
  expect(headerText).not.toHaveTextContent('Build');
});

test('narrow viewport renders the compact view automatically', async () => {
  setNarrowViewportOverride(true);
  renderWithKainBain(<ObservabilityDashboard />, {
    engineState: { status: 'idle' },
    processLogs: [],
  });
  await act(async () => {});

  expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument();
  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
});

test('compact header renders the active run model details, not task counts', async () => {
  window.sessionStorage.setItem('kainbain:observability:compact', '1');
  api.observabilityStatus.mockResolvedValueOnce({
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
      activeTask: {
        id: 't1',
        title: 'Wire up the deploy pipeline',
        stageType: 'agent',
        harness: 'pi',
        model: 'pi::ollama-cloud::gemma4:31b-cloud',
      },
      recentCompleted: [],
      recentFailed: [],
    },
  });
  renderWithKainBain(<ObservabilityDashboard />, {
    view: 'observability',
    engineState: { status: 'running', activeTaskId: 't1', activeStageName: 'Build' },
    processLogs: [{ id: '1', timestamp: 't', tag: '[AGENT]', text: 'hello compact' }],
  });
  await act(async () => {});

  expect(screen.getByTestId('mobile-monitor-view')).toBeInTheDocument();
  expect(screen.queryByTestId('mobile-monitor-counts')).not.toBeInTheDocument();
  const details = screen.getByTestId('mobile-monitor-model-details');
  expect(details).toHaveTextContent(/Harness:/);
  expect(details).toHaveTextContent('pi');
  expect(details).toHaveTextContent(/Model:/);
  expect(details).toHaveTextContent('gemma4:31b-cloud');
});
