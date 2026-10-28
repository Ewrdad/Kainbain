import { describe, it, expect } from 'vitest';
import {
  RELIABILITY_INTERVENTION_RULES,
  needsIntervention,
  sortReliabilityForMonitor,
} from './reliabilityStatus';

/***
 * MARK: reliabilityStatus tests
 * @description Verifies the monitor's intervention flag and worst-first
 *   ordering: the min-runs gate, the rate threshold boundary, honest
 *   no-data entries never being flagged, and the sort grouping.
 ***/

const entry = (overrides = {}) => ({
  harnessId: 'pi',
  runs: 10,
  successes: 10,
  infraFailures: 0,
  excludedRejected: 0,
  successRate: 100,
  lastRunAt: '2026-10-14T08:00:00Z',
  recent: { runs: 10, successes: 10, infraFailures: 0, excludedRejected: 0, successRate: 100 },
  ...overrides,
});

describe('RELIABILITY_INTERVENTION_RULES', () => {
  it('declares the reversible default rule in one place', () => {
    expect(RELIABILITY_INTERVENTION_RULES).toEqual({ minRuns: 5, threshold: 90 });
  });
});

describe('needsIntervention', () => {
  it('flags a harness below the all-time threshold once it has enough counted runs', () => {
    expect(
      needsIntervention(entry({ runs: 5, successes: 4, infraFailures: 1, successRate: 80 })),
    ).toBe(true);
  });

  it('treats the threshold as a boundary: 89.9 is flagged, 90.0 is not', () => {
    expect(needsIntervention(entry({ runs: 10, successRate: 89.9 }))).toBe(true);
    expect(needsIntervention(entry({ runs: 10, successRate: 90 }))).toBe(false);
  });

  it('does not flag a badly-rated harness with too few counted runs', () => {
    expect(
      needsIntervention(entry({ runs: 4, successes: 0, infraFailures: 4, successRate: 0 })),
    ).toBe(false);
    expect(needsIntervention(undefined)).toBe(false);
  });

  it('flags a newly-degraded harness via the recent window even when all-time is healthy', () => {
    const degraded = entry({
      runs: 50,
      successRate: 96,
      recent: { runs: 10, successes: 8, infraFailures: 2, successRate: 80 },
    });
    expect(needsIntervention(degraded)).toBe(true);
  });

  it('does not flag a harness that recovers in the recent window when all-time is healthy', () => {
    const recovered = entry({
      runs: 50,
      successRate: 96,
      recent: { runs: 10, successes: 10, infraFailures: 0, successRate: 100 },
    });
    expect(needsIntervention(recovered)).toBe(false);
  });

  it('never flags a harness with no counted runs (honest no-data)', () => {
    const noData = entry({
      runs: 0,
      successes: 0,
      infraFailures: 0,
      successRate: null,
      recent: { runs: 0, successes: 0, infraFailures: 0, successRate: null },
    });
    expect(needsIntervention(noData)).toBe(false);
  });

  it('honours explicit rule overrides', () => {
    const strict = entry({ runs: 10, successRate: 95 });
    expect(needsIntervention(strict, { threshold: 99 })).toBe(true);
    expect(needsIntervention(strict, { minRuns: 11 })).toBe(false);
  });

  it('falls back to the defaults for non-finite rule overrides (fail safe)', () => {
    const bad = entry({ runs: 10, successRate: 80 });
    // NaN / string / Infinity thresholds behave as the default 90.
    expect(needsIntervention(bad, { threshold: NaN })).toBe(true);
    expect(needsIntervention(bad, { threshold: 'low' })).toBe(true);
    expect(needsIntervention(bad, { threshold: Number.POSITIVE_INFINITY })).toBe(true);
    expect(needsIntervention(entry({ runs: 10, successRate: 95 }), { threshold: NaN })).toBe(false);
    // A negative minRuns behaves as the default 5: too few runs never flags.
    expect(needsIntervention(entry({ runs: 3, successRate: 0 }), { minRuns: -1 })).toBe(false);
    // …while an explicit valid 0 keeps flagging a badly-rated harness.
    expect(needsIntervention(entry({ runs: 3, successRate: 0 }), { minRuns: 0 })).toBe(true);
  });
});

describe('sortReliabilityForMonitor', () => {
  it('sorts flagged harnesses first, then by success rate ascending, no-data last', () => {
    const rows = [
      entry({ harnessId: 'healthy', runs: 20, successRate: 100 }),
      entry({ harnessId: 'noData', runs: 0, successRate: null }),
      entry({ harnessId: 'worst', runs: 10, successRate: 40 }),
      entry({ harnessId: 'meh', runs: 10, successRate: 92 }),
    ];
    const sorted = sortReliabilityForMonitor(rows);
    expect(sorted.map((row) => row.harnessId)).toEqual(['worst', 'meh', 'healthy', 'noData']);
  });

  it('puts a recently-degraded harness among the flagged, ordered worst-first', () => {
    const rows = [
      entry({ harnessId: 'chronic', runs: 10, successRate: 55 }),
      entry({
        harnessId: 'slipping',
        runs: 50,
        successRate: 94,
        recent: { runs: 10, successRate: 60 },
      }),
    ];
    const sorted = sortReliabilityForMonitor(rows);
    expect(sorted.map((row) => row.harnessId)).toEqual(['chronic', 'slipping']);
    expect(sorted.every((row) => needsIntervention(row))).toBe(true);
  });

  it('breaks rate ties by harness id and never mutates the input array', () => {
    const rows = [
      entry({ harnessId: 'zeta', runs: 10, successRate: 88 }),
      entry({ harnessId: 'alpha', runs: 10, successRate: 88 }),
    ];
    const inputCopy = [...rows];
    const sorted = sortReliabilityForMonitor(rows);
    expect(sorted.map((row) => row.harnessId)).toEqual(['alpha', 'zeta']);
    expect(rows).toEqual(inputCopy);
  });

  it('handles missing or non-array input without crashing', () => {
    expect(sortReliabilityForMonitor(undefined)).toEqual([]);
  });
});
