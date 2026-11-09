import { useState } from 'react';
import { useGlassesRefreshTick } from './useGlassesRefreshTick.js';
import { GlassesApprovalConfirm } from './GlassesApprovalConfirm.jsx';

/***
 * MARK: GlassesQuickReviewView
 * @description One-task quick review for the Meta Ray-Ban (~600x600)
 *   display: a status banner, the task name, Step N of M with a teal
 *   progress bar, at most two summary lines, and two extra-large Approve /
 *   Details buttons. Dark high-contrast styling follows the chosen survey
 *   mockup. Approve is never one tap — it opens an "Are you sure?" step
 *   and only then calls onApprove. Details swaps the buttons for a short
 *   read-only summary with an explicit larger-screen hint, and never
 *   approves. Status changes announce through a quiet live region.
 * @example <GlassesQuickReviewView taskName="Fix race" progressText="Step 2 of 3" summaryLines={['Fix the auth race']} canApprove onApprove={approve} />
 * @param {Object} props
 * @param {string} [props.taskName] - Task name, first and largest.
 * @param {string|null} [props.stageName] - Current step name.
 * @param {string|null} [props.progressText] - "Step N of M" text.
 * @param {number|null} [props.progressFraction] - 0..1 fill for the bar.
 * @param {Array<string>} [props.summaryLines] - At most two short lines.
 * @param {boolean} [props.canApprove=false] - True while review is actionable.
 * @param {boolean} [props.isBusy=false] - True disables buttons mid-flight.
 * @param {Function} [props.onApprove] - Runs after the confirm second tap.
 * @param {Function} [props.onBack] - Returns to the previous screen.
 * @param {Function} [props.onRefresh] - Refreshes live data on the beat.
 ***/
export function GlassesQuickReviewView({
  taskName = '',
  stageName = null,
  progressText = null,
  progressFraction = null,
  summaryLines = [],
  canApprove = false,
  isBusy = false,
  onApprove = () => {},
  onBack,
  onRefresh,
}) {
  const [confirming, setConfirming] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // Pause the live refresh while busy (so a busy mutation is never chased
  // by a background read), while the approval confirm is open, or while
  // details is showing — and treat refresh errors honestly (no crash;
  // the next tick still runs).
  useGlassesRefreshTick(onRefresh, { paused: isBusy || confirming || showDetails });

  const bannerText = canApprove ? 'Review needed' : 'Not ready to review';
  const lines = Array.isArray(summaryLines) ? summaryLines.slice(0, 2) : [];

  const handleConfirmApprove = async () => {
    try {
      await onApprove();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div
      data-testid="glasses-quick-review"
      className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto bg-neutral-950 text-white p-5 gap-4"
    >
      {typeof onBack === 'function' ? (
        <div>
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to tasks"
            className="min-h-[44px] px-3 text-lg font-semibold text-neutral-300"
          >
            ‹ Back
          </button>
        </div>
      ) : null}

      <div
        role="status"
        aria-live="polite"
        data-testid="glasses-review-banner"
        className={`rounded-lg px-4 py-3 text-4xl font-black ${
          canApprove ? 'bg-amber-400 text-black' : 'bg-neutral-800 text-neutral-200'
        }`}
      >
        {bannerText}
      </div>

      <div className="rounded-lg bg-neutral-900 p-5 space-y-3">
        <h1 className="text-3xl font-bold leading-tight break-words">
          {taskName || 'Untitled task'}
        </h1>
        {stageName ? <p className="text-xl text-neutral-300">{stageName}</p> : null}
        {progressText ? (
          <div className="space-y-2">
            <p className="text-2xl font-bold text-teal-400">{progressText}</p>
            {typeof progressFraction === 'number' ? (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progressFraction * 100)}
                aria-valuetext={progressText}
                className="h-4 rounded-full bg-neutral-700 overflow-hidden"
              >
                <div
                  className="h-full rounded-full bg-teal-400"
                  style={{ width: `${Math.round(progressFraction * 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {lines.length > 0 ? (
          <ul className="space-y-1" aria-label="Review summary">
            {lines.map((line, index) => (
              <li key={`${index}-${line}`} className="text-xl leading-snug break-words">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {showDetails ? (
        <div
          data-testid="glasses-review-details"
          className="rounded-lg bg-neutral-900 p-5 space-y-3"
        >
          <p className="text-2xl font-bold">Details</p>
          {lines.length > 0 ? (
            <ul className="space-y-1">
              {lines.map((line, index) => (
                <li key={`${index}-${line}`} className="text-xl leading-snug break-words">
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xl text-neutral-300">No further detail on this screen.</p>
          )}
          <p className="text-lg text-neutral-400">
            Open on a larger screen for the full diff, files, and comments.
          </p>
          <button
            type="button"
            onClick={() => setShowDetails(false)}
            className="w-full min-h-[56px] rounded-lg border-2 border-neutral-500 text-xl font-bold"
          >
            Back to review
          </button>
        </div>
      ) : (
        <div className="mt-auto flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={!canApprove || isBusy}
            className="flex-1 min-h-[72px] rounded-lg bg-green-600 text-2xl font-bold disabled:opacity-40"
          >
            {isBusy ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            disabled={isBusy}
            className="flex-1 min-h-[72px] rounded-lg border-2 border-teal-400 text-2xl font-bold disabled:opacity-40"
          >
            Details
          </button>
        </div>
      )}

      {!canApprove && !showDetails ? (
        <p className="text-lg text-neutral-400">
          Read-only for now — Approve unlocks while the task waits at review.
        </p>
      ) : null}

      {confirming ? (
        <GlassesApprovalConfirm
          taskName={taskName}
          isBusy={isBusy}
          onConfirm={handleConfirmApprove}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
