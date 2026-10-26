import { useMemo, useRef, useState } from 'react';
import { copyToClipboard } from '../../../services/clipboard';
import { formatLogsForCopy } from '../nodeModel';
import { useLogViewerState } from '../../logs/logViewerState';
import {
  adaptProcessLogLines,
  excludeToolMirrorLinesWhenToolCardsShown,
} from '../../logs/adapters';
import { filterLogRecords } from '../../logs/logCategories';

/***
 * MARK: useActivityConsole
 * @description Live Agent Activity Console state + resize/copy handlers
 *   extracted from WorkflowCanvas. Owns drawer visibility, console height
 *   drag state, and the unified log viewer state (`viewer` + `logRecords`);
 *   the log stream filters through the viewer categories + search while copy
 *   keeps the exact legacy combined-stream format (process logs, messages,
 *   tool calls). No JSX.
 *   Drawer visibility precedence (first match wins): an explicit stored
 *   toggle from a previous expand/collapse, then the user's
 *   `activityDrawerDefaultOpen` preference for a first visit, then collapsed.
 *   The collapsed fallback keeps the survey Q3 default ("start collapsed")
 *   while the preference keeps the Workspace settings toggle truthful.
 * @example const consoleUi = useActivityConsole({ uiPreferences, updateUiPreference, processLogs, messages, toolCalls });
 ***/
export function useActivityConsole({
  uiPreferences,
  updateUiPreference,
  processLogs = [],
  messages = [],
  toolCalls = [],
}) {
  // First-visit default is collapsed (survey Q3: "start collapsed and let
  // me expand them") unless the user explicitly opted into an expanded
  // drawer in Workspace settings; a stored toggle from a previous
  // expand/collapse always wins so the user's latest choice is remembered
  // across reloads.
  const [showActivityDrawer, setShowActivityDrawer] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('kainbain:showActivityDrawer');
      if (stored !== null) return stored === 'true';
    }
    return uiPreferences?.activityDrawerDefaultOpen === true;
  });
  // Unified viewer preferences for the activity surface. The legacy board tag
  // (`kainbain:board:logTag`) and search (`kainbain:board:logSearch`) migrate
  // once inside the hook.
  const viewer = useLogViewerState({ surface: 'activity' });
  const { autoScroll, setAutoScroll } = viewer;

  const toggleActivityDrawer = (e) => {
    e?.stopPropagation?.();
    setShowActivityDrawer((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('kainbain:showActivityDrawer', String(next));
      }
      return next;
    });
  };

  // Resizable Activity Console state and handlers
  const consoleHeight = uiPreferences?.consoleHeight || 256;
  const [isDraggingConsole, setIsDraggingConsole] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(consoleHeight);

  /***
   * MARK: handleResizeMouseDown
   * @description Starts vertical drag-resizing of the Activity Console between 120px and 600px, persisting to localStorage via preferences.
   * @example onMouseDown={handleResizeMouseDown}
   * @param {React.MouseEvent} e
   ***/
  const handleResizeMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingConsole(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = consoleHeight;

    const handleMouseMove = (moveEvent) => {
      const deltaY = dragStartYRef.current - moveEvent.clientY;
      const nextHeight = Math.min(
        600,
        Math.max(120, Math.round(dragStartHeightRef.current + deltaY)),
      );
      updateUiPreference?.('consoleHeight', nextHeight);
    };

    const handleMouseUp = () => {
      setIsDraggingConsole(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  /***
   * MARK: handleResizeTouchStart
   * @description Allows mobile touchscreen users to drag-resize the Activity Console.
   * @example onTouchStart={handleResizeTouchStart}
   * @param {React.TouchEvent} e
   ***/
  const handleResizeTouchStart = (e) => {
    if (!e.touches || e.touches.length === 0) return;
    setIsDraggingConsole(true);
    dragStartYRef.current = e.touches[0].clientY;
    dragStartHeightRef.current = consoleHeight;

    const handleTouchMove = (moveEvent) => {
      if (!moveEvent.touches || moveEvent.touches.length === 0) return;
      const deltaY = dragStartYRef.current - moveEvent.touches[0].clientY;
      const maxAllowed = Math.min(
        600,
        typeof window !== 'undefined' ? window.innerHeight * 0.6 : 600,
      );
      const nextHeight = Math.min(
        maxAllowed,
        Math.max(120, Math.round(dragStartHeightRef.current + deltaY)),
      );
      updateUiPreference?.('consoleHeight', nextHeight);
    };

    const handleTouchEnd = () => {
      setIsDraggingConsole(false);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  };

  /***
   * MARK: handleResizeKeyDown
   * @description Allows keyboard users to adjust console height with Arrow keys or toggle with Enter/Space.
   * @example onKeyDown={handleResizeKeyDown}
   * @param {React.KeyboardEvent} e
   ***/
  const handleResizeKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(600, consoleHeight + 20);
      updateUiPreference?.('consoleHeight', next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(120, consoleHeight - 20);
      updateUiPreference?.('consoleHeight', next);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleActivityDrawer(e);
    }
  };

  // Unified records: adapted once with repeat flagging, minus raw [TOOL]
  // mirrors. The console always renders tool calls as ToolCards below, so
  // the mirrors would duplicate every invocation (legacy
  // `filterProcessLogs` contract, kept verbatim). Monitor surfaces without a
  // card lane keep their mirrors via the `{ showToolCards: false }` policy.
  const logRecords = useMemo(() => {
    const adapted = adaptProcessLogLines(processLogs);
    return excludeToolMirrorLinesWhenToolCardsShown(adapted, { showToolCards: true });
  }, [processLogs]);

  const filteredLogRecords = useMemo(
    () => filterLogRecords(logRecords, viewer),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewer is a stable-shape state object; categories/search are the live inputs
    [logRecords, viewer.categories, viewer.search],
  );

  // Raw-line view of the viewer selection: keeps the exact legacy copy
  // format and any external raw-line consumers working.
  const filteredProcessLogs = useMemo(
    () => filteredLogRecords.map((record) => record.meta?.rawLine || record),
    [filteredLogRecords],
  );

  /***
   * MARK: handleCopyLogs
   * @description Formats and copies the complete combined activity stream (process logs, messages, tool calls)
   * to the clipboard using robust clipboard fallback with visual confirmation feedback.
   * @example handleCopyLogs()
   ***/
  const handleCopyLogs = async () => {
    const textToCopy = formatLogsForCopy({ filteredProcessLogs, messages, toolCalls });
    const ok = await copyToClipboard(textToCopy);
    // Only confirm when the clipboard write actually succeeded.
    setCopiedLogs(ok);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return {
    showActivityDrawer,
    autoScroll,
    setAutoScroll,
    viewer,
    logRecords,
    filteredLogRecords,
    consoleHeight,
    isDraggingConsole,
    copiedLogs,
    toggleActivityDrawer,
    handleResizeMouseDown,
    handleResizeTouchStart,
    handleResizeKeyDown,
    handleCopyLogs,
    filteredProcessLogs,
  };
}
