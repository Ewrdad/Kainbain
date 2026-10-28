// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { expect, test } from 'vitest';
import {
  resolveActiveTaskDisplay,
  resolveCandidateTask,
  resolveOwnerTask,
  resolveUniversalNowPlaying,
} from './activeTaskVisibility';
import '@testing-library/jest-dom';

/***
 * MARK: activeTaskVisibility tests
 * @description Pins the idle-gate semantics behind the NowPlayingBar task
 * name: while the engine is idle there is no running task, so the stale
 * fallback (usually tasks[0]) must resolve to null instead of lingering in
 * the bar. Non-idle states (running, checkpoint, paused, failed,
 * interrupted) keep showing the relevant task.
 ***/
const openTasks = [
  { id: 't1', currentStageId: '1', status: 'in_stage', title: 'First task' },
  { id: 't2', currentStageId: '2', status: 'in_stage', title: 'Second task' },
];

test('idle engine with tasks present resolves to no visible task', () => {
  const { activeTask, hasActiveDisplay } = resolveActiveTaskDisplay({
    tasks: openTasks,
    engineState: { status: 'idle' },
    currentStageId: '1',
    isAgentRunning: false,
    currentStage: { id: '1' },
  });
  expect(activeTask).toBeNull();
  expect(hasActiveDisplay).toBe(false);
});

test('missing engine state counts as idle', () => {
  const { activeTask } = resolveActiveTaskDisplay({
    tasks: openTasks,
    engineState: undefined,
    currentStageId: '1',
    isAgentRunning: false,
    currentStage: { id: '1' },
  });
  expect(activeTask).toBeNull();
});

