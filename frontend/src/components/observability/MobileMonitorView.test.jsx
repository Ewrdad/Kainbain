import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { MobileMonitorView } from './MobileMonitorView';
import '@testing-library/jest-dom';

beforeEach(() => {
  vi.clearAllMocks();
});

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

test('slim header shows engine pill, active task, and model details instead of task counts', () => {
  renderWithKainBain(<MobileMonitorView {...baseProps} onExit={() => {}} />);

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

test('engine pill names the active task stage over a stranded engine stage', () => {
  renderWithKainBain(
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

test('legacy stats and queueCount props are ignored without crashing', () => {
  renderWithKainBain(
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
  (stageType) => {
    renderWithKainBain(
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

test("harness-managed stage (modelSelection 'none') hides only the model pill", () => {
  renderWithKainBain(
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

test('provider and source render when the active task reports them', () => {
  renderWithKainBain(
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

test('idle view shows the no-active-model fallback instead of blanking', () => {
  renderWithKainBain(<MobileMonitorView engineState={{}} stats={{}} onExit={() => {}} />);

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('No active stage');
  expect(screen.getByTestId('mobile-monitor-model-details')).toHaveTextContent(
    'Idle — no active model',
  );
  expect(screen.queryByTestId('mobile-monitor-counts')).not.toBeInTheDocument();
});

test('long model names truncate with a full-ref tooltip', () => {
  const longModel =
    'pi::ollama-cloud::an-extremely-long-model-identifier-that-must-not-overflow-a-360px-viewport';
  renderWithKainBain(
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

  const details = screen.getByTestId('mobile-monitor-model-details');
  const modelBadge = details.querySelector('[title]');
  expect(modelBadge).not.toBeNull();
  expect(modelBadge).toHaveAttribute('title', longModel);
  expect(modelBadge).toHaveClass('truncate');
  expect(details.className).toMatch(/flex-wrap/);
});

test('renders only the log console: no other dashboard widgets', () => {
  renderWithKainBain(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  expect(screen.getByTestId('live-log-console')).toBeInTheDocument();
  expect(screen.queryByTestId('widget-kpis')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-queue')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-activeTask')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-health')).not.toBeInTheDocument();
  expect(screen.queryByTestId('widget-outcomes')).not.toBeInTheDocument();
});

test('idle engine shows IDLE pill and logs empty-state without crashing', () => {
  renderWithKainBain(<MobileMonitorView engineState={{}} stats={{}} onExit={() => {}} />);

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent('IDLE');
  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('No active stage');
  expect(screen.getByText(/Waiting for process logs stream/i)).toBeInTheDocument();
});

test('filter chips and Clear still operate in the compact view', () => {
  const onClearLogs = vi.fn();
  renderWithKainBain(
    <MobileMonitorView {...baseProps} onClearLogs={onClearLogs} onExit={() => {}} />,
  );

  // Filters are collapsed by default: reveal them first.
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  // Multi-select lanes: toggling Errors off hides the error line only.
  fireEvent.click(screen.getByRole('button', { name: 'Errors' }));
  expect(screen.queryByText('Connection timed out')).not.toBeInTheDocument();
  expect(screen.getByText('Agent reasoning started')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
  expect(onClearLogs).toHaveBeenCalledTimes(1);
});

test('Back exits the monitor', () => {
  const onExit = vi.fn();
  renderWithKainBain(<MobileMonitorView {...baseProps} onExit={onExit} />);

  fireEvent.click(screen.getByRole('button', { name: 'Back to orchestrator' }));
  expect(onExit).toHaveBeenCalledTimes(1);
});

test('header falls back to the goal first line when the task has no title', () => {
  renderWithKainBain(
    <MobileMonitorView
      {...baseProps}
      activeTask={{ id: 't2', goal: '# Ship the widget\nSecond line' }}
      onExit={() => {}}
    />,
  );

  expect(screen.getByTestId('mobile-active-stage')).toHaveTextContent('Ship the widget');
});

test('running without a resolved task shows a no-task label, not the stage twice', () => {
  renderWithKainBain(
    <MobileMonitorView {...baseProps} activeTask={null} onExit={() => {}} />,
  );

  expect(screen.getByTestId('mobile-engine-state')).toHaveTextContent(
    /ACTIVE: Code Generation/i,
  );
  const headerText = screen.getByTestId('mobile-active-stage');
  expect(headerText).toHaveTextContent('No active task');
  expect(headerText).not.toHaveTextContent('Code Generation');
});

test('long task titles truncate with a full-text tooltip', () => {
  const longTitle = 'Implement the extremely long task title that must not overflow a 360px viewport';
  renderWithKainBain(
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

test('stage name appears exactly once in the header row while running', () => {
  renderWithKainBain(<MobileMonitorView {...baseProps} onExit={() => {}} />);

  const header = screen.getByTestId('mobile-monitor-view').querySelector('header');
  const occurrences = (header.textContent.match(/Code Generation/g) || []).length;
  expect(occurrences).toBe(1);
});

test('console wrappers keep min-w-0 so wide log rows cannot push the page sideways', () => {
  renderWithKainBain(<MobileMonitorView {...baseProps} onExit={() => {}} />);

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
