import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { DEFAULT_UI_PREFERENCES } from '../../context/useUiPreferences';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas.column tests
 * @description Per-stage column cases owned by `StageColumn`: analytics strip, paused visuals, in-place task creation, checkpoint approve/reject and drag-and-drop. Rendered through `WorkflowCanvas` (integration).
 ***/
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const stages = [
  { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' },
  { id: '2', name: 'Review', type: 'human', prompt: 'Human review.' },
];

const tasks = [
  { id: 'task-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
  { id: 'task-2', goal: 'Review API spec', currentStageId: '2', status: 'in_stage' },
  { id: 'task-3', goal: 'Old task', currentStageId: '1', status: 'completed' },
];

test('renders a recovered duration in the canvas analytics row without a live server', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [
      {
        id: 'duration-task',
        currentStageId: '2',
        status: 'in_stage',
        reports: [
          { stageName: 'Idea', content: '# Stage Report\n**Duration:** 125s\n**Status:** PASSED' },
        ],
      },
    ],
    activeProjectId: 'proj-1',
  });
  expect(
    within(screen.getByTestId('stage-analytics-1')).getByTitle('Average stage duration'),
  ).toHaveTextContent('2m 5s');
  expect(
    within(screen.getByTestId('stage-analytics-2')).getByTitle('Average stage duration'),
  ).toHaveTextContent('--');
});

test('renders the average from compact board duration samples without detail hydration', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [
      {
        id: 'compact-duration-task',
        currentStageId: '2',
        status: 'in_stage',
        reports: [{ stageName: 'Idea' }],
        stageDurationSamples: [{ stageId: '1', stageName: 'Idea', seconds: [120, 130] }],
      },
    ],
    activeProjectId: 'proj-1',
  });
  expect(
    within(screen.getByTestId('stage-analytics-1')).getByTitle('Average stage duration'),
  ).toHaveTextContent('2m 5s');
  expect(
    within(screen.getByTestId('stage-analytics-2')).getByTitle('Average stage duration'),
  ).toHaveTextContent('--');
});

test('renders PAUSED badge and paused banner when stage.paused is true', () => {
  const pausedStages = [
    { id: '1', name: 'Idea', type: 'agent', paused: true },
    { id: '2', name: 'Review', type: 'human', paused: false },
  ];
  renderWithKainBain(<WorkflowCanvas />, {
    stages: pausedStages,
    tasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByText('Paused')).toBeInTheDocument();
  expect(
    screen.getAllByText(/Stage paused — tasks will not advance automatically/i)[0],
  ).toBeInTheDocument();
});

test('in-place task creation creates a new task in the target column', async () => {
  const createTask = vi.fn().mockResolvedValue({ id: 'task-new' });
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    createTask,
  });

  // Click "+ Add Task" on the first column (Idea)
  fireEvent.click(screen.getByLabelText('Add task to Idea'));

  const input = screen.getByLabelText('Task goal for Idea');
  expect(input).toBeInTheDocument();

  fireEvent.change(input, { target: { value: 'Create user dashboard' } });
  fireEvent.submit(input.closest('form'));

  await waitFor(() => {
    expect(createTask).toHaveBeenCalledWith('proj-1', {
      title: 'Create user dashboard',
      goal: 'Create user dashboard',
      stageId: '1',
      workflowId: 'wf-default',
    });
  });
});

test('in-place task creation opens the inspector with the created task immediately', async () => {
  // The list refetch is intentionally slow: opening the inspector must not
  // wait for it (the created snapshot comes from the POST response).
  // `listTasks: vi.fn().mockImplementation(() => new Promise(() => {}))` is
  // deliberately NOT provided here — the context is fully mocked, so the
  // assertion below proves the inspector opens off the POST response alone.
  const createdTask = { id: 'task-new', title: 'Edit me now', goal: 'Edit me now' };
  const createTask = vi.fn().mockResolvedValue(createdTask);
  const setSelectedTask = vi.fn();
  const executeTaskStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    createTask,
    executeTaskStage,
    setSelectedTask,
  });

  fireEvent.click(screen.getByLabelText('Add task to Idea'));
  fireEvent.change(screen.getByLabelText('Task goal for Idea'), {
    target: { value: 'Edit me now' },
  });
  fireEvent.submit(screen.getByLabelText('Task goal for Idea').closest('form'));

  // Inspector opens with the fresh task without awaiting the (slow) refetch.
  await waitFor(() => {
    expect(setSelectedTask).toHaveBeenCalledWith(createdTask);
  });
});

