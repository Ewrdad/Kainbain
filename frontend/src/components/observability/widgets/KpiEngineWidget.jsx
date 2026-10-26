import { KpiCard } from './atoms/KpiCard';

/***
 * MARK: KpiEngineCard
 * @description The Active Engine card body: stage name and type, the resolved
 *   alias line (or a fail-visible unresolved one), and one identity line — the
 *   model when reported, else the harness (harness-managed stages report no
 *   model), else Autonomous Agent. Shared by the composite KPI ribbon and the
 *   atomic Active Engine widget so both show exactly the same thing.
 * @example <KpiEngineCard engineState={{ activeStageName: 'Build', activeStageType: 'agent' }} activeTask={{ model: 'pi::p::m', harness: 'pi' }} />
 * @param {Object} [props] - Card content.
 * @param {Object} [props.engineState] - Live engine state snapshot.
 * @param {Object} [props.activeTask] - Resolved active task, if any.
 * @param {string} [props.className] - Extra classes (e.g. grid column span).
 * @returns {ReactElement} The Active Engine card.
 ***/
export function KpiEngineCard({ engineState = {}, activeTask = {}, className = '' }) {
  const aliasName = activeTask?.alias?.name;
  const aliasMissing = activeTask?.aliasMissing;
  const modelSelection = activeTask?.modelSelection || 'list';
  const showModel = modelSelection !== 'none' && !!activeTask?.model;
  const identityLine = (() => {
    if (showModel) return `Model: ${activeTask.model}`;
    if (activeTask?.harness) return `Harness: ${activeTask.harness}`;
    return 'Autonomous Agent';
  })();

  return (
    <KpiCard
      testId="kpi-pipeline"
      accent="indigo"
      label="⚙️ Active engine"
      icon="🤖"
      className={className}
    >
      <div className="mt-0.5">
        <div className="text-xs font-bold text-indigo-300 truncate">
          {engineState?.activeStageName || activeTask?.currentStageName || 'Idle'}
        </div>
        <div className="text-[9px] font-mono text-slate-300 truncate">
          Type: {engineState?.activeStageType || activeTask?.currentStageType || 'none'}
        </div>
      </div>
      {aliasName && (
        <span className="text-[9px] text-indigo-200/80 font-mono truncate">alias: {aliasName}</span>
      )}
      {!aliasName && aliasMissing && (
        <span className="text-[9px] text-indigo-200/80 font-mono truncate">
          alias: {aliasMissing} (unresolved)
        </span>
      )}
      <span className="text-[9px] text-indigo-200/80 font-mono truncate">{identityLine}</span>
    </KpiCard>
  );
}

/***
 * MARK: KpiEngineWidget
 * @description Atomic monitor widget: the Active Engine card as its own
 *   addable widget, filling its container.
 * @example <KpiEngineWidget engineState={{ activeStageName: 'Build' }} activeTask={{ harness: 'pi' }} />
 * @param {Object} [props] - Widget props (see KpiEngineCard).
 * @returns {ReactElement} The single Active Engine card.
 ***/
export function KpiEngineWidget({ engineState = {}, activeTask = {} }) {
  return (
    <div className="flex flex-col h-full p-1.5 bg-[#080c16]">
      <KpiEngineCard engineState={engineState} activeTask={activeTask} className="flex-1" />
    </div>
  );
}

export default KpiEngineWidget;
