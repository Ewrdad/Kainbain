/***
 * MARK: resolveSectionLabel
 * @description Human-readable label for one sidebar group: the index
 *   `sectionLabels` entry when present, otherwise the raw section id (the
 *   same degradation previously applied only to unknown sections). Always
 *   returns a string: a missing or non-string section id degrades to the
 *   empty string, and an own-property check keeps prototype names
 *   (`constructor`, `__proto__`, ...) from ever leaking a non-string label
 *   into the UI. The canonical labels live in `api/siteDocs.js` and reach
 *   the UI inside the GET /docs index — this helper keeps no hand-maintained
 *   copy, so a backend regroup needs no frontend change.
 * @param {object} [inputs] - Labelled inputs.
 * @param {object} [inputs.index] - The GET /docs index payload (may be null).
 * @param {string} [inputs.section] - The section id to label.
 * @returns {string} The label to render (never undefined or null).
 * @example resolveSectionLabel({ index: {}, section: 'future-group' }) => 'future-group'
 ***/
export function resolveSectionLabel({ index, section } = {}) {
  const sectionId = typeof section === 'string' ? section : '';
  const labels = index && typeof index === 'object' ? index.sectionLabels : null;
  let label;
  if (labels && typeof labels === 'object' && Object.hasOwn(labels, sectionId)) {
    /* eslint-disable-next-line security/detect-object-injection -- key is hasOwn-checked on the line above */
    label = labels[sectionId];
  }
  return typeof label === 'string' && label.length > 0 ? label : sectionId;
}
