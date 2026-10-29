// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { NowPlayingBar, resolveRunnerBoxes, runnerBoxHealth } from './NowPlayingBar';
import { KainBainContext } from '../../context/KainBainContext';
import React from 'react';
import '@testing-library/jest-dom';

// The bar polls GET /runners/monitor for live assignments when the context
// carries no `runnerAssignments` override. Pin that poll to empty here so
// tests never depend on a real backend (a live fleet would otherwise flip
// the legacy-display assertions to runner boxes mid-suite).
vi.mock('../../services/api', () => ({
  api: { getRunnerMonitor: vi.fn(async () => ({ liveAssignments: [] })) },
}));

/***
 * MARK: NowPlayingBar tests
 * @description Verifies the Now Playing bar: current task display, the
 * always-on runner boxes (fleet roster with per-runner play/pause + skip,
 * idle boxes included), global engine status badge
 * (IDLE, RUNNING, CHECKPOINT, PAUSED), the honest elapsed stage timer, the
 * live queue-depth chip, and the absence of any fabricated percentage bar,
 * stale stage-position label, or global transport cluster.
 ***/
const stages = [
  { id: '1', name: 'Idea', type: 'agent' },
  { id: '2', name: 'Review', type: 'human' },
  { id: '3', name: 'In Progress', type: 'agent' },
];

test('renders elapsed timer and live queue chip with no stale stage label (no fake progress bar)', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '2',
    workflows: [],
    tasks: [
      { id: 't1', currentStageId: '2', status: 'in_stage' },
      { id: 't2', currentStageId: '1', status: 'in_stage' },
      { id: 't3', currentStageId: '1', status: 'completed' },
    ],
    isAgentRunning: false,
  });
  // The stale workflow-pointer stage label ("Stage 1 of 10 — Idea") is gone
  // for good: it was derived from currentStageId, which the workflow only sets
  // on initial fetch or manual skip, so it never updated. Guard against its
  // return even though stages are loaded and a stage is focused.
  expect(screen.queryByText(/Stage \d+ of \d+/)).not.toBeInTheDocument();
  expect(screen.queryByText(/— Idea/)).not.toBeInTheDocument();
  // Honest indicator #1: the live elapsed timer is present and starts at zero.
  expect(screen.getByLabelText('Elapsed time in current stage')).toHaveTextContent('00:00:00');
  // Honest indicator #2: the live queue-depth chip counts open tasks only —
  // t1 and t2 are open, t3 is completed and excluded.
  expect(
    screen.getByRole('status', {
      name: 'Execution queue: 2 open tasks across all pipelines',
    }),
  ).toHaveTextContent('2');
  // Honest indicator #3: no fabricated percentage bar. The stack has no
  // percent-complete data, so a percentage would be stage position masquerading
  // as progress — guard against it ever coming back.
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
});

test('queue chip is live: count updates as tasks advance and drops to zero when all complete', () => {
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    workflows: [],
    tasks: [
      { id: 't1', currentStageId: '1', status: 'in_stage' },
      { id: 't2', currentStageId: '1', status: 'in_stage' },
      { id: 't3', currentStageId: '2', status: 'in_stage' },
    ],
  });
  const chip = () =>
    screen.getByRole('status', {
      name: /Execution queue: \d+ open tasks? across all pipelines/,
    });
  expect(chip()).toHaveTextContent('3');
  expect(chip()).toHaveAttribute('aria-label', 'Execution queue: 3 open tasks across all pipelines');

  // Two tasks complete — the count tracks the live task list.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        workflows: [],
        tasks: [
          { id: 't1', currentStageId: '1', status: 'completed' },
          { id: 't2', currentStageId: '1', status: 'in_stage' },
          { id: 't3', currentStageId: '2', status: 'done' },
        ],
      }}
    />,
  );
  expect(chip()).toHaveAttribute('aria-label', 'Execution queue: 1 open task across all pipelines');

  // Everything finished — the chip honestly shows zero (never hidden data).
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        workflows: [],
        tasks: [{ id: 't1', currentStageId: '1', status: 'completed' }],
      }}
    />,
  );
  expect(chip()).toHaveAttribute('aria-label', 'Execution queue: 0 open tasks across all pipelines');
  expect(chip()).toHaveTextContent('0');
});

