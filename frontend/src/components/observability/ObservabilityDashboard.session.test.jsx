import React from 'react';
import { expect, test, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { api } from '../../services/api';
import { invalidateObservability } from '../../services/observabilityEvents';
import { renderWithKainBain } from '../../testUtils';
import { ObservabilityDashboard } from './ObservabilityDashboard';

vi.mock('../../services/api', () => ({ api: { observabilityStatus: vi.fn() } }));

const TASK_ID = 'task-live-1';
const NOW = '2026-10-05T09:12:19.452Z';

// Payload builders below mirror the byte shape `TaskStore.getObservabilityMetrics()`
// returns for this exact scenario (captured from the real store in node; see the
// MARK block). Only `modelId` / `dispatchedPrompt` vary between the two fetches.
function makeActiveTask({ modelId, dispatchedPrompt }) {
  return {
    id: TASK_ID,
    projectId: 'project',
    workflowId: 'wf-default',
    title: 'Live task',
    goal: 'Full task goal',
    body: 'Full task goal',
    prompt: 'Persisted curated prompt',
    currentStageId: 'build',
    status: 'running_agent',
    blockedBy: [],
    reports: [],
    createdAt: NOW,
    updatedAt: NOW,
    enteredStageAt: NOW,
    timeInStage: 0,
    history: [{ timestamp: NOW, action: "Created and placed in stage 'build'" }],
    timeline: [],
    stats: {},
    outputReport: '',
    logEntries: [],
    keywords: [],
    feedback: null,
    projectName: 'Project',
    model: `antigravity::antigravity::${modelId}`,
    harness: 'antigravity',
    modelSelection: 'list',
    isAutomatedStage: false,
    modelDetails: {
      provider: 'antigravity',
      id: modelId,
      key: `antigravity::antigravity::${modelId}`,
      source: 'session',
    },
    stageName: 'Build',
    stageType: 'agent',
    stageId: 'build',
    alias: null,
    aliasMissing: null,
    dispatchedPrompt,
    promptPending: false,
    promptSource: 'session',
  };
}

function makeObservability({ modelId, dispatchedPrompt }) {
  return {
    stats: {
      total: 1,
      completed: 0,
      failed: 0,
      running: 1,
      waitingHuman: 0,
      paused: 0,
      inStage: 0,
      blocked: 0,
      queueDepth: 1,
      successRate: 100,
      failureRate: 0,
    },
    engineState: {
      status: 'running',
      activeTaskId: TASK_ID,
      activeProjectId: 'project',
      activeStageId: 'build',
    },
    queue: [
      {
        id: TASK_ID,
        title: 'Live task',
        goal: 'Full task goal',
        prompt: 'Persisted curated prompt',
        projectId: 'project',
        projectName: 'Project',
        workflowId: 'wf-default',
        currentStageId: 'build',
        currentStageName: 'Build',
        currentStageType: 'agent',
        model: 'default',
        alias: null,
        aliasMissing: null,
        harness: 'antigravity',
        status: 'running_agent',
        isRunning: true,
        isBlocked: false,
        blockers: [],
        stageIndex: 0,
        totalStages: 1,
        enteredStageAt: NOW,
        timeInStage: 0,
        priorityRank: 0,
        priorityReason: 'Active Execution',
        updatedAt: NOW,
        queueOrder: 1,
      },
    ],
    activeTask: makeActiveTask({ modelId, dispatchedPrompt }),
    recentCompleted: [],
    recentFailed: [],
    executionQueue: { isRunning: false, size: 0, highQueueSize: 0, normalQueueSize: 0 },
    schedulerRunning: false,
    schedulerStats: {
      ticks: 0,
      dispatched: 0,
      idleNoCandidate: 0,
      skippedBusy: 0,
      lastTickAt: null,
      lastDispatchAt: null,
      lastOutcome: null,
    },
  };
}

/***
 * MARK: nonPiSessionRefresh
 * @description Exercises session-model/prompt refresh, invalidation, and dashboard rendering.
 * The HTTP boundary is replaced with canned payloads in the exact shape the real
 * `TaskStore.getObservabilityMetrics()` returns for this scenario; the live model and
 * prompt change between the two fetches exactly as a session update would. The REAL
 * metrics-enrichment path (accessor-only non-pi session → model/dispatchedPrompt) is
 * covered natively in `api/taskStore.observability.test.js` — this suite must NOT import
 * the api tree: `TaskStore`'s graph carries `node:` builtins, and a DOM-env suite that
 * loads them flakes under the overlapped gate with `No such built-in module: node:`
 * (see the node-env contract in `tests/run-parallel.test.mjs`).
 ***/
test('refreshes a non-pi session model and full dispatched prompt within five seconds', async () => {
  localStorage.clear();
  localStorage.setItem(
    'kainbain_observability_layout_v2',
    JSON.stringify([
      { instanceId: 'activeTask', id: 'activeTask', colSpan: 4, height: 'tall', enabled: true },
    ]),
  );
  const task = {
    id: TASK_ID,
    projectId: 'project',
    workflowId: 'wf-default',
    title: 'Live task',
    goal: 'Full task goal',
    body: 'Full task goal',
    prompt: 'Persisted curated prompt',
    currentStageId: 'build',
    status: 'running_agent',
    blockedBy: [],
    reports: [],
    createdAt: NOW,
    updatedAt: NOW,
    enteredStageAt: NOW,
    timeInStage: 0,
    history: [{ timestamp: NOW, action: "Created and placed in stage 'build'" }],
    timeline: [],
    stats: {},
    outputReport: '',
    logEntries: [],
    keywords: [],
    feedback: null,
  };
  const engineState = {
    status: 'running',
    activeTaskId: task.id,
    activeProjectId: task.projectId,
    activeStageId: 'build',
  };
  let modelId = 'initial-model';
  let prompt = 'Initial dispatched prompt\n# Git Context\nInitial context';
  api.observabilityStatus.mockImplementation(async () => ({
    observability: makeObservability({ modelId, dispatchedPrompt: prompt }),
  }));
  const { unmount } = renderWithKainBain(<ObservabilityDashboard />, {
    engineState,
    tasks: [task],
  });
  try {
    const card = within(screen.getByTestId('widget-activeTask'));
    await waitFor(() => expect(card.getByText('initial-model')).toBeInTheDocument());
    expect(card.getByTestId('active-prompt-viewer')).toHaveTextContent('Initial dispatched prompt');

    modelId = 'changed-model';
    prompt = 'Changed full dispatched prompt\n# Git Context\nNew dispatch-only context';
    const startedAt = performance.now();
    act(() => {
      invalidateObservability('PROCESS_START', {
        taskId: task.id,
        projectId: task.projectId,
        prompt: 'Never trust socket prompt',
      });
      invalidateObservability('TASK_UPDATED', { id: task.id, projectId: task.projectId });
    });
    await waitFor(
      () => {
        expect(card.getByText('changed-model')).toBeInTheDocument();
        expect(card.getByTestId('active-prompt-viewer')).toHaveTextContent(
          'Changed full dispatched prompt',
        );
        expect(card.getByTestId('active-prompt-viewer')).toHaveTextContent(
          'New dispatch-only context',
        );
      },
      { timeout: 4500 },
    );
    expect(performance.now() - startedAt).toBeLessThan(5000);
    expect(card.getByText('antigravity', { exact: true })).toBeInTheDocument();
    expect(card.queryByText('initial-model')).not.toBeInTheDocument();
    expect(card.queryByText('Pi Agent')).not.toBeInTheDocument();
    expect(card.getByTestId('active-prompt-viewer')).not.toHaveTextContent(
      'Never trust socket prompt',
    );
    expect(api.observabilityStatus).toHaveBeenCalledTimes(2);
    expect(api.observabilityStatus).toHaveBeenLastCalledWith(undefined, true);
    expect(task.prompt).toBe('Persisted curated prompt');
  } finally {
    unmount();
    api.observabilityStatus.mockReset();
  }
});
