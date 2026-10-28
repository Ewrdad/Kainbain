import React from 'react';

import {
  buildRunnerBoxAriaLabel,
  coerceBoxText,
  formatRunnerStatusDisplay,
  getRunnerBoxStyle,
  truncateRunnerText,
} from './runnerBoxUi';

/***
 * MARK: RunnerBox
 * @description Compact per-runner box for the Now Playing bar (plan q2/q3):
 *   runner name, task first line, stage line, and a health indicator that is
 *   never colour-only — the status word renders as text beside the dot
 *   (WCAG 1.4.1) while the dot itself is aria-hidden. Lines truncate in CSS
 *   with the full value on `title`; the tooltip text is capped so a
 *   paragraph-long goal cannot build an unusable tooltip. A box WITH a task
 *   is a button that opens the task inspector; a box WITHOUT a task is a
 *   greyed-out `idle` panel (display-only, plan q5). Three short lines fit
 *   the 72px bar; the status word shares the name line so no fourth line is
 *   needed.
 * @example <RunnerBox entry={{ runnerId: 'bravo', runnerLabel: 'Bravo', task: { id: 't1' }, taskTitleFirstLine: 'Ship it', stageName: 'Plan', statusWord: 'running' }} onOpenTask={(task) => setSelectedTask(task)} />
 * @param {Object} props - Component props.
 * @param {Object} props.entry - Runner entry ({ runnerId, runnerLabel, task, taskTitleFirstLine, stageName, statusWord }).
 * @param {Function} [props.onOpenTask] - Called with the task when a task-carrying box is activated.
 * @returns {React.ReactElement} The box (button when it has a task, panel when idle).
 ***/
export function RunnerBox({ entry, onOpenTask }) {
  // A blank id renders as an empty name and an empty test id — fail closed
  // to 'unknown' instead so the box stays findable and labelled. Immutable
  // bindings: the coercion helper owns every blank/coerce/fallback branch.
  const runnerId = coerceBoxText(entry?.runnerId, 'unknown');
  const runnerName = coerceBoxText(entry?.runnerLabel, runnerId);
  // Normalised once so the dot colour, the visible word, and the aria label
  // can never disagree: an untrimmed (' running '), differently-cased
  // ('RUNNING'), or non-string (5, {}, []) status used to miss the colour
  // map while the label read something else. Lower-cased: the display
  // upper-cases it back, and the map only holds lower-case keys.
  const statusWord =
    typeof entry?.statusWord === 'string' && entry.statusWord.trim() !== ''
      ? entry.statusWord.trim().toLowerCase()
      : 'idle';
  const style = getRunnerBoxStyle(statusWord);
  const testId = `runner-box-${runnerId}`;
  // Explicit fields only (never `{...entry}`): a spread would invoke every
  // getter on a hand-built prop, so one poisoned field could blank the bar.
  const label = buildRunnerBoxAriaLabel({
    runnerLabel: runnerName,
    statusWord,
    taskTitleFirstLine: entry?.taskTitleFirstLine,
    stageName: entry?.stageName,
  });
  const taskTitle =
    typeof entry?.taskTitleFirstLine === 'string' && entry.taskTitleFirstLine !== ''
      ? entry.taskTitleFirstLine
      : 'Untitled Task';
  // Only a non-blank string names a stage: anything else (a bad-merge object,
  // a number) would render as "Stage: [object Object]" beside honest data.
  // The single flag below also gates the tooltip, so a junk stage value can
  // never leave a stray "—" tooltip behind.
  const hasStageName = typeof entry?.stageName === 'string' && entry.stageName.trim() !== '';
  const stageLine = hasStageName ? `Stage: ${entry.stageName}` : '—';

  const frameClass =
    'flex min-w-[120px] max-w-[180px] flex-col justify-center gap-0.5 rounded border border-border-standard bg-surface-container px-2 py-1 text-left';

  // Idle variant (plan q5): greyed-out panel, no click target. role="group"
  // so the aria-label (runner + status) stays valid on a non-interactive
  // element; the word `idle` is visible text, never colour-only.
  if (!entry?.task) {
    return (
      <div
        role="group"
        aria-label={label}
        data-testid={testId}
        title={truncateRunnerText(runnerName)}
        className={`${frameClass} opacity-60`}
      >
        <span className="flex min-w-0 items-center gap-1">
          <span className={`h-2 w-2 shrink-0 rounded-full ${style.dotClass}`} aria-hidden="true" />
          <span
            className="truncate text-[11px] font-bold text-text-muted"
            title={truncateRunnerText(runnerName)}
          >
            {runnerName}
          </span>
        </span>
        <span className="truncate text-[11px] text-text-muted">idle</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof onOpenTask === 'function' && entry?.task) onOpenTask(entry.task);
      }}
      aria-label={label}
      data-testid={testId}
      className={`${frameClass} cursor-pointer hover:bg-surface-container-high focus:outline-none focus:ring-1 focus:ring-primary`}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className={`h-2 w-2 shrink-0 rounded-full ${style.dotClass}`} aria-hidden="true" />
        <span
          className="min-w-0 flex-1 truncate text-[11px] font-bold text-on-surface"
          title={truncateRunnerText(runnerName)}
        >
          {runnerName}
        </span>
        <span
          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${style.statusClass}`}
        >
          {formatRunnerStatusDisplay(statusWord)}
        </span>
      </span>
      <span className="truncate text-[11px] text-on-surface" title={truncateRunnerText(taskTitle)}>
        {taskTitle}
      </span>
      <span
        className="truncate text-[10px] text-text-muted"
        title={hasStageName ? truncateRunnerText(stageLine) : undefined}
      >
        {stageLine}
      </span>
    </button>
  );
}
