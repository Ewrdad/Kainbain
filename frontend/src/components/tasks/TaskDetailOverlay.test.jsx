// jsdom pin: this suite needs window.confirm stub (happy-dom differs); keep on jsdom.
// @vitest-environment jsdom
import { expect, test, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { TaskDetailOverlay } from './TaskDetailOverlay';
import { taskDraftKey } from '../../services/taskDrafts';
import {
  duplicateHistory,
  duplicateStoredTimeline,
  duplicateTimelineStages,
} from './__fixtures__/duplicateInProgressTimeline.js';
import '@testing-library/jest-dom';

/***
 * MARK: api mock
 * @description Keeps the task-image listing deterministic in overlay tests
 *   (no real network fetch, no late 404 console noise); other api exports
 *   stay real.
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

/***
 * MARK: TaskDetailOverlay tests
 * @description Verifies the slide-over task inspector: editable goal,
 *   details, reports, and history tabs, standardized task key, save changes,
 *   and in-flight disabled approval guards on human checkpoints.
 ***/

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});
// Old creation date pins the shared fixture to the "old task" side of the
// newly-created window, so default-mode assertions are deterministic.
const OLD_CREATED_AT = '2026-01-01T00:00:00.000Z';
// Fresh timestamp for the just-created exception path (well inside the
// five-minute edit window no matter when the suite runs).
const freshCreatedAt = () => new Date().toISOString();

const task = {
  id: 't1',
  createdAt: OLD_CREATED_AT,
  goal: 'Implement the API',
  title: 'Implement the API',
  timestamp: '2026-01-01',
  body: 'Body content',
  keywords: ['api', 'backend'],
  history: [{ timestamp: '2026-01-01', action: 'Created and placed in stage 1' }],
  timeline: [{ timestamp: '14:00', stage: 'Idea', duration: '1m', status: 'Success' }],
  stats: { tokens: 100 },
  outputReport: '# Task Report\nAll tests passed.',
  processLogs: '[INFO] started\n[WARN] slow',
  currentStageId: '1',
};

const stages = [
  { id: '1', name: 'Idea', type: 'agent' },
  { id: '2', name: 'Review', type: 'human' },
];

test('renders task goal and standardized key in details tab', () => {
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const freshTask = { ...task, createdAt: freshCreatedAt() };
  renderWithKainBain(<TaskDetailOverlay task={freshTask} onClose={() => {}} />, {
    stages,
  });
  expect(screen.getByLabelText('Task Title')).toHaveValue('Implement the API');
  expect(screen.getByText('#KB-T1')).toBeInTheDocument();
});

test('details tab has no Resources & Audits section, keyword pills, or log shortcuts', () => {
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
  });
  // The legacy bottom section is gone entirely.
  expect(screen.queryByText('Resources & Audits')).not.toBeInTheDocument();
  expect(screen.queryByText('Open Dedicated Terminal')).not.toBeInTheDocument();
  expect(screen.queryByText('View Terminal')).not.toBeInTheDocument();
  expect(screen.queryByText('Live Task Logs Stream')).not.toBeInTheDocument();
  expect(screen.queryByText('#api')).not.toBeInTheDocument();
  expect(screen.queryByText('#backend')).not.toBeInTheDocument();
  // The Logs tab itself is still reachable from the top tab strip.
  expect(screen.getByRole('tab', { name: /Logs/i })).toBeInTheDocument();
  // Dynamic Context Tokens stay: open the goal editor to reveal the chips.
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByText('Dynamic Context Tokens')).toBeInTheDocument();
});

test('inspector task key badge copies the full task id', async () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, {
    clipboard: { writeText: writeTextMock },
  });

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
  });

  fireEvent.click(screen.getByRole('button', { name: 'Copy task ID t1' }));

  await waitFor(() => {
    expect(writeTextMock).toHaveBeenCalledWith('t1');
  });
});

test('switches between Details, Reports, and History tabs', async () => {
  const getTaskReports = vi.fn().mockResolvedValue({
    taskId: 't1',
    reports: [{ name: 'plan-report.md', content: 'Detailed report content' }],
  });

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    getTaskReports,
  });

  // Switch to Reports tab
  fireEvent.click(screen.getByRole('tab', { name: /Reports/i }));
  await waitFor(() => {
    expect(screen.getByText('Detailed report content')).toBeInTheDocument();
  });

  // Switch to History tab
  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
  expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
  expect(screen.getByText('Created and placed in stage 1')).toBeInTheDocument();
});

test('maps legacy numeric timeline stage ids to current stage names', () => {
  const legacyTimelineTask = {
    ...task,
    timeline: [{ timestamp: '14:00', stage: '2', duration: '1m', status: 'Advanced' }],
  };

  renderWithKainBain(<TaskDetailOverlay task={legacyTimelineTask} onClose={() => {}} />, {
    stages,
  });

  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
  expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
  expect(screen.getByText('Review')).toBeInTheDocument();
});

