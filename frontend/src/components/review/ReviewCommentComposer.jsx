import { useState, useRef, useEffect } from 'react';
import { useFeedbackAssets } from '../../hooks/useFeedbackAssets';
import { parseFeedbackValidationError } from '../../services/feedbackValidation';
import {
  MIN_FEEDBACK_PROSE_CHARS,
  formatFeedbackValidationError,
  stripAssetRefs,
  validateHumanFeedback,
} from '../../../../shared/feedbackValidation/index.js';

/***
 * MARK: ReviewCommentComposer
 * @description Inline comment composer for the MR-style review: textarea with
 *   Ctrl/Cmd+Enter submit (matching FeedbackDialog behavior) and a Cancel
 *   button. Used for line comments, file comments, and thread replies.
 *   When task context is provided the draft pre-checks against the task's
 *   attachments: dangling `assets/*` refs or image-only drafts block with an
 *   inline recovery panel (resend after attaching, or strip the dead links
 *   and send words-only) instead of a silent server refusal.
 *
 * @param {Object} props
 * @param {Function} props.onSubmit - (body) => Promise|void. Returns/awaits
 *   nothing; the parent owns the mutation.
 * @param {Function} [props.onCancel] - Optional cancel callback.
 * @param {string} [props.placeholder]
 * @param {string} [props.label] - Small heading above the textarea.
 * @param {boolean} [props.autoFocus]
 * @param {string} [props.projectId] - Task context enabling the pre-check.
 * @param {string} [props.taskId] - Task context enabling the pre-check.
 * @example <ReviewCommentComposer onSubmit={add} onCancel={close} label="Comment on line 42" />
 ***/
export function ReviewCommentComposer({
  onSubmit,
  onCancel,
  label,
  placeholder,
  autoFocus,
  projectId = null,
  taskId = null,
}) {
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Open recovery panel (`{ missing, imageOnly }`) when the draft fails
  // validation — client pre-check or server 422 alike. Null otherwise.
  const [validationBlock, setValidationBlock] = useState(null);
  // Non-validation submit failures keep the draft and name the problem.
  const [submitError, setSubmitError] = useState(null);
  const textareaRef = useRef(null);

  const {
    names: attachedNames,
    available: assetsAvailable,
    refresh: refreshAttached,
  } = useFeedbackAssets(projectId, taskId);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Live pre-check as the draft changes: advisory inline (the submit
  // attempt opens the recovery panel, never a silent disable).
  const liveDecision =
    assetsAvailable && body.trim() ? validateHumanFeedback(body, attachedNames) : null;

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    // Submit-time pre-check against a freshly listed set; a failed
    // listing skips the check — the server guards.
    const { names: fresh, available } = await refreshAttached();
    if (available) {
      const decision = validateHumanFeedback(trimmed, fresh);
      if (!decision.ok) {
        setSubmitError(null);
        setValidationBlock({ missing: decision.missing, imageOnly: decision.imageOnly });
        return;
      }
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit?.(trimmed);
      setBody('');
      setValidationBlock(null);
    } catch (err) {
      // A 422 re-opens the recovery panel with the server-authoritative
      // file list; every other failure keeps the draft and names the
      // problem inline instead of an unhandled rejection.
      const serverBlock = parseFeedbackValidationError(err);
      if (serverBlock) {
        refreshAttached();
        setValidationBlock(serverBlock);
      } else {
        setSubmitError(err?.message || 'Failed to submit the comment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Resend after attaching the file on the task: re-list, re-check, send
  // when the draft checks out (the panel stays with fresh names otherwise).
  const handleResend = async () => {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const { names: fresh, available } = await refreshAttached();
      if (available) {
        const decision = validateHumanFeedback(trimmed, fresh);
        if (!decision.ok) {
          setValidationBlock({ missing: decision.missing, imageOnly: decision.imageOnly });
          return;
        }
      }
      await onSubmit?.(trimmed);
      setBody('');
      setValidationBlock(null);
    } catch (err) {
      const serverBlock = parseFeedbackValidationError(err);
      if (serverBlock) {
        setValidationBlock(serverBlock);
      } else {
        setSubmitError(err?.message || 'Failed to submit the comment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Words-only recovery: strip the dangling refs and send; a draft left
  // empty or still image-only returns to the composer for a written note.
  const handleStripToTextOnly = async () => {
    const stripped = stripAssetRefs(body, validationBlock?.missing || []).trim();
    if (!stripped) {
      setValidationBlock(null);
      textareaRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit?.(stripped);
      setBody('');
      setValidationBlock(null);
    } catch (err) {
      const serverBlock = parseFeedbackValidationError(err);
      if (serverBlock) {
        setBody(stripped);
        setValidationBlock(serverBlock);
      } else {
        setSubmitError(err?.message || 'Failed to submit the comment');
      }
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
      {liveDecision && !liveDecision.ok && !validationBlock && (
        <p className="text-[10px] font-mono text-warning" data-testid="comment-live-warning">
          {formatFeedbackValidationError(liveDecision)}
        </p>
      )}
      {submitError && !validationBlock && (
        <p className="text-[10px] font-mono text-error" role="alert">
          {submitError}
        </p>
      )}
      {validationBlock && (
        <div
          className="p-2 bg-surface-container border border-warning/50 rounded-sm space-y-1.5"
          data-testid="comment-validation-panel"
        >
          <p className="text-[11px] font-mono text-warning">
            {formatFeedbackValidationError({
              missing: validationBlock.missing,
              imageOnly: validationBlock.imageOnly,
              minProseChars: MIN_FEEDBACK_PROSE_CHARS,
            })}
          </p>
          {validationBlock.missing.length > 0 && (
            <p className="text-[10px] font-mono text-text-muted">
              Attach the file on the task (task goal Attach image control), then resend —
              or send words-only without the dead links.
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {validationBlock.missing.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={submitting}
                  className="px-2 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest border border-border-standard rounded-sm text-[10px] font-mono uppercase text-on-surface cursor-pointer disabled:opacity-40"
                >
                  {submitting ? 'Sending…' : 'Resend'}
                </button>
                <button
                  type="button"
                  onClick={handleStripToTextOnly}
                  disabled={submitting}
                  className="px-2 py-1.5 min-h-[44px] bg-secondary text-on-secondary rounded-sm text-[10px] font-mono font-bold uppercase hover:brightness-110 cursor-pointer disabled:opacity-40"
                >
                  {submitting ? 'Sending…' : 'Send words-only'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setValidationBlock(null)}
              disabled={submitting}
              className="px-2 py-1.5 min-h-[44px] text-[10px] font-mono uppercase text-text-muted hover:text-on-surface cursor-pointer disabled:opacity-40"
            >
              Back to editing
            </button>
          </div>
        </div>
      )}
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
