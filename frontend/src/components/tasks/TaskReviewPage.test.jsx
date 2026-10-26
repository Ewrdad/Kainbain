import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { TaskReviewPage } from './TaskReviewPage';
import { KainBainContext } from '../../context/KainBainContext';

vi.mock('../../services/api', () => ({
  // API_BASE backs the task-image URL resolution in MarkdownViewer.
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
import { copyToClipboard } from '../../services/clipboard';

/***
 * MARK: TaskReviewPage tests
 * @description Verifies the MR-style review page: data load + blocked states,
 *   the Files Changed / Conversation tabs, the Pass flow (advance with
 *   optional guidance, A5/A7) and the Fail flow (reject with feedback composed
 *   from unresolved per-line comments, A5/A6), read-only gating, and the
 *   REVIEW_UPDATED live merge. The full example loop (A1–A6) is exercised
 *   end-to-end in the mocked harness in the final test.
 */
const baseReview = {
  task: { id: 'task-101', title: 'Fix auth race', goal: 'Fix the auth race.', status: 'waiting_human' },
  branch: 'kb/task-101',
  baseBranch: 'main',
  baseSha: 'aaa',
  headSha: 'sha-2',
  behindBy: 1,
  aheadBy: 3,
  uncommittedChanges: false,
  branchSupported: true,
  commits: [
    { sha: 'b2b2b2', message: 'commit 2', author: 'agent', date: 'T2' },
    { sha: 'a1a1a1', message: 'commit 1', author: 'agent', date: 'T1' },
  ],
  files: [
    {
      path: 'src/auth.js',
      status: 'modified',
      additions: 2,
      deletions: 1,
      binary: false,
      tooLarge: false,
      diff: [
        'diff --git a/src/auth.js b/src/auth.js',
        '--- a/src/auth.js',
        '+++ b/src/auth.js',
        '@@ -1,3 +1,3 @@',
        ' const a = 1;',
        '-const b = 2;',
        '+const b = 3;',
      ].join('\n'),
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
        stages: [{ id: 'st-2', name: 'Code Review', type: 'human' }],
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

describe('TaskReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.getTaskReview.mockResolvedValue(structuredClone(baseReview));
    api.listTaskImages.mockResolvedValue({ images: [] });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the header with branch label, ahead/behind, and stage chip', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('kb/task-101 → main')).toBeTruthy());
    expect(screen.getByText('↓1 ↑3')).toBeTruthy();
    expect(screen.getByText('Stage: Code Review')).toBeTruthy();
    expect(screen.getByText(/#KB-TAS/)).toBeTruthy(); // formatTaskKey abbreviation
  });

  it('links the upstream comparison when the project has a gitUrl', async () => {
    renderPage({
      projects: [
        {
          id: 'proj-1',
          useBranches: true,
          gitUrl: 'https://git.example.com/team/demo.git',
          stages: [{ id: 'st-2', name: 'Code Review', type: 'human' }],
        },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    const link = screen.getByLabelText(/Open the same comparison upstream/);
    expect(link.getAttribute('href')).toBe(
      'https://git.example.com/team/demo/compare/main...kb/task-101',
    );
  });

  it('hides the upstream link when the project has no gitUrl', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.queryByLabelText(/Open the same comparison upstream/)).toBeNull();
  });

  it('renders Files Changed by default with the diff and the sidebar', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.getByText('1 files changed')).toBeTruthy();
    expect(screen.getByText(/@@ -1,3 \+1,3 @@/)).toBeTruthy();
    expect(screen.getByTestId('file-diff-list')).toBeTruthy();
  });

  it('switches to the Conversation tab showing commits newest-first and the goal', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Conversation/ }));
    expect(screen.getByText('Commits (2)')).toBeTruthy();
    const list = screen.getByText('commit 2').closest('ul');
    expect(list.textContent.indexOf('commit 2')).toBeLessThan(list.textContent.indexOf('commit 1'));
    expect(screen.getByText('Review Comments (0 unresolved)')).toBeTruthy();
    expect(screen.getByText(/Fix the auth race\./)).toBeTruthy();
  });

  it('shows the loading state before the review arrives', () => {
    api.getTaskReview.mockReturnValue(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByText('Loading review…')).toBeTruthy();
  });

  it('shows the no-task empty state when nothing is selected', () => {
    renderPage({ selectedTask: null });
    expect(screen.getByText(/No task selected/)).toBeTruthy();
  });

  it('shows the branch-unsupported blocked state and keeps Pass/Fail usable (D7)', async () => {
    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      branchSupported: false,
      files: [],
      reason: 'Branch support is disabled for this project.',
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('PR review unavailable')).toBeTruthy());
    // Pass/Fail remain available for plan/document reviews.
    expect(screen.getByText('▶ Pass Stage & Complete')).toBeTruthy();
    expect(screen.getByText('✕ Fail Stage')).toBeTruthy();
  });

  it('shows the nothing-to-review empty state for zero changes', async () => {
    api.getTaskReview.mockResolvedValue({ ...baseReview, files: [] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Nothing to review yet/)).toBeTruthy(),
    );
  });

  it('shows the uncommitted-changes badge when the tree is dirty off-branch', async () => {
    api.getTaskReview.mockResolvedValue({ ...baseReview, uncommittedChanges: true });
    renderPage();
    await waitFor(() => expect(screen.getByText('Uncommitted changes elsewhere')).toBeTruthy());
  });

  it('Pass opens the guidance modal and calls advanceTask with guidance (A5, A7)', async () => {
    const ctx = renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Pass this stage/i));
    const composer = screen.getByRole('dialog', { name: /Pass stage/i });
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Ship it, but add tests' },
    });
    fireEvent.click(screen.getAllByText(/▶ Pass Stage/).pop());
    await waitFor(() => {
      expect(ctx.advanceTask).toHaveBeenCalledWith('proj-1', 'task-101', {
        guidance: 'Ship it, but add tests',
      });
    });
  });

  it('Fail pre-fills feedback from unresolved comments grouped by file (A5, D5)', async () => {
    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      comments: [
        {
          id: 'rc-1',
          filePath: 'src/auth.js',
          line: 2,
          side: 'left',
          scope: 'line',
          headSha: 'sha-2',
          body: 'Do not remove this guard',
          resolved: false,
          replies: [],
        },
        {
          id: 'rc-2',
          filePath: 'src/auth.js',
          line: 3,
          side: 'right',
          scope: 'line',
          headSha: 'sha-2',
          body: 'Naming: use sessionUser',
          resolved: false,
          replies: [],
        },
        {
          id: 'rc-3',
          filePath: 'src/auth.js',
          scope: 'file',
          body: 'Resolved comment is excluded',
          resolved: true,
          replies: [],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    const textarea = dialog.querySelector('textarea');
    expect(textarea.value).toContain('## Review comments');
    expect(textarea.value).toContain('`src/auth.js`:L2 — Do not remove this guard');
    expect(textarea.value).toContain('`src/auth.js`:L3 — Naming: use sessionUser');
    expect(textarea.value).not.toContain('Resolved comment is excluded');
  });

  it('Fail submits the composed feedback through rejectTaskWithFeedback', async () => {
    const ctx = renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'Fix the failing test' } });
    fireEvent.click(screen.getAllByText('✕ Fail Stage').pop());
    await waitFor(() => {
      expect(ctx.rejectTaskWithFeedback).toHaveBeenCalledWith('proj-1', 'task-101', 'Fix the failing test');
    });
    expect(ctx.setView).toHaveBeenCalledWith('task-detail', { taskId: 'task-101' });
  });

  it('Fail blocks submit while the feedback draft is empty', async () => {
    const ctx = renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: '   ' } });
    const submit = screen.getAllByText('✕ Fail Stage').pop();
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(ctx.rejectTaskWithFeedback).not.toHaveBeenCalled();
  });

  it('Fail keeps the modal open with the draft when the rejection fails', async () => {
    const ctx = renderPage({
      rejectTaskWithFeedback: vi.fn().mockRejectedValue(new Error('backend down')),
    });
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'Fix the failing test' } });
    fireEvent.click(screen.getAllByText('✕ Fail Stage').pop());
    await waitFor(() => {
      expect(ctx.rejectTaskWithFeedback).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        'Fix the failing test',
      );
    });
    // No navigation away: the modal stays open with the draft for a retry.
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Fail stage with feedback' })).toBeTruthy();
    });
    expect(ctx.setView).not.toHaveBeenCalled();
    expect(
      screen.getByRole('dialog', { name: 'Fail stage with feedback' }).querySelector('textarea')
        .value,
    ).toBe('Fix the failing test');
  });

  /***
   * MARK: TaskReviewPage fail-modal image-attach tests
   * @description The Fail Stage modal composes the shared TaskImageAttach
   *   affordance: screenshots land in the task's assets/ folder, their
   *   markdown ref joins the feedback draft, and handleFail submits the
   *   combined text through the untouched reject path.
   ***/
  async function openFailModal() {
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    return screen.getByRole('dialog', { name: 'Fail stage with feedback' });
  }

  function uploadIntoFailModal(dialog, name = 'shot.png') {
    const input = dialog.querySelector('[data-testid="task-image-input"]');
    const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });
  }

  it('Fail offers image attach and submits feedback containing the image ref', async () => {
    const ctx = renderPage();
    api.uploadTaskImage.mockResolvedValue({ name: 'shot.png', path: 'assets/shot.png' });
    const dialog = await openFailModal();

    // The shared attach affordance renders inside the fail modal.
    expect(dialog.querySelector('[data-testid="task-image-attach"]')).toBeTruthy();
    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'The error dialog overlaps the form' } });
    await act(async () => {
      uploadIntoFailModal(dialog);
    });
    await waitFor(() => expect(textarea.value).toContain('![shot.png](assets/shot.png)'));

    fireEvent.click(screen.getAllByText('✕ Fail Stage').pop());
    await waitFor(() => {
      expect(ctx.rejectTaskWithFeedback).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.stringContaining('![shot.png](assets/shot.png)'),
      );
    });
    expect(ctx.rejectTaskWithFeedback.mock.calls[0][2]).toContain(
      'The error dialog overlaps the form',
    );
  });

  it('Fail keeps attached images in the draft when the rejection fails', async () => {
    const ctx = renderPage({
      rejectTaskWithFeedback: vi.fn().mockRejectedValue(new Error('backend down')),
    });
    api.uploadTaskImage.mockResolvedValue({ name: 'shot.png', path: 'assets/shot.png' });
    const dialog = await openFailModal();

    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'Fix the failing test' } });
    await act(async () => {
      uploadIntoFailModal(dialog);
    });
    await waitFor(() => expect(textarea.value).toContain('![shot.png](assets/shot.png)'));

    fireEvent.click(screen.getAllByText('✕ Fail Stage').pop());
    await waitFor(() => {
      expect(ctx.rejectTaskWithFeedback).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.stringContaining('![shot.png](assets/shot.png)'),
      );
    });
    // The modal stays open with feedback AND the image ref intact for a retry.
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Fail stage with feedback' })).toBeTruthy();
    });
    expect(
      screen.getByRole('dialog', { name: 'Fail stage with feedback' }).querySelector('textarea')
        .value,
    ).toContain('![shot.png](assets/shot.png)');
    expect(ctx.setView).not.toHaveBeenCalled();
  });

  it('Fail blocks submit while an image upload is in flight', async () => {
    renderPage();
    let resolveUpload;
    api.uploadTaskImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = () => resolve({ name: 'shot.png', path: 'assets/shot.png' });
        }),
    );
    const dialog = await openFailModal();

    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'Fix the failing test' } });
    uploadIntoFailModal(dialog);

    await waitFor(() => {
      expect(screen.getAllByText('✕ Fail Stage').pop()).toBeDisabled();
    });
    await act(async () => {
      resolveUpload();
    });
    await waitFor(() => {
      expect(screen.getAllByText('✕ Fail Stage').pop()).toBeEnabled();
    });
  });

  it('Fail modal multi-select links every image in order, one after another', async () => {
    // Regression for the stale-closure bug: multi-select on mobile used to
    // link only the last image. The batch handler folds all refs into one
    // functional setState, so every image lands in selection order.
    const ctx = renderPage();
    api.uploadTaskImage.mockImplementation(async (_projectId, _taskId, file) => ({
      name: file.name,
      path: `assets/${file.name}`,
    }));
    const dialog = await openFailModal();

    const textarea = dialog.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'The build fails' } });
    const input = dialog.querySelector('[data-testid="task-image-input"]');
    const files = ['a.png', 'b.png', 'c.png'].map(
      (name) => new File([new Uint8Array([1])], name, { type: 'image/png' }),
    );
    await act(async () => {
      fireEvent.change(input, { target: { files } });
    });

    await waitFor(() => expect(api.uploadTaskImage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(textarea.value).toContain('![c.png](assets/c.png)'));
    const value = textarea.value;
    const idxA = value.indexOf('![a.png](assets/a.png)');
    const idxB = value.indexOf('![b.png](assets/b.png)');
    const idxC = value.indexOf('![c.png](assets/c.png)');
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxB).toBeGreaterThanOrEqual(0);
    expect(idxC).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
    // The pre-existing feedback text is preserved at the top.
    expect(value.startsWith('The build fails')).toBe(true);

    // Submitting sends all three refs through the reject path.
    fireEvent.click(screen.getAllByText('✕ Fail Stage').pop());
    await waitFor(() => {
      expect(ctx.rejectTaskWithFeedback).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.stringContaining('![a.png](assets/a.png)'),
      );
    });
    const sent = ctx.rejectTaskWithFeedback.mock.calls[0][2];
    expect(sent).toContain('![b.png](assets/b.png)');
    expect(sent).toContain('![c.png](assets/c.png)');
  });

  it('navigates back to task detail after a successful Pass', async () => {
    const ctx = renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Pass this stage/i));
    const dialog = screen.getByRole('dialog', { name: /Pass stage/i });
    fireEvent.click(screen.getAllByText(/▶ Pass Stage/).pop());
    await waitFor(() => {
      expect(ctx.advanceTask).toHaveBeenCalledWith('proj-1', 'task-101', { guidance: undefined });
    });
    expect(ctx.setView).toHaveBeenCalledWith('task-detail', { taskId: 'task-101' });
  });

  it('is read-only (no Pass/Fail) when the task is not waiting on a human', async () => {
    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      task: { ...baseReview.task, status: 'in_stage' },
    });
    renderPage({
      selectedTask: { id: 'task-101', status: 'in_stage', currentStageId: 'st-1' },
      projects: [
        {
          id: 'proj-1',
          useBranches: true,
          stages: [{ id: 'st-2', name: 'Code Review', type: 'human' }],
        },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.queryByLabelText(/Pass this stage/i)).toBeNull();
    expect(screen.queryByLabelText('Fail this stage with feedback')).toBeNull();
    expect(screen.getByText(/Read-only review/)).toBeTruthy();
  });

  it('merges a REVIEW_UPDATED comment_added event live (A6)', async () => {
    const context = {
      selectedTask: { id: 'task-101' },
      setView: vi.fn(),
      activeProjectId: 'proj-1',
      projects: [{ id: 'proj-1', useBranches: true, stages: [] }],
      lastReviewEvent: null,
      advanceTask: vi.fn(),
      rejectTaskWithFeedback: vi.fn(),
    };
    const { rerender: rerenderPage } = render(
      <KainBainContext.Provider value={context}>
        <TaskReviewPage />
      </KainBainContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());

    // A comment arrives from another tab while the review is open.
    context.lastReviewEvent = {
      taskId: 'task-101',
      type: 'comment_added',
      _seq: 1,
      comment: {
        id: 'rc-live',
        filePath: 'src/auth.js',
        line: 1,
        side: 'right',
        scope: 'line',
        body: 'from another tab',
        resolved: false,
        replies: [],
      },
    };
    rerenderPage(
      <KainBainContext.Provider value={{ ...context }}>
        <TaskReviewPage />
      </KainBainContext.Provider>,
    );
    await waitFor(() => {
      expect(screen.getByText('from another tab')).toBeTruthy();
    });
    // The comment also appears in the Conversation tab counter.
    fireEvent.click(screen.getByRole('button', { name: /Conversation/ }));
    expect(screen.getByText('Review Comments (1 unresolved)')).toBeTruthy();
  });

  it('shows stale "Outdated" threads in the Conversation tab after agent fixes (A6)', async () => {
    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      comments: [
        {
          id: 'rc-old',
          filePath: 'src/auth.js',
          line: 2,
          side: 'left',
          scope: 'line',
          headSha: 'old-sha',
          body: 'Fix this line',
          resolved: false,
          replies: [],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Conversation/ }));
    expect(screen.getByText('Outdated')).toBeTruthy();
    expect(screen.getByText('Fix this line')).toBeTruthy();
  });

  it('adds a comment from the diff and it lands in the conversation (A2)', async () => {
    api.addReviewComment.mockResolvedValue({
      id: 'rc-1',
      scope: 'line',
      filePath: 'src/auth.js',
      line: 1,
      side: 'right',
      headSha: 'sha-2',
      body: 'Prefer early return',
      resolved: false,
      replies: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Add comment on new line 1'));
    const composer = screen.getByTestId('review-comment-composer');
    fireEvent.change(composer.querySelector('textarea'), { target: { value: 'Prefer early return' } });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => {
      expect(api.addReviewComment).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.objectContaining({ scope: 'line', line: 1, body: 'Prefer early return' }),
      );
    });
    expect(screen.getByText('Prefer early return')).toBeTruthy();
  });

  /***
   * The full example loop from the task brief (A1–A6), in the mocked harness:
   * open review → comment on a line → Fail with composed comments →
   * simulated agent fix (new snapshot) → re-open → stale badge + refreshed
   * diff → Pass.
   ***/
  it('runs the full reject→fix→re-review→pass loop (A1–A6)', async () => {
    const context = {
      selectedTask: {
        id: 'task-101',
        goal: 'Fix the auth race.',
        status: 'waiting_human',
        currentStageId: 'st-2',
      },
      setView: vi.fn(),
      activeProjectId: 'proj-1',
      projects: [
        { id: 'proj-1', useBranches: true, stages: [{ id: 'st-2', name: 'Code Review', type: 'human' }] },
      ],
      lastReviewEvent: null,
      advanceTask: vi.fn().mockResolvedValue(undefined),
      rejectTaskWithFeedback: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender: rerenderPage } = render(
      <KainBainContext.Provider value={context}>
        <TaskReviewPage />
      </KainBainContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());

    // 1. Human comments on a line.
    api.addReviewComment.mockResolvedValue({
      id: 'rc-1',
      scope: 'line',
      filePath: 'src/auth.js',
      line: 2,
      side: 'left',
      headSha: 'sha-2',
      body: 'This guard drops the null case',
      resolved: false,
      replies: [],
    });
    fireEvent.click(screen.getByLabelText('Add comment on old line 2'));
    const composer = screen.getByTestId('review-comment-composer');
    fireEvent.change(composer.querySelector('textarea'), { target: { value: 'This guard drops the null case' } });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => expect(screen.getByText('This guard drops the null case')).toBeTruthy());

    // 2. Human fails the stage — feedback pre-filled from the comment.
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    expect(dialog.querySelector('textarea').value).toContain(
      '`src/auth.js`:L2 — This guard drops the null case',
    );
    fireEvent.click(screen.getAllByText('✕ Fail Stage').pop());
    await waitFor(() => {
      expect(context.rejectTaskWithFeedback).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.stringContaining('This guard drops the null case'),
      );
    });
    expect(context.setView).toHaveBeenCalledWith('task-detail', { taskId: 'task-101' });

    // 3. Agent fixes; the review now reports a new head (comments stale).
    api.getTaskReview.mockResolvedValue({
      ...baseReview,
      headSha: 'sha-3',
      commits: [{ sha: 'c3c3c3', message: 'fix null case', author: 'agent' }],
      comments: [
        {
          id: 'rc-1',
          filePath: 'src/auth.js',
          line: 2,
          side: 'left',
          scope: 'line',
          headSha: 'sha-2',
          body: 'This guard drops the null case',
          resolved: false,
          replies: [],
        },
      ],
    });
    context.lastReviewEvent = { taskId: 'task-101', type: 'snapshot', _seq: 1 };
    rerenderPage(
      <KainBainContext.Provider value={{ ...context }}>
        <TaskReviewPage />
      </KainBainContext.Provider>,
    );
    await waitFor(() => expect(api.getTaskReview).toHaveBeenCalledTimes(2));

    // 4. Human re-reviews: comment still visible, marked Outdated.
    fireEvent.click(screen.getByRole('button', { name: /Conversation/ }));
    await waitFor(() => {
      expect(screen.getByText('Outdated')).toBeTruthy();
      expect(screen.getByText('This guard drops the null case')).toBeTruthy();
    });

    // 5. Human resolves the comment and passes the stage.
    api.updateReviewComment.mockResolvedValue({
      id: 'rc-1',
      resolved: true,
      body: 'This guard drops the null case',
    });
    fireEvent.click(screen.getByText('✓ Resolve'));
    await waitFor(() => expect(api.updateReviewComment).toHaveBeenCalled());

    fireEvent.click(screen.getByLabelText(/Pass this stage/i));
    fireEvent.click(screen.getAllByText(/▶ Pass Stage/).pop());
    await waitFor(() => {
      expect(context.advanceTask).toHaveBeenCalledWith('proj-1', 'task-101', {
        guidance: undefined,
      });
    });
  });

  it('renders Merged change / New since merge sections for a preserved review', async () => {
    api.getTaskReview.mockResolvedValue({
      ...structuredClone(baseReview),
      preserved: true,
      reviewBaseline: {
        baseSha: 'aaa',
        headSha: 'sha-2',
        mainSha: 'aaa',
        mergedAt: '2026-09-24T00:00:00.000Z',
        stageId: 'merge-1',
      },
      newSinceMerge: {
        files: [
          {
            path: 'src/fix.js',
            status: 'added',
            additions: 1,
            deletions: 0,
            binary: false,
            tooLarge: false,
            diff: 'diff --git a/src/fix.js b/src/fix.js\n+const fix = 1;',
          },
        ],
        commits: [{ sha: 'f1f1f1', message: 'address feedback', author: 'agent' }],
        behindBy: 0,
        aheadBy: 1,
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Merged change')).toBeTruthy());
    expect(screen.getByText('New since merge')).toBeTruthy();
    // Both the frozen file and the fix-up file render.
    expect(screen.getAllByTestId('diff-view')).toHaveLength(2);
    expect(
      screen.getByText(/Showing the preserved diff from the merge/),
    ).toBeTruthy();
  });

  it('shows the fix-up commits under New since merge in the Conversation tab', async () => {
    api.getTaskReview.mockResolvedValue({
      ...structuredClone(baseReview),
      preserved: true,
      reviewBaseline: { baseSha: 'aaa', headSha: 'sha-2' },
      newSinceMerge: {
        files: [],
        commits: [{ sha: 'f1f1f1', message: 'address feedback', author: 'agent' }],
        behindBy: 0,
        aheadBy: 1,
      },
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Conversation/ }));
    expect(screen.getByText('New since merge (1)')).toBeTruthy();
    expect(screen.getByText('address feedback')).toBeTruthy();
  });

  it('renders a single section when the preserved review has no new work', async () => {
    api.getTaskReview.mockResolvedValue({
      ...structuredClone(baseReview),
      preserved: true,
      reviewBaseline: { baseSha: 'aaa', headSha: 'sha-2' },
      newSinceMerge: null,
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.queryByText('Merged change')).toBeNull();
    expect(screen.queryByText('New since merge')).toBeNull();
    expect(screen.getByText(/No new changes since the merge/)).toBeTruthy();
  });

  it('shows the fallback note when the baseline SHAs are unavailable', async () => {
    api.getTaskReview.mockResolvedValue({
      ...structuredClone(baseReview),
      preserved: false,
      preserveNote: 'The preserved merge diff is unavailable (history pruned); showing the live diff instead.',
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/history pruned/)).toBeTruthy(),
    );
  });
});
describe('TaskReviewPage copy checkout', () => {
  it('copies the authoritative branch command and shows Copied feedback', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    const copyBtn = screen.getByRole('button', { name: 'Copy checkout command for branch kb/task-101' });
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith('git fetch origin && git checkout kb/task-101');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy checkout command for branch kb/task-101' })).toHaveTextContent('Copied ✓');
    });
  });

  it('hides the copy button when the review has no branch', async () => {
    api.getTaskReview.mockResolvedValue({ ...structuredClone(baseReview), branch: null });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Copy checkout command for branch/ })).toBeNull();
  });
});
describe('TaskReviewPage tab persistence', () => {
  it('restores the Conversation tab from localStorage after refresh', async () => {
    window.localStorage.setItem('kainbain:review:activeTab', JSON.stringify('conversation'));
    renderPage();
    const conversationTab = await screen.findByRole('button', { name: /Conversation/ });
    expect(conversationTab).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/Review Comments/)).toBeTruthy();
  });

  it('falls back to Files Changed on corrupt storage', async () => {
    window.localStorage.setItem('kainbain:review:activeTab', JSON.stringify('bogus'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.getByText('1 files changed')).toBeTruthy();
  });

  it('writes the tab choice to localStorage', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Conversation/ }));
    expect(window.localStorage.getItem('kainbain:review:activeTab')).toBe(
      JSON.stringify('conversation'),
    );
  });
});

