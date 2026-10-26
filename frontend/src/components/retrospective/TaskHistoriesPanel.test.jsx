import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { TaskHistoriesPanel } from './TaskHistoriesPanel';
import { RetrospectiveProvider } from './useRetrospective';
import {
  retrospectiveTaskFixtures,
  retrospectiveHydratedTaskFixture,
} from './__fixtures__/index.js';
import { STAGE_VISIBILITY_STORAGE_KEY } from './stageVisibility';
import '@testing-library/jest-dom';

/***
 * MARK: TaskHistoriesPanel tests
 * @description Locks the bird's-eye list: stats strip, duration bars with
 *   FAILED markers, sort/filter, checkbox selection (announced), expansion
 *   with hydration, deep-link navigation, stage-type visibility toggles
 *   (persisted, `?show=` share links), and loading/error/empty states.
 ***/

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});
function renderPanel(props = {}, context = {}) {
  const merged = {
    tasks: retrospectiveTaskFixtures,
    loading: false,
    error: null,
    onRefresh: vi.fn(),
    expandedId: null,
    expandedTask: null,
    expanding: false,
    onToggleExpanded: vi.fn(),
    ...props,
  };
  return renderWithKainBain(
    <RetrospectiveProvider initialSelectedIds={props.initialSelectedIds || []}>
      <TaskHistoriesPanel {...merged} />
    </RetrospectiveProvider>,
    context,
  );
}

describe('TaskHistoriesPanel', () => {
  it('renders the stats strip and task cards with totals', () => {
    renderPanel();
    expect(screen.getByTestId('retrospective-stats')).toHaveTextContent('4 tasks');
    expect(screen.getByTestId('retrospective-stats')).toHaveTextContent('1 completed');
    expect(screen.getByTestId('retrospective-stats')).toHaveTextContent('1 failed');
    expect(screen.getByTestId('retrospective-task-task-done-1')).toHaveTextContent(
      'Add pagination to the task list',
    );
    expect(screen.getByTestId('retrospective-task-task-done-1')).toHaveTextContent('8h');
  });

  it('marks per-stage FAILED durations and healthy bars', () => {
    renderPanel();
    const failedRow = screen.getByTestId('retrospective-task-task-failed-2');
    expect(failedRow).toHaveTextContent('Failed');
    expect(failedRow.querySelector('[aria-label="Implement 90m 0s failed"]')).toBeTruthy();
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow).not.toHaveTextContent('FAILED');
  });

  it('sorts and filters client-side', () => {
    renderPanel();
    const items = () =>
      screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));
    expect(items()[0]).toContain('Untouched backlog item');
    fireEvent.change(screen.getByLabelText('Sort tasks'), { target: { value: 'oldest' } });
    expect(items()[0]).toContain('Add pagination to the task list');
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'failed' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByTestId('retrospective-task-task-failed-2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by workflow'), {
      target: { value: 'wf-experiment' },
    });
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument();
  });

  it('selects tasks as shared context and announces it', () => {
    renderPanel();
    const box = screen.getByLabelText('Select Migrate the session store as chat context');
    fireEvent.click(box);
    expect(box).toBeChecked();
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent(
      'Migrate the session store selected.',
    );
    fireEvent.click(box);
    expect(box).not.toBeChecked();
  });

  it('expands rows with inline detail and hydrates the timeline', () => {
    const onToggleExpanded = vi.fn();
    renderPanel({ onToggleExpanded });
    fireEvent.click(screen.getByLabelText('Expand Migrate the session store'));
    expect(onToggleExpanded).toHaveBeenCalledWith('task-failed-2');

    renderPanel({
      expandedId: 'task-failed-2',
      expandedTask: retrospectiveHydratedTaskFixture,
      onToggleExpanded,
    });
    const row = screen.getAllByTestId('retrospective-task-task-failed-2').pop();
    expect(row).toHaveTextContent('Tests failed on the migration branch');
    expect(row).toHaveTextContent('Implement — FAILED (1h 30m)');
    expect(row).toHaveTextContent('Active 1h 31m · 2 stages with durations');
  });

  it('deep-links to the full task view', () => {
    const setView = vi.fn();
    renderPanel({}, { setView });
    fireEvent.click(screen.getByLabelText('Open full task view for Migrate the session store'));
    expect(setView).toHaveBeenCalledWith('task-detail', { taskId: 'task-failed-2' });
  });

  it('covers loading, error, and empty states', () => {
    const { unmount } = renderPanel({ loading: true });
    expect(screen.getByText('Loading task histories…')).toBeInTheDocument();
    unmount();

    const onRefresh = vi.fn();
    renderPanel({ tasks: [], error: 'offline', onRefresh });
    expect(screen.getByText(/Failed to load task histories/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows the no-tasks empty state', () => {
    renderPanel({ tasks: [] });
    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument();
  });
});

