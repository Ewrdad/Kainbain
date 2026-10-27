import { formatTaskTitleFirstLine, isTaskCompleted } from '../tasks/taskFormatters';
import { isEngineOwner, resolveDisplayedStage } from '../tasks/runningTask';
import { resolveRunnerStatusWord } from './runnerBoxUi';

/***
 * MARK: readTaskRunnerId
 * @description Runner identity carried by a task payload, if any. Reads the
 *   explicit `runnerId` field first, then the legacy `runner` field (string
 *   id or `{ id }` object). Returns null when the task carries no runner
 *   association — the bar then treats it as ordinary queue data, never as a
 *   runner box (see selectRunnerEntries).
 * @example readTaskRunnerId({ runnerId: 'bravo' }) => 'bravo'
 * @example readTaskRunnerId({ status: 'in_stage' }) => null
 * @param {Object} [task] - Task payload.
 * @returns {string|null} Trimmed runner id, or null.
 ***/
const readTaskRunnerId = (task) => {
  // A task can name its Runner in several shapes depending on where the
  // payload came from: a top-level `runnerId`/`runner` field (mocks, tests,
  // and a few legacy writers), or the backend's fencing-token `claim`
  // (`{ runnerId, epoch }`) attached by GET /tasks. Accept every shape so a
  // box appears for every live Runner assignment instead of only the ones
  // that happen to carry the legacy field. A missing/blank id means "no
  // runner association" — the bar treats the task as ordinary queue data.
  const raw =
    task?.runnerId ??
    task?.runner ??
    task?.claim?.runnerId ??
    task?.claimRunnerId ??
    task?.runnerClaim?.runnerId ??
    task?.execution?.runnerId ??
    task?.claim?.runner?.id;
  if (typeof raw === 'string') {
    const id = raw.trim();
    return id !== '' ? id : null;
  }
  if (raw && typeof raw === 'object' && typeof raw.id === 'string' && raw.id.trim() !== '') {
    return raw.id.trim();
  }
  return null;
};

/***
 * MARK: readTaskRunnerLabel
 * @description Human-readable runner name for a task: explicit
 *   `runnerName`/`runnerLabel` first, then an object-shaped `runner.name`,
 *   else the runner id itself (never blank).
 * @example readTaskRunnerLabel({ runnerId: 'b1', runnerName: 'Bravo' }, 'b1') => 'Bravo'
 * @example readTaskRunnerLabel({ runnerId: 'b1' }, 'b1') => 'b1'
 * @param {Object} [task] - Task payload.
 * @param {string} fallbackId - Runner id used when no name is carried.
 * @returns {string} Display label.
 ***/
const readTaskRunnerLabel = (task, fallbackId) => {
  const candidates = [task?.runnerName, task?.runnerLabel, task?.runner?.name];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
  }
  return fallbackId;
};

/***
 * MARK: taskRecency
 * @description Sort key for "most recent task wins" inside a runner group:
 *   updatedAt, then enteredStageAt/createdAt, then stable id order — the
 *   same pipeline-independent recency the universal now-playing fallback
 *   uses, so boxes agree with the bar about what is current. Accepts epoch
 *   numbers as well as date strings: a numeric timestamp the old
 *   `Date.parse` path stringified to NaN (and silently lost every recency
 *   comparison); anything unparseable is 0, never NaN, so the sort below
 *   can never see an unordered key.
 * @example taskRecency({}) => 0
 * @example taskRecency({ updatedAt: 5 }) => 5
 * @param {Object} [task] - Task payload.
 * @returns {number} Millis epoch (0 when unparseable).
 ***/
const taskRecency = (task) => {
  // First usable stamp wins: blank strings fall through to the older stamp
  // instead of short-circuiting the group to 0.
  const candidates = [task?.updatedAt, task?.enteredStageAt, task?.createdAt];
  for (const raw of candidates) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const parsed = Date.parse(raw);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return 0;
};

