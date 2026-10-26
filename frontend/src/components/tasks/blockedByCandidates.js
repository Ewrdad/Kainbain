import { formatTaskKey, isTaskCompleted } from './taskFormatters';

/***
 * MARK: normalizeKbQuery
 * @description Normalizes a free-text query for kb-number comparison:
 *   uppercases, strips `#`, `-`, and whitespace, then strips one leading
 *   `KB` prefix. Lets `73c4`, `#KB-73C4`, and `kb73c4` all match `#KB-73C4`.
 * @example normalizeKbQuery('#KB-73c4') => '73C4'
 * @example normalizeKbQuery('kb73c4') => '73C4'
 * @param {string} [query] - Raw user query.
 * @returns {string} Normalized query fragment (may be empty).
 ***/
export function normalizeKbQuery(query) {
  const cleaned = String(query || '')
    .toUpperCase()
    .replace(/[\s#\-]/g, '');
  return cleaned.startsWith('KB') ? cleaned.slice(2) : cleaned;
}

/***
 * MARK: filterBlockedByCandidates
 * @description Returns the tasks the Blocked-by dropdown may offer: every
 *   task except the edited task itself and every completed task
 *   (`isTaskCompleted` covers `completed` and legacy `done`).
 * @example filterBlockedByCandidates([{id:'a',status:'in_stage'},{id:'b',status:'completed'}], 'x') => [{id:'a',status:'in_stage'}]
 * @param {Array<Object>} [tasks=[]] - Same-project tasks.
 * @param {string} [selfId] - Id of the task being edited (never a candidate).
 * @returns {Array<Object>} Active, non-complete candidates.
 ***/
export function filterBlockedByCandidates(tasks = [], selfId) {
  return (tasks || []).filter(
    (t) => String(t?.id) !== String(selfId) && !isTaskCompleted(t),
  );
}

/***
 * MARK: matchesBlockedByQuery
 * @description Case-insensitive substring match of a candidate against a
 *   search query: title (falling back to `goal`, then `id`), the formatted
 *   kb-number (`formatTaskKey(id)`, with or without the `#KB-` prefix), or
 *   the raw id. A blank query matches everything.
 * @example matchesBlockedByQuery({id:'73c4560d-1',title:'Build API'}, 'build') => true
 * @example matchesBlockedByQuery({id:'73c4560d-1',title:'Build API'}, '#KB-73C4') => true
 * @param {Object} [task] - Candidate task.
 * @param {string} [query] - Raw user query.
 * @returns {boolean} True when the candidate matches the query.
 ***/
export function matchesBlockedByQuery(task, query) {
  if (task === null || task === undefined) return false;
  const rawQuery = String(query || '').trim();
  if (!rawQuery) return true;
  const loweredQuery = rawQuery.toLowerCase();

  const label = String(task.title || task.goal || task.id || '').toLowerCase();
  if (label.includes(loweredQuery)) return true;

  const rawId = String(task.id || '');
  if (rawId.toLowerCase().includes(loweredQuery)) return true;

  const key = formatTaskKey(rawId);
  if (key.toLowerCase().includes(loweredQuery)) return true;

  const normalizedQuery = normalizeKbQuery(rawQuery);
  if (!normalizedQuery) return true;
  const normalizedKey = normalizeKbQuery(key);
  return normalizedKey.includes(normalizedQuery);
}
