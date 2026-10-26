// Run in the lighter node environment: this suite is pure logic with
// no DOM needs (skips jsdom setup, keeps the CI suite fast).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { computeStageAnalytics, formatDuration } from './stageAnalytics';
import { collectStageDurations, parseDuration } from './stageDurations';
import { parseReportTimestamp, reportCreatedAt } from '../../../../shared/reportTimestamp.js';
import {
  duplicateHistory,
  duplicateInProgressTask,
  duplicateStoredTimeline,
  duplicateTimelineStages,
} from '../tasks/__fixtures__/duplicateInProgressTimeline.js';

const durationStages = [{ id: '1', name: 'Plan' }, { id: '2', name: 'Review Plan' }];
const at = (seconds) => new Date(Date.UTC(2026, 0, 1) + seconds * 1000).toISOString();
const average = (task, stage = '1') => computeStageAnalytics(durationStages, [task]).byStage[stage].avgDuration;

describe('real stage duration data', () => {
  it.each([[12, 12], ['12.5s', 12.5], ['3m', 180], ['2m 5s', 125], ['**Duration:** 45s', 45], ['2.5', 2.5], ['0m', 0], ['', null], ['-5s', null], ['3minutes junk', null], [Infinity, null], [null, null]])('parses %s as seconds', (value, expected) => {
    expect(parseDuration(value)).toBe(expected);
  });

  it('uses markdown from production reports, not substring stage matches', () => {
    expect(average({ reports: [{ stageName: 'Plan', content: '# Report\n**Duration:** 12.5s\n**Status:** PASSED' }, {stageName: 'Review Plan', content: '**Duration:** 3m'}] })).toBe('12.5s');
  });

  it('attributes transition durations to the exited stage and prefers structured reports', () => {
    expect(average({ reports: [{stageName: 'Plan', duration: 20, content: '**Duration:** 90s', createdAt: at(20)}], timeline: [{stage: 'Review Plan', durationStage: 'Plan', durationStageId: '1', durationSeconds: 30, duration: '30s', timestamp: at(30)}] })).toBe('20.0s');
  });

  it('uses timeline-only mixed units and leaves no-data stages empty', () => {
    const task = {timeline: [{stage: 'Plan', duration: '3m'}, {stage: 'Plan', duration: '2m 5s'}]};
    expect(average(task)).toBe('2m 33s');
    expect(average(task, '2')).toBe('--');
  });

  it('uses history entry/exit deltas, not dispatch or report timestamps, across revisits', () => {
    const task = {history: [
      {action: "Created and placed in stage 'Plan'", timestamp: at(0)},
      {action: 'Dispatched stage Plan (agent)', timestamp: at(5)},
      {action: "Advanced to stage 'Review Plan'", timestamp: at(20)},
      {action: "Failed back to stage 'Plan'", timestamp: at(30)},
      {action: 'Completed', timestamp: at(70)},
    ], reports: [{stageName: 'Plan', duration: 10, createdAt: at(15)}]};
    expect(average(task)).toBe('25.0s'); // report first visit, history second
    expect(average(task, '2')).toBe('10.0s');
  });

  it('recovers compact filename times instead of a legacy task-level createdAt', () => {
    const task = { history: [
      { action: "Created in stage 'Plan'", timestamp: at(0) },
      { action: "Advanced to stage 'Review Plan'", timestamp: at(30) },
      { action: "Failed back to stage 'Plan'", timestamp: at(100) },
      { action: 'Completed', timestamp: at(200) },
    ], reports: [{ stageName: 'Plan', filename: 'plan-20260101-000010.md',
      timestamp: '20260101-000010', createdAt: at(200), content: '**Duration:** 10s' }] };
    expect(collectStageDurations(task, durationStages[0])).toEqual([10, 100]);
    expect(average(task)).toBe('55.0s');
  });

  it('counts legacy failed command and late failure reports once before retry', () => {
    const task = { history: [
      { action: "Created in stage 'Plan'", timestamp: at(0) },
      { action: "Stage failed in 'Plan': command failed", timestamp: at(60) },
      { action: "Failed back to stage 'Plan'", timestamp: at(61) },
      { action: 'Completed', timestamp: at(71) },
    ], reports: [
      { stageName: 'Plan', status: 'FAILED', duration: 60, createdAt: at(59.99) },
      { stageName: 'Plan', content: '**Status:** FAILED\n**Duration:** 60.1s', createdAt: at(60.1) },
      { stageName: 'Plan', duration: 10, createdAt: at(70.99) },
    ] };
    expect(collectStageDurations(task, durationStages[0])).toEqual([60, 10]);
    expect(average(task)).toBe('35.0s');
  });

  it('uses stable visit identity even if failure persistence happens after retry entry', () => {
    const task = { history: [
      { action: "Created in stage 'Plan'", timestamp: at(0) },
      { action: "Stage failed in 'Plan': error", timestamp: at(60) },
      { action: "Failed back to stage 'Plan'", timestamp: at(61) },
      { action: 'Completed', timestamp: at(71) },
    ], reports: [
      { stageName: 'Plan', duration: 60, durationStartedAt: at(0), createdAt: at(59.99) },
      { stageName: 'Plan', duration: 60.1, durationStartedAt: at(0), createdAt: at(62) },
      { stageName: 'Plan', duration: 10, durationStartedAt: at(61), createdAt: at(71.1) },
    ] };
    expect(collectStageDurations(task, durationStages[0])).toEqual([60, 10]);
  });

  it('does not replace known history visits with genuinely untimed legacy reports', () => {
    expect(collectStageDurations({ history: [
      { action: "Created in stage 'Plan'", timestamp: at(0) },
      { action: 'Completed', timestamp: at(30) },
    ], reports: [{ stageName: 'Plan', content: '**Duration:** 10s' }] }, durationStages[0])).toEqual([30]);
  });

  it('parses supported filename clocks, preserves milliseconds and rejects invalid dates', () => {
    expect(parseReportTimestamp('plan-20260101-000010.md')).toBe(new Date(2026, 0, 1, 0, 0, 10).toISOString());
    expect(parseReportTimestamp('plan-20260101T000010Z.md')).toBe(at(10));
    expect(reportCreatedAt({ filename: 'plan-20260101T000010Z.md', createdAt: at(10.25) })).toBe(at(10.25));
    expect(reportCreatedAt({ filename: 'plan-20260101T000010Z.md', createdAt: at(200) })).toBe(at(10));
    for (const value of ['plan-20260230-000010.md', 'plan-20260101T250010Z.md', 'IMPLEMENTATION_PLAN.md', '', null])
      expect(parseReportTimestamp(value)).toBeNull();
    expect(reportCreatedAt({ filename: 'unknown.md' })).toBeNull();
  });

  it('ignores old zero placeholders and recovers human waiting time', () => {
    expect(average({history: [{action: 'Created in stage 1', timestamp: at(0)}, {action: 'Advanced to stage 2', timestamp: at(180)}], timeline: [{stage: 'Review Plan', duration: '0m', timestamp: at(180)}], reports: [{stageSlug: 'plan', content: '**Duration:** 0.0s', createdAt: at(179)}]})).toBe('3m 0s');
  });

  it('rejects invalid, negative, implausibly long and still-open history intervals', () => {
    for (const end of ['invalid', at(-1), at(400 * 86400), null]) {
      expect(average({history: [{action: 'Created in stage 1', timestamp: at(0)}, ...(end ? [{action: 'Completed', timestamp: end}] : [])]})).toBe('--');
    }
  });

  it('matches a retained stage name after positional ids change', () => {
    expect(average({reports: [{stageId: '2', stageName: 'Plan', duration: 7}]})).toBe('7.0s');
    expect(average({reports: [{stageId: '2', stageName: 'Plan', duration: 7}]}, '2')).toBe('--');
  });

  it('counts the screenshot Failed→Moved pair once against the failed stage', () => {
    const task = {
      timeline: duplicateStoredTimeline,
      history: duplicateHistory,
    };
    const deepReview = duplicateTimelineStages[1];
    expect(collectStageDurations(task, deepReview)).toEqual([298.623]);
  });

  it('attributes the screenshot arrival rows to their source stages, never the destination', () => {
    const task = {
      timeline: duplicateStoredTimeline,
      history: duplicateHistory,
    };
    expect(collectStageDurations(task, duplicateTimelineStages[0])).toEqual([22.641]);
    expect(collectStageDurations(task, duplicateTimelineStages[2])).toEqual([]);
  });

  it('keeps the screenshot stage averages stable for the inspector badges', () => {
    const analytics = computeStageAnalytics(duplicateTimelineStages, [duplicateInProgressTask]);
    expect(analytics.byStage['qr'].avgDuration).toBe('22.6s');
    expect(analytics.byStage['dr'].avgDuration).toBe('4m 59s');
    expect(analytics.byStage['ip'].avgDuration).toBe('--');
  });
});

