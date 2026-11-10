import React from 'react';

/***
 * MARK: ReportLineRow
 * @description One numbered source line in the Raw-lines review mode, with
 *   its inline threads and composer. The `⊕` comment button is
 *   absolutely positioned (overlay) so it never contributes to row height —
 *   rows size to their text content instead of the 44px touch target.
 * @param {Object} props
 * @param {number} props.lineNumber - 1-based source line number.
 * @param {string} props.lineText - Raw source line text.
 * @param {Array} [props.threads] - Line-scoped comments for this line.
 * @param {boolean} [props.composerOpen] - Whether the composer shows below this row.
 * @param {boolean} [props.canComment] - False outside a human checkpoint → read-only.
 * @param {Function} [props.onOpenComposer] - (lineNumber, lineText) => void.
 * @param {Function} props.renderThread - (comment) => ReactNode.
 * @param {React.ReactNode} [props.composer] - Composer element when open.
 * @example <ReportLineRow lineNumber={3} lineText="Ship it" threads={[]} renderThread={renderThread} />
 ***/
export function ReportLineRow({
  lineNumber,
  lineText,
  threads = [],
  composerOpen = false,
  canComment = true,
  onOpenComposer,
  renderThread,
  composer = null,
}) {
  return (
    <div className="w-full min-w-0 max-w-full">
      <div
        data-testid="report-line"
        data-line={lineNumber}
        className="group relative flex items-start w-full min-w-0 max-w-full overflow-hidden hover:bg-surface-deep/60"
      >
        <span className="w-9 sm:w-12 shrink-0 select-none text-right pr-2 py-0.5 text-[9px] sm:text-[10px] font-mono text-text-muted bg-surface-deep border-r border-border-standard/40">
          {lineNumber}
        </span>
        <code className="flex-1 min-w-0 max-w-full px-2 py-0.5 pr-12 text-[11px] font-mono text-on-surface whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
          {lineText || ' '}
        </code>
        {canComment && (
          <button
            type="button"
            onClick={() => onOpenComposer?.(lineNumber, lineText)}
            aria-label={`Add comment on report line ${lineNumber}`}
            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 focus:opacity-100 px-2 py-0.5 min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-primary cursor-pointer text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            ⊕
          </button>
        )}
      </div>
      {threads.length > 0 && (
        <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-1 space-y-1.5 border-l-2 border-secondary/40">
          {threads.map(renderThread)}
        </div>
      )}
      {composerOpen && (
        <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-1">
          {composer}
        </div>
      )}
    </div>
  );
}

/***
 * MARK: ReportLineRow default export
 * @description Default entry point for the raw-mode report row (same component).
 * @example import ReportLineRow from './ReportLineRow';
 ***/
export default ReportLineRow;
