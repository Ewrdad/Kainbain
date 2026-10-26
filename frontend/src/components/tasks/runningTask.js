/***
 * MARK: runningTask
 * @description Single source of truth for "which task is running" across
 * every monitor surface. KainBain executes one task at a time; the engine
 * owner (`engineState.activeTaskId` while `engineState.status === 'running'`)
 * is the lock, and task `running_*` labels are stale-prone (crash, abort,
 * or reconcile gaps can leave them behind). Every RUNNING badge, active
 * slot, and executing control must derive from these helpers so two tasks
 * can never render as running at once.
 * @example isTaskRunning(task, engineState) => true
 * @example resolveRunningTask(tasks, engineState) => task | null
 ***/

/***
 * MARK: LIVE_RUNNING_STATUSES
 * @description Task statuses that claim live execution. Any task carrying
 * one without owning the engine is stale, never running.
 ***/
export const LIVE_RUNNING_STATUSES = [
  'running_agent',
  'running_ci',
  'running_deploy',
  'running_merge',
  'advancing',
];

/***
 * MARK: isLiveRunningStatus
 * @description Whether a status label claims live execution.
 * @example isLiveRunningStatus('running_agent') => true
 * @param {string} [status]
 * @returns {boolean}
 ***/
export function isLiveRunningStatus(status) {
  return LIVE_RUNNING_STATUSES.includes(status);
}

/***
 * MARK: isEngineOwner
 * @description Whether the task currently owns the engine (holds the lock),
 * regardless of engine status. Ownership alone is not liveness: only an
 * owner under a `running` engine is executing.
 * @example isEngineOwner(task, { status: 'running', activeTaskId: 't1' }) => true
 * @param {Object} [task]
 * @param {Object} [engineState]
 * @returns {boolean}
 ***/
export function isEngineOwner(task, engineState) {
  if (!task?.id || engineState?.activeTaskId == null) return false;
  return String(engineState.activeTaskId) === String(task.id);
}

/***
 * MARK: hasEngineSnapshot
 * @description Whether the engine snapshot carries any status at all. A
 * missing snapshot (or a bare `{}` default before context arrives) proves
 * nothing, so labels are trusted and nothing is classified stale or busy.
 * @example hasEngineSnapshot({ status: 'idle' }) => true
 * @param {Object} [engineState]
 * @returns {boolean}
 ***/
export function hasEngineSnapshot(engineState) {
  return engineState != null && engineState.status != null;
}

/***
 * MARK: isTaskRunning
 * @description Whether this task is genuinely executing right now: it owns
 * the engine and the engine (or the agent loop) is running. A non-owner is
 * never running, even with a `running_*` label — that label is stale (see
 * `isStaleRunner`). Without an engine snapshot there is nothing to prove
 * staleness against, so the label is trusted (isolated renders, old tests).
 * @example isTaskRunning(task, { status: 'running', activeTaskId: 't1' }) => true
 * @param {Object} [task]
 * @param {Object} [engineState]
 * @param {boolean} [isAgentRunning=false]
 * @returns {boolean}
 ***/
export function isTaskRunning(task, engineState, isAgentRunning = false) {
  if (!task) return false;
  if (isEngineOwner(task, engineState)) {
    return engineState.status === 'running' || Boolean(isAgentRunning);
  }
  if (!hasEngineSnapshot(engineState)) return isLiveRunningStatus(task.status);
  return false;
}

/***
 * MARK: isStaleRunner
 * @description Whether the task carries a live-looking `running_*` label
 * without owning the running engine — i.e. it looks live but is dead.
 * Stale runners render as interrupted/stale (with a retry affordance),
 * never with a pulsing RUNNING badge. Needs an engine snapshot; without
 * one nothing is classified stale.
 * @example isStaleRunner(task, { status: 'idle', activeTaskId: null }) => true
 * @param {Object} [task]
 * @param {Object} [engineState]
 * @returns {boolean}
 ***/
export function isStaleRunner(task, engineState) {
  if (!task || !hasEngineSnapshot(engineState)) return false;
  if (!isLiveRunningStatus(task.status)) return false;
  return !(isEngineOwner(task, engineState) && engineState.status === 'running');
}

/***
 * MARK: resolveRunningTask
 * @description Returns the single executing task, or null. The owner under
 * a running engine wins; otherwise there is no runner — notably there is
 * NO fallback to "first task with a running_* label" (that fallback is the
 * phantom-second-runner bug). At most one task can ever be returned.
 * @example resolveRunningTask(tasks, engineState) => task | null
 * @param {Array<Object>} [tasks]
 * @param {Object} [engineState]
 * @returns {Object|null}
 ***/
