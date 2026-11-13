import { describe, it, expect } from 'vitest';
import {
  fleetModelsForHarness,
  fleetServesHarness,
  withFleetModels,
  effectiveModelSelection,
} from './fleetModelOptions';
import '@testing-library/jest-dom';

const entry = (harnesses) => ({ runnerCount: 1, runnerIds: ['r1'], harnesses, tiers: [] });

describe('fleetModelsForHarness', () => {
  it('attributes harness-scoped ids strictly to their own section', () => {
    const counts = { 'muse::meta::muse-spark-1.3': entry(['muse', 'pi']) };
    expect(fleetModelsForHarness('muse', counts)).toEqual([
      {
        key: 'muse::meta::muse-spark-1.3',
        id: 'muse-spark-1.3',
        provider: 'meta',
        name: 'muse-spark-1.3',
        fleet: true,
      },
    ]);
    // pi serves it per the union, but the id names muse: never offered for pi.
    expect(fleetModelsForHarness('pi', counts)).toEqual([]);
  });

  it('offers legacy and bare ids on every served section', () => {
    const counts = {
      'prov::m1': entry(['muse', 'pi']),
      m2: entry(['pi']),
    };
    expect(fleetModelsForHarness('muse', counts).map((m) => m.key)).toEqual(['prov::m1']);
    expect(fleetModelsForHarness('pi', counts).map((m) => m.key)).toEqual(['prov::m1', 'm2']);
  });

  it('withholds ids from sections no serving runner offers', () => {
    const counts = { 'muse::meta::m': entry(['pi']) };
    // seg1 says muse but no serving runner offers muse (allowlist overreach).
    expect(fleetModelsForHarness('muse', counts)).toEqual([]);
    expect(fleetModelsForHarness('pi', counts)).toEqual([]);
  });

  it('offers a newly discovered fleet id under its harness with the identical key', () => {
    // Fleet entry ⇒ UI option: the option key is the exact advertised id
    // (dispatch matches verbatim, so keys must be byte-equal end to end).
    const counts = {
      'muse::meta::muse-spark-1.4': entry(['muse']),
    };
    expect(fleetModelsForHarness('muse', counts)).toEqual([
      {
        key: 'muse::meta::muse-spark-1.4',
        id: 'muse-spark-1.4',
        provider: 'meta',
        name: 'muse-spark-1.4',
        fleet: true,
      },
    ]);
  });

  it('skips malformed ids and stays empty without loaded fleet data', () => {
    const counts = { 'a::b::c::d::e': entry(['muse']), '': entry(['muse']) };
    expect(fleetModelsForHarness('muse', counts)).toEqual([]);
    expect(fleetModelsForHarness('muse', undefined)).toEqual([]);
    expect(fleetModelsForHarness('muse', {})).toEqual([]);
    expect(fleetModelsForHarness('', counts)).toEqual([]);
  });

  it('carries the snapshot verdict so stale entries badge Unavailable', () => {
    const counts = {
      'muse::meta::retired': {
        ...entry(['muse']),
        runnerCount: 0,
        runnerIds: [],
        available: false,
        unavailableReason: 'stale pin',
      },
    };
    expect(fleetModelsForHarness('muse', counts)).toEqual([
      {
        key: 'muse::meta::retired',
        id: 'retired',
        provider: 'meta',
        name: 'retired',
        fleet: true,
        available: false,
        unavailableReason: 'stale pin',
      },
    ]);
  });

  it('stays verdict-free for older backends (count badges judge those)', () => {
    const counts = { 'muse::meta::m': entry(['muse']) };
    const [option] = fleetModelsForHarness('muse', counts);
    expect(option).not.toHaveProperty('available');
    expect(option).not.toHaveProperty('unavailableReason');
  });
});

describe('fleetServesHarness', () => {
  it('reports service only for attributable sections', () => {
    const counts = { 'muse::meta::m': entry(['muse']) };
    expect(fleetServesHarness('muse', counts)).toBe(true);
    expect(fleetServesHarness('pi', counts)).toBe(false);
    expect(fleetServesHarness('muse', undefined)).toBe(false);
  });
});

describe('withFleetModels', () => {
  it('merges without duplicating backend ids, backend wins ties', () => {
    const backend = [{ key: 'muse::meta::m', id: 'm', provider: 'meta', name: 'M' }];
    const counts = { 'muse::meta::m': entry(['muse']), 'muse::meta::n': entry(['muse']) };
    const merged = withFleetModels(backend, 'muse', counts);
    expect(merged.map((m) => m.key)).toEqual(['muse::meta::m', 'muse::meta::n']);
    expect(merged[0].name).toBe('M');
  });

  it('returns the backend list untouched without fleet data', () => {
    const backend = [{ key: 'a', id: 'a' }];
    expect(withFleetModels(backend, 'muse', undefined)).toBe(backend);
  });
});

describe('effectiveModelSelection', () => {
  it('lets a fleet-served none harness behave as list', () => {
    const counts = { 'muse::meta::m': entry(['muse']) };
    expect(effectiveModelSelection('none', 'muse', counts)).toBe('list');
    expect(effectiveModelSelection('none', 'pi', counts)).toBe('none');
    expect(effectiveModelSelection('list', 'muse', counts)).toBe('list');
    expect(effectiveModelSelection('none', 'muse', undefined)).toBe('none');
  });
});
