import { describe, it, expect } from 'vitest';
import {
  normalizeReportPath,
  reportBadgeCount,
  reportOptionLabel,
  reportPathOf,
  reportTitleOf,
} from './reportPaths';

/***
 * MARK: reportPaths tests
 * @description Pins the report-identity contract shared by the navigator and
 *   the report reviewer: `./` canonicalisation, defensive field fallbacks,
 *   badge counting through the canonical key, and the flat select label.
 *   These are the invariants that keep a docs re-sync from splitting one
 *   report in two or crashing the picker on a malformed payload.
 */
describe('normalizeReportPath', () => {
  it('strips a single leading ./ and leaves other paths alone', () => {
    expect(normalizeReportPath('./docs/tasks/t-1/plan.md')).toBe('docs/tasks/t-1/plan.md');
    expect(normalizeReportPath('docs/tasks/t-1/plan.md')).toBe('docs/tasks/t-1/plan.md');
    // Only the first `./` is a prefix, not every occurrence.
    expect(normalizeReportPath('a/./b.md')).toBe('a/./b.md');
  });

  it('trims surrounding whitespace before canonicalising', () => {
    expect(normalizeReportPath('  ./plan.md  ')).toBe('plan.md');
  });

  it('collapses non-strings and blanks to the empty string', () => {
    expect(normalizeReportPath(null)).toBe('');
    expect(normalizeReportPath(undefined)).toBe('');
    expect(normalizeReportPath(42)).toBe('');
    expect(normalizeReportPath('   ')).toBe('');
  });
});

describe('reportPathOf', () => {
  it('prefers path and falls back to filename', () => {
    expect(reportPathOf({ path: './a.md', filename: 'a.md' })).toBe('./a.md');
    expect(reportPathOf({ filename: 'a.md' })).toBe('a.md');
  });

  it('returns empty for missing or unusable reports', () => {
    expect(reportPathOf(null)).toBe('');
    expect(reportPathOf(undefined)).toBe('');
    expect(reportPathOf({})).toBe('');
    expect(reportPathOf({ path: 7 })).toBe('');
  });
});

describe('reportTitleOf', () => {
  it('prefers stageName, then name, then filename, then path', () => {
    expect(reportTitleOf({ stageName: 'Plan', name: 'N', filename: 'f.md', path: 'p' })).toBe(
      'Plan',
    );
    expect(reportTitleOf({ name: 'N', filename: 'f.md' })).toBe('N');
    expect(reportTitleOf({ filename: 'f.md' })).toBe('f.md');
    expect(reportTitleOf({ path: './plan.md' })).toBe('./plan.md');
  });

  it('never returns an empty label', () => {
    expect(reportTitleOf(null)).toBe('Stage report');
    expect(reportTitleOf({})).toBe('Stage report');
  });
});

describe('reportBadgeCount', () => {
  it('counts unresolved comments through the canonical path', () => {
    const counts = new Map([['docs/tasks/t-1/plan.md', 3]]);
    // Report carries the `./` spelling, the count was recorded bare.
    expect(reportBadgeCount({ path: './docs/tasks/t-1/plan.md' }, counts)).toBe(3);
  });

  it('fails safe with a missing map, unknown path, or bad value', () => {
    expect(reportBadgeCount({ path: './a.md' }, undefined)).toBe(0);
    expect(reportBadgeCount({ path: './a.md' }, new Map([['b.md', 1]]))).toBe(0);
    expect(reportBadgeCount({ path: './a.md' }, new Map([['a.md', -2]]))).toBe(0);
    expect(reportBadgeCount({ path: './a.md' }, new Map([['a.md', 'x']]))).toBe(0);
    expect(reportBadgeCount({}, new Map([['', 4]]))).toBe(0);
  });
});

describe('reportOptionLabel', () => {
  it('appends AUTO and unresolved markers only when relevant', () => {
    expect(
      reportOptionLabel({ stageName: 'Plan', path: 'a.md', auto: true }, new Map([['a.md', 2]])),
    ).toBe('Plan • AUTO • 2 unresolved');
    expect(reportOptionLabel({ stageName: 'Plan', path: 'a.md' }, new Map([['a.md', 2]]))).toBe(
      'Plan • 2 unresolved',
    );
    expect(reportOptionLabel({ stageName: 'Plan', auto: true }, new Map())).toBe('Plan • AUTO');
    expect(reportOptionLabel({ stageName: 'Plan' })).toBe('Plan');
  });
});
