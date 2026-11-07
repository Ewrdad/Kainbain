import { useMemo } from 'react';
import { MarkdownViewer, parseMarkdownBlocks } from '../common/MarkdownViewer';
import { ReviewCommentComposer } from './ReviewCommentComposer';
import {
  groupThreadsByBlock,
  blockIndexForLine,
  describeBlockKind,
  blockLineLabel,
} from './reportAnchors';

/***
 * MARK: ReportReadableView
 * @description Default reading pane for a stage report: the report rendered
 *   as a compact markdown document (no per-line dividers or gutters) with
 *   per-block anchored commenting. Each block shows a `⊕` comment button
 *   and a subtle `Lx–Ly` source-line chip on hover/focus only; the buttons
 *   are absolutely positioned overlays so they never stretch block height.
 *   Block comments reuse the line-comment payload contract with
 *   `line` = the block's first source line, so every pre-existing thread
 *   renders under the block spanning its line.
 * @param {Object} props
 * @param {string} props.reportContent - Raw markdown source.
 * @param {string} props.reportPath - Canonical report anchor for payloads.
 * @param {Array<string>} props.lines - Source lines (for `lineText` excerpts).
 * @param {Map} props.threadsByLine - Integer line → comment array.
 * @param {Array} [props.fileLevel] - Report-scoped (scope `file`) comments.
 * @param {Object|string|null} props.composer - Open composer state ({ line, lineText } | 'file' | null).
 * @param {Function} props.setComposer - Composer state setter.
 * @param {Function} [props.onSubmitLineComment] - (line, lineText, body) => Promise.
 * @param {Function} [props.onSubmitFileComment] - (body) => Promise.
 * @param {Function} props.renderThread - (comment) => ReactNode.
 * @param {boolean} [props.canComment] - False outside a human checkpoint → read-only.
 * @param {Object} [props.activeProject] - Used for in-app report image actions.
 * @param {string} [props.taskId] - Report-path context.
 * @example <ReportReadableView reportContent="# Plan" reportPath="p.md" lines={['# Plan']} threadsByLine={new Map()} renderThread={t} />
 ***/
