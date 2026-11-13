import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas column filter tests
 * @description Integration tests for the `!` column-scoping filters (`!running`,
 *   `!tasked`): they type into the unified search bar, commit to amber chips,
 *   and hide board columns without a matching task — omitted outright, never
 *   behind a collapsed rail. An idle engine (or any intersection-empty board)
 *   renders the "No columns match the active filters" empty state with a
 *   clear CTA, task-level `!failed` still filters tasks without hiding
 *   columns, and the mobile tab strip parks on the surviving columns.
 ***/

const columnStages = [
  { id: 's1', name: 'Idea', type: 'agent' },
  { id: 's2', name: 'Build', type: 'agent' },
  { id: 's3', name: 'Review', type: 'human' },
];

const columnTasks = [
  { id: 't1', goal: 'Idea work item', currentStageId: 's1', status: 'in_stage' },
  { id: 't2', goal: 'Build work item', currentStageId: 's2', status: 'running_agent' },
];

const sectionFor = (container, id) =>
  container.querySelector(`section[data-stage-id="${id}"]`);

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  // Hermetic HTTP boundary: useModelCatalog fetches /compute/models on mount.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(
      JSON.stringify({ models: [], harnesses: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

function renderBoard(overrides = {}) {
  return renderWithKainBain(<WorkflowCanvas />, {
    stages: columnStages,
    tasks: columnTasks,
    activeProjectId: 'proj-1',
    ...overrides,
  });
}

/***
 * MARK: typeColumnQuery
 * @description Types a full query into the unified search bar.
 ***/
function typeColumnQuery(value) {
  fireEvent.change(screen.getByLabelText('Search tasks'), {
    target: { value },
  });
}

test('!tasked shows only columns with tasks and omits the rest outright', () => {
  const { container } = renderBoard();
  typeColumnQuery('!tasked');

  expect(screen.getByRole('button', { name: 'Remove filter tasked' })).toBeInTheDocument();
  expect(sectionFor(container, 's1')).toBeInTheDocument();
  expect(sectionFor(container, 's2')).toBeInTheDocument();
  expect(sectionFor(container, 's3')).not.toBeInTheDocument();
  // Column-hidden stages vanish — they never collapse behind a slim bar.
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
  // Tasks inside the surviving columns are untouched.
  expect(screen.getByText('Idea work item')).toBeInTheDocument();
  expect(screen.getByText('Build work item')).toBeInTheDocument();
});

test('!running shows only the column holding the engine owner', () => {
  const { container } = renderBoard({
    engineState: { status: 'running', activeTaskId: 't2' },
    isAgentRunning: true,
  });
  typeColumnQuery('!running');

  expect(screen.getByRole('button', { name: 'Remove filter running' })).toBeInTheDocument();
  expect(sectionFor(container, 's1')).not.toBeInTheDocument();
  expect(sectionFor(container, 's2')).toBeInTheDocument();
  expect(sectionFor(container, 's3')).not.toBeInTheDocument();
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
  // The surviving column shows only the running task.
  expect(screen.queryByText('Idea work item')).not.toBeInTheDocument();
  expect(screen.getByText('Build work item')).toBeInTheDocument();
});

test('!running ignores stale running_* labels without engine ownership', () => {
  // t2 carries a running_agent label but the engine runs nothing: without an
  // owner every column hides and the empty state renders instead of a stale
  // column.
  renderBoard({
    engineState: { status: 'running', activeTaskId: 't-gone' },
    isAgentRunning: true,
  });
  typeColumnQuery('!running');
  expect(screen.getByText('No columns match the active filters')).toBeInTheDocument();
});

test('an idle engine renders the column empty state with a restoring clear CTA', () => {
  const { container } = renderBoard({
    engineState: { status: 'idle', activeTaskId: null },
    isAgentRunning: false,
  });
  typeColumnQuery('!running');

  expect(screen.getByText('No columns match the active filters')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear column filters' }));
  for (const stage of columnStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
  expect(screen.queryByRole('button', { name: 'Remove filter running' })).not.toBeInTheDocument();
});

test('clearing the column empty state keeps free text and other ! filters', () => {
  renderBoard({
    engineState: { status: 'idle', activeTaskId: null },
    isAgentRunning: false,
  });
  typeColumnQuery('Build !failed !running');
  expect(screen.getByText('No columns match the active filters')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Clear column filters' }));
  expect(screen.getByLabelText('Search tasks')).toHaveValue('Build');
  expect(screen.getByRole('button', { name: 'Remove filter failed' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remove filter running' })).not.toBeInTheDocument();
});

test('#tag and !running intersect instead of piling rails', () => {
  const { container } = renderBoard({
    stages: [
      { id: 's1', name: 'Idea', type: 'agent', tags: ['PO'] },
      { id: 's2', name: 'Build', type: 'agent', tags: ['Dev'] },
    ],
    engineState: { status: 'running', activeTaskId: 't2' },
    isAgentRunning: true,
  });
  // !running scopes to s2, #Dev matches s2: one column, no collapsed bar.
  typeColumnQuery('#Dev !running');
  expect(sectionFor(container, 's1')).not.toBeInTheDocument();
  expect(sectionFor(container, 's2')).toBeInTheDocument();
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
});

test('a #tag × ! mix emptying the intersection shows the column empty state', () => {
  renderBoard({
    stages: [
      { id: 's1', name: 'Idea', type: 'agent', tags: ['PO'] },
      { id: 's2', name: 'Build', type: 'agent', tags: ['Dev'] },
    ],
    engineState: { status: 'running', activeTaskId: 't1' },
    isAgentRunning: true,
  });
  // #Dev matches s2 but !running scopes to s1: nothing survives, yet the tag
  // dimension alone matches — so this is the column message, never silent.
  typeColumnQuery('#Dev !running');
  expect(screen.queryByText('No stages match the selected tags')).not.toBeInTheDocument();
  expect(screen.getByText('No columns match the active filters')).toBeInTheDocument();
});

test('the tag empty state still wins when tags hide every stage', () => {
  renderBoard();
  typeColumnQuery('#Nope !tasked');
  expect(screen.getByText('No stages match the selected tags')).toBeInTheDocument();
  expect(screen.queryByText('No columns match the active filters')).not.toBeInTheDocument();

  // Clearing tags reveals the !tasked-scoped board underneath.
  fireEvent.click(screen.getByRole('button', { name: 'Clear tag filter' }));
  expect(screen.getByRole('button', { name: 'Remove filter tasked' })).toBeInTheDocument();
  expect(screen.queryByText('No stages match the selected tags')).not.toBeInTheDocument();
});

test('task-level !failed still filters tasks without hiding any column', () => {
  const { container } = renderBoard({
    tasks: [
      { id: 't1', goal: 'Idea work item', currentStageId: 's1', status: 'failed' },
      { id: 't2', goal: 'Build work item', currentStageId: 's2', status: 'in_stage' },
    ],
  });
  typeColumnQuery('!failed');

  for (const stage of columnStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
  expect(screen.getByText('Idea work item')).toBeInTheDocument();
  expect(screen.queryByText('Build work item')).not.toBeInTheDocument();
});

test('mobile tab strip lists surviving columns plus a column-scoped hidden tab', () => {
  renderBoard();
  typeColumnQuery('!tasked');

  const tabs = screen.getAllByRole('tab');
  // 2 surviving columns + 1 hidden summary tab.
  expect(tabs).toHaveLength(3);
  expect(screen.getByText('1. Idea')).toBeInTheDocument();
  expect(screen.getByText('2. Build')).toBeInTheDocument();
  expect(screen.queryByText('3. Review')).not.toBeInTheDocument();
  expect(
    screen.getByRole('tab', { name: 'Show 1 hidden stages (clears the column filters)' }),
  ).toBeInTheDocument();
});

test('mobile hidden tab clears column filters but keeps free text', () => {
  const { container } = renderBoard();
  typeColumnQuery('work !tasked');
  fireEvent.click(
    screen.getByRole('tab', { name: 'Show 1 hidden stages (clears the column filters)' }),
  );
  expect(screen.getByLabelText('Search tasks')).toHaveValue('work');
  for (const stage of columnStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
});

test('removing the ! chip restores every column', () => {
  const { container } = renderBoard({
    engineState: { status: 'running', activeTaskId: 't2' },
    isAgentRunning: true,
  });
  typeColumnQuery('!running');
  expect(sectionFor(container, 's1')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove filter running' }));
  for (const stage of columnStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
});
