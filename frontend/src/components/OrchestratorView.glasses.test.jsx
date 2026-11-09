import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../testUtils';
import { OrchestratorView } from './OrchestratorView';
import { setGlassesViewportOverride } from './util/viewport';
import '@testing-library/jest-dom';

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

/***
 * MARK: OrchestratorView glasses tests
 * @description Guards the Meta Ray-Ban branch of the orchestrator: a
 *   glasses-shaped viewport swaps the canvas for the glasses task list
 *   and keeps the slide-over inspector closed, while every other viewport
 *   renders the canvas and inspector exactly as before.
 ***/

const stages = [
  { id: '1', name: 'Idea', type: 'agent' },
  { id: '2', name: 'Review Plan', type: 'human' },
];

const tasks = [
  {
    id: 'task-1',
    goal: 'Build Auth API',
    title: 'Build Auth API',
    currentStageId: '2',
    status: 'waiting_human',
  },
  {
    id: 'task-2',
    goal: 'Migrate billing',
    title: 'Migrate billing',
    currentStageId: '1',
    status: 'in_stage',
  },
];

beforeEach(() => {
  window.localStorage.clear();
  setGlassesViewportOverride(null);
});

afterEach(() => {
  setGlassesViewportOverride(null);
});

function baseContext(overrides = {}) {
  const setView = vi.fn();
  const setSelectedTask = vi.fn();
  const rendered = renderWithKainBain(<OrchestratorView />, {
    activeProjectId: 'proj-1',
    stages,
    currentStageId: '1',
    tasks,
    workflows: [],
    isAgentRunning: false,
    engineState: { status: 'idle', activeTaskId: null },
    setView,
    setSelectedTask,
    refreshTasks: vi.fn(),
    getTaskReports: vi.fn().mockResolvedValue({ taskId: 'task-1', reports: [] }),
    ...overrides,
  });
  return { setView, setSelectedTask, unmount: rendered.unmount };
}

test('glasses viewport swaps the canvas for the glasses task list', () => {
  setGlassesViewportOverride(true);
  baseContext();

  expect(screen.getByTestId('glasses-task-list')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/Search tasks/i)).not.toBeInTheDocument();
  expect(screen.queryByText('Active Task', { exact: true })).not.toBeInTheDocument();
});

test('glasses viewport keeps the slide-over inspector closed', () => {
  setGlassesViewportOverride(true);
  baseContext({ selectedTask: tasks[0] });

  expect(screen.getByTestId('glasses-task-list')).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Task Inspector' })).not.toBeInTheDocument();
});

test('opening a glasses task selects it and routes to quick review', () => {
  setGlassesViewportOverride(true);
  const { setView, setSelectedTask } = baseContext();

  fireEvent.click(screen.getByRole('button', { name: 'View Build Auth API for review' }));
  expect(setSelectedTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
  expect(setView).toHaveBeenCalledWith('task-review', { taskId: 'task-1' });
});

test('non-glasses viewport renders exactly as before (parity)', () => {
  setGlassesViewportOverride(false);
  baseContext({ selectedTask: tasks[0] });

  expect(screen.queryByTestId('glasses-task-list')).not.toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Search tasks/i)).toBeInTheDocument();
  expect(screen.getByText('Active Task', { exact: true })).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Task Inspector' })).toBeInTheDocument();
});