export function ReportReadableView({
  reportContent = '',
  reportPath = '',
  lines = [],
  threadsByLine,
  fileLevel = [],
  composer = null,
  setComposer,
  onSubmitLineComment,
  onSubmitFileComment,
  renderThread,
  canComment = true,
  activeProject,
  taskId,
}) {
  // Fail-safe: if the markdown is so large or malformed that the
  // parser throws (e.g. pathological regex input), show a fallback
  // instead of crashing the entire review pane. The raw-lines mode
  // in the parent still works because it splits on newlines only.
  const { blocks, parseError } = useMemo(() => {
    try {
      return { blocks: parseMarkdownBlocks(reportContent), parseError: null };
    } catch (err) {
      return { blocks: [], parseError: err?.message || 'Failed to parse markdown' };
    }
  }, [reportContent]);
  const { byIndex, unplaced } = useMemo(
    () => groupThreadsByBlock(blocks, threadsByLine),
    [blocks, threadsByLine],
  );
  const composerIndex =
    composer && composer !== 'file' ? blockIndexForLine(blocks, composer.line) : -1;

  const fileThreads = (
    <>
      {fileLevel.map(renderThread)}
      {composer === 'file' && (
        <ReviewCommentComposer
          // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
          autoFocus
          label={`Comment on report ${reportPath}`}
          onSubmit={async (body) => {
            await onSubmitFileComment?.(body);
          }}
          onCancel={() => setComposer?.(null)}
        />
      )}
    </>
  );

  const reportCommentAffordance = canComment && composer !== 'file' && (
    <div className="w-full min-w-0 max-w-full px-2 sm:px-3 py-2">
      <button
        type="button"
        onClick={() => setComposer?.('file')}
        aria-label={`Comment on report ${reportPath}`}
        className="text-[11px] font-mono text-text-muted hover:text-primary cursor-pointer min-h-[44px] inline-flex items-center"
      >
        💬 Report comment
      </button>
    </div>
  );

  if (parseError) {
    return (
      <div data-testid="report-readable-pane" className="w-full min-w-0 max-w-full">
        {(fileLevel.length > 0 || composer === 'file') && (
          <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-2 space-y-2 border-l-2 border-secondary/40">
            {fileThreads}
          </div>
        )}
        <div className="px-3 py-4 text-xs font-mono text-text-muted">
          Unable to render this report as markdown ({parseError}). Switch to Raw lines to review it.
        </div>
        {unplaced.length > 0 && (
          <div className="px-2 sm:px-3 py-2 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Earlier line comments
            </div>
            {unplaced.map(renderThread)}
          </div>
        )}
        {reportCommentAffordance}
      </div>
    );
  }

  if (!reportContent || reportContent.length === 0) {
    return (
      <div data-testid="report-readable-pane" className="w-full min-w-0 max-w-full">
        {(fileLevel.length > 0 || composer === 'file') && (
          <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-2 space-y-2 border-l-2 border-secondary/40">
            {fileThreads}
          </div>
        )}
        <div className="px-3 py-4 text-sm text-text-muted">
          This report has no content to review.
        </div>
        {unplaced.length > 0 && (
          <div className="px-2 sm:px-3 py-2 space-y-1.5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Earlier line comments
            </div>
            {unplaced.map(renderThread)}
          </div>
        )}
        {reportCommentAffordance}
      </div>
    );
  }

  return (
    <div data-testid="report-readable-pane" className="w-full min-w-0 max-w-full">
      {(fileLevel.length > 0 || composer === 'file') && (
        <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-2 space-y-2 border-l-2 border-secondary/40">
          {fileThreads}
        </div>
      )}
      <div className="px-1.5 sm:px-2.5 py-1.5 min-w-0 max-w-full">
        <MarkdownViewer
          content={reportContent}
          projectId={activeProject?.id || null}
          taskId={taskId || null}
          className="min-w-0 max-w-full break-words"
          renderBlockWrapper={(block, rendered, index) => {
            const threads = byIndex.get(index) || [];
            const showComposer = composerIndex === index;
            const kind = describeBlockKind(block);
            const lineRef =
              block.startLine === block.endLine
                ? `line ${block.startLine}`
                : `lines ${block.startLine} to ${block.endLine}`;
            return (
              <div
                key={`readable-block-${block.startLine}-${block.endLine}-${index}`}
                data-testid="report-block"
                data-block-id={`report-block-${block.startLine}-${block.endLine}`}
                data-start-line={block.startLine}
                data-end-line={block.endLine}
                className="group relative rounded-sm px-1.5 sm:px-2 py-1 transition-colors motion-reduce:transition-none hover:bg-surface-container-high/60 focus-within:bg-surface-container-high/60"
              >
                <div className="min-w-0 max-w-full">{rendered}</div>
                {canComment && (
                  <div className="absolute right-1 top-1 flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-within:opacity-100">
                    <span
                      aria-hidden="true"
                      title={`Source ${lineRef}`}
                      className="select-none rounded border border-border-standard/60 bg-surface px-1 py-px text-[10px] text-text-muted font-mono"
                    >
                      {blockLineLabel(block)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setComposer?.({
                          line: block.startLine,
                          lineText: lines[block.startLine - 1] ?? '',
                        })
                      }
                      aria-label={`Add comment on ${kind}, ${lineRef}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border border-border-standard/60 bg-surface px-2 py-0.5 text-xs text-primary cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      ⊕
                    </button>
                  </div>
                )}
                {threads.length > 0 && (
                  <div className="mt-1 w-full min-w-0 max-w-full overflow-hidden space-y-1.5 border-l-2 border-secondary/40 pl-2 sm:pl-3">
                    {threads.map(renderThread)}
                  </div>
                )}
                {showComposer && (
                  <div className="mt-1 w-full min-w-0 max-w-full overflow-hidden">
                    <ReviewCommentComposer
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
                      autoFocus
                      label={`Comment on ${kind}, ${lineRef}`}
                      onSubmit={async (body) => {
                        await onSubmitLineComment?.(
                          composer.line,
                          composer.lineText,
                          body,
                        );
                      }}
                      onCancel={() => setComposer?.(null)}
                    />
                  </div>
                )}
              </div>
            );
          }}
        />
      </div>
      {unplaced.length > 0 && (
        <div className="px-2 sm:px-3 py-2 space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Earlier line comments
          </div>
          {unplaced.map(renderThread)}
        </div>
      )}
      {reportCommentAffordance}
    </div>
  );
}

/***
 * MARK: ReportReadableView default export
 * @description Default entry point for the readable report pane (same component).
 * @example import ReportReadableView from './ReportReadableView';
 ***/
export default ReportReadableView;
