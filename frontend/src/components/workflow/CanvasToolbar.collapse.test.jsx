import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { CanvasToolbar } from './CanvasToolbar';
import { WorkflowCanvas } from './WorkflowCanvas';
import { Header } from '../layout/Header';
import { MOBILE_TOOLBAR_COLLAPSE_EVENT } from './hooks/useMobileToolbarCollapse';
import '@testing-library/jest-dom';

/***
 * MARK: CanvasToolbar.collapse tests
 * @description Mobile auto-collapse contract (task 34793321, survey Q4/Q5):
 *   the secondary row (pipeline selector + card order) folds away on
 *   scroll-down while the search input and stage tabs stay pinned, and
 *   re-expands on scroll-up, tap, or keyboard focus. Desktop sequence and
 *   touch targets are regression-locked.
 ***/

const stages = [
  { id: 's-1', name: 'Idea', type: 'agent' },
  { id: 's-2', name: 'Review', type: 'human' },
];

function baseProps(overrides = {}) {
  return {
    projectWorkflows: [{ id: 'wf-1', name: 'Main Pipeline' }],
    activeWorkflow: { id: 'wf-1', name: 'Main Pipeline' },
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
    isToolbarCollapsed: false,
    onExpandToolbar: vi.fn(),
    ...overrides,
  };
}

function renderToolbar(overrides) {
  return renderWithKainBain(<CanvasToolbar {...baseProps(overrides)} />);
}

beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ models: [], harnesses: [] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1024,
  });
  vi.unstubAllGlobals();
});

test('expanded by default: secondary row visible, no expand affordance', () => {
  renderToolbar();
  const row = screen.getByTestId('toolbar-secondary-row');
  expect(row).toHaveAttribute('aria-hidden', 'false');
  expect(row.className).toMatch(/max-md:max-h-32/);
  expect(row.className).not.toMatch(/max-md:max-h-0/);
  expect(screen.queryByTestId('toolbar-expand')).toBeNull();
  // Search input and stage tabs stay rendered in both states (survey Q5).
  expect(screen.getByRole('combobox', { name: 'Search tasks' })).toBeInTheDocument();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
});

test('collapsed: secondary row folds with max-md scoping, expand affordance appears', () => {
  renderToolbar({ isToolbarCollapsed: true });
  const row = screen.getByTestId('toolbar-secondary-row');
  expect(row).toHaveAttribute('aria-hidden', 'true');
  expect(row.className).toMatch(/max-md:max-h-0/);
  expect(row.className).toMatch(/max-md:opacity-0/);
  // Desktop can never hide: every collapse visual is max-md scoped.
  expect(row.className).not.toMatch(/(?:^|\s)(max-h-0|opacity-0|overflow-hidden)(?:\s|$)/);
  const expand = screen.getByTestId('toolbar-expand');
  expect(expand).toHaveAttribute('aria-expanded', 'false');
  expect(expand).toHaveAccessibleName(/expand toolbar controls/i);
  expect(expand.className).toMatch(/md:hidden/);
  // Pinned controls survive the collapse (survey Q5).
  expect(screen.getByRole('combobox', { name: 'Search tasks' })).toBeInTheDocument();
  expect(screen.getAllByRole('tab')).toHaveLength(2);
});

test('expand affordance calls onExpandToolbar', () => {
  const onExpandToolbar = vi.fn();
  renderToolbar({ isToolbarCollapsed: true, onExpandToolbar });
  fireEvent.click(screen.getByTestId('toolbar-expand'));
  expect(onExpandToolbar).toHaveBeenCalledTimes(1);
});

test('keyboard focus into the collapsed row re-expands it', () => {
  const onExpandToolbar = vi.fn();
  renderToolbar({ isToolbarCollapsed: true, onExpandToolbar });
  const row = screen.getByTestId('toolbar-secondary-row');
  // Focus capture fires on the way into any child: tabbing into
  // pipeline/order expands before focus can strand behind the fold.
  fireEvent.focus(row);
  expect(onExpandToolbar).toHaveBeenCalledTimes(1);
});

test('desktop control sequence is preserved through the sm:contents row', () => {
  renderToolbar();
  const row = screen.getByTestId('toolbar-secondary-row');
  expect(row.className).toMatch(/sm:contents/);
  // Pipeline (1), search (2), card order (3): the exact desktop order.
  const searchCombobox = screen.getByRole('combobox', { name: 'Search tasks' });
  const searchTrigger = searchCombobox.closest('[class*="sm:order-"]');
  expect(searchTrigger?.className ?? '').toContain('sm:order-2');
  const orderButton = screen.getByRole('button', { name: /card order:/i });
  const orderTrigger = orderButton.closest('[class*="sm:order-"]');
  expect(orderTrigger?.className ?? '').toContain('sm:order-3');
});

test('compact mobile density classes are applied', () => {
  renderToolbar();
  // Pipeline name truncates tighter on phones, roomier on desktop.
  const name = screen.getByText('Main Pipeline');
  expect(name.className).toContain('max-w-[80px]');
  expect(name.className).toContain('sm:max-w-[140px]');
  // Card order label truncates on phones only.
  const orderLabel = screen.getByText('Manual order');
  expect(orderLabel.className).toContain('max-w-[90px]');
  // Search shell + input use tight phone padding with sm: restore.
  const searchBar = screen.getByTestId('unified-search-bar');
  const shell = searchBar.firstElementChild;
  expect(shell?.className ?? '').toContain('py-0.5');
  expect(shell?.className ?? '').toContain('sm:py-1.5');
  const input = screen.getByRole('combobox', { name: 'Search tasks' });
  expect(input.className).toContain('py-0.5');
  expect(input.className).toContain('leading-tight');
  // 44px pointer targets are never sacrificed for density (WCAG 2.5.8).
  const pipeline = screen.getByRole('button', { name: /select pipeline workflow/i });
  expect(pipeline.className).toContain('min-h-[44px]');
  expect(screen.getByRole('button', { name: /card order:/i }).className).toContain(
    'min-h-[44px]',
  );
});

