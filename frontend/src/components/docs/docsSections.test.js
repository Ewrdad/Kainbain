import { describe, expect, it } from 'vitest';
import {
  DOC_SECTION_LABELS,
  DOC_SECTION_ORDER,
  DOCS_SIDEBAR_STORAGE_KEY,
} from './docsSections';

/***
 * MARK: docsSections tests
 * @description Locks the frontend sidebar taxonomy shape: four groups in
 *   onboarding order, a non-empty label per group, and a versioned storage
 *   key. Cross-boundary equality with the API copy is asserted by
 *   `api/siteDocs.frontendParity.test.js` (node-side, same import).
 * @example run `npm run test --prefix frontend`
 ***/

describe('docsSections taxonomy', () => {
  it('exposes four groups in onboarding order', () => {
    expect(DOC_SECTION_ORDER).toEqual(['getting-started', 'concepts', 'workflows', 'reference']);
  });

  it('labels every group with a non-empty human-readable name', () => {
    for (const section of DOC_SECTION_ORDER) {
      expect(typeof DOC_SECTION_LABELS[section]).toBe('string');
      expect(DOC_SECTION_LABELS[section].length).toBeGreaterThan(0);
    }
    expect(Object.keys(DOC_SECTION_LABELS).sort()).toEqual([...DOC_SECTION_ORDER].sort());
  });

  it('uses a versioned localStorage key so a regroup never misreads old state', () => {
    expect(DOCS_SIDEBAR_STORAGE_KEY).toBe('kainbain.docsSidebar.collapsed.v1');
  });
});