export function resolveRunningTask(tasks, engineState) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  if (engineState?.status !== 'running' || engineState?.activeTaskId == null) {
    return null;
  }
  return tasks.find((t) => String(t?.id) === String(engineState.activeTaskId)) || null;
}

/***
 * MARK: resolveDisplayedStage
 * @description Resolves the stage a running/active task is actually in. The
 *   task's pipeline-resolved `currentStageId` wins over
 *   `engineState.activeStageName`, so a manual move (or any transition that
 *   changes the task's stage without re-dispatching) can never leave the
 *   header pill naming the stage the task just left (task 072e2cfa). The
 *   engine snapshot is used only when it agrees or when there is no task
 *   context to resolve against (idle header, isolated renders, older
 *   payloads without a task stage). Returns null when neither source names a
 *   stage.
 * @example resolveDisplayedStage({ currentStageId: '2' }, [{ id: '2', name: 'Plan' }], { activeStageName: 'Build' }) => { id: '2', name: 'Plan', type: null }
 * @example resolveDisplayedStage(null, [], { activeStageName: 'Build' }) => { id: null, name: 'Build', type: null }
 * @param {Object} [task] - The active task (currentStageId/currentStageName).
 * @param {Array<Object>} [stages] - Pipeline stages for the task.
 * @param {Object} [engineState] - Engine snapshot (activeStageId/Name/Type).
 * @returns {{id: (string|null), name: string, type: (string|null)}|null}
 ***/
export function resolveDisplayedStage(task, stages, engineState = {}) {
  const list = Array.isArray(stages) ? stages : [];
  const stageId = task?.currentStageId;
  if (stageId != null && String(stageId).trim() !== '') {
    const found = list.find(
      (s) =>
        String(s?.id) === String(stageId) ||
        (s?.name && String(s.name).toLowerCase() === String(stageId).toLowerCase()),
    );
    if (found) {
      return {
        id: found.id ?? stageId,
        name: found.name || String(stageId),
        type: found.type ?? null,
      };
    }
    // The task names a stage the passed pipeline does not carry (e.g. the
    // dashboard passes the SELECTED workflow's stages while the running task
    // belongs to another pipeline): still trust the task over a stranded
    // engine snapshot. When the engine snapshot agrees with the task's stage
    // it is the backend-reconciled display name (getEngineState re-points it
    // at the owner task), so prefer it over a raw id; a disagreeing engine
    // name may be stranded state and must not be borrowed.
    const engineAgrees =
      engineState?.activeStageName != null &&
      engineState?.activeStageId != null &&
      String(engineState.activeStageId) === String(stageId);
    const name =
      task?.stageName ||
      task?.currentStageName ||
      (engineAgrees ? engineState.activeStageName : null) ||
      String(stageId);
    return {
      id: stageId,
      name,
      type:
        task?.stageType ||
        task?.currentStageType ||
        (engineAgrees ? (engineState.activeStageType ?? null) : null),
    };
  }
  if (task?.stageName || task?.currentStageName) {
    // The task names a stage but carries no stage id: report no id rather
    // than borrowing the engine snapshot's, which may point at the stage the
    // task just left. Only `.name` is consumed today, but a mixed-source id
    // would be a lie to any future reader.
    return {
      id: null,
      name: task.stageName || task.currentStageName,
      type: task.stageType || task.currentStageType || null,
    };
  }
  if (engineState?.activeStageName) {
    return {
      id: engineState.activeStageId ?? null,
      name: engineState.activeStageName,
      type: engineState.activeStageType ?? null,
    };
  }
  return null;
}

/***
 * MARK: isEngineBusyWithOther
 * @description Whether the engine is running a task other than the given
 * one — the condition under which manual "Run stage" must show a
 * queued/busy signal (the API answers 409) instead of implying the task
 * will start now.
 * @example isEngineBusyWithOther(task, { status: 'running', activeTaskId: 't9' }) => true
 * @param {Object} [task]
 * @param {Object} [engineState]
 * @returns {boolean}
 ***/
export function isEngineBusyWithOther(task, engineState) {
  if (engineState?.status !== 'running' || engineState?.activeTaskId == null) {
    return false;
  }
  if (!task?.id) return true;
  return String(engineState.activeTaskId) !== String(task.id);
}
