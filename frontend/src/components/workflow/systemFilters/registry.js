import { isRunningTask } from './isRunningTask';
import { isTaskedTask } from './isTaskedTask';

/***
 * MARK: systemFilterRegistry
 * @description Data module for the `!` system-filter registry: the built-in
 *   filter entries plus the live registry array that `registerSystemFilter`
 *   extends. No functions — pure data so every one-function module can share
 *   the same lookup source without import cycles. Entries carrying
 *   `hidesColumns: true` (`running`, `tasked`) also hide board columns that
 *   hold no matching task (see `isColumnSystemFilter`).
 * @example SYSTEM_FILTERS.map((f) => f.id) => ['failed', 'human', 'running', 'tasked']
 ***/

const DEFAULT_SYSTEM_FILTERS = [
  {
    id: 'failed',
    label: 'Failed',
    description: 'Show only tasks with execution failures or error messages.',
    match: (task) =>
      Boolean(task) &&
      (task.status === 'failed' || Boolean(task.failureReason) || Boolean(task.lastError)),
  },
  {
    id: 'human',
    label: 'Human only',
    description: 'Show only tasks currently at human checkpoint stages waiting for approval.',
    match: (task, stages) => {
      if (!task) return false;
      const stageId = task.currentStageId || task.stageId;
      const stage = (stages || []).find((s) => s && s.id === stageId);
      return stage?.type === 'human' || task.status === 'waiting_human';
    },
  },
  {
    id: 'running',
    label: 'Running',
    description: 'Show only columns with a task executing right now.',
    match: (task, stages, ctx) => isRunningTask(task, ctx),
    hidesColumns: true,
  },
  {
    id: 'tasked',
    label: 'Has tasks',
    description: 'Show only columns that contain tasks.',
    match: (task) => isTaskedTask(task),
    hidesColumns: true,
  },
];

/***
 * MARK: SYSTEM_FILTERS
 * @description Live list of registered system filter descriptors. This is
 *   the same array `registerSystemFilter` appends to — read it through
 *   `getSystemFilters()` when you need a snapshot.
 * @example SYSTEM_FILTERS.map((f) => f.id) => ['failed', 'human', 'running', 'tasked']
 ***/
export const SYSTEM_FILTERS = DEFAULT_SYSTEM_FILTERS.slice();

/***
 * MARK: SYSTEM_FILTER_IDS
 * @description Registered system filter identifiers in display order: the
 *   defaults below plus anything later added through `registerSystemFilter`
 *   (which appends here so suggestion order stays registration order).
 * @example SYSTEM_FILTER_IDS => ['failed', 'human', 'running', 'tasked']
 ***/
export const SYSTEM_FILTER_IDS = DEFAULT_SYSTEM_FILTERS.map((entry) => entry.id);