describe('TaskReviewPage last-stage approval wording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.getTaskReview.mockResolvedValue(structuredClone(baseReview));
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('says Pass Stage & Complete when the checkpoint is the last stage', async () => {
    // Default renderPage fixture: single human stage, so passing completes.
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    const footerBtn = screen.getByRole('button', { name: 'Pass this stage and complete' });
    expect(footerBtn.textContent).toContain('▶ Pass Stage & Complete');
    fireEvent.click(footerBtn);
    const dialog = screen.getByRole('dialog', { name: 'Pass stage and complete' });
    // Dialog title + confirm button both carry the terminal wording.
    expect(within(dialog).getAllByText('▶ Pass Stage & Complete')).toHaveLength(2);
    expect(within(dialog).getByText(/This completes the task/)).toBeTruthy();
    expect(within(dialog).getByLabelText('Guidance note (optional)')).toBeTruthy();
    expect(screen.queryByText('▶ Pass Stage', { exact: true })).toBeNull();
  });

  it('keeps Pass Stage wording for a mid-pipeline checkpoint', async () => {
    renderPage({
      selectedTask: {
        id: 'task-101',
        title: 'Fix auth race',
        goal: 'Fix the auth race.',
        status: 'waiting_human',
        currentStageId: 'st-2',
      },
      projects: [
        {
          id: 'proj-1',
          name: 'KainBain',
          useBranches: true,
          stages: [
            { id: 'st-1', name: 'Build', type: 'agent' },
            { id: 'st-2', name: 'Code Review', type: 'human' },
            { id: 'st-3', name: 'Merge', type: 'merge' },
          ],
        },
      ],
    });
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    const footerBtn = screen.getByRole('button', { name: 'Pass this stage' });
    expect(footerBtn.textContent).toContain('▶ Pass Stage');
    fireEvent.click(footerBtn);
    const dialog = screen.getByRole('dialog', { name: 'Pass stage' });
    expect(within(dialog).getAllByText('▶ Pass Stage', { exact: true })).toHaveLength(2);
    expect(within(dialog).getByText(/advances the task to the next stage/)).toBeTruthy();
    expect(within(dialog).getByLabelText('Guidance for the next stage')).toBeTruthy();
    expect(screen.queryByText('▶ Pass Stage & Complete')).toBeNull();
  });
});