test('elapsed timer ticks while the engine runs and resets when the active task changes (D2)', () => {
  vi.useFakeTimers();
  try {
    const { rerender } = renderWithKainBain(<NowPlayingBar />, {
      stages,
      currentStageId: '1',
      isAgentRunning: true,
      engineState: { status: 'running', activeTaskId: 'task-1' },
    });
    const timer = screen.getByLabelText('Elapsed time in current stage');

    // Ticks once per second while running.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(timer).toHaveTextContent('00:00:03');

    // Establish the overlay as the tree root so the following context change
    // swaps the active task WITHOUT remounting the bar (instance state kept).
    rerender(
      <NowPlayingBarContextOverlay
        value={{
          stages,
          currentStageId: '1',
          isAgentRunning: true,
          engineState: { status: 'running', activeTaskId: 'task-1' },
        }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByLabelText('Elapsed time in current stage')).toHaveTextContent('00:00:02');

    // A new active task resets the timer so it never leaks across task boundaries.
    rerender(
      <NowPlayingBarContextOverlay
        value={{
          stages,
          currentStageId: '1',
          isAgentRunning: true,
          engineState: { status: 'running', activeTaskId: 'task-2' },
        }}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Elapsed time in current stage')).toHaveTextContent('00:00:00');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByLabelText('Elapsed time in current stage')).toHaveTextContent('00:00:01');
  } finally {
    vi.useRealTimers();
  }
});

test('no global transport cluster remains: play/skip live on the runner boxes', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1' },
    tasks: [{ id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build' }],
    runnerAssignments: [
      { runnerId: 'runner-a', taskId: 't1', stageId: '1', lastSeenAt: new Date().toISOString() },
    ],
  });

  // The old center cluster is gone for good.
  expect(screen.queryByLabelText('Look Back')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Look Forward')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Jump to Active')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Skip Current')).not.toBeInTheDocument();
  expect(screen.queryByTitle('Start engine')).not.toBeInTheDocument();
  expect(screen.queryByTitle(/Pause engine|Stop engine/)).not.toBeInTheDocument();
  expect(screen.queryByTestId('main-play-btn')).not.toBeInTheDocument();
  // Per-runner transport replaces it.
  expect(screen.getByLabelText('Pause runner runner-a')).toBeInTheDocument();
  expect(screen.getByLabelText('Skip current task for runner runner-a')).toBeInTheDocument();
});

/***
 * MARK: per-runner transport (replaces the removed global cluster)
 * @description Play/pause and skip live on each runner box now: pause parks
 * the Runner, resume re-arms it, skip advances its held task one stage.
 * Skip is parked while the Runner holds nothing.
 ***/
test('per-runner play/pause calls the matching runner control', () => {
  const pauseRunner = vi.fn();
  const resumeRunner = vi.fn();
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [{ id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build' }],
    runnerAssignments: [
      { runnerId: 'runner-a', taskId: 't1', stageId: '1', lastSeenAt: new Date().toISOString() },
    ],
    pauseRunner,
    resumeRunner,
  });

  fireEvent.click(screen.getByLabelText('Pause runner runner-a'));
  expect(pauseRunner).toHaveBeenCalledWith('runner-a');
  expect(resumeRunner).not.toHaveBeenCalled();

  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        tasks: [{ id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build' }],
        runnerAssignments: [
          {
            runnerId: 'runner-a',
            taskId: 't1',
            stageId: '1',
            lastSeenAt: new Date().toISOString(),
            paused: true,
          },
        ],
        pauseRunner,
        resumeRunner,
      }}
    />,
  );
  fireEvent.click(screen.getByLabelText('Resume runner runner-a'));
  expect(resumeRunner).toHaveBeenCalledWith('runner-a');
});

test('per-runner skip advances that runner only, and is disabled while idle', () => {
  const skipRunner = vi.fn();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [{ id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build' }],
    runners: [
      { runnerId: 'runner-a', status: 'active', paused: false },
      { runnerId: 'runner-b', status: 'active', paused: false },
    ],
    runnerAssignments: [
      { runnerId: 'runner-a', taskId: 't1', stageId: '1', lastSeenAt: new Date().toISOString() },
    ],
    skipRunner,
  });

  const skipBusy = screen.getByLabelText('Skip current task for runner runner-a');
  expect(skipBusy).not.toBeDisabled();
  fireEvent.click(skipBusy);
  expect(skipRunner).toHaveBeenCalledWith('runner-a');

  // runner-b holds nothing: its skip is parked, its pause still works.
  expect(screen.getByLabelText('Skip current task for runner runner-b')).toBeDisabled();
  expect(screen.getByLabelText('Pause runner runner-b')).not.toBeDisabled();
});

