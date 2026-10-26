import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { CanvasToolbar } from './CanvasToolbar';
import '@testing-library/jest-dom';

/***
 * MARK: CanvasToolbar tag filter tests
 * @description Colocated tests for the unified search bar chrome: `#tag`
 *   tokens in the query render as removable chips beside the free text, the
 *   Any/All match-mode toggle appears only while tags are active, typing `#`
 *   offers the available tags as suggestions, and the mobile strip keeps its
 *   hidden-stages summary tab.
 ***/

const stages = [
  { id: 's-1', name: 'Idea', type: 'agent', tags: ['PO'] },
  { id: 's-2', name: 'Review', type: 'human', tags: ['PO'] },
  { id: 's-3', name: 'Build', type: 'agent', tags: ['Dev'] },
];

const tagOptions = [
  { value: 'Dev', label: 'Dev' },
  { value: 'PO', label: 'PO' },
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
    stageTagOptions: tagOptions,
    stageTagFilterMode: 'any',
    setStageTagFilterMode: vi.fn(),
    visibleStages: stages,
    hiddenStageCount: 0,
    onClearStageTagFilter: vi.fn(),
    ...overrides,
  };
}

/***
 * MARK: placeCursorAtEnd
 * @description Parks the caret at the end of the toolbar search input so the
 *   unified bar's `#` token detection (and its suggestion dropdown) engages.
 ***/
function placeCursorAtEnd(input) {
  input.setSelectionRange(input.value.length, input.value.length);
  fireEvent.click(input);
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

test('tags in the query render as chips with remove buttons', () => {
  const setSearchQuery = vi.fn();
  renderWithKainBain(
    <CanvasToolbar {...baseProps({ searchQuery: 'auth #PO', setSearchQuery })} />,
  );
  expect(screen.getByRole('button', { name: 'Remove tag PO' })).toBeInTheDocument();
  // The committed tag renders only as a chip — the field keeps just the text.
  expect(screen.getByLabelText('Search tasks')).toHaveValue('auth');

  fireEvent.click(screen.getByRole('button', { name: 'Remove tag PO' }));
  expect(setSearchQuery).toHaveBeenCalledWith('auth');
});

test('typing # offers the available tags as suggestions', () => {
  const setSearchQuery = vi.fn();
  const { rerender } = renderWithKainBain(
    <CanvasToolbar {...baseProps({ setSearchQuery })} />,
  );
  const input = screen.getByLabelText('Search tasks');
  fireEvent.change(input, { target: { value: '#' } });
  expect(setSearchQuery).toHaveBeenCalledWith('#');
  // Controlled re-render with the typed query, caret at the end.
  rerender(<CanvasToolbar {...baseProps({ searchQuery: '#', setSearchQuery })} />);
  placeCursorAtEnd(screen.getByLabelText('Search tasks'));
  expect(screen.getByRole('option', { name: '#Dev' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '#PO' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('option', { name: '#PO' }));
  // Selecting a suggestion commits the chip and clears the bare `#` trigger.
  expect(setSearchQuery).toHaveBeenCalledWith('#PO');
});

test('match-mode toggle only renders while tags are in the query', () => {
  const setStageTagFilterMode = vi.fn();
  const { rerender } = renderWithKainBain(
    <CanvasToolbar {...baseProps({ setStageTagFilterMode })} />,
  );
  expect(screen.queryByRole('button', { name: 'Match any selected tag' })).not.toBeInTheDocument();

  rerender(
    <CanvasToolbar
      {...baseProps({ setStageTagFilterMode, searchQuery: 'auth #PO' })}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Match all selected tags' }));
  expect(setStageTagFilterMode).toHaveBeenCalledWith('all');
});

test('match-mode toggle reflects the pressed mode', () => {
  renderWithKainBain(
    <CanvasToolbar {...baseProps({ searchQuery: '#PO', stageTagFilterMode: 'all' })} />,
  );
  expect(screen.getByRole('button', { name: 'Match all selected tags' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Match any selected tag' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('search bar stays visible even when no stage has tags', () => {
  renderWithKainBain(<CanvasToolbar {...baseProps({ stageTagOptions: [] })} />);
  expect(screen.getByLabelText('Search tasks')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Match (any|all)/ })).not.toBeInTheDocument();
});

test('clear button wipes text and tags together', () => {
  const setSearchQuery = vi.fn();
  renderWithKainBain(
    <CanvasToolbar {...baseProps({ searchQuery: 'auth #PO', setSearchQuery })} />,
  );
  fireEvent.click(screen.getByLabelText('Clear search'));
  expect(setSearchQuery).toHaveBeenCalledWith('');
});

test('mobile strip lists only visible stages plus a hidden summary tab', () => {
  const onClearStageTagFilter = vi.fn();
  renderWithKainBain(
    <CanvasToolbar
      {...baseProps({
        visibleStages: [stages[0], stages[1]],
        hiddenStageCount: 1,
        onClearStageTagFilter,
      })}
    />,
  );
  const tabs = screen.getAllByRole('tab');
  // Two visible stage tabs + the hidden summary tab.
  expect(tabs).toHaveLength(3);
  expect(screen.getByText('1. Idea')).toBeInTheDocument();
  expect(screen.getByText('2. Review')).toBeInTheDocument();
  expect(screen.queryByText('3. Build')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('tab', { name: 'Show 1 hidden stages (clears the tag filter)' }));
  expect(onClearStageTagFilter).toHaveBeenCalledTimes(1);
});

test('mobile strip keeps true pipeline numbering for visible stages', () => {
  renderWithKainBain(
    <CanvasToolbar {...baseProps({ visibleStages: [stages[2]], hiddenStageCount: 2 })} />,
  );
  expect(screen.getByText('3. Build')).toBeInTheDocument();
});

test('mobile: the whole search width chain is bounded so tags cannot evict the input', () => {
  renderWithKainBain(
    <CanvasToolbar
      {...baseProps({
        searchQuery: 'auth #PO #Dev',
        projectWorkflows: [{ id: 'wf-1', name: 'Main', isDefault: true }],
      })}
    />,
  );
  const searchRoot = screen.getByTestId('unified-search-bar');
  // Search wrapper: fluid full-width on phones, fixed from sm up.
  const searchWrapper = searchRoot.parentElement;
  expect(searchWrapper?.className).toContain('w-full');
  expect(searchWrapper?.className).toContain('sm:w-64');
  expect(searchWrapper?.className).toContain('lg:w-96');
  expect(searchWrapper?.className).toContain('min-w-0');
  // InfoTooltip trigger container: the actual flex item of the left group.
  // Without min-w-0 here the block sizes to max-content (759px with 6 tags
  // on a 351px line) and the input/clear land off-viewport — the regression
  // caught in review, so pin the bounding classes.
  const tooltipTrigger = searchWrapper?.parentElement;
  expect(tooltipTrigger?.className).toContain('min-w-0');
  expect(tooltipTrigger?.className).toContain('basis-full');
  expect(tooltipTrigger?.className).toContain('order-last');
  // Toolbar left group wraps predictably and stays shrinkable.
  const leftGroup = tooltipTrigger?.parentElement;
  expect(leftGroup?.className).toContain('flex-wrap');
  expect(leftGroup?.className).toContain('min-w-0');
  // The workflow selector stays visible on mobile (wraps around the
  // full-width search rather than being hidden).
  const workflowBtn = screen.getByRole('button', { name: /Select pipeline workflow/i });
  expect(workflowBtn.className).not.toMatch(/(^|\s)hidden(\s|$)/);
});
