import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { TaskCompleteToggleButton } from './TaskCompleteToggleButton';
import '@testing-library/jest-dom';

/***
 * MARK: TaskCompleteToggleButton tests
 * @description Pins the Complete/Uncomplete swap: a non-completed task renders
 *   the Complete action, a completed task renders Uncomplete in the same
 *   button position, each action runs through runTaskAction under its own
 *   pending key, and the busy state is exposed via aria-busy.
 ***/
function makeProps(overrides = {}) {
  return {
    task: { id: 't1', status: 'in_stage' },
    activeProjectId: 'proj-1',
    completeTask: vi.fn().mockResolvedValue({}),
    uncompleteTask: vi.fn().mockResolvedValue({}),
    isMutating: false,
    pendingAction: null,
    runTaskAction: vi.fn((key, fn) => fn()),
    ...overrides,
  };
}

describe('TaskCompleteToggleButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders Complete for a non-completed task and fires completeTask', async () => {
    const props = makeProps();
    render(<TaskCompleteToggleButton {...props} />);

    const btn = screen.getByRole('button', { name: /✓ Complete/i });
    expect(btn).toHaveAttribute('aria-busy', 'false');

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(props.runTaskAction).toHaveBeenCalledWith('complete', expect.any(Function));
    expect(props.completeTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(props.uncompleteTask).not.toHaveBeenCalled();
  });

  test('renders Uncomplete for a completed task and fires uncompleteTask', async () => {
    const props = makeProps({ task: { id: 't1', status: 'completed' } });
    render(<TaskCompleteToggleButton {...props} />);

    const btn = screen.getByRole('button', { name: /↺ Uncomplete/i });
    expect(screen.queryByRole('button', { name: /✓ Complete/i })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(props.runTaskAction).toHaveBeenCalledWith('uncomplete', expect.any(Function));
    expect(props.uncompleteTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(props.completeTask).not.toHaveBeenCalled();
  });

  test('shows the busy state for the active pending action on either variant', () => {
    const { rerender } = render(
      <TaskCompleteToggleButton {...makeProps({ pendingAction: 'complete' })} />,
    );
    const completing = screen.getByRole('button', { name: /Completing\.\.\./i });
    expect(completing).toHaveAttribute('aria-busy', 'true');
    expect(completing).toBeDisabled();

    rerender(
      <TaskCompleteToggleButton
        {...makeProps({ task: { id: 't1', status: 'completed' }, pendingAction: 'uncomplete' })}
      />,
    );
    const uncompleting = screen.getByRole('button', { name: /Uncompleting\.\.\./i });
    expect(uncompleting).toHaveAttribute('aria-busy', 'true');
    expect(uncompleting).toBeDisabled();
  });

  test('is disabled while any other task action is mutating', () => {
    render(<TaskCompleteToggleButton {...makeProps({ isMutating: true })} />);
    expect(screen.getByRole('button', { name: /✓ Complete/i })).toBeDisabled();
  });

  test('survives a rejecting mutation without crashing', async () => {
    const props = makeProps({
      completeTask: vi.fn().mockRejectedValue(new Error('boom')),
      runTaskAction: vi.fn((key, fn) => fn()),
    });
    render(<TaskCompleteToggleButton {...props} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /✓ Complete/i }));
    });
    expect(props.completeTask).toHaveBeenCalledTimes(1);
  });
});
