import { describe, expect, it } from 'vitest';
import { deriveSectionOrder } from './deriveSectionOrder';

/***
 * MARK: deriveSectionOrder tests
 * @description Locks the sidebar order derivation: the GET /docs index
 *   `sections` array wins (never a hand-maintained list — a rename must not
 *   touch the frontend), ids are de-duplicated so one group cannot render
 *   twice, non-string entries are skipped instead of throwing, and the
 *   fallback is first-appearance in the loaded docs. Equality with the API
 *   taxonomy is asserted API-side by `api/siteDocs.frontendParity.test.js`.
 * @example run `npm run test --prefix frontend -- deriveSectionOrder`
 ***/

describe('deriveSectionOrder', () => {
  it('prefers the index sections array over the docs content', () => {
    expect(
      deriveSectionOrder({
        index: { sections: ['b', 'a'] },
        docs: [{ section: 'a' }, { section: 'b' }],
      }),
    ).toEqual(['b', 'a']);
  });

  it('ignores non-string index entries instead of throwing', () => {
    expect(deriveSectionOrder({ index: { sections: ['a', null, 7, 'b'] }, docs: [] })).toEqual([
      'a',
      'b',
    ]);
  });

  it('de-duplicates repeated ids so one group can never render twice', () => {
    expect(deriveSectionOrder({ index: { sections: ['a', 'a', 'b', 'a'] }, docs: [] })).toEqual([
      'a',
      'b',
    ]);
    expect(
      deriveSectionOrder({ index: null, docs: [{ section: 'a' }, { section: 'a' }] }),
    ).toEqual(['a']);
  });

  it('falls back to first-appearance in the loaded docs without an index order', () => {
    const docs = [{ section: 'b' }, { section: 'a' }, { section: 'b' }, null, { title: 'x' }];
    expect(deriveSectionOrder({ index: {}, docs })).toEqual(['b', 'a']);
    expect(deriveSectionOrder({ index: { sections: [] }, docs })).toEqual(['b', 'a']);
    expect(deriveSectionOrder({ index: null, docs })).toEqual(['b', 'a']);
  });

  it('returns an empty order for an empty index without docs', () => {
    expect(deriveSectionOrder({ index: { sections: [] }, docs: [] })).toEqual([]);
    expect(deriveSectionOrder({ index: null, docs: null })).toEqual([]);
    expect(deriveSectionOrder()).toEqual([]);
  });
});