test('history timeline shows one In Progress row: live Active, stored arrival suppressed', () => {
  const failedBackTask = {
    ...task,
    status: 'in_stage',
    currentStageId: 'ip',
    enteredStageAt: '2026-10-02T20:07:12.253Z',
    timeline: duplicateStoredTimeline,
    history: duplicateHistory,
  };

  renderWithKainBain(<TaskDetailOverlay task={failedBackTask} onClose={() => {}} />, {
    stages: duplicateTimelineStages,
  });

  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
  expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
  // The Failed visit keeps its duration and reason...
  expect(screen.getByText(/298\.623s/)).toBeInTheDocument();
  expect(screen.getByText('View full reason')).toBeInTheDocument();
  // ...while the stored arrival row for the live stage is not rendered twice.
  expect(screen.queryByText(/298\.631s/)).not.toBeInTheDocument();
});

test('open in full page button navigates to task page', () => {
  const setView = vi.fn();
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    setView,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open in full page' }));
  expect(setView).toHaveBeenCalledWith('task-detail', { taskId: task.id });
});

test('failed banner retries through the retry endpoint (fresh attempt budget)', () => {
  const failedTask = {
    ...task,
    status: 'failed',
    failureReason: 'Rate limit exceeded on provider',
  };
  const retryTask = vi.fn().mockResolvedValue({});
  const executeTaskStage = vi.fn().mockResolvedValue({});

  renderWithKainBain(<TaskDetailOverlay task={failedTask} onClose={() => {}} />, {
    stages,
    retryTask,
    executeTaskStage,
  });

  expect(screen.getByText(/Stage Execution Failed/i)).toBeInTheDocument();
  // A short reason renders exactly as before, with no toggle.
  expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed stage on task #KB-T1' }));
  expect(retryTask).toHaveBeenCalledWith('proj-1', 't1');
  expect(executeTaskStage).not.toHaveBeenCalled();
});

test('overlay failure banner caps a long message behind Show more', () => {
  const failedTask = {
    ...task,
    status: 'failed',
    failureReason: `Stage blew up: provider returned 429\n${'retry attempt failed; backing off. '.repeat(12)}FINAL TAIL MARKER`,
  };

  renderWithKainBain(<TaskDetailOverlay task={failedTask} onClose={() => {}} />, {
    stages,
  });

  expect(screen.getByText(/Stage Execution Failed/i)).toBeInTheDocument();
  expect(screen.queryByText(/FINAL TAIL MARKER/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getByText(/FINAL TAIL MARKER/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('overlay flags a deliberate rejection as REJECTED with the reason at the top', () => {
  const rejectedTask = {
    ...task,
    status: 'in_stage',
    failureReason: 'Missing validation on empty input',
    lastError: {
      message: 'Missing validation on empty input',
      stageId: 's-h',
      stageName: 'Review',
      failureKind: 'rejected',
    },
  };

  renderWithKainBain(<TaskDetailOverlay task={rejectedTask} onClose={() => {}} />, {
    stages,
  });

  expect(screen.getByText('REJECTED')).toBeInTheDocument();
  expect(screen.getByText(/Stage Rejected/i)).toBeInTheDocument();
  expect(screen.getByText('Missing validation on empty input')).toBeInTheDocument();
  expect(screen.queryByText(/Stage Execution Failed/i)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retry rejected stage on task #KB-T1' }),
  ).toBeInTheDocument();
});

test('close button fires onClose', () => {
  const onClose = vi.fn();
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={onClose} />, { stages });
  fireEvent.click(screen.getByLabelText('Close Task Inspector'));
  expect(onClose).toHaveBeenCalled();
});

test('Escape key closes the inspector', () => {
  const onClose = vi.fn();
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={onClose} />, { stages });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('renders nothing when no task is provided', () => {
  const { container } = renderWithKainBain(<TaskDetailOverlay task={null} onClose={() => {}} />);
  expect(container).toBeEmptyDOMElement();
});

test('save changes calls updateTask with the edited title only', async () => {
  const updateTask = vi.fn();
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const freshTask = { ...task, createdAt: freshCreatedAt() };
  renderWithKainBain(<TaskDetailOverlay task={freshTask} onClose={() => {}} />, {
    updateTask,
    stages,
  });
  fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'New title' } });
  fireEvent.click(screen.getByText('Save Changes'));
  await screen.findByText('Saved ✓');
  // The per-task prompt override feature was removed: the save never sends a
  // prompt field (the engine composes the prompt at dispatch time).
  expect(updateTask).toHaveBeenCalledWith('proj-1', 't1', {
    title: 'New title',
    goal: 'New title',
  });
});

test('caches the goal locally so closing the inspector before the save resolves never loses it', async () => {
  // Slow network: the PATCH stays pending while the user closes the inspector.
  let resolveUpdate;
  const updateTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
  );
  const freshTask = { ...task, createdAt: freshCreatedAt() };
  const first = renderWithKainBain(<TaskDetailOverlay task={freshTask} onClose={() => {}} />, {
    updateTask,
    stages,
  });

  fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'Inspector draft' } });
  expect(window.localStorage.getItem(taskDraftKey('t1'))).toContain('Inspector draft');
  first.unmount();

  // Reopening restores the draft and flags it as unsynced.
  renderWithKainBain(<TaskDetailOverlay task={freshTask} onClose={() => {}} />, {
    updateTask,
    stages,
  });
  expect(screen.getByLabelText('Task Title')).toHaveValue('Inspector draft');
  expect(screen.getByText('Unsynced changes')).toBeInTheDocument();

  // Reopening re-pushes the draft; the API confirmation drops the cache.
  await waitFor(() => expect(updateTask).toHaveBeenCalled());
  await act(async () => {
    resolveUpdate?.({});
  });
  await waitFor(() => {
    expect(window.localStorage.getItem(taskDraftKey('t1'))).toBeNull();
  });
});

