// Domain: Work / Flow / Watching the Work — lock existing public behaviour before extraction.
import { describe, it, expect } from 'vitest';
import {
  _sanitizeTaskTitle, toTaskSummary, resolveStageLabel, resolveStageTimeout,
  AUTO_REPORT_MARKER, isAutoReportContent, generateStageReportContent,
  ExecutionQueue, taskBranchName, _appendProcessLog, renderLogEntriesText,
} from './taskStore.js';
import { parseModelKey, normalizeModelRef } from './models.js';

describe('Task boundary characterisation', () => {
  it('cleans nested title decoration and preserves task branch names', () => {
    expect(_sanitizeTaskTitle(' "## A\nnew task" ')).toBe('A new task');
    expect(_sanitizeTaskTitle('###')).toBe('Untitled task');
    expect(taskBranchName('abc')).toBe('kb/abc');
    expect(taskBranchName(null)).toBe('kb/');
  });

  it('removes detail weight without changing report metadata or the source', () => {
    const task = { id: 'a', status: 'in_stage', custom: 42, prompt: 'large',
      processLogs: 'large', logEntries: [], history: [], timeline: [], stats: {},
      reports: [{ path: 'report.md', stage: 'review', content: 'large' }, null, 'legacy'] };
    const before = structuredClone(task);
    expect(toTaskSummary(task)).toEqual({ id: 'a', status: 'in_stage', custom: 42,
      reports: [{ path: 'report.md', stage: 'review' }, null, 'legacy'], reportCount: 3 });
    expect(task).toEqual(before);
    expect(toTaskSummary(null)).toEqual({});
    expect(toTaskSummary({ id: 'a' })).toEqual({ id: 'a', reports: undefined, reportCount: 0 });
  });

  it('preserves stage-name matching order, including ambiguous references', () => {
    const stages = [{ id: 'a', name: 'b' }, { id: 'b', name: 'Build' }];
    // Existing behaviour is first matching stage, not a separate id-first pass.
    expect(resolveStageLabel('b', stages)).toBe('b');
    expect(resolveStageLabel(' BUILD ', stages)).toBe('Build');
    expect(resolveStageLabel(null, stages)).toBe('unknown');
    expect(resolveStageLabel('missing', null)).toBe('missing');
  });

  it('preserves timeout overrides and type-specific defaults', () => {
    const cfg = { agentTimeoutMs: 11, ciTimeoutMs: 22, mergeTimeoutMs: 44 };
    for (const [type, expected] of [['agent', 11], ['review', 11], ['ci', 22], ['script', 22], ['deploy', 22], ['merge', 44], ['human', 300000]]) {
      expect(resolveStageTimeout({ type }, undefined, cfg)).toBe(expected);
      expect(resolveStageTimeout({ type, timeout: '7.5' }, undefined, cfg)).toBe(7.5);
      for (const timeout of ['', null, 0, -1, 'bad', Infinity]) {
        expect(resolveStageTimeout({ type, timeout }, undefined, cfg)).toBe(expected);
      }
    }
    expect(resolveStageTimeout({ type: 'ci' }, 'REVIEW', cfg)).toBe(11);
  });

  it('locks the complete default report text and marker recognition', () => {
    expect(generateStageReportContent()).toBe(`${AUTO_REPORT_MARKER}\n# Stage Report: Stage\n\n**Task:** Task\n**Stage Type:** \`agent\`\n**Model:** \`default\`\n**Duration:** 0.0s\n**Status:** PASSED\n\n### Summary of Changes\nStage completed successfully.\n\n### Execution Output\n\`\`\`\n(no output captured)\n\`\`\`\n\n### Modified Files\n- (No files modified / inspection only)\n\n### Verification Status\n- Stage execution completed successfully.\n- Output and artifacts verified against stage criteria.`);
    expect(isAutoReportContent(`prefix${AUTO_REPORT_MARKER}suffix`)).toBe(true);
    expect(isAutoReportContent({ content: AUTO_REPORT_MARKER })).toBe(false);
  });

  it('runs high-priority jobs next without interrupting active work and recovers after rejection', async () => {
    const queue = new ExecutionQueue();
    const order = [];
    let finish;
    const active = queue.enqueue(() => new Promise(resolve => { finish = resolve; order.push('active'); }));
    const normal = queue.enqueue(() => { order.push('normal'); return 3; });
    const high = queue.enqueue(() => { order.push('high'); throw new Error('expected'); }, { priority: 'high' });
    const rejected = expect(high).rejects.toThrow('expected');
    expect(queue.size).toBe(2);
    expect(order).toEqual(['active']);
    finish(1);
    expect(await active).toBe(1);
    await rejected;
    expect(await normal).toBe(3);
    expect(order).toEqual(['active', 'high', 'normal']);
    expect(queue.isRunning).toBe(false);
  });

  it('mirrors process text into the proper structured feeds', () => {
    const task = {};
    _appendProcessLog(task, '[TOOL] read(a)');
    _appendProcessLog(task, '[THINKING] idea');
    _appendProcessLog(task, '[SYSTEM] ready');
    // Entries are the single storage path — no rendered text is kept on the
    // task; text views are derived via the shared renderer.
    expect(task).not.toHaveProperty('processLogs');
    expect(task.logEntries.map(({ kind, feed, text }) => ({ kind, feed, text }))).toEqual([
      { kind: 'tool', feed: 'tools', text: '[TOOL] read(a)' },
      { kind: 'thinking', feed: 'thinking', text: '[THINKING] idea' },
      { kind: 'system', feed: 'main', text: '[SYSTEM] ready' },
    ]);
    expect(new Set(task.logEntries.map(e => e.id)).size).toBe(3);
    expect(renderLogEntriesText(task.logEntries)).toBe('[TOOL] read(a)\n[SYSTEM] ready');
  });

  it('keeps canonical, legacy and bare model references compatible', () => {
    expect(parseModelKey('pi::cloud::model:cloud')).toEqual({ form: 'harness', harness: 'pi', provider: 'cloud', id: 'model:cloud' });
    expect(normalizeModelRef('cloud::model:cloud', 'pi')).toBe('pi::cloud::model:cloud');
    expect(normalizeModelRef('default', 'pi')).toBe('default');
    expect(parseModelKey('::broken')).toBeNull();
  });
});
