import { expect, test } from 'vitest';

import {
  RUNNER_BOX_MAX_COUNT,
  buildRunnerBoxAriaLabel,
  coerceBoxText,
  formatRunnerStatusDisplay,
  getRunnerBoxStyle,
  resolveRunnerStatusWord,
  selectRenderableRunnerEntries,
  shouldShowRunnerBoxes,
  truncateRunnerText,
} from './runnerBoxUi';

/***
 * MARK: runnerBoxUi tests
 * @description Pure status→colour map, status-word resolution, aria-label
 * builder, tooltip cap, and the <5 visibility gate — no DOM needed.
 ***/

test('status colours reuse the bar badge palette and fail closed to grey', () => {
  expect(getRunnerBoxStyle('running')).toEqual({
    dotClass: 'bg-[#7bdb85]',
    statusClass: 'text-primary-fixed',
  });
  expect(getRunnerBoxStyle('paused').dotClass).toBe('bg-[#ffe0b2]');
  expect(getRunnerBoxStyle('failed')).toEqual({
    dotClass: 'bg-error',
    statusClass: 'text-error',
  });
  expect(getRunnerBoxStyle('interrupted').dotClass).toBe('bg-warning');
  expect(getRunnerBoxStyle('checkpoint').dotClass).toBe('bg-[#9acbff]');
  expect(getRunnerBoxStyle('waiting_human').dotClass).toBe('bg-[#9acbff]');
  expect(getRunnerBoxStyle('queued').dotClass).toBe('bg-text-muted');
  expect(getRunnerBoxStyle('idle').dotClass).toBe('bg-text-muted');
  // Unknown words fail closed to the grey idle pair — never a missing dot.
  expect(getRunnerBoxStyle('nope')).toEqual({
    dotClass: 'bg-text-muted',
    statusClass: 'text-text-muted',
  });
  expect(getRunnerBoxStyle(undefined)).toEqual(getRunnerBoxStyle('idle'));
});

test('status word is task-state first: settled task states beat engine state', () => {
  expect(resolveRunnerStatusWord(null, {})).toBe('idle');
  expect(resolveRunnerStatusWord(undefined, { status: 'running' })).toBe('idle');
  // A failed task stays failed even while the engine runs something else.
  expect(
    resolveRunnerStatusWord({ id: 't1', status: 'failed' }, { status: 'running', activeTaskId: 't9' }),
  ).toBe('failed');
  expect(
    resolveRunnerStatusWord({ id: 't1', status: 'interrupted' }, { status: 'idle' }),
  ).toBe('interrupted');
  expect(resolveRunnerStatusWord({ id: 't1', wasInterrupted: true }, { status: 'idle' })).toBe(
    'interrupted',
  );
  // Completed work means no live work: idle, not running.
  expect(resolveRunnerStatusWord({ id: 't1', status: 'completed' }, { status: 'idle' })).toBe(
    'idle',
  );
  expect(resolveRunnerStatusWord({ id: 't1', status: 'done' }, { status: 'idle' })).toBe('idle');
  // Global pause colours every live box amber.
  expect(
    resolveRunnerStatusWord({ id: 't1', status: 'in_stage' }, { status: 'paused' }),
  ).toBe('paused');
  // The genuine owner under a running engine is running.
  expect(
    resolveRunnerStatusWord(
      { id: 't1', status: 'running_agent' },
      { status: 'running', activeTaskId: 't1' },
      false,
    ),
  ).toBe('running');
  // A stale running_* label without ownership is queued, never running.
  expect(
    resolveRunnerStatusWord(
      { id: 't1', status: 'running_agent' },
      { status: 'running', activeTaskId: 't9' },
      false,
    ),
  ).toBe('queued');
  // Checkpoint words attach only to the engine owner.
  expect(
    resolveRunnerStatusWord({ id: 't1', status: 'in_stage' }, { status: 'checkpoint', activeTaskId: 't1' }),
  ).toBe('checkpoint');
  expect(
    resolveRunnerStatusWord(
      { id: 't1', status: 'in_stage' },
      { status: 'waiting_human', activeTaskId: 't1' },
    ),
  ).toBe('waiting_human');
  expect(
    resolveRunnerStatusWord({ id: 't1', status: 'in_stage' }, { status: 'checkpoint', activeTaskId: 't9' }),
  ).toBe('queued');
  // Open, owned by nobody, engine calm: queued.
  expect(resolveRunnerStatusWord({ id: 't1', status: 'in_stage' }, { status: 'idle' })).toBe(
    'queued',
  );
});