test('save changes NEVER sends a prompt field (override feature removed)', async () => {
  // Task carries a stored curated prompt record; even so the inspector must
  // not send any prompt field when saving.
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const taskWithPromptRecord = {
    ...task,
    prompt: 'Stored curated prompt record',
    createdAt: freshCreatedAt(),
  };
  const updateTask = vi.fn().mockResolvedValue({});
  renderWithKainBain(<TaskDetailOverlay task={taskWithPromptRecord} onClose={() => {}} />, {
    updateTask,
    stages,
  });

  fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'New goal text' } });
  fireEvent.click(screen.getByText('Save Changes'));
  await screen.findByText('Saved ✓');

  const patch = updateTask.mock.calls[0][2];
  expect(patch).toEqual({ title: 'New goal text', goal: 'New goal text' });
  expect(patch).not.toHaveProperty('prompt');
});

test('delete button calls deleteTask and closes inspector', async () => {
  const deleteTask = vi.fn().mockResolvedValue({});
  const onClose = vi.fn();
  vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={onClose} />, {
    deleteTask,
    stages,
  });

  fireEvent.click(screen.getByText('✕ Delete Task'));
  await waitFor(() => {
    expect(deleteTask).toHaveBeenCalledWith('proj-1', 't1');
    expect(onClose).toHaveBeenCalled();
  });
});

test('prioritise button calls jumpTask with active stage', () => {
  const jumpTask = vi.fn();
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    jumpTask,
    currentStageId: '2',
    stages,
  });

  fireEvent.click(screen.getByText('Prioritise'));
  expect(jumpTask).toHaveBeenCalledWith('proj-1', 't1', '2');
});

test('renders human review checkpoint banner when task is waiting_human and fires approve/reject with guards', async () => {
  let resolveAdvance;
  const advanceTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveAdvance = resolve;
      }),
  );
  const openFeedbackDialog = vi.fn();
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2', // last-stage human review stage: approving completes the task
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    advanceTask,
    openFeedbackDialog,
    stages,
  });

  expect(screen.getByText('Human Review Checkpoint')).toBeInTheDocument();
  // Terminal checkpoint: the banner promises completion, not a next stage.
  expect(screen.getByText(/marks the task complete/)).toBeInTheDocument();

  // Test Approve in-flight state
  const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-T1 and mark complete' });
  expect(approveBtn).toHaveTextContent('✓ Approve & Mark Complete');
  fireEvent.click(approveBtn);
  expect(approveBtn).toBeDisabled();
  expect(screen.getByText('Completing...')).toBeInTheDocument();
  expect(advanceTask).toHaveBeenCalledWith('proj-1', 't1');

  // Second click while in-flight is prevented
  fireEvent.click(approveBtn);
  expect(advanceTask).toHaveBeenCalledTimes(1);

  resolveAdvance();
  await waitFor(() => {
    expect(screen.queryByText('Completing...')).not.toBeInTheDocument();
    expect(approveBtn).not.toBeDisabled();
  });

  // Test Reject with Feedback
  const rejectBtn = screen.getByRole('button', { name: /Reject task #KB-T1/i });
  fireEvent.click(rejectBtn);
  expect(openFeedbackDialog).toHaveBeenCalledWith(waitingTask);
});

test('filters process logs by category lane in TaskDetailOverlay', () => {
  const taskWithLogs = {
    ...task,
    processLogs:
      '[INFO] Initialized\n[AGENT] Model thinking\n[ERROR] Test failed\n[CI/CMD] Running build',
  };

  renderWithKainBain(<TaskDetailOverlay task={taskWithLogs} onClose={() => {}} />, {
    stages,
  });

  // Switch to Logs tab to view terminal logs
  fireEvent.click(screen.getByRole('tab', { name: /Logs/i }));

  expect(screen.getByText('[INFO] Initialized')).toBeInTheDocument();
  expect(screen.getByText('[ERROR] Test failed')).toBeInTheDocument();

  // Filters are collapsed by default on first paint; reveal them first.
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  // Toggle the narrative lane off: system, error, and CI lanes stay visible.
  fireEvent.click(screen.getByRole('button', { name: 'Direct output' }));
  expect(screen.getByText('[ERROR] Test failed')).toBeInTheDocument();
  expect(screen.getByText('[CI/CMD] Running build')).toBeInTheDocument();
  expect(screen.queryByText('[AGENT] Model thinking')).not.toBeInTheDocument();
});

