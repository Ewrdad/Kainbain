import { useState } from 'react';
import { ReviewCommentComposer } from './ReviewCommentComposer';

/***
 * MARK: ReviewCommentThread
 * @description Renders one comment thread inline in the diff view: the root
 *   comment bubble (with "Outdated" stale badge when headSha no longer matches
 *   the current review head), replies, resolve/unresolve toggle, delete, and
 *   the reply composer. All mutations are single-flight via the pendingKey.
 *
 * @param {Object} props
 * @param {Object} props.comment - Comment record per plan §4.1.
 * @param {boolean} [props.stale] - headSha mismatch → "Outdated" badge.
 * @param {boolean} [props.canResolve] - Pass/Fail allowed (waiting_human).
 * @param {Function} props.onResolve - (commentId, resolved) => Promise
 * @param {Function} props.onDelete - (commentId) => Promise
 * @param {Function} props.onReply - (commentId, body) => Promise
 * @example <ReviewCommentThread comment={c} stale onReply={reply} />
 ***/
export function ReviewCommentThread({
  comment,
  stale,
  canResolve = true,
  onReply,
  onUpdate,
  onDelete,
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const run = async (fn, ...args) => {
    if (pending) return;
    setPending(true);
    try {
      await fn?.(...args);
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      data-testid="review-comment-thread"
      data-comment-id={comment.id}
      className={`p-2 rounded-sm border space-y-2 ${
        comment.resolved
          ? 'bg-surface-container/60 border-border-standard/60 opacity-80'
          : 'bg-surface-container border-secondary/40'
      }`}
    >
      {/* Root comment */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono font-bold text-primary">
            {comment.author || 'human'}
          </span>
          {stale && (
            <span
              className="px-1.5 py-0.5 rounded border bg-warning/20 text-warning border-warning/40 text-[10px] font-mono uppercase"
              title="The agent has pushed new commits since this comment was written."
            >
              Outdated
            </span>
          )}
          {comment.resolved && (
            <span className="px-1.5 py-0.5 rounded bg-surface-deep border border-border-standard text-[10px] font-mono text-text-muted uppercase">
              Resolved
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canResolve && onUpdate && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(onUpdate, comment.id, { resolved: !comment.resolved })}
              className="text-[10px] font-mono uppercase text-text-muted hover:text-primary cursor-pointer disabled:opacity-40"
            >
              {comment.resolved ? '↺ Unresolve' : '✓ Resolve'}
            </button>
          )}
          {canResolve && onDelete && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(onDelete, comment.id)}
              aria-label="Delete comment"
              className="text-[10px] font-mono uppercase text-text-muted hover:text-error cursor-pointer disabled:opacity-40"
            >
              ✕ Delete
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-on-surface whitespace-pre-wrap break-words leading-relaxed">
        {comment.body}
      </p>

      {/* Replies */}
      {(comment.replies || []).length > 0 && (
        <div className="pl-3 border-l border-border-standard space-y-1.5">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="text-xs text-on-surface">
              <span className="text-[10px] font-mono text-text-muted mr-1.5">
                {reply.author || 'human'}
              </span>
              {reply.body}
            </div>
          ))}
        </div>
      )}

      {/* Reply composer / toggle */}
      {replyOpen ? (
        <ReviewCommentComposer
          // eslint-disable-next-line jsx-a11y/no-autofocus -- custom initial-focus prop (programmatic .focus() on user-opened composer), not a DOM autofocus attribute
          autoFocus
          label="Reply"
          placeholder="Reply to this thread…"
          onSubmit={async (body) => {
            await run(onReply, comment.id, body);
            setReplyOpen(false);
          }}
          onCancel={() => setReplyOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setReplyOpen(true)}
          className="text-[10px] font-mono uppercase text-text-muted hover:text-primary cursor-pointer"
        >
          + Reply
        </button>
      )}
    </div>
  );
}
