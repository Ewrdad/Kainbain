import { ReliabilityLine, recentReliabilityTitle } from '../../settings/ReliabilityLine';
import {
  RELIABILITY_INTERVENTION_RULES,
  needsIntervention,
  sortReliabilityForMonitor,
} from '../reliabilityStatus';

/***
 * MARK: reliabilityRowTitles
 * @description Tooltip wording for one harness row's all-time rate line,
 *   matching the Models tab reliability line: what the rate counts and the
 *   honest no-data wording. The widget owns its monitor prose; the shared
 *   `ReliabilityLine` only renders it.
 * @example reliabilityRowTitles({ runs: 10, successes: 9, infraFailures: 1 }) => { title: '…', emptyTitle: '…' }
 * @param {Object} [entry] - One harness reliability entry, if any.
 * @returns {{title: string, emptyTitle: string}} Tooltip wording.
 ***/
function reliabilityRowTitles(entry) {
  const runs = typeof entry?.runs === 'number' ? entry.runs : 0;
  const successes = typeof entry?.successes === 'number' ? entry.successes : 0;
  const infraFailures = typeof entry?.infraFailures === 'number' ? entry.infraFailures : 0;
  const runWord = runs === 1 ? 'run' : 'runs';
  return {
    // Read only when the entry has counted runs: the line shows the title
    // solely alongside a rate and must never crash a no-data harness.
    title: entry
      ? `All-time success rate over ${runs} counted ${runWord} (${successes} clean, ${infraFailures} timeouts or harness errors). Deliberate agent rejections are excluded.`
      : '',
    emptyTitle: 'No counted runs yet — the rate appears once this harness completes stages.',
  };
}

/***
 * MARK: lastRunLabel
 * @description Honest last-run timestamp: locale date-time when the backend
 *   sent one, an explicit dash when it did not (never "Invalid Date").
 * @example lastRunLabel('2026-10-14T08:00:00Z') => '10/14/2026, 8:00:00 AM'
 * @example lastRunLabel(null) => '—'
 * @param {string|null} [value] - The entry's `lastRunAt`, if any.
 * @returns {string} Display label.
 ***/
function lastRunLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/***
 * MARK: HarnessReliabilityWidget
 * @description Monitor widget listing one row per harness from
 *   `GET /harnesses/reliability`, ordered worst-first: all-time and recent
 *   (last 10 runs) success rates, counted runs, infrastructure failures and
 *   last-run time. Harnesses that need intervention (enough counted runs and
 *   a rate below the threshold, see `RELIABILITY_INTERVENTION_RULES`) carry
 *   an amber "Needs attention" badge and sort first; harnesses without
 *   counted runs show an honest no-data line and are never flagged. Fetch
 *   state (pending / error + retry) is owned by the dashboard and passed in.
 * @example <HarnessReliabilityWidget reliability={entries} pending={false} error={null} />
 * @example <HarnessReliabilityWidget reliability={[]} error="Could not load…" onRetry={reload} />
 * @param {Object} props
 * @param {Array<Object>} [props.reliability=[]] - Reliability entries, if any.
 * @param {boolean} [props.pending=false] - The fetch has not landed yet.
 * @param {string|null} [props.error=null] - Fetch error message, if any (stale rows may still be shown).
 * @param {Function} [props.onRetry] - Re-fetch handler for the error banner's Retry button.
 ***/
export function HarnessReliabilityWidget({
  reliability = [],
  pending = false,
  error = null,
  onRetry,
}) {
  // Fail safe: a malformed payload (null holes, strings from a proxying
  // cache) renders the valid rows instead of crashing the whole widget.
  const rows = sortReliabilityForMonitor(
    Array.isArray(reliability) ? reliability.filter((row) => row && typeof row === 'object') : [],
  );

  if (pending && rows.length === 0) {
    return (
      <div
        data-testid="harness-reliability-loading"
        className="flex-1 flex items-center justify-center p-6 text-slate-400 font-mono text-xs bg-[#080c16]"
      >
        Loading harness reliability…
      </div>
    );
  }

  return (
    <div
      data-testid="harness-reliability-widget"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
      tabIndex={0}
      role="group"
      aria-label="Harness reliability list"
      className="flex-1 p-2.5 space-y-2 overflow-y-auto custom-scrollbar font-mono text-xs bg-[#080c16]"
    >
      {error && (
        <div
          data-testid="harness-reliability-error"
          className="p-2.5 rounded-md border border-rose-900/50 bg-rose-950/20 flex items-center justify-between gap-3"
        >
          <span className="text-rose-300">{error}</span>
          {typeof onRetry === 'function' && (
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 underline text-rose-300 hover:text-rose-200 cursor-pointer"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs">
          <span className="text-2xl mb-1 opacity-40">🛡️</span>
          <p data-testid="harness-reliability-empty">No reliability data yet</p>
          <p className="text-[10px] mt-1 text-slate-400">
            Rows appear once harnesses complete attributed stage runs.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[10px] text-slate-400">
            Needs attention: at least {RELIABILITY_INTERVENTION_RULES.minRuns} counted runs and
            below {RELIABILITY_INTERVENTION_RULES.threshold}% success, all-time or over the last 10
            runs.
          </p>
          {rows.map((entry, index) => {
            const flagged = needsIntervention(entry);
            // Backend ids are unique; the index fallback keeps React keys
            // stable if a proxied payload ever duplicates or drops an id.
            const rowId =
              typeof entry?.harnessId === 'string' && entry.harnessId.length > 0
                ? entry.harnessId
                : `unknown-${index}`;
            return (
              <div
                key={rowId}
                data-testid={`reliability-row-${rowId}`}
                className={`p-2.5 rounded-md border flex items-center justify-between gap-3 ${
                  flagged
                    ? 'bg-amber-950/20 border-amber-700/60'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-200 truncate">{rowId}</span>
                    {flagged && (
                      <span
                        data-testid={`reliability-flag-${rowId}`}
                        title="This harness fails regularly enough to need operator intervention."
                        className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border border-amber-700/60 bg-amber-950/60 text-amber-300 shrink-0"
                      >
                        Needs attention
                      </span>
                    )}
                  </div>
                  <ReliabilityLine
                    testId={`reliability-line-${rowId}`}
                    stats={entry}
                    showRecent
                    {...reliabilityRowTitles(entry)}
                    recentTitle={recentReliabilityTitle(entry?.recent)}
                  />
                </div>

                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-[10px] text-slate-400">
                    Infra fails{' '}
                    <span
                      className={`font-bold ${typeof entry?.infraFailures === 'number' && entry.infraFailures > 0 ? 'text-rose-400' : 'text-slate-200'}`}
                    >
                      {typeof entry?.infraFailures === 'number' ? entry.infraFailures : 0}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Last run {lastRunLabel(entry.lastRunAt)}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

export default HarnessReliabilityWidget;
