import { formatTaskTitleFirstLine } from '../../tasks/taskFormatters';

/***
 * MARK: itemCardClass
 * @description Resolves the card border/background styling for a queue item.
 * @param {boolean} active
 * @param {boolean} waiting
 * @param {boolean} blocked
 * @returns {string}
 * @example itemCardClass(true, false, false) // => 'bg-emerald-950/30 ...'
 ***/
const itemCardClass = (active, waiting, blocked) => {
  if (active)
    return 'bg-emerald-950/30 border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
  if (waiting) return 'bg-amber-950/20 border-amber-500/50';
  if (blocked) return 'bg-slate-900/60 border-rose-900/40 opacity-70';
  return 'bg-slate-900/80 border-slate-800 hover:border-slate-700';
};

/***
 * MARK: itemBadgeClass
 * @description Resolves the priority tag badge class for a queue item.
 * @param {boolean} active
 * @param {boolean} waiting
 * @param {boolean} blocked
 * @returns {string}
 * @example itemBadgeClass(false, false, true) // => 'bg-rose-950 text-rose-300 ...'
 ***/
const itemBadgeClass = (active, waiting, blocked) => {
  if (active) return 'bg-emerald-950 text-emerald-400 border-emerald-500/50 animate-pulse';
  if (waiting) return 'bg-amber-950 text-amber-300 border-amber-500/50';
  if (blocked) return 'bg-rose-950 text-rose-300 border-rose-500/50';
  return 'bg-slate-800 text-slate-300 border-slate-700';
};

/***
 * MARK: QueueOrderList
 * @description Presentational queue list: renders the autonomous execution queue
 * in dispatch order (#1, #2, #3, ...) with stage progress, priority reasoning,
 * project tags, dependency warning indicators, and a blocked/waiting reason.
 * Pure presentation: data comes in via `items` (the monitor widget passes it
 * as `scheduledQueue`); row activation is surfaced through
 * `onSelectTask(item)`, so callers can open an inspector or perform other
 * actions. `schedulerRunning` drives the empty-state wording; `compact` is
 * reserved for dense surfaces.
 * @example <QueueOrderList items={queue} engineState={engineState} onSelectTask={openTask} />
 * @param {Array<Object>} [props.items] - Ordered queue items.
 * @param {Array<Object>} [props.scheduledQueue] - Alias for `items` (monitor widget's historical prop name).
 * @param {Object} [props.engineState] - Engine state (drives the single-active invariant).
 * @param {boolean} [props.schedulerRunning] - False shows a stopped empty state.
 * @param {Function} [props.onSelectTask] - Called with the clicked queue item.
 * @param {boolean} [props.compact] - Density hint (currently cosmetic).
 * @returns {JSX.Element}
 ***/
export function QueueOrderList({
  items,
  scheduledQueue,
  engineState = {},
  schedulerRunning,
  onSelectTask,
  compact = false,
}) {
  const resolvedItems = Array.isArray(items)
    ? items
    : Array.isArray(scheduledQueue)
      ? scheduledQueue
      : [];

  const handleSelect = typeof onSelectTask === 'function' ? onSelectTask : null;
  const schedulerStopped = schedulerRunning === false;
  // Rows are interactive only when a selection handler is wired (the queue
  // popup opens the inspector); handler-less surfaces like the monitor keep
  // the original plain-div rows — never focusable buttons that do nothing.
  const interactive = typeof handleSelect === 'function';

  const handleRowKeyDown = (event, item) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect(item);
    }
  };

  const emptyState = (
    <div
      className={`h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 font-mono ${
        compact ? 'text-[10px]' : 'text-xs'
      }`}
    >
      <span className="text-3xl mb-2 opacity-50">✨</span>
      <p className="font-bold text-slate-300">
        {schedulerStopped ? 'Scheduler Stopped' : 'Queue is Clear'}
      </p>
      <p className="text-[11px] mt-1 text-slate-400">
        {schedulerStopped
          ? 'Autonomous execution is off. Start the scheduler to resume pickup.'
          : 'Idle — waiting for work. New tasks dispatch automatically.'}
      </p>
    </div>
  );

  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
      tabIndex={0}
      role="group"
      aria-label="Queue order list"
      className={`flex-1 p-2.5 space-y-2 overflow-y-auto custom-scrollbar bg-[#080c16] ${
        compact ? 'p-1.5 space-y-1.5' : ''
      }`}
    >
      {resolvedItems.length === 0
        ? emptyState
        : resolvedItems.map((item, idx) => {
        const isItemActive =
          engineState?.status === 'running' &&
          engineState?.activeTaskId != null &&
          String(item.id) === String(engineState.activeTaskId);
        const isBlocked = item.isBlocked || item.status === 'blocked';
        const isWaiting = item.status === 'waiting_human';
        const reason =
          item.priorityReason ||
          item.waitingReason ||
          item.blockedReason ||
          item.blocker ||
          'Queued';

        return (
          <div
            key={item.id || idx}
            data-testid={`queue-item-${item.id}`}
            {...(interactive
              ? {
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => handleSelect(item),
                  onKeyDown: (event) => handleRowKeyDown(event, item),
                }
              : {})}
            className={`p-2.5 rounded-md border backdrop relative overflow-hidden ${interactive ? 'cursor-pointer ' : ''}${itemCardClass(
              isItemActive,
              isWaiting,
              isBlocked,
            )}`}
          >
            {/* Header Row: Rank Badge + Priority Tag */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-black shrink-0 ${
                    isItemActive
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  #{item.queueOrder || idx + 1}
                </span>
                <span className="text-[10px] font-mono text-slate-400 uppercase font-semibold truncate">
                  {item.projectName || 'Project'}
                </span>
              </div>

              <span
                className={`text-[9px] px-1.5 py-0.2 rounded border font-mono uppercase tracking-wider shrink-0 ${itemBadgeClass(
                  isItemActive,
                  isWaiting,
                  isBlocked,
                )}`}
              >
                {reason}
              </span>
            </div>

            {/* Task Title */}
            <h4 className="text-xs font-bold text-slate-100 line-clamp-2 leading-tight">
              {formatTaskTitleFirstLine(item)}
            </h4>

            {/* Task Metadata Footer */}
            <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1 text-slate-300 truncate max-w-[70%]">
                <span className="text-emerald-400">▸</span>
                <span className="truncate">{item.currentStageName || 'Stage'}</span>
              </span>
              <span className="shrink-0">KB-{item.id?.slice(0, 4)?.toUpperCase() || 'TASK'}</span>
            </div>

            {isItemActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/***
 * MARK: QueueOrderList default
 * @description Default export alias for QueueOrderList.
 * @example <QueueOrderList items={queue} />
 ***/
export default QueueOrderList;
