import React from 'react';

import { formatTaskKey, formatTaskTitleFirstLine } from '../tasks/taskFormatters';
import { InfoTooltip } from '../common/InfoTooltip';

/***
 * MARK: EngineStatusChip
 * @description Compact engine status chip (dot + status badge + stuck-queue
 *   chip) that stays visible beside the runner boxes in box mode (plan q8:
 *   the badge encodes dispatcher state, which is global, not per-runner).
 *   Same classes and labels as the legacy left view so the two modes agree.
 * @example <EngineStatusChip dotClasses="bg-[#7bdb85] pulse-agent" badgeClasses="text-primary-fixed bg-[#7bdb85]/20 border-[#7bdb85]/40 shadow-sm" statusBadge="RUNNING" statusDesc="Actively executing." statusBehind="Streaming tokens." busyWhileIdle={false} />
 * @param {Object} props - Component props.
 * @param {string} props.dotClasses - Decorative dot classes (aria-hidden).
 * @param {string} props.badgeClasses - Badge tone classes.
 * @param {string} props.statusBadge - Badge text (IDLE/RUNNING/PAUSED/FAILED/...).
 * @param {string} props.statusDesc - Tooltip description.
 * @param {string} props.statusBehind - Tooltip behind-the-scenes text.
 * @param {boolean} props.busyWhileIdle - Shows the stuck-queue chip when true.
 * @returns {React.ReactElement} The chip.
 ***/
