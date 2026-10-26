/***
 * MARK: RELIABILITY_INTERVENTION_RULES
 * @description The monitor's "needs attention" rule for one harness, as one
 *   named product decision: a harness is flagged only once it has enough
 *   counted runs for the rate to mean something (minRuns) and its success
 *   rate — all-time or over the recent window — has dropped below the
 *   threshold (percent). Counted runs exclude deliberate agent rejections,
 *   matching the backend reliability buckets.
 * @example RELIABILITY_INTERVENTION_RULES // => { minRuns: 5, threshold: 90 }
 ***/
export const RELIABILITY_INTERVENTION_RULES = { minRuns: 5, threshold: 90 };

/***
 * MARK: needsIntervention
 * @description Whether one harness's reliability entry (from
 *   `GET /harnesses/reliability`) needs operator intervention on the
 *   monitor: at least `minRuns` counted runs AND an all-time or recent-window
 *   success rate below `threshold`. A harness with no counted runs
 *   (`successRate: null` — the backend's honest no-data) is never flagged:
 *   missing data must not look like a broken harness.
 * @example needsIntervention({ runs: 10, successRate: 100, recent: { runs: 10, successRate: 60 } }) => true
 * @example needsIntervention({ runs: 3, successRate: 0 }) => false
 * @example needsIntervention({ runs: 0, successRate: null }) => false
 * @param {Object} [entry] - One harness reliability entry, if any.
 * @param {Object} [opts] - Override the rule constants (tests, future prefs).
 * @param {number} [opts.minRuns] - Minimum counted runs before flagging.
 * @param {number} [opts.threshold] - Success-rate percent below which a harness is flagged.
 * @returns {boolean} True when the harness needs attention.
 ***/
export function needsIntervention(
  entry,
  {
    minRuns = RELIABILITY_INTERVENTION_RULES.minRuns,
    threshold = RELIABILITY_INTERVENTION_RULES.threshold,
  } = {},
) {
  // Fail safe: non-finite overrides (NaN, strings, Infinity from a future
  // preference read) fall back to the declared defaults, so a bad read can
  // never flag every harness or silence every flag.
  const effectiveMinRuns =
    typeof minRuns === 'number' && Number.isFinite(minRuns) && minRuns >= 0
      ? minRuns
      : RELIABILITY_INTERVENTION_RULES.minRuns;
  const effectiveThreshold =
    typeof threshold === 'number' && Number.isFinite(threshold)
      ? threshold
      : RELIABILITY_INTERVENTION_RULES.threshold;
  const runs = typeof entry?.runs === 'number' ? entry.runs : 0;
  if (runs < effectiveMinRuns) return false;
  const allTimeRate = typeof entry?.successRate === 'number' ? entry.successRate : null;
  if (allTimeRate !== null && allTimeRate < effectiveThreshold) return true;
  const recentRate =
    typeof entry?.recent?.successRate === 'number' ? entry.recent.successRate : null;
  return recentRate !== null && recentRate < effectiveThreshold;
}

/***
 * MARK: sortReliabilityForMonitor
 * @description Orders harness reliability rows for the monitor widget so the
 *   worst problem is the first thing an operator sees: harnesses that need
 *   intervention first (lowest all-time rate among them first), then the
 *   remaining harnesses by all-time rate ascending (worst first), and
 *   harnesses with no counted runs (`successRate: null`, honest no-data)
 *   last. Ties fall back to harness id so the order is deterministic.
 * @example sortReliabilityForMonitor([{ harnessId: 'ok', successRate: 99 }, { harnessId: 'bad', runs: 10, successRate: 40 }]) => [bad, ok]
 * @param {Array<Object>} [entries] - Reliability entries, if any.
 * @returns {Array<Object>} A new array ordered worst-first for the monitor.
 ***/
export function sortReliabilityForMonitor(entries) {
  const list = Array.isArray(entries) ? [...entries] : [];
  const allTimeRateOf = (entry) =>
    typeof entry?.successRate === 'number' ? entry.successRate : Number.POSITIVE_INFINITY;
  return list.sort((a, b) => {
    const flaggedFirst = Number(needsIntervention(b)) - Number(needsIntervention(a));
    if (flaggedFirst !== 0) return flaggedFirst;
    if (allTimeRateOf(a) !== allTimeRateOf(b)) return allTimeRateOf(a) - allTimeRateOf(b);
    return String(a?.harnessId || '').localeCompare(String(b?.harnessId || ''));
  });
}
