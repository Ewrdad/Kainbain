import { isTaskCompleted } from '../tasks/taskFormatters';

/***
 * MARK: resolveCandidateTask
 * @description Picks the task the bar would name if the engine were busy: the
 * engine's flagged active task, else the open task in the current stage, else
 * the first task in the list. Returns null when there are no tasks.
 * @example resolveCandidateTask(tasks, { activeTaskId: 't1' }, '1') => { id: 't1', ... }
 * @param {Array<Object>} [tasks] - The live task list.
 * @param {Object} [engineState] - The engine snapshot (carries activeTaskId).
 * @param {string} [currentStageId] - The focused pipeline stage id.
 * @returns {Object|null} The candidate task, or null when the list is empty.
 ***/
export function resolveCandidateTask(tasks, engineState, currentStageId) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  return (
    taskList.find((task) => task.id === engineState?.activeTaskId) ||
    taskList.find((task) => task.currentStageId === currentStageId && !isTaskCompleted(task)) ||
    taskList[0] ||
    null
  );
}

/***
 * MARK: resolveActiveTaskDisplay
 * @description Decides which task the NowPlayingBar may name, and whether any
 * task name may be shown at all. The name appears only when the engine is
 * visibly busy (running, checkpoint/waiting-human, paused, failed,
 * interrupted) — the exact union of states that lights the status badge — so
 * the name and the badge can never disagree. While idle there is no running
 * task, so the stale fallback (usually tasks[0]) is cleared to null instead
 * of lingering in the bar. While the engine runs an owned task, only the
 * owner is named — the fallback chain is skipped so a stale runner elsewhere
 * in the list can never appear as a second running task. The ungated
 * `candidateTask` is still returned for queue-depth style derivations that
 * must keep working while idle.
 * @example resolveActiveTaskDisplay({ tasks, engineState: { status: 'idle' }, ... }).activeTask => null
 * @param {Object} args - Named inputs mirroring the bar's context.
 * @param {Array<Object>} [args.tasks] - The live task list.
 * @param {Object} [args.engineState] - The engine snapshot.
 * @param {string} [args.currentStageId] - The focused pipeline stage id.
 * @param {boolean} [args.isAgentRunning] - True while the agent loop runs.
 * @param {Object} [args.currentStage] - The focused stage (carries paused).
 * @returns {Object} activeTask (gated), candidateTask (ungated), hasActiveDisplay, and the badge flags.
 ***/
/***
 * MARK: resolveUniversalNowPlaying
 * @description Workflow-free selector behind the Now Playing bar. The engine
 * owns a single global queue fed by every pipeline, so this resolves purely
 * from the loaded task list + engine state — never from a workflowId,
 * currentStageId, or stages pointer. The engine owner (engineState.activeTaskId
 * while running) always wins; otherwise the fallback is the most recently
 * updated open task (updatedAt, then enteredStageAt/createdAt, then stable id
 * order), which is pipeline-independent: switching the selected pipeline can
 * never move it. Queue depth and hasNextTask count all open (not
 * completed/done) tasks across pipelines. When the running owner is not in
 * the loaded list, ownerTask is null (single-active invariant: name nothing
 * rather than a second task) while the ungated candidateTask keeps the
 * fallback for queue derivations.
 * @example resolveUniversalNowPlaying({ tasks, engineState: { status: 'running', activeTaskId: 't1' } }).ownerTask => { id: 't1', ... }
 * @param {Object} args - Named inputs.
 * @param {Array<Object>} [args.tasks] - The loaded task list (all pipelines).
 * @param {Object} [args.engineState] - The engine snapshot (carries activeTaskId/status).
 * @returns {Object} ownerTask, candidateTask (ungated), queueDepth, hasNextTask, ownerWorkflowId.
 ***/
/***
 * MARK: resolveOwnerTask
 * @description Resolves the engine owner from the loaded list, falling back
 * to the project-independent `engineState.activeTask` snapshot the backend
 * carries on every engine state (see TaskStore.getEngineState). The snapshot
 * is only trusted when its id matches `engineState.activeTaskId` — a stale
 * snapshot from a previous owner must never leak into the bar. This is what
 * keeps the bar naming the owner after a project switch replaces the loaded
 * list with another project's tasks.
 * @example resolveOwnerTask([], { activeTaskId: 't1', activeTask: { id: 't1' } }).id => 't1'
 * @param {Array<Object>} [taskList] - The loaded (active-project) task list.
 * @param {Object} [engineState] - The engine snapshot (carries activeTaskId/activeTask).
 * @returns {Object|null} The owner task, or null.
 ***/
