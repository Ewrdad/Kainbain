import { isMonitorRunning } from '../tasks/isMonitorRunning';
import { PerRunnerTasksWidget } from './widgets/PerRunnerTasksWidget';
import { formatTaskTitleFirstLine } from '../tasks/taskFormatters';
import { EngineStatePill } from './EngineStatePill';
import { resolveMobileModelDetails } from './mobileModelDetails';
import { LiveConsoleWidget } from './widgets/LiveConsoleWidget';

/***
 * MARK: formatMobileMonitorTitle
 * @description Pure formatter for the compact monitor header's right-side
 *   text. The engine pill already shows the stage name when running, so
 *   this text shows the active task identity instead (title, falling back
 *   to the goal's first line with a leading markdown heading stripped —
 *   mirroring ActiveTaskPromptWidget). When idle with no task the previous
 *   stage/empty text is kept so the header never blanks.
 * @param {Object|null} [activeTask] - Resolved active task (title, goal).
 * @param {Object} [engineState] - Engine snapshot (activeStageName).
 * @param {boolean} [isRunning] - Engine currently executing.
 * @returns {string} Header text for the right-side element.
 * @example formatMobileMonitorTitle({ title: 'Build auth' }, {}, true)
 ***/
export function formatMobileMonitorTitle(activeTask = null, engineState = {}, isRunning = false) {
  // First-line extraction shares the markdown-strip rule with every other
  // title surface; the idle fallback chain below stays local to this header.
  const taskName = formatTaskTitleFirstLine(activeTask?.title || activeTask?.goal || '', '').trim();
  if (taskName) return taskName;
  if (isRunning) return 'No active task';
  return engineState?.activeStageName || 'No active stage';
}

/***
 * MARK: MobileMonitorView
 * @description Compact logs-only monitor: a slim status header (engine
 *   state, active task, model details) above the full live log console.
 *   Shown automatically on phone-narrow viewports and on desktop when the
 *   user explicitly requests it (right-click the header Monitor button).
 *   Reuses LiveConsoleWidget directly — no forked console implementation —
 *   and stays within 360px with no horizontal scroll (wrapping rows,
 *   truncation, min-width-zero flex children). The second header row shows
 *   the active run's harness/model (or `Automated — no model` on scripted
 *   stages), mirroring ActiveTaskPromptWidget on the main monitor view.
 * @param {Object} props
 * @param {Object} [props.engineState] - Engine snapshot (status, activeStageName).
 * @param {Object|null} [props.activeTask] - Resolved active task (title, goal, model, harness).
 * @param {Array<Object>} [props.stages] - Pipeline stages for the active task.
 * @param {boolean} [props.isAgentRunning] - Agent running flag (running fallback).
 * @param {Object} [props.stats] - Deprecated, ignored: kept so older callers passing task stats keep rendering.
 * @param {number} [props.queueCount] - Deprecated, ignored: kept so older callers passing queue length keep rendering.
 * @param {boolean} [props.schedulerRunning] - False renders STOPPED instead of IDLE.
 * @param {Array} [props.processLogs] - Log lines for the console.
 * @param {Function} [props.onClearLogs] - Clears the console.
 * @param {Function} [props.onExit] - Leaves the monitor (Back button).
 * @example <MobileMonitorView engineState={engineState} activeTask={activeTask} processLogs={logs} onExit={...} />
 ***/
export function MobileMonitorView({
  engineState = {},
  activeTask = null,
  stages = [],
  isAgentRunning = false,
  runnerTasks = [],
  runnerStages = [],
  // Deprecated, ignored: retained for backwards compatibility with callers
  // that still pass task stats / queue length (see JSDoc above).
  stats: _stats = {},
  queueCount: _queueCount = 0,
  schedulerRunning,
  processLogs = [],
  onClearLogs,
  onExit = () => {},
}) {
  void _stats;
  void _queueCount;
  const engineStatus = engineState?.status || (isAgentRunning ? 'running' : 'idle');
  const isRunning = isMonitorRunning(engineState, isAgentRunning);
  const isCheckpoint = engineStatus === 'checkpoint' || engineStatus === 'waiting_human';
  const isPaused = engineStatus === 'paused';
  const details = resolveMobileModelDetails(activeTask, engineState);

  return (
    <div
      data-testid="mobile-monitor-view"
      className="flex-1 flex flex-col min-h-0 h-full min-w-0 bg-[#0b0f17] text-slate-100 font-sans select-none overflow-hidden"
    >
      {/* Slim status header: Back + engine pill + task + model details */}
      <header className="px-2 py-1.5 bg-[#0f172a] border-b border-slate-800/80 shrink-0 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back to orchestrator"
            title="Back to orchestrator"
            className="px-2 py-0.5 min-h-[44px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-emerald-500 text-xs font-mono font-bold transition-colors cursor-pointer shrink-0"
          >
            ← Back
          </button>
          <span className="text-base shrink-0" aria-hidden="true">
            📡
          </span>
          <div className="min-w-0 shrink">
            <EngineStatePill
              engineState={engineState}
              activeTask={activeTask}
              stages={stages}
              isRunning={isRunning}
              isCheckpoint={isCheckpoint}
              isPaused={isPaused}
              schedulerRunning={schedulerRunning}
              testId="mobile-engine-state"
            />
          </div>
          <p
            data-testid="mobile-active-stage"
            title={formatMobileMonitorTitle(activeTask, engineState, isRunning)}
            className="flex-1 min-w-0 truncate text-xs font-mono text-slate-300 text-right"
          >
            {formatMobileMonitorTitle(activeTask, engineState, isRunning)}
          </p>
        </div>

        <div
          data-testid="mobile-monitor-model-details"
          className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-slate-300 max-w-full"
        >
          {details.isIdle ? (
            <span className="text-[11px] font-mono text-slate-300">Idle — no active model</span>
          ) : (
            <>
              {details.isScripted && (
                <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700 whitespace-nowrap">
                  <strong className="text-emerald-300">Automated — no model</strong>
                </span>
              )}
              {details.showAlias && (
                <span
                  className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700 inline-block truncate max-w-[160px]"
                  title={details.aliasTitle}
                >
                  alias:{' '}
                  <strong className="text-amber-300">
                    {details.aliasName || `${details.aliasMissing} (unresolved)`}
                  </strong>
                </span>
              )}
              {details.showHarness && (
                <span className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700 inline-block truncate max-w-[160px]">
                  Harness: <strong className="text-cyan-300">{details.harness}</strong>
                </span>
              )}
              {details.showModel && (
                <span
                  className="px-2 py-0.5 rounded bg-slate-800/90 text-slate-300 border border-slate-700 inline-block truncate max-w-[200px]"
                  title={details.modelRef || 'Model unavailable'}
                >
                  Model: <strong className="text-purple-300">{details.model.label}</strong>
                </span>
              )}
              {details.showProviderLine && (
                <span className="w-full text-[10px] font-mono text-slate-300 truncate">
                  Provider: {details.provider || 'Unknown'} · Source: {details.source || 'unknown'}
                </span>
              )}
            </>
          )}
        </div>
      </header>

      {/* Per-runner compact rows: who runs what, for how long */}
      <div className="shrink-0 max-h-40 overflow-y-auto border-b border-slate-800/80 px-2 py-1">
        <PerRunnerTasksWidget tasks={runnerTasks} stages={runnerStages} compact />
      </div>

      {/* Full-height live log console (filters, auto-scroll, clear intact) */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full">
        <LiveConsoleWidget processLogs={processLogs} onClearLogs={onClearLogs} />
      </div>
    </div>
  );
}

export default MobileMonitorView;
