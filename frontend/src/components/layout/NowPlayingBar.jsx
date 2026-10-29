import React, { useEffect, useState, useRef } from 'react';

import { useKainBain } from '../../context/KainBainContext';
import { formatTaskKey, formatTaskTitleFirstLine } from '../tasks/taskFormatters';
import { resolveDisplayedStage } from '../tasks/runningTask';
import { resolveActiveTaskDisplay, resolveUniversalNowPlaying } from './activeTaskVisibility';
import { HealthTrafficLight } from './HealthTrafficLight';
import { InfoTooltip } from '../common/InfoTooltip';
import { api } from '../../services/api';

/***
 * MARK: NowPlayingBar
 * @description The persistent "Now Playing" bar. Anchored to the bottom of
 * the viewport (72px height). Shows the global engine state (status badge:
 * IDLE, RUNNING, CHECKPOINT, PAUSED), one box per configured Runner (fleet
 * roster, running or idle) with its own play/pause + skip, live elapsed
 * time, live execution queue depth, and subsystem health.
 *
 * There is no global transport cluster: the Runner boxes own play/pause
 * (pause parks a Runner, resume re-arms it) and skip (advances that
 * Runner's held task one stage). The right rail shows honest, live data:
 * the open-task count across all pipelines (queue depth) and the elapsed
 * timer.
 *
 * Universal contract: the engine owns a single queue fed by every pipeline,
 * so this bar never follows the selected pipeline. The named task, badge,
 * and timer resolve from the engine owner (engineState.activeTaskId).
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
 * MARK: runnerBoxHealth
 * @description Heartbeat freshness behind each runner box's colour dot. A
 *   Runner heartbeats every 15s, so anything seen within 60s counts as live
 *   (green). Older than that is stale (amber); a missing/unparseable
 *   timestamp stays grey (unknown) rather than alarming.
 * @example runnerBoxHealth(new Date().toISOString(), Date.now()) => 'live'
 ***/
export function runnerBoxHealth(lastSeenAt, nowMs) {
  const seen = Date.parse(lastSeenAt || '');
  if (!Number.isFinite(seen)) return 'unknown';
  return nowMs - seen <= 60000 ? 'live' : 'stale';
}

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
 * ***/
export const MAX_VISIBLE_RUNNER_BOXES = 4;

/***
 * MARK: resolveRunnerBoxes
 * @description Builds the per-runner box models for the Now Playing bar's
 *   left side. Boxes show for every configured (active) Runner — idle ones
 *   included — so the bar always reads as the fleet roster, never as an
 *   empty "nothing running" state. Live assignments overlay task, stage,
 *   and freshness; a Runner with no assignment renders an honest idle box
 *   (`idle: true`, task "Idle", stage "Waiting for work"). Always returns
 *   an array (empty only when no Runners are configured at all).
 * @example resolveRunnerBoxes({ assignments: [], tasks: [], stages: [], runners: [] }) => []
 ***/
export function resolveRunnerBoxes({ assignments, tasks, stages, runners }) {
  const list = Array.isArray(assignments) ? assignments.filter((a) => a && a.runnerId) : [];
  const byRunner = new Map();
  for (const a of list) {
    const key = String(a.runnerId);
    if (!byRunner.has(key)) byRunner.set(key, a);
  }
  // Union: every configured active Runner in registry order, then any
  // assignment-only ids (registry unknown, e.g. list fetch missed) after.
  const ids = [];
  if (Array.isArray(runners)) {
    for (const r of runners) {
      if (!r || typeof r.runnerId !== 'string' || !r.runnerId) continue;
      if (r.status !== 'active') continue;
      if (!ids.includes(r.runnerId)) ids.push(r.runnerId);
    }
  }
  for (const key of byRunner.keys()) {
    if (!ids.includes(key)) ids.push(key);
  }
  if (ids.length === 0) return [];
  const recordById = new Map(
    (Array.isArray(runners) ? runners : [])
      .filter((r) => r && typeof r.runnerId === 'string')
      .map((r) => [r.runnerId, r]),
  );
  const taskById = new Map(
    (Array.isArray(tasks) ? tasks : [])
      .filter((t) => t && t.id != null)
      .map((t) => [String(t.id), t]),
  );
  const stageById = new Map(
    (Array.isArray(stages) ? stages : [])
      .filter((s) => s && s.id != null)
      .map((s) => [String(s.id), s]),
  );
  const stageNameFor = (stageId, task) => {
    const ids = [stageId, task?.currentStageId];
    for (const id of ids) {
      if (id == null || id === '') continue;
      const stage = stageById.get(String(id));
      const name = stage?.name || stage?.title;
      if (typeof name === 'string' && name.trim()) return name;
      return String(id);
    }
    return '…';
  };
  const taskNameFor = (task, taskId) =>
    formatTaskTitleFirstLine(task || '', '') ||
    (typeof taskId === 'string' || typeof taskId === 'number' ? String(taskId).slice(0, 8) : '…');
  return ids.map((runnerId) => {
    const a = byRunner.get(runnerId) || null;
    const record = recordById.get(runnerId) || null;
    if (!a) {
      // Configured but holding nothing: an honest idle box. The health dot
      // reads the registry heartbeat (grey unknown when never seen).
      return {
        runnerId,
        taskId: null,
        task: null,
        taskName: 'Idle',
        stageName: 'Waiting for work',
        lastSeenAt: record?.lastSeenAt ?? null,
        startedAt: null,
        paused: record?.paused ?? false,
        idle: true,
      };
    }
    const task = taskById.get(String(a.taskId)) || null;
    return {
      runnerId,
      taskId: a.taskId,
      task,
      taskName: taskNameFor(task, a.taskId),
      stageName: stageNameFor(a.stageId, task),
      lastSeenAt: a.lastSeenAt ?? record?.lastSeenAt ?? null,
      startedAt: a.startedAt ?? null,
      paused: a.paused ?? record?.paused ?? false,
      idle: false,
    };
  });
}

