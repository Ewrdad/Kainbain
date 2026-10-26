import { useMemo } from 'react';
import { ToolCard } from '../ToolCard';
import { InfoTooltip } from '../common/InfoTooltip';
import { LogViewer } from '../logs/LogViewer';
import { CONSOLE_CHROME } from '../logs/consoleStyles';
import { filterLogRecords } from '../logs/logCategories';

/***
 * MARK: ActivityConsole
 * @description Resizable / collapsible Live Agent Activity Console extracted
 *   from WorkflowCanvas (Critique #19): resize splitter, header bar, the
 *   unified log stream (category chips, search, density, timestamps)
 *   with agent messages and tool cards below, plus
 *   auto-scroll lock and copy/clear actions. Pure presentational — state and
 *   handlers arrive via props (see `useActivityConsole`). Frame colors come
 *   from the shared `CONSOLE_CHROME` so this console matches LiveConsoleWidget.
 * @example <ActivityConsole hasActivity viewer={viewer} logRecords={records} ... />
 ***/
export function ActivityConsole({
  hasActivity,
  showActivityDrawer,
  consoleHeight = 256,
  isDraggingConsole,
  isAgentRunning,
  processLogs = [],
  messages = [],
  toolCalls = [],
  viewer,
  logRecords = [],
  autoScroll,
  setAutoScroll,
  copiedLogs,
  clearLogs,
  toggleActivityDrawer,
  handleResizeMouseDown,
  handleResizeTouchStart,
  handleResizeKeyDown,
  handleCopyLogs,
}) {
  // Every list prop defaults to [] above so a caller that omits one (or the
  // stream hook before first load) renders an empty console, never a crash.
  const safeProcessLogs = processLogs || [];
  const safeMessages = messages || [];
  const safeToolCalls = toolCalls || [];
  const visibleLogCount = useMemo(() => {
    if (!viewer || !Array.isArray(logRecords)) return 0;
    return filterLogRecords(logRecords, viewer).length;
  }, [logRecords, viewer]);
  const showEmptyNotice =
    visibleLogCount === 0 && safeMessages.length === 0 && safeToolCalls.length === 0;

  return (
    <>
      {/* Resizable / Collapsible Live Agent Activity Console (Critique #19) */}
      {hasActivity && (
        <div
          data-testid="activity-console-bar"
          style={{ height: showActivityDrawer ? `${consoleHeight}px` : '36px' }}
          className={`border-t ${CONSOLE_CHROME.headerBorder} ${CONSOLE_CHROME.outerBg} transition-all duration-150 hidden md:flex flex-col shrink-0 z-20 ${
            isDraggingConsole ? 'select-none' : ''
          }`}
        >
          {/* Draggable Vertical Resize Splitter Handle (Critique #19) */}
          <InfoTooltip
            title="Activity Console Splitter"
            description="Drag vertically to resize console height (120px - 600px). Double-click to collapse or expand."
            position="top"
          >
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- pointer handlers mirror the Arrow/Enter keyboard control below (WCAG 2.1.1) */}
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-valuenow={consoleHeight}
              aria-valuemin={120}
              aria-valuemax={600}
              aria-label="Resize Activity Console"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable separator with keyboard control
              tabIndex={0}
              onMouseDown={handleResizeMouseDown}
              onTouchStart={handleResizeTouchStart}
              onDoubleClick={toggleActivityDrawer}
              onKeyDown={handleResizeKeyDown}
              className="h-2.5 sm:h-2 w-full cursor-row-resize bg-border-standard/70 hover:bg-primary transition-colors flex items-center justify-center group shrink-0 touch-none"
            >
              <div className="w-8 h-1 rounded-full bg-text-muted/40 group-hover:bg-on-primary transition-colors" />
            </div>
          </InfoTooltip>

          {/* Console Header Bar (pointer-only duplicate affordance: the nested
              Collapse/Expand toggle button is the keyboard path for the same
              action, so this wrapper stays a plain div — WCAG 2.1.1 met via
              the inner button). */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- see above */}
          <div
            className={`h-9 px-4 ${CONSOLE_CHROME.headerBg} flex items-center justify-between cursor-pointer border-b ${CONSOLE_CHROME.headerBorder} select-none ${CONSOLE_CHROME.headerHover} transition-colors`}
            onClick={toggleActivityDrawer}
          >
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isAgentRunning ? 'bg-primary animate-pulse' : 'bg-secondary'
                }`}
              />
              <span
                className={`text-[10px] font-bold uppercase tracking-wider ${CONSOLE_CHROME.headerText} font-mono`}
              >
                Live Agent Activity Console
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded ${CONSOLE_CHROME.countBadge} font-mono`}
              >
                {safeProcessLogs.length > 0
                  ? `${safeProcessLogs.length} logs`
                  : `${safeMessages.length} messages • ${safeToolCalls.length} tools`}
              </span>
              {isAgentRunning && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded ${CONSOLE_CHROME.streamingPill} font-mono font-bold uppercase tracking-wider animate-pulse`}
                >
                  Streaming...
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                // The header bar div shares this toggle on click: stop the
                // button click bubbling so one press flips the drawer once.
                // (The hook's toggle also stops propagation; this keeps the
                // guarantee inside the component no matter which toggle is
                // passed — a double fire would collapse-then-expand back.)
                onClick={(clickEvent) => {
                  clickEvent?.stopPropagation?.();
                  toggleActivityDrawer(clickEvent);
                }}
                className={`${CONSOLE_CHROME.headerText} hover:text-slate-200 text-xs font-mono flex items-center gap-1 cursor-pointer`}
                aria-label={
                  showActivityDrawer ? 'Collapse activity stream' : 'Expand activity stream'
                }
              >
                <span>{showActivityDrawer ? '▼ Collapse' : '▲ Expand'}</span>
              </button>
            </div>
          </div>

          {showActivityDrawer && (
            <div className={`flex-1 flex flex-col overflow-hidden ${CONSOLE_CHROME.outerBg}`}>
              {/* Unified log stream (keyboard-scrollable role=log region with
                  messages and tool cards in the same scroll flow) */}
              <div className="flex-1 flex flex-col overflow-hidden p-3 text-xs font-mono min-h-0">
                <LogViewer
                  records={logRecords || []}
                  viewer={viewer}
                  scrollKey={safeMessages.length + safeToolCalls.length}
                  searchLabel="Filter logs"
                  onCopy={() => handleCopyLogs()}
                  onClear={clearLogs || null}
                  copiedLogs={copiedLogs}
                  emptyMessage={null}
                  logLabel="Live agent activity stream"
                  header={
                    <div className="mb-1 flex items-center justify-end">
                      <InfoTooltip
                        title={autoScroll ? 'Auto-Scroll Active' : 'Auto-Scroll Locked'}
                        description="When enabled, console automatically follows new streaming log output. Disable to scroll up and inspect past traces."
                        position="top"
                      >
                        <button
                          type="button"
                          onClick={() => setAutoScroll((v) => !v)}
                          aria-pressed={autoScroll}
                          className={`px-2 py-1 rounded text-[10px] uppercase font-bold flex items-center gap-1 transition-colors cursor-pointer min-h-[32px] border ${
                            autoScroll
                              ? CONSOLE_CHROME.autoScrollOn
                              : CONSOLE_CHROME.autoScrollOff
                          }`}
                        >
                          <span>{autoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}</span>
                        </button>
                      </InfoTooltip>
                    </div>
                  }
                  footer={
                    <>
                      {/* Assistant messages */}
                      {safeMessages.map((msg) => (
                        <div key={msg.id} className="flex flex-col gap-1 py-1">
                          <div className="flex items-center justify-between text-[9px] font-bold uppercase font-mono text-slate-500">
                            <span className="flex items-center gap-1 text-[#7bdb85]">
                              <span className="px-1.5 py-0.2 rounded border border-[#7bdb85]/30 bg-[#7bdb85]/10 text-[#7bdb85]">
                                [AGENT]
                              </span>
                              <span>Assistant</span>
                            </span>
                          </div>
                          <div className="p-2.5 bg-[#0b0f1a] border border-slate-800 border-l-2 border-l-emerald-500/60 text-slate-200 rounded-r text-xs leading-relaxed font-body-sm whitespace-pre-wrap">
                            {msg.content}
                            {msg.isTyping && (
                              <span className="inline-block w-1.5 h-3.5 ml-1 bg-primary animate-pulse align-middle" />
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Tool calls */}
                      {safeToolCalls.map((tc) => (
                        <ToolCard key={tc.id} toolCall={tc} />
                      ))}

                      {showEmptyNotice && (
                        <div className="text-center py-8 text-slate-400 italic select-none">
                          No activity logs matching current filter.
                        </div>
                      )}
                    </>
                  }
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
