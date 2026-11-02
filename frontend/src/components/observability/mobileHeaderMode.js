import { formatTaskTitleFirstLine } from '../tasks/taskFormatters';
import { resolveDisplayedStage } from '../tasks/runningTask';

/***
 * MARK: resolveMobileHeaderMode
 * @description Pure header-mode contract for the compact mobile monitor: the
 *   legacy single-threaded global pill (`ACTIVE/CHECKPOINT/PAUSED/IDLE`) is
 *   the only status signal when no Runner fleet is configured, and is
 *   dropped whenever fleet presence (a live assignment or a registered
 *   Runner) is shown — the per-runner rows already name each Runner's live
 *   state, mirroring `NowPlayingBar` fleet mode. The active chip names the
 *   task plus the stage it is on (`<task> · <stage>`, task first) so the
 *   unnamed `ACTIVE: <stage>` pill never leaves the task anonymous. Fails
 *   safe: unknown registry shapes count as no fleet (the pill stays
 *   visible — status is never hidden on bad input), and a malformed stage
 *   name falls back to the task-only chip instead of crashing the header.
 * @param {Object|null} [options] - Header inputs (null fails safe to the pill fallback).
 * @param {Array<Object>} [options.assignments] - Live fleet assignments (runnerId-bearing).
 * @param {Map|Array|number|null} [options.registry] - Runner registry (Map, list, or count).
 * @param {Object|null} [options.activeTask] - Resolved active task (title, goal, currentStageId).
 * @param {Array<Object>} [options.stages] - Pipeline stages for the active task.
 * @param {Object} [options.engineState] - Engine snapshot (status, activeStageName).
 * @returns {{showRunnerRows: boolean, showEnginePill: boolean, activeChip: {taskName: string, stageName: string|null, label: string}|null}} Header mode: fleet visibility, pill fallback, and the named chip (null when no task names it).
 * @example resolveMobileHeaderMode({ assignments: [{ runnerId: 'r1' }], activeTask: { title: 'Build auth' } }).showEnginePill // false
 * @example resolveMobileHeaderMode(null).showEnginePill // true
 ***/
export function resolveMobileHeaderMode(options = {}) {
  // A null options bag must fail safe like a missing one: destructuring
  // `null` directly would throw and crash the header on bad input.
  const {
    assignments = [],
    registry = null,
    activeTask = null,
    stages = [],
    engineState = {},
  } = options ?? {};
  const live = (Array.isArray(assignments) ? assignments : []).filter((a) => a && a.runnerId);
  let registryCount = 0;
  if (registry instanceof Map) {
    registryCount = registry.size;
  } else if (Array.isArray(registry)) {
    registryCount = registry.filter((r) => r && r.runnerId).length;
  } else if (typeof registry === 'number' && Number.isInteger(registry) && registry > 0) {
    // Only a positive whole count names a fleet: zero, negatives, and
    // fractions are malformed input, so the pill stays visible (fail-safe).
    registryCount = registry;
  }
  const showRunnerRows = live.length > 0 || registryCount > 0;
  const showEnginePill = !showRunnerRows;
  const taskName = formatTaskTitleFirstLine(
    activeTask?.title || activeTask?.goal || '',
    '',
  ).trim();
  // Stage names are display text, but a numeric id can leak through from a
  // malformed payload — the pill renders those, so the chip does too. Only
  // genuine non-text (objects, booleans) falls back to the task-only chip.
  const rawStageName = resolveDisplayedStage(
    activeTask,
    Array.isArray(stages) ? stages : [],
    engineState ?? {},
  )?.name;
  const stageName =
    typeof rawStageName === 'string'
      ? rawStageName.trim()
      : typeof rawStageName === 'number' && Number.isFinite(rawStageName)
        ? String(rawStageName)
        : '';
  const activeChip = taskName
    ? { taskName, stageName: stageName || null, label: stageName ? `${taskName} · ${stageName}` : taskName }
    : null;
  return { showRunnerRows, showEnginePill, activeChip };
}

/***
 * MARK: default resolveMobileHeaderMode
 * @description Default-export alias for `resolveMobileHeaderMode` so the
 *   compact monitor can import the header-mode contract either way.
 * @example resolveMobileHeaderMode({ assignments: [{ runnerId: 'r1' }] }).showEnginePill // false
 ***/
export default resolveMobileHeaderMode;
