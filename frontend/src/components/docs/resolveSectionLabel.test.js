import { describe, expect, it } from 'vitest';
import { resolveSectionLabel } from './resolveSectionLabel';

/***
 * MARK: resolveSectionLabel tests
 * @description Locks the sidebar label derivation: labels come from the GET
 *   /docs index `sectionLabels` with a raw-id fallback, and the return value
 *   is always a string (prototype names and missing sections degrade safely).
 *   Equality with the API taxonomy is asserted API-side by
 *   `api/siteDocs.frontendParity.test.js`.
 * @example run `npm run test --prefix frontend -- resolveSectionLabel`
 ***/

describe('resolveSectionLabel', () => {
  it('uses the index sectionLabels entry when present', () => {
    expect(
      resolveSectionLabel({
        index: { sectionLabels: { concepts: 'Concepts' } },
        section: 'concepts',
      }),
    ).toBe('Concepts');
  });

  it('falls back to the raw section id without a label entry', () => {
    expect(resolveSectionLabel({ index: { sectionLabels: {} }, section: 'future-group' })).toBe(
      'future-group',
    );
    expect(resolveSectionLabel({ index: {}, section: 'future-group' })).toBe('future-group');
    expect(resolveSectionLabel({ index: null, section: 'future-group' })).toBe('future-group');
    expect(
      resolveSectionLabel({ index: { sectionLabels: { concepts: '' } }, section: 'concepts' }),
    ).toBe('concepts');
  });

  it('always returns a string: prototype names and missing sections degrade safely', () => {
    const labels = {};
    expect(resolveSectionLabel({ index: { sectionLabels: labels }, section: 'constructor' })).toBe(
      'constructor',
    );
    expect(resolveSectionLabel({ index: { sectionLabels: labels }, section: '__proto__' })).toBe(
      '__proto__',
    );
    expect(resolveSectionLabel({ index: null, section: null })).toBe('');
    expect(resolveSectionLabel({ index: null, section: undefined })).toBe('');
    expect(resolveSectionLabel()).toBe('');
  });
});
