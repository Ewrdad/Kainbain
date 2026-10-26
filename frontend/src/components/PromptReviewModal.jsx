import React, { useCallback } from 'react';

import { useKainBain } from '../context/KainBainContext';
import { Icon } from './Icon';
import { Modal } from './Modal';

/**
 * MARK: PromptReviewModal
 * @description The "Review Prompt" step in the task submission flow. Shows the
 * output of the PromptCurationEngine (read-only) before it is sent to the
 * agent. This closes the loop on prompt curation visibility.
 */
export function PromptReviewModal() {
  const { previewPrompt, confirmSubmitTask, cancelPreview, activeProjectId } = useKainBain();

  const handleSend = useCallback(() => {
    if (previewPrompt) {
      confirmSubmitTask(activeProjectId);
    }
  }, [previewPrompt, activeProjectId, confirmSubmitTask]);

  const handleKeyDown = useCallback(
    (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  if (!previewPrompt) return null;

  return (
    <Modal
      onClose={cancelPreview}
      labelledBy="prompt-review-title"
      dialogClassName="w-full max-w-3xl h-full max-h-[85vh] bg-surface border border-border-standard rounded-md shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
    >
      <header className="p-4 sm:p-6 border-b border-border-standard flex justify-between items-start bg-surface-container">
        <div>
          <h2
            id="prompt-review-title"
            className="text-base sm:text-lg font-bold text-on-surface tracking-tight flex items-center gap-2"
          >
            <span className="text-primary" aria-hidden="true">
              ✨
            </span>
            <span>Review Prompt</span>
          </h2>
          <p className="text-[10px] font-mono text-text-muted mt-1">
            The curated prompt below will be sent to the agent. Press{' '}
            <kbd className="px-1.5 py-0.5 bg-surface-container-high rounded text-text-high border border-border-standard">
              Ctrl+Enter
            </kbd>{' '}
            to execute.
          </p>
        </div>
        <button
          onClick={cancelPreview}
          className="p-2 min-h-[44px] min-w-[44px] rounded-sm hover:bg-surface-container-high text-on-surface-variant transition-colors flex items-center justify-center cursor-pointer"
          aria-label="Close prompt review"
        >
          <Icon name="close" />
        </button>
      </header>

      {/* Ctrl+Enter send shortcut, scoped to the dialog body via bubbling from
          focused children; the dialog itself is the Modal focus trap, and this
          wrapper adds no pointer function. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- bubbled-shortcut scope, not an interactive widget */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar"
        onKeyDown={handleKeyDown}
      >
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
            Task Goal
          </h3>
          <div className="p-3 bg-surface-container border border-border-standard rounded-sm text-xs sm:text-sm text-on-surface font-medium">
            {previewPrompt.goal}
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
            Curated Prompt
          </h3>
          <pre
            aria-label="Curated prompt"
            className="w-full p-3 bg-surface-deep border border-border-standard rounded-sm text-xs text-on-surface font-mono leading-relaxed whitespace-pre-wrap break-words h-40 sm:h-72 overflow-y-auto custom-scrollbar m-0"
          >
            {previewPrompt.curatedPrompt || ''}
          </pre>
        </section>
      </div>

      <footer className="p-4 sm:p-6 border-t border-border-standard bg-surface flex justify-between items-center gap-3">
        <span className="text-[10px] text-text-muted font-mono hidden sm:inline">
          Tip: Prompt curation optimizes context for the active stage.
        </span>
        <div className="flex gap-3">
          <button
            onClick={cancelPreview}
            className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant text-xs font-bold uppercase tracking-widest rounded-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="px-6 py-2 bg-primary text-on-primary text-xs font-bold uppercase tracking-widest rounded-sm hover:brightness-110 transition-all active:scale-95 flex items-center gap-1.5"
          >
            <span>Send to Agent</span>
            <span className="text-[10px] opacity-75 font-mono" aria-hidden="true">
              ↵
            </span>
          </button>
        </div>
      </footer>
    </Modal>
  );
}
