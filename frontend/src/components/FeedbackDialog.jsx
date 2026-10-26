import React, { useState, useRef } from 'react';

import { useKainBain } from '../context/KainBainContext';
import { Modal } from './Modal';
import { usePendingAction } from '../hooks/usePendingAction';
import { TaskImageAttach } from './tasks/TaskImageAttach';
import { appendImagesMarkdown, removeImageMarkdown } from '../services/taskImages';

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
  const feedbackTextareaRef = useRef(null);

  if (feedbackTask?.id !== prevFeedbackTaskId) {
    setPrevFeedbackTaskId(feedbackTask?.id);
    setFeedback('');
    setImagesUploading(false);
  }

  if (!feedbackTask) return null;

  // Uploaded screenshots land in the task's assets/ folder (existing
  // endpoint) and their markdown reference joins the feedback draft, so the
  // untouched reject path carries them to the agent's retry prompt.
  const handleImagesUploadedBatch = (images) => {
    if (!Array.isArray(images) || images.length === 0) return;
    setFeedback((draft) => appendImagesMarkdown(draft, images));
  };

  const handleImageRemoved = (name) => {
    setFeedback((draft) => removeImageMarkdown(draft, name));
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!feedback.trim() || pendingReject || imagesUploading) return;
    runReject('reject', () =>
      rejectTaskWithFeedback(activeProjectId, feedbackTask.id, feedback.trim()),
    ).catch(() => {
      // Failures are surfaced by the task hooks' notification layer; the dialog
      // stays open so the feedback is not lost.
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
    </Modal>
  );
}
