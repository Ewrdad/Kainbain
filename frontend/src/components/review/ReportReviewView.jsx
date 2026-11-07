import { useMemo, useState } from 'react';
import { ReviewCommentThread } from './ReviewCommentThread';
import { ReviewCommentComposer } from './ReviewCommentComposer';
import { ReportLineRow } from './ReportLineRow';
import { ReportReadableView } from './ReportReadableView';
import { copyToClipboard } from '../../services/clipboard';
import { normalizeReportPath } from './reportPaths';

// Backwards-compatible re-export: report identity lives in `reportPaths.js`
// (shared with ReportNavigator and TaskReviewPage), but existing importers may
// still reach for it here.
export { normalizeReportPath } from './reportPaths';

/***
 * MARK: ReportReviewView
 * @description Review pane for a stage report (markdown) that lives outside
 *   the task's git diff (centralised docs). It opens in a Readable mode that
 *   renders the report as a compact markdown document — no per-line
 *   dividers, no gutter numbers, hover/focus-only block highlights — with a
 *   hover `⊕` comment button per block (line-chip `Lx–Ly` for traceability).
 *   Raw lines mode keeps the one-row-per-line view with per-line `⊕`
 *   buttons as the escape hatch. Block comments reuse the line-comment
 *   payload (`scope: 'line'`, integer `line` = block start line,
 *   `side: 'right'`, `lineText`); report-level comments (scope `file`)
 *   render at the top. Comment anchors carry the report path, so the same
 *   sidecar store used for code review keeps them without touching git.
 *   In both modes the `⊕` buttons are absolutely-positioned overlays, so
 *   rows size to their content instead of the 44px touch target.
 * @param {Object} props
 * @param {Object} props.report - { path, filename, name, stageName, content, auto, timestamp }
 * @param {Array} [props.comments] - All review comments (filtered to this report).
 * @param {Function} [props.addComment] - (payload) => Promise (useReview.addComment)
 * @param {Function} [props.onReply] - (commentId, body) => Promise
 * @param {Function} [props.onUpdate] - (commentId, updates) => Promise
 * @param {Function} [props.onDelete] - (commentId) => Promise
 * @param {boolean} [props.canComment] - False outside a human checkpoint → read-only.
 * @param {string} [props.headSha] - Review head; older threads get an "Outdated" badge.
 * @param {Object} [props.activeProject] - Active project object (used for in-app report actions).
 * @param {string} [props.taskId] - Fallback report-path context.
 * @example <ReportReviewView report={r} comments={comments} addComment={add} canComment />
 ***/
