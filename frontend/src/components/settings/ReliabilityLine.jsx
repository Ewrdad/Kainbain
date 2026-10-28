import React from 'react';

/***
 * MARK: recentReliabilityTitle
 * @description Shared tooltip for the last-10-runs figure: what the recent
 *   window counts, or the honest no-data wording when the window is empty.
 *   One helper so the Settings lines and the monitor widget can never drift
 *   into different prose for the same figure. Fail-safe: malformed or absent
 *   `recent` buckets yield the no-data wording, never a crash or NaN text.
 * @example recentReliabilityTitle({ runs: 10, successes: 8, infraFailures: 2, successRate: 80 }) => 'Success rate over the last 10 runs …'
 * @example recentReliabilityTitle(null) => 'No runs recorded in the last 10 runs window yet.'
 * @param {Object} [recent] - The `recent` bucket of a reliability entry, if any.
 * @returns {string} Tooltip wording for the recent figure.
 ***/
export function recentReliabilityTitle(recent) {
  const recentRuns = typeof recent?.runs === 'number' ? recent.runs : 0;
  const hasRecentRate = recentRuns > 0 && typeof recent?.successRate === 'number';
  if (!hasRecentRate) return 'No runs recorded in the last 10 runs window yet.';
  const recentRunWord = recentRuns === 1 ? 'run' : 'runs';
  const clean = typeof recent?.successes === 'number' ? recent.successes : 0;
  const infra = typeof recent?.infraFailures === 'number' ? recent.infraFailures : 0;
  return `Success rate over the last 10 runs (${recentRuns} counted ${recentRunWord}: ${clean} clean, ${infra} timeouts or harness errors). Deliberate agent decisions to fail a stage are excluded.`;
}

/***
 * MARK: ReliabilityLine
 * @description One reliability line from a stage-run reliability endpoint:
 *   the all-time success rate plus the counted-run total, or an honest
 *   no-data state when the subject has no attributed runs yet (never a fake
 *   0%). With `showRecent`, the last-10-runs figure renders side-by-side so
 *   an operator can tell a temporary blip (all-time healthy, last-10 bad)
 *   from a long-term structural issue (both bad). Shared by the System
 *   Settings harness list, the per-alias per-target lines in Model Aliases,
 *   and the monitor Harness Reliability widget — only the test id and the
 *   tooltip wording differ per subject (callers own both).
 * @example <ReliabilityLine testId="harness-reliability-pi" stats={{ runs: 120, successRate: 97.5, … }} title="…" emptyTitle="…" />
 * @example <ReliabilityLine testId="alias-reliability-0-0" stats={undefined} title="…" emptyTitle="…" pending />
 * @param {Object} props
 * @param {string} props.testId - Stable test id for the line.
 * @param {Object} [props.stats] - Reliability bucket for the subject, if any.
 * @param {string} props.title - Tooltip when the rate is shown (names what the rate counts).
 * @param {string} props.emptyTitle - Tooltip for the no-data state.
 * @param {boolean} [props.pending=false] - The fetch has not landed yet: shows
 *   an explicit loading state instead of the no-data wording, so a slow fetch
 *   never looks like a missing feature. Yields to real stats when present.
 * @param {boolean} [props.showRecent=false] - When true, renders the last-10-runs
 *   figure side-by-side with the all-time rate.
 * @param {string} [props.label='All-time'] - Label for the all-time rate.
 * @param {string} [props.recentLabel='Last 10 runs'] - Label for the recent window.
 * @param {string} [props.recentTitle] - Tooltip for the recent window (defaults to `recentReliabilityTitle(stats.recent)`).
 ***/
export function ReliabilityLine({
  testId,
  stats,
  title,
  emptyTitle,
  pending = false,
  showRecent = false,
  label = 'All-time',
  recentLabel = 'Last 10 runs',
  recentTitle,
}) {
  // Fail-safe labels: a blank or non-string override falls back to the
  // canonical wording so the two figures stay unambiguously labelled.
  const allTimeLabel = typeof label === 'string' && label.trim() ? label : 'All-time';
  const lastWindowLabel =
    typeof recentLabel === 'string' && recentLabel.trim() ? recentLabel : 'Last 10 runs';
  const runs = typeof stats?.runs === 'number' ? stats.runs : 0;
  const hasRate = runs > 0 && typeof stats?.successRate === 'number';
  if (pending && !hasRate) {
    return (
      <span
        data-testid={testId}
        title="Fetching reliability for this project — rates appear once the load finishes."
        className="text-[11px] text-text-muted"
      >
        Loading reliability…
      </span>
    );
  }
  if (!hasRate) {
    return (
      <span data-testid={testId} title={emptyTitle} className="text-[11px] text-text-muted">
        No reliability data yet
      </span>
    );
  }

  const runWord = runs === 1 ? 'run' : 'runs';
  const allTimeText = `${allTimeLabel} ${stats.successRate}% · ${runs} ${runWord}`;

  if (!showRecent) {
    return (
      <span data-testid={testId} title={title} className="text-[11px] text-text-muted">
        {allTimeText}
      </span>
    );
  }

  const recent = stats?.recent;
  const recentRuns = typeof recent?.runs === 'number' ? recent.runs : 0;
  const hasRecentRate = recentRuns > 0 && typeof recent?.successRate === 'number';
  const recentRunWord = recentRuns === 1 ? 'run' : 'runs';
  const recentText = hasRecentRate
    ? `${lastWindowLabel} ${recent.successRate}% · ${recentRuns} ${recentRunWord}`
    : `${lastWindowLabel}: —`;

  const computedRecentTitle =
    typeof recentTitle === 'string' && recentTitle ? recentTitle : recentReliabilityTitle(recent);

  return (
    <span
      data-testid={testId}
      className="text-[11px] text-text-muted inline-flex items-center gap-1.5 flex-wrap"
    >
      <span data-testid={`${testId}-all-time`} title={title}>
        {allTimeText}
      </span>
      <span aria-hidden="true" className="text-text-muted/60">
        ·
      </span>
      <span data-testid={`${testId}-recent`} title={computedRecentTitle}>
        {recentText}
      </span>
    </span>
  );
}

export default ReliabilityLine;