export const EngineStatusChip = ({
  dotClasses,
  badgeClasses,
  statusBadge,
  statusDesc,
  statusBehind,
  busyWhileIdle,
}) => (
  <div className="flex shrink-0 items-center gap-1.5">
    <div
      className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${dotClasses}`}
      aria-hidden="true"
    />
    <InfoTooltip
      title={`Engine Status: ${statusBadge}`}
      description={statusDesc}
      behindTheScenes={statusBehind}
      position="top-left"
    >
      <span
        className={`text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border cursor-help ${badgeClasses}`}
        aria-label={`Engine status is ${statusBadge}`}
      >
        {statusBadge}
      </span>
    </InfoTooltip>
    {/* Wedge signal: the queue claims to run while the engine reads
        idle with no owner. Auto-recovery settles it on the next
        scheduler tick, but a calm IDLE badge alone would hide the
        stall — so the stuck state gets its own chip while it lasts.
        (Bound to `engineState.busyWhileIdle` from GET /engine/state;
        no extra plumbing: it rides the existing ENGINE_STATE feed.) */}
    {busyWhileIdle === true && (
      <span
        className="text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border cursor-help text-warning bg-warning/20 border-warning/40 shadow-sm"
        role="status"
        aria-label="Execution queue is stuck while the engine is idle; the scheduler is recovering it automatically"
        title="The execution queue is latched by a run that never settled. The scheduler force-settles it automatically and the stuck task is queued for retry — no action needed, but check the run before trusting its output."
      >
        Queue stuck — recovering
      </span>
    )}
  </div>
);

/***
 * MARK: NowPlayingBarLeft
 * @description The legacy Now Playing left column, extracted byte-identical
 *   (Phase A seam): status dot, `Active Task` label, provenance chip, status
 *   badge, stuck-queue chip, and the clickable task title that opens the
 *   slide-over inspector. The bar renders this whenever runner boxes are
 *   off (0 or 5+ entries, kill switch, or no runner data) — its output must
 *   stay identical to the pre-boxes bar.
 * @example <NowPlayingBarLeft activeTask={null} displayedStageName={null} statusBadge="IDLE" badgeClasses="text-text-muted bg-surface-container border-border-standard" dotClasses="bg-text-muted" statusDesc="Idle." statusBehind="Dispatcher sleeping." activeWorkflowLabel="" engineState={{ status: 'idle' }} isRunning={false} isStagePaused={false} setSelectedTask={() => {}} />
 * @param {Object} props - Component props (values the bar already computes).
 * @param {Object|null} props.activeTask - Gated display task (null while idle).
 * @param {string|null} props.displayedStageName - Resolved stage name for the task.
 * @param {string} props.statusBadge - Badge text.
 * @param {string} props.badgeClasses - Badge tone classes.
 * @param {string} props.dotClasses - Decorative dot classes.
 * @param {string} props.statusDesc - Tooltip description.
 * @param {string} props.statusBehind - Tooltip behind-the-scenes text.
 * @param {string} props.activeWorkflowLabel - Owning-pipeline provenance label.
 * @param {Object} props.engineState - Engine snapshot (project name, wedge flag).
 * @param {boolean} props.isRunning - Engine/agent running flag.
 * @param {boolean} props.isStagePaused - Paused flag for the idle-word fallback.
 * @param {Function} props.setSelectedTask - Opens the task inspector.
 * @returns {React.ReactElement} The legacy left column.
 ***/
export function NowPlayingBarLeft({
  activeTask,
  displayedStageName,
  statusBadge,
  badgeClasses,
  dotClasses,
  statusDesc,
  statusBehind,
  activeWorkflowLabel,
  engineState,
  isRunning,
  isStagePaused,
  setSelectedTask,
}) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      <div
        className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${dotClasses}`}
        aria-hidden="true"
      />
      <div className="flex flex-col min-w-0" role="status" aria-live="polite">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="font-label-caps text-[9px] sm:text-label-caps text-secondary uppercase truncate">
            Active Task
          </span>
          {engineState?.activeProjectName && (
            <span className="text-[9px] text-text-muted font-mono truncate hidden sm:inline">
              [{engineState.activeProjectName}]
            </span>
          )}
          <InfoTooltip
            title={`Engine Status: ${statusBadge}`}
            description={statusDesc}
            behindTheScenes={statusBehind}
            position="top-left"
          >
            <span
              className={`text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border cursor-help ${badgeClasses}`}
              aria-label={`Engine status is ${statusBadge}`}
            >
              {statusBadge}
            </span>
          </InfoTooltip>
          {/* Wedge signal: the queue claims to run while the engine reads
              idle with no owner. Auto-recovery settles it on the next
              scheduler tick, but a calm IDLE badge alone would hide the
              stall — so the stuck state gets its own chip while it lasts.
              (Bound to `engineState.busyWhileIdle` from GET /engine/state;
              no extra plumbing: it rides the existing ENGINE_STATE feed.) */}
          {engineState?.busyWhileIdle === true && (
            <span
              className="text-[8px] sm:text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border cursor-help text-warning bg-warning/20 border-warning/40 shadow-sm"
              role="status"
              aria-label="Execution queue is stuck while the engine is idle; the scheduler is recovering it automatically"
              title="The execution queue is latched by a run that never settled. The scheduler force-settles it automatically and the stuck task is queued for retry — no action needed, but check the run before trusting its output."
            >
              Queue stuck — recovering
            </span>
          )}
        </div>
        {/* Clickable Active Task Card / Title to open Task Inspector (#21) */}
        <InfoTooltip
          title="Inspect Active Task"
          description="Click to open the Slide-Over Inspector for live logs, markdown goals, and reports."
          behindTheScenes="Loads task details and disk-persisted reports from docs/tasks/<id>/"
          position="top"
        >
          <button
            type="button"
            onClick={() => activeTask && setSelectedTask?.(activeTask)}
            disabled={!activeTask}
            aria-label={
              activeTask
                ? `Open active task ${activeTask.goal || activeTask.title || activeTask.id} in inspector`
                : 'No active task'
            }
            className="flex items-center gap-1.5 sm:gap-2 min-w-0 mt-0.5 text-left cursor-pointer hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded-xs group disabled:cursor-default disabled:no-underline"
          >
            {/* Task name clears while idle (no lingering last-task label);
                the keyed wrapper remounts on every task/idle swap so the
                entrance animation replays. The key chip only ever shows a
                real task key — never a fabricated fallback. */}
            <span
              key={activeTask?.id ?? 'idle'}
              data-testid={activeTask ? 'now-playing-task-name' : 'now-playing-idle-hint'}
              className={
                activeTask
                  ? 'now-playing-task-enter font-headline-sm text-xs sm:text-headline-sm text-on-surface group-hover:text-primary transition-colors truncate'
                  : 'font-headline-sm text-xs sm:text-headline-sm text-text-muted truncate'
              }
            >
              {activeTask
                ? `${activeWorkflowLabel ? `${activeWorkflowLabel} | ` : ''}${
                    formatTaskTitleFirstLine(activeTask, '') ||
                    (isRunning
                      ? 'Executing Orchestration...'
                      : isStagePaused
                        ? 'Stage Paused'
                        : 'Idle')
                  }`
                : 'No active task — engine idle'}
            </span>
            {/* Show active stage name when a task is running */}
            {displayedStageName && (
              <span className="text-xs text-text-muted ml-2">{`Stage: ${displayedStageName}`}</span>
            )}
            {activeTask && (
              <span className="font-mono text-xs font-semibold text-text-muted group-hover:text-primary transition-colors shrink-0 hidden md:inline">
                {formatTaskKey(activeTask.id)}
              </span>
            )}
          </button>
        </InfoTooltip>
      </div>
    </div>
  );
}
