import { useMemo, useState } from 'react';
import { copyToClipboard } from '../../services/clipboard';
import { fullTextIndex, normalizeEntries } from './logEntryModel';
import { LogViewer } from '../logs/LogViewer';
import { adaptTaskEntries } from '../logs/adapters';
import { filterLogRecords, groupLogRecords } from '../logs/logCategories';
import { useLogViewerState } from '../logs/logViewerState';
import { StuckCheckButton, StuckCheckPanel, useStuckCheck } from './StuckCheck';

/***
 * MARK: useTaskLogs
 * @description Shared state + derived data for the task Logs tab: merges the
 *   task's structured log entries (or legacy processLogs text) with live
 *   WebSocket process lines, adapts them once to unified LogRecords, and
 *   filters through the single `useLogViewerState` selection (categories +
 *   search). The unified viewer is the only filter — there is no legacy feed
 *   state left here. Refs and scroll behaviour live in LogsPanel, which
 *   renders them.
 * @example const logs = useTaskLogs({ task, wsProcessLogs, activeProjectId, isTaskExecuting });
 * @param {Object} params
 * @param {Object} params.task - The task (logEntries / processLogs).
 * @param {Array<Object>} [params.wsProcessLogs] - Live process:stdout lines from the WebSocket.
 * @param {string} [params.activeProjectId]
 * @param {boolean} [params.isTaskExecuting]
 * @param {string} [params.taskStageName] - Stage name for the empty-log placeholder.
 * @param {string} [params.activeProjectCwd] - Project cwd for the empty-log placeholder.
 * @returns {Object} Logs view-model consumed by LogsPanel.
 ***/
