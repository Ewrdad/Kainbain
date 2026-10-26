import { useState, useRef, useEffect } from 'react';

/***
 * MARK: ReviewCommentComposer
 * @description Inline comment composer for the MR-style review: textarea with
 *   Ctrl/Cmd+Enter submit (matching FeedbackDialog behavior) and a Cancel
 *   button. Used for line comments, file comments, and thread replies.
 *
 * @param {Object} props
 * @param {Function} props.onSubmit - (body) => Promise|void. Returns/awaits
 *   nothing; the parent owns the mutation.
 * @param {Function} [props.onCancel] - Optional cancel callback.
 * @param {string} [props.placeholder]
 * @param {string} [props.label] - Small heading above the textarea.
 * @param {boolean} [props.autoFocus]
 * @example <ReviewCommentComposer onSubmit={add} onCancel={close} label="Comment on line 42" />
 ***/
export function ReviewCommentComposer({ onSubmit, onCancel, label, placeholder, autoFocus }) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit?.(trimmed);
      setBody('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    // Ctrl+Enter / Cmd+Enter submits (mirrors FeedbackDialog behavior).
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="p-3 bg-surface-deep border border-border-standard rounded-sm space-y-2"
      data-testid="review-comment-composer"
    >
      {label && (
        <div className="text-[11px] font-mono text-text-muted uppercase tracking-wide">{label}</div>
      )}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Leave a review comment…'}
        rows={3}
        aria-label={label || 'Review comment'}
        className="w-full bg-surface-container border border-border-standard rounded p-2 text-xs font-mono text-on-surface focus:outline-none focus:border-primary resize-y"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-[11px] font-mono uppercase text-on-surface cursor-pointer disabled:opacity-40"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || submitting}
          className="px-3 py-1.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-[11px] font-mono font-bold uppercase hover:brightness-110 cursor-pointer disabled:opacity-40"
        >
          {submitting ? 'Adding…' : 'Add comment'}
        </button>
      </div>
      <div className="text-[10px] font-mono text-text-muted">Ctrl+Enter to submit</div>
    </div>
  );
}