test('renders dynamic status badges correctly (IDLE, RUNNING, CHECKPOINT, WAITING_HUMAN, PAUSED)', () => {
  // 1. IDLE - even when computeRunning is true, if idle it should display IDLE (#14)
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: false,
    computeRunning: true,
    engineState: { status: 'idle' },
  });
  expect(screen.getByText('IDLE')).toBeInTheDocument();

  // 2. RUNNING - when engineState is running or agent is running
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        isAgentRunning: true,
        computeRunning: true,
        engineState: { status: 'running' },
      }}
    />,
  );
  expect(screen.getByText('RUNNING')).toBeInTheDocument();

  // WCAG 1.4.3 contract for the status badge text (see component JSDoc):
  // the badge text must never oscillate its opacity (animate-pulse drops the
  // text contrast below the 4.5:1 AA threshold mid-animation — axe flagged
  // exactly that on the RUNNING badge), and each state's text colour must
  // carry the high-contrast theme token, not the dimmer accent tint.
  const runningBadge = screen.getByLabelText('Engine status is RUNNING');
  expect(runningBadge.className).not.toContain('animate-pulse');
  expect(runningBadge.className).toContain('text-primary-fixed');

  // 3. CHECKPOINT / WAITING_HUMAN (#15)
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '2',
        isAgentRunning: false,
        engineState: { status: 'checkpoint' },
      }}
    />,
  );
  expect(screen.getByText('CHECKPOINT')).toBeInTheDocument();

  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '2',
        isAgentRunning: false,
        engineState: { status: 'waiting_human' },
      }}
    />,
  );
  expect(screen.getByText('WAITING_HUMAN')).toBeInTheDocument();
  const waitingBadge = screen.getByLabelText('Engine status is WAITING_HUMAN');
  expect(waitingBadge.className).toContain('text-secondary-fixed');
  expect(waitingBadge.className).not.toContain('animate-pulse');

  // 4. PAUSED
  const pausedStages = [
    { id: '1', name: 'Idea', type: 'agent', paused: true },
  ];
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages: pausedStages,
        currentStageId: '1',
        isAgentRunning: false,
        engineState: { status: 'paused' },
      }}
    />,
  );
  expect(screen.getByText('PAUSED')).toBeInTheDocument();
});

test('shows the active task title and active project name, and clicking title opens Task Inspector (#21)', () => {
  const setSelectedTask = vi.fn();
  // The provenance chip resolves from the universal owner's workflowId
  // (never the selected pipeline), so the task carries its pipeline here.
  const sampleTask = { id: 'task-1', workflowId: 'wf-1', goal: 'Fix the page', title: 'Fix the page' };

  renderWithKainBain(<NowPlayingBar />, {
    computeRunning: true,
    workflows: [
      {
        workflowId: 'wf-1',
        id: 'run-1',
        status: 'In Progress',
        startedAt: new Date().toISOString(),
        progress: 50,
      },
    ],
    tasks: [sampleTask],
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeProjectName: 'Alpha Project', activeTaskId: 'task-1' },
    projects: [{ id: 'proj-1', name: 'Alpha Project' }],
    activeProjectId: 'proj-1',
    setSelectedTask,
  });

  expect(screen.getByText(/Alpha Project/)).toBeInTheDocument();
  expect(screen.getByText(/wf-1/)).toBeInTheDocument();
  expect(screen.getByText(/Fix the page/)).toBeInTheDocument();

  // Click on active task card / title
  const taskButton = screen.getByRole('button', { name: /Open active task Fix the page in inspector/i });
  fireEvent.click(taskButton);
  expect(setSelectedTask).toHaveBeenCalledWith(sampleTask);
});

test('renders the health traffic light status on the now playing bar', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    healthState: {
      status: 'ok',
      checks: {
        litellm: { status: 'ok' },
        device: { status: 'ok' },
        ollamaCloud: { status: 'ok' },
      },
    },
  });

  expect(screen.getByRole('status', { name: /Subsystem Health/i })).toBeInTheDocument();
  expect(screen.getByTestId('traffic-dot-litellm')).toBeInTheDocument();
  expect(screen.getByTestId('traffic-dot-device')).toBeInTheDocument();
  expect(screen.getByTestId('traffic-dot-ollama')).toBeInTheDocument();
});

test('right-rail shrink contract: decorative extras hidden below xl, rail clips overflow', () => {
  // The health light and dividers are fixed-width nowrap content (~233px +
  // gaps). They must not re-enter the rail before `xl` (1280px): measured at
  // 1024px the rail's flex share is ~338px while chip + timer + health +
  // dividers + gaps need ~428px, and flex items with min-width:auto overflow
  // LEFTWARD over the center transport buttons instead of shrinking (the
  // exact regression the canary overlap gate caught when these were hidden
  // below `lg` only). overflow-hidden + min-w-0 on the rail box are the
  // second layer of the contract (clip, never paint over the controls).
  renderWithKainBain(<NowPlayingBar />, { stages, currentStageId: '1' });

  const rail = screen.getByTestId('now-playing-right-rail');
  expect(rail.className).toContain('min-w-0');
  expect(rail.className).toContain('overflow-hidden');

  for (const testId of ['now-playing-health-slot', 'rail-divider-elapsed', 'rail-divider-health']) {
    const el = screen.getByTestId(testId);
    expect(el.className).toContain('hidden');
    expect(el.className).toContain('xl:block');
    // lg (1024px) is exactly where the measured overlap re-appears — the
    // extras may never come back at that breakpoint.
    expect(el.className).not.toContain('lg:block');
  }
});

test('renders INTERRUPTED badge when active task was interrupted by shutdown', () => {
  const interruptedTask = {
    id: 't-interrupted',
    title: 'Process big file',
    status: 'interrupted',
    wasInterrupted: true,
  };

  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [interruptedTask],
    engineState: { status: 'idle', activeTaskId: 't-interrupted' },
  });

  expect(screen.getByText('INTERRUPTED')).toBeInTheDocument();
  expect(screen.getByText(/Process big file/)).toBeInTheDocument();
});

