import React, { useState, useMemo, useEffect } from 'react';
import { MarkdownViewer } from '../common/MarkdownViewer';
import { InfoTooltip } from '../common/InfoTooltip';
import { getSilverBulletUrl } from '../tasks/taskFormatters';

/***
 * MARK: ReportViewer
 * @description Reusable full-featured report viewer for inspecting structured markdown stage reports.
 * Features a sidebar list of all stage reports with filenames and timestamps, a full-width markdown reading pane,
 * previous/next report navigation, path & content clipboard copy actions, and SilverBullet note deep-linking.
 *
 * @param {Object} props
 * @param {Array<Object>} [props.reports=[]] - List of report objects.
 * @param {boolean} [props.loading=false] - Whether reports are currently loading.
 * @param {Object} [props.activeProject] - Active project object for SilverBullet URL resolution.
 * @param {string} [props.taskId] - Task ID for fallback path generation.
 * @param {number} [props.initialSelectedIndex=0] - Starting report index.
 * @param {Function} [props.onSelectReport] - Optional callback when active report changes.
 * @param {string} [props.className=''] - Optional outer container class names.
 * @param {string} [props.emptyStateMessage] - Optional custom empty state message.
 * @example <ReportViewer reports={taskReports} activeProject={activeProject} taskId={task.id} />
 ***/
