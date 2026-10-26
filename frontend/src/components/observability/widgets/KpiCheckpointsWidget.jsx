import { KpiCard } from './atoms/KpiCard';

/***
 * MARK: KpiCheckpointsCard
 * @description The human-review checkpoints KPI card, shared by the atomic
 *   widget and the composite KPI ribbon so the two cannot drift.
 * @example <KpiCheckpointsCard stats={{ waitingHuman: 1, paused: 0 }} />
 * @param {Object} [props] - Card props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @param {string} [props.className] - Extra classes (e.g. grid column span).
 * @returns {ReactElement} The card.
 ***/
export function KpiCheckpointsCard({ stats = {}, className = '' }) {
  return (
    <KpiCard
      testId="kpi-checkpoints"
      accent="amber"
      label="👤 Human review"
      icon="✋"
      value={stats.waitingHuman ?? 0}
      unit={(stats.paused ?? 0) > 0 ? `+${stats.paused} paused` : 'pending'}
      sub="Checkpoints awaiting human"
      className={className}
    />
  );
}

/***
 * MARK: KpiCheckpointsWidget
 * @description Atomic monitor widget: checkpoints awaiting a human decision,
 *   with any paused tasks, filling its container.
 * @example <KpiCheckpointsWidget stats={{ waitingHuman: 1, paused: 0 }} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @returns {ReactElement} The single KPI card widget.
 ***/
export function KpiCheckpointsWidget({ stats = {} }) {
  return (
    <div className="flex flex-col h-full p-1.5 bg-[#080c16]">
      <KpiCheckpointsCard stats={stats} className="flex-1" />
    </div>
  );
}

export default KpiCheckpointsWidget;