test('renders PAUSED badge when engine state is paused', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    engineState: { status: 'paused' },
  });

  expect(screen.getByText('PAUSED')).toBeInTheDocument();
});

/***
 * MARK: universal now-playing regression
 * @description The engine owns a single global queue fed by every pipeline,
 * so switching the selected pipeline must never change what Now Playing
 * names: same task title, same status badge, same queue depth. Provenance
 * (which pipeline the session came from) may show, but the selection itself
 * is view state only.
 ***/
test('Now Playing is universal: switching pipelines never changes the named task, badge, or queue depth', () => {
  const workflows = [
    { id: 'wf-a', name: 'Pipeline A' },
    { id: 'wf-b', name: 'Pipeline B' },
  ];
  const tasks = [
    { id: 't-a1', workflowId: 'wf-a', currentStageId: '1', status: 'in_stage', title: 'Alpha session', goal: 'Alpha session' },
    { id: 't-b1', workflowId: 'wf-b', currentStageId: '1', status: 'in_stage', title: 'Beta session', goal: 'Beta session' },
    { id: 't-b2', workflowId: 'wf-b', currentStageId: '2', status: 'in_stage', title: 'Beta follow-up', goal: 'Beta follow-up' },
  ];
  const engineState = { status: 'running', activeTaskId: 't-a1' };
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    workflows,
    activeWorkflowId: 'wf-a',
    tasks,
    engineState,
  });

  const namedBefore = screen.getByTestId('now-playing-task-name').textContent;
  expect(namedBefore).toMatch(/Alpha session/);
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  const queueBefore = screen
    .getByRole('status', { name: /Execution queue:/ })
    .getAttribute('aria-label');

  // Switch the selected pipeline to B — the board view changes, but the
  // single engine queue does not.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        isAgentRunning: true,
        workflows,
        activeWorkflowId: 'wf-b',
        tasks,
        engineState,
      }}
    />,
  );

  expect(screen.getByTestId('now-playing-task-name').textContent).toBe(namedBefore);
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(
    screen.getByRole('status', { name: /Execution queue:/ }).getAttribute('aria-label'),
  ).toBe(queueBefore);
});

/***
 * MARK: cross-project switch regression
 * @description The reported bug: switching projects changed the Now Playing
 * bar even though there is one pipeline. Reproduces the real switch —
 * fetchTasks REPLACES the list with the other project's tasks while the
 * engine snapshot (now carrying the project-independent owner snapshot +
 * global queue depth) is untouched — and pins the bar: same named task,
 * same badge, same timer, same queue depth, same transport state.
 ***/
test('project switch keeps the whole bar put: owner named, badge/timer/queue/transport unchanged', () => {
  const ownerA = {
    id: 't-a1',
    workflowId: 'wf-a',
    // Production shape: the engine snapshot carries the owning pipeline's
    // display name so the provenance chip survives the workflows-list swap.
    workflowName: 'Pipeline A',
    projectId: 'proj-a',
    currentStageId: '1',
    status: 'running_agent',
    title: 'Alpha session',
    goal: 'Alpha session',
    updatedAt: '2026-09-24T09:00:00.000Z',
  };
  const projectATasks = [
    ownerA,
    { id: 't-a2', workflowId: 'wf-a', projectId: 'proj-a', currentStageId: '2', status: 'in_stage', title: 'Alpha two' },
  ];
  const projectBTasks = [
    { id: 't-b1', workflowId: 'wf-b', projectId: 'proj-b', currentStageId: '1', status: 'in_stage', title: 'Beta session' },
    { id: 't-b2', workflowId: 'wf-b', projectId: 'proj-b', currentStageId: '2', status: 'in_stage', title: 'Beta follow-up' },
  ];
  // Production shape after the fix: the engine snapshot carries the owner
  // snapshot and the global depth across both projects (2 open in A + 2 in B).
  const engineState = {
    status: 'running',
    activeTaskId: 't-a1',
    activeProjectId: 'proj-a',
    activeProjectName: 'Project A',
    activeTask: { ...ownerA },
    openQueueDepth: 4,
  };
  const workflows = [
    { id: 'wf-a', name: 'Pipeline A' },
    { id: 'wf-b', name: 'Pipeline B' },
  ];
  const skipCurrent = vi.fn();
  const toggleCompute = vi.fn();
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    focusedStageId: '1',
    isAgentRunning: true,
    computeRunning: true,
    workflows,
    tasks: projectATasks,
    engineState,
    activeProjectId: 'proj-a',
    skipCurrent,
    toggleCompute,
  });

  const namedBefore = screen.getByTestId('now-playing-task-name').textContent;
  expect(namedBefore).toMatch(/Alpha session/);
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(screen.getByLabelText('Elapsed time in current stage')).toBeInTheDocument();
  const queueBefore = screen
    .getByRole('status', { name: /Execution queue:/ })
    .getAttribute('aria-label');
  expect(queueBefore).toBe('Execution queue: 4 open tasks across all pipelines');

  // Switch to project B: the board list is replaced wholesale (this is what
  // fetchTasks does), workflows list is replaced with project B's workflows,
  // the engine snapshot is untouched.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        focusedStageId: '1',
        isAgentRunning: true,
        computeRunning: true,
        workflows: [{ id: 'wf-b', name: 'Pipeline B' }],
        tasks: projectBTasks,
        engineState,
        activeProjectId: 'proj-b',
        skipCurrent,
        toggleCompute,
      }}
    />,
  );

  // Named task, badge, timer, and queue depth all stay put.
  expect(screen.getByTestId('now-playing-task-name').textContent).toBe(namedBefore);
  expect(screen.queryByText(/Beta session/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Beta follow-up/)).not.toBeInTheDocument();
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(screen.getByLabelText('Elapsed time in current stage')).toBeInTheDocument();
  expect(
    screen.getByRole('status', { name: /Execution queue:/ }).getAttribute('aria-label'),
  ).toBe(queueBefore);
});

