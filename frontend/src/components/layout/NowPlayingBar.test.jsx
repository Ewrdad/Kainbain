// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { NowPlayingBar } from './NowPlayingBar';
import { KainBainContext } from '../../context/KainBainContext';
import React from 'react';
import '@testing-library/jest-dom';

/***
 * MARK: NowPlayingBar tests
 * @description Verifies the global control bar: current task display,
 * compute play/pause toggle, 4 transport controls (Look Back, Look Forward, Skip Current, Jump to Active),
 * global engine status badge (IDLE, RUNNING, CHECKPOINT, PAUSED), the honest
 * elapsed stage timer, the live queue-depth chip, and the absence of any
 * fabricated percentage bar or stale stage-position label.
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

test('play/pause button toggles compute', () => {
  const toggleCompute = vi.fn();
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    computeRunning: false,
    toggleCompute,
    stages,
    currentStageId: '1',
  });
  fireEvent.click(screen.getByTitle('Start engine'));
  expect(toggleCompute).toHaveBeenCalled();

  // When running, the button offers a pause action.
  rerender(
    <NowPlayingBarContextOverlay
      value={{ computeRunning: true, toggleCompute, stages, currentStageId: '1' }}
    />,
  );
  expect(screen.getByTitle(/Pause|Stop engine/)).toBeInTheDocument();
});

test('Look Back and Look Forward trigger view-only navigation without server mutation', () => {
  const lookBack = vi.fn();
  const lookForward = vi.fn();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '2',
    focusedStageId: '2',
    tasks: [
      { id: 't1', currentStageId: '1', status: 'in_stage' },
      { id: 't2', currentStageId: '2', status: 'in_stage' },
    ],
    lookBack,
    lookForward,
    activeProjectId: 'proj-1',
  });

  fireEvent.click(screen.getByLabelText('Look Back'));
  expect(lookBack).toHaveBeenCalled();

  fireEvent.click(screen.getByLabelText('Look Forward'));
  expect(lookForward).toHaveBeenCalled();
});

test('Look Forward and Skip Current are disabled when no next task is queued (#28)', () => {
  // Scenario 1: Empty tasks list
  const { rerender } = renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    focusedStageId: '1',
    tasks: [],
    activeProjectId: 'proj-1',
  });

  expect(screen.getByLabelText('Look Forward')).toBeDisabled();
  expect(screen.getByLabelText('Skip Current')).toBeDisabled();

  // Scenario 2: Single task only (active task, no subsequent queued task)
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        focusedStageId: '1',
        tasks: [{ id: 't1', currentStageId: '1', status: 'in_stage' }],
        activeProjectId: 'proj-1',
      }}
    />,
  );
  expect(screen.getByLabelText('Look Forward')).toBeDisabled();
  expect(screen.getByLabelText('Skip Current')).toBeDisabled();

  // Scenario 3: Multiple tasks with next queued task enables Look Forward & Skip Current
  rerender(
    <NowPlayingBarContextOverlay
      value={{
        stages,
        currentStageId: '1',
        focusedStageId: '1',
        tasks: [
          { id: 't1', currentStageId: '1', status: 'in_stage' },
          { id: 't2', currentStageId: '2', status: 'in_stage' },
        ],
        activeProjectId: 'proj-1',
      }}
    />,
  );
  expect(screen.getByLabelText('Look Forward')).not.toBeDisabled();
  expect(screen.getByLabelText('Skip Current')).not.toBeDisabled();
});

test('Skip Current triggers mutation to advance active stage/task when confirmed', () => {
  const skipCurrent = vi.fn();
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    focusedStageId: '1',
    tasks: [
      { id: 't1', currentStageId: '1', status: 'in_stage' },
      { id: 't2', currentStageId: '2', status: 'in_stage' },
    ],
    skipCurrent,
    activeProjectId: 'proj-1',
  });

  fireEvent.click(screen.getByLabelText('Skip Current'));
  expect(confirmSpy).toHaveBeenCalled();
  expect(skipCurrent).toHaveBeenCalledWith('proj-1');
  confirmSpy.mockRestore();
});

test('Skip Current cancels mutation when user cancels confirmation', () => {
  const skipCurrent = vi.fn();
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    focusedStageId: '1',
    tasks: [
      { id: 't1', currentStageId: '1', status: 'in_stage' },
      { id: 't2', currentStageId: '2', status: 'in_stage' },
    ],
    skipCurrent,
    activeProjectId: 'proj-1',
  });

  fireEvent.click(screen.getByLabelText('Skip Current'));
  expect(confirmSpy).toHaveBeenCalled();
  expect(skipCurrent).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test('Jump to Active triggers view reset back to executing stage', () => {
  const jumpToActive = vi.fn();
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '2',
    focusedStageId: '1',
    jumpToActive,
    activeProjectId: 'proj-1',
  });

  fireEvent.click(screen.getByLabelText('Jump to Active'));
  expect(jumpToActive).toHaveBeenCalled();
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

  // Named task, badge, timer, queue depth, and transport all stay put.
  expect(screen.getByTestId('now-playing-task-name').textContent).toBe(namedBefore);
  expect(screen.queryByText(/Beta session/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Beta follow-up/)).not.toBeInTheDocument();
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(screen.getByLabelText('Elapsed time in current stage')).toBeInTheDocument();
  expect(
    screen.getByRole('status', { name: /Execution queue:/ }).getAttribute('aria-label'),
  ).toBe(queueBefore);
  expect(screen.getByLabelText('Skip Current')).not.toBeDisabled();
  expect(screen.getByTitle('Stop engine')).toBeInTheDocument();
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


test('Skip Current shows a loading state and a fast double-click skips once', async () => {
  let resolveSkip;
  const skipCurrent = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveSkip = resolve;
      }),
  );
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    focusedStageId: '1',
    tasks: [
      { id: 't1', currentStageId: '1', status: 'in_stage' },
      { id: 't2', currentStageId: '2', status: 'in_stage' },
    ],
    skipCurrent,
    activeProjectId: 'proj-1',
  });

  const skipBtn = screen.getByLabelText('Skip Current');
  fireEvent.click(skipBtn);
  fireEvent.click(skipBtn); // fast second click while the backend is responding

  expect(confirmSpy).toHaveBeenCalledTimes(1); // confirm not re-prompted
  expect(skipCurrent).toHaveBeenCalledTimes(1);
  expect(skipCurrent).toHaveBeenCalledWith('proj-1');
  expect(skipBtn).toBeDisabled();
  expect(skipBtn).toHaveAttribute('aria-busy', 'true');

  await act(async () => {
    resolveSkip({});
  });
  await waitFor(() => {
    expect(skipBtn).not.toBeDisabled();
  });

  confirmSpy.mockRestore();
});

test('play/pause toggle is disabled while the dispatcher change is in flight', async () => {
  let resolveToggle;
  const toggleCompute = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveToggle = resolve;
      }),
  );
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    computeRunning: false,
    toggleCompute,
    activeProjectId: 'proj-1',
  });

  const playBtn = screen.getByTitle('Start engine');
  fireEvent.click(playBtn);
  fireEvent.click(playBtn); // fast second click before the backend responds

  expect(toggleCompute).toHaveBeenCalledTimes(1);
  expect(playBtn).toBeDisabled();
  expect(playBtn).toHaveAttribute('aria-busy', 'true');

  await act(async () => {
    resolveToggle({});
  });
  await waitFor(() => {
    expect(playBtn).not.toBeDisabled();
  });
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

/***
 * MARK: runner boxes in the now playing bar
 * @description With 1-4 runner entries the left side shows compact boxes
 * (runner name, task name, stage, health colour + status word) beside the
 * compact engine badge; 0 or 5+ entries, the kill switch, or plain queue
 * data without runner association keep the legacy single-task view.
 ***/