export function useTaskLogs({
  task,
  wsProcessLogs = [],
  activeProjectId,
  isTaskExecuting,
  taskStageName,
  activeProjectCwd,
}) {
  const taskId = task?.id;
  // Unified viewer preferences (categories/search/density/timestamps). The
  // legacy feed key (`kainbain:taskLogs:<id>:feed`) migrates read-only once
  // inside the hook; auto-scroll lives here too so the status bar and the
  // viewer share one toggle. This is the ONLY filter state for this surface.
  const viewer = useLogViewerState({ surface: 'task', taskId });
  const { autoScroll, setAutoScroll } = viewer;
  const [copiedLogs, setCopiedLogs] = useState(false);

  const matchingWs = useMemo(() => {
    return Array.isArray(wsProcessLogs)
      ? wsProcessLogs.filter(
          (p) =>
            p.taskId === taskId ||
            (!p.taskId && p.projectId === activeProjectId && isTaskExecuting),
        )
      : [];
  }, [wsProcessLogs, taskId, activeProjectId, isTaskExecuting]);

  const entries = useMemo(() => {
    const hasLogs =
      (Array.isArray(task?.logEntries) && task.logEntries.length > 0) || task?.processLogs;
    if (!hasLogs && matchingWs.length === 0) {
      // Same placeholder the terminal has always shown for a fresh task.
      const placeholder = `[INFO] Task initialized in stage: ${taskStageName || 'Initial'}\n[INFO] Discrete instance working directory: ${activeProjectCwd || '~/projects'}\n[INFO] Target output: ./docs/tasks/${taskId || ''}/<stage>-<timestamp>.md`;
      return normalizeEntries({ processLogs: placeholder });
    }
    return normalizeEntries(task, matchingWs);
  }, [task, matchingWs, taskStageName, activeProjectCwd, taskId]);

  const entriesById = useMemo(() => fullTextIndex(entries), [entries]);

  // Unified viewer records: the same entries adapted once (repeat-flagged),
  // grouped by turn before filtering so group shells stay stable while rows
  // within them filter. Copy follows the viewer selection and stays
  // marker-safe (full thinking never leaks unless its lane is selected).
  const logRecords = useMemo(() => adaptTaskEntries(entries), [entries]);
  const logRecordGroups = useMemo(
    () => groupLogRecords(logRecords, { mode: 'turn' }),
    [logRecords],
  );
  const filteredLogRecords = useMemo(
    () => filterLogRecords(logRecords, viewer),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- viewer is a stable-shape state object; categories/search are the live inputs
    [logRecords, viewer.categories, viewer.search],
  );

  const copyTaskLogs = async () => {
    // Copies exactly what the viewer shows: collapsed thinking markers (never
    // the full blocks, unless the user explicitly selected the thinking lane
    // and is looking at them).
    const textToCopy = filteredLogRecords.map((record) => record.text).join('\n');
    const ok = await copyToClipboard(textToCopy);
    // Only confirm when the clipboard write actually succeeded.
    setCopiedLogs(ok);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  return {
    autoScroll,
    setAutoScroll,
    copiedLogs,
    copyTaskLogs,
    entries,
    entriesById,
    viewer,
    logRecords,
    logRecordGroups,
    filteredLogRecords,
  };
}

/***
 * MARK: LogsPanel
 * @description The shared Terminal Logs tab: status bar (stage, model,
 *   auto-scroll, copy, stuck check) plus the unified LogViewer body
 *   (category chips, search, density, timestamps, grouped terminal
 *   rendering). Used by both the TaskDetailPage and the TaskDetailOverlay so
 *   the two views cannot drift. Copy stays marker-safe: full thinking blocks
 *   never leak into the clipboard unless expanded in the viewer.
 * @example <LogsPanel logs={logs} taskStage={taskStage} isTaskExecuting={isTaskExecuting} isActive={activeTab === 'logs'} />
 * @param {Object} props
 * @param {Object} props.logs - View-model from useTaskLogs.
 * @param {Object} [props.taskStage]
 * @param {Object} [props.task] - The task object; enables the advisory "Is it stuck?" check.
 * @param {boolean} [props.isTaskExecuting]
 * @param {boolean} [props.isActive] - Whether the Logs tab is currently visible (drives auto-scroll).
 ***/
export function LogsPanel({ logs, taskStage, task = null, isTaskExecuting, isActive = true }) {
  const stuckCheck = useStuckCheck({ task, taskStage });
  // A hidden tab never chases the stream: follow-scroll pauses while inactive
  // and resumes on return (the toggle itself is untouched). The spread is
  // cheap (a dozen fields); memoising on `logs.viewer` is pointless because
  // the hook returns a fresh object every render.
  const effectiveViewer = { ...logs.viewer, autoScroll: logs.viewer.autoScroll && isActive };

  return (
    <div className="max-w-6xl mx-auto space-y-4 flex flex-col">
      <div className="p-3 bg-surface-container border border-border-standard rounded-sm flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${isTaskExecuting ? 'bg-primary animate-pulse' : 'bg-text-muted'}`}
          />
          <span className="font-bold text-on-surface uppercase">
            {isTaskExecuting ? 'Live Execution Stream' : 'Task Terminal Logs'}
          </span>
          <span className="text-[10px] text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20">
            Stage: {taskStage?.name || 'Stage'} ({taskStage?.type || 'agent'})
          </span>
          {taskStage?.model && (
            <span className="text-[10px] text-secondary px-2 py-0.5 bg-secondary/10 rounded border border-secondary/20">
              Model: {taskStage.model}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={logs.autoScroll}
              onChange={(e) => logs.setAutoScroll(e.target.checked)}
              className="rounded text-primary accent-primary"
            />
            <span>Auto-scroll</span>
          </label>
          <button
            type="button"
            onClick={logs.copyTaskLogs}
            aria-label={logs.copiedLogs ? 'Copied to clipboard' : 'Copy logs'}
            className="px-3 py-1.5 min-h-[44px] bg-surface-container-high hover:bg-surface-container-highest border border-border-standard text-text-muted hover:text-on-surface rounded text-xs uppercase font-bold transition-colors cursor-pointer"
          >
            {logs.copiedLogs ? 'Copied ✓' : 'Copy Logs'}
          </button>
          <StuckCheckButton
            open={stuckCheck.open}
            onClick={stuckCheck.toggle}
            disabled={!stuckCheck.canRun}
          />
        </div>
      </div>

      {stuckCheck.open && <StuckCheckPanel state={stuckCheck} />}

      {/* Unified viewer: category chips, search, density, timestamps, and the
          grouped terminal rendering. Status bar, copy (marker-safe), and the
          stuck check stay owned by this panel. */}
      <div className="p-5 bg-[#0d1117] border border-border-standard rounded-sm font-mono text-xs min-h-[420px] max-h-[calc(100vh-320px)] custom-scrollbar shadow-inner select-text flex flex-col">
        <LogViewer
          records={logs.logRecords}
          groups={logs.logRecordGroups}
          viewer={effectiveViewer}
          fullTextById={logs.entriesById}
          showCopyButton={false}
          logLabel="Task live process logs"
          emptyMessage="No logs recorded matching filter."
        />
      </div>
    </div>
  );
}