/***
 * MARK: runner boxes
 * @description The bar's left side is the fleet roster: one little box per
 * configured Runner (runner name, task name, stage, health colour dot,
 * play/pause + skip) instead of the single-task card. Only zero configured
 * Runners keep the legacy display.
 ***/
test('runner boxes replace the left side for under 5 runners', () => {
  const now = new Date().toISOString();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1' },
    tasks: [
      { id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build the widget', goal: 'Build the widget' },
      { id: 't2', currentStageId: '2', status: 'running_agent', title: 'Review the widget', goal: 'Review the widget' },
    ],
    runnerAssignments: [
      { runnerId: 'runner-a', taskId: 't1', stageId: '1', lastSeenAt: now },
      { runnerId: 'runner-b', taskId: 't2', stageId: '2', lastSeenAt: now },
    ],
  });

  const boxes = screen.getByTestId('now-playing-runner-boxes');
  expect(boxes).toHaveAttribute('aria-label', '2 runners');
  // Each box names its runner, task, and stage.
  expect(screen.getByTestId('now-playing-runner-box-runner-a')).toHaveTextContent('runner-a');
  expect(screen.getByTestId('now-playing-runner-box-runner-a')).toHaveTextContent('Build the widget');
  expect(screen.getByTestId('now-playing-runner-box-runner-a')).toHaveTextContent('Idea');
  expect(screen.getByTestId('now-playing-runner-box-runner-b')).toHaveTextContent('runner-b');
  expect(screen.getByTestId('now-playing-runner-box-runner-b')).toHaveTextContent('Review the widget');
  expect(screen.getByTestId('now-playing-runner-box-runner-b')).toHaveTextContent('Review');
  // The legacy single-task card is gone while boxes show.
  expect(screen.queryByTestId('now-playing-task-name')).not.toBeInTheDocument();
  expect(screen.queryByTestId('now-playing-idle-hint')).not.toBeInTheDocument();
  // Fleet mode carries no engine-status pill: the header reads as just
  // "Runners (n)" and per-runner boxes name each Runner's live state.
  expect(screen.queryByText('RUNNING')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Engine status is RUNNING')).not.toBeInTheDocument();
});

/***
 * MARK: fleet mode hides the engine-status pill
 * @description With runner boxes shown the header reads as just "Runners (n)":
 *   the global CHECKPOINT/WAITING_HUMAN pill is retired (per-runner boxes
 *   already name each Runner's live state). The pill stays in the legacy
 *   single-task display (see the dynamic-status-badges test above).
 ***/
test('fleet mode shows no CHECKPOINT pill: header reads as just Runners (n)', () => {
  const now = new Date().toISOString();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '2',
    isAgentRunning: false,
    engineState: { status: 'checkpoint' },
    tasks: [{ id: 't1', currentStageId: '2', status: 'waiting_human', title: 'Needs review' }],
    runnerAssignments: [
      { runnerId: 'runner-a', taskId: 't1', stageId: '2', lastSeenAt: now },
      { runnerId: 'runner-b', taskId: null, stageId: null, lastSeenAt: null },
    ],
  });

  expect(screen.getByText('Runners (2)')).toBeInTheDocument();
  expect(screen.queryByText('CHECKPOINT')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Engine status is CHECKPOINT')).not.toBeInTheDocument();
  expect(screen.queryByText('WAITING_HUMAN')).not.toBeInTheDocument();
});

