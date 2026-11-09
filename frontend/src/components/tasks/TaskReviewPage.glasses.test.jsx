import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskReviewPage } from './TaskReviewPage';
import { KainBainContext } from '../../context/KainBainContext';
import { setGlassesViewportOverride } from '../util/viewport';

vi.mock('../../services/api', () => ({
  API_BASE: '',
  api: {
    getTaskReview: vi.fn(),
    addReviewComment: vi.fn(),
    updateReviewComment: vi.fn(),
    deleteReviewComment: vi.fn(),
    addReviewCommentReply: vi.fn(),
    listTaskImages: vi.fn(),
    uploadTaskImage: vi.fn(),
    deleteTaskImage: vi.fn(),
  },
}));

vi.mock('../../services/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));

vi.mock('../../services/clipboard', () => ({ copyToClipboard: vi.fn().mockResolvedValue(true) }));

import { api } from '../../services/api';

/***
 * MARK: TaskReviewPage glasses tests
 * @description Guards the Meta Ray-Ban branch of the review page: a
 *   glasses-shaped viewport renders the quick review (name, step, two
 *   lines, Approve/Details) with approve gated behind "Are you sure?",
 *   while every other viewport renders the full MR-style page unchanged.
 ***/

const baseReview = {
  task: {
    id: 'task-101',
    title: 'Fix auth race',
    goal: 'Fix the auth race.',
    status: 'waiting_human',
  },
  branch: 'kb/task-101',
  baseBranch: 'main',
  baseSha: 'aaa',
  headSha: 'sha-2',
  behindBy: 1,
  aheadBy: 3,
  uncommittedChanges: false,
  branchSupported: true,
  commits: [{ sha: 'b2b2b2', message: 'Fix the auth race', author: 'agent', date: 'T2' }],
  files: [
    {
      path: 'src/auth.js',
      status: 'modified',
      additions: 2,
      deletions: 1,
      binary: false,
      tooLarge: false,
      diff: 'diff --git a/src/auth.js b/src/auth.js',
    },
  ],
  comments: [],
};

const renderPage = (overrides = {}) => {
  const context = {
    selectedTask: {
      id: 'task-101',
      title: 'Fix auth race',
      goal: 'Fix the auth race.',
      status: 'waiting_human',
      currentStageId: 'st-2',
    },
    setView: vi.fn(),
    activeProjectId: 'proj-1',
    projects: [
      {
        id: 'proj-1',
        name: 'KainBain',
        useBranches: true,
        stages: [
          { id: 'st-1', name: 'Build', type: 'agent' },
          { id: 'st-2', name: 'Code Review', type: 'human' },
        ],
      },
    ],
    lastReviewEvent: null,
    advanceTask: vi.fn().mockResolvedValue(undefined),
    rejectTaskWithFeedback: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(
    <KainBainContext.Provider value={context}>
      <TaskReviewPage />
    </KainBainContext.Provider>,
  );
  return context;
};

describe('TaskReviewPage glasses mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.getTaskReview.mockResolvedValue(structuredClone(baseReview));
    api.listTaskImages.mockResolvedValue({ images: [] });
    setGlassesViewportOverride(null);
  });

  afterEach(() => {
    window.localStorage.clear();
    setGlassesViewportOverride(null);
  });

  it('renders the quick review, not the full page', async () => {
    setGlassesViewportOverride(true);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('glasses-quick-review')).toBeInTheDocument());

    expect(screen.getByRole('heading', { name: 'Fix auth race' })).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Code Review')).toBeInTheDocument();
    expect(screen.queryByTestId('task-review-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('diff-view')).not.toBeInTheDocument();
  });

  it('approve calls advanceTask only after the confirm second tap', async () => {
    setGlassesViewportOverride(true);
    const context = renderPage();
    await waitFor(() => expect(screen.getByTestId('glasses-quick-review')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(context.advanceTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, approve' }));
    await waitFor(() => expect(context.advanceTask).toHaveBeenCalledTimes(1));
    expect(context.advanceTask).toHaveBeenCalledWith('proj-1', 'task-101', { guidance: undefined });
  });

  it('details never approves and points at a larger screen', async () => {
    setGlassesViewportOverride(true);
    const context = renderPage();
    await waitFor(() => expect(screen.getByTestId('glasses-quick-review')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByTestId('glasses-review-details')).toHaveTextContent(
      'Open on a larger screen for the full diff',
    );
    expect(context.advanceTask).not.toHaveBeenCalled();
  });

  it('non-glasses viewport renders the full page exactly as before (parity)', async () => {
    setGlassesViewportOverride(false);
    renderPage();
    await waitFor(() => expect(screen.getByTestId('task-review-page')).toBeInTheDocument());

    expect(screen.queryByTestId('glasses-quick-review')).not.toBeInTheDocument();
    expect(screen.getByTestId('diff-view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Files Changed/ })).toBeInTheDocument();
  });
});