/***
 * MARK: useNowPlayingRunnerDirectory
 * @description Fleet roster behind the bar's runner boxes: the configured
 *   Runner list (GET /runners) plus live assignments (GET /runners/monitor)
 *   on the same 5s cadence as the observability widget. Tests (and any
 *   future context wiring) can inject per-piece `override` values to skip
 *   polling; each side polls only while its own override is undefined.
 *   Failures are best-effort: a missed list falls back to assignment-only
 *   boxes, a missed monitor to idle boxes, and both missed to the legacy
 *   single-task display.
 ***/
function useNowPlayingRunnerDirectory(assignmentsOverride, runnersOverride) {
  const [monitor, setMonitor] = useState(null);
  const [registry, setRegistry] = useState(null);
  // No-op polls skip the state update entirely — compared via ref so idle
  // polling never schedules a render (nor an act() warning in tests) every
  // 5s. The ref starts at the empty-roster key, so the first poll showing
  // "no assignments, registry unknown" is already a no-op.
  const keyRef = useRef(JSON.stringify([[], 'miss']));
  const pollAssignments = assignmentsOverride === undefined;
  const pollRunners = runnersOverride === undefined;
  useEffect(() => {
    if (!pollAssignments && !pollRunners) return undefined;
    let mounted = true;
    const load = async () => {
      try {
        const [m, list] = await Promise.all([
          pollAssignments
            ? api.getRunnerMonitor().catch(() => null)
            : Promise.resolve(null),
          pollRunners && typeof api.getRunners === 'function'
            ? api.getRunners().catch(() => null)
            : Promise.resolve(null),
        ]);
        if (!mounted) return;
        const assignments = Array.isArray(m?.liveAssignments)
          ? m.liveAssignments.filter((a) => a && a.runnerId)
          : null;
        const key = JSON.stringify([
          assignments === null ? 'miss' : assignments.map((a) => a && a.runnerId),
          Array.isArray(list) ? list.map((r) => r && r.runnerId) : 'miss',
        ]);
        if (key === keyRef.current) return;
        keyRef.current = key;
        if (assignments !== null) setMonitor(m);
        if (Array.isArray(list)) setRegistry(list);
      } catch {
        // Best-effort: the last good roster stays until the next poll succeeds.
      }
    };
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [pollAssignments, pollRunners]);
  const assignments =
    assignmentsOverride !== undefined
      ? assignmentsOverride
      : Array.isArray(monitor?.liveAssignments)
        ? monitor.liveAssignments.filter((a) => a && a.runnerId)
        : [];
  const runners = runnersOverride !== undefined ? runnersOverride : registry;
  return { assignments, runners };
}

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
                {showRunnerBoxes ? `Runners (${runnerBoxes.length})` : 'Active Task'}
              </span>
              {engineState?.activeProjectName && (
                <span className="text-[9px] text-text-muted font-mono truncate hidden sm:inline">
                  [{engineState.activeProjectName}]
                </span>
              )}
              {/* Fleet mode (runner boxes shown) carries no engine-status pill:
                  per-runner boxes already name each Runner's live state, so a
                  single global CHECKPOINT/RUNNING/IDLE chip misleads — the
                  header reads as just "Runners (n)". The pill stays in the
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

      {/* Right: Execution Queue Depth, Stage Timer & Health Traffic Light
          Hidden entirely on mobile to avoid crushing the runner boxes.
          Revealed from `sm` up where horizontal space is available.
          Deliberately NO percentage bar: the stack has no percent-complete data,
          so any percentage would be fabricated. The live elapsed timer and the
          live queue-depth chip are the honest indicators; the stale
          workflow-pointer stage label ("Stage 1 of 10 — Idea") was removed
          because it never updated with the active task's real stage.

          MARK: right-rail shrink contract — every child is fixed-width nowrap
          content, so the rail has no natural shrink path and its min-content
          (~430px with the health light) would overflow LEFTWARD over the
          runner boxes at 640–~1190px. Guarded in three layers:
            1. below `xl` the decorative extras (health light + dividers) are
               hidden so the min-content (~111px at sm, ~151px at lg) always
               fits the box's share. The health light cannot return before
               `xl`: measured at 1024px the rail's share is 338px but chip +
               timer + health + dividers + gaps need ~428px, and flex items
               with min-width:auto overflow leftward instead of shrinking
               (measured by the e2e gate, which failed at 1024px when the
               extras were hidden below `lg` only);
            2. `overflow-hidden` clips instead of ever painting over the runner
               boxes if content ever outgrows the box again (tooltips are
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
