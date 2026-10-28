// Pure checkpoint-resolver logic, no DOM needs.
// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { resolveCheckpointState, resolveTaskStage } from './checkpointState';

/***
 * MARK: checkpointState tests
 * @description Unit coverage for the pipeline-switch stale-checkpoint fix
 *   (task 8a056fc4): checkpoint chrome derives from the active pipeline's
 *   stage record, never from a stale `waiting_human` payload.
 ***/

const AGENT_STAGE = { id: 's-1', name: 'Specification', type: 'agent' };
const HUMAN_STAGE = { id: 's-2', name: 'Review', type: 'human' };
const LEGACY_REVIEW_STAGE = { id: 's-3', name: 'Review', type: 'review' };

describe('resolveTaskStage', () => {
  test('matches by currentStageId', () => {
    expect(resolveTaskStage([AGENT_STAGE, HUMAN_STAGE], { currentStageId: 's-2' })).toBe(
      HUMAN_STAGE,
    );
  });

  test('returns null when nothing resolves', () => {
    expect(resolveTaskStage([AGENT_STAGE], { currentStageId: 'missing' })).toBeNull();
    expect(resolveTaskStage([AGENT_STAGE], {})).toBeNull();
    expect(resolveTaskStage([], { currentStageId: 's-1' })).toBeNull();
    expect(resolveTaskStage(null, { currentStageId: 's-1' })).toBeNull();
  });
});

describe('resolveCheckpointState', () => {
  test('stale waiting_human on an agent stage shows no checkpoint', () => {
    expect(
      resolveCheckpointState({ status: 'waiting_human', currentStageId: 's-1' }, AGENT_STAGE),
    ).toEqual({ showCheckpoint: false });
  });

  test('waiting_human on a human stage shows the checkpoint', () => {
    expect(
      resolveCheckpointState({ status: 'waiting_human', currentStageId: 's-2' }, HUMAN_STAGE),
    ).toEqual({ showCheckpoint: true });
  });

  test('human stage shows the checkpoint regardless of task status', () => {
    expect(resolveCheckpointState({ status: 'in_stage' }, HUMAN_STAGE)).toEqual({
      showCheckpoint: true,
    });
  });

  test('legacy review type counts as a checkpoint', () => {
    expect(resolveCheckpointState({ status: 'active' }, LEGACY_REVIEW_STAGE)).toEqual({
      showCheckpoint: true,
    });
  });

  test('non-checkpoint types (ci/deploy/merge) never show the checkpoint', () => {
    for (const type of ['ci', 'script', 'deploy', 'merge']) {
      expect(
        resolveCheckpointState({ status: 'waiting_human' }, { id: 's-x', name: 'X', type }),
      ).toEqual({ showCheckpoint: false });
    }
  });

  test('unknown/missing stage record is fail-visible: no Approve', () => {
    expect(resolveCheckpointState({ status: 'waiting_human' }, null)).toEqual({
      showCheckpoint: false,
    });
    expect(resolveCheckpointState({ status: 'waiting_human' }, undefined)).toEqual({
      showCheckpoint: false,
    });
    // A record that resolves but carries no usable type is not a checkpoint.
    expect(resolveCheckpointState({ status: 'waiting_human' }, { id: 's-?' })).toEqual({
      showCheckpoint: false,
    });
  });

  test('standalone card without a stage record falls back to the role prop', () => {
    expect(resolveCheckpointState({ status: 'active' }, null, { role: 'human' })).toEqual({
      showCheckpoint: true,
    });
    expect(resolveCheckpointState({ status: 'active' }, null, { role: 'agent' })).toEqual({
      showCheckpoint: false,
    });
    // A stale waiting_human payload alone never promotes an agent role.
    expect(resolveCheckpointState({ status: 'waiting_human' }, null, { role: 'agent' })).toEqual({
      showCheckpoint: false,
    });
  });
});
