// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  sumActiveSeconds,
  wallClockSeconds,
  formatCompactDuration,
  formatTaskTotals,
  isRetrospectiveTaskFailed,
  stageSampleFailed,
  selectVisibleTasks,
  computeRetrospectiveStats,
  listWorkflows,
} from './retrospectiveStats';
import { retrospectiveTaskFixtures } from './__fixtures__/index.js';

/***
 * MARK: retrospectiveStats tests
 * @description Locks the histories derived-data contract: active/wall-clock
 *   totals, failure verdicts, sort/filter, and stats-strip counts.
 ***/
describe('retrospectiveStats', () => {
  it('sums active seconds across samples', () => {
    expect(sumActiveSeconds(retrospectiveTaskFixtures[0])).toBe(120 + 600 + 300 + 3600);
    expect(sumActiveSeconds(retrospectiveTaskFixtures[3])).toBe(0);
    expect(sumActiveSeconds(null)).toBe(0);
  });

  it('measures wall-clock to updatedAt for terminal tasks and now for open ones', () => {
    const done = retrospectiveTaskFixtures[0];
    expect(wallClockSeconds(done)).toBe(8 * 3600);
    const open = retrospectiveTaskFixtures[2];
    const now = new Date('2026-09-28T10:15:00.000Z').getTime();
    expect(wallClockSeconds(open, now)).toBe(2 * 3600 + 15 * 60);
    expect(wallClockSeconds(null)).toBe(0);
  });

  it('formats compact durations across scales', () => {
    expect(formatCompactDuration(45)).toBe('45s');
    expect(formatCompactDuration(180)).toBe('3m');
    expect(formatCompactDuration(8 * 3600 + 12 * 60)).toBe('8h 12m');
    expect(formatCompactDuration(2 * 86400)).toBe('2d');
    expect(formatCompactDuration(3 * 86400 + 10 * 3600)).toBe('3d 10h');
    expect(formatCompactDuration(-1)).toBe('--');
  });

  it('renders wall-clock vs active totals', () => {
    expect(formatTaskTotals(retrospectiveTaskFixtures[0])).toBe('8h (1h 17m active)');
  });

  it('verdicts match TaskCard failure semantics', () => {
    expect(isRetrospectiveTaskFailed(retrospectiveTaskFixtures[1])).toBe(true);
    expect(isRetrospectiveTaskFailed(retrospectiveTaskFixtures[0])).toBe(false);
    expect(isRetrospectiveTaskFailed({ failureReason: 'x', autoRetrying: true })).toBe(false);
    expect(isRetrospectiveTaskFailed({ failureReason: 'x' })).toBe(true);
  });

  it('still verdicts a rejection as failed while its auto-retry is queued', () => {
    expect(
      isRetrospectiveTaskFailed({
        failureReason: 'review found a gap',
        autoRetrying: true,
        lastError: { message: 'review found a gap', failureKind: 'rejected' },
      }),
    ).toBe(true);
  });

  it('matches FAILED report markers to duration samples', () => {
    const failed = retrospectiveTaskFixtures[1];
    expect(stageSampleFailed(failed, { stageId: 'implement', stageName: 'Implement' })).toBe(true);
    expect(stageSampleFailed(failed, { stageId: 'idea', stageName: 'Idea' })).toBe(false);
    expect(
      stageSampleFailed(retrospectiveTaskFixtures[0], {
        stageId: 'implement',
        stageName: 'Implement',
      }),
    ).toBe(false);
  });

  it('sorts by recency and filters by status and workflow', () => {
    const tasks = retrospectiveTaskFixtures;
    const recent = selectVisibleTasks(tasks);
    expect(recent.map((t) => t.id)).toEqual([
      'task-fresh-4',
      'task-active-3',
      'task-failed-2',
      'task-done-1',
    ]);
    const oldest = selectVisibleTasks(tasks, { sort: 'oldest' });
    expect(oldest[0].id).toBe('task-done-1');
    expect(selectVisibleTasks(tasks, { statusFilter: 'failed' }).map((t) => t.id)).toEqual([
      'task-failed-2',
    ]);
    expect(selectVisibleTasks(tasks, { statusFilter: 'completed' }).map((t) => t.id)).toEqual([
      'task-done-1',
    ]);
    expect(
      selectVisibleTasks(tasks, { workflowFilter: 'wf-experiment' }).map((t) => t.id),
    ).toEqual(['task-active-3']);
  });

  it('derives stats-strip counts', () => {
    expect(computeRetrospectiveStats(retrospectiveTaskFixtures)).toEqual({
      total: 4,
      completed: 1,
      failed: 1,
      active: 2,
    });
  });

  it('lists distinct workflow ids', () => {
    expect(listWorkflows(retrospectiveTaskFixtures)).toEqual(['wf-default', 'wf-experiment']);
  });
});
