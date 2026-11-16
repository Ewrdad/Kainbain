/***
 * MARK: docsSections
 * @description Single source of truth for the docs sidebar taxonomy on the
 *   frontend. Mirrors the API's `DOC_SECTIONS` / `SECTION_LABELS`
 *   (`api/siteDocs.js`): the sidebar order follows the GET /docs index
 *   `sections` array at runtime and falls back to `DOC_SECTION_ORDER` here,
 *   and `api/siteDocs.frontendParity.test.js` locks these labels to the API
 *   copy so the two can never drift.
 * @example DOC_SECTION_LABELS['workflows'] => 'Everyday workflows'
 ***/

export const DOC_SECTION_LABELS = {
  'getting-started': 'Getting started',
  concepts: 'Concepts',
  workflows: 'Everyday workflows',
  reference: 'Reference & runbooks',
};

/***
 * MARK: DOC_SECTION_ORDER
 * @description Fallback sidebar group ordering (onboarding: setup before
 *   concepts before daily use before lookup). At runtime `DocsView` prefers
 *   the `sections` array from the docs index so a backend regroup needs no
 *   frontend change.
 * @example DOC_SECTION_ORDER => ['getting-started', 'concepts', ...]
 ***/
export const DOC_SECTION_ORDER = ['getting-started', 'concepts', 'workflows', 'reference'];

/***
 * MARK: DOCS_SIDEBAR_STORAGE_KEY
 * @description localStorage key for the persisted set of collapsed sidebar
 *   groups (JSON array of section ids). Unknown ids are ignored at read
 *   time so a regroup never breaks a stored payload.
 * @example DOCS_SIDEBAR_STORAGE_KEY => 'kainbain.docsSidebar.collapsed.v1'
 ***/
export const DOCS_SIDEBAR_STORAGE_KEY = 'kainbain.docsSidebar.collapsed.v1';
