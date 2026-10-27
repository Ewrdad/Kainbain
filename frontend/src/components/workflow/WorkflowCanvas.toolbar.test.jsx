import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { DEFAULT_UI_PREFERENCES } from '../../context/useUiPreferences';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

// Hermetic HTTP boundary: every canvas render fires `useModelCatalog` →
// `api.getModels`. Unmocked, happy-dom performs a REAL fetch that may still
// be in flight at teardown, printing an AbortError and racing the run (the
// same trap WorkflowCanvas.mobile.test.jsx stubs around). An empty catalogue
// resolves immediately; these suites assert board chrome only, never model
// data.
vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...(actual.api || {}),
      getModels: vi.fn().mockResolvedValue({ models: [], harnesses: [] }),
    },
  };
});

/***
 * MARK: WorkflowCanvas.toolbar tests
 * @description Board chrome cases owned by `CanvasToolbar`: search input, status pills, completed toggle + preferences, workflow selector pill and persisted board-filter state. Rendered through `WorkflowCanvas` (integration).
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

test('search input filters tasks across columns', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  const searchInput = screen.getByRole('combobox', { name: 'Search tasks' });
  fireEvent.change(searchInput, { target: { value: 'login' } });

  expect(screen.getByText('Build login page')).toBeInTheDocument();
  expect(screen.queryByText('Review API spec')).not.toBeInTheDocument();
});

test('status filter pills filter by All, Failed, and Human only (#16)', () => {
  const filterStages = [
    { id: '1', name: 'Idea', type: 'agent' },
    { id: '2', name: 'Review', type: 'human' },
    { id: '3', name: 'Deploy', type: 'deploy' },
  ];
  const filterTasks = [
    {
      id: 'task-1',
      title: 'Agent Task',
      goal: 'Agent Task',
      currentStageId: '1',
      status: 'in_stage',
    },
    {
      id: 'task-2',
      title: 'Human Checkpoint Task',
      goal: 'Human Checkpoint Task',
      currentStageId: '2',
      status: 'in_stage',
    },
    {
      id: 'task-3',
      title: 'Failed Task with Error',
      goal: 'Failed Task with Error',
      currentStageId: '1',
      status: 'failed',
      failureReason: 'Syntax error',
    },
    {
      id: 'task-4',
      title: 'Waiting Human Task',
      goal: 'Waiting Human Task',
      currentStageId: '3',
      status: 'waiting_human',
    },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages: filterStages,
    tasks: filterTasks,
    activeProjectId: 'proj-1',
  });

  // Default: 'All'
  expect(screen.getByText('Agent Task')).toBeInTheDocument();
  expect(screen.getByText('Human Checkpoint Task')).toBeInTheDocument();
  expect(screen.getByText('Failed Task with Error')).toBeInTheDocument();
  expect(screen.getByText('Waiting Human Task')).toBeInTheDocument();

  const searchInput = screen.getByRole('combobox', { name: 'Search tasks' });

  // Apply !failed
  fireEvent.change(searchInput, { target: { value: '!failed' } });
  expect(screen.getByText('Failed Task with Error')).toBeInTheDocument();
  expect(screen.queryByText('Agent Task')).not.toBeInTheDocument();
  expect(screen.queryByText('Human Checkpoint Task')).not.toBeInTheDocument();
  expect(screen.queryByText('Waiting Human Task')).not.toBeInTheDocument();

  // Clear, then apply !human
  fireEvent.click(screen.getByLabelText('Clear search'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Search tasks' }), { target: { value: '!human' } });
  expect(screen.getByText('Human Checkpoint Task')).toBeInTheDocument();
  expect(screen.getByText('Waiting Human Task')).toBeInTheDocument();
  expect(screen.queryByText('Agent Task')).not.toBeInTheDocument();
  expect(screen.queryByText('Failed Task with Error')).not.toBeInTheDocument();

  // Clear filters (All)
  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(screen.getByText('Agent Task')).toBeInTheDocument();
  expect(screen.getByText('Human Checkpoint Task')).toBeInTheDocument();
  expect(screen.getByText('Failed Task with Error')).toBeInTheDocument();
  expect(screen.getByText('Waiting Human Task')).toBeInTheDocument();
});

test('shows completed tasks when checkbox is toggled', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.queryByText('Old task')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/Show Completed/i));
  expect(screen.getByText('Old task')).toBeInTheDocument();
});

test('toggling Show Completed refetches tasks with the matching scope', () => {
  const retryTasks = vi.fn(() => Promise.resolve([]));
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    retryTasks,
  });

  fireEvent.click(screen.getByLabelText(/Show Completed/i));
  expect(retryTasks).toHaveBeenCalledWith('proj-1', { includeCompleted: true });
  fireEvent.click(screen.getByLabelText(/Show Completed/i));
  expect(retryTasks).toHaveBeenCalledWith('proj-1', { includeCompleted: false });
});

test('renders workflow selector dropdown pill and switches active workflow', () => {
  const switchWorkflow = vi.fn();
  const projectWorkflows = [
    { id: 'wf-1', name: 'Main Pipeline', isDefault: true },
    { id: 'wf-2', name: 'Hotfix Pipeline', isDefault: false },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: [],
    projectWorkflows,
    activeWorkflowId: 'wf-1',
    switchWorkflow,
    activeProjectId: 'proj-1',
  });

  const switcherBtn = screen.getByRole('button', { name: /Select pipeline workflow/i });
  expect(switcherBtn).toBeInTheDocument();
  expect(screen.getByText('Main Pipeline')).toBeInTheDocument();

  fireEvent.click(switcherBtn);
  const hotfixItem = screen.getByRole('menuitem', { name: /Hotfix Pipeline/i });
  fireEvent.click(hotfixItem);
  expect(switchWorkflow).toHaveBeenCalledWith('proj-1', 'wf-2');
});

test('restores Show Completed from localStorage on mount', () => {
  localStorage.setItem('kainbain:showCompleted', 'true');

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // Stored choice wins over the default preference: completed task visible on mount.
  expect(screen.getByText('Old task')).toBeInTheDocument();
  expect(screen.getByLabelText(/Show Completed/i)).toBeChecked();
});

test('persists Show Completed state to localStorage and restores choice', () => {
  const { unmount } = renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // Default: completed tasks hidden and nothing persisted yet.
  expect(screen.queryByText('Old task')).not.toBeInTheDocument();
  expect(localStorage.getItem('kainbain:showCompleted')).toBeNull();

  // Toggle on: choice is written to storage immediately.
  fireEvent.click(screen.getByLabelText(/Show Completed/i));
  expect(localStorage.getItem('kainbain:showCompleted')).toBe('true');
  expect(screen.getByText('Old task')).toBeInTheDocument();

  // Fresh mount (simulates reload): the last choice is restored.
  unmount();
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });
  expect(screen.getByText('Old task')).toBeInTheDocument();

  // Toggling back off persists the OFF state too.
  fireEvent.click(screen.getByLabelText(/Show Completed/i));
  expect(localStorage.getItem('kainbain:showCompleted')).toBe('false');
  expect(screen.queryByText('Old task')).not.toBeInTheDocument();
});

test('falls back to defaultShowCompletedTasks preference when nothing stored', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    uiPreferences: {
      ...DEFAULT_UI_PREFERENCES,
      defaultShowCompletedTasks: true,
    },
  });

  // The user's deliberate Settings default is honored when nothing is stored (R3).
  expect(screen.getByText('Old task')).toBeInTheDocument();
  expect(screen.getByLabelText(/Show Completed/i)).toBeChecked();
});

test('defaults Show Completed to OFF with no stored state and default preference', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  // R1 regression guard: fresh visitor / cleared storage sees the toggle unchecked.
  expect(screen.getByLabelText(/Show Completed/i)).not.toBeChecked();
  expect(screen.queryByText('Old task')).not.toBeInTheDocument();
});

test('board search and status filter restore from localStorage after refresh', () => {
  localStorage.setItem('kainbain:board:search', JSON.stringify('login !failed'));
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByRole('combobox', { name: 'Search tasks' })).toHaveValue('login');
  // failed filter chip present
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
});

test('board system filter choice is written to localStorage via search', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  fireEvent.change(screen.getByRole('combobox', { name: 'Search tasks' }), { target: { value: '!human' } });
  expect(screen.getByRole('button', { name: 'Remove filter human' })).toBeInTheDocument();
});

test('board search text is flushed to localStorage on unmount (refresh)', () => {
  const { unmount } = renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  fireEvent.change(screen.getByRole('combobox', { name: 'Search tasks' }), {
    target: { value: 'api spec' },
  });
  unmount();
  expect(localStorage.getItem('kainbain:board:search')).toBe(
    JSON.stringify('api spec'),
  );
});

test('corrupt board filter values fall back to defaults', () => {
  localStorage.setItem('kainbain:board:search', 'not-json{{{');
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByRole('combobox', { name: 'Search tasks' })).toHaveValue('');
});
