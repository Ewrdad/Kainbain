import { resolveDisplayedStage } from '../tasks/runningTask';

/***
 * MARK: EngineStatePill
 * @description Glowing engine-state badge shared by the full observability
 *   header and the compact mobile monitor header: one pill implementation,
 *   one status vocabulary (ACTIVE stage / CHECKPOINT / PAUSED / STOPPED /
 *   IDLE). Visual markup matches the original dashboard header exactly.
 *   The running stage name is derived from the active task's pipeline stage
 *   (via `resolveDisplayedStage`) rather than read raw from the engine
 *   snapshot, so a manual move can never leave the pill naming the stage the
 *   task just left (task 072e2cfa).
 * @param {Object} props
 * @param {Object} [props.engineState] - Engine snapshot (status, activeStageName).
 * @param {Object|null} [props.activeTask] - The engine owner task (currentStageId).
 * @param {Array<Object>} [props.stages] - Pipeline stages for the active task.
 * @param {boolean} [props.isRunning] - Engine currently executing.
 * @param {boolean} [props.isCheckpoint] - Waiting on a human checkpoint.
 * @param {boolean} [props.isPaused] - Engine paused.
 * @param {boolean} [props.schedulerRunning] - False renders STOPPED instead of IDLE.
 * @param {string} [props.testId] - Test hook id (differs per host view).
 * @example <EngineStatePill engineState={engineState} isRunning testId="engine-state-badge" />
 ***/
export function EngineStatePill({
  engineState = {},
  activeTask = null,
  stages = [],
  isRunning = false,
  isCheckpoint = false,
  isPaused = false,
  schedulerRunning,
  testId = 'engine-state-badge',
}) {
  const displayedStage = resolveDisplayedStage(activeTask, stages, engineState);
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold tracking-wider uppercase border transition-all ${
        isRunning
          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/80 shadow-[0_0_12px_rgba(16,185,129,0.3)] animate-pulse'
          : isCheckpoint
            ? 'bg-amber-950/80 text-amber-300 border-amber-500/80 shadow-[0_0_12px_rgba(245,158,11,0.3)] animate-pulse'
            : isPaused
              ? 'bg-yellow-950/80 text-yellow-300 border-yellow-500/80'
              : 'bg-slate-800 text-slate-300 border-slate-700'
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          isRunning
            ? 'bg-emerald-400 animate-ping'
            : isCheckpoint
              ? 'bg-amber-400'
              : isPaused
                ? 'bg-yellow-400'
                : 'bg-slate-400'
        }`}
      />
      <span className="truncate max-w-[150px] sm:max-w-[240px]">
        {isRunning
          ? `ACTIVE: ${displayedStage?.name || 'RUNNING'}`
          : isCheckpoint
            ? 'CHECKPOINT'
            : isPaused
              ? 'PAUSED'
              : schedulerRunning === false
                ? 'STOPPED'
                : 'IDLE'}
      </span>
    </div>
  );
}

export default EngineStatePill;