describe('stageAnalytics', () => {
  it('formatDuration formats numeric seconds correctly', () => {
    expect(formatDuration(0)).toBe('--');
    expect(formatDuration(null)).toBe('--');
    expect(formatDuration(1.4)).toBe('1.4s');
    expect(formatDuration(45.2)).toBe('45.2s');
    expect(formatDuration(125)).toBe('2m 5s');
  });

  it('computeStageAnalytics calculates throughput, duration, and pass rates', () => {
    const stages = [
      { id: '1', name: 'Idea', type: 'agent' },
      { id: '2', name: 'Review', type: 'human' },
    ];

    const tasks = [
      {
        id: 't-1',
        currentStageId: '1',
        status: 'in_stage',
        history: [
          { action: 'Created in stage 1' },
          { action: 'Advanced to stage 2' },
        ],
        reports: [{ stageName: 'Idea', duration: '2.5', status: 'PASSED' }],
      },
      {
        id: 't-2',
        currentStageId: '2',
        status: 'in_stage',
        history: [
          { action: 'Created in stage 1' },
          { action: 'Rejected in stage 2' },
        ],
        reports: [{ stageName: 'Review', duration: '1.5', status: 'FAILED' }],
      },
    ];

    const analytics = computeStageAnalytics(stages, tasks);

    expect(analytics.byStage['1'].throughput).toBe(2);
    expect(analytics.byStage['1'].passedCount).toBeGreaterThan(0);
    expect(analytics.byStage['1'].avgDuration).toBe('2.5s');

    expect(analytics.byStage['2'].throughput).toBe(2);
    expect(analytics.byStage['2'].failedCount).toBe(2); // 1 report + 1 history entry

    expect(analytics.overall.totalTasks).toBe(2);
    expect(analytics.overall.activeTasks).toBe(2);
    expect(analytics.overall.completedTasks).toBe(0);
  });

  it('activeTasksCount excludes completed and done tasks', () => {
    const stages = [{ id: '1', name: 'Idea', type: 'agent' }];
    const tasks = [
      { id: 't-1', currentStageId: '1', status: 'completed' },
      { id: 't-2', currentStageId: '1', status: 'done' },
      { id: 't-3', currentStageId: '1', status: 'in_stage' },
      { id: 't-4', currentStageId: '1', status: 'waiting_human' },
      { id: 't-5', currentStageId: '2', status: 'in_stage' }, // different stage
    ];

    const analytics = computeStageAnalytics(stages, tasks);

    expect(analytics.byStage['1'].activeTasksCount).toBe(2);
    expect(analytics.overall.totalTasks).toBe(5);
    expect(analytics.overall.activeTasks).toBe(3);
    expect(analytics.overall.completedTasks).toBe(2);
  });

  it('completed tasks still feed history metrics but not activeTasksCount', () => {
    const stages = [{ id: '1', name: 'Idea', type: 'agent' }];
    const tasks = [
      {
        id: 't-1',
        currentStageId: '1',
        status: 'completed',
        history: [{ action: 'Created in stage 1' }],
        reports: [{ stageName: 'Idea', duration: '1.0', status: 'PASSED' }],
      },
    ];

    const analytics = computeStageAnalytics(stages, tasks);

    // History metrics intentionally include completed tasks
    expect(analytics.byStage['1'].throughput).toBe(1);
    expect(analytics.byStage['1'].passedCount).toBe(1);
    expect(analytics.byStage['1'].avgDuration).toBe('1.0s');

    // But the collapsed rail badge only counts active work
    expect(analytics.byStage['1'].activeTasksCount).toBe(0);
  });

  it('attributes pass/fail counts for the new quoted stage-name history format', () => {
    const stages = [
      { id: '1', name: 'Technical Elab', type: 'agent' },
      { id: '2', name: 'Deploy', type: 'deploy' },
    ];

    const tasks = [
      {
        id: 't-new-1',
        currentStageId: '1',
        status: 'in_stage',
        history: [
          { action: "Created and placed in stage 'Technical Elab'" },
          { action: "Advanced to stage 'Deploy'" },
        ],
        reports: [
          { stageName: 'Technical Elab', duration: '2.0', status: 'PASSED' },
        ],
      },
      {
        id: 't-new-2',
        currentStageId: '2',
        status: 'failed',
        history: [
          { action: "Created and placed in stage 'Deploy'" },
          { action: "Stage failed in 'Deploy': build broken" },
        ],
      },
    ];

    const analytics = computeStageAnalytics(stages, tasks);

    // Advance/failure actions attribute to the right stage via name matching
    expect(analytics.byStage['1'].throughput).toBe(1);
    expect(analytics.byStage['1'].passedCount).toBeGreaterThan(0);
    expect(analytics.byStage['1'].failedCount).toBe(0);

    expect(analytics.byStage['2'].throughput).toBe(2);
    expect(analytics.byStage['2'].failedCount).toBe(1);
    expect(analytics.byStage['2'].passedCount).toBe(1);
  });
});