test('auto-executes the agent on in-column create for a non-checkpoint stage (F1)', async () => {
  const createTask = vi.fn().mockResolvedValue({ id: 'task-f1' });
  const executeTaskStage = vi.fn().mockResolvedValue({ status: 'completed' });
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    createTask,
    executeTaskStage,
  });

  fireEvent.click(screen.getByLabelText('Add task to Idea'));
  fireEvent.change(screen.getByLabelText('Task goal for Idea'), {
    target: { value: 'Auto run this' },
  });
  fireEvent.submit(screen.getByLabelText('Task goal for Idea').closest('form'));

  await waitFor(() => {
    expect(executeTaskStage).toHaveBeenCalledWith('proj-1', 'task-f1');
  });
});

test('does NOT auto-execute on in-column create for a human checkpoint stage', async () => {
  const createTask = vi.fn().mockResolvedValue({ id: 'task-human' });
  const executeTaskStage = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    activeProjectId: 'proj-1',
    createTask,
    executeTaskStage,
  });

  fireEvent.click(screen.getByLabelText('Add task to Review'));
  fireEvent.change(screen.getByLabelText('Task goal for Review'), {
    target: { value: 'Manual checkpoint' },
  });
  fireEvent.submit(screen.getByLabelText('Task goal for Review').closest('form'));

  // Allow any pending async work to settle, then assert no agent dispatch happened.
  await waitFor(() => {
    expect(createTask).toHaveBeenCalled();
  });
  await new Promise((r) => setTimeout(r, 50));
  expect(executeTaskStage).not.toHaveBeenCalled();
});

test('renders in-column stage analytics strip with throughput and pass rates (#31)', () => {
  const analyticsTasks = [
    {
      id: 'task-1',
      title: 'Task Alpha',
      workflowId: 'wf-default',
      currentStageId: '1',
      status: 'in_stage',
      reports: [{ stageName: 'Idea', duration: '3.2', status: 'PASSED' }],
      history: [{ action: 'Created in stage 1' }, { action: 'Passed stage 1' }],
    },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: analyticsTasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByTestId('stage-analytics-1')).toBeInTheDocument();
  expect(screen.getByTestId('stage-analytics-2')).toBeInTheDocument();
});

test('Approve on TaskCard in a checkpoint stage calls advanceTask', () => {
  const advanceTask = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    advanceTask,
  });

  fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-TASK/i }));
  expect(advanceTask).toHaveBeenCalledWith('proj-1', 'task-2');
});

test('card approve flushes the inspector pending save before advancing', async () => {
  const order = [];
  const advanceTask = vi.fn().mockImplementation(() => {
    order.push('advance');
    return Promise.resolve({});
  });
  const flushPendingTaskSave = vi.fn().mockImplementation(async () => {
    order.push('flush');
  });
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    advanceTask,
    flushPendingTaskSave,
    hasPendingTaskSaveFlush: () => true,
  });

  fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-TASK/i }));
  await waitFor(() => {
    expect(advanceTask).toHaveBeenCalledWith('proj-1', 'task-2');
  });

  // The pending edit reached the backend first; the board only advances after.
  expect(flushPendingTaskSave).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['flush', 'advance']);
});

test('card approve does NOT advance when the pending save fails', async () => {
  const advanceTask = vi.fn();
  const flushPendingTaskSave = vi.fn().mockRejectedValue(new Error('save failed'));
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    advanceTask,
    flushPendingTaskSave,
    hasPendingTaskSaveFlush: () => true,
  });

  fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-TASK/i }));
  await waitFor(() => {
    expect(flushPendingTaskSave).toHaveBeenCalled();
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(advanceTask).not.toHaveBeenCalled();
});

