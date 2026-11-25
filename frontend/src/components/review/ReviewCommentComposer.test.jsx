import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    // The submit awaits the pre-check listing before entering flight.
    await waitFor(() => {
      expect(screen.getByText('Adding…').disabled).toBe(true);
    });
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
/***
 * MARK: ReviewCommentComposer submit-time validation tests
 * @description With task context the composer pre-checks against attachments:
 *   dangling refs and image-only drafts open the inline recovery panel;
 *   resend/strip recovery and server-422 reopen all keep the draft.
 */
vi.mock('../../services/api', () => ({
  api: { listTaskImages: vi.fn() },
}));

import { api as mockedApi } from '../../services/api';

describe('ReviewCommentComposer submit-time validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.listTaskImages.mockResolvedValue({ images: [] });
  });

  const renderComposer = (props = {}) =>
    render(
      <ReviewCommentComposer projectId="proj-1" taskId="task-1" onSubmit={vi.fn()} {...props} />,
    );

  it('blocks a dangling ref with an inline panel naming the file', async () => {
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: 'See ![gone](assets/gone.png) please' } });
    await waitFor(() => {
      expect(screen.getByTestId('comment-live-warning')).toHaveTextContent('assets/gone.png');
    });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(screen.getByTestId('comment-validation-panel')).toBeTruthy();
    });
    expect(onSubmit).not.toHaveBeenCalled();
    // Draft kept for recovery.
    expect(textarea.value).toContain('assets/gone.png');
  });

  it('blocks image-only comments until a note is added', async () => {
    mockedApi.listTaskImages.mockResolvedValue({ images: [{ name: 'a.png' }] });
    const onSubmit = vi.fn();
    renderComposer({ onSubmit });
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: '![a](assets/a.png)' } });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(screen.getByTestId('comment-validation-panel')).toHaveTextContent(/only images/);
    });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Back to editing'));
    fireEvent.change(textarea, { target: { value: 'Null here — see ![a](assets/a.png)' } });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Null here — see ![a](assets/a.png)');
    });
  });

  it('send words-only strips the dead links and submits', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderComposer({ onSubmit });
    fireEvent.change(screen.getByLabelText('Review comment'), {
      target: { value: 'See ![gone](assets/gone.png) please take a look' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(screen.getByTestId('comment-validation-panel')).toBeTruthy();
    });
    fireEvent.click(screen.getByText('Send words-only'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('See please take a look');
    });
  });

  it('resend transmits once the file is attached', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderComposer({ onSubmit });
    fireEvent.change(screen.getByLabelText('Review comment'), {
      target: { value: 'See ![gone](assets/gone.png) please take a look' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(screen.getByTestId('comment-validation-panel')).toBeTruthy();
    });
    mockedApi.listTaskImages.mockResolvedValue({ images: [{ name: 'gone.png' }] });
    fireEvent.click(screen.getByText('Resend'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('See ![gone](assets/gone.png) please take a look');
    });
  });

  it('a server 422 re-opens the panel with the server-named files', async () => {
    mockedApi.listTaskImages.mockResolvedValue({ images: [{ name: 'race.png' }] });
    const err = new Error('API 422 on /review/comments: refused');
    err.status = 422;
    err.body = JSON.stringify({
      code: 'FEEDBACK_VALIDATION_FAILED',
      missing: [{ ref: 'assets/race.png', name: 'race.png' }],
      imageOnly: false,
    });
    const onSubmit = vi.fn().mockRejectedValueOnce(err).mockResolvedValue({});
    renderComposer({ onSubmit });
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, {
      target: { value: 'See ![r](assets/race.png) please take a look' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(screen.getByTestId('comment-validation-panel')).toHaveTextContent('assets/race.png');
    });
    expect(textarea.value).toContain('assets/race.png');
  });

  it('healthy drafts with context submit without a panel', async () => {
    const onSubmit = vi.fn().mockResolvedValue({});
    renderComposer({ onSubmit });
    fireEvent.change(screen.getByLabelText('Review comment'), {
      target: { value: 'Needs a null check here please' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('Needs a null check here please');
    });
    expect(screen.queryByTestId('comment-validation-panel')).toBe(null);
  });

  it('non-validation failures keep the draft and name the problem', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('backend down'));
    renderComposer({ onSubmit });
    const textarea = screen.getByLabelText('Review comment');
    fireEvent.change(textarea, { target: { value: 'Needs a null check here please' } });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('backend down');
    });
    expect(textarea.value).toBe('Needs a null check here please');
  });
});