test('header tab row folds and unfolds on the collapse event (phones only)', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 390,
  });
  renderWithKainBain(<Header />, {
    projects: [{ id: 'p1', name: 'Alpha' }],
    activeProjectId: 'p1',
  });
  const tabRow = screen.getByTestId('header-tab-row');
  expect(tabRow.className).toContain('overflow-x-auto');

  act(() => {
    window.dispatchEvent(
      new window.CustomEvent(MOBILE_TOOLBAR_COLLAPSE_EVENT, {
        detail: { collapsed: true },
      }),
    );
  });
  expect(tabRow).toHaveAttribute('aria-hidden', 'true');
  expect(tabRow.className).toMatch(/max-md:max-h-0/);

  // Keyboard focus into the folded row re-expands it.
  act(() => {
    fireEvent.focus(tabRow);
  });
  expect(tabRow).toHaveAttribute('aria-hidden', 'false');

  // Desktop widths ignore the event entirely.
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 1280,
  });
  act(() => {
    window.dispatchEvent(
      new window.CustomEvent(MOBILE_TOOLBAR_COLLAPSE_EVENT, {
        detail: { collapsed: true },
      }),
    );
  });
  expect(tabRow).toHaveAttribute('aria-hidden', 'false');
});

test('scrolling the mobile card list collapses and re-expands the toolbar', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 390,
  });
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [
      { id: '1', name: 'Idea', type: 'agent' },
      { id: '2', name: 'Review', type: 'human' },
    ],
    tasks: [
      { id: 't-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
      { id: 't-2', goal: 'Review API spec', currentStageId: '2', status: 'in_stage' },
    ],
    activeProjectId: 'proj-1',
  });

  const row = screen.getByTestId('toolbar-secondary-row');
  expect(row).toHaveAttribute('aria-hidden', 'false');

  // Scroll down in the active mobile column: the secondary row folds away
  // while search + stage tabs stay pinned.
  const list = screen.getByTestId('stage-card-list-1');
  act(() => {
    fireEvent.scroll(list, { target: { scrollTop: 150 } });
  });
  expect(screen.getByTestId('toolbar-secondary-row')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  expect(screen.getByTestId('toolbar-expand')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Search tasks' })).toBeInTheDocument();

  // Scroll back to the top: the full toolbar returns.
  act(() => {
    fireEvent.scroll(list, { target: { scrollTop: 0 } });
  });
  expect(screen.getByTestId('toolbar-secondary-row')).toHaveAttribute(
    'aria-hidden',
    'false',
  );
  expect(screen.queryByTestId('toolbar-expand')).toBeNull();
});

test('tapping the already selected mobile stage tab when collapsed calls onExpandToolbar', () => {
  const onExpandToolbar = vi.fn();
  renderWithKainBain(
    <CanvasToolbar
      {...baseProps({
        isToolbarCollapsed: true,
        onExpandToolbar,
        effectiveMobileStageId: 's-1',
      })}
    />,
  );
  // Find the selected tab
  const tabs = screen.getAllByRole('tab');
  const activeTab = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
  expect(activeTab).toBeDefined();

  fireEvent.click(activeTab);
  expect(onExpandToolbar).toHaveBeenCalledTimes(1);
});

test('header tab row un-folds when window is resized to desktop', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 390,
  });
  renderWithKainBain(<Header />, {
    projects: [{ id: 'p1', name: 'Alpha' }],
    activeProjectId: 'p1',
  });
  const tabRow = screen.getByTestId('header-tab-row');

  // Collapse it on mobile
  act(() => {
    window.dispatchEvent(
      new window.CustomEvent(MOBILE_TOOLBAR_COLLAPSE_EVENT, {
        detail: { collapsed: true },
      }),
    );
  });
  expect(tabRow).toHaveAttribute('aria-hidden', 'true');

  // Resize window to desktop: should restore expanded state and clear aria-hidden
  act(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 1024,
    });
    window.dispatchEvent(new window.Event('resize'));
  });
  expect(tabRow).toHaveAttribute('aria-hidden', 'false');
});

test('unmounting WorkflowCanvas restores header collapse state via event broadcast', () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: 390,
  });
  const seenEvents = [];
  const listener = (e) => seenEvents.push(e.detail.collapsed);
  window.addEventListener(MOBILE_TOOLBAR_COLLAPSE_EVENT, listener);

  const { unmount } = renderWithKainBain(<WorkflowCanvas />, {
    stages: [{ id: '1', name: 'Idea', type: 'agent' }],
    tasks: [],
    activeProjectId: 'proj-1',
  });

  act(() => {
    unmount();
  });

  window.removeEventListener(MOBILE_TOOLBAR_COLLAPSE_EVENT, listener);
  // The last event emitted on unmount must be { collapsed: false }
  expect(seenEvents[seenEvents.length - 1]).toBe(false);
});
