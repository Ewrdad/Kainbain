import { useMemo, useState } from 'react';
import { parseUnifiedDiff, groupCommentsForFile } from './diffParser';
import { ReviewCommentThread } from './ReviewCommentThread';
import { ReviewCommentComposer } from './ReviewCommentComposer';

/***
 * MARK: DiffView
 * @description Renders one file's unified diff MR-style: sticky file header
 *   (status chip, +/- counts, Viewed checkbox, collapse toggle, file-comment
 *   button), hunk headers, two line-number gutters, add/del/context styling,
 *   inline comment threads, and a hover gutter ⊕ button to start a line
 *   comment. Layout is unified (interleaved) for v1.
 *
 * @param {Object} props
 * @param {Object} props.file - { path, oldPath, status, additions, deletions, binary, tooLarge, diff }
 * @param {Array} props.comments - All review comments (filtered per file).
 * @param {Set} props.viewedFiles
 * @param {Function} props.onToggleViewed - (path) => void
 * @param {Function} props.onAddComment - (payload) => Promise  (useReview.addComment)
 * @param {Function} props.onReply - (commentId, body) => Promise
 * @param {Function} props.onUpdate - (commentId, updates) => Promise
 * @param {Function} props.onDelete - (commentId) => Promise
 * @param {string} props.headSha - Current review head; mismatch marks stale threads.
 * @param {boolean} [props.canComment] - False during non-human stages → read-only.
 ***/
