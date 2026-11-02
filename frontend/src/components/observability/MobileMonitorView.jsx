import { isMonitorRunning } from '../tasks/isMonitorRunning';
import { PerRunnerTasksWidget, useRunnerMonitor } from './widgets/PerRunnerTasksWidget';
import { formatTaskTitleFirstLine } from '../tasks/taskFormatters';
import { EngineStatePill } from './EngineStatePill';
import { resolveMobileModelDetails } from './mobileModelDetails';
import { resolveMobileHeaderMode } from './mobileHeaderMode';
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
 * MARK: resolveMobileModelLine
 * @description Compresses the header's model details into one truncated
 *   line (`alias · Harness · Model · Provider/Source`, full text in the
 *   `title` tooltip) so the compact header stays at two rows on 360px
 *   viewports. Presentation only: the resolver semantics
 *   (`resolveMobileModelDetails`, mirroring ActiveTaskPromptWidget) are
 *   reused untouched. Null renders the idle fallback; scripted stages keep
 *   the `Automated — no model` wording. Fails safe: null details render
 *   the idle fallback, and any missing label renders as `Unknown` — a
 *   half-shaped payload can never crash the header or print `undefined`.
 * @param {Object|null} [details] - The resolved model details.
 * @returns {{line: string, title: string}|null} Single-line text plus tooltip, or null for the idle fallback.
 * @example resolveMobileModelLine(resolveMobileModelDetails({ model: 'pi::pi::qwen3:8b', harness: 'pi' }, {})).line // 'Harness: pi · Model: qwen3:8b · Provider: pi · Source: unknown'
 ***/
export function resolveMobileModelLine(details = {}) {
  if (details == null || details.isIdle) return null;
  if (details.isScripted) return { line: 'Automated — no model', title: 'Automated — no model' };
  const parts = [];
  const titleParts = [];
  if (details.showAlias) {
    const aliasName =
      details.aliasName ||
      (details.aliasMissing ? `${details.aliasMissing} (unresolved)` : 'Unknown');
    const alias = `alias: ${aliasName}`;
    parts.push(alias);
    titleParts.push(details.aliasTitle ? `${alias} (${details.aliasTitle})` : alias);
  }
  if (details.showHarness) {
    const harness = `Harness: ${details.harness || 'Unknown'}`;
    parts.push(harness);
    titleParts.push(harness);
  }
  if (details.showModel) {
    // The line truncates to the short label; the tooltip keeps the full ref
    // so a long model identifier is never lost at 360px.
    const modelLabel = details.model?.label || details.modelRef || 'Unknown';
    parts.push(`Model: ${modelLabel}`);
    titleParts.push(`Model: ${details.modelRef || modelLabel}`);
  }
  if (details.showProviderLine) {
    const provider = `Provider: ${details.provider || 'Unknown'} · Source: ${details.source || 'unknown'}`;
    parts.push(provider);
    titleParts.push(provider);
  }
  const line = parts.join(' · ') || 'Idle — no active model';
  return { line, title: titleParts.join(' · ') || line };
}

