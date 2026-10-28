import { useEffect, useState, useRef } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import { useIsNarrowViewport } from '../util/viewport';
import { resolveDisplayedStage } from '../tasks/runningTask';
import { resolveActiveTaskDisplay, resolveUniversalNowPlaying } from './activeTaskVisibility';
import { HealthTrafficLight } from './HealthTrafficLight';
import { InfoTooltip } from '../common/InfoTooltip';
import { usePendingAction } from '../../hooks/usePendingAction';
import { isLastStage as isFinalStage } from '../stageTypes';
import { EngineStatusChip, NowPlayingBarLeft } from './NowPlayingBarLeft';
import { RunnerBoxesRow } from './RunnerBoxesRow';
import { shouldShowRunnerBoxes } from './runnerBoxUi';
import { selectRunnerEntries } from './selectRunnerEntries';

/***
 * MARK: NowPlayingBar
 * @description The persistent "Now Playing" control bar. Anchored to the
 * bottom of the viewport (72px height). Shows the global engine state (active project,
 * task key, status badge: IDLE, RUNNING, CHECKPOINT, PAUSED), redesigned
 * 4 transport controls (Look Back, Look Forward, Skip Current, Jump to Active),
 * live elapsed time, live execution queue depth, and subsystem health.
 *
 * Note: the old workflow-pointer stage label ("Stage 1 of 10 — Idea") was
 * removed on purpose — it was derived from currentStageId, which the workflow
 * only sets on initial fetch or manual skip, so it never reflected the active
 * task's real stage. The right rail now shows honest, live data instead: the
 * open-task count across all pipelines (queue depth) and the elapsed timer.
 *
 * Universal contract: the engine owns a single queue fed by every pipeline,
 * so this bar never follows the selected pipeline. The named task, badge,
 * timer, queue depth, and Skip all resolve from the engine owner
 * (engineState.activeTaskId). Switching pipelines only changes the
 * board/canvas view. The owning pipeline's name is kept purely as a
 * provenance chip in the title.
 *
 * Idle contract: while the engine status badge reads IDLE there is no running
 * task, so no task title, goal text, or task key is shown — the bar shows a
 * plain "No active task — engine idle" hint and the inspector button is
 * disabled with aria-label "No active task". The name reappears (with a short
 * fade/slide entrance on its wrapper only — never on the badge text) as soon
 * as the engine leaves idle. Paused, failed, interrupted, and checkpoint
 * states keep naming their task so the user knows what needs attention.
 *
 * Runner boxes: with 1-4 live runner entries the left column shows compact
 * per-runner boxes (runner name, task name, stage, health colour + status
 * word) beside the compact engine status chip; 0 or 5+ entries render the
 * legacy single-task view. Entries come from the optional `runnerEntries`
 * prop (tests, story states, a future runner registry) or are derived from
 * context runner association via selectRunnerEntries; setting
 * `uiPreferences.showRunnerBoxes === false` forces the legacy view.
 *
 * @example <NowPlayingBar />
 * @example <NowPlayingBar runnerEntries={[{ runnerId: 'bravo', runnerLabel: 'Bravo', task: { id: 't1' }, taskTitleFirstLine: 'Ship it', stageName: 'Plan', statusWord: 'running' }]} />
 * @param {Object} [props] - Component props.
 * @param {Array<Object>|null} [props.runnerEntries=null] - Injected runner entries (null derives from context).
 ***/
