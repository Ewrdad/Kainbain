import { KpiCard } from './atoms/KpiCard';

/***
 * MARK: KpiFailuresCard
 * @description The failed-tasks KPI card, shared by the atomic widget and the
 *   composite KPI ribbon so the two cannot drift.
 * @example <KpiFailuresCard stats={{ failed: 1, failureRate: 12.5 }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @param {string} [props.className] - Extra classes (e.g. grid column span).
 * @returns {ReactElement} The card.
 ***/
export function KpiFailuresCard({ stats = {}, className = '' }) {
  return (
    <KpiCard
      testId="kpi-failures"
      accent="rose"
      label="✕ Failures"
      icon="⚠️"
      value={stats.failed ?? 0}
      unit={`(${stats.failureRate ?? 0}%)`}
      sub="Handled via failback"
      className={className}
    />
  );
}

/***
 * MARK: KpiFailuresWidget
 * @description Atomic monitor widget: failed task count with the resolved
 *   failure rate, filling its container.
 * @example <KpiFailuresWidget stats={{ failed: 1, failureRate: 12.5 }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @returns {ReactElement} The single KPI card widget.
 ***/
export function KpiFailuresWidget({ stats = {} }) {
  return (
    <div className="flex flex-col h-full p-1.5 bg-[#080c16]">
      <KpiFailuresCard stats={stats} className="flex-1" />
    </div>
  );
}

export default KpiFailuresWidget;