function runnerEntry(runnerId, overrides = {}) {
  return {
    runnerId,
    runnerLabel: runnerId,
    taskId: `task-${runnerId}`,
    task: { id: `task-${runnerId}`, title: `Work ${runnerId}`, goal: `Work ${runnerId}` },
    taskTitleFirstLine: `Work ${runnerId}`,
    stageName: 'Plan',
    statusWord: 'running',
    ...overrides,
  };
}

test('box mode replaces the single-task title but keeps the engine badge', () => {
  const setSelectedTask = vi.fn();
  renderWithKainBain(
    <NowPlayingBar runnerEntries={[runnerEntry('alpha'), runnerEntry('bravo', { statusWord: 'failed' })]} />,
    {
      stages,
      currentStageId: '1',
      isAgentRunning: true,
      engineState: { status: 'running', activeTaskId: 'task-alpha' },
      setSelectedTask,
    },
  );

  expect(screen.getByTestId('now-playing-runner-mode')).toBeInTheDocument();
  expect(screen.getByTestId('runner-boxes-row')).toBeInTheDocument();
  expect(screen.getByTestId('runner-box-alpha')).toHaveTextContent('Work alpha');
  expect(screen.getByTestId('runner-box-alpha')).toHaveTextContent('Stage: Plan');
  expect(screen.getByTestId('runner-box-alpha')).toHaveTextContent('RUNNING');
  expect(screen.getByTestId('runner-box-bravo')).toHaveTextContent('FAILED');
  // The single-task title is replaced…
  expect(screen.queryByTestId('now-playing-task-name')).not.toBeInTheDocument();
  expect(screen.queryByTestId('now-playing-idle-hint')).not.toBeInTheDocument();
  // …but the global engine badge stays beside the boxes (q8). The badge
  // is pinned by its aria-label: the boxes render their own RUNNING words,
  // so a bare text query would match twice.
  expect(screen.getByLabelText('Engine status is RUNNING')).toHaveTextContent('RUNNING');

  // Clicking a box opens that runner's task in the inspector (q4).
  fireEvent.click(screen.getByTestId('runner-box-bravo'));
  expect(setSelectedTask).toHaveBeenCalledTimes(1);
  expect(setSelectedTask).toHaveBeenCalledWith({
    id: 'task-bravo',
    title: 'Work bravo',
    goal: 'Work bravo',
  });
});