test('running engine shows the flagged active task', () => {
  const { activeTask, hasActiveDisplay } = resolveActiveTaskDisplay({
    tasks: openTasks,
    engineState: { status: 'running', activeTaskId: 't2' },
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  expect(activeTask?.id).toBe('t2');
  expect(hasActiveDisplay).toBe(true);
});

test('agent running with a stale status string still shows the task', () => {
  const { activeTask } = resolveActiveTaskDisplay({
    tasks: openTasks,
    engineState: { status: 'idle' },
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  expect(activeTask?.id).toBe('t1');
});

test('checkpoint, waiting-human, paused, failed, and interrupted states keep the task visible', () => {
  const busyStates = [
    { engineState: { status: 'checkpoint' }, currentStage: { id: '1' } },
    { engineState: { status: 'waiting_human' }, currentStage: { id: '1' } },
    { engineState: { status: 'paused' }, currentStage: { id: '1' } },
    { engineState: { status: 'failed' }, currentStage: { id: '1' } },
    { engineState: { status: 'interrupted' }, currentStage: { id: '1' } },
  ];
  for (const { engineState, currentStage } of busyStates) {
    const { activeTask } = resolveActiveTaskDisplay({
      tasks: openTasks,
      engineState,
      currentStageId: '1',
      isAgentRunning: false,
      currentStage,
    });
    expect(activeTask?.id, `status ${engineState.status}`).toBe('t1');
  }

  const failedTask = [{ id: 't9', currentStageId: '1', status: 'failed', title: 'Broke' }];
  expect(
    resolveActiveTaskDisplay({
      tasks: failedTask,
      engineState: { status: 'idle' },
      currentStageId: '1',
      isAgentRunning: false,
      currentStage: { id: '1' },
    }).activeTask?.id,
  ).toBe('t9');
});

test('idle engine still names a waiting-human task (task-level checkpoint)', () => {
  // Pins the canary setup contract: PATCHing a task to waiting_human is a
  // metadata-only update that leaves engineState idle, yet the bar must keep
  // naming that task so the inspector trigger exists.
  const waiting = [
    { id: 't7', currentStageId: '1', status: 'waiting_human', title: 'Needs review' },
  ];
  const { activeTask, hasActiveDisplay, isCheckpoint } = resolveActiveTaskDisplay({
    tasks: waiting,
    engineState: { status: 'idle' },
    currentStageId: '1',
    isAgentRunning: false,
    currentStage: { id: '1' },
  });
  expect(isCheckpoint).toBe(true);
  expect(hasActiveDisplay).toBe(true);
  expect(activeTask?.id).toBe('t7');
});

test('running engine never names a stale fallback instead of the owner', () => {
  // The reported bug: two tasks look running at once. The bar's task list
  // can hold a stale running_agent label at the head while the engine owner
  // sits elsewhere — the bar must name the owner, not the stale head.
  const mixed = [
    { id: 't-stale', currentStageId: '1', status: 'running_agent', title: 'Stale runner' },
    { id: 't-owner', currentStageId: '1', status: 'running_agent', title: 'Engine owner' },
  ];
  const { activeTask, isRunning } = resolveActiveTaskDisplay({
    tasks: mixed,
    engineState: { status: 'running', activeTaskId: 't-owner' },
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  expect(isRunning).toBe(true);
  expect(activeTask?.id).toBe('t-owner');
});

test('running engine with the owner outside the visible list names nothing', () => {
  // A filtered list (another workflow/project) may not contain the owner.
  // Naming the stage/tasks[0] fallback then would show a second "running"
  // task next to the dashboard's owner. The ungated candidate keeps the
  // fallback for queue-depth derivations; the named task clears to null.
  const { activeTask, candidateTask, isRunning } = resolveActiveTaskDisplay({
    tasks: openTasks,
    engineState: { status: 'running', activeTaskId: 't-elsewhere' },
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  expect(isRunning).toBe(true);
  expect(activeTask).toBeNull();
  expect(candidateTask?.id).toBe('t1');
});

test('running engine derives badge flags from the owner, not the fallback', () => {
  // A failed task elsewhere in the list must not flip the bar to FAILED
  // while the engine runs a healthy owner.
  const mixed = [
    { id: 't-broke', currentStageId: '1', status: 'failed', title: 'Broke' },
    { id: 't-owner', currentStageId: '1', status: 'running_agent', title: 'Engine owner' },
  ];
  const { activeTask, isFailed, isRunning } = resolveActiveTaskDisplay({
    tasks: mixed,
    engineState: { status: 'running', activeTaskId: 't-owner' },
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  expect(isRunning).toBe(true);
  expect(isFailed).toBe(false);
  expect(activeTask?.id).toBe('t-owner');
});

/***
 * MARK: resolveUniversalNowPlaying tests
 * @description Pins the universal-queue contract: the selector takes only the
 * task list + engine state (no workflowId/stage pointer), the engine owner
 * wins, the queue counts every pipeline, and the fallback is
 * pipeline-independent (most-recently-updated open task, never list order).
 ***/
const multiPipelineTasks = [
  {
    id: 't-a1',
    workflowId: 'wf-a',
    status: 'in_stage',
    title: 'Alpha',
    updatedAt: '2026-09-24T08:00:00.000Z',
  },
  {
    id: 't-b1',
    workflowId: 'wf-b',
    status: 'in_stage',
    title: 'Beta',
    updatedAt: '2026-09-24T09:00:00.000Z',
  },
  {
    id: 't-b2',
    workflowId: 'wf-b',
    status: 'completed',
    title: 'Beta done',
    updatedAt: '2026-09-24T10:00:00.000Z',
  },
];

test('universal selector resolves the engine owner across pipelines', () => {
  const { ownerTask, candidateTask, ownerWorkflowId } = resolveUniversalNowPlaying({
    tasks: multiPipelineTasks,
    engineState: { status: 'running', activeTaskId: 't-a1' },
  });
  expect(ownerTask?.id).toBe('t-a1');
  expect(candidateTask?.id).toBe('t-a1');
  expect(ownerWorkflowId).toBe('wf-a');
});

test('universal selector takes no workflow/stage input and ignores pipeline order', () => {
  // Same tasks, reversed list order, no stage pointer anywhere: the fallback
  // still picks the most recently updated open task (t-b1), not the head.
  const reversed = [...multiPipelineTasks].reverse();
  const { candidateTask, ownerTask } = resolveUniversalNowPlaying({
    tasks: reversed,
    engineState: { status: 'idle' },
  });
  expect(ownerTask).toBeNull();
  expect(candidateTask?.id).toBe('t-b1');
});

test('universal queue depth counts open tasks across all pipelines', () => {
  const { queueDepth, hasNextTask } = resolveUniversalNowPlaying({
    tasks: multiPipelineTasks,
    engineState: { status: 'idle' },
  });
  // t-a1 + t-b1 open (both pipelines); completed t-b2 excluded.
  expect(queueDepth).toBe(2);
  expect(hasNextTask).toBe(true);
});

test('universal selector excludes completed/done tasks and empties honestly', () => {
  expect(
    resolveUniversalNowPlaying({
      tasks: [{ id: 't1', workflowId: 'wf-a', status: 'completed' }],
      engineState: { status: 'idle' },
    }),
  ).toMatchObject({ queueDepth: 0, hasNextTask: false, candidateTask: null, ownerTask: null });
  expect(resolveUniversalNowPlaying({ tasks: [], engineState: { status: 'idle' } })).toMatchObject({
    queueDepth: 0,
    hasNextTask: false,
    candidateTask: null,
  });
  expect(resolveUniversalNowPlaying({ engineState: { status: 'idle' } })).toMatchObject({
    queueDepth: 0,
    hasNextTask: false,
    candidateTask: null,
  });
});

test('universal selector keeps the owner-absent invariant (name nothing, keep candidate)', () => {
  const { ownerTask, candidateTask } = resolveUniversalNowPlaying({
    tasks: multiPipelineTasks,
    engineState: { status: 'running', activeTaskId: 't-elsewhere' },
  });
  expect(ownerTask).toBeNull();
  expect(candidateTask?.id).toBe('t-b1');
});

test('universal single-task queue has depth one and no next task', () => {
  const { queueDepth, hasNextTask } = resolveUniversalNowPlaying({
    tasks: [{ id: 't1', status: 'in_stage' }],
    engineState: { status: 'idle' },
  });
  expect(queueDepth).toBe(1);
  expect(hasNextTask).toBe(false);
});

/***
 * MARK: project-independent owner tests
 * @description Pins the single-pipeline fix: the engine snapshot carries the
 * full owner-task snapshot, so the bar keeps naming the owner after a project
 * switch swaps the loaded list for another project's tasks. The snapshot is
 * only trusted when its id matches the flagged owner id.
 ***/
const ownerSnapshot = {
  id: 't-a1',
  workflowId: 'wf-a',
  // Production shape: the backend snapshot carries the owning pipeline's
  // display name (see TaskStore.getEngineState).
  workflowName: 'Pipeline A',
  projectId: 'proj-a',
  status: 'running_agent',
  title: 'Alpha session',
  goal: 'Alpha session',
  updatedAt: '2026-09-24T09:00:00.000Z',
};
const projectBTasks = [
  {
    id: 't-b1',
    workflowId: 'wf-b',
    status: 'in_stage',
    title: 'Beta session',
    updatedAt: '2026-09-24T10:00:00.000Z',
  },
  {
    id: 't-b2',
    workflowId: 'wf-b',
    status: 'in_stage',
    title: 'Beta follow-up',
    updatedAt: '2026-09-24T11:00:00.000Z',
  },
];
const snapshotEngine = {
  status: 'running',
  activeTaskId: 't-a1',
  activeTask: ownerSnapshot,
};

test('owner resolves from the snapshot when the loaded list no longer contains it', () => {
  expect(resolveOwnerTask(projectBTasks, snapshotEngine)?.id).toBe('t-a1');
});

test('in-list owner wins over the snapshot', () => {
  const withOwner = [...projectBTasks, { ...ownerSnapshot, status: 'in_stage' }];
  expect(resolveOwnerTask(withOwner, snapshotEngine)).toBe(withOwner[2]);
});

test('stale snapshot (id mismatch) is never trusted', () => {
  const stale = { ...snapshotEngine, activeTask: { ...ownerSnapshot, id: 't-old' } };
  expect(resolveOwnerTask(projectBTasks, stale)).toBeNull();
  expect(
    resolveUniversalNowPlaying({ tasks: projectBTasks, engineState: stale }).ownerTask,
  ).toBeNull();
});

test('no owner id means no owner even with a snapshot present', () => {
  expect(resolveOwnerTask(projectBTasks, { status: 'idle', activeTask: ownerSnapshot })).toBeNull();
});

test('provenance name survives the list swap via the snapshot (no workflows lookup)', () => {
  // After a project switch the workflows list holds only the other project's
  // pipelines, so the bar's provenance chip must come from the snapshot.
  const { ownerWorkflowId, ownerWorkflowName } = resolveUniversalNowPlaying({
    tasks: projectBTasks,
    engineState: snapshotEngine,
  });
  expect(ownerWorkflowId).toBe('wf-a');
  expect(ownerWorkflowName).toBe('Pipeline A');
});

test('display keeps naming the snapshot owner across a project switch', () => {
  const projectATasks = [
    { ...ownerSnapshot, status: 'in_stage' },
    { id: 't-a2', workflowId: 'wf-a', status: 'in_stage', title: 'Alpha two' },
  ];
  const before = resolveActiveTaskDisplay({
    tasks: projectATasks,
    engineState: snapshotEngine,
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  const after = resolveActiveTaskDisplay({
    tasks: projectBTasks,
    engineState: snapshotEngine,
    currentStageId: '1',
    isAgentRunning: true,
    currentStage: { id: '1' },
  });
  expect(before.activeTask?.id).toBe('t-a1');
  expect(after.activeTask?.id).toBe('t-a1');
  expect(after.activeTask?.title).toBe('Alpha session');
});

test('global queue depth from the engine wins over the loaded slice', () => {
  const { queueDepth, hasNextTask } = resolveUniversalNowPlaying({
    tasks: projectBTasks,
    engineState: { ...snapshotEngine, openQueueDepth: 5 },
  });
  expect(queueDepth).toBe(5);
  expect(hasNextTask).toBe(true);
});

test('global queue depth of one means no next task even with a candidate', () => {
  const { queueDepth, hasNextTask } = resolveUniversalNowPlaying({
    tasks: projectBTasks,
    engineState: { status: 'running', activeTaskId: 't-b1', openQueueDepth: 1 },
  });
  expect(queueDepth).toBe(1);
  expect(hasNextTask).toBe(false);
});

test('absent global depth falls back to the loaded-list count', () => {
  const { queueDepth, hasNextTask } = resolveUniversalNowPlaying({
    tasks: projectBTasks,
    engineState: snapshotEngine,
  });
  expect(queueDepth).toBe(2);
  expect(hasNextTask).toBe(true);
});

test('running engine with a paused selected stage keeps isStagePaused false (badge stays RUNNING)', () => {
  // Adversarial check from PR review: switching projects may focus a paused
  // stage in that project's board, but the global engine status badge must not
  // flip RUNNING -> PAUSED while the engine is running.
  const display = resolveActiveTaskDisplay({
    tasks: projectBTasks,
    engineState: snapshotEngine,
    currentStageId: 'paused-stage',
    isAgentRunning: true,
    currentStage: { id: 'paused-stage', paused: true },
  });
  expect(display.isRunning).toBe(true);
  expect(display.isStagePaused).toBe(false);
  expect(display.activeTask?.id).toBe('t-a1');
});

test('candidate prefers the flagged task, then the open current-stage task, then the first task', () => {
  expect(resolveCandidateTask(openTasks, { activeTaskId: 't2' }, '1')?.id).toBe('t2');
  expect(resolveCandidateTask(openTasks, {}, '2')?.id).toBe('t2');
  expect(resolveCandidateTask(openTasks, {}, '9')?.id).toBe('t1');
  expect(resolveCandidateTask([], {}, '1')).toBeNull();
  expect(resolveCandidateTask(undefined, {}, '1')).toBeNull();
});
