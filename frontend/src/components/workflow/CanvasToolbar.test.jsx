import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { CanvasToolbar } from './CanvasToolbar';
import '@testing-library/jest-dom';

/***
 * MARK: CanvasToolbar tests
 * @description Colocated tests for the extracted board chrome: search input
 *   (which carries the `!` system filters), completed toggle, mobile stage
 *   strip, absence of the removed status pills, hidden-by-workflow notice,
 *   and task-list loading/error banners.
 ***/

const stages = [
  { id: 's-1', name: 'Idea', type: 'agent' },
  { id: 's-2', name: 'Review', type: 'human' },
];

function baseProps(overrides = {}) {
  return {
    projectWorkflows: [],
    activeWorkflow: { id: 'wf-1', name: 'Main' },
    activeWorkflowId: 'wf-1',
    workflowSwitching: false,
    activeProjectId: 'p1',
    switchWorkflow: vi.fn(),
    setView: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    showCompleted: false,
    setShowCompleted: vi.fn(),
    completedCount: 3,
    stages,
    filteredTasks: [],
    tasks: [],
    tasksLoading: false,
    tasksError: null,
    retryTasks: vi.fn(),
    effectiveMobileStageId: 's-1',
    setSelectedMobileStageId: vi.fn(),
    addStageAndSave: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(overrides) {
  return renderWithKainBain(<CanvasToolbar {...baseProps(overrides)} />);
}

test('search input reflects query and clears', () => {
  const setSearchQuery = vi.fn();
  renderToolbar({ searchQuery: 'login', setSearchQuery });
  expect(screen.getByRole('combobox', { name: 'Search tasks' })).toHaveValue('login');
  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(setSearchQuery).toHaveBeenCalledWith('');
});

test('status filter pills are removed (filters live in the search bar)', () => {
  renderToolbar({});
  expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Failed' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Human only' })).not.toBeInTheDocument();
});

test('completed toggle shows count and toggles', () => {
  const setShowCompleted = vi.fn();
  renderToolbar({ setShowCompleted, completedCount: 7 });
  expect(screen.getByText('Show Completed (7)')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Show Completed (7)'));
  expect(setShowCompleted).toHaveBeenCalledWith(true);
});

test('mobile strip lists stages and trailing add-stage pill', () => {
  renderToolbar({
    filteredTasks: [{ id: 'KB-1', currentStageId: 's-1' }],
    effectiveMobileStageId: 's-2',
  });
  const tabs = screen.getAllByRole('tab');
  expect(tabs).toHaveLength(2);
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Add new pipeline stage')).toBeInTheDocument();
});

test('hidden-by-workflow notice is never rendered', () => {
  // The notice was removed entirely (layout flicker, task 04170d74); this
  // guards against it creeping back in. The toolbar takes no hidden-task
  // data any more, so a board whose tasks sit under another workflow just
  // renders empty columns — nothing here may announce them.
  renderToolbar({
    projectWorkflows: [{ id: 'wf-1', name: 'Main' }, { id: 'wf-2', name: 'Other' }],
  });
  expect(screen.queryByLabelText('Tasks hidden by workflow filter')).toBeNull();
  expect(screen.queryByText(/waiting in/i)).toBeNull();
});

test('loading skeleton and error banner with retry', () => {
  const { unmount } = renderToolbar({ stages, tasksLoading: true });
  expect(screen.getByLabelText('Loading tasks')).toBeInTheDocument();
  unmount();

  const retryTasks = vi.fn();
  renderToolbar({ stages, tasksError: new Error('down'), retryTasks });
  expect(screen.getByLabelText('Tasks failed to load')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Retry'));
  expect(retryTasks).toHaveBeenCalledWith('p1');
});
