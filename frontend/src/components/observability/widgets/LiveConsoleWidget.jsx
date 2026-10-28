import { useMemo } from 'react';
import { LogViewer } from '../../logs/LogViewer';
import { CONSOLE_CHROME } from '../../logs/consoleStyles';
import { adaptProcessLogLines } from '../../logs/adapters';
import { useLogViewerState } from '../../logs/logViewerState';

/***
 * MARK: LiveConsoleWidget
 * @description Real-time WebSocket streaming logs terminal. A thin wrapper
 *   over the unified LogViewer: live lines are adapted to LogRecords and the
 *   viewer owns category chips, search, density, timestamps, and copy, while
 *   this widget keeps the monitor console frame (dark terminal surface,
 *   auto-scroll lock, clear action) and the monitoring headers above it stay
 *   owned by ObservabilityDashboard / MobileMonitorView. Frame colors come
 *   from the shared `CONSOLE_CHROME` so this console matches ActivityConsole.
 ***/
export function LiveConsoleWidget({ processLogs = [], onClearLogs = null }) {
  // Compact-friendly live preferences; the legacy board tag
  // (`kainbain:board:logTag`) migrates once inside the hook.
  const viewer = useLogViewerState({ surface: 'live' });

  const records = useMemo(() => adaptProcessLogLines(processLogs), [processLogs]);

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 min-w-0 w-full ${CONSOLE_CHROME.outerBg} overflow-hidden`}
    >
      {/* Console Controls Bar */}
      <div
        className={`px-3 py-1.5 ${CONSOLE_CHROME.headerBg} border-b ${CONSOLE_CHROME.headerBorder} flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs font-mono`}
      >
        <span
          className={`text-[10px] uppercase font-bold tracking-wider ${CONSOLE_CHROME.headerText}`}
        >
          Live console
        </span>
        <button
          type="button"
          onClick={() => viewer.setAutoScroll(!viewer.autoScroll)}
          className={`px-2 py-0.5 rounded border transition-colors cursor-pointer text-[10px] ${
            viewer.autoScroll ? CONSOLE_CHROME.autoScrollOn : CONSOLE_CHROME.autoScrollOff
          }`}
          title="Toggle Auto-scroll"
        >
          {viewer.autoScroll ? 'Auto ON' : 'Auto OFF'}
        </button>
      </div>

      {/* Unified log stream */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full p-3">
        <LogViewer
          records={records}
          viewer={viewer}
          onClear={onClearLogs}
          logLabel="Live telemetry console stream"
          testId="live-log-console"
          emptyMessage="Waiting for process logs stream..."
        />
      </div>
    </div>
  );
}

export default LiveConsoleWidget;