test('toggles Markdown Task Goal between Edit and Preview modes (#33)', () => {
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
  });

  // Default is Preview mode for an old task: rendered markdown, no textarea.
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();

  // Switch to Edit mode
  fireEvent.click(screen.getByRole('button', { name: /Edit/i }));
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();

  // Switch back to Preview mode
  fireEvent.click(screen.getByRole('button', { name: /Preview/i }));
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
});

test('goal opens in preview for an old idle task but in edit for a just-created one', () => {
  const { unmount } = renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
  });
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('Implement the API');
  unmount();

  // Same surface, just-created task: the editor is open by default.
  const freshTask = { ...task, createdAt: freshCreatedAt() };
  renderWithKainBain(<TaskDetailOverlay task={freshTask} onClose={() => {}} />, {
    stages,
  });
  expect(screen.getByLabelText('Task Title')).toHaveValue('Implement the API');
});

test('goal opens in preview mode by default while the task is executing', () => {
  const runningTask = { ...task, status: 'running_agent' };

  renderWithKainBain(<TaskDetailOverlay task={runningTask} onClose={() => {}} />, {
    stages,
  });

  // Preview by default while running: the active agent was dispatched with
  // the previous goal text, so show the baked-in goal instead of an editor.
  expect(screen.queryByLabelText('Task Title')).not.toBeInTheDocument();
  expect(screen.getByTestId('markdown-viewer')).toBeInTheDocument();
  // No warning until the user explicitly clicks Edit.
  expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

test('editing the goal of a running task reports the next-stage restriction and saves persist', async () => {
  const updateTask = vi.fn().mockResolvedValue({});
  const runningTask = { ...task, status: 'running_agent' };

  renderWithKainBain(<TaskDetailOverlay task={runningTask} onClose={() => {}} />, {
    updateTask,
    stages,
  });

  // Edit is still allowed (warning, not a block).
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByRole('note')).toBeInTheDocument();
  expect(screen.getByText(/applies from the next stage/i)).toBeInTheDocument();
  expect(screen.getByText(/will not reach the running agent/i)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Goal corrected for next stage' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
  await screen.findByText('Saved ✓');

  // The goal is persisted so the NEXT stage dispatch picks it up.
  expect(updateTask).toHaveBeenCalledWith('proj-1', 't1', {
    title: 'Goal corrected for next stage',
    goal: 'Goal corrected for next stage',
  });
});

test('renders keyword token buttons and copies token to clipboard', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    projects: [{ id: 'proj-1', name: 'KainBain', cwd: '/home/server/projects/kainbain' }],
  });

  // Token chips render in edit mode only (preview stays clean for review).
  expect(
    screen.queryByRole('button', { name: /Copy keyword \{\{projectRoot\}\}/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

  // Core keyword buttons are present
  expect(screen.getByRole('button', { name: /Copy keyword \{\{project\}\}/ })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Copy keyword \{\{projectRoot\}\}/ }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copy keyword \{\{taskDocs\}\}/ })).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Copy keyword \{\{previousReports\}\}/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Copy keyword \{\{latestReportPath\}\}/ }),
  ).toBeInTheDocument();

  // Clicking a keyword copies its literal token
  fireEvent.click(screen.getByRole('button', { name: /Copy keyword \{\{projectRoot\}\}/ }));
  expect(writeText).toHaveBeenCalledWith('{{projectRoot}}');
});

test('provides notes-viewer links and deduplicated reports in Reports tab (#1, #5, #43)', async () => {
  vi.stubEnv('VITE_NOTES_VIEWER_URL', 'http://notes.example.com');
  const duplicateReports = [
    { name: 'report-1.md', path: 'docs/tasks/t1/report-1.md', content: 'Report 1' },
    { name: 'report-1.md', path: 'docs/tasks/t1/report-1.md', content: 'Report 1 copy' },
    { name: 'report-2.md', path: 'docs/tasks/t1/report-2.md', content: 'Report 2' },
  ];
  const getTaskReports = vi.fn().mockResolvedValue({
    taskId: 't1',
    reports: duplicateReports,
  });

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    getTaskReports,
  });

  // Badge reflects deduplicated count (2 unique reports)
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: /Reports \(2\)/i })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole('tab', { name: /Reports/i }));

  await waitFor(() => {
    const sbLink = screen.getByRole('link', { name: /Open in Notes/i });
    expect(sbLink).toBeInTheDocument();
    expect(sbLink).toHaveAttribute(
      'href',
      'http://notes.example.com/Projects/Personal/KainBain/tasks/t1/report-1.md',
    );
  });
});

