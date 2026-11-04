import React, { useState } from 'react';

/***
 * MARK: readOnboardingDismissed
 * @description Whether the user dismissed the onboarding checklist banner
 *   in a past session (`localStorage`, first-visit default false).
 *   Storage failures fall back to visible — a banner must never vanish
 *   from a storage error.
 * @example readOnboardingDismissed() => false
 * @returns {boolean} True when the banner stays hidden.
 ***/
export function readOnboardingDismissed() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem('kainbain:onboardingDismissed') === 'true';
    }
  } catch {
    // Storage unavailable; the banner stays visible.
  }
  return false;
}

/***
 * MARK: writeOnboardingDismissed
 * @description Persists the checklist-banner dismissal. Failures are
 *   swallowed — dismissal is a preference, never load-bearing.
 * @example writeOnboardingDismissed()
 ***/
export function writeOnboardingDismissed() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('kainbain:onboardingDismissed', 'true');
    }
  } catch {
    // Storage unavailable; the banner simply reappears next visit.
  }
}

/***
 * MARK: OnboardingChecklist
 * @description Compact dismissible banner for the guided checklist once
 *   projects exist (the zero-project board shows `OnboardingEmptyState`
 *   instead): Runner connected → first project → first task run, with
 *   the next incomplete step's detail naming the move. Hides itself
 *   when the summary is complete, missing, or the user dismissed it —
 *   onboarding never blocks the board.
 * @example <OnboardingChecklist summary={summary} onLearnMore={openDocs} />
 * @param {Object|null} [summary] - `GET /onboarding` payload (or null).
 * @param {Function} [onLearnMore] - Opens the setup guide.
 ***/
export function OnboardingChecklist({ summary = null, onLearnMore = () => {} }) {
  const [dismissed, setDismissed] = useState(readOnboardingDismissed);

  if (dismissed || !summary || summary.complete) return null;
  const steps = Array.isArray(summary.steps) ? summary.steps : [];
  if (steps.length === 0) return null;
  const next = steps.find((s) => !s.done) || null;

  const handleDismiss = () => {
    writeOnboardingDismissed();
    setDismissed(true);
  };

  return (
    <div
      className="shrink-0 px-3 md:px-6 pt-3"
      data-testid="onboarding-checklist"
    >
      <div className="flex items-center gap-3 px-3 py-2 bg-surface border border-border-standard rounded-sm text-sm">
        <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0 flex-1" aria-label="Setup checklist">
          {steps.map((step) => (
            <li
              key={step.id || step.title}
              className="flex items-center gap-1.5 text-xs"
              data-testid={`onboarding-checklist-step-${step.id || 'unknown'}`}
            >
              <span
                aria-hidden="true"
                className={step.done ? 'text-primary font-bold' : 'text-text-muted'}
              >
                {step.done ? '✓' : '○'}
              </span>
              <span className={step.done ? 'text-text-muted line-through' : 'text-on-surface font-medium'}>
                {step.title}
              </span>
            </li>
          ))}
        </ol>
        {next?.detail && (
          <p className="hidden lg:block text-xs text-text-muted truncate max-w-md" data-testid="onboarding-checklist-next">
            {next.detail}
          </p>
        )}
        <button
          type="button"
          onClick={onLearnMore}
          className="shrink-0 text-xs underline cursor-pointer hover:text-on-surface"
        >
          Setup guide
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss setup checklist"
          className="shrink-0 px-2 py-1 min-w-[44px] min-h-[44px] text-text-muted hover:text-on-surface cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
