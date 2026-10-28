import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewCommentComposer } from './ReviewCommentComposer';

/***
 * MARK: ReviewCommentComposer tests
 * @description Verifies the inline comment composer: Ctrl/Cmd+Enter submit,
 *   empty-state submit guard, Cancel button, autoFocus, and the submitting
 *   state.
 */
describe('ReviewCommentComposer', () => {
  it('renders the textarea, label, and hint', () => {
    render(<ReviewCommentComposer label="Comment on line 42" onSubmit={vi.fn()} />);
    expect(screen.getByText('Comment on line 42')).toBeTruthy();
    expect(screen.getByText('Ctrl+Enter to submit')).toBeTruthy();
  });

  it('submits via Ctrl+Enter (FeedbackDialog parity)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ReviewCommentComposer onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: '  Trimmed body  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Trimmed body');
      expect(textarea.value).toBe(''); // cleared after submit
    });
  });

  it('submits via Cmd+Enter on macOS', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<ReviewCommentComposer onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: 'meta body' } });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    await vi.waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('meta body');
    });
  });

  it('does not submit whitespace-only bodies or plain Enter', () => {
    const onSubmit = vi.fn();
    render(<ReviewCommentComposer onSubmit={onSubmit} />);
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: '   ' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.click(screen.getByText('Add comment'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables submit while empty and while a submission is in flight', async () => {
    let release;
    const onSubmit = vi.fn(() => new Promise((resolve) => (release = resolve)));
    render(<ReviewCommentComposer onSubmit={onSubmit} />);
    const submitBtn = screen.getByText('Add comment');
    expect(submitBtn.disabled).toBe(true);

    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: 'body' } });
    expect(screen.getByText('Add comment').disabled).toBe(false);
    fireEvent.click(screen.getByText('Add comment'));
    expect(screen.getByText('Adding…').disabled).toBe(true);
    release();
    await vi.waitFor(() => {
      expect(screen.getByText('Add comment')).toBeTruthy();
    });
  });

  it('focuses the textarea when autoFocus is set', () => {
    render(<ReviewCommentComposer autoFocus onSubmit={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByLabelText('Review comment'));
  });

  it('calls onCancel from the Cancel button', () => {
    const onCancel = vi.fn();
    render(<ReviewCommentComposer onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