test('switches to dedicated Logs tab and displays streamed process logs with filter and copy', async () => {
  const logTask = {
    ...task,
    processLogs:
      '[AGENT] Initializing Pi agent...\n[TOOL] write({"path":"src/test.js"})\n[RESULT] File created\n[INFO] Stage finished',
  };

  renderWithKainBain(<TaskDetailOverlay task={logTask} onClose={() => {}} />, {
    stages,
  });

  // Switch to Logs tab
  fireEvent.click(screen.getByRole('tab', { name: /Logs/i }));

  expect(screen.getByText('Task Terminal Logs')).toBeInTheDocument();
  expect(screen.getByText(/Initializing Pi agent/i)).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  expect(screen.getByRole('button', { name: 'Tool calls' })).toBeInTheDocument();
  expect(screen.getByText(/write\(/i)).toBeInTheDocument();

  // Test category lane filtering: tools off hides calls, narrative stays.
  fireEvent.click(screen.getByRole('button', { name: 'Tool calls' }));
  expect(screen.queryByText(/write\(/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Initializing Pi agent/i)).toBeInTheDocument();
});

test('renders Interrupted Task banner and calls resumeTask on click', async () => {
  const resumeTask = vi.fn();
  const interruptedTask = {
    ...task,
    status: 'interrupted',
    wasInterrupted: true,
  };

  renderWithKainBain(<TaskDetailOverlay task={interruptedTask} onClose={() => {}} />, {
    stages,
    resumeTask,
  });

  expect(screen.getByText(/Interrupted Task Restored/i)).toBeInTheDocument();
  const resumeBtn = screen.getByRole('button', { name: /Resume interrupted task/i });
  expect(resumeBtn).toBeInTheDocument();

  fireEvent.click(resumeBtn);
  expect(resumeTask).toHaveBeenCalledWith('proj-1', 't1');
});

test('renders Paused Task banner and allows resuming', async () => {
  const resumeTask = vi.fn();
  const pausedTask = {
    ...task,
    status: 'paused',
  };

  renderWithKainBain(<TaskDetailOverlay task={pausedTask} onClose={() => {}} />, {
    stages,
    resumeTask,
  });

  expect(screen.getByText(/Task Execution Paused/i)).toBeInTheDocument();
  const resumeBtn = screen.getByRole('button', { name: /Resume Execution/i });
  expect(resumeBtn).toBeInTheDocument();

  fireEvent.click(resumeBtn);
  expect(resumeTask).toHaveBeenCalledWith('proj-1', 't1');
});

test('supports approving checkpoint with human guidance', async () => {
  const advanceTask = vi.fn();
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2', // last stage: guidance is a completion note, not next-stage input
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    stages,
    advanceTask,
  });

  // Expand guidance input
  fireEvent.click(screen.getByText('+ Add guidance note'));
  expect(screen.getByText('Guidance note (optional):')).toBeInTheDocument();
  const guidanceInput = screen.getByPlaceholderText(
    /Please ensure API error handling covers timeout cases/i,
  );
  expect(guidanceInput).toBeInTheDocument();

  fireEvent.change(guidanceInput, { target: { value: 'Include security headers in response.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Approve task #KB-T1 and mark complete' }));

  expect(advanceTask).toHaveBeenCalledWith('proj-1', 't1', {
    guidance: 'Include security headers in response.',
  });
});

test('mid-pipeline checkpoint banner keeps the approve-and-advance wording', async () => {
  let resolveAdvance;
  const advanceTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveAdvance = resolve;
      }),
  );
  const midStages = [
    { id: '1', name: 'Idea', type: 'agent' },
    { id: '2', name: 'Review', type: 'human' },
    { id: '3', name: 'Merge', type: 'merge' },
  ];
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2', // mid-pipeline human checkpoint: approving advances
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    stages: midStages,
    advanceTask,
  });

  expect(screen.getByText(/advance it to the next stage/)).toBeInTheDocument();
  const approveBtn = screen.getByRole('button', { name: 'Approve task #KB-T1' });
  expect(approveBtn).toHaveTextContent('✓ Approve & Advance');
  fireEvent.click(approveBtn);
  expect(screen.getByText('Advancing...')).toBeInTheDocument();

  resolveAdvance();
  await waitFor(() => {
    expect(screen.queryByText('Advancing...')).not.toBeInTheDocument();
  });

  fireEvent.click(screen.getByText('+ Add guidance for next stage'));
  expect(screen.getByText('Guidance for next stage:')).toBeInTheDocument();
  expect(screen.queryByText(/Mark Complete/)).not.toBeInTheDocument();
});

