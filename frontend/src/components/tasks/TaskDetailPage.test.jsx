// jsdom pin: this suite needs window.confirm stub and assignable navigator.clipboard mock (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach, describe } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { TaskDetailPage } from './TaskDetailPage';
import { taskDraftKey } from '../../services/taskDrafts';
import {
  duplicateHistory,
  duplicateStoredTimeline,
  duplicateTimelineStages,
} from './__fixtures__/duplicateInProgressTimeline.js';
import '@testing-library/jest-dom';

/***
 * MARK: api mock
 * @description Keeps the task-image listing deterministic in detail-page
 *   tests (no real network fetch, no late 404 console noise); other api
 *   exports stay real.
 ***/
vi.mock('../../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: {
      ...actual.api,
      listTaskImages: vi.fn().mockResolvedValue({ images: [] }),
      uploadTaskImage: vi.fn(),
      deleteTaskImage: vi.fn(),
    },
  };
});

describe('TaskDetailPage full-page route component', () => {
  // Old creation date pins the shared fixture to the "old task" side of the
  // newly-created window, so default-mode assertions are deterministic.
  const OLD_CREATED_AT = '2026-01-01T00:00:00.000Z';
  // Fresh timestamp for the just-created exception path (well inside the
  // five-minute edit window no matter when the suite runs).
  const freshCreatedAt = () => new Date().toISOString();
  const sampleTask = {
    id: 'task-101',
    createdAt: OLD_CREATED_AT,
    goal: 'Build authentication system',
    title: 'Build authentication system',
    timestamp: '2026-08-24T12:00:00Z',
    body: 'Authentication requirements: JWT + refresh tokens.',
    keywords: ['#SECURITY', '#AUTH'],
    history: [
      { timestamp: '12:00:00', action: 'Task initialized' },
      { timestamp: '12:05:00', action: 'Stage report generated: ./docs/tasks/task-101/plan-1.md' },
    ],
    timeline: [
      { timestamp: '12:00', stage: 'Planning', duration: '2m', status: 'Success' },
      { timestamp: '12:05', stage: 'Development', duration: '5m', status: 'Active' },
    ],
    stats: { tokens: 450 },
    outputReport: '# Auth Plan\nImplemented OAuth2 flow.',
    processLogs: '[INFO] Initializing auth\n[AGENT] Generated JWT helper\n[TOOL] Ran test:auth',
    currentStageId: 's1',
    status: 'in_stage',
  };

  const sampleStages = [
    { id: 's1', name: 'Planning', type: 'agent' },
    { id: 's2', name: 'Review', type: 'human' },
  ];

  const sampleProjects = [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain' }];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  test('renders task header with key, title, project tag, and stage controls', () => {
    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByText('#KB-TASK')).toBeInTheDocument();
    expect(screen.getByText('KainBain')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /Build authentication system/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy shareable task URL' })).toBeInTheDocument();
  });

  test('details tab never shows the legacy Resources & Audits section or keyword pills', () => {
    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    // Guard: the removed bottom section must not reappear on the full page.
    expect(screen.queryByText('Resources & Audits')).not.toBeInTheDocument();
    expect(screen.queryByText('Open Dedicated Terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('View Terminal')).not.toBeInTheDocument();
    expect(screen.queryByText('Live Task Logs Stream')).not.toBeInTheDocument();
    expect(screen.queryByText('#SECURITY')).not.toBeInTheDocument();
    expect(screen.queryByText('#AUTH')).not.toBeInTheDocument();
    // The Terminal Logs tab itself stays reachable.
    expect(screen.getByRole('tab', { name: /Terminal Logs/i })).toBeInTheDocument();
  });

  test('back to board button triggers onBack or navigates to orchestrator view', () => {
    const onBack = vi.fn();
    renderWithKainBain(<TaskDetailPage task={sampleTask} onBack={onBack} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to Board' }));
    expect(onBack).toHaveBeenCalled();
  });

  test('back to board button updates context and URL hash when no onBack prop is provided', () => {
    const setView = vi.fn();
    const setSelectedTask = vi.fn();
    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      setView,
      setSelectedTask,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Back to Board' }));
    expect(setSelectedTask).toHaveBeenCalledWith(null);
    expect(setView).toHaveBeenCalledWith('orchestrator');
  });

  test('copy link button copies URL to clipboard and shows feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    const copyBtn = screen.getByRole('button', { name: 'Copy shareable task URL' });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Copied Link ✓')).toBeInTheDocument();
    });
  });

  test('header task key badge copies the full task id; back-navigation and Copy Link still work', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    });

    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Copy task ID task-101' }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('task-101');
    });
    expect(screen.getByRole('button', { name: 'Back to Board' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy shareable task URL' })).toBeInTheDocument();
  });

  test('switches tabs between Details, Reports, Terminal Logs, and History', async () => {
    const getTaskReports = vi.fn().mockResolvedValue([
      {
        stageName: 'Planning',
        filename: 'plan-1.md',
        path: './docs/tasks/task-101/plan-1.md',
        content: '# Planning Report Content',
        timestamp: '12:05:00',
      },
    ]);

    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      getTaskReports,
    });

    // 1. Details tab (default): old task opens in preview with the goal rendered.
    expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('Build authentication system');
    // Preview mode hides the token chips for a clean review; edit mode shows them.
    expect(screen.queryByText('Dynamic Context Tokens (Click to Copy)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('Dynamic Context Tokens (Click to Copy)')).toBeInTheDocument();

    // 2. Reports tab
    fireEvent.click(screen.getByRole('tab', { name: /Reports/i }));
    await waitFor(() => {
      expect(screen.getByText('Planning Report Content')).toBeInTheDocument();
    });

    // 3. Terminal Logs tab
    fireEvent.click(screen.getByRole('tab', { name: /Terminal Logs/i }));
    expect(screen.getByText(/Initializing auth/i)).toBeInTheDocument();
    expect(screen.getByText(/Generated JWT helper/i)).toBeInTheDocument();

    // 4. History tab
    fireEvent.click(screen.getByRole('tab', { name: /History & Timeline/i }));
    expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
    expect(screen.getByText('Audit Log Events')).toBeInTheDocument();
    expect(screen.getByText('Task initialized')).toBeInTheDocument();
  });

  test('maps legacy numeric timeline stage ids to current stage names', () => {
    const legacyTimelineTask = {
      ...sampleTask,
      timeline: [{ timestamp: '12:00', stage: 's1', duration: '2m', status: 'Advanced' }],
    };

    renderWithKainBain(<TaskDetailPage task={legacyTimelineTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByRole('tab', { name: /History & Timeline/i }));
    expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
    expect(screen.getByText('Planning')).toBeInTheDocument();
  });

  test('history timeline shows full stored history without a live row (page parity)', () => {
    const failedBackTask = {
      ...sampleTask,
      status: 'in_stage',
      currentStageId: 'ip',
      enteredStageAt: '2026-10-02T20:07:12.253Z',
      timeline: duplicateStoredTimeline,
      history: duplicateHistory,
    };

    renderWithKainBain(<TaskDetailPage task={failedBackTask} />, {
      stages: duplicateTimelineStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByRole('tab', { name: /History & Timeline/i }));
    expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
    // No live row on the full page, so nothing is suppressed: the stored
    // arrival row and the failure row both render with their durations.
    expect(screen.getByText(/298\.631s/)).toBeInTheDocument();
    expect(screen.getByText(/298\.623s/)).toBeInTheDocument();
    expect(screen.getByText('View full reason')).toBeInTheDocument();
  });

  test('edits task title and saves changes via updateTask', async () => {
    const updateTask = vi.fn().mockResolvedValue({});
    // Fresh task so the goal editor is open (preview-by-default otherwise).
    const freshTask = { ...sampleTask, createdAt: freshCreatedAt() };
    renderWithKainBain(<TaskDetailPage task={freshTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Updated Auth Goal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manual Save' }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.objectContaining({
          title: 'Updated Auth Goal',
          goal: 'Updated Auth Goal',
        }),
      );
    });
  });

  test('restores an unsynced draft when the task is closed and reopened before the save resolves', async () => {
    // Slow network: the PATCH stays pending, the user closes the page.
    let resolveUpdate;
    const updateTask = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const freshTask = { ...sampleTask, createdAt: freshCreatedAt() };
    const first = renderWithKainBain(<TaskDetailPage task={freshTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Half-saved goal' },
    });
    expect(window.localStorage.getItem(taskDraftKey('task-101'))).toContain('Half-saved goal');
    first.unmount();

    // Reopening reads the cached draft instead of the stale server goal.
    const second = renderWithKainBain(<TaskDetailPage task={freshTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      updateTask,
    });
    expect(screen.getByLabelText('Task Title')).toHaveValue('Half-saved goal');
    expect(screen.getByText('Unsynced changes')).toBeInTheDocument();

    // Reopening re-pushes the draft; once the API answers the cache is dropped.
    await waitFor(() => expect(updateTask).toHaveBeenCalled());
    await act(async () => {
      resolveUpdate?.({});
    });
    await waitFor(() => {
      expect(window.localStorage.getItem(taskDraftKey('task-101'))).toBeNull();
    });
    second.unmount();
  });

  test('clears the cached draft only after the API confirms receipt', async () => {
    let resolveUpdate;
    const updateTask = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpdate = resolve;
        }),
    );
    const freshTask = { ...sampleTask, createdAt: freshCreatedAt() };
    renderWithKainBain(<TaskDetailPage task={freshTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Confirmed goal' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manual Save' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalled());

    // Pending PATCH: the edit is still cached and flagged as unsynced.
    expect(window.localStorage.getItem(taskDraftKey('task-101'))).toContain('Confirmed goal');
    expect(screen.getByText('Unsynced changes')).toBeInTheDocument();

    await act(async () => {
      resolveUpdate({});
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(taskDraftKey('task-101'))).toBeNull();
    });
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(taskDraftKey('task-101'));
    await waitFor(() => {
      expect(screen.queryByText('Unsynced changes')).not.toBeInTheDocument();
    });
  });

  test('keeps the cached draft and the unsynced badge when the save fails', async () => {
    const updateTask = vi.fn().mockRejectedValue(new Error('offline'));
    const freshTask = { ...sampleTask, createdAt: freshCreatedAt() };
    renderWithKainBain(<TaskDetailPage task={freshTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Edit that will not save' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manual Save' }));
    await waitFor(() => expect(updateTask).toHaveBeenCalled());

    expect(window.localStorage.getItem(taskDraftKey('task-101'))).toContain(
      'Edit that will not save',
    );
    expect(screen.getByText('Unsynced changes')).toBeInTheDocument();
  });

  test('renders the goal in preview mode by default while a stage is executing', () => {
    const runningTask = { ...sampleTask, status: 'running_agent' };

    renderWithKainBain(<TaskDetailPage task={runningTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    // Preview by default: the running agent was dispatched with the old goal.
    expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
    // No warning until the user explicitly clicks Edit.
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  test('goal opens in preview for an old idle task but in edit for a just-created one', () => {
    const { unmount } = renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });
    expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
    expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('Build authentication system');
    unmount();

    // Same surface, just-created task: the editor is open by default.
    const freshTask = { ...sampleTask, createdAt: freshCreatedAt() };
    renderWithKainBain(<TaskDetailPage task={freshTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });
    expect(screen.getByLabelText('Task Title')).toHaveValue('Build authentication system');
  });

  test('editing the goal of a running task warns about next-stage only and still persists', async () => {
    const updateTask = vi.fn().mockResolvedValue({});
    const runningTask = { ...sampleTask, status: 'running_agent' };

    renderWithKainBain(<TaskDetailPage task={runningTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      updateTask,
    });

    // Edit is still allowed (warning, not a block).
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/applies from the next stage/i)).toBeInTheDocument();
    expect(screen.getByText(/will not reach the running agent/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Revised goal picked up next stage' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Manual Save' }));

    await waitFor(() => {
      expect(updateTask).toHaveBeenCalledWith(
        'proj-1',
        'task-101',
        expect.objectContaining({
          title: 'Revised goal picked up next stage',
          goal: 'Revised goal picked up next stage',
        }),
      );
    });
  });

  test('approves checkpoint when in waiting_human stage', async () => {
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
    };
    const advanceTask = vi.fn().mockResolvedValue({});

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      advanceTask,
    });

    expect(screen.getByText('Human Review Checkpoint')).toBeInTheDocument();
    // s2 is the last stage and human, so approving completes the task.
    const approveBtn = screen.getByRole('button', {
      name: 'Approve task #KB-TASK and mark complete',
    });
    expect(approveBtn).toHaveTextContent('✓ Approve & Mark Complete');
    expect(screen.getByText(/Approve to mark it complete/)).toBeInTheDocument();
    fireEvent.click(approveBtn);
    await waitFor(() => {
      expect(advanceTask).toHaveBeenCalledWith('proj-1', 'task-101');
    });
  });

  test('last-stage checkpoint banner offers a completion guidance note, not next-stage guidance', () => {
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
    };

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByText('+ Add guidance note'));
    expect(screen.getByText('Guidance note (optional):')).toBeInTheDocument();
    expect(screen.queryByText(/Guidance for next stage/)).not.toBeInTheDocument();
  });

  test('hides the checkpoint banner on terminal-failed tasks and keeps Retry Stage', () => {
    const failedTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'failed',
      failureReason: 'git checkout master failed (exit 128)',
    };

    renderWithKainBain(<TaskDetailPage task={failedTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.queryByText('Human Review Checkpoint')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Approve task #KB-TASK/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Retry failed stage on task #KB-TASK/i }),
    ).toBeInTheDocument();
  });

  test('mid-pipeline checkpoint banner keeps the approve-and-advance wording', () => {
    const midStages = [
      { id: 's1', name: 'Planning', type: 'agent' },
      { id: 's2', name: 'Review', type: 'human' },
      { id: 's3', name: 'Merge', type: 'merge' },
    ];
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
    };

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: midStages,
      projects: sampleProjects,
    });

    const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-TASK' });
    expect(approveBtn).toHaveTextContent('✓ Approve & Advance');
    expect(screen.getByText(/Advance to next stage/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Add guidance for next stage'));
    expect(screen.getByText('Guidance for next stage:')).toBeInTheDocument();
    expect(screen.queryByText(/Mark Complete/)).not.toBeInTheDocument();
  });

  test('shows the enabled Open PR Review button at a human checkpoint when branch support is on (A1)', () => {
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ ...sampleProjects[0], useBranches: true }],
    });
    const btn = screen.getByRole('button', { name: /Open PR review for task #KB-TASK/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  test('Open PR Review routes to the canonical review path and view', () => {
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    const setView = vi.fn();
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ ...sampleProjects[0], useBranches: true }],
      setView,
    });
    fireEvent.click(screen.getByRole('button', { name: /Open PR review for task #KB-TASK/i }));
    // The facade navigates (the router writes the URL); the page itself must
    // not write raw hashes.
    expect(setView).toHaveBeenCalledWith('task-review', { taskId: 'task-101' });
  });

  test('disables Open PR Review when the project has no branch support (A10)', () => {
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects, // no useBranches
    });
    expect(
      screen.getByRole('button', { name: /Open PR review for task #KB-TASK/i }),
    ).toBeDisabled();
  });

  test('approve flushes pending goal edits BEFORE advancing (auto-save gate)', async () => {
    const order = [];
    // Fresh task so the goal editor is open (preview-by-default otherwise).
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
      createdAt: freshCreatedAt(),
    };
    const advanceTask = vi.fn().mockImplementation(() => {
      order.push('advance');
      return Promise.resolve({});
    });
    const updateTask = vi.fn().mockImplementation(() => {
      order.push('update');
      return Promise.resolve({});
    });

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      advanceTask,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Refined before approve' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-TASK/i }));

    await waitFor(() => {
      expect(advanceTask).toHaveBeenCalledWith('proj-1', 'task-101');
    });
    expect(updateTask).toHaveBeenCalledWith('proj-1', 'task-101', {
      title: 'Refined before approve',
      goal: 'Refined before approve',
    });
    expect(order).toEqual(['update', 'advance']);
  });

  test('approve does NOT advance when the pending save fails', async () => {
    // Fresh task so the goal editor is open (preview-by-default otherwise).
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
      createdAt: freshCreatedAt(),
    };
    const advanceTask = vi.fn();
    const updateTask = vi.fn().mockRejectedValue(new Error('backend refused the edit'));

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      advanceTask,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Goal that fails to save' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-TASK/i }));

    // Wait for the failed save to surface in the goal section instead of
    // sleeping an arbitrary 20ms: the failure notice (role=alert) is the
    // component's own "save finished and failed" signal. A fixed sleep both
    // risks passing a real regression that advances later and flakes under
    // load; the async query is deterministic and bounded by the pinned
    // Testing Library async budget (see setupTests.js).
    expect(await screen.findByRole('alert')).toHaveTextContent('Auto-save failed');
    await act(async () => {});
    expect(advanceTask).not.toHaveBeenCalled();
  });

  test('rejects checkpoint and opens feedback dialog', async () => {
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
    };
    const openFeedbackDialog = vi.fn();

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      openFeedbackDialog,
    });

    const rejectBtn = screen.getByRole('button', { name: `Reject task #KB-TASK` });
    fireEvent.click(rejectBtn);
    await waitFor(() => {
      expect(openFeedbackDialog).toHaveBeenCalledWith(humanTask);
    });
  });

  test('reject flushes pending goal edits BEFORE opening the feedback dialog', async () => {
    const order = [];
    // Fresh task so the goal editor is open (preview-by-default otherwise).
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
      createdAt: freshCreatedAt(),
    };
    const openFeedbackDialog = vi.fn(() => order.push('dialog'));
    const updateTask = vi.fn().mockImplementation(() => {
      order.push('update');
      return Promise.resolve({});
    });

    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      openFeedbackDialog,
      updateTask,
    });

    fireEvent.change(screen.getByLabelText('Task Title'), {
      target: { value: 'Refined before rejection' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Reject task #KB-TASK/i }));

    await waitFor(() => {
      expect(openFeedbackDialog).toHaveBeenCalled();
    });
    expect(order).toEqual(['update', 'dialog']);
  });

  test('renders failure alert banner when stage failed and allows retry', async () => {
    const failedTask = {
      ...sampleTask,
      status: 'failed',
      failureReason: 'Rate limit exceeded on provider',
    };
    const retryTask = vi.fn().mockResolvedValue({});
    const executeTaskStage = vi.fn().mockResolvedValue({});

    renderWithKainBain(<TaskDetailPage task={failedTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      retryTask,
      executeTaskStage,
    });

    expect(screen.getByText(/Stage Execution Failed/i)).toBeInTheDocument();
    expect(screen.getByText('Rate limit exceeded on provider')).toBeInTheDocument();
    // A short reason renders exactly as before, with no toggle.
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();

    // The failed banner retries through the retry endpoint (fresh attempt
    // budget), never through plain execute (which keeps counting).
    const retryBtn = screen.getByRole('button', { name: 'Retry failed stage on task #KB-TASK' });
    fireEvent.click(retryBtn);
    expect(retryTask).toHaveBeenCalledWith('proj-1', 'task-101');
    expect(executeTaskStage).not.toHaveBeenCalled();
  });

  test('caps a long failure message with Show more / Show less', () => {
    const failedTask = {
      ...sampleTask,
      status: 'failed',
      failureReason: `Stage blew up: provider returned 429\n${'retry attempt failed; backing off. '.repeat(12)}FINAL TAIL MARKER`,
    };

    renderWithKainBain(<TaskDetailPage task={failedTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByText(/Stage Execution Failed/i)).toBeInTheDocument();
    expect(screen.queryByText(/FINAL TAIL MARKER/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText(/FINAL TAIL MARKER/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText(/FINAL TAIL MARKER/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
  });

  test('flags a deliberate rejection as REJECTED with the reason at the top', () => {
    const rejectedTask = {
      ...sampleTask,
      status: 'in_stage',
      failureReason: 'Missing validation on empty input',
      lastError: {
        message: 'Missing validation on empty input',
        stageId: 's2',
        stageName: 'Review',
        failureKind: 'rejected',
      },
    };

    renderWithKainBain(<TaskDetailPage task={rejectedTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByText('REJECTED')).toBeInTheDocument();
    expect(screen.getByText(/Stage Rejected/i)).toBeInTheDocument();
    expect(screen.getByText('Missing validation on empty input')).toBeInTheDocument();
    expect(screen.queryByText(/Stage Execution Failed/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Retry rejected stage on task #KB-TASK' }),
    ).toBeInTheDocument();
  });

  test('keeps the rejection banner while an auto-retry is queued', () => {
    const retryingRejection = {
      ...sampleTask,
      status: 'in_stage',
      autoRetrying: true,
      failureReason: 'Review found a gap',
      lastError: {
        message: 'Review found a gap',
        stageId: 's2',
        stageName: 'Review',
        failureKind: 'rejected',
      },
    };

    renderWithKainBain(<TaskDetailPage task={retryingRejection} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByText('RETRYING')).toBeInTheDocument();
    expect(screen.getByText(/Stage Rejected/i)).toBeInTheDocument();
    expect(screen.getByText('Review found a gap')).toBeInTheDocument();
  });

  test('still hides an ordinary failure banner while an auto-retry is queued', () => {
    const retryingFailure = {
      ...sampleTask,
      status: 'in_stage',
      autoRetrying: true,
      failureReason: 'Socket hang up',
    };

    renderWithKainBain(<TaskDetailPage task={retryingFailure} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByText('RETRYING')).toBeInTheDocument();
    expect(screen.queryByText(/Stage Execution Failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Socket hang up')).not.toBeInTheDocument();
  });

  test('renders task not found state when no task exists', () => {
    renderWithKainBain(<TaskDetailPage task={null} />, {
      stages: sampleStages,
      projects: sampleProjects,
      tasks: [],
      selectedTask: null,
    });

    expect(screen.getByText('Task Not Found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← Back to Board' })).toBeInTheDocument();
  });

  test('shows the failed entry reason inline with a modal for the full text', () => {
    const failedTask = {
      ...sampleTask,
      timeline: [
        {
          timestamp: '12:05',
          stage: 'Development',
          duration: '5m',
          status: 'Failed',
          reason: 'Out of tokens\ntrace line 1',
          stageId: 's2',
        },
      ],
    };

    renderWithKainBain(<TaskDetailPage task={failedTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByRole('tab', { name: /History & Timeline/i }));
    expect(screen.getByText('Out of tokens')).toBeInTheDocument();
    expect(screen.queryByText(/trace line 1/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View full reason' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/trace line 1/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Details/i }));
  });

  test('legacy failed entries without a reason show no reason button', () => {
    const legacyTask = {
      ...sampleTask,
      timeline: [{ timestamp: '12:05', stage: 'Development', duration: '5m', status: 'Failed' }],
    };

    renderWithKainBain(<TaskDetailPage task={legacyTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    fireEvent.click(screen.getByRole('tab', { name: /History & Timeline/i }));
    expect(screen.queryByRole('button', { name: 'View full reason' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Details/i }));
  });
});

describe('TaskDetailPage optimistic action guards', () => {
  const sampleTask = {
    id: 'task-101',
    goal: 'Build authentication system',
    title: 'Build authentication system',
    currentStageId: 's1',
    status: 'in_stage',
  };
  const sampleStages = [
    { id: 's1', name: 'Planning', type: 'agent' },
    { id: 's2', name: 'Review', type: 'human' },
  ];
  const sampleProjects = [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain' }];

  test('delete shows a loading state and a fast double-click deletes once', async () => {
    let resolveDelete;
    const deleteTask = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      deleteTask,
    });

    const deleteBtn = screen.getByRole('button', { name: /Delete Task/i });
    fireEvent.click(deleteBtn);
    fireEvent.click(deleteBtn); // fast second click while the backend is responding

    expect(deleteTask).toHaveBeenCalledTimes(1);
    const deletingBtn = screen.getByRole('button', { name: /Deleting\.\.\./i });
    expect(deletingBtn).toBeDisabled();

    await act(async () => {
      resolveDelete({});
    });

    confirmSpy.mockRestore();
  });

  test('double-clicking Complete only completes once', async () => {
    let resolveComplete;
    const completeTask = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveComplete = resolve;
        }),
    );

    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      completeTask,
    });

    const completeBtn = screen.getByRole('button', { name: /✓ Complete/i });
    fireEvent.click(completeBtn);
    fireEvent.click(completeBtn); // second click before the backend has responded

    expect(completeTask).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Completing\.\.\./i })).toBeDisabled();

    await act(async () => {
      resolveComplete({});
    });
  });

  test('double-clicking Run Stage only executes once and shows the running state', async () => {
    let resolveExecute;
    const executeTaskStage = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExecute = resolve;
        }),
    );

    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
      executeTaskStage,
    });

    const runBtn = screen.getByRole('button', { name: /Run Stage/i });
    fireEvent.click(runBtn);
    fireEvent.click(runBtn); // second click before the backend has responded

    expect(executeTaskStage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: /Running\.\.\./i })).toBeDisabled();

    await act(async () => {
      resolveExecute({});
    });
  });

  test('restores the active tab from localStorage after refresh', () => {
    window.localStorage.setItem('kainbain:taskDetail:activeTab', JSON.stringify('history'));
    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByRole('tab', { name: /History/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Details/ })).toHaveAttribute('aria-selected', 'false');
  });

  test('falls back to the details tab on corrupt storage', () => {
    window.localStorage.setItem('kainbain:taskDetail:activeTab', JSON.stringify('bogus'));
    renderWithKainBain(<TaskDetailPage task={sampleTask} />, {
      stages: sampleStages,
      projects: sampleProjects,
    });

    expect(screen.getByRole('tab', { name: /Details/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('Copy Checkout copies the derived branch command and shows Copied feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ ...sampleProjects[0], useBranches: true }],
    });
    const copyBtn = screen.getByRole('button', {
      name: /Copy checkout command for task #KB-TASK/i,
    });
    expect(copyBtn).toBeInTheDocument();
    expect(copyBtn).not.toBeDisabled();
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('git fetch origin && git checkout kb/task-101');
    await waitFor(() => {
      expect(screen.getByText('Copied ✓')).toBeInTheDocument();
    });
  });

  test('Copy Checkout uses the persisted branch when the task carries one', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
      branch: 'kb/custom-branch',
    };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ ...sampleProjects[0], useBranches: true }],
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Copy checkout command for task #KB-TASK/i }),
    );
    expect(writeTextMock).toHaveBeenCalledWith('git fetch origin && git checkout kb/custom-branch');
  });

  test('Copy Checkout is disabled when the project has no branch support', () => {
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: sampleProjects, // no useBranches
    });
    expect(
      screen.getByRole('button', { name: /Copy checkout command for task #KB-TASK/i }),
    ).toBeDisabled();
  });
});

