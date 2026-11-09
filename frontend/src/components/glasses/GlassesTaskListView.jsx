import { useMemo } from 'react';
import { useGlassesRefreshTick } from './useGlassesRefreshTick.js';
import { resolveGlassesReviewTarget, resolveGlassesVisibleTasks } from './glassesHelpers.js';

// Reads the human step name for one task from its pipeline position.
const readStepName = (task, stages) => {
  const list = Array.isArray(stages) ? stages : [];
  if (task?.currentStageId == null) return task?.currentStageName || null;
  const found = list.find((stage) => String(stage?.id) === String(task.currentStageId));
  return found?.name || task?.currentStageName || null;
};

/***
 * MARK: GlassesTaskListView
 * @description Observability home for the Meta Ray-Ban (~600x600) display:
 *   the running task name plus its current step up top, three large
 *   Running / Waiting / Failed count cards in the middle, a short tap
 *   list of actionable tasks, and one wide View button into quick review
 *   below. Light, big-text styling follows the chosen survey mockup for
 *   daylight readability. Presentational: parents pass live data in and the
 *   auto-refresh beat calls onRefresh every few seconds.
 * @example <GlassesTaskListView tasks={tasks} runningTask={task} engineState={engine} stages={stages} counts={counts} onOpenTask={open} onRefresh={refresh} />
 * @param {Object} props
 * @param {Array<Object>} [props.tasks] - Tasks to count and list.
 * @param {Object|null} [props.runningTask] - Currently executing task, if any.
 * @param {Object} [props.engineState] - Engine snapshot for running checks.
 * @param {Array<Object>} [props.stages] - Pipeline stages for step names.
 * @param {Object} [props.counts] - Precomputed { running, waitingReview, failed }.
 * @param {Function} [props.onOpenTask] - Opens one task's quick review.
 * @param {Function} [props.onRefresh] - Refreshes live data (beat + button).
 ***/
export function GlassesTaskListView({
  tasks = [],
  runningTask = null,
  engineState = {},
  stages = [],
  counts = {},
  onOpenTask = () => {},
  onRefresh,
}) {
  useGlassesRefreshTick(onRefresh);

  const reviewTarget = useMemo(
    () => resolveGlassesReviewTarget(tasks, engineState),
    [tasks, engineState],
  );
  const visibleTasks = useMemo(
    () => resolveGlassesVisibleTasks(tasks, engineState, 3),
    [tasks, engineState],
  );

  const runningCount = counts?.running ?? 0;
  const waitingCount = counts?.waitingReview ?? 0;
  const failedCount = counts?.failed ?? 0;

  const runningName = runningTask?.title || runningTask?.goal?.slice(0, 60) || null;
  const runningStep = runningTask ? readStepName(runningTask, stages) : null;

  const statusTone = runningTask
    ? 'running'
    : waitingCount > 0
      ? 'waiting'
      : failedCount > 0
        ? 'failed'
        : 'idle';
  const statusText = runningTask
    ? `Running: ${runningName || 'task'}`
    : waitingCount > 0
      ? `${waitingCount} waiting for review`
      : failedCount > 0
        ? `${failedCount} failed`
        : 'Nothing running';
  const dotClass =
    statusTone === 'running'
      ? 'bg-green-600 motion-safe:animate-pulse'
      : statusTone === 'waiting'
        ? 'bg-amber-500'
        : statusTone === 'failed'
          ? 'bg-red-600'
          : 'bg-slate-400';

  return (
    <div
      data-testid="glasses-task-list"
      className="flex-1 flex flex-col h-full min-h-0 overflow-y-auto bg-slate-100 text-slate-900 p-4 gap-3"
    >
      <div className="flex items-center gap-3 min-w-0" role="status" aria-live="polite">
        <span
          data-testid="glasses-status-dot"
          aria-hidden="true"
          className={`shrink-0 w-5 h-5 rounded-full ${dotClass}`}
        />
        <div className="min-w-0">
          <p
            data-testid="glasses-running-name"
            className="text-2xl font-bold leading-tight truncate"
          >
            {runningName || 'Nothing running'}
          </p>
          {runningStep ? (
            <p data-testid="glasses-running-step" className="text-lg text-slate-600 truncate">
              {runningStep}
            </p>
          ) : null}
          <p className="sr-only">{statusText}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2" aria-label="Task status counts">
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border-l-8 border-green-600 px-4 py-2">
          <span className="text-xl font-semibold">Running</span>
          <span data-testid="glasses-count-running" className="text-5xl font-black text-green-700">
            {runningCount}
          </span>
        </div>
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border-l-8 border-amber-500 px-4 py-2">
          <span className="text-xl font-semibold">Waiting for review</span>
          <span data-testid="glasses-count-waiting" className="text-5xl font-black text-amber-600">
            {waitingCount}
          </span>
        </div>
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border-l-8 border-red-600 px-4 py-2">
          <span className="text-xl font-semibold">Failed</span>
          <span data-testid="glasses-count-failed" className="text-5xl font-black text-red-600">
            {failedCount}
          </span>
        </div>
      </div>

      {visibleTasks.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Tasks needing attention">
          {visibleTasks.map((task) => {
            const name = task?.title || task?.goal?.slice(0, 60) || 'Untitled task';
            const step = readStepName(task, stages);
            const waiting = task?.status === 'waiting_human';
            return (
              <li key={task?.id || name}>
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  aria-label={`Open ${name} for review`}
                  className="w-full min-h-[56px] flex items-center gap-3 bg-white rounded-lg shadow-sm px-4 py-2 text-left"
                >
                  <span
                    aria-hidden="true"
                    className={`shrink-0 w-4 h-4 rounded-full ${waiting ? 'bg-amber-500' : 'bg-green-600'}`}
                  />
                  <span className="min-w-0">
                    <span className="block text-xl font-bold leading-tight truncate">{name}</span>
                    {step ? (
                      <span className="block text-base text-slate-600 truncate">{step}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={() => reviewTarget && onOpenTask(reviewTarget)}
          disabled={!reviewTarget}
          aria-label={
            reviewTarget
              ? `View ${reviewTarget?.title || 'task'} for review`
              : 'Nothing to review right now'
          }
          className="w-full min-h-[64px] rounded-full bg-slate-900 text-white text-2xl font-bold disabled:opacity-40"
        >
          View ›
        </button>
        {typeof onRefresh === 'function' ? (
          <button
            type="button"
            onClick={() => onRefresh()}
            className="w-full min-h-[44px] rounded-lg border-2 border-slate-300 bg-white text-lg font-semibold text-slate-700"
          >
            Refresh
          </button>
        ) : null}
      </div>
    </div>
  );
}