test('approve shows "Saving edits..." state when flushing pending changes', async () => {
  let resolveUpdate;
  const updateTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
  );
  const advanceTask = vi.fn();
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2',
    createdAt: freshCreatedAt(),
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    advanceTask,
    updateTask,
    stages,
  });

  // Trigger a pending edit
  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Pending edit' },
  });

  const approveBtn = screen.getByRole('button', { name: /Approve task #KB-T1/i });
  fireEvent.click(approveBtn);

  // Should show "Saving edits..." while updateTask is pending
  expect(screen.getAllByText('Saving edits...').length).toBeGreaterThan(0);
  expect(approveBtn).toBeDisabled();

  resolveUpdate({});
  await waitFor(() => {
    expect(screen.queryByText('Saving edits...')).not.toBeInTheDocument();
  });
  expect(advanceTask).toHaveBeenCalledWith('proj-1', 't1');
});

test('reject shows "Saving edits..." state when flushing pending changes', async () => {
  let resolveUpdate;
  const updateTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
  );
  const openFeedbackDialog = vi.fn();
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2',
    createdAt: freshCreatedAt(),
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    openFeedbackDialog,
    updateTask,
    stages,
  });

  // Trigger a pending edit
  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Pending edit' },
  });

  const rejectBtn = screen.getByRole('button', { name: /Reject task #KB-T1/i });
  fireEvent.click(rejectBtn);

  // Should show "Saving edits..." while updateTask is pending
  expect(screen.getAllByText('Saving edits...').length).toBeGreaterThan(0);
  expect(rejectBtn).toBeDisabled();

  resolveUpdate({});
  await waitFor(() => {
    expect(screen.queryByText('Saving edits...')).not.toBeInTheDocument();
  });
  expect(openFeedbackDialog).toHaveBeenCalledWith(waitingTask);
});

test('approve re-enables the buttons after the flushed save FAILS (retryable, no advance)', async () => {
  const updateTask = vi.fn().mockRejectedValue(new Error('backend refused the edit'));
  const advanceTask = vi.fn();
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2',
    createdAt: freshCreatedAt(),
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    advanceTask,
    updateTask,
    stages,
  });

  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Edit that will fail to save' },
  });
  const approveBtn = screen.getByRole('button', { name: /Approve task #KB-T1/i });
  fireEvent.click(approveBtn);

  await waitFor(() => expect(updateTask).toHaveBeenCalled());
  expect(advanceTask).not.toHaveBeenCalled();
  // The buttons must NOT be stuck disabled: the user can retry.
  await waitFor(() => expect(approveBtn).not.toBeDisabled());
  expect(screen.queryByText('Saving edits...')).not.toBeInTheDocument();
  // Failure is surfaced by the goal section's auto-save indicator.
  expect(screen.getByRole('alert')).toHaveTextContent('Auto-save failed');
});

test('approve flushes pending goal edits to the backend BEFORE advancing', async () => {
  const order = [];
  const advanceTask = vi.fn().mockImplementation(() => {
    order.push('advance');
    return Promise.resolve({});
  });
  const updateTask = vi.fn().mockImplementation(() => {
    order.push('update');
    return Promise.resolve({});
  });
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2',
    createdAt: freshCreatedAt(),
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    stages,
    advanceTask,
    updateTask,
  });

  // Type a goal refinement and approve before the 600ms auto-save debounce
  // gets a chance to fire: the edit must still reach the backend first.
  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Refined goal before approve' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-T1/i }));

  await waitFor(() => {
    expect(advanceTask).toHaveBeenCalledWith('proj-1', 't1');
  });
  expect(updateTask).toHaveBeenCalledWith('proj-1', 't1', {
    title: 'Refined goal before approve',
    goal: 'Refined goal before approve',
  });
  expect(order).toEqual(['update', 'advance']);
});

test('approve does NOT advance when the pending save fails', async () => {
  const advanceTask = vi.fn();
  const updateTask = vi.fn().mockRejectedValue(new Error('backend refused the edit'));
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2',
    createdAt: freshCreatedAt(),
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    stages,
    advanceTask,
    updateTask,
  });

  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Goal that will fail to save' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Approve task #KB-T1/i }));

  await waitFor(() => {
    expect(updateTask).toHaveBeenCalled();
  });
  await new Promise((r) => setTimeout(r, 20));
  expect(advanceTask).not.toHaveBeenCalled();
});