export function ReportReviewView({
  report,
  comments = [],
  addComment,
  onReply,
  onUpdate,
  onDelete,
  canComment = true,
  headSha,
  activeProject,
  taskId,
}) {
  const [mode, setMode] = useState('readable'); // 'readable' | 'raw'
  const [composer, setComposer] = useState(null); // { line, lineText } | 'file' | null
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);

  const reportPath =
    report?.path ||
    (report?.filename && taskId
      ? `./docs/tasks/${taskId}/${report.filename}`
      : report?.filename || '');
  const reportContent = report?.content || '';
  const reportTitle = report?.stageName || report?.name || report?.filename || 'Stage report';
  const reportTimestamp = report?.timestamp || report?.createdAt || '';

  // Split on CRLF as well as LF: reports synced from Windows checkouts or
  // notes stores can carry `\r`, which would otherwise leak into the
  // displayed line and break the submitted `lineText` excerpt.
  const lines = useMemo(() => reportContent.split(/\r?\n/), [reportContent]);

  // Only this report's threads, regardless of the `./` spelling stored.
  const reportComments = useMemo(() => {
    const target = normalizeReportPath(reportPath);
    if (!target) return [];
    return (comments || []).filter((c) => normalizeReportPath(c?.filePath) === target);
  }, [comments, reportPath]);

  const { fileLevel, byLine } = useMemo(() => {
    const fileComments = [];
    const lineComments = new Map();
    for (const comment of reportComments) {
      if (comment.scope === 'line' && Number.isInteger(comment.line)) {
        if (!lineComments.has(comment.line)) lineComments.set(comment.line, []);
        lineComments.get(comment.line).push(comment);
      } else {
        fileComments.push(comment);
      }
    }
    return { fileLevel: fileComments, byLine: lineComments };
  }, [reportComments]);

  // Shared submit builders: both modes send identical payload shapes.
  const submitLineComment = async (line, lineText, body) => {
    await addComment?.({
      scope: 'line',
      filePath: reportPath,
      line,
      side: 'right',
      headSha,
      lineText,
      body,
    });
    setComposer(null);
  };

  const submitFileComment = async (body) => {
    await addComment?.({
      scope: 'file',
      filePath: reportPath,
      headSha,
      body,
    });
    setComposer(null);
  };

  const handleCopyPath = async () => {
    if (!reportPath) return;
    const ok = await copyToClipboard(reportPath);
    if (ok) {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    }
  };

  const handleCopyMarkdown = async () => {
    if (!reportContent) return;
    const ok = await copyToClipboard(reportContent);
    if (ok) {
      setCopiedMarkdown(true);
      setTimeout(() => setCopiedMarkdown(false), 2000);
    }
  };

  const renderThread = (comment) => (
    <ReviewCommentThread
      key={comment.id}
      comment={comment}
      stale={Boolean(comment.headSha && headSha && String(comment.headSha) !== String(headSha))}
      canResolve={canComment}
      onReply={onReply}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />
  );

  if (!report) {
    return (
      <div data-testid="report-review-view" className="p-6 text-xs font-mono text-text-muted">
        Select a report to review.
      </div>
    );
  }

  return (
    <div
      data-testid="report-review-view"
      data-report-path={reportPath}
      className="w-full min-w-0 max-w-full border border-border-standard rounded-sm overflow-hidden overflow-x-hidden bg-surface-container"
    >
      {/* Report header: identity, mode toggle, and copy/link actions. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-2 sm:px-3 py-2 bg-surface-container-high border-b border-border-standard flex-wrap w-full min-w-0 max-w-full overflow-x-hidden">
        {report.auto && (
          <span
            className="shrink-0 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-mono uppercase"
            title="Auto-generated by the AI pipeline"
          >
            Auto
          </span>
        )}
        <span
          className="min-w-0 flex-1 truncate text-xs font-mono text-on-surface"
          title={reportPath || reportTitle}
        >
          {reportPath || reportTitle}
        </span>
        {reportTimestamp && (
          <span className="shrink-0 text-[10px] font-mono text-text-muted">{reportTimestamp}</span>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap min-w-0 max-w-full">
          <div
            role="group"
            aria-label="Report view mode"
            className="flex items-center border border-border-standard rounded overflow-hidden"
          >
            <button
              type="button"
              aria-pressed={mode === 'readable'}
              onClick={() => setMode('readable')}
              className={`px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center text-[10px] font-mono uppercase cursor-pointer ${
                mode === 'readable' ? 'bg-primary/20 text-primary' : 'bg-surface text-text-muted'
              }`}
            >
              Readable
            </button>
            <button
              type="button"
              aria-pressed={mode === 'raw'}
              onClick={() => setMode('raw')}
              className={`px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center text-[10px] font-mono uppercase cursor-pointer ${
                mode === 'raw' ? 'bg-primary/20 text-primary' : 'bg-surface text-text-muted'
              }`}
            >
              Raw lines
            </button>
          </div>
          {reportPath && (
            <button
              type="button"
              onClick={handleCopyPath}
              aria-label="Copy report path"
              className="px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center bg-surface hover:bg-surface-container-high border border-border-standard text-text-muted hover:text-on-surface rounded text-[10px] uppercase font-bold cursor-pointer"
            >
              {copiedPath ? 'Copied ✓' : 'Copy Path'}
            </button>
          )}
          {reportContent && (
            <button
              type="button"
              onClick={handleCopyMarkdown}
              aria-label="Copy markdown content"
              className="px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center bg-surface hover:bg-surface-container-high border border-border-standard text-text-muted hover:text-on-surface rounded text-[10px] uppercase font-bold cursor-pointer"
            >
              {copiedMarkdown ? 'Copied ✓' : 'Copy Markdown'}
            </button>
          )}
        </div>
      </div>

      {mode === 'readable' ? (
        <ReportReadableView
          reportContent={reportContent}
          reportPath={reportPath}
          lines={lines}
          threadsByLine={byLine}
          fileLevel={fileLevel}
          composer={composer}
          setComposer={setComposer}
          onSubmitLineComment={submitLineComment}
          onSubmitFileComment={submitFileComment}
          renderThread={renderThread}
          canComment={canComment}
          activeProject={activeProject}
          taskId={taskId}
        />
      ) : (
        <div className="w-full min-w-0 max-w-full overflow-x-hidden">
          {/* Report-level threads + composer */}
          {(fileLevel.length > 0 || composer === 'file') && (
            <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-2 space-y-2 border-l-2 border-secondary/40">
              {fileLevel.map(renderThread)}
              {composer === 'file' && (
                <ReviewCommentComposer
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
                  autoFocus
                  label={`Comment on report ${reportPath}`}
                  onSubmit={async (body) => {
                    await submitFileComment(body);
                  }}
                  onCancel={() => setComposer(null)}
                />
              )}
            </div>
          )}

          {reportContent.length === 0 ? (
            <div className="px-3 py-4 text-xs font-mono text-text-muted">
              This report has no content to review.
            </div>
          ) : (
            lines.map((line, index) => {
              const lineNumber = index + 1;
              const threads = byLine.get(lineNumber) || [];
              const composerOpen =
                composer && composer !== 'file' && composer.line === lineNumber;
              return (
                <ReportLineRow
                  key={lineNumber}
                  lineNumber={lineNumber}
                  lineText={line}
                  threads={threads}
                  composerOpen={composerOpen}
                  canComment={canComment}
                  onOpenComposer={(lineNo, lineText) =>
                    setComposer({ line: lineNo, lineText })
                  }
                  renderThread={renderThread}
                  composer={
                    composerOpen && (
                      <ReviewCommentComposer
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
                        autoFocus
                        label={`Comment on report line ${lineNumber}`}
                        onSubmit={async (body) => {
                          await submitLineComment(
                            lineNumber,
                            composer.lineText,
                            body,
                          );
                        }}
                        onCancel={() => setComposer(null)}
                      />
                    )
                  }
                />
              );
            })
          )}

          {/* Report-level comment affordance, kept below the body. */}
          {canComment && composer !== 'file' && (
            <div className="w-full min-w-0 max-w-full px-2 sm:px-3 py-2">
              <button
                type="button"
                onClick={() => setComposer('file')}
                aria-label={`Comment on report ${reportPath}`}
                className="text-[11px] font-mono text-text-muted hover:text-primary cursor-pointer min-h-[44px] inline-flex items-center"
              >
                💬 Report comment
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ReportReviewView;