export function DiffView({
  file,
  comments = [],
  viewedFiles,
  onToggleViewed,
  onReply,
  onUpdate,
  onDelete,
  addComment,
  headSha,
  canComment = true,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [composer, setComposer] = useState(null); // { line, side } | 'file'
  const isViewed = viewedFiles?.has?.(file.path) || false;

  const parsed = useMemo(() => parseUnifiedDiff(file.diff), [file.diff]);
  const grouped = useMemo(() => groupCommentsForFile(comments, file.path), [comments, file.path]);

  const statusChip = {
    added: 'bg-green-900/30 text-green-300 border-green-700/50',
    deleted: 'bg-red-900/30 text-red-300 border-red-700/60',
    renamed: 'bg-amber-900/30 text-amber-200 border-amber-700/60',
    modified: 'bg-surface-deep text-text-muted border-border-standard',
  };
  const statusChipClass =
    statusChip[file.status] || 'bg-surface-deep text-text-muted border-border-standard';

  const rowClassByType = {
    context: '',
    add: 'bg-green-900/20',
    del: 'bg-red-900/20',
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

  return (
    <div
      className="border border-border-standard rounded-sm overflow-hidden bg-surface-container"
      data-testid="diff-view"
      data-file-path={file.path}
    >
      {/* File header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-surface-container-high border-b border-border-standard flex-wrap">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand file diff' : 'Collapse file diff'}
          className="text-text-muted hover:text-primary cursor-pointer text-xs font-mono w-5"
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span
          className={`px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase ${statusChipClass}`}
        >
          {file.status}
        </span>
        <span className="text-xs font-mono text-on-surface break-all">
          {file.path}
          {file.oldPath && file.oldPath !== file.path && (
            <span className="text-text-muted"> ← {file.oldPath}</span>
          )}
        </span>
        {file.binary && (
          <span className="px-1.5 py-0.5 rounded bg-surface-deep border border-border-standard text-[10px] font-mono text-text-muted uppercase">
            Binary
          </span>
        )}
        {file.tooLarge && (
          <span className="px-1.5 py-0.5 rounded bg-warning/20 text-warning border border-warning/40 text-[10px] font-mono uppercase">
            Too large
          </span>
        )}
        <span className="text-[11px] font-mono text-green-400">+{file.additions}</span>
        <span className="text-[11px] font-mono text-red-400">−{file.deletions}</span>
        <div className="ml-auto flex items-center gap-2">
          {canComment && (
            <button
              type="button"
              onClick={() => setComposer((c) => (c === 'file' ? null : 'file'))}
              aria-label={`Comment on file ${file.path}`}
              className="text-[11px] font-mono text-text-muted hover:text-primary cursor-pointer"
            >
              💬 File comment
            </button>
          )}
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isViewed}
              onChange={() => onToggleViewed?.(file.path)}
              aria-label={`Mark ${file.path} as viewed`}
              className="accent-secondary cursor-pointer"
            />
            Viewed
          </label>
        </div>
      </div>

      {/* File-level comments + composer */}
      {!collapsed && (
        <div className="space-y-2">
          {(grouped.fileLevel || []).length > 0 && (
            <div className="px-3 pt-2 space-y-2">{grouped.fileLevel.map(renderThread)}</div>
          )}
          {composer === 'file' && (
            <div className="px-3 pt-2">
              <ReviewCommentComposer
                // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
                autoFocus
                label={`Comment on file ${file.path}`}
                onSubmit={async (body) => {
                  await addComment?.({
                    scope: 'file',
                    filePath: file.path,
                    headSha,
                    body,
                  });
                  setComposer(null);
                }}
                onCancel={() => setComposer(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* Body */}
      {collapsed ? (
        <div className="px-3 py-1.5 text-[11px] font-mono text-text-muted">
          Diff collapsed · {grouped.byLine?.size || 0} threads on lines
        </div>
      ) : file.binary ? (
        <div className="px-3 py-4 text-xs font-mono text-text-muted">Binary file not shown.</div>
      ) : file.tooLarge ? (
        <div className="px-3 py-4 text-xs font-mono text-text-muted">
          Diff too large to render ({file.additions + file.deletions} changed lines).
        </div>
      ) : !parsed.hasChanges ? (
        <div className="px-3 py-4 text-xs font-mono text-text-muted">
          No textual diff available for this file.
        </div>
      ) : (
        parsed.hunks.map((hunk, hunkIdx) => (
          <div key={hunkIdx} className={hunkIdx > 0 ? 'border-t border-border-standard' : ''}>
            {/* Hunk header */}
            <div className="px-3 py-1 bg-surface-deep text-[10px] font-mono text-text-muted border-b border-border-standard/60 flex items-center gap-2">
              <code>{hunk.header}</code>
              {hunk.section && <span className="opacity-70 truncate">{hunk.section}</span>}
            </div>
            {hunk.lines.map((line, lineIdx) => {
              const key = `${hunkIdx}-${lineIdx}`;
              const commentKey = commentAnchorKey(line.type, line.oldLine, line.newLine);
              const threads = (commentKey && grouped.byLine?.get(commentKey)) || [];
              const rowClass = `${rowClassByType[line.type] || ''} group flex items-start border-b border-border-standard/30 hover:bg-surface-deep/60`;
              const commentLine = line.type === 'del' ? line.oldLine : line.newLine;
              const commentSide = line.type === 'del' ? 'left' : 'right';
              return (
                <div key={key}>
                  <div
                    className={rowClass}
                    data-line={line.newLine ?? line.oldLine}
                    data-side={line.type === 'del' ? 'left' : 'right'}
                  >
                    <span className="w-12 shrink-0 select-none text-right pr-2 text-[10px] font-mono text-text-muted bg-surface-deep border-r border-border-standard/40">
                      {line.oldLine ?? ''}
                    </span>
                    <span className="w-12 shrink-0 select-none text-right pr-2 text-[10px] font-mono text-text-muted bg-surface-deep border-r border-border-standard">
                      {line.newLine ?? ''}
                    </span>
                    <span
                      className="w-4 shrink-0 select-none text-center text-[10px] font-mono"
                      aria-hidden="true"
                    >
                      {line.type === 'add' ? '+' : ''}
                      {line.type === 'del' ? '−' : ''}
                    </span>
                    <code className="flex-1 px-1 text-[11px] font-mono text-on-surface whitespace-pre-wrap break-all">
                      {line.text}
                    </code>
                    {canComment && line.type !== 'del' && (
                      <button
                        type="button"
                        onClick={() =>
                          setComposer({ line: line.newLine, side: 'right', lineText: line.text })
                        }
                        aria-label={`Add comment on new line ${line.newLine}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 text-primary cursor-pointer text-xs"
                      >
                        ⊕
                      </button>
                    )}
                    {canComment && line.type === 'del' && (
                      <button
                        type="button"
                        onClick={() =>
                          setComposer({ line: line.oldLine, side: 'left', lineText: line.text })
                        }
                        aria-label={`Add comment on old line ${line.oldLine}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 text-primary cursor-pointer text-xs"
                      >
                        ⊕
                      </button>
                    )}
                  </div>
                  {threads.length > 0 && (
                    <div className="px-3 py-1 space-y-1.5 border-l-2 border-secondary/40">
                      {threads.map(renderThread)}
                    </div>
                  )}
                  {composer &&
                    composer !== 'file' &&
                    composer.line === commentLine &&
                    composer.side === commentSide && (
                      <div className="px-3 py-1">
                        <ReviewCommentComposer
                          // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
                          autoFocus
                          label={`Comment on ${composer.side === 'left' ? 'old' : 'new'} line ${composer.line}`}
                          onSubmit={async (body) => {
                            await addComment?.({
                              scope: 'line',
                              filePath: file.path,
                              line: composer.line,
                              side: composer.side,
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
            })}
          </div>
        ))
      )}
    </div>
  );
}

/**
 * Map key under which inline comments are grouped for a diff line:
 * 'right:<newLine>' for add AND context lines (comments always anchor to the
 * new side, like GitHub), 'left:<oldLine>' for deletions.
 */
function commentAnchorKey(lineType, oldLine, newLine) {
  if (lineType === 'del') return `left:${oldLine}`;
  return `right:${newLine}`;
}
