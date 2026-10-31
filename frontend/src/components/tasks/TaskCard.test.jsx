// jsdom pin: this suite needs native select/option click semantics (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { TaskCard } from './TaskCard';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { setTouchInputOverride } from '../../hooks/useTapGuard';
import '@testing-library/jest-dom';

/***
 * MARK: TaskCard tests
 * @description Verifies the kanban task card renders the goal, standardized #KB- key,
 *   a role badge, real timestamp, and in-flight disabled states on checkpoint actions.
 *
 *   Two density variants exist (task 7a411b12): the product-default compact card
 *   (one-line goal, no Run Stage / stage-nav rows, no timestamp or stage badge)
 *   and the full card (taskCardDensity: 'default'). Tests that assert the
 *   full-card-only features render with taskCardDensity: 'default' explicitly;
 *   compact-variant behaviour is covered by the dedicated tests at the bottom.
 ***/
const task = { id: 'abc-1234-def', goal: 'Build the API', timeInStage: '2m' };

const FULL_CARD_PREFS = { uiPreferences: { taskCardDensity: 'default' } };

test('renders the goal, standardized key snippet and role badge', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Idea" role="Agent" />, FULL_CARD_PREFS);
  expect(screen.getByText('Build the API')).toBeInTheDocument();
  expect(screen.getByText('#KB-ABC1')).toBeInTheDocument();
  expect(screen.getByText('Agent')).toBeInTheDocument();
  expect(screen.getByText('2m in stage')).toBeInTheDocument();
});

test('renders accurate report count badge when reports exist (#17)', () => {
  const taskWithReports = {
    ...task,
    reports: [
      { filename: 'idea-1.md', path: './docs/tasks/abc-1234-def/idea-1.md' },
      { filename: 'plan-2.md', path: './docs/tasks/abc-1234-def/plan-2.md' },
    ],
  };
  renderWithKainBain(<TaskCard task={taskWithReports} stageName="Idea" role="Agent" />, FULL_CARD_PREFS);
  const badge = screen.getByLabelText('2 reports');
  expect(badge).toBeInTheDocument();
  expect(badge).toHaveTextContent('2');
});


test('renders the Human badge and checkpoint Approve/Reject buttons for human stages', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Review" role="Human" />, FULL_CARD_PREFS);
  expect(screen.getByText('Human')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Approve task #KB-ABC1/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reject task #KB-ABC1/i })).toBeInTheDocument();
});

test('last-stage human checkpoint shows approve-and-complete wording', () => {
  const stages = [
    { id: 's1', name: 'Build', type: 'agent' },
    { id: 's2', name: 'Review', type: 'human' },
  ];
  renderWithKainBain(
    <TaskCard
      task={{ ...task, currentStageId: 's2', status: 'waiting_human' }}
      stageName="Review"
      role="human"
    />,
    { stages },
  );
  const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-ABC1 and complete' });
  expect(approveBtn).toHaveTextContent('✓ Approve & Complete');
});

test('mid-pipeline human checkpoint keeps the approve wording', () => {
  const stages = [
    { id: 's1', name: 'Build', type: 'agent' },
    { id: 's2', name: 'Review', type: 'human' },
    { id: 's3', name: 'Merge', type: 'merge' },
  ];
  renderWithKainBain(
    <TaskCard
      task={{ ...task, currentStageId: 's2', status: 'waiting_human' }}
      stageName="Review"
      role="human"
    />,
    { stages },
  );
  const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-ABC1' });
  expect(approveBtn).toHaveTextContent('✓ Approve');
  expect(screen.queryByText('✓ Approve & Complete')).not.toBeInTheDocument();
});

