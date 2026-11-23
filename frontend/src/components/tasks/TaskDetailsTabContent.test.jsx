import React from 'react';
import { expect, test, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { TaskDetailsTab } from './TaskDetailsTabContent';
import { renderWithKainBain } from '../../testUtils';
import '@testing-library/jest-dom';

/***
 * MARK: TaskDetailsTab readability tests
 * @description Pins the details-tab readability pass: banner explainer
 *   paragraphs render at body size (text-sm) instead of fine print, and the
 *   steering helper reads at text-xs.
 */
function makeProps(overrides = {}) {
  return {
    activeProjectId: 'proj-1',
    approvalGuidance: '',
    completeTask: vi.fn(),
    uncompleteTask: vi.fn(),
    copiedKeyword: null,
    currentStageId: 'stage-1',
    failureMessage: 'Something broke',
    formattedKey: '#KB-T1',
    goalError: null,
    goalHandleBlur: vi.fn(),
    goalIsDirty: false,
    goalIsSaving: false,
    goalLastSaved: null,
    hasUnsyncedChanges: false,
    handleApprove: vi.fn(),
    handleCopyKeyword: vi.fn(),
    handleExecuteStage: vi.fn(),
    handleReject: vi.fn(),
    handleResumeTask: vi.fn(),
    handleRetryStage: vi.fn(),
    handleSendFollowUp: vi.fn(),
    handleSendSteering: vi.fn(),
    interventionText: '',
    isAdvancing: false,
    isBlocked: false,
    isExecutingStage: false,
    isFailed: false,
    isFlushingSave: false,
    isIntervening: false,
    isInterrupted: false,
    isMutating: false,
    isNonAgentStage: false,
    isPaused: false,
    isRejected: false,
    isRetryingStage: false,
    isTaskExecuting: false,
    isTerminalApproval: false,
    isWaitingHuman: false,
    jumpTask: vi.fn(),
    keywordTokens: [],
    logs: { viewer: { setSearch: vi.fn() } },
    pendingAction: null,
    renderExecutionControls: () => null,
    runTaskAction: vi.fn(),
    saveChanges: vi.fn(),
    saved: false,
    setActiveTab: vi.fn(),
    setApprovalGuidance: vi.fn(),
    setInterventionText: vi.fn(),
    setShowApprovalGuidance: vi.fn(),
    onTitleChange: vi.fn(),
    showApprovalGuidance: false,
    task: { id: 't1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' },
    taskStage: { name: 'Build', type: 'agent' },
    title: 'Do the thing',
    uniqueReports: [],
    ...overrides,
  };
}

test('interrupted banner explainer reads at body size', () => {
  renderWithKainBain(<TaskDetailsTab {...makeProps({ isInterrupted: true })} />);
  const explainer = screen.getByText(/Its state has been safely preserved on disk/);
  expect(explainer.className).toContain('text-sm');
  expect(explainer.className).toContain('leading-relaxed');
});

test('paused banner explainer reads at body size', () => {
  renderWithKainBain(<TaskDetailsTab {...makeProps({ isPaused: true })} />);
  const explainer = screen.getByText(/Execution is temporarily paused/);
  expect(explainer.className).toContain('text-sm');
});

test('human checkpoint explainer reads at body size', () => {
  renderWithKainBain(
    <TaskDetailsTab
      {...makeProps({
        isWaitingHuman: true,
        taskStage: { name: 'Review', type: 'human' },
        task: { id: 't1', status: 'waiting_human', createdAt: '2026-01-01T00:00:00.000Z' },
      })}
    />,
  );
  expect(screen.getByText('Human Review Checkpoint')).toBeInTheDocument();
  // The explainer is the checkpoint banner's leading-relaxed paragraph.
  const banner = screen.getByText('Human Review Checkpoint').closest('div[class*="bg-human-fill"]');
  const explainer = banner.querySelector('p.leading-relaxed');
  expect(explainer).not.toBeNull();
  expect(explainer.className).toContain('text-sm');
});

test('steering helper reads larger than before without changing meaning', () => {
  renderWithKainBain(<TaskDetailsTab {...makeProps()} />);
  const helper = screen.getByText(/Send instructions directly to the agent session/);
  expect(helper.className).toContain('text-xs');
  expect(helper.className).not.toContain('text-[11px]');
});

const commitFailureTask = {
  id: 't1',
  status: 'failed',
  createdAt: '2026-01-01T00:00:00.000Z',
  failureReason: 'Commit blocked by pre-commit hook: 2 corrupt files',
  lastError: {
    message: 'Commit blocked by pre-commit hook: 2 corrupt files',
    stageId: 'stage-1',
    stageName: 'Build',
    failureKind: 'commit-failed',
    gitDiagnostics: {
      kind: 'hook-rejected',
      phase: 'stage-commit',
      command: 'git commit -m kb/t1 stage output',
      exitCode: 1,
      hookName: 'pre-commit',
      files: ['docs/tasks/t1/assets/a.png', 'shot.png'],
      hookOutput: 'binary-guard check FAILED (2 corrupt binaries)',
      remedy: 'Re-capture each corrupt file, then retry the stage.',
      summary: 'Commit blocked by pre-commit hook: 2 corrupt files',
    },
  },
};

test('commit failure banner names the commit and shows the structured callout', () => {
  renderWithKainBain(
    <TaskDetailsTab
      {...makeProps({
        isFailed: true,
        failureMessage: 'Commit blocked by pre-commit hook: 2 corrupt files',
        task: commitFailureTask,
      })}
    />,
  );
  expect(screen.getByText('⚠️ Commit Failed')).toBeInTheDocument();
  expect(screen.queryByText(/Stage Execution Failed/)).not.toBeInTheDocument();
  expect(screen.getByTestId('git-failure-details')).toBeInTheDocument();
  expect(screen.getByTestId('git-failure-title')).toHaveTextContent(
    'Commit blocked by pre-commit hook',
  );
  expect(screen.getByTestId('git-failure-files')).toHaveTextContent('shot.png');
  expect(screen.getByTestId('git-failure-remedy')).toHaveTextContent('Re-capture');
});

test('backend-shaped diagnostics keep the generic banner with no callout', () => {
  const backendDiagnosticsTask = {
    ...commitFailureTask,
    failureReason: 'Merge conflicts in: a.txt',
    lastError: {
      message: 'Merge conflicts in: a.txt',
      stageId: 'stage-1',
      stageName: 'Merge',
      gitDiagnostics: { kind: 'merge-conflict', conflictedFiles: ['a.txt'] },
    },
  };
  renderWithKainBain(
    <TaskDetailsTab
      {...makeProps({
        isFailed: true,
        failureMessage: 'Merge conflicts in: a.txt',
        task: backendDiagnosticsTask,
      })}
    />,
  );
  expect(screen.getByText(/Stage Execution Failed/)).toBeInTheDocument();
  expect(screen.queryByTestId('git-failure-details')).not.toBeInTheDocument();
});
