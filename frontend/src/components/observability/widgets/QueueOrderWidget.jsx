import { formatTaskTitleFirstLine } from '../../tasks/taskFormatters';

/***
 * MARK: itemCardClass
 * @description Resolves the card border/background styling for a queue item.
 * @param {boolean} active
 * @param {boolean} waiting
 * @param {boolean} blocked
 * @returns {string}
 ***/
function itemCardClass(active, waiting, blocked) {
  if (active)
    return 'bg-emerald-950/30 border-emerald-500/70 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
  if (waiting) return 'bg-amber-950/20 border-amber-500/50';
  if (blocked) return 'bg-slate-900/60 border-rose-900/40 opacity-70';
  return 'bg-slate-900/80 border-slate-800 hover:border-slate-700';
}

/***
 * MARK: itemBadgeClass
 * @description Resolves the priority tag badge class for a queue item.
 * @param {boolean} active
 * @param {boolean} waiting
 * @param {boolean} blocked
 * @returns {string}
 ***/
function itemBadgeClass(active, waiting, blocked) {
  if (active) return 'bg-emerald-950 text-emerald-400 border-emerald-500/50 animate-pulse';
  if (waiting) return 'bg-amber-950 text-amber-300 border-amber-500/50';
  if (blocked) return 'bg-rose-950 text-rose-300 border-rose-500/50';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}

/***
 * MARK: QueueOrderWidget
 * @description Displays the autonomous execution queue in exact priority order (#1, #2, #3, ...)
 * with stage progress, priority reasoning, project tags, and dependency warning indicators.
 * The active slot belongs to the engine owner only (see runningTask): a
 * queue-head fallback or a stale running_* label must never crown a second
 * active item.
 ***/
export function QueueOrderWidget({ scheduledQueue = [], engineState = {}, schedulerRunning }) {
  // An empty queue is idle-waiting, not off — unless the scheduler itself is
  // stopped. schedulerRunning arrives via the observability payload; unknown
  // (null metrics) reads as idle, never as stopped.
  const schedulerStopped = schedulerRunning === false;
  // Render the empty-state or the ordered queue list.
  const renderQueue = () => {
    if (scheduledQueue.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 font-mono text-xs">
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
    }
    return scheduledQueue.map((item, idx) => {
      // Single-active invariant: active = the engine owner under a running
      // engine, nothing else. The old `idx === 0` fallback crowned the queue
      // head (often a stale running_* label) as a second active item.
      const isItemActive =
        engineState?.status === 'running' &&
        engineState?.activeTaskId != null &&
        String(item.id) === String(engineState.activeTaskId);
      const isBlocked = item.isBlocked || item.status === 'blocked';
      const isWaiting = item.status === 'waiting_human';

      return (
        <div
          key={item.id || idx}
          data-testid={`queue-item-${item.id}`}
          className={`p-2.5 rounded-md border backdrop relative overflow-hidden ${itemCardClass(
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
              {item.priorityReason || 'Queued'}
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
    });
  };

  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
      tabIndex={0}
      role="group"
      aria-label="Queue order list"
      className="flex-1 p-2.5 space-y-2 overflow-y-auto custom-scrollbar bg-[#080c16]"
    >
      {renderQueue()}
    </div>
  );
}

export default QueueOrderWidget;