describe('TaskDetailPage Copy Checkout buttons', () => {
  const sampleTask = {
    id: 'task-101',
    goal: 'Build authentication system',
    title: 'Build authentication system',
    currentStageId: 's2',
    status: 'waiting_human',
  };
  const sampleStages = [
    { id: 's1', name: 'Planning', type: 'agent' },
    { id: 's2', name: 'Review', type: 'human' },
  ];

  test('Copy Checkout copies the derived branch command and shows Copied feedback', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain', useBranches: true }],
    });
    const copyBtn = screen.getByRole('button', {
      name: /Copy checkout command for task #KB-TASK/i,
    });
    expect(copyBtn).toBeInTheDocument();
    expect(copyBtn).not.toBeDisabled();
    fireEvent.click(copyBtn);
    expect(writeTextMock).toHaveBeenCalledWith('git fetch origin && git checkout kb/task-101');
    await waitFor(() => {
      expect(screen.getByText('Copied ✓')).toBeInTheDocument();
    });
  });

  test('Copy Checkout uses the persisted branch when the task carries one', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });
    const humanTask = {
      ...sampleTask,
      currentStageId: 's2',
      status: 'waiting_human',
      branch: 'kb/custom-branch',
    };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain', useBranches: true }],
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Copy checkout command for task #KB-TASK/i }),
    );
    expect(writeTextMock).toHaveBeenCalledWith('git fetch origin && git checkout kb/custom-branch');
  });

  test('Copy Checkout is disabled when the project has no branch support', () => {
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain' }], // no useBranches
    });
    expect(
      screen.getByRole('button', { name: /Copy checkout command for task #KB-TASK/i }),
    ).toBeDisabled();
  });

  test('PR row shares the Approve/Reject row layout so edges line up at equal widths', () => {
    const humanTask = { ...sampleTask, currentStageId: 's2', status: 'waiting_human' };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages: sampleStages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain', useBranches: true }],
    });
    const buttons = [
      screen.getByRole('button', { name: /Approve task #KB-TASK/i }),
      screen.getByRole('button', { name: /Reject task #KB-TASK/i }),
      screen.getByRole('button', { name: /Open PR review for task #KB-TASK/i }),
      screen.getByRole('button', { name: /Copy checkout command for task #KB-TASK/i }),
    ];
    // Every button must fill an equal flex-1 share of its row (same width).
    for (const btn of buttons) {
      expect(btn.className.split(/\s+/)).toContain('flex-1');
    }
    // Both rows must use the same gap so the outer edges line up.
    const gapOf = (row) => (row.className.match(/gap-\d+/) || [])[0];
    const approveRow = buttons[0].parentElement;
    const prRow = buttons[2].parentElement;
    expect(gapOf(approveRow)).toBeTruthy();
    expect(gapOf(prRow)).toBe(gapOf(approveRow));
  });

  test('blocked task header shows BLOCKED with blocker keys, not IN PROGRESS', () => {
    const blockedTask = {
      ...sampleTask,
      isBlocked: true,
      blockedBy: ['abc-1234-def'],
    };
    renderWithKainBain(<TaskDetailPage task={blockedTask} />, {
      stages: sampleStages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain' }],
    });
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    expect(screen.queryByText('IN PROGRESS')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Blocked by #KB-ABC1/i)).toBeInTheDocument();
  });
});

describe('TaskDetailPage survey entry points', () => {
  const OLD_CREATED_AT = '2026-01-01T00:00:00.000Z';
  const surveyTask = {
    id: 'task-101',
    createdAt: OLD_CREATED_AT,
    goal: 'Refine the need',
    title: 'Refine the need',
    history: [],
    timeline: [],
    currentStageId: 's1',
    status: 'waiting_human',
    surveyPending: true,
  };
  const stages = [
    { id: 's1', name: 'Ask', type: 'agent', skills: [{ name: 'question-me' }] },
    { id: 's2', name: 'Review', type: 'human' },
  ];

  test('parked survey stage shows the survey banner with an entry link', async () => {
    renderWithKainBain(<TaskDetailPage task={surveyTask} />, {
      stages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain' }],
    });
    // The banner fetch has no server in tests, so this exercises the
    // fail-visible path: the parked task still offers a way to answer.
    const link = await screen.findByRole('link', { name: /open survey/i });
    expect(link).toHaveAttribute('href', '#/tasks/task-101/survey');
  });

  test('human checkpoints never show the survey banner', async () => {
    const humanTask = { ...surveyTask, currentStageId: 's2', surveyPending: false };
    renderWithKainBain(<TaskDetailPage task={humanTask} />, {
      stages,
      projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/user/kainbain' }],
    });
    await waitFor(() => {
      expect(screen.getByText('Human Review Checkpoint')).toBeInTheDocument();
    });
    expect(screen.queryByRole('region', { name: /survey awaiting/i })).not.toBeInTheDocument();
  });
});
