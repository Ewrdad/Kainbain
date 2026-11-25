import React, { useState, useRef, useEffect } from 'react';

import { useKainBain } from '../context/KainBainContext';
import { Modal } from './Modal';
import { usePendingAction } from '../hooks/usePendingAction';
import { useFeedbackAssets } from '../hooks/useFeedbackAssets';
import { TaskImageAttach } from './tasks/TaskImageAttach';
import { FeedbackValidationDialog } from './feedback/FeedbackValidationDialog';
import { appendImagesMarkdown, removeImageMarkdown } from '../services/taskImages';
import { parseFeedbackValidationError } from '../services/feedbackValidation';
import {
  MIN_FEEDBACK_PROSE_CHARS,
  formatFeedbackValidationError,
  stripAssetRefs,
  validateHumanFeedback,
} from '../../../shared/feedbackValidation/index.js';

/**
 * MARK: FeedbackDialog
 * @description Enhanced human review. When a task is rejected in a human
 * stage, this dialog collects correction/feedback which is appended to the
 * task goal and sent back to the agent for a corrected attempt.
 */
export function FeedbackDialog() {
  const { feedbackTask, rejectTaskWithFeedback, closeFeedbackDialog, activeProjectId } =
    useKainBain();

  // Single-flight guard for the reject mutation: while the feedback is being
  // sent to the backend the submit button is disabled and shows a loading
  // state, so a slow connection can never record the rejection twice.
  const { pendingKey: pendingReject, run: runReject } = usePendingAction();
  const isSubmittingFeedback = pendingReject === 'reject';

  const [prevFeedbackTaskId, setPrevFeedbackTaskId] = useState(feedbackTask?.id);
  const [feedback, setFeedback] = useState('');
  // While an image upload is in flight the submit button stays disabled so
  // the rejection cannot go out before its screenshot reference lands.
  const [imagesUploading, setImagesUploading] = useState(false);
  // Open blocking dialog (`{ missing, imageOnly }`) when the draft fails
  // submit-time validation — client pre-check or server 422 alike.
  const [validationBlock, setValidationBlock] = useState(null);
  const feedbackTextareaRef = useRef(null);

  // Advisory-instant attachment list for the pre-check (refreshed on open
  // and after every upload); the server re-validates authoritatively.
  const {
    names: attachedNames,
    available: assetsAvailable,
    refresh: refreshAttached,
  } = useFeedbackAssets(activeProjectId, feedbackTask?.id);

  // Latest-draft mirror: an upload batch lands seconds after its gesture,
  // so its callback reads the ref (synced in an effect, never during
  // render) instead of a stale render-time `feedback` value.
  const latestFeedbackRef = useRef(feedback);
  useEffect(() => {
    latestFeedbackRef.current = feedback;
  }, [feedback]);

  if (feedbackTask?.id !== prevFeedbackTaskId) {
    setPrevFeedbackTaskId(feedbackTask?.id);
    setFeedback('');
    setImagesUploading(false);
    setValidationBlock(null);
  }

  if (!feedbackTask) return null;

  // Live pre-check as the draft changes: advisory inline (the submit
  // attempt opens the blocking dialog, never a silent disable).
  const liveDecision =
    assetsAvailable && feedback.trim()
      ? validateHumanFeedback(feedback, attachedNames)
      : null;

  const doSubmit = (text) => {
    if (pendingReject) return;
    runReject('reject', () =>
      rejectTaskWithFeedback(activeProjectId, feedbackTask.id, text),
    ).catch((err) => {
      // A 422 re-opens the recovery dialog with the server-authoritative
      // file list (stale client list, concurrent delete); every other
      // failure keeps today's handling (notification, draft kept open).
      const serverBlock = parseFeedbackValidationError(err);
      if (serverBlock) {
        refreshAttached();
        setValidationBlock(serverBlock);
      }
    });
  };

  // Uploaded screenshots land in the task's assets/ folder (existing
  // endpoint) and their markdown reference joins the feedback draft, so the
  // untouched reject path carries them to the agent's retry prompt. While
  // the blocking dialog is open an upload auto-resumes the send once the
  // draft checks out against the refreshed list.
  const handleImagesUploadedBatch = (images) => {
    if (!Array.isArray(images) || images.length === 0) return;
    const next = appendImagesMarkdown(latestFeedbackRef.current, images);
    setFeedback(next);
    if (!validationBlock) {
      // Keep the advisory list fresh for the next submit attempt.
      refreshAttached();
      return;
    }
    refreshAttached().then(({ names: fresh, available }) => {
      if (!available) return;
      const decision = validateHumanFeedback(next, fresh);
      if (decision.ok) {
        setValidationBlock(null);
        doSubmit(next.trim());
      } else {
        setValidationBlock({ missing: decision.missing, imageOnly: decision.imageOnly });
      }
    });
  };

  const handleImageRemoved = (name) => {
    setFeedback((draft) => removeImageMarkdown(draft, name));
  };

  const handleStripToTextOnly = () => {
    const stripped = stripAssetRefs(
      latestFeedbackRef.current,
      validationBlock?.missing || [],
    ).trim();
    setValidationBlock(null);
    if (!stripped) {
      // Nothing but dangling refs: back to the composer for a written note.
      feedbackTextareaRef.current?.focus();
      return;
    }
    setFeedback(stripped);
    doSubmit(stripped);
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const draft = feedback.trim();
    if (!draft || pendingReject || imagesUploading) return;
    // Submit-time pre-check against a freshly listed set (never the
    // possibly stale mount list): an upload that just landed always
    // counts. A failed listing skips the check — the server guards.
    refreshAttached().then(({ names: fresh, available }) => {
      if (available) {
        const decision = validateHumanFeedback(draft, fresh);
        if (!decision.ok) {
          setValidationBlock({
            missing: decision.missing,
            imageOnly: decision.imageOnly,
          });
          return;
        }
      }
      doSubmit(draft);
    });
  };

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal
      onClose={closeFeedbackDialog}
      labelledBy="feedback-dialog-title"
      dialogClassName="w-full max-w-xl bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <header className="p-4 sm:p-6 border-b border-border-standard bg-surface-container">
        <h2
          id="feedback-dialog-title"
          className="text-base sm:text-lg font-bold text-on-surface tracking-tight flex items-center gap-2"
        >
          <span className="text-error" aria-hidden="true">
            ⚠️
          </span>
          <span>Reject with Feedback</span>
        </h2>
        <p className="text-[10px] font-mono text-text-muted mt-1">
          Describe what needs correcting. You can attach or paste screenshots —
          they travel with the feedback so the agent can see the issue. Press{' '}
          <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-text-high border border-border-standard">
            Ctrl+Enter
          </kbd>{' '}
          to submit. The agent will retry.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="p-4 sm:p-6 space-y-4">
          <div className="p-3 bg-surface-container border border-border-standard rounded-sm text-xs text-on-surface">
            <span className="text-[10px] font-bold uppercase text-text-muted block mb-1">
              Task #{feedbackTask.id?.slice(0, 8)}
            </span>
            <span className="font-medium text-high">{feedbackTask.goal}</span>
          </div>
          {activeProjectId && feedbackTask.id && (
            <TaskImageAttach
              projectId={activeProjectId}
              taskId={feedbackTask.id}
              textareaRef={feedbackTextareaRef}
              onUploadedBatch={handleImagesUploadedBatch}
              onRemoved={handleImageRemoved}
              onUploadingChange={setImagesUploading}
            />
          )}
          <div>
            <label
              htmlFor="feedback-textarea"
              className="text-[10px] font-bold uppercase tracking-widest text-text-muted block mb-2"
            >
              Correction / Feedback
            </label>
            <textarea
              id="feedback-textarea"
              ref={feedbackTextareaRef}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- dialog opens from an explicit user action; initial focus in the composer is the expected pattern
              autoFocus
              onKeyDown={handleKeyDown}
              className="w-full p-3 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono leading-relaxed outline-none focus:border-error transition-colors h-28 sm:h-32 resize-y"
              placeholder="e.g. Please add unit tests and handle the edge case..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            {liveDecision && !liveDecision.ok && (
              <p
                className="text-[10px] font-mono text-warning mt-1"
                data-testid="feedback-live-warning"
              >
                {formatFeedbackValidationError(liveDecision)}
              </p>
            )}
          </div>
        </div>

        <footer className="p-4 sm:p-6 border-t border-border-standard bg-surface flex justify-end gap-3">
          <button
            type="button"
            onClick={closeFeedbackDialog}
            className="px-4 py-2 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors cursor-pointer flex items-center justify-center"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!feedback.trim() || pendingReject !== null || imagesUploading}
            aria-busy={isSubmittingFeedback}
            className="px-6 py-2 min-h-[44px] bg-error text-on-error text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1.5"
          >
            {isSubmittingFeedback ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Rejecting...</span>
              </>
            ) : (
              <span>Reject &amp; Retry</span>
            )}
          </button>
        </footer>
      </form>
      {validationBlock && (
        <FeedbackValidationDialog
          missing={validationBlock.missing}
          imageOnly={validationBlock.imageOnly}
          minProseChars={MIN_FEEDBACK_PROSE_CHARS}
          projectId={activeProjectId}
          taskId={feedbackTask.id}
          textareaRef={feedbackTextareaRef}
          onUploadedBatch={handleImagesUploadedBatch}
          onUploadingChange={setImagesUploading}
          onStripToTextOnly={handleStripToTextOnly}
          canStrip={validationBlock.missing.length > 0}
          onClose={() => setValidationBlock(null)}
        />
      )}
    </Modal>
  );
}
