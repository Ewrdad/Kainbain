import { expect, test, vi } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { BlockedByEditor } from './BlockedByEditor';
import { TaskCard } from './TaskCard';
import '@testing-library/jest-dom';

/***
 * MARK: BlockedByEditor tests
 * @description Verifies the dependency editor: the searchable Blocked-by
 *   multi-select offers only other active (non-complete) tasks, filters by
 *   title or kb-number, PATCHes the selection, clears, removes chips, and
 *   surfaces backend rejections such as dependency cycles.
 ***/

const blocker = { id: 'task-a', title: 'Build API', status: 'in_stage' };
const selfTask = { id: 'task-b', title: 'Build UI', status: 'in_stage', blockedBy: [] };

function renderEditor(task, overrides = {}) {
  return renderWithKainBain(<BlockedByEditor task={task} />, {
    tasks: [blocker, { ...selfTask, ...task }],
    activeProjectId: 'proj-1',
    updateTask: vi.fn().mockResolvedValue({}),
    ...overrides,
  });
}

function openDropdown() {
  fireEvent.click(screen.getByRole('button', { name: 'Prerequisite tasks' }));
  return screen.getByRole('listbox');
}

function searchFor(text) {
  fireEvent.change(screen.getByLabelText('Prerequisite tasks search'), {
    target: { value: text },
  });
}

test('offers active candidates in the dropdown and excludes the task itself', () => {
  renderEditor(selfTask);
  const listbox = openDropdown();
  expect(within(listbox).getByRole('option', { name: 'Build API' })).toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Build UI' })).not.toBeInTheDocument();
  // Live status is shown next to the candidate
  expect(within(listbox).getByText(/in_stage/)).toBeInTheDocument();
});

test('excludes completed and legacy done tasks from options', () => {
  const done = { id: 'task-done', title: 'Legacy work', status: 'done' };
  const completed = { id: 'task-old', title: 'Old work', status: 'completed' };
  renderEditor(selfTask, { tasks: [blocker, selfTask, done, completed] });
  const listbox = openDropdown();
  expect(within(listbox).getByRole('option', { name: 'Build API' })).toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Legacy work' })).not.toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Old work' })).not.toBeInTheDocument();
});

test('saving PATCHes the selected blockers', async () => {
  const updateTask = vi.fn().mockResolvedValue({});
  renderEditor(selfTask, { updateTask });
  openDropdown();
  fireEvent.click(screen.getByRole('option', { name: 'Build API' }));
  fireEvent.click(screen.getByRole('button', { name: /Save dependencies/i }));
  await waitFor(() => {
    expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-b', { blockedBy: ['task-a'] });
  });
});

test('search narrows options by title', () => {
  const other = { id: 'task-c', title: 'Write docs', status: 'queued' };
  renderEditor(selfTask, { tasks: [blocker, selfTask, other] });
  openDropdown();
  searchFor('docs');
  const listbox = screen.getByRole('listbox');
  expect(within(listbox).getByRole('option', { name: 'Write docs' })).toBeInTheDocument();
  expect(within(listbox).queryByRole('option', { name: 'Build API' })).not.toBeInTheDocument();
});

test('search matches kb-number with or without the prefix', () => {
  const kbTask = {
    id: '73c4560d-1417-4fe1-9abc-def012345678',
    title: 'Migrate database',
    status: 'in_stage',
  };
  renderEditor(selfTask, { tasks: [blocker, selfTask, kbTask] });

  openDropdown();
  searchFor('73c4');
  expect(
    within(screen.getByRole('listbox')).getByRole('option', { name: 'Migrate database' }),
  ).toBeInTheDocument();

  searchFor('#KB-73C4');
  expect(
    within(screen.getByRole('listbox')).getByRole('option', { name: 'Migrate database' }),
  ).toBeInTheDocument();

  searchFor('#KB-9999');
  expect(screen.getByText('No tasks match your search.')).toBeInTheDocument();
});

test('surfaces a backend cycle rejection inline', async () => {
  const updateTask = vi
    .fn()
    .mockRejectedValue(new Error('blockedBy would create a dependency cycle'));
  renderEditor(selfTask, { updateTask });
  openDropdown();
  fireEvent.click(screen.getByRole('option', { name: 'Build API' }));
  fireEvent.click(screen.getByRole('button', { name: /Save dependencies/i }));
  await waitFor(() => {
    expect(screen.getByRole('alert')).toHaveTextContent('dependency cycle');
  });
});

test('clearing removes every blocker', async () => {
  const updateTask = vi.fn().mockResolvedValue({});
  renderEditor({ ...selfTask, blockedBy: ['task-a'] }, { updateTask });
  fireEvent.click(screen.getByRole('button', { name: /Clear/i }));
  await waitFor(() => {
    expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-b', { blockedBy: [] });
  });
});

test('removing a selected chip deselects the blocker', async () => {
  const updateTask = vi.fn().mockResolvedValue({});
  renderEditor({ ...selfTask, blockedBy: ['task-a'] }, { updateTask });
  fireEvent.click(screen.getByRole('button', { name: 'Remove Build API' }));
  fireEvent.click(screen.getByRole('button', { name: /Save dependencies/i }));
  await waitFor(() => {
    expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-b', { blockedBy: [] });
  });
});

test('shows an empty state when no other active tasks exist', () => {
  renderEditor(selfTask, { tasks: [selfTask] });
  expect(screen.getByText('No other active tasks to wait on.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Prerequisite tasks' })).not.toBeInTheDocument();
});

test('card prefers the server blocked flag over local derivation', () => {
  renderWithKainBain(
    <TaskCard
      task={{
        id: 'task-b',
        goal: 'Build UI',
        blockedBy: ['task-a'],
        isBlocked: true,
        blockers: ['task-a'],
      }}
      stageName="Idea"
      role="agent"
    />,
    { tasks: [], uiPreferences: { taskCardDensity: 'default' } },
  );
  expect(screen.getAllByLabelText('Blocked by #KB-TASK').length).toBeGreaterThan(0);
  const runButton = screen.getByRole('button', { name: /Run stage for task/i });
  expect(runButton).toBeDisabled();
  expect(runButton).toHaveTextContent('Blocked by dependencies');
});

/***
 * MARK: BlockedByEditor heading level
 * @description The section heading is an h2, so it never skips a level under
 *   the page's h1 (WCAG 1.3.1/2.4.10; axe heading-order).
 ***/
test('uses an h2 section heading (no level skip under the page h1)', () => {
  renderEditor(selfTask);
  expect(screen.getByRole('heading', { level: 2, name: 'Blocked by' })).toBeInTheDocument();
});