export function ReportViewer({
  reports = [],
  loading = false,
  activeProject,
  taskId = '',
  initialSelectedIndex = 0,
  onSelectReport,
  className = '',
  emptyStateMessage,
}) {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  // Deduplicate and normalize reports list
  const normalizedReports = useMemo(() => {
    const list = Array.isArray(reports) ? reports : reports?.reports || [];
    const seen = new Set();
    const result = [];
    for (const r of list) {
      if (!r) continue;
      const key = r.filename || r.name || r.path;
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(r);
      } else if (!key) {
        result.push(r);
      }
    }
    return result;
  }, [reports]);

  const activeIndex =
    normalizedReports.length > 0
      ? Math.min(Math.max(0, selectedIndex), normalizedReports.length - 1)
      : 0;

  const currentReport = normalizedReports[activeIndex] || null;

  const handleSelect = (idx) => {
    setSelectedIndex(idx);
    if (onSelectReport && normalizedReports[idx]) {
      onSelectReport(normalizedReports[idx], idx);
    }
  };

  const handlePrev = () => {
    if (activeIndex > 0) {
      handleSelect(activeIndex - 1);
    }
  };

  const handleNext = () => {
    if (activeIndex < normalizedReports.length - 1) {
      handleSelect(activeIndex + 1);
    }
  };

  const reportPath =
    currentReport?.path ||
    (currentReport?.filename && taskId
      ? `./docs/tasks/${taskId}/${currentReport.filename}`
      : currentReport?.filename || currentReport?.name || '');

  const reportContent =
    currentReport?.content || (typeof currentReport === 'string' ? currentReport : '');

  const handleCopyPath = () => {
    if (navigator.clipboard && reportPath) {
      navigator.clipboard.writeText(reportPath);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleCopyMarkdown = () => {
    if (navigator.clipboard && reportContent) {
      navigator.clipboard.writeText(reportContent);
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    }
  };

  const silverBulletUrl = getSilverBulletUrl(activeProject?.name, reportPath);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex flex-col items-center justify-center p-8 bg-surface-container border border-border-standard rounded-sm text-text-muted text-xs font-mono min-h-[240px] ${className}`}
      >
        <span className="inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
        <span>Loading stage reports...</span>
      </div>
    );
  }

  if (normalizedReports.length === 0) {
    return (
      <div
        role="region"
        aria-label="Report Viewer Empty State"
        className={`p-6 bg-surface-container border border-dashed border-border-standard rounded-sm text-center space-y-2 ${className}`}
      >
        <div className="text-2xl" aria-hidden="true">
          📄
        </div>
        <p className="text-xs text-text-muted leading-relaxed font-mono font-medium">
          {emptyStateMessage || 'No markdown reports generated yet.'}
        </p>
        <p className="text-[10px] text-text-muted">
          Reports are automatically saved to{' '}
          <code className="font-mono text-primary">
            ./docs/tasks/{taskId || '<taskId>'}/&lt;stage-name&gt;-&lt;timestamp&gt;.md
          </code>{' '}
          when each pipeline stage execution completes.
        </p>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Stage Report Viewer"
      className={`flex flex-col md:flex-row border border-border-standard bg-surface-container-low rounded-sm overflow-hidden min-h-[360px] ${className}`}
    >
      {/* Sidebar list of reports */}
      <aside
        aria-label="Stage reports list"
        className="w-full md:w-56 lg:w-64 shrink-0 bg-surface border-b md:border-b-0 md:border-r border-border-standard flex flex-col"
      >
        <div className="p-2.5 border-b border-border-standard bg-surface-container flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface font-mono">
              Reports
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-primary/15 text-primary rounded-full font-bold">
              {normalizedReports.length}
            </span>
          </div>
          <span className="text-[9px] font-mono text-text-muted">All stages</span>
        </div>

        {/* div, not nav: a tablist is its own landmark-grade widget (WCAG 4.1.2). */}
        <div
          role="tablist"
          aria-label="Reports list"
          className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1 max-h-[180px] md:max-h-none"
        >
          {normalizedReports.map((rep, idx) => {
            const isSelected = activeIndex === idx;
            const displayName =
              rep.stageName ||
              rep.name ||
              rep.filename ||
              (rep.path ? rep.path.split('/').pop() : `Report ${idx + 1}`);
            const displayTimestamp = rep.timestamp || rep.createdAt || '';

            return (
              <button
                key={rep.filename || rep.path || idx}
                id={`report-tab-${idx}`}
                role="tab"
                type="button"
                aria-selected={isSelected}
                aria-controls={`report-panel-${idx}`}
                onClick={() => handleSelect(idx)}
                className={`w-full text-left p-2.5 rounded text-xs font-mono transition-colors cursor-pointer flex flex-col gap-0.5 border ${
                  isSelected
                    ? 'bg-primary/15 text-primary border-primary/40 shadow-sm font-semibold'
                    : 'bg-surface hover:bg-surface-container text-on-surface border-transparent hover:border-border-standard'
                }`}
              >
                <div className="flex items-center justify-between gap-1 min-w-0">
                  <span className="truncate flex-1 font-bold text-[11px]" title={displayName}>
                    {displayName}
                  </span>
                  {rep.auto && (
                    <span
                      className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                      title="Auto-generated by the AI pipeline"
                    >
                      Auto
                    </span>
                  )}
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                </div>
                {displayTimestamp && (
                  <span className="text-[9px] text-text-muted truncate font-normal">
                    {displayTimestamp}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main reading pane */}
      <section
        id={`report-panel-${activeIndex}`}
        role="tabpanel"
        aria-labelledby={`report-tab-${activeIndex}`}
        className="flex-1 flex flex-col min-w-0 bg-surface-deep overflow-hidden"
      >
        {/* Top Action Toolbar */}
        <header className="p-2.5 bg-surface-container border-b border-border-standard flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          {/* Previous / Next navigation */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              disabled={activeIndex <= 0}
              onClick={handlePrev}
              aria-label="Previous report"
              className="px-2.5 py-1.5 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard rounded text-[10px] uppercase font-bold text-on-surface hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              <span>←</span>
              <span>Prev</span>
            </button>
            <span className="text-[10px] text-text-muted font-mono px-1">
              {activeIndex + 1} / {normalizedReports.length}
            </span>
            <button
              type="button"
              disabled={activeIndex >= normalizedReports.length - 1}
              onClick={handleNext}
              aria-label="Next report"
              className="px-2.5 py-1.5 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard rounded text-[10px] uppercase font-bold text-on-surface hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
            >
              <span>Next</span>
              <span>→</span>
            </button>
          </div>

          {/* Report Path */}
          <div className="truncate text-text-muted text-[11px] min-w-0 flex-1 px-1">
            <span className="text-primary font-bold">Path: </span>
            <span className="text-on-surface font-mono" title={reportPath}>
              {reportPath || '—'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {reportPath && (
              <InfoTooltip
                title="SilverBullet Notes"
                description="Opens this markdown report in your local SilverBullet notes workspace."
                position="top"
              >
                <a
                  href={silverBulletUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Open in SilverBullet"
                  className="px-2.5 py-1.5 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard text-primary hover:text-primary rounded text-[10px] uppercase font-bold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>📝</span>
                  <span className="hidden sm:inline">SilverBullet</span>
                </a>
              </InfoTooltip>
            )}

            {reportPath && (
              <button
                type="button"
                onClick={handleCopyPath}
                aria-label="Copy report path"
                className="px-2.5 py-1.5 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard text-text-muted hover:text-on-surface rounded text-[10px] uppercase font-bold shrink-0 transition-colors cursor-pointer"
              >
                {copiedPath ? 'Copied ✓' : 'Copy Path'}
              </button>
            )}

            {reportContent && (
              <button
                type="button"
                onClick={handleCopyMarkdown}
                aria-label="Copy markdown content"
                className="px-2.5 py-1.5 min-h-[44px] bg-surface hover:bg-surface-container-high border border-border-standard text-text-muted hover:text-on-surface rounded text-[10px] uppercase font-bold shrink-0 transition-colors cursor-pointer"
              >
                {copiedMarkdown ? 'Copied ✓' : 'Copy Markdown'}
              </button>
            )}
          </div>
        </header>

        {/* Report Content Body: keyboard-focusable scroll region (WCAG 2.1.1). */}
        <div
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable region
          tabIndex={0}
          role="region"
          aria-label="Report content body"
          className="flex-1 p-4 overflow-y-auto custom-scrollbar font-mono text-xs text-on-surface leading-relaxed select-text min-h-[220px]"
        >
          <div className="text-secondary font-bold mb-3 pb-1.5 border-b border-border-standard flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs uppercase tracking-wide flex items-center gap-2">
              {currentReport?.stageName ||
                currentReport?.name ||
                currentReport?.filename ||
                'Stage Markdown Report'}
              {currentReport?.auto && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary"
                  title="Auto-generated by the AI pipeline"
                >
                  Auto
                </span>
              )}
            </span>
            {(currentReport?.timestamp || currentReport?.createdAt) && (
              <span className="text-[10px] text-text-muted font-normal">
                {currentReport.timestamp || currentReport.createdAt}
              </span>
            )}
          </div>
          <MarkdownViewer
            content={reportContent || '*(No report content available)*'}
            projectId={activeProject?.id || null}
            taskId={taskId || null}
          />
        </div>
      </section>
    </div>
  );
}

export default ReportViewer;