export function NowPlayingBar({ runnerEntries = null } = {}) {
  const {
    isAgentRunning,
    workflows,
    tasks,
    computeRunning,
    toggleCompute,
    activeProjectId,
    currentStageId,
    stages = [],
    focusedStageId,
    lookBack,
    lookForward,
    jumpToActive,
    skipCurrent,
    engineState,
    setSelectedTask,
    uiPreferences,
  } = useKainBain();

  const isNarrow = useIsNarrowViewport();

  // Single-flight guard for the transport mutations (skip stage, play/pause
  // dispatcher): while one is awaiting the backend the buttons are disabled so
  // a slow connection can never trigger the same mutation twice.
  const { pendingKey: pendingTransportAction, run: runTransportAction } = usePendingAction();
  const isSkipping = pendingTransportAction === 'skip';
  const isTogglingCompute = pendingTransportAction === 'compute';

  const effectiveStageId = focusedStageId || currentStageId || stages[0]?.id;
  const currentStage = stages.find((s) => s.id === effectiveStageId);
  const stageIndex = stages.findIndex((s) => s.id === effectiveStageId);
  const isFirstStage = stageIndex <= 0;
  // Empty pipeline keeps transport disabled (unlike the approval helper's
  // fail-visible false, which is about wording, not buttons).
  const isLastStage = stages.length === 0 || isFinalStage(stages, effectiveStageId);

  // Universal display: the engine owns one queue across all pipelines, so the
  // named task, badge flags, and idle gate all resolve from the task list +
  // engine state only — currentStageId / activeWorkflowId (pipeline view
  // state) never influence what this bar names.
  const { activeTask, isFailed, isInterrupted, isStagePaused, isRunning, isCheckpoint } =
    resolveActiveTaskDisplay({
      tasks,
      engineState,
      currentStageId,
      isAgentRunning,
      currentStage,
    });
  const universal = resolveUniversalNowPlaying({ tasks, engineState });
  // Resolved once per render: the stage the running task is actually in
  // (its pipeline stage, never a stranded engine snapshot — task 072e2cfa).
  const displayedStageName = activeTask
    ? (resolveDisplayedStage(activeTask, stages, engineState)?.name ?? null)
    : null;

  // Runner boxes: explicit `runnerEntries` win (tests, story states, a
  // future registry); null derives from context runner association. The
  // <5 gate + kill switch live in shouldShowRunnerBoxes so the branch
  // below stays a plain conditional. The derivation is wrapped so a
  // poisoned task payload (a throwing getter, a Proxy from a bad merge)
  // degrades to the legacy view instead of blanking the whole bar — the
  // transport controls must keep working on an operational screen.
  let runnerBoxEntries = runnerEntries;
  if (runnerBoxEntries === null || runnerBoxEntries === undefined) {
    try {
      runnerBoxEntries = selectRunnerEntries({ tasks, stages, engineState, isAgentRunning });
    } catch {
      runnerBoxEntries = [];
    }
  }
  const showRunnerBoxes = shouldShowRunnerBoxes(runnerBoxEntries, uiPreferences) && !isNarrow;

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
  // pipeline, so depth and next-task gating count all open tasks across ALL
  // projects via the engine snapshot's openQueueDepth (the loaded list is
  // only the active project's slice). Uses the ungated universal candidate
  // so queue semantics stay put while idle (the gated activeTask is null
  // then, which must not flip Skip/Look-Forward on).
  const hasNextTask = universal.hasNextTask;

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

  // Elapsed-time counter for the active run. Reset whenever the active task
  // (or running state) changes so the timer never counts across task
  // boundaries (D2).
  const [elapsedSec, setElapsedSec] = useState(0);
  const prevTaskRef = useRef(engineState?.activeTaskId);
  useEffect(() => {
    if (!isRunning) return undefined;
    const id = setInterval(() => {
      if (prevTaskRef.current !== engineState?.activeTaskId) {
        prevTaskRef.current = engineState?.activeTaskId;
        setElapsedSec(0);
      } else {
        setElapsedSec((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, engineState?.activeTaskId]);

  /***
   * MARK: fmtElapsed
   * @description Formats elapsed seconds into HH:MM:SS format.
   * @example fmtElapsed() => '00:01:23'
   * @returns {string}
   ***/
  const fmtElapsed = () => {
    const hrs = String(Math.floor(elapsedSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((elapsedSec % 3600) / 60)).padStart(2, '0');
    const s = String(elapsedSec % 60).padStart(2, '0');
    return `${hrs}:${m}:${s}`;
  };

  /***
   * MARK: handleSkipStage
   * @description Prompts user confirmation before advancing the active task past the current stage.
   * Guarded by usePendingAction so a fast double-click cannot skip twice.
   * @example handleSkipStage()
   ***/
  const handleSkipStage = () => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(
        'Are you sure you want to skip the current stage and advance the active task?',
      );
      if (!confirmed) return;
    }
    runTransportAction('skip', () => skipCurrent?.(activeProjectId)).catch(() => {
      // Failures are surfaced by the task hooks' notification layer.
    });
  };

  /***
   * MARK: handleToggleCompute
   * @description Starts or stops the engine dispatcher. Guarded by
   *   usePendingAction so the toggle cannot double-fire while the backend is
   *   still responding; the icon only flips once the state has changed.
   * @example handleToggleCompute()
   ***/
  const handleToggleCompute = () => {
    runTransportAction('compute', () => toggleCompute(activeProjectId)).catch(() => {
      // Failures are surfaced by the engine hooks' notification layer.
    });
  };

  return (
    <footer className="fixed bottom-0 left-0 w-full h-[72px] z-50 bg-surface-container-highest border-t border-border-standard shadow-lg flex items-center justify-between px-3 sm:px-6 md:px-8 pb-[env(safe-area-inset-bottom,0px)]">
      {/* Left: Global Status, Active Project & Context
          On mobile the bar shows only task details + transport (play/pause + skip),
          so this side flexes to fill the space freed by the hidden right rail. */}
      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
        {/* Left column: 1-4 runner entries render compact boxes beside the
            engine status chip; anything else renders the legacy single-task
            view (NowPlayingBarLeft). Centre transport and the right rail
            below are untouched by this branch. */}
        {showRunnerBoxes ? (
          <div
            data-testid="now-playing-runner-mode"
            className="flex items-center gap-2 sm:gap-3 min-w-0"
          >
            <EngineStatusChip
              dotClasses={dotClasses}
              badgeClasses={badgeClasses}
              statusBadge={statusBadge}
              statusDesc={statusDesc}
              statusBehind={statusBehind}
              busyWhileIdle={engineState?.busyWhileIdle}
            />
            <RunnerBoxesRow
              entries={runnerBoxEntries}
              onOpenTask={(task) => setSelectedTask?.(task)}
            />
          </div>
        ) : (
          <NowPlayingBarLeft
            activeTask={activeTask}
            displayedStageName={displayedStageName}
            statusBadge={statusBadge}
            badgeClasses={badgeClasses}
            dotClasses={dotClasses}
            statusDesc={statusDesc}
            statusBehind={statusBehind}
            activeWorkflowLabel={activeWorkflowLabel}
            engineState={engineState}
            isRunning={isRunning}
            isStagePaused={isStagePaused}
            setSelectedTask={setSelectedTask}
          />
        )}
      </div>

      {/* Center: Redesigned Transport Controls (Critique #9, #16) */}
      <div className="flex items-center justify-center gap-1 sm:gap-3 md:gap-4 shrink-0">
        {/* 1. Look Back (View-only: navigates UI stage focus left) */}
        <InfoTooltip
          title="Look Back (View Previous Stage)"
          description="View-only navigation: shifts stage column focus left without altering task execution."
          position="top"
        >
          <button
            type="button"
            onClick={lookBack}
            disabled={isFirstStage}
            aria-label="Look Back"
            className="hidden sm:flex min-w-[44px] min-h-[44px] items-center justify-center text-text-muted hover:text-secondary text-2xl active:scale-90 transition-transform disabled:opacity-25 cursor-pointer rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">
              navigate_before
            </span>
          </button>
        </InfoTooltip>

        {/* 2. Jump to Active (View-only: resets viewport focus to active running stage) */}
        <InfoTooltip
          title="Jump to Active Stage"
          description="View-only navigation: resets viewport focus directly to the actively executing stage."
          position="top"
        >
          <button
            type="button"
            onClick={jumpToActive}
            aria-label="Jump to Active"
            className="hidden sm:flex min-w-[44px] min-h-[44px] items-center justify-center text-text-muted hover:text-primary text-xl active:scale-90 transition-transform cursor-pointer rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-xl" aria-hidden="true">
              center_focus_strong
            </span>
          </button>
        </InfoTooltip>

        {/* Center: Play / Pause Engine Toggle */}
        <InfoTooltip
          title={computeRunning ? 'Pause Engine Dispatcher' : 'Start Engine Dispatcher'}
          description="Global toggle for the background task scheduler. When paused, tasks will not automatically start or advance."
          behindTheScenes="Calls POST /compute/start or /compute/stop to manage the server-side dispatcher loop"
          shortcut="P"
          position="top"
        >
          <button
            type="button"
            onClick={handleToggleCompute}
            disabled={pendingTransportAction !== null}
            aria-busy={isTogglingCompute}
            aria-label={computeRunning ? 'Stop Engine' : 'Start Engine'}
            title={computeRunning ? 'Stop engine' : 'Start engine'}
            id="main-play-btn"
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-secondary text-on-secondary flex items-center justify-center active:scale-90 transition-transform shadow-md hover:brightness-110 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isTogglingCompute ? (
              <span
                className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
            ) : (
              <span
                className="material-symbols-outlined text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
                aria-hidden="true"
              >
                {computeRunning ? 'pause' : 'play_arrow'}
              </span>
            )}
          </button>
        </InfoTooltip>

        {/* 3. Skip Stage / Skip Current (Mutation: advances active task past current stage with confirmation) */}
        <InfoTooltip
          title="Skip Stage (Advance Task)"
          description="Mutation: forcefully advances the universal active task to the next stage in its pipeline."
          behindTheScenes="Advances the engine owner's task (whichever pipeline it came from), never the selected pipeline's stage pointer, with confirmation dialog to avoid accidental skips"
          position="top"
        >
          <button
            type="button"
            onClick={handleSkipStage}
            disabled={!hasNextTask || isLastStage || pendingTransportAction !== null}
            aria-busy={isSkipping}
            aria-label="Skip Current"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-text-muted hover:text-ochre text-xl active:scale-90 transition-transform disabled:opacity-25 cursor-pointer rounded-full hover:bg-surface-container"
          >
            {isSkipping ? (
              <span
                className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
            ) : (
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                fast_forward
              </span>
            )}
          </button>
        </InfoTooltip>

        {/* 4. Look Forward (View-only: navigates UI stage focus right) */}
        <InfoTooltip
          title="Look Forward (View Next Stage)"
          description="View-only navigation: shifts stage column focus right without altering task execution."
          position="top"
        >
          <button
            type="button"
            onClick={lookForward}
            disabled={!hasNextTask || isLastStage}
            aria-label="Look Forward"
            className="hidden sm:flex min-w-[44px] min-h-[44px] items-center justify-center text-text-muted hover:text-secondary text-2xl active:scale-90 transition-transform disabled:opacity-25 cursor-pointer rounded-full hover:bg-surface-container"
          >
            <span className="material-symbols-outlined text-2xl" aria-hidden="true">
              navigate_next
            </span>
          </button>
        </InfoTooltip>
      </div>

      {/* Right: Execution Queue Depth, Stage Timer & Health Traffic Light
          Hidden entirely on mobile to avoid crushing the essential task + transport
          controls. Revealed from `sm` up where horizontal space is available.
          Deliberately NO percentage bar: the stack has no percent-complete data,
          so any percentage would be fabricated. The live elapsed timer and the
          live queue-depth chip are the honest indicators; the stale
          workflow-pointer stage label ("Stage 1 of 10 — Idea") was removed
          because it never updated with the active task's real stage.

          MARK: right-rail shrink contract — every child is fixed-width nowrap
          content, so the rail has no natural shrink path and its min-content
          (~430px with the health light) would overflow LEFTWARD over the center
          transport controls at 640–~1190px (the deep-review blocker where Look
          Forward was half-buried behind the queue chip at the 1024px Tablet
          baseline). Guarded in three layers:
            1. below `xl` the decorative extras (health light + dividers) are
               hidden so the min-content (~111px at sm, ~151px at lg) always
               fits the box's ~162px (640px) → ~338px (1024px) share. The
               health light cannot return before `xl`: measured at 1024px the
               rail's share is 338px but chip + timer + health + dividers +
               gaps need ~428px, and flex items with min-width:auto overflow
               leftward instead of shrinking (measured by the e2e gate, which
               failed at 1024px when the extras were hidden below `lg` only);
            2. `overflow-hidden` clips instead of ever painting over the center
               controls if content ever outgrows the box again (tooltips are
               portal-rendered to document.body, so they are not clipped);
            3. a canary e2e gate measures button-vs-rail rect intersections at
               640/768/800/900/1024/1280px (functional.spec.js). */}
      <div
        data-testid="now-playing-right-rail"
        className="hidden sm:flex items-center justify-end gap-2.5 sm:gap-3.5 flex-1 min-w-0 max-w-[45%] overflow-hidden"
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

        <span
          data-testid="rail-divider-elapsed"
          className="hidden xl:block h-6 w-px bg-border-standard/60 shrink-0"
          aria-hidden="true"
        />

        <InfoTooltip
          title="Stage Timer"
          description="Live elapsed timer for the active task in its current stage."
          behindTheScenes="Timer measures active execution duration in the current stage without leaking across task boundaries"
          position="top-left"
        >
          <div className="flex flex-col items-end cursor-help select-none">
            <span className="font-label-caps text-[9px] text-on-surface-variant">Elapsed</span>
            <span
              id="elapsed-counter"
              aria-label="Elapsed time in current stage"
              className="tabular-nums text-[13px] font-semibold text-on-surface"
            >
              {fmtElapsed()}
            </span>
          </div>
        </InfoTooltip>

        <span
          data-testid="rail-divider-health"
          className="hidden xl:block h-6 w-px bg-border-standard/60 shrink-0"
          aria-hidden="true"
        />

        {/* Health light only from `xl` up: ~233px of fixed-width content that
            cannot fit the rail's share below ~1190px (shrink contract above). */}
        <div data-testid="now-playing-health-slot" className="hidden xl:block">
          <HealthTrafficLight />
        </div>
      </div>
    </footer>
  );
}
