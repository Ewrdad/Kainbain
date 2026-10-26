import { describe, it, expect, afterEach } from 'vitest';
import {
  STAGE_TAG_FILTER_PARAM,
  STAGE_TAG_FILTER_MODE_PARAM,
  STAGE_TAG_FILTER_STORAGE_KEY,
  STAGE_TAG_FILTER_MODE_STORAGE_KEY,
  availableStageTags,
  normalizeSelectedTagTokens,
  stageMatchesTags,
  groupStagesByTagFilter,
  parseStageTagFilterParam,
  currentStageTagFilter,
  writeStageTagFilterParam,
} from './stageTagFilter';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('storage and query constants', () => {
  it('defines the expected parameters and storage keys', () => {
    expect(STAGE_TAG_FILTER_PARAM).toBe('tags');
    expect(STAGE_TAG_FILTER_MODE_PARAM).toBe('tagMode');
    expect(STAGE_TAG_FILTER_STORAGE_KEY).toBe('kainbain:board:stageTagFilter');
    expect(STAGE_TAG_FILTER_MODE_STORAGE_KEY).toBe('kainbain:board:stageTagFilterMode');
  });
});

describe('availableStageTags', () => {
  it('extracts unique tags across stages, deduping case-insensitively and sorting alphabetically', () => {
    const stages = [
      { id: 's1', tags: ['PO', 'Frontend'] },
      { id: 's2', tags: ['frontend', 'Backend', 'Dev'] },
      { id: 's3', tags: ['dev', 'QA'] },
      { id: 's4' }, // no tags
    ];
    expect(availableStageTags(stages)).toEqual(['Backend', 'Dev', 'Frontend', 'PO', 'QA']);
  });

  it('handles empty or non-array inputs gracefully', () => {
    expect(availableStageTags([])).toEqual([]);
    expect(availableStageTags(null)).toEqual([]);
    expect(availableStageTags(undefined)).toEqual([]);
  });
});

describe('normalizeSelectedTagTokens', () => {
  it('accepts array, Set, and comma-separated strings', () => {
    expect(normalizeSelectedTagTokens([' PO ', 'dev', 'po'])).toEqual(['PO', 'dev']);
    expect(normalizeSelectedTagTokens(new Set(['dev', 'Dev', 'QA']))).toEqual(['dev', 'QA']);
    expect(normalizeSelectedTagTokens('PO, Dev, QA, dev')).toEqual(['PO', 'Dev', 'QA']);
  });

  it('returns empty array for empty or invalid inputs', () => {
    expect(normalizeSelectedTagTokens('')).toEqual([]);
    expect(normalizeSelectedTagTokens(null)).toEqual([]);
    expect(normalizeSelectedTagTokens(undefined)).toEqual([]);
    expect(normalizeSelectedTagTokens([null, 42, ''])).toEqual([]);
  });
});

describe('stageMatchesTags', () => {
  const stage = { id: 's1', tags: ['PO', 'Frontend'] };

  it('matches all stages when no tags are selected', () => {
    expect(stageMatchesTags(stage, [])).toBe(true);
    expect(stageMatchesTags(stage, '')).toBe(true);
    expect(stageMatchesTags(stage, null)).toBe(true);
  });

  it('matches in "any" mode (default) if at least one tag matches case-insensitively', () => {
    expect(stageMatchesTags(stage, ['po'], 'any')).toBe(true);
    expect(stageMatchesTags(stage, ['FRONTEND', 'backend'], 'any')).toBe(true);
    expect(stageMatchesTags(stage, ['backend'], 'any')).toBe(false);
  });

  it('matches in "all" mode only when all selected tags are present', () => {
    expect(stageMatchesTags(stage, ['po', 'frontend'], 'all')).toBe(true);
    expect(stageMatchesTags(stage, ['po', 'backend'], 'all')).toBe(false);
  });

  it('tolerates stages without tags', () => {
    expect(stageMatchesTags({}, ['po'])).toBe(false);
    expect(stageMatchesTags(null, ['po'])).toBe(false);
  });
});

