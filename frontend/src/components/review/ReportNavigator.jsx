import {
  normalizeReportPath,
  reportBadgeCount,
  reportOptionLabel,
  reportPathOf,
  reportTitleOf,
} from './reportPaths';

/***
 * MARK: ReportNavigator
 * @description Responsive chooser for a task's stage reports. Two mutually
 *   exclusive presentations share one selection contract:
 *   - `< md`: a labelled `<select>` (44px touch target) so the report list
 *     never stacks above the report body and pushes the review content off
 *     the first screen. Long titles are confined to the option row, so they
 *     cannot force page-level horizontal scroll.
 *   - `>= md`: the original vertical sidebar list, unchanged.
 *   Both paths call `onSelect` with the report's anchor exactly as the report
 *   carries it; the parent canonicalises with `normalizeReportPath`, so a
 *   `./` re-sync still resolves to the same report.
 *
 *   Fail-safe behaviour: an empty/absent report list renders nothing (the
 *   parent shows its own empty state), a report with no `path`/`filename`
 *   yields an empty option value that the parent resolves to the first
 *   report, and a missing `commentCounts` map simply shows no badges instead
 *   of throwing.
 *
 * @param {Object} props
 * @param {Array} [props.reports] - Report records `{ path, filename, stageName, name, auto, timestamp }`.
 * @param {string|null} [props.activeReportPath] - Anchor of the selected report (either `./` spelling).
 * @param {Map<string, number>} [props.commentCounts] - Canonical path → unresolved count.
 * @param {Function} [props.onSelect] - (path: string) => void, fired by either presentation.
 * @example <ReportNavigator reports={reports} activeReportPath={p} commentCounts={counts} onSelect={setP} />
 ***/
export function ReportNavigator({
  reports = [],
  activeReportPath = null,
  commentCounts,
  onSelect,
}) {
  if (!Array.isArray(reports) || reports.length === 0) return null;
  const activeKey = normalizeReportPath(activeReportPath);
  const selectedReport = reports.find(
    (rep) => normalizeReportPath(reportPathOf(rep)) === activeKey && activeKey !== '',
  );
  const selectedValue = selectedReport ? reportPathOf(selectedReport) : activeReportPath || '';

  return (
    <>
      {/* Mobile: compact picker; the desktop sidebar below is display:none. */}
      <div className="block md:hidden w-full min-w-0 max-w-full">
        <label
          htmlFor="report-review-picker"
          className="block text-[11px] font-mono uppercase text-text-muted mb-1"
        >
          Reports ({reports.length})
        </label>
        <select
          id="report-review-picker"
          data-testid="report-review-picker"
          aria-label="Select a stage report"
          value={selectedValue}
          onChange={(e) => onSelect?.(e.target.value)}
          className="w-full max-w-full min-w-0 min-h-[44px] bg-surface border border-border-standard rounded px-2 py-2 text-xs font-mono text-on-surface cursor-pointer"
        >
          {reports.map((rep, index) => (
            <option
              key={`${reportPathOf(rep) || reportTitleOf(rep)}:${index}`}
              value={reportPathOf(rep)}
            >
              {reportOptionLabel(rep, commentCounts)}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: original vertical list (unchanged presentation). */}
      <aside
        aria-label="Stage reports list"
        className="hidden md:block w-full md:w-64 shrink-0 min-w-0"
        data-testid="report-review-list"
      >
        <div className="text-[11px] font-mono uppercase text-text-muted mb-2">
          Reports ({reports.length})
        </div>
        <ul className="space-y-1">
          {reports.map((rep, index) => {
            const path = reportPathOf(rep);
            const isSelected = normalizeReportPath(path) === activeKey && activeKey !== '';
            const count = reportBadgeCount(rep, commentCounts);
            return (
              <li key={`${path || reportTitleOf(rep)}:${index}`}>
                <button
                  type="button"
                  aria-current={isSelected ? 'true' : undefined}
                  onClick={() => onSelect?.(path)}
                  className={`w-full text-left p-2.5 rounded text-xs font-mono flex flex-col gap-0.5 border cursor-pointer ${
                    isSelected
                      ? 'bg-primary/15 text-primary border-primary/40 font-semibold'
                      : 'bg-surface hover:bg-surface-container text-on-surface border-transparent hover:border-border-standard'
                  }`}
                >
                  <span className="flex items-center justify-between gap-1 min-w-0">
                    <span className="truncate flex-1 font-bold text-[11px]">
                      {reportTitleOf(rep)}
                    </span>
                    {rep?.auto && (
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                        Auto
                      </span>
                    )}
                    {count > 0 && (
                      <span
                        className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-secondary/20 text-secondary"
                        title={`${count} unresolved comment(s)`}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  {(rep?.timestamp || rep?.createdAt) && (
                    <span className="text-[9px] text-text-muted truncate font-normal">
                      {rep.timestamp || rep.createdAt}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}

export default ReportNavigator;
