import React, { useEffect, useState, useRef } from 'react';
import { runnerBoxHealth } from './runnerBoxHealth.js';
import { resolveRunnerBoxes } from './resolveRunnerBoxes.js';
import { useNowPlayingRunnerDirectory } from './useNowPlayingRunnerDirectory.js';

import { useKainBain } from '../../context/KainBainContext';
import { formatTaskKey, formatTaskTitleFirstLine } from '../tasks/taskFormatters';
import { resolveDisplayedStage } from '../tasks/runningTask';
import { resolveActiveTaskDisplay, resolveUniversalNowPlaying } from './activeTaskVisibility';
import { InfoTooltip } from '../common/InfoTooltip';
import { api } from '../../services/api';
export { runnerBoxHealth } from './runnerBoxHealth.js';
export { resolveRunnerBoxes } from './resolveRunnerBoxes.js';

/***
 * MARK: NowPlayingBar
 * @description The persistent "Now Playing" bar. Anchored to the bottom of
 * the viewport (72px height). Shows the global engine state (status badge:
 * IDLE, RUNNING, CHECKPOINT, PAUSED), one box per configured Runner (fleet
 * roster, running or idle) with its own play/pause + skip, and the live
 * execution queue depth (right rail, queue chip only).
 *
 * There is no global transport cluster: the Runner boxes own play/pause
 * (pause parks a Runner, resume re-arms it) and skip (advances that
 * Runner's held task one stage). The right rail shows honest, live data:
 * the open-task count across all pipelines (queue depth) only.
 *
 * Universal contract: the engine owns a single queue fed by every pipeline,
 * so this bar never follows the selected pipeline. The named task and badge
 * resolve from the engine owner (engineState.activeTaskId).
 * Switching pipelines only changes the board/canvas view. The owning
 * pipeline's name is kept purely as a provenance chip in the title.
 *
 * Idle contract: with no Runners configured and no running task, no task
 * title, goal text, or task key is shown — the bar shows a plain "No active
 * task — engine idle" hint and the inspector button is disabled with
 * aria-label "No active task". The name reappears (with a short fade/slide
 * entrance on its wrapper only — never on the badge text) as soon as the
 * engine leaves idle. Paused, failed, interrupted, and checkpoint states
 * keep naming their task so the user knows what needs attention.
 *
 * @example <NowPlayingBar />
 ***/


/***
 * MARK: runnerBoxDotClass / runnerBoxHealthLabel
 * @description Explicit branches (never dynamic indexing) for the box colour
 * dot and its accessible health text: live green, stale amber, unknown grey.
 ***/
const runnerBoxDotClass = (health) => {
  if (health === 'stale') return 'bg-warning';
  if (health === 'unknown') return 'bg-text-muted';
  return 'bg-[#7bdb85]';
};

const runnerBoxHealthLabel = (health) => {
  if (health === 'stale') return 'stale heartbeat';
  if (health === 'unknown') return 'health unknown';
  return 'healthy';
};

/***
 * MARK: runnerBoxVisibilityCap
 * @description At most this many boxes render in the 72px bar; the header
 *   count stays honest about the whole fleet and a "+N more" chip names
 *   the overflow. The data layer never hides runners — only the render
 *   slices — so the count always matches the configured fleet.
 * @example MAX_VISIBLE_RUNNER_BOXES => 4
 * ***/
export const MAX_VISIBLE_RUNNER_BOXES = 4;



/***
 * MARK: NowPlayingBar
 * @description Fleet status bar: 72px runner boxes plus the currently-playing track.
 * @example <NowPlayingBar />
 ***/