describe('groupStagesByTagFilter', () => {
  const s1 = { id: 's1', name: 'Stage 1', tags: ['PO'] };
  const s2 = { id: 's2', name: 'Stage 2', tags: ['PO', 'Dev'] };
  const s3 = { id: 's3', name: 'Stage 3', tags: ['Dev'] };
  const s4 = { id: 's4', name: 'Stage 4', tags: ['Dev'] };
  const s5 = { id: 's5', name: 'Stage 5', tags: ['Review'] };

  it('returns all stages without collapse when selection is empty', () => {
    const result = groupStagesByTagFilter([s1, s2, s3], []);
    expect(result).toEqual([
      { kind: 'stage', stage: s1 },
      { kind: 'stage', stage: s2 },
      { kind: 'stage', stage: s3 },
    ]);
  });

  it('returns empty array when input stages is empty', () => {
    expect(groupStagesByTagFilter([], ['PO'])).toEqual([]);
    expect(groupStagesByTagFilter(null, ['PO'])).toEqual([]);
  });

  it('coalesces adjacent non-matching stages into a single collapsed entry', () => {
    const stages = [s1, s2, s3, s4, s5];
    // Filtering for PO: s1 and s2 match. s3, s4, s5 do not match.
    const result = groupStagesByTagFilter(stages, ['PO']);
    expect(result).toEqual([
      { kind: 'stage', stage: s1 },
      { kind: 'stage', stage: s2 },
      {
        kind: 'collapsed',
        id: 'collapsed-s3-s4-s5',
        stages: [s3, s4, s5],
      },
    ]);
  });

  it('handles non-matching stages at the start, middle, and end', () => {
    const stages = [s5, s1, s3, s2]; // s5 (Review), s1 (PO), s3 (Dev), s2 (PO, Dev)
    // Filter for PO: s5 collapsed, s1 stage, s3 collapsed, s2 stage
    const result = groupStagesByTagFilter(stages, ['PO']);
    expect(result).toEqual([
      { kind: 'collapsed', id: 'collapsed-s5', stages: [s5] },
      { kind: 'stage', stage: s1 },
      { kind: 'collapsed', id: 'collapsed-s3', stages: [s3] },
      { kind: 'stage', stage: s2 },
    ]);
  });

  it('collapses all stages into one run when none match', () => {
    const stages = [s1, s2, s3];
    const result = groupStagesByTagFilter(stages, ['NonExistent']);
    expect(result).toEqual([
      {
        kind: 'collapsed',
        id: 'collapsed-s1-s2-s3',
        stages: [s1, s2, s3],
      },
    ]);
  });
});

describe('parseStageTagFilterParam', () => {
  it('parses tags and tagMode from query string', () => {
    expect(parseStageTagFilterParam('?tags=PO,Dev&tagMode=all')).toEqual({
      present: true,
      selected: ['PO', 'Dev'],
      mode: 'all',
    });
  });

  it('recognizes present but empty tags param', () => {
    expect(parseStageTagFilterParam('?tags=')).toEqual({
      present: true,
      selected: [],
      mode: undefined,
    });
  });

  it('ignores invalid tagMode values', () => {
    expect(parseStageTagFilterParam('?tags=PO&tagMode=invalid')).toEqual({
      present: true,
      selected: ['PO'],
      mode: undefined,
    });
  });

  it('returns present: false when tags param is missing', () => {
    expect(parseStageTagFilterParam('?other=value')).toEqual({
      present: false,
      selected: [],
      mode: undefined,
    });
    expect(parseStageTagFilterParam('')).toEqual({
      present: false,
      selected: [],
      mode: undefined,
    });
  });
});

describe('currentStageTagFilter', () => {
  it('reads hash query first for HashRouter URLs', () => {
    window.history.replaceState(null, '', '/#/board?tags=PO,Dev&tagMode=all');
    expect(currentStageTagFilter()).toEqual({
      present: true,
      selected: ['PO', 'Dev'],
      mode: 'all',
    });
  });

  it('falls back to search query', () => {
    window.history.replaceState(null, '', '/board?tags=Frontend');
    expect(currentStageTagFilter()).toEqual({
      present: true,
      selected: ['Frontend'],
      mode: undefined,
    });
  });

  it('accepts a location override', () => {
    const loc = { hash: '#/workflow?tags=QA', search: '' };
    expect(currentStageTagFilter(loc)).toEqual({
      present: true,
      selected: ['QA'],
      mode: undefined,
    });
  });
});

describe('writeStageTagFilterParam', () => {
  it('writes tags to hash query without tagMode when mode is default ("any")', () => {
    window.history.replaceState(null, '', '/#/board');
    writeStageTagFilterParam(['PO', 'Dev'], 'any');
    expect(window.location.hash).toBe('#/board?tags=PO%2CDev');
    expect(currentStageTagFilter()).toEqual({
      present: true,
      selected: ['PO', 'Dev'],
      mode: undefined,
    });
  });

  it('writes tagMode when mode is non-default ("all")', () => {
    window.history.replaceState(null, '', '/#/board');
    writeStageTagFilterParam(['PO', 'Dev'], 'all');
    expect(window.location.hash).toBe('#/board?tags=PO%2CDev&tagMode=all');
    expect(currentStageTagFilter()).toEqual({
      present: true,
      selected: ['PO', 'Dev'],
      mode: 'all',
    });
  });

  it('clears parameters when selected tags list is empty', () => {
    window.history.replaceState(null, '', '/#/board?tags=PO&tagMode=all');
    writeStageTagFilterParam([], 'any');
    expect(window.location.hash).toBe('#/board');
    expect(currentStageTagFilter().present).toBe(false);
  });

  it('writes to search query when hash is not present', () => {
    window.history.replaceState(null, '', '/board');
    writeStageTagFilterParam(['Dev'], 'any');
    expect(window.location.search).toBe('?tags=Dev');
    expect(currentStageTagFilter()).toEqual({
      present: true,
      selected: ['Dev'],
      mode: undefined,
    });
  });

  it('never throws on invalid inputs', () => {
    expect(() => writeStageTagFilterParam(null, null)).not.toThrow();
  });
});
