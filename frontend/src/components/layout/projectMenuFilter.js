/***
 * MARK: filterProjects
 * @description Project-menu search matcher: case-insensitive substring match
 *   against the project `name`. Mirrors the `defaultMultiSelectFilter`
 *   semantics from `MultiSelectDropdown` but targets the project row shape
 *   (`{ id, name, ... }`, which has no `label` field), so the shared filter
 *   cannot be reused as-is (spike verdict, Step 0).
 *
 *   The optional `group` string (and every other extra field) passes through
 *   untouched on the same object references, so the future grouping ticket
 *   can attach grouping values without touching this matcher.
 * @example filterProjects([{ id: '1', name: 'Build API' }], 'build') => [{ id: '1', name: 'Build API' }]
 * @param {Array<Object>} [projects=[]] - Full project list (e.g. `visibleProjects`).
 * @param {string} [query] - Raw user query; blank returns the input unchanged.
 * @returns {Array<Object>} Matching projects (all when the query is blank).
 ***/
export function filterProjects(projects = [], query) {
  const list = Array.isArray(projects) ? projects : [];
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!q) return list;
  return list.filter((project) => String(project?.name ?? '').toLowerCase().includes(q));
}
