import { describe, expect, it } from 'vitest';
import {
  deriveSectionOrder,
  resolveSectionLabel,
  DOCS_SIDEBAR_STORAGE_KEY,
} from './docsSections';

/***
 * MARK: docsSections tests
 * @description Locks the sidebar derivation helpers: order prefers the GET
 *   /docs index `sections` array (never a hand-maintained list — a rename
 *   must not touch this module), labels come from `sectionLabels` with a
 *   raw-id fallback, and the collapse-state storage key stays versioned.
 *   Equality with the API taxonomy is asserted API-side by
 *   `api/siteDocs.frontendParity.test.js` against `buildDocsIndex`.
 * @example run `npm run test --prefix frontend`
 ***/

describe('deriveSectionOrder', () => {
  it('prefers the index sections array over the docs content', () => {
    expect(
      deriveSectionOrder({ sections: ['b', 'a'] }, [{ section: 'a' }, { section: 'b' }]),
    ).toEqual(['b', 'a']);
  });

  it('ignores non-string index entries instead of throwing', () => {
    expect(deriveSectionOrder({ sections: ['a', null, 7, 'b'] }, [])).toEqual(['a', 'b']);
  });

  it('falls back to first-appearance in the loaded docs without an index order', () => {
    const docs = [{ section: 'b' }, { section: 'a' }, { section: 'b' }, null];
    expect(deriveSectionOrder({}, docs)).toEqual(['b', 'a']);
    expect(deriveSectionOrder({ sections: [] }, docs)).toEqual(['b', 'a']);
    expect(deriveSectionOrder(null, docs)).toEqual(['b', 'a']);
  });

  it('returns an empty order for an empty index without docs', () => {
    expect(deriveSectionOrder({ sections: [] }, [])).toEqual([]);
    expect(deriveSectionOrder(null, null)).toEqual([]);
  });
});

describe('resolveSectionLabel', () => {
  it('uses the index sectionLabels entry when present', () => {
    expect(
      resolveSectionLabel({ sectionLabels: { concepts: 'Concepts' } }, 'concepts'),
    ).toBe('Concepts');
  });

  it('falls back to the raw section id without a label entry', () => {
    expect(resolveSectionLabel({ sectionLabels: {} }, 'future-group')).toBe('future-group');
    expect(resolveSectionLabel({}, 'future-group')).toBe('future-group');
    expect(resolveSectionLabel(null, 'future-group')).toBe('future-group');
    expect(resolveSectionLabel({ sectionLabels: { concepts: '' } }, 'concepts')).toBe(
      'concepts',
    );
  });
});

describe('docsSections storage', () => {
  it('uses a versioned localStorage key so a regroup never misreads old state', () => {
    expect(DOCS_SIDEBAR_STORAGE_KEY).toBe('kainbain.docsSidebar.collapsed.v1');
  });
});