/***
 * MARK: MobileMonitorView
 * @description Compact logs-only monitor: a two-row compressed status
 *   header above the full live log console. Shown automatically on
 *   phone-narrow viewports and on desktop when the user explicitly requests
 *   it (right-click the header Monitor button). Row 1 carries Back, the
 *   active chip, and — only when no Runner fleet is configured — the
 *   legacy global engine pill; with runners shown the per-runner rows are
 *   the status signal (mirroring `NowPlayingBar` fleet mode) and the chip
 *   names the task plus its stage (`<task> · <stage>`). Row 2 is a single
 *   truncated model-details line (full text in the tooltip), mirroring
 *   ActiveTaskPromptWidget on the main monitor view. Reuses
 *   LiveConsoleWidget directly — no forked console implementation — and
 *   stays within 360px with no horizontal scroll (truncation,
 *   min-width-zero flex children).
 * @param {Object} props
 * @param {Object} [props.engineState] - Engine snapshot (status, activeStageName).
 * @param {Object|null} [props.activeTask] - Resolved active task (title, goal, model, harness).
 * @param {Array<Object>} [props.stages] - Pipeline stages for the active task.
 * @param {boolean} [props.isAgentRunning] - Agent running flag (running fallback).
 * @param {Array<Object>} [props.runnerTasks] - Tasks for the per-runner rows (titles resolve by id).
 * @param {Array<Object>} [props.runnerStages] - Stages for the per-runner rows (stage names resolve by id).
 * @param {Object} [props.stats] - Deprecated, ignored: kept so older callers passing task stats keep rendering.
 * @param {number} [props.queueCount] - Deprecated, ignored: kept so older callers passing queue length keep rendering.
 * @param {boolean} [props.schedulerRunning] - False renders STOPPED instead of IDLE.
 * @param {Array} [props.processLogs] - Log lines for the console.
 * @param {Function} [props.onClearLogs] - Clears the console.
 * @param {Function} [props.onExit] - Leaves the monitor (Back button).
 * @param {Array<Object>} [props.runnerAssignmentsOverride] - Injected live fleet assignments (tests); skips polling while set.
 * @param {Map|Array} [props.runnerRegistryOverride] - Injected Runner registry (tests); skips polling while set.
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
  runnerAssignmentsOverride,
  runnerRegistryOverride,
}) {
  void _stats;
  void _queueCount;
  const engineStatus = engineState?.status || (isAgentRunning ? 'running' : 'idle');
  const isRunning = isMonitorRunning(engineState, isAgentRunning);
  const isCheckpoint = engineStatus === 'checkpoint' || engineStatus === 'waiting_human';
  const isPaused = engineStatus === 'paused';
  const details = resolveMobileModelDetails(activeTask, engineState);
  // Single fleet poller for the header + the compact runner rows (the rows
  // reuse the same state via overrides so one tick issues one fleet read).
  const skipFleetPoll =
    runnerAssignmentsOverride !== undefined || runnerRegistryOverride !== undefined;
  const fleet = useRunnerMonitor({ enabled: !skipFleetPoll });
  const fleetAssignments =
    runnerAssignmentsOverride !== undefined ? runnerAssignmentsOverride : fleet.assignments;
  const fleetRegistry =
    runnerRegistryOverride !== undefined ? runnerRegistryOverride : fleet.registry;
  const headerMode = resolveMobileHeaderMode({
    assignments: fleetAssignments,
    registry: fleetRegistry,
    activeTask,
    stages,
    engineState,
  });
  // Pill-on (no fleet): legacy split — pill names the stage, title the task.
  // Pill-off (fleet shown): one named chip, `<task> · <stage>`, so the stage
  // still appears exactly once in the header.
  const activeChipLabel = !headerMode.showEnginePill && headerMode.activeChip
    ? headerMode.activeChip.label
    : formatMobileMonitorTitle(activeTask, engineState, isRunning);
  const modelLine = resolveMobileModelLine(details);

  return (
    <div
      data-testid="mobile-monitor-view"
      className="flex-1 flex flex-col min-h-0 h-full min-w-0 bg-[#0b0f17] text-slate-100 font-sans select-none overflow-hidden"
    >
      {/* Compressed status header: Back + named chip (+ engine pill only with no fleet) + one model line */}
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
          {headerMode.showEnginePill && (
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
          )}
          <p
            data-testid="mobile-active-stage"
            title={activeChipLabel}
            className="flex-1 min-w-0 truncate text-xs font-mono text-slate-300 text-right"
            {...(headerMode.showEnginePill
              ? {}
              : { role: 'status', 'aria-live': 'polite' })}
          >
            {activeChipLabel}
          </p>
        </div>

        <div
          data-testid="mobile-monitor-model-details"
          title={modelLine?.title}
          className="mt-1 max-w-full truncate whitespace-nowrap text-[11px] font-mono text-slate-300"
        >
          {modelLine ? modelLine.line : 'Idle — no active model'}
        </div>
      </header>

      {/* Per-runner compact rows: who runs what, for how long */}
      <div className="shrink-0 max-h-40 overflow-y-auto border-b border-slate-800/80 px-2 py-1">
        <PerRunnerTasksWidget
          tasks={runnerTasks}
          stages={runnerStages}
          compact
          assignmentsOverride={fleetAssignments}
          registryOverride={fleetRegistry}
        />
      </div>

      {/* Full-height live log console (filters, auto-scroll, clear intact) */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full">
        <LiveConsoleWidget processLogs={processLogs} onClearLogs={onClearLogs} />
      </div>
    </div>
  );
}

export default MobileMonitorView;