describe('TaskReviewPage reports tab', () => {
  const REPORT = {
    path: './docs/tasks/task-101/IMPLEMENTATION_PLAN.md',
    filename: 'IMPLEMENTATION_PLAN.md',
    stageName: 'Plan',
    auto: true,
    timestamp: '20261012-071931',
    content: ['# Plan', 'Add retries', 'Ship it'].join('\n'),
  };

  const withReports = (overrides = {}) =>
    api.getTaskReview.mockResolvedValue({
      ...structuredClone(baseReview),
      reports: [REPORT],
      ...overrides,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.getTaskReview.mockResolvedValue(structuredClone(baseReview));
    api.listTaskImages.mockResolvedValue({ images: [] });
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('shows a Reports (N) tab that renders the report list and line review', async () => {
    withReports();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    const tab = screen.getByRole('button', { name: /Reports \(1\)/ });
    fireEvent.click(tab);
    expect(screen.getByTestId('report-review-list')).toBeTruthy();
    expect(screen.getByTestId('report-review-view')).toBeTruthy();
    expect(screen.getAllByTestId('report-line')).toHaveLength(3);
    expect(screen.getByText('Plan')).toBeTruthy();
  });

  it('switches the reviewed report from the mobile picker', async () => {
    const REPORT_B = {
      path: './docs/tasks/task-101/REVIEW.md',
      filename: 'REVIEW.md',
      stageName: 'Review',
      auto: false,
      timestamp: '20261012-080000',
      content: ['# Review', 'Looks good'].join('\n'),
    };
    withReports({ reports: [REPORT, REPORT_B] });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Reports \(2\)/ }));

    const picker = screen.getByTestId('report-review-picker');
    expect(picker.value).toBe(REPORT.path);
    expect(screen.getByTestId('report-review-view').getAttribute('data-report-path')).toBe(
      REPORT.path,
    );

    fireEvent.change(picker, { target: { value: REPORT_B.path } });
    await waitFor(() =>
      expect(screen.getByTestId('report-review-view').getAttribute('data-report-path')).toBe(
        REPORT_B.path,
      ),
    );
    expect(screen.getByTestId('report-review-picker').value).toBe(REPORT_B.path);
    // The desktop list stays in the DOM (CSS-hidden on mobile) and follows.
    const listButtons = within(screen.getByTestId('report-review-list')).getAllByRole('button');
    expect(listButtons[1].getAttribute('aria-current')).toBe('true');
  });

  it('marks AUTO and unresolved counts in the mobile picker options', async () => {
    withReports({
      comments: [
        {
          id: 'rc-picker',
          scope: 'line',
          filePath: REPORT.path,
          line: 1,
          side: 'right',
          headSha: 'sha-2',
          body: 'Picker badge note',
          resolved: false,
          replies: [],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Reports \(1\)/ }));
    const option = within(screen.getByTestId('report-review-picker')).getAllByRole('option')[0];
    expect(option.textContent).toBe('Plan • AUTO • 1 unresolved');
  });

  it('keeps the Reports tab reachable when the git diff is empty', async () => {
    withReports({ files: [] });
    renderPage();
    // No code files: the Files tab explains and links to the reports.
    await waitFor(() => expect(screen.getByText(/Review the stage reports instead/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Reports \(1\)/ }));
    expect(screen.getAllByTestId('report-line')).toHaveLength(3);
  });

  it('line-comments a report and carries it into the fail draft', async () => {
    withReports();
    api.addReviewComment.mockResolvedValue({
      id: 'rc-report',
      scope: 'line',
      filePath: REPORT.path,
      line: 2,
      side: 'right',
      headSha: 'sha-2',
      body: 'Explain the retry cap',
      resolved: false,
      replies: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Reports \(1\)/ }));
    fireEvent.click(screen.getByLabelText('Add comment on report line 2'));
    const composer = screen.getByTestId('review-comment-composer');
    fireEvent.change(composer.querySelector('textarea'), {
      target: { value: 'Explain the retry cap' },
    });
    fireEvent.click(screen.getByText('Add comment'));
    await waitFor(() => expect(api.addReviewComment).toHaveBeenCalled());
    expect(api.addReviewComment).toHaveBeenCalledWith(
      'proj-1',
      'task-101',
      expect.objectContaining({
        scope: 'line',
        filePath: REPORT.path,
        line: 2,
        body: 'Explain the retry cap',
      }),
    );

    // The report comment joins the fail draft grouped by its report path.
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    const draft = dialog.querySelector('textarea').value;
    expect(draft).toContain(REPORT.path);
    expect(draft).toContain(':L2 — Explain the retry cap');
  });

  it('notes in the Pass dialog that review comments are attached to the approval report', async () => {
    withReports({
      comments: [
        {
          id: 'rc-report',
          scope: 'line',
          filePath: REPORT.path,
          line: 2,
          side: 'right',
          headSha: 'sha-2',
          body: 'Explain the retry cap',
          resolved: false,
          replies: [],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText(/Pass this stage/i));
    const dialog = screen.getByRole('dialog', { name: /Pass stage/i });
    expect(
      within(dialog).getByText(/attached to the approval report/i),
    ).toBeTruthy();
  });

  it('counts sidebar badges across ./ and bare comment spellings', async () => {
    // The report arrives `./`-prefixed but the thread was anchored bare:
    // the badge still counts it against the same report.
    withReports({
      comments: [
        {
          id: 'rc-bare',
          scope: 'line',
          filePath: REPORT.path.replace(/^\.\//, ''),
          line: 1,
          side: 'right',
          headSha: 'sha-2',
          body: 'Bare-spelling note',
          resolved: false,
          replies: [],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Reports \(1\)/ }));
    expect(screen.getByTitle('1 unresolved comment(s)')).toBeTruthy();
  });

  it('groups one fail-draft section for ./ and bare anchors to the same report', async () => {
    const bare = REPORT.path.replace(/^\.\//, '');
    withReports({
      comments: [
        {
          id: 'rc-1',
          scope: 'line',
          filePath: REPORT.path,
          line: 1,
          side: 'right',
          headSha: 'sha-2',
          body: 'First note',
          resolved: false,
          replies: [],
        },
        {
          id: 'rc-2',
          scope: 'line',
          filePath: bare,
          line: 2,
          side: 'right',
          headSha: 'sha-2',
          body: 'Second note',
          resolved: false,
          replies: [],
        },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Fail this stage with feedback'));
    const dialog = screen.getByRole('dialog', { name: 'Fail stage with feedback' });
    const draft = dialog.querySelector('textarea').value;
    expect(draft).toContain('First note');
    expect(draft).toContain('Second note');
    expect(draft.match(/### `/g)).toHaveLength(1);
  });

  it('keeps the selected report when docs re-sync changes the path spelling', async () => {
    const REPORT_B = {
      path: './docs/tasks/task-101/OTHER.md',
      filename: 'OTHER.md',
      stageName: 'Review',
      auto: false,
      timestamp: '20261012-080000',
      content: ['# Review', 'Looks good'].join('\n'),
    };
    withReports({ reports: [REPORT, REPORT_B] });
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
          stages: [{ id: 'st-2', name: 'Code Review', type: 'human' }],
        },
      ],
      lastReviewEvent: null,
      advanceTask: vi.fn().mockResolvedValue(undefined),
      rejectTaskWithFeedback: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(
      <KainBainContext.Provider value={context}>
        <TaskReviewPage />
      </KainBainContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Reports \(2\)/ }));
    fireEvent.click(
      within(screen.getByTestId('report-review-list')).getByRole('button', { name: /Review/ }),
    );
    expect(
      screen.getByTestId('report-review-view').getAttribute('data-report-path'),
    ).toBe(REPORT_B.path);

    // Centralised docs re-sync returns the same reports in bare spelling.
    const bare = (r) => ({ ...r, path: r.path.replace(/^\.\//, '') });
    api.getTaskReview.mockResolvedValue({
      ...structuredClone(baseReview),
      reports: [bare(REPORT), bare(REPORT_B)],
    });
    context.lastReviewEvent = { taskId: 'task-101', type: 'snapshot', _seq: 1 };
    rerender(
      <KainBainContext.Provider value={{ ...context }}>
        <TaskReviewPage />
      </KainBainContext.Provider>,
    );
    await waitFor(() => expect(api.getTaskReview).toHaveBeenCalledTimes(2));
    // Still on OTHER.md — not reset to the first report.
    await waitFor(() =>
      expect(
        screen.getByTestId('report-review-view').getAttribute('data-report-path'),
      ).toBe(bare(REPORT_B).path),
    );
  });
});

describe('TaskReviewPage terminal-failed tasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    api.getTaskReview.mockResolvedValue(structuredClone(baseReview));
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('hides Pass/Fail on a terminal-failed task and points at Retry Stage', async () => {
    // A terminal-failed task has no stage to advance from (approving is a
    // backend 409): the footer hides Pass/Fail and the note owns recovery.
    renderPage({
      selectedTask: {
        id: 'task-101',
        title: 'Fix auth race',
        goal: 'Fix the auth race.',
        status: 'failed',
        currentStageId: 'st-2',
        failureReason: 'git checkout master failed (exit 128)',
      },
    });
    await waitFor(() => expect(screen.getByTestId('diff-view')).toBeTruthy());
    expect(screen.queryByText('✕ Fail Stage')).toBeNull();
    expect(screen.queryByText(/Pass Stage/)).toBeNull();
    expect(screen.getByText(/use Retry Stage instead of passing/)).toBeTruthy();
  });
});
