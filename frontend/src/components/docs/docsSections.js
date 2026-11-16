/***
 * MARK: docsSections
 * @description Sidebar taxonomy helpers for the docs viewer. The canonical
 *   section list lives in `api/siteDocs.js` (`DOC_SECTIONS` /
 *   `SECTION_LABELS`) and reaches the frontend inside the GET /docs index
 *   (`sections` + `sectionLabels` from `buildDocsIndex`) — this module keeps
 *   no hand-maintained copy, so a backend regroup needs no frontend change.
 *   Order prefers the index `sections` array and falls back to
 *   first-appearance in the loaded docs; labels fall back to the raw section
 *   id when the index carries no label for it.
 * @example resolveSectionLabel({ sectionLabels: { concepts: 'Concepts' } }, 'concepts') => 'Concepts'
 ***/

/***
 * MARK: deriveSectionOrder
 * @description Sidebar group ordering for one loaded index: the index
 *   `sections` array when it is a non-empty string list, otherwise the
 *   sections of the loaded docs in first-appearance order (so an index
 *   without `sections` still groups instead of scattering).
 * @param {object} index - The GET /docs index payload (may be null).
 * @param {Array} docs - The loaded article descriptors.
 * @returns {Array<string>} Ordered section ids.
 * @example deriveSectionOrder({ sections: ['b', 'a'] }, []) => ['b', 'a']
 ***/
export function deriveSectionOrder(index, docs) {
  const fromIndex = Array.isArray(index?.sections)
    ? index.sections.filter((s) => typeof s === 'string' && s.length > 0)
    : [];
  if (fromIndex.length > 0) return fromIndex;
  const seen = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const section = doc && typeof doc === 'object' ? doc.section : null;
    if (typeof section === 'string' && section.length > 0 && !seen.includes(section)) {
      seen.push(section);
    }
  }
  return seen;
}

/***
 * MARK: resolveSectionLabel
 * @description Human-readable label for one sidebar group: the index
 *   `sectionLabels` entry when present, otherwise the raw section id (the
 *   same degradation previously applied only to unknown sections).
 * @param {object} index - The GET /docs index payload (may be null).
 * @param {string} section - The section id.
 * @returns {string} The label to render.
 * @example resolveSectionLabel({}, 'future-group') => 'future-group'
 ***/
export function resolveSectionLabel(index, section) {
  const labels = index && typeof index === 'object' ? index.sectionLabels : null;
  const label =
    labels && typeof labels === 'object' ? labels[section] : undefined;
  return typeof label === 'string' && label.length > 0 ? label : section;
}

/***
 * MARK: DOCS_SIDEBAR_STORAGE_KEY
 * @description localStorage key for the persisted set of collapsed sidebar
 *   groups (JSON array of section ids). Unknown ids are ignored at read
 *   time so a regroup never breaks a stored payload.
 * @example DOCS_SIDEBAR_STORAGE_KEY => 'kainbain.docsSidebar.collapsed.v1'
 ***/
export const DOCS_SIDEBAR_STORAGE_KEY = 'kainbain.docsSidebar.collapsed.v1';
