import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas tag filter tests
 * @description Integration tests for the unified search bar: typing `#tag`
 *   collapses non-matching runs of stages into slim bars, the selection
 *   round-trips through the URL query string (shareable view) and renders as
 *   chips, free text filters tasks inside the surviving stages, the match
 *   mode (any/all) changes which stages stay visible, the all-hidden empty
 *   state offers a clear-filter CTA, the collapsed bar expands inline, and
 *   the legacy localStorage tag selection migrates into the query.
 ***/

const taggedStages = [
  { id: 's1', name: 'Idea', type: 'agent', tags: ['PO'] },
  { id: 's2', name: 'Spec', type: 'agent', tags: ['PO'] },
  { id: 's3', name: 'Plan', type: 'human', tags: ['PO'] },
  { id: 's4', name: 'Build', type: 'agent', tags: ['Dev'] },
  { id: 's5', name: 'Test', type: 'ci', tags: ['Dev'] },
  { id: 's6', name: 'Ship', type: 'merge', tags: ['Dev'] },
];

const tasks = [
  { id: 't1', goal: 'PO work item', currentStageId: 's1', status: 'in_stage' },
  { id: 't2', goal: 'Dev work item', currentStageId: 's4', status: 'in_stage' },
];

const sectionFor = (container, id) => container.querySelector(`section[data-stage-id="${id}"]`);

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
  // Hermetic HTTP boundary: useModelCatalog fetches /compute/models on mount.
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [], harnesses: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

function renderBoard(overrides = {}) {
  return renderWithKainBain(<WorkflowCanvas />, {
    stages: taggedStages,
    tasks,
    activeProjectId: 'proj-1',
    ...overrides,
  });
}

/***
 * MARK: typeQuery
 * @description Types a full query into the unified search bar (the merged
 *   interaction that replaces the old tag multi-select dropdown).
 ***/
function typeQuery(value) {
  fireEvent.change(screen.getByLabelText('Search tasks'), {
    target: { value },
  });
}

function typeTag(label) {
  typeQuery(`#${label}`);
}

