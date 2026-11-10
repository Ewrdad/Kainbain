import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GlassesTaskListView } from './GlassesTaskListView.jsx';
import '@testing-library/jest-dom';

/***
 * MARK: GlassesTaskListView tests
 * @description Guards the glasses observability home: running task plus
 *   step up top, the three count cards, the short tap list, the View
 *   button into quick review, and the auto-refresh beat with its manual
 *   backup button.
 ***/

const stages = [
  { id: 'plan', name: 'Plan' },
  { id: 'build', name: 'Build' },
];

function renderList(overrides = {}) {
  const runningTask = { id: 't1', title: 'Fix the auth race', currentStageId: 'build' };
  const props = {
    tasks: [
      runningTask,
      { id: 't2', title: 'Polish landing copy', status: 'waiting_human', currentStageId: 'plan' },
    ],
    runningTask,
    engineState: { status: 'running', activeTaskId: 't1' },
    stages,
    counts: { running: 1, waitingReview: 1, failed: 0 },
    onOpenTask: () => {},
    onRefresh: () => {},
    ...overrides,
  };
  return render(<GlassesTaskListView {...props} />);
}

describe('GlassesTaskListView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the running task name and its current step in large type', () => {
    renderList();
    expect(screen.getByTestId('glasses-task-list')).toBeInTheDocument();
    expect(screen.getByTestId('glasses-running-name')).toHaveTextContent('Fix the auth race');
    expect(screen.getByTestId('glasses-running-step')).toHaveTextContent('Build');
  });

  it('shows the three count cards', () => {
    renderList();
    expect(screen.getByTestId('glasses-count-running')).toHaveTextContent('1');
    expect(screen.getByTestId('glasses-count-waiting')).toHaveTextContent('1');
    expect(screen.getByTestId('glasses-count-failed')).toHaveTextContent('0');
  });

  it('announces status quietly through a live region, not a banner', () => {
    renderList();
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Running: Fix the auth race');
    expect(screen.getByTestId('glasses-status-dot')).toBeInTheDocument();
  });

  it('opens the tapped task from the short list', () => {
    const onOpenTask = vi.fn();
    renderList({ onOpenTask });
    fireEvent.click(screen.getByRole('button', { name: 'Open Polish landing copy for review' }));
    expect(onOpenTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't2', status: 'waiting_human' }),
    );
  });

  it('View opens the review-ready task first', () => {
    const onOpenTask = vi.fn();
    renderList({ onOpenTask });
    fireEvent.click(screen.getByRole('button', { name: 'View Polish landing copy for review' }));
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
  });

  it('disables View when nothing is actionable', () => {
    renderList({
      tasks: [{ id: 't9', title: 'Done work', status: 'completed' }],
      runningTask: null,
      engineState: { status: 'idle' },
      counts: { running: 0, waitingReview: 0, failed: 0 },
    });
    expect(screen.getByTestId('glasses-running-name')).toHaveTextContent('Nothing running');
    expect(screen.getByRole('button', { name: 'Nothing to review right now' })).toBeDisabled();
  });

  it('refreshes by itself every few seconds', () => {
    const onRefresh = vi.fn();
    renderList({ onRefresh });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('Refresh button refreshes immediately as backup', () => {
    const onRefresh = vi.fn();
    renderList({ onRefresh });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