test('shows the Open PR Review button on waiting_human cards when branch support is on (A1)', () => {
  render(
    <KainBainContext.Provider
      value={{ projects: [{ id: 'proj-1', useBranches: true }], activeProjectId: 'proj-1' }}
    >
      <TaskCard task={task} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  const btn = screen.getByRole('button', { name: /Open PR review for task #KB-ABC1/i });
  expect(btn).toBeInTheDocument();
  expect(btn).not.toBeDisabled();
});

test('Open PR Review routes to the canonical review path and switches the view', () => {
  const setView = vi.fn();
  render(
    <KainBainContext.Provider
      value={{
        projects: [{ id: 'proj-1', useBranches: true }],
        activeProjectId: 'proj-1',
        setView,
      }}
    >
      <TaskCard task={task} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Open PR review for task #KB-ABC1/i }));
  // The facade navigates (the router writes the URL); the card itself must
  // not write raw hashes.
  expect(setView).toHaveBeenCalledWith('task-review', { taskId: 'abc-1234-def' });
});

test('Open PR Review is disabled without branch support (A10) and hidden on completed cards', () => {
  render(
    <KainBainContext.Provider
      value={{ projects: [{ id: 'proj-1', useBranches: false }], activeProjectId: 'proj-1' }}
    >
      <TaskCard task={task} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  expect(screen.getByRole('button', { name: /Open PR review for task #KB-ABC1/i })).toBeDisabled();
});

test('renders the CI badge for ci stage type', () => {
  renderWithKainBain(<TaskCard task={task} stageName="CI" role="ci" />, FULL_CARD_PREFS);
  expect(screen.getByText('CI')).toBeInTheDocument();
});

test('card is draggable and sets task id on drag start', () => {
  const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
  render(<TaskCard task={task} stageName="Idea" role="Agent" />);
  const card = screen.getByLabelText(/Task #KB-ABC1 in Idea/i);
  expect(card).toHaveAttribute('draggable');
  fireEvent.dragStart(card, { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenCalledWith('application/kainbain-task', task.id);
});

test('fires onClick when clicked', () => {
  const onClick = vi.fn();
  render(<TaskCard task={task} stageName="Idea" role="Agent" onClick={onClick} />);
  fireEvent.click(screen.getByText('Build the API'));
  expect(onClick).toHaveBeenCalled();
});

test('disables Approve button and displays loading indicator while in-flight', async () => {
  let resolveApprove;
  const onApprove = vi.fn().mockImplementation(() => new Promise((resolve) => {
    resolveApprove = resolve;
  }));

  render(<TaskCard task={task} stageName="Review" role="Human" onApprove={onApprove} />);
  const approveBtn = screen.getByRole('button', { name: /Approve task #KB-ABC1/i });

  fireEvent.click(approveBtn);

  // Button should enter loading / disabled state immediately
  expect(approveBtn).toBeDisabled();
  expect(screen.getByText('Advancing...')).toBeInTheDocument();
  expect(onApprove).toHaveBeenCalledWith(task.id);

  // Attempt second click while in-flight
  fireEvent.click(approveBtn);
  expect(onApprove).toHaveBeenCalledTimes(1);

  // Resolve in-flight promise
  resolveApprove();
  await waitFor(() => {
    expect(screen.queryByText('Advancing...')).not.toBeInTheDocument();
    expect(approveBtn).not.toBeDisabled();
  });
});

test('a fast double-click on Run Stage dispatches the stage only once', async () => {
  let resolveExecute;
  const onExecute = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveExecute = resolve;
      }),
  );

  renderWithKainBain(
    <TaskCard task={task} stageName="Execution" role="agent" onExecute={onExecute} />,
    FULL_CARD_PREFS,
  );
  const runBtn = screen.getByRole('button', { name: /Run stage for task #KB-ABC1/i });

  fireEvent.click(runBtn);
  fireEvent.click(runBtn); // second click before the backend has responded

  expect(onExecute).toHaveBeenCalledTimes(1);
  expect(runBtn).toBeDisabled();
  expect(screen.getByText('Executing...')).toBeInTheDocument();

  await act(async () => {
    resolveExecute({});
  });
  await waitFor(() => {
    expect(runBtn).not.toBeDisabled();
  });
});

test('a fast double-click on the move-right control fires one move', async () => {
  let resolveMove;
  const moveTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveMove = resolve;
      }),
  );
  const stages = [
    { id: 'stage-1', name: 'Idea' },
    { id: 'stage-2', name: 'Develop' },
    { id: 'stage-3', name: 'Review' },
  ];

  render(
    <KainBainContext.Provider
      value={{ stages, moveTask, activeProjectId: 'proj-1', uiPreferences: { taskCardDensity: 'default' } }}
    >
      <TaskCard task={{ ...task, currentStageId: 'stage-2' }} stageName="Develop" role="agent" />
    </KainBainContext.Provider>,
  );
  const moveRightBtn = screen.getByRole('button', { name: /Move task #KB-ABC1 right/i });

  fireEvent.click(moveRightBtn);
  fireEvent.click(moveRightBtn); // second click before the move is reconciled

  expect(moveTask).toHaveBeenCalledTimes(1);
  expect(moveTask).toHaveBeenCalledWith('proj-1', task.id, 'stage-3');

  await act(async () => {
    resolveMove({});
  });
});

test('for human checkpoint stages, does NOT show the Run Stage button (#19)', () => {
  render(<TaskCard task={task} stageName="Review" role="human" />);
  expect(screen.queryByRole('button', { name: /Run stage for task/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Approve task #KB-ABC1/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reject task #KB-ABC1/i })).toBeInTheDocument();
});

test('shows Run Stage button on agent and ci stages', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  expect(screen.getByRole('button', { name: /Run stage for task #KB-ABC1/i })).toBeInTheDocument();
});

test('renders Reject button with (Add Feedback...) indicator (#35)', () => {
  render(<TaskCard task={task} stageName="Review" role="human" />);
  expect(screen.getByText(/Reject \(Add Feedback\.\.\.\)/i)).toBeInTheDocument();
});

test('renders accessible Move Left, Move Right, and Move to Stage fallback controls (#34)', async () => {
  const moveResolvers = [];
  const moveTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        moveResolvers.push(resolve);
      }),
  );
  const stages = [
    { id: 'stage-1', name: 'Idea' },
    { id: 'stage-2', name: 'Develop' },
    { id: 'stage-3', name: 'Review' },
  ];

  renderWithKainBain(
    <TaskCard task={{ ...task, currentStageId: 'stage-2' }} stageName="Develop" role="agent" />,
    { stages, moveTask, activeProjectId: 'proj-1', uiPreferences: { taskCardDensity: 'default' } },
  );

  const moveLeftBtn = screen.getByRole('button', { name: /Move task #KB-ABC1 left/i });
  const moveRightBtn = screen.getByRole('button', { name: /Move task #KB-ABC1 right/i });
  const stageSelect = screen.getByRole('combobox', { name: /Move task #KB-ABC1 to stage/i });

  expect(moveLeftBtn).toBeInTheDocument();
  expect(moveRightBtn).toBeInTheDocument();
  expect(stageSelect).toBeInTheDocument();

  // Each move must fully settle before the next control is actuated: the
  // card's single-flight guard (usePendingAction) ignores clicks — and the
  // arrow buttons stay disabled — while a move is in flight, so chaining
  // clicks off only the mock-call assertion is timing-sensitive and flakes
  // under full-suite load.
  const settleMove = async () => {
    await act(async () => {
      moveResolvers.shift()({});
    });
    await waitFor(() => {
      expect(moveLeftBtn).not.toBeDisabled();
      expect(moveRightBtn).not.toBeDisabled();
    });
  };

  // Clicking Move Left moves task to stage-1
  fireEvent.click(moveLeftBtn);
  await waitFor(() => {
    expect(moveTask).toHaveBeenCalledWith('proj-1', task.id, 'stage-1');
  });
  await settleMove();

  // Clicking Move Right moves task to stage-3
  fireEvent.click(moveRightBtn);
  await waitFor(() => {
    expect(moveTask).toHaveBeenCalledWith('proj-1', task.id, 'stage-3');
  });
  await settleMove();

  // Changing dropdown moves task to selected stage
  fireEvent.click(stageSelect);
  fireEvent.click(screen.getByRole('option', { name: /3\. Review/i }));
  await waitFor(() => {
    expect(moveTask).toHaveBeenCalledTimes(3);
    expect(moveTask).toHaveBeenLastCalledWith('proj-1', task.id, 'stage-3');
  });
  await settleMove();
});

test('renders INTERRUPTED badge for interrupted or recovered tasks', () => {
  const interruptedTask = {
    ...task,
    status: 'interrupted',
    wasInterrupted: true,
  };
  render(<TaskCard task={interruptedTask} stageName="Execution" role="agent" />);
  expect(screen.getByText('INTERRUPTED')).toBeInTheDocument();
});

test('renders PAUSED badge for paused tasks', () => {
  const pausedTask = {
    ...task,
    status: 'paused',
  };
  render(<TaskCard task={pausedTask} stageName="Execution" role="agent" />);
  expect(screen.getByText('PAUSED')).toBeInTheDocument();
});

test('does not show FAILED tag when failureReason is cleared and status is in_stage (#1)', () => {
  const recoveredTask = {
    ...task,
    status: 'in_stage',
    failureReason: null,
    lastError: null,
  };
  render(<TaskCard task={recoveredTask} stageName="Execution" role="agent" />);
  expect(screen.queryByLabelText('Failed execution')).not.toBeInTheDocument();
  expect(screen.queryByText(/Failed/i)).not.toBeInTheDocument();
});

test('shows FAILED tag when status is failed or failureReason exists', () => {
  const failedTask = {
    ...task,
    status: 'failed',
    failureReason: 'Syntax error on line 42',
  };
  render(<TaskCard task={failedTask} stageName="Execution" role="agent" />);
  expect(screen.getByLabelText('Failed execution')).toBeInTheDocument();
});

test('shows REJECTED tag for a deliberate rejection on an agent-ready task', () => {
  const rejectedTask = {
    ...task,
    status: 'in_stage',
    failureReason: 'Missing validation on empty input',
    lastError: {
      message: 'Missing validation on empty input',
      stageName: 'Review',
      failureKind: 'rejected',
    },
  };
  render(<TaskCard task={rejectedTask} stageName="Execution" role="agent" />);
  expect(screen.getByLabelText('Rejected execution')).toBeInTheDocument();
  expect(screen.queryByLabelText('Failed execution')).not.toBeInTheDocument();
});

test('keeps the REJECTED tag while an auto-retry is queued', () => {
  const retryingRejection = {
    ...task,
    status: 'in_stage',
    autoRetrying: true,
    failureReason: 'Review found a gap',
    lastError: { message: 'Review found a gap', failureKind: 'rejected' },
  };
  render(<TaskCard task={retryingRejection} stageName="Execution" role="agent" />);
  expect(screen.getByLabelText('Rejected execution')).toBeInTheDocument();

  const retryingFailure = {
    ...task,
    status: 'in_stage',
    autoRetrying: true,
    failureReason: 'Socket hang up',
  };
  cleanup();
  render(<TaskCard task={retryingFailure} stageName="Execution" role="agent" />);
  expect(screen.queryByLabelText('Failed execution')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Rejected execution')).not.toBeInTheDocument();
});

test('parked failed task with a lingering retry flag reads FAILED, not RETRYING', () => {
  const stuckTask = {
    ...task,
    status: 'failed',
    autoRetrying: true,
    failureReason: 'Socket hang up',
  };
  render(<TaskCard task={stuckTask} stageName="Execution" role="agent" />);
  expect(screen.getByLabelText('Failed execution')).toBeInTheDocument();
  expect(screen.queryByText(/RETRYING/)).not.toBeInTheDocument();
});

test('scheduled retry names itself with attempt counts on the card', () => {
  const scheduledTask = {
    ...task,
    status: 'in_stage',
    retryState: 'scheduled',
    autoRetrying: true,
    retryAttempt: 1,
    retryMaxAttempts: 3,
    nextRetryAt: new Date(Date.now() + 12000).toISOString(),
  };
  render(<TaskCard task={scheduledTask} stageName="Execution" role="agent" />);
  expect(screen.getByText(/RETRYING \(scheduled\) 1\/3/)).toBeInTheDocument();
  expect(screen.queryByLabelText('Failed execution')).not.toBeInTheDocument();
});

/***
 * MARK: compact task-card density tests (task 7a411b12)
 * @description 'compact' is the product-default taskCardDensity: the card
 *   shrinks on all viewports by keeping only critical signals and actions.
 *   The explicit 'default' density restores the full card (asserted above).
 ***/
test('compact density (default prefs) renders one-line goal without Run Stage, stage-nav, timestamp, or stage badge', () => {
  const stages = [
    { id: 'stage-1', name: 'Idea' },
    { id: 'stage-2', name: 'Develop' },
  ];
  renderWithKainBain(
    <TaskCard task={{ ...task, currentStageId: 'stage-2' }} stageName="Develop" role="agent" />,
    { stages, activeProjectId: 'proj-1', uiPreferences: { taskCardDensity: 'compact' } },
  );

  // Kept: goal text (clamped to one line regardless of cardPreviewLines),
  // status label, compact padding, draggable card identity.
  const title = screen.getByText('Build the API');
  expect(title.className).toContain('line-clamp-1');
  const card = screen.getByLabelText(/Task #KB-ABC1 in Develop/i);
  expect(card).toHaveAttribute('draggable');
  expect(card.className).toContain('p-2');
  expect(card.className).not.toContain('p-3');

  // Dropped in compact: Run Stage row, stage-navigation row, timestamp,
  // stage badge, report badge.
  expect(screen.queryByRole('button', { name: /Run stage for task/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Move task #KB-ABC1 left/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Move task #KB-ABC1 right/i })).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: /Move task #KB-ABC1 to stage/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('2m in stage')).not.toBeInTheDocument();
  expect(screen.queryByText('Agent')).not.toBeInTheDocument();
});

test('bare render (no preferences) resolves to the compact card', () => {
  render(<TaskCard task={task} stageName="Idea" role="Agent" />);

  const card = screen.getByLabelText(/Task #KB-ABC1 in Idea/i);
  expect(card.className).toContain('p-2');
  expect(screen.getByText('Build the API').className).toContain('line-clamp-1');
  expect(screen.queryByRole('button', { name: /Run stage for task/i })).not.toBeInTheDocument();
  expect(screen.queryByText('2m in stage')).not.toBeInTheDocument();
  expect(screen.queryByText('Agent')).not.toBeInTheDocument();
});

test('compact keeps checkpoint Approve/Reject, PR review, and the card aria-label', () => {
  renderWithKainBain(
    <TaskCard task={task} stageName="Review" role="Human" />,
    { uiPreferences: { taskCardDensity: 'compact' } },
  );

  expect(screen.getByRole('button', { name: /Approve task #KB-ABC1/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reject task #KB-ABC1/i })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Open PR review for task #KB-ABC1/i }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/Task #KB-ABC1 in Review/i)).toBeInTheDocument();
});

test('compact overrides cardPreviewLines to a single clamped line', () => {
  renderWithKainBain(
    <TaskCard task={{ ...task, goal: 'A very long goal title that would wrap onto three lines when clamped' }} stageName="Idea" role="Agent" />,
    { uiPreferences: { taskCardDensity: 'compact', cardPreviewLines: 3 } },
  );

  expect(screen.getByText('A very long goal title that would wrap onto three lines when clamped', { exact: false }).className).toContain('line-clamp-1');
});

test('full-card density keeps badge, timestamp, and quick-action rows', () => {
  const stages = [
    { id: 'stage-1', name: 'Idea' },
    { id: 'stage-2', name: 'Develop' },
  ];
  renderWithKainBain(
    <TaskCard task={{ ...task, currentStageId: 'stage-2' }} stageName="Develop" role="agent" />,
    { stages, activeProjectId: 'proj-1', uiPreferences: { taskCardDensity: 'default' } },
  );

  expect(screen.getByText('Agent')).toBeInTheDocument();
  expect(screen.getByText('2m in stage')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Run stage for task #KB-ABC1/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Move task #KB-ABC1 right/i })).toBeInTheDocument();
  const card = screen.getByLabelText(/Task #KB-ABC1 in Develop/i);
  expect(card.className).toContain('p-3');
});

/***
 * MARK: mobile tap-guard tests (task e2cf55ac)
 * @description On mobile a tap anywhere on a card opens the full-screen task
 *   inspector; taps on buttons and dropdown triggers must actuate the control
 *   and never open the inspector. These tests encode the interaction matrix:
 *   non-button card regions (title, meta, badges) open the inspector,
 *   interactive controls never do, and InfoTooltip-wrapped badges pin their
 *   popover in touch mode without bubbling into the inspector. Desktop
 *   behaviour is regression-guarded too.
 ***/
test('tap on the card title opens the inspector (compact and full densities)', () => {
  for (const density of ['compact', 'default']) {
    const onClick = vi.fn();
    renderWithKainBain(
      <TaskCard task={task} stageName="Idea" role="Agent" onClick={onClick} />,
      { uiPreferences: { taskCardDensity: density } },
    );
    fireEvent.click(screen.getByText('Build the API'));
    expect(onClick).toHaveBeenCalledTimes(1);
    cleanup();
  }
});

test('tap on a checkpoint Approve button actuates the approve and never opens the inspector', () => {
  const onClick = vi.fn();
  const onApprove = vi.fn().mockResolvedValue({});
  render(
    <TaskCard
      task={task}
      stageName="Review"
      role="Human"
      onClick={onClick}
      onApprove={onApprove}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-ABC1/i }));

  expect(onApprove).toHaveBeenCalledWith(task.id);
  expect(onClick).not.toHaveBeenCalled();
});

test('tap on the stage-nav dropdown trigger never opens the inspector', () => {
  const onClick = vi.fn();
  const stages = [
    { id: 'stage-1', name: 'Idea' },
    { id: 'stage-2', name: 'Develop' },
    { id: 'stage-3', name: 'Review' },
  ];
  render(
    <KainBainContext.Provider
      value={{
        stages,
        activeProjectId: 'proj-1',
        uiPreferences: { taskCardDensity: 'default' },
      }}
    >
      <TaskCard
        task={{ ...task, currentStageId: 'stage-2' }}
        stageName="Develop"
        role="agent"
        onClick={onClick}
      />
    </KainBainContext.Provider>,
  );

  // SelectDropdown renders an ARIA combobox trigger; tapping it opens the
  // listbox, and must never open the inspector slide-over.
  fireEvent.click(screen.getByRole('combobox', { name: /Move task #KB-ABC1 to stage/i }));
  expect(onClick).not.toHaveBeenCalled();
});

test('tap on a status badge pins its tooltip without opening the inspector in touch mode', () => {
  setTouchInputOverride(true);
  const onClick = vi.fn();
  renderWithKainBain(
    <TaskCard task={{ ...task, status: 'completed' }} stageName="Idea" role="Agent" onClick={onClick} />,
    { uiPreferences: { taskCardDensity: 'compact' } },
  );

  // The ✓ Done badge is a non-button InfoTooltip trigger: tap pins the
  // popover (coordinated via stopPropagation) instead of also opening the
  // full-screen inspector over it.
  fireEvent.click(screen.getByText('✓ Done'));

  expect(screen.getByText('Task Completed')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Task Completed' })).toBeInTheDocument();
  expect(onClick).not.toHaveBeenCalled();

  setTouchInputOverride(null);
});

test('tap on a status badge still opens the inspector on desktop (unchanged)', () => {
  setTouchInputOverride(false);
  const onClick = vi.fn();
  renderWithKainBain(
    <TaskCard task={{ ...task, status: 'completed' }} stageName="Idea" role="Agent" onClick={onClick} />,
    { uiPreferences: { taskCardDensity: 'compact' } },
  );

  fireEvent.click(screen.getByText('✓ Done'));
  expect(onClick).toHaveBeenCalledTimes(1);

  setTouchInputOverride(null);
});

test('Enter key on the Approve button actuates the approve instead of opening the inspector', () => {
  const onClick = vi.fn();
  const onApprove = vi.fn().mockResolvedValue({});
  render(
    <TaskCard
      task={task}
      stageName="Review"
      role="Human"
      onClick={onClick}
      onApprove={onApprove}
    />,
  );

  // Enter on a focused button bubbles to the card's keydown handler; the card
  // must let the button activate natively instead of opening the inspector.
  fireEvent.keyDown(screen.getByRole('button', { name: /Approve task #KB-ABC1/i }), { key: 'Enter' });

  expect(onClick).not.toHaveBeenCalled();
});

test('Enter key on the focused card still opens the inspector (keyboard fallback kept)', () => {
  const onClick = vi.fn();
  render(<TaskCard task={task} stageName="Idea" role="Agent" onClick={onClick} />);

  fireEvent.keyDown(screen.getByLabelText(/Task #KB-ABC1 in Idea/i), { key: 'Enter' });
  expect(onClick).toHaveBeenCalledTimes(1);
});


test('Copy Checkout sits beside Open PR Review and copies the derived branch command', async () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
  render(
    <KainBainContext.Provider
      value={{ projects: [{ id: 'proj-1', useBranches: true }], activeProjectId: 'proj-1' }}
    >
      <TaskCard task={task} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  const copyBtn = screen.getByRole('button', { name: /Copy checkout command for task #KB-ABC1/i });
  expect(copyBtn).toBeInTheDocument();
  expect(copyBtn).not.toBeDisabled();
  fireEvent.click(copyBtn);
  await waitFor(() => {
    expect(writeTextMock).toHaveBeenCalledWith('git fetch origin && git checkout kb/abc-1234-def');
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Copy checkout command for task #KB-ABC1/i })).toHaveTextContent('Copied ✓');
  });
  cleanup();
});

test('Copy Checkout uses the persisted branch when the task carries one', async () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true,
  });
  render(
    <KainBainContext.Provider
      value={{ projects: [{ id: 'proj-1', useBranches: true }], activeProjectId: 'proj-1' }}
    >
      <TaskCard task={{ ...task, branch: 'kb/custom-branch' }} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Copy checkout command for task #KB-ABC1/i }));
  await waitFor(() => {
    expect(writeTextMock).toHaveBeenCalledWith('git fetch origin && git checkout kb/custom-branch');
  });
  cleanup();
});

test('Copy Checkout is disabled without branch support', () => {
  render(
    <KainBainContext.Provider
      value={{ projects: [{ id: 'proj-1', useBranches: false }], activeProjectId: 'proj-1' }}
    >
      <TaskCard task={task} stageName="Review" role="Human" />
    </KainBainContext.Provider>,
  );
  expect(screen.getByRole('button', { name: /Copy checkout command for task #KB-ABC1/i })).toBeDisabled();
  cleanup();
});

/***
 * MARK: blocked-status label tests
 * @description A task with unresolved blockers must read BLOCKED in the
 *   TaskCard meta row instead of any *_READY / PENDING label, in both compact
 *   and full-card densities, with blocker keys in the tooltip — never raw ids.
 ***/
test('blocked agent-role task shows BLOCKED instead of AGENT_READY (full card)', () => {
  const blockedTask = { ...task, isBlocked: true, blockedBy: ['abc-1234-def'] };
  renderWithKainBain(<TaskCard task={blockedTask} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  expect(screen.queryByText('AGENT_READY')).not.toBeInTheDocument();
  cleanup();
});

test('blocked task shows BLOCKED in compact density meta row', () => {
  const blockedTask = { ...task, isBlocked: true, blockedBy: ['abc-1234-def'] };
  renderWithKainBain(<TaskCard task={blockedTask} stageName="Execution" role="agent" />, {
    uiPreferences: { taskCardDensity: 'compact' },
  });
  expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  expect(screen.queryByText('AGENT_READY')).not.toBeInTheDocument();
  cleanup();
});

test('blocked meta-row status names blocker keys, never raw ids', () => {
  const blockerId = '73c4560d-1417-4fe1-8695-a829237de9ec';
  const blockedTask = { ...task, isBlocked: true, blockedBy: [blockerId] };
  renderWithKainBain(<TaskCard task={blockedTask} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  const labelled = screen.getAllByLabelText(/Blocked by #KB-73C4/i);
  const status = labelled.find((el) => el.textContent.includes('BLOCKED'));
  expect(status).toBeInTheDocument();
  expect(status.getAttribute('title') || '').not.toContain(blockerId);
  cleanup();
});

test('blocked tooltip caps long blocker lists with +N more', () => {
  const blockedTask = {
    ...task,
    isBlocked: true,
    blockedBy: ['a-1111', 'b-2222', 'c-3333', 'd-4444'],
  };
  renderWithKainBain(<TaskCard task={blockedTask} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  const labelled = screen.getAllByLabelText(/\+1 more/i);
  expect(labelled.length).toBeGreaterThan(0);
  expect(labelled.find((el) => el.textContent.includes('BLOCKED'))).toBeInTheDocument();
  cleanup();
});

test('failed and running signals keep precedence over blocked', () => {
  const failedBlocked = { ...task, status: 'failed', failureReason: 'boom', isBlocked: true };
  renderWithKainBain(<TaskCard task={failedBlocked} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  expect(screen.getByText('FAILED')).toBeInTheDocument();
  expect(screen.queryByText('BLOCKED')).not.toBeInTheDocument();
  cleanup();

  const runningBlocked = { ...task, status: 'running_agent', isBlocked: true };
  renderWithKainBain(<TaskCard task={runningBlocked} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  expect(screen.queryByText('BLOCKED')).not.toBeInTheDocument();
  cleanup();
});

test('unblocked task keeps its role-ready label', () => {
  renderWithKainBain(<TaskCard task={task} stageName="Execution" role="agent" />, FULL_CARD_PREFS);
  expect(screen.getByText('AGENT_READY')).toBeInTheDocument();
  expect(screen.queryByText('BLOCKED')).not.toBeInTheDocument();
  cleanup();
});

test('single-active invariant: owner RUNNING, stale running_* INTERRUPTED, never two RUNNING', () => {
  const engineState = { status: 'running', activeTaskId: 'task-a' };
  const owner = { id: 'task-a', goal: 'Owner work', status: 'running_agent' };
  const stale = { id: 'task-b', goal: 'Stale work', status: 'running_agent' };

  const { unmount } = renderWithKainBain(
    <TaskCard task={owner} stageName="Work" role="agent" />,
    { ...FULL_CARD_PREFS, engineState },
  );
  expect(screen.getByText('RUNNING')).toBeInTheDocument();
  unmount();

  renderWithKainBain(<TaskCard task={stale} stageName="Work" role="agent" />, {
    ...FULL_CARD_PREFS,
    engineState,
  });
  expect(screen.queryByText('RUNNING')).not.toBeInTheDocument();
  expect(screen.getByText('INTERRUPTED')).toBeInTheDocument();
});

test('run button shows queued-busy state while another task owns the engine', () => {
  const engineState = { status: 'running', activeTaskId: 'task-a' };
  const queued = { id: 'task-c', goal: 'Queued work', status: 'in_stage' };
  renderWithKainBain(<TaskCard task={queued} stageName="Work" role="agent" />, {
    ...FULL_CARD_PREFS,
    engineState,
  });
  const button = screen.getByRole('button', { name: /engine busy/i });
  expect(button).toBeInTheDocument();
  expect(button).toBeDisabled();
  expect(button).toHaveTextContent(/queued — engine busy/i);
});

test('hides checkpoint Approve/Reject on terminal-failed tasks (approve would 409)', () => {
  const failedTask = {
    ...task,
    currentStageId: 's2',
    status: 'failed',
    failureReason: 'git checkout master failed (exit 128)',
  };
  renderWithKainBain(<TaskCard task={failedTask} stageName="Review" role="Human" />, FULL_CARD_PREFS);
  expect(screen.queryByRole('button', { name: /Approve task #KB-ABC1/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Reject task #KB-ABC1/i })).not.toBeInTheDocument();
  // The failure signal itself stays: recovery lives in the detail view.
  expect(screen.getByLabelText('Failed execution')).toBeInTheDocument();
});

test('shows Open Survey on parked agent stages even without stage metadata (fail-visible)', () => {
  // Restart/pipeline-edit path: no stage record resolves and no persisted
  // flag — the waiting_human agent card must still offer the survey.
  renderWithKainBain(
    <TaskCard task={{ ...task, status: 'waiting_human' }} stageName="Ask" role="agent" />,
    { ...FULL_CARD_PREFS, stages: [] },
  );
  expect(screen.getByText('AWAITING_SURVEY')).toBeInTheDocument();
  const btn = screen.getByRole('button', { name: /Open survey for task #KB-ABC1/i });
  expect(btn).toBeInTheDocument();
  expect(btn).toHaveTextContent(/Open Survey/);
  cleanup();
});

test('shows Open Survey on parked question-me stages with the skill record', () => {
  const stages = [
    { id: 's1', name: 'Ask', type: 'agent', skills: [{ name: 'question-me' }] },
    { id: 's2', name: 'Plan', type: 'agent' },
  ];
  renderWithKainBain(
    <TaskCard
      task={{ ...task, currentStageId: 's1', status: 'waiting_human', surveyPending: true }}
      stageName="Ask"
      role="agent"
    />,
    { ...FULL_CARD_PREFS, stages },
  );
  expect(screen.getByRole('button', { name: /Open survey for task #KB-ABC1/i })).toBeInTheDocument();
  cleanup();
});

test('report badge uses the summary total when reports are capped', () => {
  const capped = {
    ...task,
    reports: Array.from({ length: 10 }, (_, i) => ({
      filename: `r-${i}.md`,
      path: `./docs/tasks/abc-1234-def/r-${i}.md`,
    })),
    reportCount: 1500,
  };
  renderWithKainBain(<TaskCard task={capped} stageName="Idea" role="Agent" />, FULL_CARD_PREFS);
  expect(screen.getByLabelText('1500 reports')).toBeInTheDocument();
  cleanup();
});

test('runner-held card names the holding runner instead of looking idle', () => {
  renderWithKainBain(
    <TaskCard
      task={{ ...task, status: 'in_stage', claim: { runnerId: 'local-pi', epoch: 3 } }}
      stageName="Plan"
      role="Agent"
    />,
    FULL_CARD_PREFS,
  );
  expect(screen.getByText('RUNNING · local-pi')).toBeInTheDocument();
  cleanup();
});

test('hides Open Survey on human checkpoints (approval owns that wait)', () => {
  const stages = [
    { id: 's1', name: 'Build', type: 'agent' },
    { id: 's2', name: 'Review', type: 'human' },
  ];
  renderWithKainBain(
    <TaskCard
      task={{ ...task, currentStageId: 's2', status: 'waiting_human' }}
      stageName="Review"
      role="human"
    />,
    { ...FULL_CARD_PREFS, stages },
  );
  expect(screen.queryByRole('button', { name: /Open survey/i })).not.toBeInTheDocument();
  expect(screen.getByText('AWAITING_REVIEW')).toBeInTheDocument();
  cleanup();
});