test('runner boxes carry a health colour dot: live green, stale amber, unknown grey', () => {
  const nowMs = Date.now();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [
      { id: 't1', currentStageId: '1', status: 'running_agent', title: 'Task one' },
      { id: 't2', currentStageId: '1', status: 'running_agent', title: 'Task two' },
      { id: 't3', currentStageId: '1', status: 'running_agent', title: 'Task three' },
    ],
    runnerAssignments: [
      { runnerId: 'live-r', taskId: 't1', stageId: '1', lastSeenAt: new Date(nowMs).toISOString() },
      { runnerId: 'stale-r', taskId: 't2', stageId: '1', lastSeenAt: new Date(nowMs - 120000).toISOString() },
      { runnerId: 'unknown-r', taskId: 't3', stageId: '1', lastSeenAt: null },
    ],
  });

  const live = screen.getByTestId('now-playing-runner-health-live-r');
  const stale = screen.getByTestId('now-playing-runner-health-stale-r');
  const unknown = screen.getByTestId('now-playing-runner-health-unknown-r');
  expect(live).toHaveAttribute('data-health', 'live');
  expect(live.className).toContain('bg-[#7bdb85]');
  expect(stale).toHaveAttribute('data-health', 'stale');
  expect(stale.className).toContain('bg-warning');
  expect(unknown).toHaveAttribute('data-health', 'unknown');
  expect(unknown.className).toContain('bg-text-muted');
  // The health also reads out in each box's accessible name.
  expect(screen.getByTestId('now-playing-runner-box-live-r')).toHaveAttribute(
    'aria-label',
    expect.stringContaining('healthy'),
  );
  expect(screen.getByTestId('now-playing-runner-box-stale-r')).toHaveAttribute(
    'aria-label',
    expect.stringContaining('stale heartbeat'),
  );

  // Unit-level: the freshness rule itself.
  expect(runnerBoxHealth(new Date(nowMs).toISOString(), nowMs)).toBe('live');
  expect(runnerBoxHealth(new Date(nowMs - 120000).toISOString(), nowMs)).toBe('stale');
  expect(runnerBoxHealth(null, nowMs)).toBe('unknown');
  expect(runnerBoxHealth('not-a-date', nowMs)).toBe('unknown');
});

test('clicking a runner box opens that task in the inspector', () => {
  const setSelectedTask = vi.fn();
  const task = { id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build the widget' };
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [task],
    runnerAssignments: [{ runnerId: 'runner-a', taskId: 't1', stageId: '1', lastSeenAt: new Date().toISOString() }],
    setSelectedTask,
  });

  fireEvent.click(screen.getByLabelText('Inspect task for runner runner-a'));
  expect(setSelectedTask).toHaveBeenCalledWith(task);
});

test('runner box stage falls back to the task stage when the assignment carries none', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [{ id: 't1', currentStageId: '2', status: 'running_agent', title: 'Build the widget' }],
    runnerAssignments: [{ runnerId: 'runner-a', taskId: 't1', lastSeenAt: new Date().toISOString() }],
  });

  expect(screen.getByTestId('now-playing-runner-box-runner-a')).toHaveTextContent('Review');
});

/***
 * MARK: always-on fleet roster
 * @description Runner boxes show even when nothing is running: every
 * configured Runner keeps its box (idle ones read "Idle / Waiting for
 * work"), so the count always matches the fleet. Only a fleet of zero
 * keeps the legacy single-task display. Past the render cap the data
 * layer still returns everyone and the bar shows a "+N more" chip.
 ***/
test('runner boxes show idle runners; legacy display only with zero runners configured', () => {
  // Nothing running, two Runners configured: both boxes show, idle.
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    engineState: { status: 'idle' },
    tasks: [{ id: 't1', currentStageId: '1', status: 'in_stage', title: 'Build the widget' }],
    runners: [
      { runnerId: 'runner-a', status: 'active', paused: false, lastSeenAt: new Date().toISOString() },
      { runnerId: 'runner-b', status: 'active', paused: true, lastSeenAt: null },
    ],
    runnerAssignments: [],
  });
  const boxes = screen.getByTestId('now-playing-runner-boxes');
  expect(boxes).toHaveAttribute('aria-label', '2 runners');
  expect(screen.getByTestId('now-playing-runner-box-runner-a')).toHaveTextContent('Idle');
  expect(screen.getByTestId('now-playing-runner-box-runner-a')).toHaveTextContent(
    'Waiting for work',
  );
  expect(screen.getByTestId('now-playing-runner-box-runner-b')).toHaveTextContent('Idle');
  // The legacy single-task card is gone while boxes show — even idle.
  expect(screen.queryByTestId('now-playing-task-name')).not.toBeInTheDocument();
  expect(screen.queryByTestId('now-playing-idle-hint')).not.toBeInTheDocument();
  // Idle boxes still offer pause/resume; skip stays parked with no task.
  expect(screen.getByLabelText('Pause runner runner-a')).not.toBeDisabled();
  expect(screen.getByLabelText('Resume runner runner-b')).not.toBeDisabled();
  expect(screen.getByLabelText('Skip current task for runner runner-a')).toBeDisabled();
  // Fleet mode carries no engine-status pill, even when idle: the header
  // reads as just "Runners (n)".
  expect(screen.queryByText('IDLE')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Engine status is IDLE')).not.toBeInTheDocument();

  // Zero Runners configured: the legacy display keeps its idle hint.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        engineState: { status: 'idle' },
        tasks: [{ id: 't1', currentStageId: '1', status: 'in_stage', title: 'Build the widget' }],
        runners: [],
        runnerAssignments: [],
      }}
    />,
  );
  expect(screen.queryByTestId('now-playing-runner-boxes')).not.toBeInTheDocument();
  expect(screen.getByTestId('now-playing-idle-hint')).toBeInTheDocument();

  // Unit-level: always an array (empty only with no Runners at all);
  // duplicates collapse; pending Runners never get a box.
  expect(resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners: [] })).toEqual([]);
  expect(resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners: null })).toEqual([]);
  expect(
    resolveRunnerBoxes({
      assignments: [
        { runnerId: 'dup', taskId: 't0' },
        { runnerId: 'dup', taskId: 't1' },
      ],
      tasks: [],
      stages: [],
      runners: null,
    }),
  ).toHaveLength(1);
  expect(
    resolveRunnerBoxes({
      assignments: [],
      tasks: [],
      stages: [],
      runners: [
        { runnerId: 'waiting', status: 'pending' },
        { runnerId: 'fleet', status: 'active' },
      ],
    }),
  ).toEqual([
    expect.objectContaining({ runnerId: 'fleet', idle: true, taskName: 'Idle' }),
  ]);
});