export function NowPlayingBar() {
  const {
    isAgentRunning,
    workflows,
    tasks,
    stages = [],
    engineState,
    setSelectedTask,
    runnerAssignments: runnerAssignmentsOverride,
    runners: runnersOverride,
    pauseRunner,
    resumeRunner,
    skipRunner,
  } = useKainBain();

  // Universal display: the engine owns one queue across all pipelines, so the
  // named task, badge flags, and idle gate all resolve from the task list +
  // engine state only — pipeline view state never influences what this bar
  // names.
  const { activeTask, isFailed, isInterrupted, isStagePaused, isRunning, isCheckpoint } =
    resolveActiveTaskDisplay({
      tasks,
      engineState,
      currentStageId: null,
      isAgentRunning,
      currentStage: null,
    });
  const universal = resolveUniversalNowPlaying({ tasks, engineState });
  // Resolved once per render: the stage the running task is actually in
  // (its pipeline stage, never a stranded engine snapshot — task 072e2cfa).
  const displayedStageName = activeTask
    ? (resolveDisplayedStage(activeTask, stages, engineState)?.name ?? null)
    : null;

  // Runner boxes: one little box per configured Runner (name, task, stage,
  // health dot, play/pause + skip) — idle Runners keep their box so the bar
  // always reads as the fleet roster. Only with no Runners configured at all
  // does the legacy single-task display remain.
  const { assignments: runnerAssignments, runners: runnerRegistryList } =
    useNowPlayingRunnerDirectory(runnerAssignmentsOverride, runnersOverride);
  const runnerBoxes = resolveRunnerBoxes({
    assignments: runnerAssignments,
    tasks,
    stages,
    runners: runnerRegistryList,
  });
  const showRunnerBoxes = runnerBoxes.length > 0;
  const visibleRunnerBoxes = showRunnerBoxes
    ? runnerBoxes.slice(0, MAX_VISIBLE_RUNNER_BOXES)
    : [];
  const hiddenRunnerCount = showRunnerBoxes
    ? runnerBoxes.length - visibleRunnerBoxes.length
    : 0;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!showRunnerBoxes) return undefined;
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [showRunnerBoxes]);

  let statusBadge = 'IDLE';
  let badgeClasses = 'text-text-muted bg-surface-container border-border-standard';
  let dotClasses = 'bg-text-muted';
  let statusDesc = 'Engine is idle and waiting for tasks or start trigger.';
  let statusBehind = 'Task dispatcher is sleeping; no background processes active.';

  /***
   * MARK: engineStatusBadgeStyles
   * @description WCAG 1.4.3 (AA) contract for the badge text: text colours use
   *   the theme's high-contrast "fixed" tokens (>= 4.5:1 against the tinted
   *   footer surface), and the badge text itself never animates its opacity —
   *   animate-pulse drops text contrast below the threshold mid-fade, which
   *   axe flags as a serious violation. The pulsing "engine alive" cue lives
   *   on the decorative dot instead (aria-hidden, no text).
   ***/

  if (isFailed) {
    statusBadge = 'FAILED';
    badgeClasses = 'text-error bg-error/20 border-error/40 shadow-sm font-bold';
    dotClasses = 'bg-error shadow-[0_0_8px_rgba(248,81,73,0.6)]';
    statusDesc = 'Stage execution or automated verification script failed.';
    statusBehind =
      'Exit code non-zero or exception encountered. Retries or fallback routing triggered.';
  } else if (isInterrupted) {
    statusBadge = 'INTERRUPTED';
    badgeClasses = 'text-warning bg-warning/20 border-warning/40 shadow-sm';
    dotClasses = 'bg-warning shadow-[0_0_8px_rgba(234,179,8,0.6)]';
    statusDesc = 'Server restarted mid-execution. State safely saved on disk.';
    statusBehind =
      'Task state preserved in ~/.kainbain/projects/. Resume or retry stage at any time.';
  } else if (isStagePaused) {
    statusBadge = 'PAUSED';
    badgeClasses = 'text-[#ffe0b2] bg-black/50 border-[#ffb77f] shadow-sm';
    dotClasses = 'bg-[#ffe0b2] animate-pulse';
    statusDesc = 'Stage execution paused by configuration or manual stop.';
    statusBehind = 'Incoming tasks held in stage without auto-dispatching agent.';
  } else if (isRunning) {
    statusBadge = 'RUNNING';
    badgeClasses = 'text-primary-fixed bg-[#7bdb85]/20 border-[#7bdb85]/40 shadow-sm';
    dotClasses = 'bg-[#7bdb85] pulse-agent';
    statusDesc = 'Autonomous agent or CI test runner is actively executing.';
    statusBehind = 'Streaming model reasoning tokens and tool invocations via WebSocket (/ws).';
  } else if (isCheckpoint) {
    statusBadge = engineState?.status === 'waiting_human' ? 'WAITING_HUMAN' : 'CHECKPOINT';
    badgeClasses = 'text-secondary-fixed bg-[#9acbff]/20 border-[#9acbff]/40 shadow-sm';
    dotClasses = 'bg-[#9acbff]';
    statusDesc = 'Workflow paused at human quality gate awaiting review approval.';
    statusBehind =
      'Task dispatcher waiting for user to click Approve or Reject in Task Card / Inspector.';
  }

  // Owning-pipeline provenance chip. Named workflow objects expose
  // `.id`/`.name`, while workflow-run objects expose `.workflowId` (the
  // pipeline id) + `.id` (the run id) — prefer the human-readable name, then
  // the pipeline id. Resolved from the UNIVERSAL candidate's workflow, never
  // the selected pipeline: switching pipelines must not move this label.
  const ownerWorkflow =
    (universal.ownerWorkflowId &&
      workflows.find(
        (w) => w.id === universal.ownerWorkflowId || w.workflowId === universal.ownerWorkflowId,
      )) ||
    null;
  const activeWorkflowLabel =
    ownerWorkflow?.name ||
    universal.ownerWorkflowName ||
    ownerWorkflow?.workflowId ||
    ownerWorkflow?.id ||
    universal.ownerWorkflowId ||
    '';

  // Universal queue semantics (#28): the single engine queue spans every
  // pipeline, so depth counts all open tasks across ALL projects via the
  // engine snapshot's openQueueDepth (the loaded list is only the active
  // project's slice).
  /***
   * MARK: queueDepth
   * @description Live count of open tasks (not completed/done) across all
   *   pipelines — the honest replacement for the removed workflow-pointer
   *   stage label in the right rail. Resolved from the engine snapshot's
   *   openQueueDepth (global, all projects), falling back to the loaded
   *   list only when the snapshot carries no count, so project switches
   *   never move it.
   * @example queueDepth // => 3
   * @returns {number}
   ***/
  const queueDepth = universal.queueDepth;

  return (
    <footer className="fixed bottom-0 left-0 w-full h-[72px] z-50 bg-surface-container-highest border-t border-border-standard shadow-lg flex items-center justify-between px-3 sm:px-6 md:px-8 pb-[env(safe-area-inset-bottom,0px)]">
      {/* Left: Global Status, Active Project & Context
          On mobile the bar shows only the runner boxes (or the task hint
          when no Runners are configured), so this side flexes to fill the
          space freed by the hidden right rail. */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div
            className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0 ${dotClasses}`}
            aria-hidden="true"
          />
          <div className="flex flex-col min-w-0" role="status" aria-live="polite">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-label-caps text-[9px] sm:text-label-caps text-secondary uppercase truncate">
                {showRunnerBoxes ? `Runners ${runnerBoxes.length}` : 'Active Task'}
              </span>
              {engineState?.activeProjectName && (
                <span className="text-[9px] text-text-muted font-mono truncate hidden sm:inline">
                  [{engineState.activeProjectName}]
                </span>
              )}
              {/* Fleet mode (runner boxes shown) carries no engine-status pill:
                  per-runner boxes already name each Runner's live state, so a
                  single global CHECKPOINT/RUNNING/IDLE chip misleads — the
                  header reads as just "Runners n". The pill stays in the
                  legacy single-task display where it is the only signal. */}
              {!showRunnerBoxes && (
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
              )}
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
            {/* Runner boxes: one box per configured Runner — running or idle —
                each with its name, task, stage, heartbeat dot, and its own
                play/pause + skip. Clicking the runner info opens the same
                Slide-Over Inspector as the task card. */}
            {showRunnerBoxes ? (
              <div
                data-testid="now-playing-runner-boxes"
                role="group"
                aria-label={`${runnerBoxes.length} ${runnerBoxes.length === 1 ? 'runner' : 'runners'}`}
                className="flex items-center gap-1.5 mt-0.5 min-w-0 max-w-full overflow-hidden"
              >
                {visibleRunnerBoxes.map((box) => {
                  const health = runnerBoxHealth(box.lastSeenAt, nowMs);
                  const stateLabel = box.idle
                    ? 'idle, no task assigned'
                    : `${box.paused ? 'paused' : 'active'}, task: ${box.taskName}, stage: ${box.stageName}`;
                  return (
                    <div
                      key={box.runnerId}
                      data-testid={`now-playing-runner-box-${box.runnerId}`}
                      role="group"
                      aria-label={`Runner ${box.runnerId}: ${stateLabel}, health: ${runnerBoxHealthLabel(health)}`}
                      className="flex items-center gap-1.5 min-w-0 max-w-[280px] px-2 py-1 rounded bg-surface-container border border-border-standard shrink-0"
                    >
                      {/* Health indicator */}
                      <span
                        data-testid={`now-playing-runner-health-${box.runnerId}`}
                        data-health={health}
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full shrink-0 ${runnerBoxDotClass(health)}`}
                      />
                      {/* Runner info - click to inspect task */}
                      <button
                        type="button"
                        onClick={() => box.task && setSelectedTask?.(box.task)}
                        disabled={!box.task}
                        aria-label={`Inspect task for runner ${box.runnerId}`}
                        title={
                          box.task
                            ? `Inspect task for runner ${box.runnerId}`
                            : `Runner ${box.runnerId} is idle`
                        }
                        className="flex flex-col min-w-0 leading-tight flex-1 text-left cursor-pointer hover:text-on-surface transition-colors disabled:cursor-default disabled:no-underline"
                      >
                        <span className="font-mono text-[11px] font-semibold text-on-surface truncate">
                          {box.runnerId}
                        </span>
                        <span className="text-[11px] text-text-muted truncate">{box.taskName}</span>
                        <span className="font-mono text-[10px] text-text-muted truncate">
                          {box.stageName}
                        </span>
                      </button>
                      {/* Per-runner play/pause + skip: the only transport left
                          in the bar. Pause parks the Runner (in-flight work
                          finishes, nothing new is picked up); skip advances
                          its held task one stage. */}
                      <div className="flex items-center gap-0.5 ml-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (box.paused) resumeRunner?.(box.runnerId);
                            else pauseRunner?.(box.runnerId);
                          }}
                          aria-label={`${box.paused ? 'Resume' : 'Pause'} runner ${box.runnerId}`}
                          title={`${box.paused ? 'Resume' : 'Pause'} runner ${box.runnerId}`}
                          className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded text-text-muted hover:text-primary hover:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">
                            {box.paused ? 'play_arrow' : 'pause'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => skipRunner?.(box.runnerId)}
                          disabled={box.idle}
                          aria-label={`Skip current task for runner ${box.runnerId}`}
                          title={
                            box.idle
                              ? `Runner ${box.runnerId} holds no task to skip`
                              : `Skip current task for runner ${box.runnerId}`
                          }
                          className="min-w-[28px] min-h-[28px] flex items-center justify-center rounded text-text-muted hover:text-ochre hover:bg-surface-container-highest focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer disabled:opacity-25 disabled:cursor-default"
                        >
                          <span className="material-symbols-outlined text-base" aria-hidden="true">
                            skip_next
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
                {hiddenRunnerCount > 0 && (
                  <span
                    data-testid="now-playing-runner-overflow"
                    title={`Also configured: ${runnerBoxes
                      .slice(MAX_VISIBLE_RUNNER_BOXES)
                      .map((box) => box.runnerId)
                      .join(', ')}`}
                    className="text-[11px] font-mono text-text-muted shrink-0 px-1"
                  >
                    +{hiddenRunnerCount} more
                  </span>
                )}
              </div>
            ) : (
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
                    <span className="text-xs text-text-muted ml-2">
                      {`Stage: ${displayedStageName}`}
                    </span>
                  )}
                  {activeTask && (
                    <span className="font-mono text-xs font-semibold text-text-muted group-hover:text-primary transition-colors shrink-0 hidden md:inline">
                      {formatTaskKey(activeTask.id)}
                    </span>
                  )}
                </button>
              </InfoTooltip>
            )}
          </div>
        </div>
      </div>

      {/* Right: queue depth only. The elapsed timer and the subsystem
          health traffic light were removed — the right rail is now just the
          live queue-depth chip. Single child, so there is no overlap path
          with the runner boxes; overflow-hidden stays as cheap insurance
          (tooltips are portal-rendered to document.body, so they are not
          clipped). A canary e2e gate checks button-vs-rail rect
          intersections at 640/768/800/900/1024/1280px (functional.spec.js). */}
      <div
        data-testid="now-playing-right-rail"
        className="hidden sm:flex items-center justify-end flex-none min-w-0 overflow-hidden"
      >
        {/* Live queue-depth chip: universal queue depth across all pipelines.
            role="status" (aria-live polite) so screen readers hear the count
            change as tasks advance. No text animation — WCAG 1.4.3 contract. */}
        <InfoTooltip
          title="Execution Queue"
          description="Live count of open tasks (not yet completed) across all pipelines."
          behindTheScenes="Derived from the universal task list across all pipelines on every render — unlike the removed workflow-pointer stage label, which only changed on load or manual skip."
          position="top-left"
        >
          <div
            role="status"
            aria-label={`Execution queue: ${queueDepth} open ${
              queueDepth === 1 ? 'task' : 'tasks'
            } across all pipelines`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-container/90 border border-border-standard/80 cursor-help select-none"
          >
            <span
              className="material-symbols-outlined text-[14px] text-secondary"
              aria-hidden="true"
            >
              format_list_numbered
            </span>
            <span className="font-label-caps text-[9px] text-on-surface-variant hidden lg:inline">
              Queue
            </span>
            <span className="tabular-nums text-[12px] font-semibold text-on-surface">
              {queueDepth}
            </span>
          </div>
        </InfoTooltip>
      </div>
    </footer>
  );
}
