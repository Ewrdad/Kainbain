import { KpiCard } from './atoms/KpiCard';

/***
 * MARK: KpiQueueDepthCard
 * @description The queue-depth KPI card, shared by the atomic widget and the
 *   composite KPI ribbon so the two cannot drift.
 * @example <KpiQueueDepthCard scheduledQueue={[{}, {}]} stats={{ running: 1, blocked: 0 }} />
 * @param {Object} [props] - Card props.
 * @param {Array<Object>} [props.scheduledQueue] - Ordered scheduled candidates.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @param {string} [props.className] - Extra classes (e.g. grid column span).
 * @returns {ReactElement} The card.
 ***/
export function KpiQueueDepthCard({ scheduledQueue = [], stats = {}, className = '' }) {
  return (
    <KpiCard
      testId="kpi-queue"
      accent="cyan"
      label="⏳ Queue depth"
      icon="📋"
      value={scheduledQueue.length}
      unit={(stats.running ?? 0) > 0 ? `${stats.running} active` : 'Ready'}
      sub={
        (stats.blocked ?? 0) > 0 ? `${stats.blocked} blocked by deps` : 'Scheduled candidate order'
      }
      className={className}
    />
  );
}

/***
 * MARK: KpiQueueDepthWidget
 * @description Atomic monitor widget: scheduled candidate count with active
 *   and dependency-blocked sub-lines, filling its container.
 * @example <KpiQueueDepthWidget scheduledQueue={[{}, {}]} stats={{ running: 1 }} />
 * @param {Object} [props] - Widget props.
 * @param {Array<Object>} [props.scheduledQueue] - Ordered scheduled candidates.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @returns {ReactElement} The single KPI card widget.
 ***/
export function KpiQueueDepthWidget({ scheduledQueue = [], stats = {} }) {
  return (
    <div className="flex flex-col h-full p-1.5 bg-[#080c16]">
      <KpiQueueDepthCard scheduledQueue={scheduledQueue} stats={stats} className="flex-1" />
    </div>
  );
}

export default KpiQueueDepthWidget;
