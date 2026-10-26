import { KpiCard } from './atoms/KpiCard';

/***
 * MARK: KpiSuccessesCard
 * @description The completed-tasks KPI card, shared by the atomic widget and
 *   the composite KPI ribbon so the two cannot drift.
 * @example <KpiSuccessesCard stats={{ completed: 7, successRate: 87.5 }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @param {string} [props.className] - Extra classes (e.g. grid column span).
 * @returns {ReactElement} The card.
 ***/
export function KpiSuccessesCard({ stats = {}, className = '' }) {
  return (
    <KpiCard
      testId="kpi-successes"
      accent="emerald"
      label="✓ Successes"
      icon="🏆"
      value={stats.completed ?? 0}
      unit={`(${stats.successRate ?? 100}%)`}
      sub="Completed tasks"
      className={className}
    />
  );
}

/***
 * MARK: KpiSuccessesWidget
 * @description Atomic monitor widget: completed task count with the resolved
 *   success rate, filling its container. Addable as many times as wanted.
 * @example <KpiSuccessesWidget stats={{ completed: 7, successRate: 87.5 }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @returns {ReactElement} The single KPI card widget.
 ***/
export function KpiSuccessesWidget({ stats = {} }) {
  return (
    <div className="flex flex-col h-full p-1.5 bg-[#080c16]">
      <KpiSuccessesCard stats={stats} className="flex-1" />
    </div>
  );
}

export default KpiSuccessesWidget;
