/***
 * MARK: deriveSectionOrder
 * @description Sidebar group ordering for one loaded docs index: the index
 *   `sections` array when it is a non-empty string list, otherwise the
 *   sections of the loaded docs in first-appearance order (so an index
 *   without `sections` still groups instead of scattering). Ids are
 *   de-duplicated in both paths, so a malformed index can never render one
 *   group twice, and non-string entries are skipped instead of throwing.
 *   The canonical section list lives in `api/siteDocs.js` and reaches the UI
 *   inside the GET /docs index — this helper keeps no hand-maintained copy,
 *   so a backend regroup needs no frontend change.
 * @param {object} [inputs] - Labelled inputs.
 * @param {object} [inputs.index] - The GET /docs index payload (may be null).
 * @param {Array} [inputs.docs] - The loaded article descriptors (may be null).
 * @returns {Array<string>} Ordered, de-duplicated section ids.
 * @example deriveSectionOrder({ index: { sections: ['b', 'a'] }, docs: [] }) => ['b', 'a']
 ***/
export function deriveSectionOrder({ index, docs } = {}) {
  const fromIndex = [];
  const indexSections = Array.isArray(index?.sections) ? index.sections : [];
  for (const entry of indexSections) {
    if (typeof entry === 'string' && entry.length > 0 && !fromIndex.includes(entry)) {
      fromIndex.push(entry);
    }
  }
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