export function resolveOwnerTask(taskList, engineState) {
  const list = Array.isArray(taskList) ? taskList : [];
  if (engineState?.activeTaskId == null) return null;
  const inList =
    list.find((task) => String(task?.id) === String(engineState.activeTaskId)) || null;
  if (inList) return inList;
  const snapshot = engineState?.activeTask;
  if (snapshot && String(snapshot?.id) === String(engineState.activeTaskId)) {
    return snapshot;
  }
  return null;
}

export function resolveUniversalNowPlaying({ tasks, engineState }) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const openTasks = taskList.filter((task) => !isTaskCompleted(task));
  const ownerTask = resolveOwnerTask(taskList, engineState);
  const fallbackTask =
    [...openTasks].sort((a, b) => {
      const timeA = Date.parse(a?.updatedAt || a?.enteredStageAt || a?.createdAt || 0) || 0;
      const timeB = Date.parse(b?.updatedAt || b?.enteredStageAt || b?.createdAt || 0) || 0;
      if (timeA !== timeB) return timeB - timeA;
      return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
    })[0] || null;
  const candidateTask = ownerTask || fallbackTask;
  // Global queue depth: the engine snapshot carries the open-task count
  // across ALL projects (no N-project fan-out). The loaded list is only the
  // active project's slice, so the engine number wins whenever present; the
  // list-derived count is the honest fallback (tests, offline snapshots).
  const globalDepth =
    typeof engineState?.openQueueDepth === 'number' ? engineState.openQueueDepth : null;
  const queueDepth = globalDepth ?? openTasks.length;
  const hasNextTask =
    globalDepth != null
      ? globalDepth > (candidateTask ? 1 : 0)
      : candidateTask
        ? openTasks.some((task) => task.id !== candidateTask.id)
        : openTasks.length > 0;
  return {
    ownerTask,
    candidateTask,
    queueDepth,
    hasNextTask,
    ownerWorkflowId: candidateTask?.workflowId || null,
    ownerWorkflowName: candidateTask?.workflowName || (ownerTask ? engineState?.activeTask?.workflowName : null) || null,
  };
}

export function resolveActiveTaskDisplay({
  tasks,
  engineState,
  currentStageId,
  isAgentRunning,
  currentStage,
}) {
  // Universal candidate: the engine owns one queue across all pipelines, so
  // the fallback is pipeline-independent (most recently updated open task).
  // currentStageId is retained for signature compatibility but no longer
  // influences selection — it is pipeline view state. The stage-scoped
  // resolveCandidateTask above stays exported for its unit tests.
  void currentStageId;
  const candidateTask = resolveUniversalNowPlaying({ tasks, engineState }).candidateTask;
  // Single-active invariant: while the engine runs an owned task, the bar may
  // only name the owner — never the stage/tasks[0] fallback. Naming the
  // fallback here is how a second task looked running alongside the real
  // engine owner (e.g. a stale running_* label at the head of a filtered
  // list). The owner resolves from the loaded list first, then the
  // project-independent engine snapshot, so a project switch that swaps the
  // list keeps naming the same task; only a genuinely absent owner (no
  // snapshot) clears the name. The ungated candidateTask keeps the existing
  // chain for queue-depth style derivations that must keep working.
  const engineHasOwner =
    engineState?.status === 'running' && engineState?.activeTaskId != null;
  const taskList = Array.isArray(tasks) ? tasks : [];
  const ownerTask = engineHasOwner ? resolveOwnerTask(taskList, engineState) : null;
  const displayTask = engineHasOwner ? ownerTask : candidateTask;
  const isFailed = engineState?.status === 'failed' || displayTask?.status === 'failed';
  const isInterrupted =
    displayTask?.wasInterrupted === true ||
    displayTask?.status === 'interrupted' ||
    engineState?.status === 'interrupted';
  // Retained for signature compatibility; per-stage paused state is
  // pipeline view state and must not leak into the global bar's status badge.
  void currentStage;
  const isStagePaused = engineState?.status === 'paused';
  const isRunning = engineState?.status === 'running' || Boolean(isAgentRunning);
  const isCheckpoint =
    engineState?.status === 'checkpoint' ||
    engineState?.status === 'waiting_human' ||
    displayTask?.status === 'waiting_human';
  const hasActiveDisplay =
    isRunning || isCheckpoint || isStagePaused || isFailed || isInterrupted;
  return {
    activeTask: hasActiveDisplay ? displayTask : null,
    candidateTask,
    hasActiveDisplay,
    isFailed,
    isInterrupted,
    isStagePaused,
    isRunning,
    isCheckpoint,
  };
}
