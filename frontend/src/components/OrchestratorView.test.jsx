import { beforeEach, expect, test, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../testUtils';
import { OrchestratorView } from './OrchestratorView';
import '@testing-library/jest-dom';

/***
 * MARK: api mock
 * @description Keeps the orchestrator tree deterministic in unit tests: the
 *   slide-over inspector fetches task images over the network, which would
 *   otherwise resolve after the test file tears down and trip vitest's
 *   "Closing rpc while onUserConsoleLog was pending" unhandled error under
 *   full-suite parallelism. Other api exports stay real.
 ***/
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      listTaskImages: vi.fn().mockResolvedValue({ images: [] }),
      uploadTaskImage: vi.fn(),
      deleteTaskImage: vi.fn(),
    },
  };
});

/**
 * MARK: OrchestratorView tests
 * @description Verifies the unified master Kanban orchestrator view composes
 * the workflow canvas, now-playing control bar, and slide-over task inspector.
 */
const stages = [
  { id: '1', name: 'Idea', type: 'agent' },
  { id: '2', name: 'Review Plan', type: 'human' },
  { id: '3', name: 'In Progress', type: 'agent' },
];

const tasks = [
  {
    id: 'task-1',
    goal: 'Build Auth API',
    title: 'Build Auth API',
    currentStageId: '1',
    status: 'in_stage',
  },
];

beforeEach(() => {
  window.localStorage.clear();
});

function baseContext(overrides = {}) {
  return {
    activeProjectId: 'proj-1',
    stages,
    currentStageId: '1',
    tasks,
    workflows: [],
    isAgentRunning: false,
    computeRunning: false,
    // Resolve the inspector's reports fetch inside the test so its setState
    // settles before teardown, never as a late update after the file ends
    // (late updates spam the worker RPC and trip vitest's
    // "Closing rpc while onUserConsoleLog was pending" teardown error).
    getTaskReports: vi.fn().mockResolvedValue({ taskId: 'task-1', reports: [] }),
    ...overrides,
  };
}

test('renders the unified orchestrator canvas and now-playing control bar', async () => {
  const ctx = baseContext();
  const { unmount } = renderWithKainBain(<OrchestratorView />, ctx);

  // Pipeline search & filter
  expect(screen.getByPlaceholderText(/Search tasks/i)).toBeInTheDocument();

  // Workflow canvas stage columns
  expect(screen.getAllByText('Idea').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Review Plan').length).toBeGreaterThan(0);

  // In-place add task buttons
  expect(screen.getAllByText('Add Task').length).toBeGreaterThan(0);

  // Now Playing bar
  expect(screen.getByText('Active Task', { exact: true })).toBeInTheDocument();

  // Settle any pending inspector-adjacent microtasks before unmount.
  await waitFor(() => expect(ctx.getTaskReports).not.toHaveBeenCalled());
  unmount();
});

test('renders slide-over task inspector when a task is selected', async () => {
  const ctx = baseContext({ selectedTask: tasks[0] });
  const { unmount } = renderWithKainBain(<OrchestratorView />, ctx);

  // Task inspector is rendered; the old task's goal opens in preview.
  expect(screen.getByRole('complementary', { name: 'Task Inspector' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('Build Auth API');
  expect(screen.getByRole('button', { name: 'Close Task Inspector' })).toBeInTheDocument();

  // Drain the inspector's async reports fetch inside act.
  await waitFor(() => expect(ctx.getTaskReports).toHaveBeenCalled());
  unmount();
});

test('does not render the right side quick task / workflow execution rail', async () => {
  const ctx = baseContext();
  const { unmount } = renderWithKainBain(<OrchestratorView />, ctx);

  expect(screen.queryByText('Quick Task')).not.toBeInTheDocument();
  expect(screen.queryByText('Workflow Execution')).not.toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Task Submission' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Task Submission')).not.toBeInTheDocument();

  await waitFor(() => expect(ctx.getTaskReports).not.toHaveBeenCalled());
  unmount();
});

/***
 * MARK: footer-overlap composition tests
 * @description OrchestratorView must forward its Now Playing footer visibility
 *   to the task inspector so the inspector ends above the fixed footer exactly
 *   like the canvas column and the Configure drawer do.
 ***/
test('task inspector reserves the Now Playing footer height when the footer is shown', async () => {
  const ctx = baseContext({ selectedTask: tasks[0] });
  const { unmount } = renderWithKainBain(<OrchestratorView />, ctx);

  const aside = screen.getByRole('complementary', { name: 'Task Inspector' });
  expect(aside.className).toContain('bottom-[72px]');
  expect(aside.className).toContain('h-[calc(100%-72px)]');
  expect(aside.className).not.toContain('h-full');

  await waitFor(() => expect(ctx.getTaskReports).toHaveBeenCalled());
  unmount();
});

test('task inspector fills full height when the Now Playing footer is disabled', async () => {
  const ctx = baseContext({
    selectedTask: tasks[0],
    uiPreferences: { showNowPlayingBar: false },
  });
  const { unmount } = renderWithKainBain(<OrchestratorView />, ctx);

  const aside = screen.getByRole('complementary', { name: 'Task Inspector' });
  expect(aside.className).toContain('h-full');
  expect(aside.className).not.toContain('bottom-[72px]');
  expect(aside.className).not.toContain('h-[calc(100%-72px)]');

  // The Now Playing footer itself is gone in this mode, so there is nothing
  // left to reserve space for.
  expect(screen.queryByText('Active Task', { exact: true })).not.toBeInTheDocument();

  await waitFor(() => expect(ctx.getTaskReports).toHaveBeenCalled());
  unmount();
});
