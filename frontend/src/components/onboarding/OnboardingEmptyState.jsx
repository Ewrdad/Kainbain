import React, { useState } from 'react';

/***
 * MARK: OnboardingEmptyState
 * @description First-run empty board: replaces the bare "No stages
 *   configured" panel when the server confirms zero projects. Shows the
 *   Runner status line, the guided-checklist steps, the three first moves
 *   (create, adopt, setup guide), and any git checkouts found on disk
 *   with one-click adoption. Pure view over the `GET /onboarding`
 *   summary — a null summary (unreachable backend) still renders the
 *   static CTAs so the board is never blank.
 * @example <OnboardingEmptyState summary={summary} onCreate={openCreate} onAdopt={openAdopt} onAdoptPath={adopt} onLearnMore={openDocs} />
 * @param {Object|null} [summary] - `GET /onboarding` payload (or null when unavailable).
 * @param {Function} [onCreate] - Opens the "Create New Project" dialog.
 * @param {Function} [onAdopt] - Opens the "Add Existing Project" dialog.
 * @param {Function} [onAdoptPath] - Adopts one checkout path (`async (path) => void`, may throw).
 * @param {Function} [onLearnMore] - Opens the setup guide.
 ***/
export function OnboardingEmptyState({
  summary = null,
  onCreate = () => {},
  onAdopt = () => {},
  onAdoptPath = async () => {},
  onLearnMore = () => {},
}) {
  const [adoptingPath, setAdoptingPath] = useState(null);
  const [adoptError, setAdoptError] = useState(null);

  const runner = summary && typeof summary === 'object' ? summary.runner : null;
  const steps = Array.isArray(summary?.steps) ? summary.steps : [];
  const adoptable = Array.isArray(summary?.adoptable)
    ? summary.adoptable.filter((e) => e && typeof e.path === 'string' && typeof e.name === 'string')
    : [];

  // Headline only — the checklist's first step carries the full detail,
  // so the box names the state without repeating it.
  const runnerLine = !runner
    ? 'Runner status is unavailable — you can still create or adopt a project.'
    : runner.hasFreshRunner
      ? `Runner connected${runner.freshRunnerIds?.[0] ? `: ${runner.freshRunnerIds[0]}` : ''}.`
      : runner.nextAction === 'approve-runner'
        ? 'A Runner is waiting for approval.'
        : runner.nextAction === 'start-runner'
          ? 'The approved Runner has gone silent.'
          : runner.nextAction === 'wait-for-runner' && runner.expectedRunnerId
            ? `Waiting for the Runner ${runner.expectedRunnerId} to check in…`
            : 'No Runner is registered yet.';

  const handleAdoptPath = async (entry) => {
    setAdoptingPath(entry.path);
    setAdoptError(null);
    try {
      await onAdoptPath(entry.path);
    } catch (e) {
      setAdoptError(e?.message ? `Could not adopt ${entry.name}: ${e.message}` : `Could not adopt ${entry.name}.`);
    } finally {
      setAdoptingPath(null);
    }
  };

  return (
    <div
      className="flex-1 h-full flex flex-col items-center justify-center text-text-muted p-6 overflow-y-auto"
      data-testid="onboarding-empty-state"
    >
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold text-on-surface tracking-tight">Welcome to KainBain</h2>
          <p className="text-sm">Get from install to your first running task in three steps.</p>
        </div>

        <p
          className="text-xs text-center px-3 py-2 bg-surface border border-border-standard rounded-sm"
          role="status"
          data-testid="onboarding-runner-status"
        >
          {runnerLine}
        </p>

        {steps.length > 0 && (
          <ol className="space-y-2" data-testid="onboarding-steps">
            {steps.map((step) => (
              <li
                key={step.id || step.title}
                className="flex items-start gap-3 text-sm"
                data-testid={`onboarding-step-${step.id || 'unknown'}`}
              >
                <span
                  aria-hidden="true"
                  className={step.done ? 'text-primary font-bold' : 'text-text-muted'}
                >
                  {step.done ? '✓' : '○'}
                </span>
                <span>
                  <span className={step.done ? 'text-on-surface font-medium' : 'text-on-surface'}>
                    {step.done ? `${step.title} — done` : step.title}
                  </span>
                  {step.detail && <span className="block text-xs mt-0.5">{step.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onCreate}
            className="px-4 py-2 bg-primary text-on-primary rounded text-xs font-bold uppercase tracking-wider cursor-pointer hover:brightness-110"
          >
            Create New Project
          </button>
          <button
            type="button"
            onClick={onAdopt}
            className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold uppercase tracking-wider rounded cursor-pointer"
          >
            Adopt Existing…
          </button>
          <button
            type="button"
            onClick={onLearnMore}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider underline cursor-pointer hover:text-on-surface"
          >
            Setup guide
          </button>
        </div>

        {adoptable.length > 0 && (
          <div className="space-y-2" data-testid="onboarding-adoptable-list">
            <p className="text-xs font-bold uppercase tracking-widest text-center">
              Found on disk — adopt in one click
            </p>
            <ul className="space-y-1">
              {adoptable.map((entry) => (
                <li
                  key={entry.path}
                  className="flex items-center gap-3 px-3 py-2 bg-surface border border-border-standard rounded-sm text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-on-surface font-medium truncate">{entry.name}</span>
                    <span className="block text-xs font-mono truncate">{entry.path}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAdoptPath(entry)}
                    disabled={adoptingPath !== null}
                    data-testid={`onboarding-adopt-${entry.name}`}
                    className="shrink-0 px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-bold uppercase tracking-wider rounded cursor-pointer disabled:opacity-40"
                  >
                    {adoptingPath === entry.path ? 'Adopting…' : 'Adopt'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {adoptError && (
          <p className="text-xs text-error text-center" role="alert" data-testid="onboarding-adopt-error">
            {adoptError}
          </p>
        )}
      </div>
    </div>
  );
}
