import { describe, it, expect } from 'vitest';
import {
  resolveGlassesCounts,
  resolveGlassesProgress,
  resolveGlassesProgressFraction,
  resolveGlassesSummary,
  resolveGlassesReviewTarget,
  resolveGlassesVisibleTasks,
} from './glassesHelpers.js';

/***
 * MARK: glasses helpers tests
 * @description Guards the pure display helpers behind the Meta Ray-Ban
 *   views: status counts, step progress, two-line summaries, the View
 *   button target, and the short tap list.
 ***/
describe('resolveGlassesCounts', () => {
  it('counts running, waiting, failed, and total', () => {
    const tasks = [
      { id: 't1', status: 'running_agent' },
      { id: 't2', status: 'waiting_human' },
      { id: 't3', status: 'failed' },
      { id: 't4', status: 'completed' },
    ];
    const engineState = { status: 'running', activeTaskId: 't1' };
    expect(resolveGlassesCounts(tasks, engineState)).toEqual({
      running: 1,
      waitingReview: 1,
      failed: 1,
      total: 4,
    });
  });

  it('never counts a stale running label on a non-owner as running', () => {
    const tasks = [{ id: 't1', status: 'running_agent' }];
    const engineState = { status: 'idle', activeTaskId: null };
    expect(resolveGlassesCounts(tasks, engineState).running).toBe(0);
  });

  it('reads a missing list as all zeros', () => {
    expect(resolveGlassesCounts(null, {})).toEqual({
      running: 0,
      waitingReview: 0,
      failed: 0,
      total: 0,
    });
  });
});

describe('resolveGlassesProgress', () => {
  const stages = [
    { id: 'a', name: 'Plan' },
    { id: 'b', name: 'Build' },
    { id: 'c', name: 'Test' },
  ];

  it('reads Step N of M from the pipeline position', () => {
    expect(resolveGlassesProgress({ currentStageId: 'a' }, stages)).toBe('Step 1 of 3');
    expect(resolveGlassesProgress({ currentStageId: 'c' }, stages)).toBe('Step 3 of 3');
  });

  it('returns null when the position is unknown', () => {
    expect(resolveGlassesProgress({ currentStageId: 'zzz' }, stages)).toBeNull();
    expect(resolveGlassesProgress({}, stages)).toBeNull();
    expect(resolveGlassesProgress({ currentStageId: 'a' }, [])).toBeNull();
    expect(resolveGlassesProgress(null, stages)).toBeNull();
  });
});

describe('resolveGlassesProgressFraction', () => {
  const stages = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('reads the bar fill from the pipeline position', () => {
    expect(resolveGlassesProgressFraction({ currentStageId: 'a' }, stages)).toBe(0.25);
    expect(resolveGlassesProgressFraction({ currentStageId: 'd' }, stages)).toBe(1);
  });

  it('returns null when the position is unknown', () => {
    expect(resolveGlassesProgressFraction({ currentStageId: 'zzz' }, stages)).toBeNull();
    expect(resolveGlassesProgressFraction(null, stages)).toBeNull();
  });
});

describe('resolveGlassesSummary', () => {
  it('leads with the latest commit message, then file stats', () => {
    expect(
      resolveGlassesSummary({
        commits: [{ message: 'Fix the auth race' }],
        files: [{ path: 'a.js' }, { path: 'b.js' }],
        comments: [],
      }),
    ).toEqual(['Fix the auth race', '2 files changed']);
  });

  it('keeps at most two lines', () => {
    expect(
      resolveGlassesSummary({
        commits: [{ message: 'One' }],
        files: [{ path: 'a.js' }],
        comments: [{ id: 'c1', resolved: false }],
      }),
    ).toEqual(['One', '1 file changed']);
  });

  it('surfaces unresolved comments when there is no commit', () => {
    expect(
      resolveGlassesSummary({
        commits: [],
        files: [],
        comments: [
          { id: 'c1', resolved: false },
          { id: 'c2', resolved: true },
        ],
      }),
    ).toEqual(['1 unresolved comment']);
  });

  it('shortens a long message instead of wrapping clutter', () => {
    const long = `Fix: ${'very '.repeat(30)}long race condition`;
    const [line] = resolveGlassesSummary({ commits: [{ message: long }] });
    expect(line.length).toBeLessThanOrEqual(80);
    expect(line.endsWith('…')).toBe(true);
  });

  it('reads a missing payload as one honest line', () => {
    expect(resolveGlassesSummary(null)).toEqual(['No changes to review yet']);
    expect(resolveGlassesSummary({})).toEqual(['No changes to review yet']);
  });
});

describe('resolveGlassesReviewTarget', () => {
  it('prefers the first task waiting for review', () => {
    const waiting = { id: 't2', status: 'waiting_human' };
    const tasks = [{ id: 't1', status: 'running_agent' }, waiting];
    const engineState = { status: 'running', activeTaskId: 't1' };
    expect(resolveGlassesReviewTarget(tasks, engineState)).toBe(waiting);
  });

  it('falls back to the running task for observers', () => {
    const running = { id: 't1', status: 'running_agent' };
    const engineState = { status: 'running', activeTaskId: 't1' };
    expect(resolveGlassesReviewTarget([running], engineState)).toBe(running);
  });

  it('returns null when nothing is actionable', () => {
    expect(resolveGlassesReviewTarget([{ status: 'completed' }], { status: 'idle' })).toBeNull();
    expect(resolveGlassesReviewTarget(null, {})).toBeNull();
  });
});

describe('resolveGlassesVisibleTasks', () => {
  it('shows only waiting and running tasks, waiting first, capped', () => {
    const tasks = [
      { id: 'run', status: 'running_agent' },
      { id: 'done', status: 'completed' },
      { id: 'wait1', status: 'waiting_human' },
      { id: 'wait2', status: 'waiting_human' },
      { id: 'fail', status: 'failed' },
    ];
    const engineState = { status: 'running', activeTaskId: 'run' };
    const visible = resolveGlassesVisibleTasks(tasks, engineState, 3);
    expect(visible.map((task) => task.id)).toEqual(['wait1', 'wait2', 'run']);
  });

  it('reads a missing list as empty', () => {
    expect(resolveGlassesVisibleTasks(null, {})).toEqual([]);
  });
});
