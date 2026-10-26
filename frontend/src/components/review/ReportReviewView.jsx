import { useMemo, useState } from 'react';
import { MarkdownViewer } from '../common/MarkdownViewer';
import { ReviewCommentThread } from './ReviewCommentThread';
import { ReviewCommentComposer } from './ReviewCommentComposer';
import { copyToClipboard } from '../../services/clipboard';
import { getSilverBulletUrl } from '../tasks/taskFormatters';
import { normalizeReportPath } from './reportPaths';

// Backwards-compatible re-export: report identity lives in `reportPaths.js`
// (shared with ReportNavigator and TaskReviewPage), but existing importers may
// still reach for it here.
export { normalizeReportPath } from './reportPaths';

/***
 * MARK: ReportReviewView
 * @description Current-state review pane for a stage report (markdown) that
 *   lives outside the task's git diff (centralised docs). Instead of a diff,
 *   it shows the report exactly as written with one row per line, a hover `⊕`
 *   gutter button to open a line comment, and inline comment threads — plus a
 *   Rendered Preview toggle. Report-level comments (scope `file`) render at
 *   the top. Comment anchors carry the report path, so the same sidecar store
 *   used for code review keeps them without touching git.
 *
 * @param {Object} props
 * @param {Object} props.report - { path, filename, name, stageName, content, auto, timestamp }
 * @param {Array} [props.comments] - All review comments (filtered to this report).
 * @param {Function} [props.addComment] - (payload) => Promise (useReview.addComment)
 * @param {Function} [props.onReply] - (commentId, body) => Promise
 * @param {Function} [props.onUpdate] - (commentId, updates) => Promise
 * @param {Function} [props.onDelete] - (commentId) => Promise
 * @param {boolean} [props.canComment] - False outside a human checkpoint → read-only.
 * @param {string} [props.headSha] - Review head; older threads get an "Outdated" badge.
 * @param {Object} [props.activeProject] - For the SilverBullet deep link.
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
  const [mode, setMode] = useState('lines'); // 'lines' | 'preview'
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

  const silverBulletUrl = reportPath ? getSilverBulletUrl(activeProject?.name, reportPath) : null;

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
              aria-pressed={mode === 'lines'}
              onClick={() => setMode('lines')}
              className={`px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center text-[10px] font-mono uppercase cursor-pointer ${
                mode === 'lines' ? 'bg-primary/20 text-primary' : 'bg-surface text-text-muted'
              }`}
            >
              Line Review
            </button>
            <button
              type="button"
              aria-pressed={mode === 'preview'}
              onClick={() => setMode('preview')}
              className={`px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center text-[10px] font-mono uppercase cursor-pointer ${
                mode === 'preview' ? 'bg-primary/20 text-primary' : 'bg-surface text-text-muted'
              }`}
            >
              Rendered Preview
            </button>
          </div>
          {silverBulletUrl && (
            <a
              href={silverBulletUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in Notes"
              className="px-2.5 py-1.5 min-h-[44px] inline-flex items-center justify-center bg-surface hover:bg-surface-container-high border border-border-standard text-primary rounded text-[10px] uppercase font-bold cursor-pointer"
            >
              📝 Notes
            </a>
          )}
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

      {mode === 'preview' ? (
        <div
          className="p-2.5 sm:p-4 min-w-0 max-w-full overflow-x-hidden"
          data-testid="report-preview-pane"
        >
          <MarkdownViewer
            content={reportContent || '*(No report content available)*'}
            projectId={activeProject?.id || null}
            taskId={taskId || null}
            className="min-w-0 max-w-full break-words"
          />
        </div>
      ) : (
        <div className="divide-y divide-border-standard/30 w-full min-w-0 max-w-full overflow-x-hidden">
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
                    await addComment?.({
                      scope: 'file',
                      filePath: reportPath,
                      headSha,
                      body,
                    });
                    setComposer(null);
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
              return (
                <div key={lineNumber} className="w-full min-w-0 max-w-full">
                  <div
                    data-testid="report-line"
                    data-line={lineNumber}
                    className="group flex items-start w-full min-w-0 max-w-full overflow-hidden hover:bg-surface-deep/60"
                  >
                    <span className="w-9 sm:w-12 shrink-0 select-none text-right pr-2 py-0.5 text-[9px] sm:text-[10px] font-mono text-text-muted bg-surface-deep border-r border-border-standard/40">
                      {lineNumber}
                    </span>
                    <code className="flex-1 min-w-0 max-w-full px-2 py-0.5 text-[11px] font-mono text-on-surface whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
                      {line || '\u00A0'}
                    </code>
                    {canComment && (
                      <button
                        type="button"
                        onClick={() => setComposer({ line: lineNumber, lineText: line })}
                        aria-label={`Add comment on report line ${lineNumber}`}
                        className="shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 focus:opacity-100 px-2 py-0.5 min-h-[44px] min-w-[44px] text-primary cursor-pointer text-xs"
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
                  {composer && composer !== 'file' && composer.line === lineNumber && (
                    <div className="w-full min-w-0 max-w-full overflow-hidden px-2 sm:px-3 py-1">
                      <ReviewCommentComposer
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
                        autoFocus
                        label={`Comment on report line ${lineNumber}`}
                        onSubmit={async (body) => {
                          await addComment?.({
                            scope: 'line',
                            filePath: reportPath,
                            line: lineNumber,
                            side: 'right',
                            headSha,
                            lineText: composer.lineText,
                            body,
                          });
                          setComposer(null);
                        }}
                        onCancel={() => setComposer(null)}
                      />
                    </div>
                  )}
                </div>
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
