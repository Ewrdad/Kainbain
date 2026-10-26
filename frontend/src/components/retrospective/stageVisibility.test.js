import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  STAGE_VISIBILITY_STORAGE_KEY,
  STAGE_VISIBILITY_QUERY_PARAM,
  currentShowParam,
  filterStageSamples,
  isStageVisibilityToggleEnabled,
  listStageTypes,
  normalizeHiddenList,
  parseShowParam,
  sampleStageType,
  writeShowParam,
} from './stageVisibility';

/***
 * MARK: stageVisibility tests
 * @description Locks the retrospective stage-type filter helpers: type
 *   listing order, hidden-list sanitizing, sample filtering, `?show=`
 *   parsing (hash and search flavors), URL write-through, and the feature
 *   flag. No component rendering — pure logic only.
 ***/

function taskWithSamples(samples) {
  return { id: 'task-1', stageDurationSamples: samples };
}

afterEach(() => {
  vi.unstubAllEnvs();
  window.history.replaceState(null, '', '/');
});

describe('sampleStageType', () => {
  it('normalizes known, legacy, and missing sample types', () => {
    expect(sampleStageType({ stageType: 'CI' })).toBe('ci');
    expect(sampleStageType({ stageType: 'review' })).toBe('human');
    expect(sampleStageType({ stageType: 'merge' })).toBe('merge');
    expect(sampleStageType({ stageName: 'No type here' })).toBe('agent');
    expect(sampleStageType(null)).toBe('agent');
    expect(sampleStageType({ stageType: 'something-new' })).toBe('agent');
  });
});

describe('listStageTypes', () => {
  it('lists distinct types in canonical order', () => {
    const tasks = [
      taskWithSamples([
        { stageId: 'c1', stageName: 'Verify', stageType: 'ci', seconds: [60] },
        { stageId: 'a1', stageName: 'Idea', stageType: 'agent', seconds: [30] },
      ]),
      taskWithSamples([
        { stageId: 'h1', stageName: 'Approve', stageType: 'human', seconds: [90] },
        { stageId: 'c2', stageName: 'Verify again', stageType: 'script', seconds: [10] },
      ]),
    ];
    expect(listStageTypes(tasks)).toEqual(['agent', 'human', 'ci']);
  });

  it('ignores tasks without samples and tolerates bad input', () => {
    expect(listStageTypes([])).toEqual([]);
    expect(listStageTypes(null)).toEqual([]);
    expect(listStageTypes([{ id: 'empty' }, null])).toEqual([]);
    expect(listStageTypes(taskWithSamples([{ stageType: 'deploy', seconds: [5] }]))).toEqual([]);
    expect(listStageTypes([taskWithSamples([{ stageName: 'Untyped', seconds: [5] }])])).toEqual([
      'agent',
    ]);
  });
});

describe('normalizeHiddenList', () => {
  it('keeps known tokens, maps aliases, drops the rest', () => {
    expect(normalizeHiddenList(['CI', 'bogus', 'review', 'ci', 42, null])).toEqual(['ci', 'human']);
    expect(normalizeHiddenList(['approval', ' custom ', 'SCRIPT'])).toEqual([
      'human',
      'agent',
      'ci',
    ]);
  });

  it('returns an empty list for non-array input', () => {
    expect(normalizeHiddenList(null)).toEqual([]);
    expect(normalizeHiddenList('ci')).toEqual([]);
    expect(normalizeHiddenList(undefined)).toEqual([]);
  });
});

describe('filterStageSamples', () => {
  const samples = [
    { stageName: 'Idea', stageType: 'agent', seconds: [30] },
    { stageName: 'Approve', stageType: 'human', seconds: [90] },
    { stageName: 'Verify', stageType: 'ci', seconds: [60] },
  ];

  it('removes hidden types without touching the input', () => {
    const visible = filterStageSamples(samples, new Set(['human']));
    expect(visible.map((s) => s.stageName)).toEqual(['Idea', 'Verify']);
    expect(samples).toHaveLength(3);
  });

  it('accepts arrays and sanitizes them', () => {
    expect(filterStageSamples(samples, ['human', 'bogus'])).toHaveLength(2);
    expect(filterStageSamples(samples, [])).toHaveLength(3);
    expect(filterStageSamples(samples)).toHaveLength(3);
    expect(filterStageSamples(null, new Set(['ci']))).toEqual([]);
  });
});