test('no filter: every stage column renders and no collapsed bars appear', () => {
  const { container } = renderBoard();
  for (const stage of taggedStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
});

test('typing #tag keeps matching stages and collapses the rest into one bar', () => {
  const { container } = renderBoard();
  typeTag('PO');

  // The typed tag renders as a removable chip in the search bar.
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
  // PO stages stay as full columns.
  expect(sectionFor(container, 's1')).toBeInTheDocument();
  expect(sectionFor(container, 's2')).toBeInTheDocument();
  expect(sectionFor(container, 's3')).toBeInTheDocument();
  // The Dev run collapses into a single slim bar.
  const bars = screen.getAllByTestId('collapsed-stage-run');
  expect(bars).toHaveLength(1);
  expect(bars[0]).toHaveAttribute('aria-label', '3 stages hidden by tag filter');
  expect(screen.getByText('3 stages hidden')).toBeInTheDocument();
  // Hidden stage columns are not rendered.
  expect(sectionFor(container, 's4')).not.toBeInTheDocument();
  expect(sectionFor(container, 's6')).not.toBeInTheDocument();
  // Matching columns show their tag chips in the header.
  expect(screen.getByTestId('stage-tag-chips-s1')).toHaveTextContent('PO');
});

test('free text filters tasks inside the tag-visible stages', () => {
  const { container } = renderBoard();
  typeQuery('Dev work #PO');

  // Stages still collapse by tag…
  expect(screen.getAllByTestId('collapsed-stage-run')).toHaveLength(1);
  expect(sectionFor(container, 's4')).not.toBeInTheDocument();
  // …and the text hides the non-matching task in the surviving stages.
  expect(screen.queryByText('PO work item')).not.toBeInTheDocument();
});

test('text matching a hidden-stage task stays hidden', () => {
  renderBoard();
  typeQuery('Dev work #PO');
  expect(screen.queryByText('Dev work item')).not.toBeInTheDocument();
});

test('the selection is written to the URL so the view is shareable', () => {
  renderBoard();
  typeTag('PO');
  expect(window.location.search).toContain('tags=PO');
});

test('a shared URL hydrates the search bar with a chip on load', () => {
  window.history.replaceState(null, '', '/?tags=Dev');
  const { container } = renderBoard();
  expect(screen.getByRole('button', { name: 'Remove tag Dev' })).toBeInTheDocument();
  expect(screen.getByLabelText('Search tasks')).toHaveValue('');
  expect(screen.getAllByTestId('collapsed-stage-run')).toHaveLength(1);
  expect(screen.getByText('3 stages hidden')).toBeInTheDocument();
  expect(sectionFor(container, 's4')).toBeInTheDocument();
  expect(sectionFor(container, 's1')).not.toBeInTheDocument();
});

test('a shared URL with tagMode=all hides stages missing any selected tag', () => {
  window.history.replaceState(null, '', '/?tags=PO,Dev&tagMode=all');
  renderBoard();
  // No stage carries both tags: the empty state offers a clear-filter CTA.
  expect(screen.getByText('No stages match the selected tags')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Clear tag filter' }));
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
  expect(window.location.search).not.toContain('tags=');
});

test('removing the chip restores every column', () => {
  const { container } = renderBoard();
  typeTag('PO');
  expect(screen.getAllByTestId('collapsed-stage-run')).toHaveLength(1);

  // Remove the tag chip in the unified search bar.
  fireEvent.click(screen.getByRole('button', { name: 'Remove tag PO' }));
  for (const stage of taggedStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
  expect(window.location.search).not.toContain('tags=');
});

test('clearing the search wipes text and tags together', () => {
  const { container } = renderBoard();
  typeQuery('PO work #PO');
  expect(screen.getAllByTestId('collapsed-stage-run')).toHaveLength(1);

  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(screen.getByLabelText('Search tasks')).toHaveValue('');
  for (const stage of taggedStages) {
    expect(sectionFor(container, stage.id)).toBeInTheDocument();
  }
  expect(window.location.search).not.toContain('tags=');
});

test('the collapsed bar expands to render the hidden stages inline and collapses again', () => {
  const { container } = renderBoard();
  typeTag('PO');
  expect(sectionFor(container, 's4')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Expand 3 collapsed stages' }));
  expect(sectionFor(container, 's4')).toBeInTheDocument();
  expect(sectionFor(container, 's5')).toBeInTheDocument();
  expect(sectionFor(container, 's6')).toBeInTheDocument();
  // The bar stays as the collapse control.
  expect(screen.getByTestId('collapsed-stage-run')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Collapse 3 hidden stages' }));
  expect(sectionFor(container, 's4')).not.toBeInTheDocument();
});

test('middle runs collapse: matching stages on both sides keep two bars separate', () => {
  renderBoard({
    stages: [
      { id: 'a', name: 'A', type: 'agent', tags: ['Dev'] },
      { id: 'b', name: 'B', type: 'agent' },
      { id: 'c', name: 'C', type: 'agent' },
      { id: 'd', name: 'D', type: 'agent', tags: ['Dev'] },
    ],
  });
  typeTag('Dev');
  const bars = screen.getAllByTestId('collapsed-stage-run');
  // The untagged middle run (B, C) collapses into exactly one bar.
  expect(bars).toHaveLength(1);
  expect(bars[0]).toHaveAttribute('aria-label', '2 stages hidden by tag filter');
});

test('mobile tab strip shows visible stages plus a hidden summary tab', () => {
  renderBoard();
  typeTag('PO');
  const tabs = screen.getAllByRole('tab');
  // 3 visible PO stages + 1 hidden summary tab.
  expect(tabs).toHaveLength(4);
  expect(screen.getByText('1. Idea')).toBeInTheDocument();
  expect(screen.getByText('3. Plan')).toBeInTheDocument();
  expect(screen.queryByText('4. Build')).not.toBeInTheDocument();
  expect(
    screen.getByRole('tab', { name: 'Show 3 hidden stages (clears the tag filter)' }),
  ).toBeInTheDocument();
});

test('mobile hidden summary tab strips tags but keeps free text', () => {
  renderBoard();
  typeQuery('work #PO');
  fireEvent.click(
    screen.getByRole('tab', { name: 'Show 3 hidden stages (clears the tag filter)' }),
  );
  expect(screen.getByLabelText('Search tasks')).toHaveValue('work');
  expect(screen.queryByTestId('collapsed-stage-run')).not.toBeInTheDocument();
});

test('filter persists across remount via the search query when the URL is clean', () => {
  const first = renderBoard();
  typeTag('PO');
  first.unmount();

  // Simulate a fresh visit: URL clean, the persisted query keeps the tag.
  window.history.replaceState(null, '', '/');
  const { container } = renderBoard();
  expect(screen.getAllByTestId('collapsed-stage-run')).toHaveLength(1);
  expect(sectionFor(container, 's1')).toBeInTheDocument();
  expect(sectionFor(container, 's4')).not.toBeInTheDocument();
});

test('legacy localStorage tag selection migrates into the search query', () => {
  window.localStorage.setItem('kainbain:board:stageTagFilter', JSON.stringify(['PO']));
  const { container } = renderBoard();
  expect(screen.getByLabelText('Search tasks')).toHaveValue('');
  expect(screen.getAllByTestId('collapsed-stage-run')).toHaveLength(1);
  expect(sectionFor(container, 's1')).toBeInTheDocument();
  expect(sectionFor(container, 's4')).not.toBeInTheDocument();
  // The legacy key is cleaned up after migration.
  expect(window.localStorage.getItem('kainbain:board:stageTagFilter')).toBeNull();
});

test('migration preserves existing free text in the query', () => {
  window.localStorage.setItem('kainbain:board:stageTagFilter', JSON.stringify(['Dev']));
  window.localStorage.setItem('kainbain:board:search', JSON.stringify('auth'));
  renderBoard();
  expect(screen.getByLabelText('Search tasks')).toHaveValue('auth');
});

test('URL tags win over the legacy localStorage selection', () => {
  window.history.replaceState(null, '', '/?tags=Dev');
  window.localStorage.setItem('kainbain:board:stageTagFilter', JSON.stringify(['PO']));
  const { container } = renderBoard();
  expect(screen.getByLabelText('Search tasks')).toHaveValue('');
  expect(sectionFor(container, 's4')).toBeInTheDocument();
  expect(sectionFor(container, 's1')).not.toBeInTheDocument();
});
