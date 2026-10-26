import { KpiSuccessesCard } from './KpiSuccessesWidget';
import { KpiFailuresCard } from './KpiFailuresWidget';
import { KpiQueueDepthCard } from './KpiQueueDepthWidget';
import { KpiCheckpointsCard } from './KpiCheckpointsWidget';
import { KpiEngineCard } from './KpiEngineWidget';

/***
 * MARK: KpiRibbonWidget
 * @description One-click composite of every KPI card (successes, failures,
 *   queue depth, human checkpoints, active engine) on a single row. Each card
 *   is the same shared component its atomic widget renders, so the ribbon is
 *   just a different arrangement — never a second implementation.
 *   The engine card shows the model when one is reported, else the harness name
 *   (harness-managed stages report no model), else Autonomous Agent.
 *   Alias runs show an `alias: <name>` line above the Model/Harness line;
 *   unknown/deleted/blank aliases show `alias: <name> (unresolved)` instead.
 * @example <KpiRibbonWidget stats={{ completed: 7 }} scheduledQueue={[]} engineState={{}} activeTask={{}} />
 * @param {Object} [props] - Widget props.
 * @param {Object} [props.stats] - Dashboard stats snapshot.
 * @param {Array<Object>} [props.scheduledQueue] - Ordered scheduled candidates.
 * @param {Object} [props.engineState] - Live engine state snapshot.
 * @param {Object} [props.activeTask] - Resolved active task, if any.
 * @returns {ReactElement} The KPI ribbon.
 ***/
export function KpiRibbonWidget({
  stats = {},
  scheduledQueue = [],
  engineState = {},
  activeTask = {},
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-1.5 p-1.5 bg-[#080c16]">
      <KpiSuccessesCard stats={stats} />
      <KpiFailuresCard stats={stats} />
      <KpiQueueDepthCard scheduledQueue={scheduledQueue} stats={stats} />
      <KpiCheckpointsCard stats={stats} />
      <KpiEngineCard
        engineState={engineState}
        activeTask={activeTask}
        className="col-span-2 sm:col-span-4 lg:col-span-1"
      />
    </div>
  );
}

export default KpiRibbonWidget;
