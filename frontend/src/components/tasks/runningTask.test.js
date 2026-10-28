// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import {
  LIVE_RUNNING_STATUSES,
  isEngineBusyWithOther,
  isLiveRunningStatus,
  isStaleRunner,
  isTaskRunning,
  resolveDisplayedStage,
  resolveRunningTask,
} from './runningTask';

const owner = { id: 'task-a', status: 'running_agent' };
const stale = { id: 'task-b', status: 'running_agent' };
const queued = { id: 'task-c', status: 'in_stage' };
const tasks = [owner, stale, queued];
const runningEngine = { status: 'running', activeTaskId: 'task-a' };
const idleEngine = { status: 'idle', activeTaskId: null };

describe('runningTask selector (single-active invariant)', () => {
  test('owner under a running engine is the single runner', () => {
    expect(isTaskRunning(owner, runningEngine)).toBe(true);
    expect(resolveRunningTask(tasks, runningEngine)).toEqual(owner);
  });

  test('a second running_* label is stale, never running', () => {
    for (const status of LIVE_RUNNING_STATUSES) {
      const other = { id: 'task-b', status };
      expect(isTaskRunning(other, runningEngine)).toBe(false);
      expect(isStaleRunner(other, runningEngine)).toBe(true);
    }
    // The owner itself is never stale.
    expect(isStaleRunner(owner, runningEngine)).toBe(false);
  });

  test('no runner when the engine is idle, even with leftover labels', () => {
    expect(resolveRunningTask(tasks, idleEngine)).toBeNull();
    expect(isTaskRunning(owner, idleEngine)).toBe(false);
    expect(isTaskRunning(stale, idleEngine)).toBe(false);
    expect(isStaleRunner(stale, idleEngine)).toBe(true);
    expect(isStaleRunner(queued, idleEngine)).toBe(false);
  });

  test('no fallback to first running_* label without an engine owner', () => {
    expect(resolveRunningTask(tasks, null)).toBeNull();
    expect(resolveRunningTask(tasks, {})).toBeNull();
    expect(resolveRunningTask(tasks, { status: 'running' })).toBeNull();
    expect(resolveRunningTask([], runningEngine)).toBeNull();
  });

  test('owner missing from the list resolves to null, not a stale stand-in', () => {
    expect(resolveRunningTask([stale, queued], runningEngine)).toBeNull();
  });

  test('without an engine snapshot the label is trusted (isolated renders)', () => {
    expect(isTaskRunning(stale, null)).toBe(true);
    expect(isTaskRunning(stale, undefined)).toBe(true);
    expect(isTaskRunning(stale, {})).toBe(true);
    expect(isTaskRunning(queued, null)).toBe(false);
    expect(isStaleRunner(stale, null)).toBe(false);
    expect(isStaleRunner(stale, {})).toBe(false);
  });

  test('busy-with-other gates manual dispatch UX', () => {
    expect(isEngineBusyWithOther(queued, runningEngine)).toBe(true);
    expect(isEngineBusyWithOther(stale, runningEngine)).toBe(true);
    expect(isEngineBusyWithOther(owner, runningEngine)).toBe(false);
    expect(isEngineBusyWithOther(queued, idleEngine)).toBe(false);
    expect(isEngineBusyWithOther(queued, null)).toBe(false);
  });

  test('isLiveRunningStatus covers every orphanable variant', () => {
    for (const status of [
      'running_agent',
      'running_ci',
      'running_deploy',
      'running_merge',
      'advancing',
    ]) {
      expect(isLiveRunningStatus(status)).toBe(true);
    }
    expect(isLiveRunningStatus('in_stage')).toBe(false);
    expect(isLiveRunningStatus('interrupted')).toBe(false);
    expect(isLiveRunningStatus(undefined)).toBe(false);
  });
});

describe('resolveDisplayedStage (stage agreement)', () => {
  const stages = [
    { id: '1', name: 'Catchup', type: 'agent' },
    { id: 'merge', name: 'Merge and deploy', type: 'merge' },
  ];

  test('the task stage wins over a disagreeing engine snapshot', () => {
    // The reported desync: engine names the merge stage while the task is in
    // Catchup. The task's pipeline stage is authoritative.
    const task = { id: 't1', currentStageId: '1' };
    const engineState = {
      activeTaskId: 't1',
      activeStageId: 'merge',
      activeStageName: 'Merge and deploy',
    };
    expect(resolveDisplayedStage(task, stages, engineState)).toEqual({
      id: '1',
      name: 'Catchup',
      type: 'agent',
    });
  });

  test('matches a stage by case-insensitive name', () => {
    const task = { id: 't1', currentStageId: 'catchup' };
    expect(resolveDisplayedStage(task, stages, {}).name).toBe('Catchup');
  });

  test('falls back to the engine stage when there is no task context', () => {
    expect(
      resolveDisplayedStage(null, stages, {
        activeStageId: 'merge',
        activeStageName: 'Merge and deploy',
        activeStageType: 'merge',
      }),
    ).toEqual({ id: 'merge', name: 'Merge and deploy', type: 'merge' });
  });

  test('uses the task display name when the stage record is gone', () => {
    const task = { id: 't1', currentStageId: 'ghost', currentStageName: 'Ghost stage' };
    expect(resolveDisplayedStage(task, stages, { activeStageName: 'Build' })).toEqual({
      id: 'ghost',
      name: 'Ghost stage',
      type: null,
    });
  });

  test('falls back to the reconciled engine stage name for a cross-pipeline task', () => {
    // The dashboard passes the SELECTED workflow's stages, which may not
    // contain the running task's stage (task from another pipeline). The
    // backend reconciles activeStageName to the owner task, so an agreeing
    // engine name is truth — the pill must not degrade to `ACTIVE: 5`.
    const task = { id: 't1', currentStageId: '5' };
    expect(
      resolveDisplayedStage(task, stages, {
        activeTaskId: 't1',
        activeStageId: '5',
        activeStageName: 'Catchup',
        activeStageType: 'agent',
      }),
    ).toEqual({ id: '5', name: 'Catchup', type: 'agent' });
  });

  test('never borrows a disagreeing engine name for an unknown task stage', () => {
    // A disagreeing engine snapshot may be stranded state from before a
    // manual move: keep the raw id rather than naming the stage left behind.
    const task = { id: 't1', currentStageId: '5' };
    expect(
      resolveDisplayedStage(task, stages, {
        activeTaskId: 't1',
        activeStageId: 'merge',
        activeStageName: 'Merge and deploy',
        activeStageType: 'merge',
      }),
    ).toEqual({ id: '5', name: '5', type: null });
  });

  test('uses a backend-resolved stageName when there is no stage id', () => {
    const task = { id: 't1', stageName: 'Catchup' };
    expect(resolveDisplayedStage(task, stages, { activeStageName: 'Merge and deploy' }).name).toBe(
      'Catchup',
    );
  });

  test('never borrows the engine stage id for a task-named stage', () => {
    // A task name without a stage id must not inherit a possibly-stranded
    // engine id alongside it: report no id rather than a mixed-source one.
    const task = { id: 't1', stageName: 'Catchup' };
    expect(
      resolveDisplayedStage(task, stages, {
        activeTaskId: 't1',
        activeStageId: 'merge',
        activeStageName: 'Merge and deploy',
      }).id,
    ).toBeNull();
  });

  test('returns null when neither source names a stage', () => {
    expect(resolveDisplayedStage(null, [], {})).toBeNull();
    expect(resolveDisplayedStage({ id: 't1' }, stages, {})).toBeNull();
  });
});
