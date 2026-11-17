import { describe, expect, it } from 'vitest';
import { DOCS_SIDEBAR_STORAGE_KEY } from './docsSections';

/***
 * MARK: docsSections tests
 * @description Locks the sidebar storage key: it stays versioned so a regroup
 *   never misreads old collapsed-group state. The order/label derivation
 *   helpers live in their own files (`deriveSectionOrder.test.js`,
 *   `resolveSectionLabel.test.js`); equality with the API taxonomy is
 *   asserted API-side by `api/siteDocs.frontendParity.test.js`.
 * @example run `npm run test --prefix frontend -- docsSections`
 ***/

describe('docsSections storage', () => {
  it('uses a versioned localStorage key so a regroup never misreads old state', () => {
    expect(DOCS_SIDEBAR_STORAGE_KEY).toBe('kainbain.docsSidebar.collapsed.v1');
  });
});