test('status display text is upper-cased with underscores as spaces', () => {
  expect(formatRunnerStatusDisplay('waiting_human')).toBe('WAITING HUMAN');
  expect(formatRunnerStatusDisplay('running')).toBe('RUNNING');
  expect(formatRunnerStatusDisplay('')).toBe('IDLE');
  expect(formatRunnerStatusDisplay(undefined)).toBe('IDLE');
});

test('aria label names runner and status, then task and stage when known', () => {
  expect(
    buildRunnerBoxAriaLabel({
      runnerLabel: 'bravo',
      statusWord: 'running',
      taskTitleFirstLine: 'Ship it',
      stageName: 'Plan',
    }),
  ).toBe('Runner bravo, running, task Ship it, stage Plan');
  expect(buildRunnerBoxAriaLabel({ runnerLabel: 'bravo', statusWord: 'idle' })).toBe(
    'Runner bravo, idle',
  );
  expect(buildRunnerBoxAriaLabel({})).toBe('Runner Runner, idle');
});

test('tooltip cap keeps short text whole and marks capped text', () => {
  expect(truncateRunnerText('Ship it', 10)).toBe('Ship it');
  expect(truncateRunnerText('abc', 2)).toBe('a…');
  expect(truncateRunnerText(42)).toBe('');
  expect(truncateRunnerText(undefined)).toBe('');
  const capped = truncateRunnerText('x'.repeat(500));
  expect(capped.length).toBeLessThanOrEqual(240);
  expect(capped.endsWith('…')).toBe(true);
});

test('visibility gate: 1-4 entries show boxes unless killed', () => {
  expect(RUNNER_BOX_MAX_COUNT).toBe(4);
  const two = [{}, {}];
  expect(shouldShowRunnerBoxes(two, {})).toBe(true);
  // Absent preference means enabled: stored profiles need no migration.
  expect(shouldShowRunnerBoxes(two, undefined)).toBe(true);
  expect(shouldShowRunnerBoxes([{}], {})).toBe(true);
  expect(shouldShowRunnerBoxes([{}, {}, {}, {}], {})).toBe(true);
  expect(shouldShowRunnerBoxes([], {})).toBe(false);
  expect(shouldShowRunnerBoxes([{}, {}, {}, {}, {}], {})).toBe(false);
  expect(shouldShowRunnerBoxes('nope', {})).toBe(false);
  // Kill switch: explicit false forces the legacy view.
  expect(shouldShowRunnerBoxes(two, { showRunnerBoxes: false })).toBe(false);
});

test('junk array items are dropped and never counted toward the gate', () => {
  expect(selectRenderableRunnerEntries([{ runnerId: 'b' }, null, 'junk', 42])).toEqual([
    { runnerId: 'b' },
  ]);
  expect(selectRenderableRunnerEntries(null)).toEqual([]);
  expect(selectRenderableRunnerEntries('nope')).toEqual([]);
  // The input array is never mutated.
  const input = [{ runnerId: 'b' }, null];
  selectRenderableRunnerEntries(input);
  expect(input).toHaveLength(2);
  // Junk alone keeps the legacy view; junk beside real entries is ignored.
  expect(shouldShowRunnerBoxes([null], {})).toBe(false);
  expect(shouldShowRunnerBoxes([null, 'junk'], {})).toBe(false);
  expect(shouldShowRunnerBoxes([{ runnerId: 'b' }, null], {})).toBe(true);
});

test('box text trims strings, coerces primitives, and fails closed', () => {
  expect(coerceBoxText('  Bravo  ', 'unknown')).toBe('Bravo');
  expect(coerceBoxText('   ', 'unknown')).toBe('unknown');
  expect(coerceBoxText(null, 'unknown')).toBe('unknown');
  expect(coerceBoxText(undefined, 'unknown')).toBe('unknown');
  // Objects and arrays never leak "[object Object]" into the box.
  expect(coerceBoxText({ id: 'b' }, 'unknown')).toBe('unknown');
  expect(coerceBoxText(['b'], 'unknown')).toBe('unknown');
  // Other primitives render as their string form, not the fallback.
  expect(coerceBoxText(7, 'unknown')).toBe('7');
  expect(coerceBoxText(false, 'unknown')).toBe('false');
  // The label falls back to the (already coerced) id, never an empty name.
  expect(coerceBoxText('   ', coerceBoxText('  b1 ', 'unknown'))).toBe('b1');
});

test('aria label trims whitespace and fails closed on blank values', () => {
  expect(
    buildRunnerBoxAriaLabel({ runnerLabel: '  bravo  ', statusWord: '  running  ' }),
  ).toBe('Runner bravo, running');
  expect(buildRunnerBoxAriaLabel({ runnerLabel: '   ', statusWord: '   ' })).toBe(
    'Runner Runner, idle',
  );
  expect(buildRunnerBoxAriaLabel(null)).toBe('Runner Runner, idle');
});