test('card reject flushes the inspector pending save before opening the feedback dialog', async () => {
  const order = [];
  const openFeedbackDialog = vi.fn(() => order.push('dialog'));
  const flushPendingTaskSave = vi.fn().mockImplementation(async () => order.push('flush'));
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    openFeedbackDialog,
    flushPendingTaskSave,
    hasPendingTaskSaveFlush: () => true,
  });

  fireEvent.click(screen.getByRole('button', { name: /Reject task #KB-TASK/i }));
  await waitFor(() => {
    expect(openFeedbackDialog).toHaveBeenCalled();
  });
  expect(order).toEqual(['flush', 'dialog']);
});

test('card reject does NOT open the feedback dialog when the pending save fails', async () => {
  const openFeedbackDialog = vi.fn();
  const flushPendingTaskSave = vi.fn().mockRejectedValue(new Error('save failed'));
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    openFeedbackDialog,
    flushPendingTaskSave,
    hasPendingTaskSaveFlush: () => true,
  });

  fireEvent.click(screen.getByRole('button', { name: /Reject task #KB-TASK/i }));
  await waitFor(() => {
    expect(flushPendingTaskSave).toHaveBeenCalled();
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(openFeedbackDialog).not.toHaveBeenCalled();
});

test('Reject on TaskCard in a checkpoint stage opens the feedback dialog', () => {
  const openFeedbackDialog = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    openFeedbackDialog,
  });

  fireEvent.click(screen.getByRole('button', { name: /Reject task #KB-TASK/i }));
  expect(openFeedbackDialog).toHaveBeenCalledWith(tasks[1]);
});

test('drag and drop moves a task to the dropped stage', () => {
  const moveTask = vi.fn();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    moveTask,
  });

  const column = screen.getByText('Idea').closest('section');
  fireEvent.drop(column, {
    dataTransfer: {
      getData: (type) => (type === 'application/kainbain-task' ? 'task-2' : null),
    },
  });

  expect(moveTask).toHaveBeenCalledWith('proj-1', 'task-2', '1');
});

test('human checkpoint stage cards do NOT render Run Stage button (#19)', () => {
  const humanStage = [{ id: 'review-1', name: 'Review Plan', type: 'human' }];
  const humanTask = [
    {
      id: 'task-h1',
      goal: 'Approve Architecture',
      currentStageId: 'review-1',
      status: 'waiting_human',
    },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages: humanStage,
    tasks: humanTask,
  });

  const reviewCol = screen.getByText('Review Plan').closest('section');
  expect(
    within(reviewCol).queryByRole('button', { name: /Run stage for task/i }),
  ).not.toBeInTheDocument();
  expect(within(reviewCol).getByRole('button', { name: /Approve task/i })).toBeInTheDocument();
  expect(within(reviewCol).getByRole('button', { name: /Reject task/i })).toBeInTheDocument();
});

test('checkpoint approval from the canvas keeps the card loading until the backend responds', async () => {
  let resolveAdvance;
  const advanceTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveAdvance = resolve;
      }),
  );
  // Stage '2' is the last pipeline stage and human, so approving completes.
  const humanTasks = [
    { id: 'task-2', goal: 'Review API spec', currentStageId: '2', status: 'waiting_human' },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: humanTasks,
    activeProjectId: 'proj-1',
    advanceTask,
  });

  const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-TASK and complete' });
  expect(approveBtn).toHaveTextContent('✓ Approve & Complete');
  fireEvent.click(approveBtn);
  fireEvent.click(approveBtn); // fast second click while the backend is responding

  expect(advanceTask).toHaveBeenCalledTimes(1);
  expect(approveBtn).toBeDisabled();
  expect(screen.getByText('Completing...')).toBeInTheDocument();

  await act(async () => {
    resolveAdvance({});
  });
  await waitFor(() => {
    expect(approveBtn).not.toBeDisabled();
  });
});

test('canvas card on a mid-pipeline checkpoint keeps the approve-and-advance wording', async () => {
  const advanceTask = vi.fn().mockResolvedValue({});
  const midStages = [
    { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' },
    { id: '2', name: 'Review', type: 'human', prompt: 'Human review.' },
    { id: '3', name: 'Merge', type: 'merge', prompt: 'Merge to main.' },
  ];
  const humanTasks = [
    { id: 'task-2', goal: 'Review API spec', currentStageId: '2', status: 'waiting_human' },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages: midStages,
    tasks: humanTasks,
    activeProjectId: 'proj-1',
    advanceTask,
  });

  const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-TASK' });
  expect(approveBtn).toHaveTextContent('✓ Approve');
  expect(screen.queryByText('✓ Approve & Complete')).not.toBeInTheDocument();
  fireEvent.click(approveBtn);
  await waitFor(() => {
    expect(advanceTask).toHaveBeenCalledWith('proj-1', 'task-2');
  });
});

test('task parked at a deleted stage renders in the Unknown-stage bucket instead of vanishing', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [
      { id: 'task-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
      { id: 'task-orphan', goal: 'Cleanup markdown files', currentStageId: 'stage-deleted', status: 'in_stage' },
    ],
    activeProjectId: 'proj-1',
  });
  // … while the orphaned task is fail-visible in its own bucket.
  const bucket = screen.getByTestId('stage-col-orphan');
  expect(screen.getByTestId('orphan-count-badge')).toHaveTextContent('1');
  expect(within(bucket).getByText('Cleanup markdown files')).toBeInTheDocument();
  // Matched task stays out of the bucket …
  expect(within(bucket).queryByText('Build login page')).not.toBeInTheDocument();
  // … and still renders somewhere on the board.
  expect(screen.getByText('Build login page')).toBeInTheDocument();
});

test('no Unknown-stage bucket renders when every task resolves to a live stage', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [
      { id: 'task-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
    ],
    activeProjectId: 'proj-1',
  });
  expect(screen.queryByTestId('stage-col-orphan')).not.toBeInTheDocument();
});
