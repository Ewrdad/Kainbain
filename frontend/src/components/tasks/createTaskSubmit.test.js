// node env pin: pure-logic suite (no DOM needs); skips the DOM env cost per CI-wall budget.
// @vitest-environment node
// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import {
  defaultFileTaskTitle,
  formatFileReference,
  stagesForWorkflow,
  submitCreateTask,
} from './createTaskSubmit';

/***
 * MARK: createTaskSubmit tests
 * @description Verifies the shared task-submission core: the file-reference
 *   pre-fill wording, per-pipeline stage lookup, inspector opening, and the
 *   checkpoint vs automated dispatch rule.
 ***/
describe('formatFileReference', () => {
  it('builds the exact provenance line for a file path', () => {
    expect(formatFileReference('src/api.js')).toBe('In reference to: src/api.js');
  });
});

describe('defaultFileTaskTitle', () => {
  it('suggests a cleanup title from the file base name', () => {
    expect(defaultFileTaskTitle('src/api.js')).toBe('Cleanup: api.js');
  });

  it('falls back to a generic name for an empty path', () => {
    expect(defaultFileTaskTitle('')).toBe('Cleanup: file');
  });
});

describe('stagesForWorkflow', () => {
  const workflows = [
    {
      id: 'wf-1',
      name: 'Feature',
      stages: [{ id: 's-1', name: 'Idea', type: 'agent' }],
    },
    { id: 'wf-2', name: 'Hotfix', stages: [{ id: 's-9', name: 'Fix', type: 'agent' }] },
  ];

  it('returns the selected pipeline stages', () => {
    expect(stagesForWorkflow(workflows, 'wf-2', workflows[0].stages)).toEqual([
      { id: 's-9', name: 'Fix', type: 'agent' },
    ]);
  });

  it('falls back to the active stages when the entry carries none', () => {
    const fallback = [{ id: 's-1', name: 'Idea', type: 'agent' }];
    expect(stagesForWorkflow([{ id: 'wf-1', name: 'Bare' }], 'wf-1', fallback)).toEqual(fallback);
  });

  it('returns an empty list when nothing is known', () => {
    expect(stagesForWorkflow([], 'wf-1', [])).toEqual([]);
  });
});

describe('submitCreateTask', () => {
  const agentStages = [{ id: 'stage-1', name: 'Idea', type: 'agent' }];
  const createdTask = { id: 'task-123', title: 'Cleanup', goal: 'In reference to: a.js' };

  function setup(overrides = {}) {
    return {
      projectId: 'proj-1',
      title: 'Cleanup: a.js',
      goal: 'In reference to: a.js',
      stageId: 'stage-1',
      workflowId: 'wf-1',
      activeWorkflowId: 'wf-1',
      stages: agentStages,
      createTask: vi.fn().mockResolvedValue(createdTask),
      switchWorkflow: vi.fn(),
      executeTaskStage: vi.fn().mockResolvedValue({ status: 'running' }),
      setSelectedTask: vi.fn(),
      ...overrides,
    };
  }

  it('files the task with the exact payload and opens the inspector', async () => {
    const args = setup();
    const created = await submitCreateTask(args);

    expect(args.createTask).toHaveBeenCalledWith('proj-1', {
      title: 'Cleanup: a.js',
      goal: 'In reference to: a.js',
      stageId: 'stage-1',
      workflowId: 'wf-1',
    });
    expect(args.setSelectedTask).toHaveBeenCalledWith(createdTask);
    expect(created).toEqual(createdTask);
  });

  it('auto-dispatches the agent for automated stages', async () => {
    const args = setup();
    await submitCreateTask(args);
    expect(args.executeTaskStage).toHaveBeenCalledWith('proj-1', 'task-123');
  });

  it('never dispatches for human checkpoint stages', async () => {
    const args = setup({
      stages: [{ id: 'stage-1', name: 'Review', type: 'human' }],
    });
    await submitCreateTask(args);
    expect(args.createTask).toHaveBeenCalled();
    expect(args.setSelectedTask).toHaveBeenCalledWith(createdTask);
    expect(args.executeTaskStage).not.toHaveBeenCalled();
  });

  it('switches the board to a non-active pipeline before filing', async () => {
    const hotfixStages = [{ id: 'stage-9', name: 'Fix', type: 'agent' }];
    const args = setup({
      stageId: 'stage-9',
      stages: hotfixStages,
      workflowId: 'wf-2',
      activeWorkflowId: 'wf-1',
      switchWorkflow: vi.fn().mockResolvedValue({ stages: hotfixStages }),
    });
    await submitCreateTask(args);

    expect(args.switchWorkflow).toHaveBeenCalledWith('proj-1', 'wf-2');
    expect(args.createTask).toHaveBeenCalledWith('proj-1', {
      title: 'Cleanup: a.js',
      goal: 'In reference to: a.js',
      stageId: 'stage-9',
      workflowId: 'wf-2',
    });
  });

  it('never switches when the target is already active', async () => {
    const args = setup();
    await submitCreateTask(args);
    expect(args.switchWorkflow).not.toHaveBeenCalled();
  });

  it('lets creation failures propagate without opening the inspector', async () => {
    const args = setup({ createTask: vi.fn().mockRejectedValue(new Error('stage unknown')) });
    await expect(submitCreateTask(args)).rejects.toThrow('stage unknown');
    expect(args.setSelectedTask).not.toHaveBeenCalled();
    expect(args.executeTaskStage).not.toHaveBeenCalled();
  });

  it('does nothing visible when creation is skipped (null result)', async () => {
    const args = setup({ createTask: vi.fn().mockResolvedValue(null) });
    const created = await submitCreateTask(args);
    expect(created).toBeNull();
    expect(args.setSelectedTask).not.toHaveBeenCalled();
    expect(args.executeTaskStage).not.toHaveBeenCalled();
  });
});