test('past the render cap the bar shows the first boxes plus a "+N more" chip', () => {
  const runners = Array.from({ length: 6 }, (_, i) => ({
    runnerId: `runner-${i}`,
    status: 'active',
    paused: false,
    lastSeenAt: new Date().toISOString(),
  }));
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    engineState: { status: 'idle' },
    tasks: [],
    runners,
    runnerAssignments: [],
  });

  // The header count stays honest about the whole fleet.
  expect(screen.getByTestId('now-playing-runner-boxes')).toHaveAttribute(
    'aria-label',
    '6 runners',
  );
  for (let i = 0; i < 4; i += 1) {
    expect(screen.getByTestId(`now-playing-runner-box-runner-${i}`)).toBeInTheDocument();
  }
  expect(screen.queryByTestId('now-playing-runner-box-runner-4')).not.toBeInTheDocument();
  expect(screen.queryByTestId('now-playing-runner-box-runner-5')).not.toBeInTheDocument();
  const overflow = screen.getByTestId('now-playing-runner-overflow');
  expect(overflow).toHaveTextContent('+2 more');
  expect(overflow).toHaveAttribute('title', expect.stringContaining('runner-4'));
  expect(overflow).toHaveAttribute('title', expect.stringContaining('runner-5'));
});

// Helper to rerender NowPlayingBar with an overridden context.
function NowPlayingBarContextOverlay({ value }) {
  const base = {
    isAgentRunning: false,
    workflows: [],
    tasks: [],
    computeRunning: false,
    toggleCompute: () => {},
    activeProjectId: 'proj-1',
    projects: [{ id: 'proj-1', name: 'Project A' }],
    currentStageId: null,
    focusedStageId: null,
    stages: [],
    lookBack: () => {},
    lookForward: () => {},
    jumpToActive: () => {},
    skipCurrent: () => {},
    engineState: { status: 'idle' },
    setSelectedTask: () => {},
    ...value,
  };
  return (
    <KainBainContext.Provider value={base}>
      <NowPlayingBar />
    </KainBainContext.Provider>
  );
}


/***
 * MARK: per-runner controls stay usable without a global single-flight guard
 * @description Each box fires its own context action directly (pause, resume,
 * skip); there is no shared pending key to disable the bar anymore.
 ***/
test('per-runner controls fire immediately with no global pending state', () => {
  const pauseRunner = vi.fn();
  const skipRunner = vi.fn();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    tasks: [{ id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build' }],
    runnerAssignments: [
      { runnerId: 'runner-a', taskId: 't1', stageId: '1', lastSeenAt: new Date().toISOString() },
    ],
    pauseRunner,
    skipRunner,
  });

  fireEvent.click(screen.getByLabelText('Pause runner runner-a'));
  fireEvent.click(screen.getByLabelText('Skip current task for runner runner-a'));
  expect(pauseRunner).toHaveBeenCalledTimes(1);
  expect(skipRunner).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Pause runner runner-a')).not.toBeDisabled();
  expect(screen.getByLabelText('Skip current task for runner runner-a')).not.toBeDisabled();
});

test('idle engine hides the active task name and key chip behind an idle placeholder', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: false,
    engineState: { status: 'idle' },
    tasks: [
      {
        id: 't1',
        currentStageId: '1',
        status: 'in_stage',
        title: 'Build the widget',
        goal: 'Build the widget',
      },
      { id: 't2', currentStageId: '2', status: 'in_stage', title: 'Review the widget' },
    ],
  });

  expect(screen.getByText('IDLE')).toBeInTheDocument();
  // No task title, goal text, or key chip lingers while idle.
  expect(screen.queryByText(/Build the widget/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Review the widget/)).not.toBeInTheDocument();
  expect(screen.queryByText(/#KB-/)).not.toBeInTheDocument();
  // Honest empty state inside the live region; the inspector button is parked.
  expect(screen.getByTestId('now-playing-idle-hint')).toHaveTextContent('No active task');
  expect(screen.getByRole('button', { name: 'No active task' })).toBeDisabled();
});