describe('TaskHistoriesPanel stage-type visibility', () => {
  function expandVisibilityToggle() {
    fireEvent.click(screen.getByRole('button', { name: /Stage types \(/ }));
  }

  it('hides one stage type in place without a reload', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: /Stage types \(3 of 3 shown\)/ }),
    ).toBeInTheDocument();
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Human stages' }));

    // The human "Plan" bar disappears from the completed task; agent/ci stay.
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow.querySelector('[aria-label^="Plan "]')).not.toBeInTheDocument();
    expect(doneRow.querySelector('[aria-label^="Idea "]')).toBeInTheDocument();
    expect(doneRow.querySelector('[aria-label^="Implement "]')).toBeInTheDocument();
    // The toggle announces the change and updates its count.
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Human stages hidden.');
    expect(
      screen.getByRole('button', { name: /Stage types \(2 of 3 shown\)/ }),
    ).toBeInTheDocument();
    // Task totals still describe the whole task, not the visible subset.
    expect(doneRow).toHaveTextContent('8h');
  });

  it('restores hidden types with Show all', () => {
    renderPanel();
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show CI stages' }));
    const failedRow = screen.getByTestId('retrospective-task-task-failed-2');
    expect(failedRow.querySelector('[aria-label^="Implement "]')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(failedRow.querySelector('[aria-label="Implement 90m 0s failed"]')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Stage types \(3 of 3 shown\)/ }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('a11y-announcer')).toHaveTextContent('Showing all stage types.');
  });

  it('says so when every stage type is hidden', () => {
    renderPanel();
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Agent stages' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Human stages' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show CI stages' }));
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow).toHaveTextContent('All stage types are hidden by the stage-type filter.');
    expect(doneRow.querySelector('[aria-label="Per-stage durations"]')).not.toBeInTheDocument();
  });

  it('persists hidden types across reloads', () => {
    const { unmount } = renderPanel();
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show CI stages' }));
    expect(window.localStorage.getItem(STAGE_VISIBILITY_STORAGE_KEY)).toBe('["ci"]');
    unmount();

    renderPanel();
    const failedRow = screen.getByTestId('retrospective-task-task-failed-2');
    expect(failedRow.querySelector('[aria-label^="Implement "]')).not.toBeInTheDocument();
    expect(failedRow.querySelector('[aria-label^="Idea "]')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Stage types \(2 of 3 shown\)/ }),
    ).toBeInTheDocument();
  });

  it('falls back to show-all on corrupt stored preferences', () => {
    window.localStorage.setItem(STAGE_VISIBILITY_STORAGE_KEY, '{not-json');
    renderPanel();
    expect(
      screen.getByRole('button', { name: /Stage types \(3 of 3 shown\)/ }),
    ).toBeInTheDocument();
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow.querySelector('[aria-label^="Plan "]')).toBeInTheDocument();
  });

  it('pre-populates from a ?show= share link', () => {
    window.history.replaceState(null, '', '/#/retrospective?show=ci');
    renderPanel();
    expect(
      screen.getByRole('button', { name: /Stage types \(1 of 3 shown\)/ }),
    ).toBeInTheDocument();
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow.querySelector('[aria-label^="Implement "]')).toBeInTheDocument();
    expect(doneRow.querySelector('[aria-label^="Idea "]')).not.toBeInTheDocument();
    expect(doneRow.querySelector('[aria-label^="Plan "]')).not.toBeInTheDocument();
  });

  it('keeps the URL shareable when toggles change', () => {
    window.history.replaceState(null, '', '/#/retrospective');
    renderPanel();
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show Human stages' }));
    expect(window.location.hash).toContain('show=');
    expect(decodeURIComponent(window.location.hash)).toContain('show=agent,ci');

    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(window.location.hash).toBe('#/retrospective');
  });

  it('re-applies the URL when navigating back/forward on the page', () => {
    renderPanel();
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show CI stages' }));
    expect(
      screen.getByRole('button', { name: /Stage types \(2 of 3 shown\)/ }),
    ).toBeInTheDocument();

    act(() => {
      window.history.replaceState(null, '', '/#/retrospective?show=human');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(
      screen.getByRole('button', { name: /Stage types \(1 of 3 shown\)/ }),
    ).toBeInTheDocument();
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow.querySelector('[aria-label^="Plan "]')).toBeInTheDocument();
    expect(doneRow.querySelector('[aria-label^="Implement "]')).not.toBeInTheDocument();
  });

  it('counts only visible stages in the expansion detail', () => {
    renderPanel({
      expandedId: 'task-failed-2',
      expandedTask: retrospectiveHydratedTaskFixture,
    });
    expandVisibilityToggle();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show CI stages' }));
    const row = screen.getByTestId('retrospective-task-task-failed-2');
    expect(row).toHaveTextContent('1 stages with durations');
  });

  it('hides the toggles behind the feature flag', () => {
    vi.stubEnv('VITE_ENABLE_STAGE_VISIBILITY_TOGGLE', '0');
    renderPanel();
    expect(screen.queryByRole('button', { name: /Stage types \(/ })).not.toBeInTheDocument();
    const doneRow = screen.getByTestId('retrospective-task-task-done-1');
    expect(doneRow.querySelector('[aria-label^="Plan "]')).toBeInTheDocument();
  });
});