test('reject flushes pending goal edits BEFORE opening the feedback dialog', async () => {
  const order = [];
  const openFeedbackDialog = vi.fn(() => order.push('dialog'));
  const updateTask = vi.fn().mockImplementation(() => {
    order.push('update');
    return Promise.resolve({});
  });
  // Fresh task so the goal editor is open (preview-by-default otherwise).
  const waitingTask = {
    ...task,
    status: 'waiting_human',
    currentStageId: '2',
    createdAt: freshCreatedAt(),
  };

  renderWithKainBain(<TaskDetailOverlay task={waitingTask} onClose={() => {}} />, {
    stages,
    openFeedbackDialog,
    updateTask,
  });

  fireEvent.change(screen.getByLabelText('Task Title'), {
    target: { value: 'Goal refined before rejection' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Reject task #KB-T1/i }));

  await waitFor(() => {
    expect(openFeedbackDialog).toHaveBeenCalled();
  });
  expect(updateTask).toHaveBeenCalledWith('proj-1', 't1', {
    title: 'Goal refined before rejection',
    goal: 'Goal refined before rejection',
  });
  expect(order).toEqual(['update', 'dialog']);
});

test('supports sending manual follow-up prompt and steering instructions', async () => {
  const followUpTask = vi.fn().mockResolvedValue({});
  const steerTask = vi.fn().mockResolvedValue({});

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    followUpTask,
    steerTask,
  });

  const textarea = screen.getByPlaceholderText(/Type follow-up prompt or steering instruction/i);
  expect(textarea).toBeInTheDocument();

  // Type intervention text
  fireEvent.change(textarea, { target: { value: 'Optimize database queries' } });

  // Send Steering
  const steerBtn = screen.getByRole('button', { name: /Steer Agent/i });
  fireEvent.click(steerBtn);
  await waitFor(() => {
    expect(steerTask).toHaveBeenCalledWith('proj-1', 't1', 'Optimize database queries');
  });

  // Type again and Send Follow-up
  fireEvent.change(textarea, { target: { value: 'Write integration test' } });
  const followUpBtn = await screen.findByRole('button', { name: /Send Follow-Up/i });
  fireEvent.click(followUpBtn);
  await waitFor(() => {
    expect(followUpTask).toHaveBeenCalledWith('proj-1', 't1', 'Write integration test');
  });
});

test('supports live pause and abort execution controls when task is running', async () => {
  const pauseTask = vi.fn();
  const abortTask = vi.fn();
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

  const runningTask = {
    ...task,
    status: 'running_agent',
  };

  renderWithKainBain(<TaskDetailOverlay task={runningTask} onClose={() => {}} />, {
    stages,
    pauseTask,
    abortTask,
  });

  const pauseBtn = screen.getByRole('button', { name: /Pause/i });
  const abortBtn = screen.getByRole('button', { name: /Abort/i });

  fireEvent.click(pauseBtn);
  expect(pauseTask).toHaveBeenCalledWith('proj-1', 't1');

  // The pause mutation settles before the abort click (single-flight guard).
  await waitFor(() => {
    expect(pauseBtn).toBeEnabled();
  });

  fireEvent.click(abortBtn);
  expect(abortTask).toHaveBeenCalledWith('proj-1', 't1');

  confirmSpy.mockRestore();
});

test('delete shows a loading state, disables the button, and double-click deletes once', async () => {
  let resolveDelete;
  const deleteTask = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
  );
  const onClose = vi.fn();
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={onClose} />, {
    deleteTask,
    stages,
  });

  const deleteBtn = screen.getByRole('button', { name: /Delete Task/i });
  fireEvent.click(deleteBtn);
  fireEvent.click(deleteBtn); // fast second click while the backend is responding

  expect(deleteTask).toHaveBeenCalledTimes(1);
  expect(deleteTask).toHaveBeenCalledWith('proj-1', 't1');
  const deletingBtn = screen.getByRole('button', { name: /Deleting\.\.\./i });
  expect(deletingBtn).toBeDisabled();
  expect(deletingBtn).toHaveAttribute('aria-busy', 'true');

  // The inspector only closes once the backend has confirmed the deletion.
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => {
    resolveDelete({});
  });
  await waitFor(() => {
    expect(onClose).toHaveBeenCalled();
  });

  confirmSpy.mockRestore();
});

test('double-clicking Abort only aborts once', async () => {
  const abortTask = vi.fn().mockResolvedValue({});
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const runningTask = { ...task, status: 'running_agent' };

  renderWithKainBain(<TaskDetailOverlay task={runningTask} onClose={() => {}} />, {
    stages,
    abortTask,
  });

  const abortBtn = screen.getByRole('button', { name: /Abort/i });
  fireEvent.click(abortBtn);
  fireEvent.click(abortBtn); // second click before the backend has responded

  expect(abortTask).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /Aborting\.\.\./i })).toBeDisabled();

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

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    completeTask,
  });

  const completeBtn = screen.getByRole('button', { name: /Complete task|✓ Complete/i });
  fireEvent.click(completeBtn);
  fireEvent.click(completeBtn); // second click before the backend has responded

  expect(completeTask).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /Completing\.\.\./i })).toBeDisabled();

  await act(async () => {
    resolveComplete({});
  });
});

test('the action bar Run Stage button is disabled while executing', async () => {
  let resolveExecute;
  const executeTaskStage = vi.fn().mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveExecute = resolve;
      }),
  );

  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, {
    stages,
    executeTaskStage,
  });

  const runBtn = screen.getByRole('button', { name: /Run stage for task #KB-T1|Run Stage/i });
  fireEvent.click(runBtn);
  fireEvent.click(runBtn); // second click before the backend has responded

  expect(executeTaskStage).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /Running\.\.\./i })).toBeDisabled();

  await act(async () => {
    resolveExecute({});
  });
});