test('active task name enters with animation when the engine leaves idle, and clears on return to idle', () => {
  const idleTasks = [
    {
      id: 't1',
      currentStageId: '1',
      status: 'in_stage',
      title: 'Build the widget',
      goal: 'Build the widget',
    },
  ];
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: false,
    engineState: { status: 'idle' },
    tasks: idleTasks,
  });
  expect(screen.queryByText(/Build the widget/)).not.toBeInTheDocument();

  // Engine leaves idle: the name reappears inside the animated wrapper.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        isAgentRunning: true,
        engineState: { status: 'running', activeTaskId: 't1' },
        tasks: idleTasks,
      }}
    />,
  );
  const taskName = screen.getByTestId('now-playing-task-name');
  expect(taskName).toHaveTextContent('Build the widget');
  expect(taskName.className).toContain('now-playing-task-enter');
  expect(screen.getByText('#KB-T1')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Open active task Build the widget/ }),
  ).not.toBeDisabled();

  // The badge text itself never carries the entrance animation (WCAG 1.4.3).
  expect(screen.getByLabelText('Engine status is RUNNING').className).not.toContain(
    'now-playing-task-enter',
  );

  // Engine returns to idle: the name and key clear again.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        isAgentRunning: false,
        engineState: { status: 'idle' },
        tasks: idleTasks,
      }}
    />,
  );
  expect(screen.queryByText(/Build the widget/)).not.toBeInTheDocument();
  expect(screen.queryByText(/#KB-/)).not.toBeInTheDocument();
  expect(screen.getByTestId('now-playing-idle-hint')).toBeInTheDocument();
});

test('active task name shows the first goal line with markdown heading stripped', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1' },
    tasks: [
      {
        id: 't1',
        currentStageId: '1',
        status: 'running_agent',
        title: '',
        goal: '# Build the widget\nSecond line of the goal body',
      },
    ],
  });
  // Only the first line renders, without the markdown heading marker: the
  // splitter must be a real newline, never a literal backslash-n.
  const taskName = screen.getByTestId('now-playing-task-name');
  expect(taskName).toHaveTextContent('Build the widget');
  expect(taskName.textContent).not.toContain('Second line');
  expect(taskName.textContent).not.toContain('#');
  expect(taskName.textContent).not.toContain('\\n');
});

test('shows resolved stage name and reconciles disagreeing engine snapshot', () => {
  const customStages = [
    { id: '1', name: 'Catchup', type: 'agent' },
    { id: 'merge', name: 'Merge and deploy', type: 'merge' },
  ];
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages: customStages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: {
      status: 'running',
      activeTaskId: 't1',
      activeStageId: 'merge',
      activeStageName: 'Merge and deploy',
    },
    tasks: [
      {
        id: 't1',
        currentStageId: '1',
        status: 'running_agent',
        title: 'Task 1',
        goal: 'Goal 1',
      },
    ],
  });

  // Authoritative stage Catchup is displayed, not the stranded engine stage
  expect(screen.getByText('Stage: Catchup')).toBeInTheDocument();
  expect(screen.queryByText('Stage: Merge and deploy')).not.toBeInTheDocument();

  // When task has no resolvable stage, no empty "Stage: " is rendered
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages: [],
        currentStageId: null,
        isAgentRunning: true,
        engineState: { status: 'running', activeTaskId: 't1' },
        tasks: [
          {
            id: 't1',
            status: 'running_agent',
            title: 'Task 1',
          },
        ],
      }}
    />,
  );
  expect(screen.queryByText(/^Stage:/)).not.toBeInTheDocument();
});


test('shows a stuck-queue chip only while the engine reads idle with a latched queue', () => {
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: false,
    engineState: { status: 'idle', activeTaskId: null, busyWhileIdle: true },
  });
  // The badge stays honest (the engine IS idle) and the wedge gets its own chip.
  expect(screen.getByText('IDLE')).toBeInTheDocument();
  const chip = screen.getByRole('status', {
    name: 'Execution queue is stuck while the engine is idle; the scheduler is recovering it automatically',
  });
  expect(chip).toHaveTextContent('Queue stuck — recovering');

  // The chip clears the moment the snapshot stops reporting the wedge.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        isAgentRunning: false,
        engineState: { status: 'idle', activeTaskId: null, busyWhileIdle: false },
      }}
    />,
  );
  expect(screen.getByText('IDLE')).toBeInTheDocument();
  expect(
    screen.queryByRole('status', {
      name: 'Execution queue is stuck while the engine is idle; the scheduler is recovering it automatically',
    }),
  ).not.toBeInTheDocument();

  // Snapshots without the flag (older backends) never show the chip.
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        isAgentRunning: true,
        engineState: { status: 'running', activeTaskId: 't1' },
      }}
    />,
  );
  expect(
    screen.queryByText('Queue stuck — recovering'),
  ).not.toBeInTheDocument();
});