test('five or more entries fall back to the legacy single-task view', () => {
  const entries = ['a', 'b', 'c', 'd', 'e'].map((id) => runnerEntry(id));
  renderWithKainBain(<NowPlayingBar runnerEntries={entries} />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 'task-a' },
    tasks: [
      { id: 'task-a', currentStageId: '1', status: 'running_agent', title: 'Work a', goal: 'Work a' },
    ],
  });

  expect(screen.queryByTestId('now-playing-runner-mode')).not.toBeInTheDocument();
  expect(screen.queryByTestId('runner-boxes-row')).not.toBeInTheDocument();
  expect(screen.getByTestId('now-playing-task-name')).toHaveTextContent('Work a');
});

test('kill switch forces the legacy view even with entries present', () => {
  renderWithKainBain(<NowPlayingBar runnerEntries={[runnerEntry('alpha')]} />, {
    stages,
    currentStageId: '1',
    engineState: { status: 'idle' },
    uiPreferences: { showRunnerBoxes: false },
  });

  expect(screen.queryByTestId('now-playing-runner-mode')).not.toBeInTheDocument();
  expect(screen.getByTestId('now-playing-idle-hint')).toBeInTheDocument();
});

test('junk runner entries keep the legacy view instead of phantom boxes', () => {
  renderWithKainBain(<NowPlayingBar runnerEntries={[null, 'junk']} />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1' },
    tasks: [
      { id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build it', goal: 'Build it' },
    ],
  });

  expect(screen.queryByTestId('now-playing-runner-mode')).not.toBeInTheDocument();
  expect(screen.queryByTestId('runner-boxes-row')).not.toBeInTheDocument();
  expect(screen.getByTestId('now-playing-task-name')).toHaveTextContent('Build it');
});

test('plain queue data without runner association keeps the legacy view', () => {
  // Regression guard: tasks that carry no runner fields are queue data,
  // not runners — the single-task view must not flip into box mode.
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1' },
    tasks: [
      { id: 't1', currentStageId: '1', status: 'running_agent', title: 'Build it', goal: 'Build it' },
      { id: 't2', currentStageId: '2', status: 'in_stage', title: 'Review it' },
    ],
  });

  expect(screen.queryByTestId('now-playing-runner-mode')).not.toBeInTheDocument();
  expect(screen.getByTestId('now-playing-task-name')).toHaveTextContent('Build it');
});

test('context-derived entries show boxes without the prop', () => {
  renderWithKainBain(<NowPlayingBar />, {
    stages,
    currentStageId: '1',
    isAgentRunning: true,
    engineState: { status: 'running', activeTaskId: 't1' },
    tasks: [
      { id: 't1', runnerId: 'alpha', currentStageId: '1', status: 'running_agent', title: 'Build it' },
      { id: 't2', runnerId: 'bravo', currentStageId: '1', status: 'in_stage', title: 'Review it' },
    ],
  });

  expect(screen.getByTestId('now-playing-runner-mode')).toBeInTheDocument();
  expect(screen.getByTestId('runner-box-alpha')).toHaveTextContent('Build it');
  expect(screen.getByTestId('runner-box-bravo')).toHaveTextContent('Review it');
  expect(screen.getByLabelText('Engine status is RUNNING')).toBeInTheDocument();
});

test('idle runner entries render grey boxes that do not navigate', () => {
  const setSelectedTask = vi.fn();
  renderWithKainBain(
    <NowPlayingBar
      runnerEntries={[
        runnerEntry('alpha'),
        {
          runnerId: 'solo',
          runnerLabel: 'Solo',
          taskId: null,
          task: null,
          taskTitleFirstLine: null,
          stageName: null,
          statusWord: 'idle',
        },
      ]}
    />,
    {
      stages,
      currentStageId: '1',
      engineState: { status: 'running', activeTaskId: 'task-alpha' },
      setSelectedTask,
    },
  );

  const idleBox = screen.getByTestId('runner-box-solo');
  expect(idleBox).toHaveTextContent('idle');
  expect(idleBox.className).toContain('opacity-60');
  fireEvent.click(idleBox);
  expect(setSelectedTask).not.toHaveBeenCalled();
});
