/***
 * MARK: StatsBreakdownWidget
 * @description Visual breakdown of task statuses, completion vs failure distribution, and queue health ratios.
 ***/
export function StatsBreakdownWidget({ stats = {} }) {
  const total = stats.total || 0;
  const completedPct =
    stats.successRate ?? (total > 0 ? Math.round(((stats.completed || 0) / total) * 100) : 0);
  const failurePct =
    stats.failureRate ?? (total > 0 ? Math.round(((stats.failed || 0) / total) * 100) : 0);
  const inStagePct = total > 0 ? Math.round(((stats.inStage || 0) / total) * 100) : 0;
  const waitingPct = total > 0 ? Math.round(((stats.waitingHuman || 0) / total) * 100) : 0;

  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
      tabIndex={0}
      role="group"
      aria-label="Pipeline distribution breakdown"
      className="flex-1 p-3.5 space-y-3 overflow-y-auto custom-scrollbar font-mono text-xs bg-[#080c16]"
    >
      {/* Progress Distribution Bar */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span className="uppercase">Pipeline distribution</span>
          <span>{total} Total Tasks</span>
        </div>
        <div className="h-4 w-full bg-slate-900 rounded-sm overflow-hidden flex border border-slate-800">
          <div
            style={{ width: `${completedPct}%` }}
            className="bg-emerald-500 transition-all"
            title={`Completed: ${stats.completed} (${completedPct}%)`}
          />
          <div
            style={{ width: `${inStagePct}%` }}
            className="bg-cyan-500 transition-all"
            title={`In Pipeline: ${stats.inStage} (${inStagePct}%)`}
          />
          <div
            style={{ width: `${waitingPct}%` }}
            className="bg-amber-500 transition-all"
            title={`Waiting Review: ${stats.waitingHuman} (${waitingPct}%)`}
          />
          <div
            style={{ width: `${failurePct}%` }}
            className="bg-rose-500 transition-all"
            title={`Failed: ${stats.failed} (${failurePct}%)`}
          />
        </div>
      </div>

      {/* Grid of Status Counts */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Completed
          </span>
          <span className="font-bold text-slate-100">{stats.completed || 0}</span>
        </div>

        <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> In Stage
          </span>
          <span className="font-bold text-slate-100">{stats.inStage || 0}</span>
        </div>

        <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> Human Review
          </span>
          <span className="font-bold text-slate-100">{stats.waitingHuman || 0}</span>
        </div>

        <div className="p-2.5 bg-slate-900/80 rounded border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-400" /> Failures
          </span>
          <span className="font-bold text-slate-100">{stats.failed || 0}</span>
        </div>
      </div>
    </div>
  );
}

export default StatsBreakdownWidget;
