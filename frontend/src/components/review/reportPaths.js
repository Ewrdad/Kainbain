/***
 * MARK: normalizeReportPath
 * @description Canonical report anchor shared by the review UI. Strips a
 *   single leading `./` so `docs/tasks/t-1/plan.md` and
 *   `./docs/tasks/t-1/plan.md` resolve to the same report, and collapses
 *   non-strings / blank strings to `''` so callers can treat the empty string
 *   as "no report". This is the single source of truth for report identity;
 *   every report lookup (selection, badges, comment grouping) must go through
 *   it so a docs re-sync that flips the `./` spelling can never split one
 *   report into two.
 * @example normalizeReportPath('./docs/tasks/t-1/plan.md') => 'docs/tasks/t-1/plan.md'
 * @param {unknown} value - Raw path from a report, selection, or comment.
 * @returns {string} Canonical path (empty when not a usable string).
 ***/
export function normalizeReportPath(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
}

/***
 * MARK: reportPathOf
 * @description The anchor stored for a report: prefers the explicit `path`
 *   and falls back to `filename` (older payloads only carried the latter).
 *   Returns `''` for an unusable report so the caller can decide the
 *   fallback instead of crashing on `null`.
 * @example reportPathOf({ filename: 'plan.md' }) => 'plan.md'
 * @param {Object|null|undefined} report
 * @returns {string}
 ***/
export function reportPathOf(report) {
  if (!report || typeof report !== 'object') return '';
  const raw = report.path || report.filename || '';
  return typeof raw === 'string' ? raw : '';
}

/***
 * MARK: reportTitleOf
 * @description Human-readable label for a report, preferring the pipeline
 *   stage name (what a reviewer recognises) and degrading to the filename or
 *   path. Never returns an empty string so a select option / list button is
 *   always announceable to assistive tech.
 * @example reportTitleOf({ stageName: 'Plan', filename: 'plan.md' }) => 'Plan'
 * @param {Object|null|undefined} report
 * @returns {string}
 ***/
export function reportTitleOf(report) {
  if (!report || typeof report !== 'object') return 'Stage report';
  const label =
    report.stageName || report.name || report.filename || reportPathOf(report) || 'Stage report';
  return typeof label === 'string' && label ? label : 'Stage report';
}

/***
 * MARK: reportBadgeCount
 * @description Unresolved comment count for a report, keyed through the
 *   canonical path so `./`-prefixed and bare comment anchors count against
 *   the same report. Defensive against a missing/invalid count map (the
 *   navigator must render even if the caller forgets to pass counts).
 * @example reportBadgeCount({ path: './a.md' }, new Map([['a.md', 2]])) => 2
 * @param {Object|null|undefined} report
 * @param {Map<string, number>} [commentCounts]
 * @returns {number} Non-negative integer.
 ***/
export function reportBadgeCount(report, commentCounts) {
  const key = normalizeReportPath(reportPathOf(report));
  if (!key || !commentCounts || typeof commentCounts.get !== 'function') return 0;
  const count = commentCounts.get(key);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/***
 * MARK: reportOptionLabel
 * @description Flat text label for the mobile `<select>`: title plus the
 *   AUTO and unresolved-count markers. Kept separate from the desktop list
 *   markup so both renderers stay in lockstep on what "this report is
 *   auto-generated / has N open comments" means.
 * @example reportOptionLabel({ stageName: 'Plan', auto: true }, new Map([['a.md', 1]]))
 *          => 'Plan • AUTO • 1 unresolved'
 * @param {Object|null|undefined} report
 * @param {Map<string, number>} [commentCounts]
 * @returns {string}
 ***/
export function reportOptionLabel(report, commentCounts) {
  const count = reportBadgeCount(report, commentCounts);
  const auto = report && typeof report === 'object' && report.auto ? ' • AUTO' : '';
  const unresolved = count > 0 ? ` • ${count} unresolved` : '';
  return `${reportTitleOf(report)}${auto}${unresolved}`;
}