/***
 * MARK: pickGroupTask
 * @description The single task a runner group names: the engine owner when
 *   it belongs to this runner, else the most recently updated open task,
 *   else the most recently updated task of any state. Never invents one.
 * @example pickGroupTask([{ id: 'a' }], {}) => { id: 'a' }
 * @param {Array<Object>} [groupTasks] - Tasks sharing one runner id.
 * @param {Object} [engineState] - Engine snapshot (status/activeTaskId).
 * @returns {Object|null} The named task, or null for an empty group.
 ***/
const pickGroupTask = (groupTasks, engineState) => {
  const list = Array.isArray(groupTasks) ? groupTasks : [];
  if (list.length === 0) return null;
  const owner = list.find((task) => isEngineOwner(task, engineState));
  if (owner) return owner;
  const byRecency = [...list].sort((a, b) => {
    const time = taskRecency(b) - taskRecency(a);
    if (time !== 0) return time;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
  });
  return byRecency.find((task) => !isTaskCompleted(task)) || byRecency[0] || null;
};

/***
 * MARK: selectRunnerEntries
 * @description Derives Now Playing runner box entries from data already in
 *   context — no runner registry, no fetching. Tasks carrying an explicit
 *   `runnerId`/`runner` field group by runner (one entry per runner); tasks
 *   without runner association contribute NOTHING, so the bar degrades to
 *   the legacy single-task view instead of misrepresenting queued tasks as
 *   live runners. That deliberately narrows the plan's provisional
 *   workflowId/per-task fallback: on this single-task engine an open task is
 *   queued work, not a runner, and the per-task fallback would both break
 *   the pinned single-active contract and flip existing single-task-view
 *   tests into box mode. A future registry swaps this one file; the
 *   `runnerEntries` prop on NowPlayingBar already accepts its output shape.
 * @example selectRunnerEntries({ tasks: [{ id: 't1', runnerId: 'b', status: 'in_stage' }], stages: [], engineState: { status: 'idle' } }) => [{ runnerId: 'b', runnerLabel: 'b', taskId: 't1', task: { id: 't1', runnerId: 'b', status: 'in_stage' }, taskTitleFirstLine: 'Untitled Task', stageName: null, statusWord: 'queued' }]
 * @example selectRunnerEntries({ tasks: [{ id: 't1', status: 'in_stage' }], stages: [], engineState: {} }) => []
 * @param {Object} [args] - Named inputs mirroring the bar's context.
 * @param {Array<Object>} [args.tasks] - Live task list.
 * @param {Array<Object>} [args.stages] - Pipeline stages for stage-name resolution.
 * @param {Object} [args.engineState] - Engine snapshot (status/activeTaskId).
 * @param {boolean} [args.isAgentRunning=false] - Agent-loop liveness flag.
 * @returns {Array<Object>} Runner entries sorted by runnerId (possibly empty).
 ***/
export function selectRunnerEntries({ tasks, stages, engineState, isAgentRunning = false } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const stageList = Array.isArray(stages) ? stages : [];
  const groups = new Map();
  for (const task of list) {
    if (!task || typeof task !== 'object') continue;
    const runnerId = readTaskRunnerId(task);
    if (!runnerId) continue;
    if (!groups.has(runnerId)) {
      groups.set(runnerId, {
        runnerId,
        runnerLabel: readTaskRunnerLabel(task, runnerId),
        tasks: [],
      });
    }
    const group = groups.get(runnerId);
    // A later task in the group may carry a nicer name than the first.
    const label = readTaskRunnerLabel(task, runnerId);
    if (label !== runnerId && group.runnerLabel === runnerId) group.runnerLabel = label;
    group.tasks.push(task);
  }
  return [...groups.values()]
    .map((group) => {
      const task = pickGroupTask(group.tasks, engineState);
      return {
        runnerId: group.runnerId,
        runnerLabel: group.runnerLabel,
        taskId: task?.id ?? null,
        task: task ?? null,
        taskTitleFirstLine: task ? formatTaskTitleFirstLine(task) : null,
        stageName: task
          ? (resolveDisplayedStage(task, stageList, engineState)?.name ?? null)
          : null,
        statusWord: resolveRunnerStatusWord(task, engineState, isAgentRunning),
      };
    })
    .sort((a, b) => String(a.runnerId).localeCompare(String(b.runnerId)));
}
