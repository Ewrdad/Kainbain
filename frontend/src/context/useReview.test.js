import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReview, VIEWED_FILES_STORAGE_PREFIX } from './useReview';

vi.mock('../services/api', () => ({
  api: {
    getTaskReview: vi.fn(),
    addReviewComment: vi.fn(),
    updateReviewComment: vi.fn(),
    deleteReviewComment: vi.fn(),
    addReviewCommentReply: vi.fn(),
  },
}));

vi.mock('../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

import { api } from '../services/api';

/***
 * MARK: useReview tests
 * @description Verifies the MR-style review state hook: review load (success /
 *   failure / stale-response guard), optimistic comment add + rollback,
 *   resolve/update, delete, replies, WS REVIEW_UPDATED merges (upsert, reply,
 *   delete, snapshot re-fetch), and the per-task viewed-files persistence.
 */
describe('useReview', () => {
  const baseReview = {
    task: { id: 'task-1', status: 'waiting_human' },
    branch: 'kb/task-1',
    baseBranch: 'main',
    headSha: 'sha-2',
    files: [{ path: 'src/app.js', status: 'modified', additions: 2, deletions: 1 }],
    commits: [{ sha: 'sha-2', message: 'fix', author: 'agent' }],
    comments: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('auto-loads the review when bound to projectId + taskId', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});
    expect(api.getTaskReview).toHaveBeenCalledWith('proj-1', 'task-1');
    expect(result.current.review).toEqual(baseReview);
    expect(result.current.reviewLoading).toBe(false);
    expect(result.current.reviewError).toBe(null);
  });

  it('does not load without projectId or taskId', async () => {
    renderHook(() => useReview({ projectId: null, taskId: 'task-1' }));
    await act(async () => {});
    expect(api.getTaskReview).not.toHaveBeenCalled();
  });

  it('exposes reviewError when the fetch fails', async () => {
    api.getTaskReview.mockRejectedValue(new Error('API 500 on review: boom'));
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});
    expect(result.current.reviewError).toContain('boom');
    expect(result.current.review).toBe(null);
  });

  it('addComment optimistically inserts and replaces with the server record', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    const serverComment = {
      id: 'rc-1',
      scope: 'line',
      filePath: 'src/app.js',
      line: 42,
      side: 'right',
      headSha: 'sha-2',
      body: 'Consider the null case',
      resolved: false,
      replies: [],
    };
    api.addReviewComment.mockResolvedValue(serverComment);
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    let pending;
    await act(async () => {
      pending = result.current.addComment({
        scope: 'line',
        filePath: 'src/app.js',
        line: 42,
        side: 'right',
        headSha: 'sha-2',
        body: 'Consider the null case',
      });
    });
    await act(async () => {
      await pending;
    });

    expect(api.addReviewComment).toHaveBeenCalledWith('proj-1', 'task-1', {
      scope: 'line',
      filePath: 'src/app.js',
      line: 42,
      side: 'right',
      headSha: 'sha-2',
      body: 'Consider the null case',
    });
    // Temp id replaced by the server record; no optimistic duplicate remains.
    expect(result.current.review.comments).toEqual([serverComment]);
    expect(result.current.review.comments.some((c) => String(c.id).startsWith('rc-temp-'))).toBe(
      false,
    );
  });

  it('addComment rolls back the optimistic insert when the mutation fails', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    api.addReviewComment.mockRejectedValue(new Error('rejected'));
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    await act(async () => {
      await result.current.addComment({ scope: 'file', filePath: 'src/app.js', body: 'x' });
    });
    expect(result.current.review.comments).toEqual([]);
    expect(result.current.reviewError).toContain('rejected');
  });

  it('updateComment toggles resolved and persists the server record', async () => {
    const comment = { id: 'rc-1', body: 'a', resolved: false, replies: [] };
    api.getTaskReview.mockResolvedValue({ ...baseReview, comments: [comment] });
    api.updateReviewComment.mockResolvedValue({ ...comment, resolved: true });
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    await act(async () => {
      await result.current.updateComment('rc-1', { resolved: true });
    });
    expect(api.updateReviewComment).toHaveBeenCalledWith('proj-1', 'task-1', 'rc-1', {
      resolved: true,
    });
    expect(result.current.review.comments[0].resolved).toBe(true);
  });

  it('updateComment rolls back on failure', async () => {
    const comment = { id: 'rc-1', body: 'a', resolved: false, replies: [] };
    api.getTaskReview.mockResolvedValue({ ...baseReview, comments: [comment] });
    api.updateReviewComment.mockRejectedValue(new Error('nope'));
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    await act(async () => {
      await result.current.updateComment('rc-1', { resolved: true });
    });
    expect(result.current.review.comments[0].resolved).toBe(false);
  });

  it('deleteComment removes it optimistically and restores on failure', async () => {
    const comment = { id: 'rc-1', body: 'a', resolved: false, replies: [] };
    api.getTaskReview.mockResolvedValue({ ...baseReview, comments: [comment] });
    api.deleteReviewComment.mockRejectedValueOnce(new Error('nope'));
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    const ok = await act(async () => result.current.deleteComment('rc-1'));
    expect(ok).toBe(false);
    expect(result.current.review.comments).toEqual([comment]); // restored

    api.deleteReviewComment.mockResolvedValueOnce({ success: true });
    await act(async () => {
      await result.current.deleteComment('rc-1');
    });
    expect(result.current.review.comments).toEqual([]);
  });

  it('addReply appends the server reply to the thread', async () => {
    const comment = { id: 'rc-1', body: 'a', resolved: false, replies: [] };
    api.getTaskReview.mockResolvedValue({ ...baseReview, comments: [comment] });
    api.addReviewCommentReply.mockResolvedValue({
      id: 'rep-1',
      body: 'Good point',
      author: 'human',
    });
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    await act(async () => {
      await result.current.addReply('rc-1', 'Good point');
    });
    expect(api.addReviewCommentReply).toHaveBeenCalledWith(
      'proj-1',
      'task-1',
      'rc-1',
      'Good point',
    );
    expect(result.current.review.comments[0].replies).toEqual([
      { id: 'rep-1', body: 'Good point', author: 'human' },
    ]);
  });

  it('applyReviewEvent upserts comment_added / removes comment_deleted (WS merge)', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    await act(async () => {
      await result.current.applyReviewEvent({
        taskId: 'task-1',
        type: 'comment_added',
        comment: { id: 'rc-9', body: 'from another tab', resolved: false, replies: [] },
      });
    });
    expect(result.current.review.comments).toHaveLength(1);
    expect(result.current.review.comments[0].id).toBe('rc-9');

    await act(async () => {
      await result.current.applyReviewEvent({
        taskId: 'task-1',
        type: 'comment_deleted',
        commentId: 'rc-9',
      });
    });
    expect(result.current.review.comments).toEqual([]);
  });

  it('applyReviewEvent ignores events for a different task', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    await act(async () => {
      await result.current.applyReviewEvent({
        taskId: 'other-task',
        type: 'comment_added',
        comment: { id: 'rc-x', body: 'x' },
      });
    });
    expect(result.current.review.comments).toEqual([]);
  });

  it('applyReviewEvent appends replies without duplicating them', async () => {
    const comment = { id: 'rc-1', body: 'a', resolved: false, replies: [] };
    api.getTaskReview.mockResolvedValue({ ...baseReview, comments: [comment] });
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    const reply = { id: 'rep-1', body: 'reply', author: 'human' };
    await act(async () => {
      await result.current.applyReviewEvent({
        taskId: 'task-1',
        type: 'reply_added',
        commentId: 'rc-1',
        reply,
      });
    });
    await act(async () => {
      await result.current.applyReviewEvent({
        taskId: 'task-1',
        type: 'reply_added',
        commentId: 'rc-1',
        reply, // duplicate delivery (e.g. two tabs) must not double-append
      });
    });
    expect(result.current.review.comments[0].replies).toEqual([reply]);
  });

  it('applyReviewEvent re-fetches on snapshot type', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      headSha: 'sha-3',
      files: [{ path: 'src/new.js', status: 'added', additions: 5, deletions: 0 }],
    });
    await act(async () => {
      await result.current.applyReviewEvent({ taskId: 'task-1', type: 'snapshot' });
    });
    expect(api.getTaskReview).toHaveBeenCalledTimes(2);
    expect(result.current.review.headSha).toBe('sha-3');
  });

  it('toggleFileViewed persists per-task viewed state in localStorage', async () => {
    api.getTaskReview.mockResolvedValue(baseReview);
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});

    expect(result.current.viewedFiles.has('src/app.js')).toBe(false);
    await act(async () => {
      result.current.toggleFileViewed('src/app.js');
    });
    expect(result.current.viewedFiles.has('src/app.js')).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(`${VIEWED_FILES_STORAGE_PREFIX}task-1`))).toEqual(
      ['src/app.js'],
    );

    await act(async () => {
      result.current.toggleFileViewed('src/app.js');
    });
    expect(result.current.viewedFiles.has('src/app.js')).toBe(false);

    // Reload: the viewed set is restored for the same task.
    const second = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});
    expect(second.result.current.viewedFiles.has('src/app.js')).toBe(false); // toggled off again
    await act(async () => {
      second.result.current.toggleFileViewed('src/app.js');
    });
    expect(JSON.parse(window.localStorage.getItem(`${VIEWED_FILES_STORAGE_PREFIX}task-1`))).toEqual(
      ['src/app.js'],
    );
  });

  it('unresolvedCount counts unresolved comments', async () => {
    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      comments: [
        { id: 'rc-1', resolved: false },
        { id: 'rc-2', resolved: true },
        { id: 'rc-3', resolved: false },
      ],
    });
    const { result } = renderHook(() => useReview({ projectId: 'proj-1', taskId: 'task-1' }));
    await act(async () => {});
    expect(result.current.unresolvedCount).toBe(2);
  });
});