describe('parseShowParam', () => {
  it('parses visible types from a query string', () => {
    // `deploy` is a legacy token now: it maps to `ci`.
    expect(parseShowParam('?show=ci,deploy')).toEqual({ present: true, visible: ['ci'] });
    expect(parseShowParam('/retrospective?show=agent')).toEqual({
      present: true,
      visible: ['agent'],
    });
    expect(parseShowParam('#/retrospective?show=human')).toEqual({
      present: true,
      visible: ['human'],
    });
    expect(parseShowParam('https://host/#/retrospective?show=ci&other=1')).toEqual({
      present: true,
      visible: ['ci'],
    });
  });

  it('maps legacy and approval aliases and dedupes', () => {
    expect(parseShowParam('?show=review,approval,REVIEW')).toEqual({
      present: true,
      visible: ['human'],
    });
    expect(parseShowParam('?show=script,custom')).toEqual({
      present: true,
      visible: ['ci', 'agent'],
    });
  });

  it('treats an empty value as hide-everything', () => {
    expect(parseShowParam('?show=')).toEqual({ present: true, visible: [] });
    expect(parseShowParam('#/retrospective?show=')).toEqual({ present: true, visible: [] });
  });

  it('ignores missing, unknown-only, and malformed input', () => {
    expect(parseShowParam('')).toEqual({ present: false, visible: [] });
    expect(parseShowParam(null)).toEqual({ present: false, visible: [] });
    expect(parseShowParam('?other=1')).toEqual({ present: false, visible: [] });
    expect(parseShowParam('no-query-here')).toEqual({ present: false, visible: [] });
    expect(parseShowParam('?show=bogus,also-bogus')).toEqual({ present: false, visible: [] });
  });
});

describe('currentShowParam', () => {
  it('reads the hash query first (HashRouter URLs)', () => {
    window.history.replaceState(null, '', '/#/retrospective?show=ci,deploy');
    // `deploy` dedupes into `ci` (legacy token).
    expect(currentShowParam()).toEqual({ present: true, visible: ['ci'] });
  });

  it('falls back to the search query (plain URLs)', () => {
    window.history.replaceState(null, '', '/retrospective?show=human');
    expect(currentShowParam()).toEqual({ present: true, visible: ['human'] });
  });

  it('prefers the hash when both carry the parameter', () => {
    window.history.replaceState(null, '', '/retrospective?show=agent#/retrospective?show=ci');
    expect(currentShowParam()).toEqual({ present: true, visible: ['ci'] });
  });

  it('reports absent when neither carries the parameter', () => {
    window.history.replaceState(null, '', '/#/retrospective');
    expect(currentShowParam()).toEqual({ present: false, visible: [] });
    window.history.replaceState(null, '', '/retrospective?other=1');
    expect(currentShowParam()).toEqual({ present: false, visible: [] });
  });

  it('accepts a location override', () => {
    expect(currentShowParam({ hash: '#/retrospective?show=merge', search: '' })).toEqual({
      present: true,
      visible: ['merge'],
    });
    expect(currentShowParam({})).toEqual({ present: false, visible: [] });
  });
});

describe('writeShowParam', () => {
  it('writes visible types into the hash query', () => {
    window.history.replaceState(null, '', '/#/retrospective');
    writeShowParam(['human'], ['agent', 'human', 'ci']);
    expect(window.location.hash).toBe('#/retrospective?show=agent%2Cci');
    expect(currentShowParam()).toEqual({ present: true, visible: ['agent', 'ci'] });
  });

  it('removes the parameter when everything is visible', () => {
    window.history.replaceState(null, '', '/#/retrospective?show=ci');
    writeShowParam([], ['agent', 'ci']);
    expect(window.location.hash).toBe('#/retrospective');
    expect(currentShowParam().present).toBe(false);
  });

  it('preserves unrelated parameters', () => {
    window.history.replaceState(null, '', '/#/retrospective?other=1&show=ci');
    writeShowParam(['ci'], ['agent', 'ci']);
    expect(window.location.hash).toContain('other=1');
    expect(currentShowParam()).toEqual({ present: true, visible: ['agent'] });
  });

  it('writes an empty value when every type is hidden', () => {
    window.history.replaceState(null, '', '/#/retrospective');
    writeShowParam(['agent', 'ci'], ['agent', 'ci']);
    expect(currentShowParam()).toEqual({ present: true, visible: [] });
  });

  it('uses the search query when no hash is present', () => {
    window.history.replaceState(null, '', '/retrospective');
    writeShowParam(['human'], ['agent', 'human']);
    expect(window.location.search).toContain('show=');
    expect(currentShowParam()).toEqual({ present: true, visible: ['agent'] });
  });

  it('never throws without history support', () => {
    expect(() => writeShowParam(null, null)).not.toThrow();
    expect(() => writeShowParam(['ci'], 'not-an-array')).not.toThrow();
  });
});

describe('isStageVisibilityToggleEnabled', () => {
  it('is enabled by default', () => {
    expect(isStageVisibilityToggleEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'FALSE', 'off', ' off '])('is disabled by flag value %j', (value) => {
    vi.stubEnv('VITE_ENABLE_STAGE_VISIBILITY_TOGGLE', value);
    expect(isStageVisibilityToggleEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'yes', 'anything'])('stays enabled for flag value %j', (value) => {
    vi.stubEnv('VITE_ENABLE_STAGE_VISIBILITY_TOGGLE', value);
    expect(isStageVisibilityToggleEnabled()).toBe(true);
  });
});

describe('storage and query constants', () => {
  it('uses the namespaced storage key and the documented query param', () => {
    expect(STAGE_VISIBILITY_STORAGE_KEY).toBe('kainbain:retrospective:hiddenStageTypes');
    expect(STAGE_VISIBILITY_QUERY_PARAM).toBe('show');
  });
});
