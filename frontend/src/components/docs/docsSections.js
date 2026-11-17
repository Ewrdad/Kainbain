/***
 * MARK: docsSections
 * @description Sidebar constants for the docs viewer. The canonical section
 *   taxonomy (ids, order, labels) lives in `api/siteDocs.js` and reaches the
 *   frontend inside the GET /docs index (`sections` + `sectionLabels` from
 *   `buildDocsIndex`); ordering and labels are derived at runtime by
 *   `./deriveSectionOrder.js` and `./resolveSectionLabel.js`. No file in this
 *   folder keeps a hand-maintained copy, so a backend regroup needs no
 *   frontend change (`api/siteDocs.frontendParity.test.js` locks that).
 * @example DOCS_SIDEBAR_STORAGE_KEY => 'kainbain.docsSidebar.collapsed.v1'
 ***/

/***
 * MARK: DOCS_SIDEBAR_STORAGE_KEY
 * @description localStorage key for the persisted set of collapsed sidebar
 *   groups (JSON array of section ids). Unknown ids are ignored at read
 *   time so a regroup never breaks a stored payload.
 * @example DOCS_SIDEBAR_STORAGE_KEY => 'kainbain.docsSidebar.collapsed.v1'
 ***/
export const DOCS_SIDEBAR_STORAGE_KEY = 'kainbain.docsSidebar.collapsed.v1';