/***
 * MARK: footer-overlap reservation tests
 * @description The task inspector must end above the fixed Now Playing footer
 *   (72px) on mobile AND desktop when the footer is rendered, mirroring the
 *   Configure drawer so neither bar can cover the other's controls.
 ***/
test('inspector reserves the Now Playing footer height by default (footer-overlap contract)', () => {
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} />, { stages });

  const aside = screen.getByRole('complementary', { name: 'Task Inspector' });
  // Mobile: fixed overlay stops 72px above the viewport bottom.
  expect(aside.className).toContain('bottom-[72px]');
  // Desktop: the side panel is 72px shorter than the row instead of h-full.
  expect(aside.className).toContain('h-[calc(100%-72px)]');
  expect(aside.className).not.toContain('h-full');
});

test('inspector fills the full height when the Now Playing footer is hidden', () => {
  renderWithKainBain(<TaskDetailOverlay task={task} onClose={() => {}} footerReserved={false} />, {
    stages,
  });

  const aside = screen.getByRole('complementary', { name: 'Task Inspector' });
  expect(aside.className).toContain('h-full');
  expect(aside.className).not.toContain('bottom-[72px]');
  expect(aside.className).not.toContain('h-[calc(100%-72px)]');
});

/***
 * MARK: failed-banner log shortcut tests
 * @description The failure banner's View Logs shortcut must jump to the logs
 *   tab instead of throwing (it previously called an undefined setter).
 ***/
test('failed-task View Logs jumps to the logs tab without throwing', () => {
  renderWithKainBain(
    <TaskDetailOverlay
      task={{ ...task, status: 'failed', failureReason: 'Stage exploded' }}
      onClose={() => {}}
    />,
    { stages },
  );

  fireEvent.click(screen.getByRole('button', { name: /View error logs for task/i }));
  expect(screen.getByRole('tab', { name: /Logs/i })).toHaveAttribute('aria-selected', 'true');
  // The shortcut also arms the viewer search so the error lanes surface.
  fireEvent.click(screen.getByTestId('log-filter-toggle'));
  expect(screen.getByLabelText('Search logs')).toHaveValue('error');
});

/***
 * MARK: history failure reason tests
 * @description The overlay history tab shows the first line of a failed
 * timeline entry's reason inline, opens the full reason in a modal, and
 * never lets reason metadata split timeline deduplication.
 ***/
test('overlay history shows the failed reason inline with a modal for the full text', () => {
  const failedTask = {
    ...task,
    timeline: [
      {
        timestamp: '14:05',
        stage: 'Review',
        duration: '2m',
        status: 'Failed',
        reason: 'Out of tokens\ntrace line 1',
        stageId: '2',
      },
    ],
  };
  renderWithKainBain(<TaskDetailOverlay task={failedTask} onClose={() => {}} />, { stages });

  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
  expect(screen.getByText('Out of tokens')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'View full reason' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText(/trace line 1/)).toBeInTheDocument();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('reason metadata never splits timeline deduplication', () => {
  const duplicated = {
    ...task,
    timeline: [
      { timestamp: '14:05', stage: 'Review', duration: '2m', status: 'Failed', reason: 'first' },
      { timestamp: '14:05', stage: 'Review', duration: '2m', status: 'Failed', reason: 'second' },
    ],
  };
  renderWithKainBain(<TaskDetailOverlay task={duplicated} onClose={() => {}} />, { stages });

  fireEvent.click(screen.getByRole('tab', { name: /History/i }));
  expect(screen.getByText('Stage Transition Timeline')).toBeInTheDocument();
  expect(screen.getAllByText('Review').length).toBe(1);
  expect(screen.getByText('first')).toBeInTheDocument();
});

test('blocked task header shows BLOCKED with blocker keys, not IN PROGRESS', () => {
  const blockedTask = { ...task, isBlocked: true, blockedBy: ['abc-1234-def'] };
  renderWithKainBain(<TaskDetailOverlay task={blockedTask} onClose={() => {}} />, { stages });
  expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  expect(screen.queryByText('IN PROGRESS')).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Blocked by #KB-ABC1/i)).toBeInTheDocument();
});

test('hides the checkpoint approve banner on terminal-failed tasks and keeps Retry Stage', () => {
  const failedTask = {
    ...task,
    currentStageId: '2',
    status: 'failed',
    failureReason: 'git checkout master failed (exit 128)',
  };
  renderWithKainBain(<TaskDetailOverlay task={failedTask} onClose={() => {}} />, { stages });
  expect(screen.queryByText('Human Review Checkpoint')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Approve task #KB-T1/i })).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /Retry failed stage on task #KB-T1/i }),
  ).toBeInTheDocument();
});
