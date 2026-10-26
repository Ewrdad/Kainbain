import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { CanvasToolbar } from './CanvasToolbar';
import '@testing-library/jest-dom';

/***
 * MARK: CanvasToolbar sort tests
 * @description Verifies the card-order toggle: manual by default, one tap
 * switches to oldest-first and back. Kept in its own file so parallel
 * branches extending CanvasToolbar.test.jsx do not conflict.
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
    completedCount: 0,
    stages,
    filteredTasks: [],
    tasks: [],
    tasksLoading: false,
    tasksError: null,
    retryTasks: vi.fn(),
    effectiveMobileStageId: 's-1',
    setSelectedMobileStageId: vi.fn(),
    addStageAndSave: vi.fn(),
    taskSort: 'manual',
    onTaskSortChange: vi.fn(),
    ...overrides,
  };
}

test('manual order is the default and offers oldest-first', () => {
  const onTaskSortChange = vi.fn();
  renderWithKainBain(<CanvasToolbar {...baseProps({ onTaskSortChange })} />);
  const toggle = screen.getByRole('button', { name: /card order: manual/i });
  expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByText('Manual order')).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(onTaskSortChange).toHaveBeenCalledWith('oldest');
});

test('oldest-first renders pressed and switches back to manual', () => {
  const onTaskSortChange = vi.fn();
  renderWithKainBain(<CanvasToolbar {...baseProps({ taskSort: 'oldest', onTaskSortChange })} />);
  const toggle = screen.getByRole('button', { name: /card order: oldest first/i });
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Oldest first')).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(onTaskSortChange).toHaveBeenCalledWith('manual');
});
