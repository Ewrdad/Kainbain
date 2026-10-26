// Domain: Work, Flow and Watching the Work — existing callers keep the same functions.
import { describe, it, expect } from 'vitest';
import * as legacy from './taskStore.js';
import * as work from './work/index.js';
import * as flow from './flow/index.js';
import * as watch from './watch/index.js';
import * as house from './house/index.js';

describe('Domain compatibility exports', () => {
  it('preserves the complete pre-extraction public surface', () => {
    expect(Object.keys(legacy).sort()).toEqual([
      'AUTO_REPORT_MARKER', 'ExecutionQueue', 'TASK_BRANCH_PREFIX', 'TaskStore',
      '_appendProcessLog', '_atomicWriteFileSync', '_sanitizeTaskTitle',
      'generateStageReportContent', 'isAutoReportContent',
      'isTerminalTaskStatus',
      'isTransientInfrastructureError', 'isUnrecoverableError',
      'renderLogEntriesText',
      'resolveStageLabel', 'resolveStageTimeout', 'taskBranchName', 'taskStore',
      'stageElapsedSeconds', 'toTaskSummary',
    ].sort());
    expect(legacy.TaskStore.length).toBe(0);
    expect(legacy.ExecutionQueue.length).toBe(0);
    expect(legacy.taskStore).toBeInstanceOf(legacy.TaskStore);
    expect([
      legacy._sanitizeTaskTitle.length, legacy.toTaskSummary.length,
      legacy.resolveStageLabel.length, legacy.resolveStageTimeout.length,
      legacy.isAutoReportContent.length, legacy.generateStageReportContent.length,
    ]).toEqual([1, 1, 1, 2, 1, 0]);
  });

  it.each([
    ['queue ordering', legacy.ExecutionQueue, flow.ExecutionQueue],
    ['task branches', legacy.taskBranchName, work.taskBranchName],
    ['failure policy', legacy.isUnrecoverableError, work.isUnrecoverableError],
    ['transient failures', legacy.isTransientInfrastructureError, work.isTransientInfrastructureError],
    ['progress logs', legacy._appendProcessLog, watch._appendProcessLog],
    ['safe file writing', legacy._atomicWriteFileSync, house._atomicWriteFileSync],
    ['task naming', legacy._sanitizeTaskTitle, work._sanitizeTaskTitle],
    ['board summaries', legacy.toTaskSummary, work.toTaskSummary],
    ['stage labels', legacy.resolveStageLabel, flow.resolveStageLabel],
    ['stage timeouts', legacy.resolveStageTimeout, flow.resolveStageTimeout],
    ['stage timing', legacy.stageElapsedSeconds, flow.stageElapsedSeconds],
    ['terminal statuses', legacy.isTerminalTaskStatus, flow.isTerminalTaskStatus],
    ['report recognition', legacy.isAutoReportContent, watch.isAutoReportContent],
    ['report content', legacy.generateStageReportContent, watch.generateStageReportContent],
  ])('keeps %s as one implementation at both import paths', (_name, oldEntry, domainEntry) => {
    expect(oldEntry).toBe(domainEntry);
    expect(typeof domainEntry).toBe('function');
  });

  it('keeps the auto-report marker byte-identical', () => {
    expect(legacy.AUTO_REPORT_MARKER).toBe(watch.AUTO_REPORT_MARKER);
    expect(watch.AUTO_REPORT_MARKER).toBe('<!-- KAINBAIN AUTO-GENERATED REPORT -->');
  });

  it('houses domain-specific operations in domain homes rather than legacy exports', () => {
    expect(typeof work.resolveTaskBranch).toBe('function');
    expect(typeof flow.resolveMaxAutoIterations).toBe('function');
    expect(typeof flow.resolveMaxTransientRetries).toBe('function');
    expect(typeof flow.beginAutoIteration).toBe('function');
    expect(typeof flow.resetAutoIteration).toBe('function');
    expect(typeof flow.handleStageFailure).toBe('function');
    expect(typeof flow.handleTransientFailure).toBe('function');
    expect(typeof watch.computeObservabilityMetrics).toBe('function');

    expect(legacy.resolveTaskBranch).toBeUndefined();
    expect(legacy.resolveMaxAutoIterations).toBeUndefined();
    expect(legacy.resolveMaxTransientRetries).toBeUndefined();
    expect(legacy.beginAutoIteration).toBeUndefined();
    expect(legacy.resetAutoIteration).toBeUndefined();
    expect(legacy.handleStageFailure).toBeUndefined();
    expect(legacy.handleTransientFailure).toBeUndefined();
    expect(legacy.computeObservabilityMetrics).toBeUndefined();
  });
});
