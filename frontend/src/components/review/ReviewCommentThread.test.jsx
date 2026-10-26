import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewCommentThread } from './ReviewCommentThread';

/***
 * MARK: ReviewCommentThread tests
 * @description Verifies one inline comment thread: resolve/unresolve and
 *   delete single-flight wiring, replies (render + composer + submit), the
 *   "Outdated" stale badge, and the resolved styling.
 */
const baseComment = {
  id: 'rc-1',
  filePath: 'src/app.js',
  line: 42,
  side: 'right',
  scope: 'line',
  headSha: 'sha-2',
  author: 'human',
  body: 'This ignores the null case.',
  resolved: false,
  replies: [{ id: 'rep-1', body: 'Agreed, fixing.', author: 'agent' }],
};

describe('ReviewCommentThread', () => {
  let handlers;

  beforeEach(() => {
    handlers = {
      onReply: vi.fn().mockResolvedValue({ id: 'rep-2' }),
      onUpdate: vi.fn().mockResolvedValue({}),
      onDelete: vi.fn().mockResolvedValue(true),
    };
  });

  it('renders the author, body, and replies', () => {
    render(<ReviewCommentThread comment={baseComment} onReply={handlers.onReply} />);
    expect(screen.getByText('human')).toBeTruthy();
    expect(screen.getByText('This ignores the null case.')).toBeTruthy();
    expect(screen.getByText('Agreed, fixing.')).toBeTruthy();
    expect(screen.getByTestId('review-comment-thread')).toBeTruthy();
  });

  it('does not show the Outdated badge when the comment is current', () => {
    render(<ReviewCommentThread comment={baseComment} stale={false} {...handlers} />);
    expect(screen.queryByText('Outdated')).toBeNull();
  });

  it('shows the Outdated badge when headSha is stale (A6)', () => {
    render(<ReviewCommentThread comment={baseComment} stale {...handlers} />);
    expect(screen.getByText('Outdated')).toBeTruthy();
  });

  it('resolves and unresolves through onUpdate', async () => {
    const { rerender } = render(<ReviewCommentThread comment={baseComment} {...handlers} />);
    fireEvent.click(screen.getByText('✓ Resolve'));
    await vi.waitFor(() => {
      expect(handlers.onUpdate).toHaveBeenCalledWith('rc-1', { resolved: true });
    });

    rerender(<ReviewCommentThread comment={{ ...baseComment, resolved: true }} {...handlers} />);
    expect(screen.getByText('Resolved')).toBeTruthy();
    fireEvent.click(screen.getByText('↺ Unresolve'));
    await vi.waitFor(() => {
      expect(handlers.onUpdate).toHaveBeenCalledWith('rc-1', { resolved: false });
    });
  });

  it('deletes through onDelete', async () => {
    render(<ReviewCommentThread comment={baseComment} {...handlers} />);
    fireEvent.click(screen.getByLabelText('Delete comment'));
    await vi.waitFor(() => {
      expect(handlers.onDelete).toHaveBeenCalledWith('rc-1');
    });
  });

  it('opens the reply composer and submits the reply body', async () => {
    render(<ReviewCommentThread comment={baseComment} {...handlers} />);
    fireEvent.click(screen.getByText('+ Reply'));
    const composer = screen.getByTestId('review-comment-composer');
    fireEvent.change(composer.querySelector('textarea'), { target: { value: 'Good catch' } });
    fireEvent.click(screen.getByText('Add comment'));
    await vi.waitFor(() => {
      expect(handlers.onReply).toHaveBeenCalledWith('rc-1', 'Good catch');
    });
  });

  it('ignores a second click while a mutation is pending (single-flight)', async () => {
    let release;
    handlers.onDelete = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve(true), 30)),
    );
    render(<ReviewCommentThread comment={baseComment} {...handlers} />);
    const deleteBtn = screen.getByLabelText('Delete comment');
    fireEvent.click(deleteBtn);
    expect(deleteBtn.disabled).toBe(true);
    fireEvent.click(deleteBtn); // second click while pending must not re-dispatch
    await vi.waitFor(() => {
      expect(handlers.onDelete).toHaveBeenCalledTimes(1);
    });
    // Drain the still-pending (30ms) mutation so its setPending(false) callback
    // resolves while the jsdom environment is alive — otherwise it can fire
    // after file teardown and crash vitest with "window is not defined".
    await vi.waitFor(() => {
      expect(deleteBtn.disabled).toBe(false);
    });
  });

  it('hides mutation controls when canResolve is false (read-only review)', () => {
    render(<ReviewCommentThread comment={baseComment} canResolve={false} {...handlers} />);
    expect(screen.queryByText('✓ Resolve')).toBeNull();
    expect(screen.queryByLabelText('Delete comment')).toBeNull();
    // Replies remain possible in read-only mode.
    expect(screen.getByText('+ Reply')).toBeTruthy();
  });
});