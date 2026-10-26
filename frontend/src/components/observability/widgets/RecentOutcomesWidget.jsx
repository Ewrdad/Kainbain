import { formatTaskTitleFirstLine } from '../../tasks/taskFormatters';

export function RecentOutcomesWidget({ recentCompleted = [], recentFailed = [] }) {
  const combined = [
    ...recentCompleted.map((t) => ({ ...t, outcome: 'SUCCESS' })),
    ...recentFailed.map((t) => ({ ...t, outcome: 'FAILED' })),
  ].sort((a, b) => {
    const timeA = new Date(a.completedAt || a.failedAt || 0).getTime();
    const timeB = new Date(b.completedAt || b.failedAt || 0).getTime();
    return timeB - timeA;
  });

  // Render the outcome list or an empty-state panel.
  const renderBody = () => {
    if (combined.length === 0) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs">
          <span className="text-2xl mb-1 opacity-40">📜</span>
          <p>No recent execution outcomes yet</p>
        </div>
      );
    }
    return combined.map((item, idx) => {
      const isSuccess = item.outcome === 'SUCCESS';
      const cardClass = isSuccess
        ? 'bg-slate-900/80 border-emerald-900/40 hover:border-emerald-700/60'
        : 'bg-rose-950/20 border-rose-900/50 hover:border-rose-700/60';
      const badgeClass = isSuccess
        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
        : 'bg-rose-950 text-rose-300 border border-rose-800';
      // Resolve completion timestamp from either success or failure field.
      const completedAt = item.completedAt || item.failedAt || null;
      return (
        <div
          key={item.id || idx}
          className={`p-2.5 rounded-md border flex items-center justify-between gap-3 ${cardClass}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold shrink-0 ${badgeClass}`}
            >
              {isSuccess ? '✓' : '✕'}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-200 truncate">
                {formatTaskTitleFirstLine(item, 'Task')}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {item.projectName || 'Project'} •{' '}
                {isSuccess
                  ? `${item.reportsCount || 0} reports generated`
                  : item.failureReason || 'Execution error'}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0 text-[10px] text-slate-400">
            <div className={isSuccess ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
              {item.outcome}
            </div>
            <div>{completedAt ? new Date(completedAt).toLocaleTimeString() : ''}</div>
          </div>
        </div>
      );
    });
  };

  return (
    <div
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable widget body (WCAG 2.1.1)
      tabIndex={0}
      role="group"
      aria-label="Recent outcomes list"
      className="flex-1 p-2.5 space-y-2 overflow-y-auto custom-scrollbar font-mono text-xs bg-[#080c16]"
    >
      {renderBody()}
    </div>
  );
}

export default RecentOutcomesWidget;
