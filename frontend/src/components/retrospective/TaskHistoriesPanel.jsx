import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { Announcer } from '../../a11y/Announce';
import { scrollIntoViewRespectingMotion } from '../../a11y/reducedMotion';
import { usePersistentState } from '../../hooks/usePersistentState';
import { formatDuration } from '../workflow/stageAnalytics';
import { formatTaskKey } from '../tasks/taskFormatters';
import { getStageType } from '../stageTypes';
import { useRetrospective } from './useRetrospective';
import { StageVisibilityToggle } from './StageVisibilityToggle';
import {
  STAGE_VISIBILITY_STORAGE_KEY,
  currentShowParam,
  filterStageSamples,
  isStageVisibilityToggleEnabled,
  listStageTypes,
  normalizeHiddenList,
  writeShowParam,
} from './stageVisibility';
import {
  computeRetrospectiveStats,
  formatCompactDuration,
  formatTaskTotals,
  isRetrospectiveTaskFailed,
  listWorkflows,
  selectVisibleTasks,
  stageSampleFailed,
  sumActiveSeconds,
} from './retrospectiveStats';

/***
 * MARK: TaskHistoriesPanel
 * @description Bird's-eye list of recent tasks: stats strip, client-side
 *   sort/filter, per-stage duration bars with FAILED markers, checkbox
 *   multi-select (shared retrospective context), expandable rows with inline
 *   stage detail, a stage-type visibility filter (persisted, `?show=` links),
 *   and a deep link to the full task view. The filter hides duration bars
 *   only — task totals and the stats strip always describe the whole task.
 * @param {Object} props
 * @param {Array<Object>} [props.tasks] - Duration-enriched summaries.
 * @param {boolean} [props.loading] - List loading state.
 * @param {string|null} [props.error] - List error text.
 * @param {Function} [props.onRefresh] - Retry callback.
 * @param {string|null} [props.expandedId] - Expanded task id.
 * @param {Object|null} [props.expandedTask] - Hydrated (or summary) task for the expansion.
 * @param {boolean} [props.expanding] - Hydration in flight.
 * @param {Function} [props.onToggleExpanded] - Row expand/collapse callback.
 * @example <TaskHistoriesPanel tasks={tasks} loading={false} ... />
 ***/
export function TaskHistoriesPanel({
  tasks = [],
  loading = false,
  error = null,
  onRefresh,
  expandedId = null,
  expandedTask = null,
  expanding = false,
  onToggleExpanded,
}) {
  const { setView } = useKainBain();
  const { selectedIds, setSelected } = useRetrospective();
  const [sort, setSort] = useState('recent');
  const [statusFilter, setStatusFilter] = useState('all');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [announcement, setAnnouncement] = useState('');
  const expandedRef = useRef(null);

  // Stage-type visibility: a persisted hidden set (new types stay visible),
  // pre-populated once from `?show=` share links and written back on toggle.
  const visibilityEnabled = isStageVisibilityToggleEnabled();
  const knownStageTypes = useMemo(() => listStageTypes(tasks), [tasks]);
  const [storedHidden, setStoredHidden] = usePersistentState(STAGE_VISIBILITY_STORAGE_KEY, [], {
    validate: (value) => Array.isArray(value),
    syncAcrossTabs: true,
  });
  const hiddenStageTypes = useMemo(
    () => (visibilityEnabled ? new Set(normalizeHiddenList(storedHidden)) : new Set()),
    [visibilityEnabled, storedHidden],
  );
  const showParamAppliedRef = useRef(false);
  useEffect(() => {
    // Tasks load async: apply the share link once types are known. Stored
    // preferences win when the URL carries no `?show=`.
    if (!visibilityEnabled || showParamAppliedRef.current || knownStageTypes.length === 0) return;
    showParamAppliedRef.current = true;
    const parsed = currentShowParam();
    if (!parsed.present) return;
    setStoredHidden(knownStageTypes.filter((type) => !parsed.visible.includes(type)));
  }, [visibilityEnabled, knownStageTypes, setStoredHidden]);
  const knownTypesRef = useRef(knownStageTypes);
  useEffect(() => {
    knownTypesRef.current = knownStageTypes;
  });
  useEffect(() => {
    // Back/forward (or a pasted link) while the page stays mounted: re-apply
    // the URL. Toggle writes use replaceState, which fires neither event, so
    // this only ever reacts to external navigation — no write loop.
    if (!visibilityEnabled || typeof window === 'undefined') return undefined;
    const applySharedLink = () => {
      const parsed = currentShowParam();
      if (!parsed.present) return;
      showParamAppliedRef.current = true;
      setStoredHidden(knownTypesRef.current.filter((type) => !parsed.visible.includes(type)));
    };
    window.addEventListener('hashchange', applySharedLink);
    window.addEventListener('popstate', applySharedLink);
    return () => {
      window.removeEventListener('hashchange', applySharedLink);
      window.removeEventListener('popstate', applySharedLink);
    };
  }, [visibilityEnabled, setStoredHidden]);

  const visibleTasks = useMemo(
    () => selectVisibleTasks(tasks, { sort, statusFilter, workflowFilter }),
    [tasks, sort, statusFilter, workflowFilter],
  );
  const stats = useMemo(() => computeRetrospectiveStats(tasks), [tasks]);
  const workflows = useMemo(() => listWorkflows(tasks), [tasks]);

  useEffect(() => {
    if (expandedId && expandedRef.current) {
      scrollIntoViewRespectingMotion(expandedRef.current, { block: 'nearest' });
    }
  }, [expandedId]);

  const handleSelect = (taskId, selected) => {
    setSelected(taskId, selected);
    const task = tasks.find((t) => t?.id === taskId);
    const key = formatTaskKey(taskId);
    setAnnouncement(
      selected ? `${task?.title || key} selected.` : `${task?.title || key} deselected.`,
    );
  };

  const handleToggleStageType = (type) => {
    const next = new Set(hiddenStageTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    const nextList = [...next];
    setStoredHidden(nextList);
    writeShowParam(nextList, knownStageTypes);
    const label = getStageType(type).label;
    setAnnouncement(next.has(type) ? `${label} stages hidden.` : `${label} stages shown.`);
  };

  const handleShowAllStageTypes = () => {
    setStoredHidden([]);
    writeShowParam([], knownStageTypes);
    setAnnouncement('Showing all stage types.');
  };

  if (loading) {
    return (
      <section
        aria-label="Task histories"
        data-testid="retrospective-histories"
        className="flex flex-col gap-3"
      >
        <div className="p-6 bg-surface-container border border-border-standard rounded-sm text-sm text-text-muted">
          Loading task histories…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Task histories"
        data-testid="retrospective-histories"
        className="flex flex-col gap-3"
      >
        <div className="p-6 bg-surface-container border border-border-standard rounded-sm text-sm">
          <p className="text-error mb-3">Failed to load task histories: {error}</p>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 min-h-[44px] text-xs font-bold uppercase tracking-wider rounded-sm bg-primary text-on-primary cursor-pointer"
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Task histories"
      data-testid="retrospective-histories"
      className="flex flex-col gap-3"
    >
      <Announcer message={announcement} />
      <div
        data-testid="retrospective-stats"
        className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 bg-surface-container border border-border-standard rounded-sm text-xs font-mono text-text-muted"
      >
        <span>
          <strong className="text-on-surface">{stats.total}</strong> tasks
        </span>
        <span>
          <strong className="text-primary">{stats.completed}</strong> completed
        </span>
        <span>
          <strong className="text-error">{stats.failed}</strong> failed
        </span>
        <span>
          <strong className="text-on-surface">{stats.active}</strong> active
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5 text-text-muted">
          Sort
          <select
            aria-label="Sort tasks"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="bg-surface-deep border border-border-standard rounded-sm px-2 py-2 lg:py-1 min-h-[44px] lg:min-h-0 text-on-surface"
          >
            <option value="recent">Most recent</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-muted">
          Status
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-surface-deep border border-border-standard rounded-sm px-2 py-2 lg:py-1 min-h-[44px] lg:min-h-0 text-on-surface"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="active">Active</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-text-muted">
          Workflow
          <select
            aria-label="Filter by workflow"
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value)}
            className="bg-surface-deep border border-border-standard rounded-sm px-2 py-2 lg:py-1 min-h-[44px] lg:min-h-0 text-on-surface"
          >
            <option value="all">All</option>
            {workflows.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        {visibilityEnabled && (
          <StageVisibilityToggle
            types={knownStageTypes}
            hiddenTypes={hiddenStageTypes}
            onToggle={handleToggleStageType}
            onShowAll={handleShowAllStageTypes}
          />
        )}
      </div>

      {visibleTasks.length === 0 ? (
        <div className="p-6 bg-surface-container border border-border-standard rounded-sm text-sm text-text-muted">
          {tasks.length === 0
            ? 'No tasks yet — completed and active work will appear here.'
            : 'No tasks match these filters.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibleTasks.map((task) => {
            const failed = isRetrospectiveTaskFailed(task);
            const selected = selectedIds.has(task.id);
            const expanded = expandedId === task.id;
            return (
              <li
                key={task.id}
                data-testid={`retrospective-task-${task.id}`}
                ref={expanded ? expandedRef : undefined}
                className={`bg-surface-container border rounded-sm ${selected ? 'border-primary' : 'border-border-standard'}`}
              >
                <div className="flex items-start gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${task.title || task.id} as chat context`}
                    checked={selected}
                    onChange={(e) => handleSelect(task.id, e.target.checked)}
                    className="mt-1.5 size-5 lg:size-4 shrink-0 accent-secondary cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onToggleExpanded?.(task.id)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${task.title || task.id}`}
                        className="py-1.5 lg:py-0 min-h-[44px] lg:min-h-0 text-sm font-bold text-on-surface truncate hover:underline cursor-pointer text-left"
                      >
                        {task.title || 'Untitled task'}
                      </button>
                      {failed && (
                        <span className="text-[0.625rem] uppercase font-mono px-1.5 py-0.5 rounded bg-error/20 text-error border border-error/40">
                          Failed
                        </span>
                      )}
                    </div>
                    <div className="text-[0.6875rem] font-mono text-text-muted mt-0.5">
                      {formatTaskKey(task.id)} · {task.status || 'unknown'} ·{' '}
                      {formatTaskTotals(task)}
                    </div>
                    <StageDurationBars task={task} hiddenTypes={hiddenStageTypes} />
                  </div>
                  <button
                    type="button"
                    onClick={() => setView('task-detail', { taskId: task.id })}
                    aria-label={`Open full task view for ${task.title || task.id}`}
                    title="Open full task view"
                    className="inline-flex items-center px-2 py-2 lg:px-0 lg:py-0 min-h-[44px] lg:min-h-0 text-xs font-mono text-secondary hover:underline cursor-pointer shrink-0"
                  >
                    Open ↗
                  </button>
                </div>
                {expanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border-standard">
                    <TaskExpansionDetail
                      task={expandedTask?.id === task.id ? expandedTask : task}
                      summary={task}
                      expanding={expanding}
                      hiddenTypes={hiddenStageTypes}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/***
 * MARK: StageDurationBars
 * @description Per-stage duration bars with FAILED markers ("Review 10m 5s
 *   FAILED"). Bar widths scale to the task's longest VISIBLE stage, so
 *   hiding a slow approval re-scales the bars being compared. Hidden types
 *   (the stage-type filter) leave no rows behind.
 ***/
function StageDurationBars({ task, hiddenTypes }) {
  const samples = Array.isArray(task?.stageDurationSamples) ? task.stageDurationSamples : [];
  const visible = filterStageSamples(samples, hiddenTypes);
  const totals = visible.map((s) =>
    (Array.isArray(s?.seconds) ? s.seconds : []).reduce((sum, v) => sum + (Number(v) || 0), 0),
  );
  const max = Math.max(1, ...totals);
  if (samples.length === 0) {
    return (
      <div className="text-[0.6875rem] font-mono text-text-muted mt-1">No stage durations yet.</div>
    );
  }
  if (visible.length === 0) {
    return (
      <div className="text-[0.6875rem] font-mono text-text-muted mt-1">
        All stage types are hidden by the stage-type filter.
      </div>
    );
  }
  return (
    <ul aria-label="Per-stage durations" className="flex flex-col gap-1 mt-1.5">
      {visible.map((sample, index) => {
        // eslint-disable-next-line security/detect-object-injection -- totals is indexed by the map loop counter, never by user input
        const total = totals[index];
        const failed = stageSampleFailed(task, sample);
        return (
          <li key={sample.stageId || sample.stageName || index} className="flex items-center gap-2">
            <span className="text-[0.6875rem] font-mono text-text-muted w-24 truncate shrink-0">
              {sample.stageName || sample.stageId}
            </span>
            <span
              role="img"
              aria-label={`${sample.stageName || sample.stageId} ${formatDuration(total)}${failed ? ' failed' : ''}`}
              className="flex-1 h-2 rounded-sm bg-surface-deep overflow-hidden min-w-8"
            >
              <span
                className={`block h-full rounded-sm ${failed ? 'bg-error' : 'bg-primary'}`}
                style={{ width: `${Math.max(2, Math.round((total / max) * 100))}%` }}
              />
            </span>
            <span className="text-[0.6875rem] font-mono text-text-muted shrink-0">
              {formatDuration(total)}
            </span>
            {failed && (
              <span className="text-[0.625rem] uppercase font-mono text-error shrink-0">
                Failed
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/***
 * MARK: TaskExpansionDetail
 * @description Inline stage detail for an expanded row: failure evidence,
 *   active-time summary, and the hydrated timeline when available.
 ***/
function TaskExpansionDetail({ task, summary, expanding, hiddenTypes }) {
  const detail = task || summary;
  const timeline = Array.isArray(detail?.timeline) ? detail.timeline : [];
  const visibleSamples = filterStageSamples(summary?.stageDurationSamples, hiddenTypes);
  return (
    <div className="text-xs text-text-muted flex flex-col gap-1.5">
      {(detail?.failureReason || detail?.lastError?.message) && (
        <p>
          <span className="font-bold text-error">Failure: </span>
          {detail.failureReason || detail.lastError.message}
        </p>
      )}
      <p className="font-mono">
        Active {formatCompactDuration(sumActiveSeconds(summary))} · {visibleSamples.length} stages
        with durations
      </p>
      {expanding && <p>Loading full task detail…</p>}
      {!expanding && timeline.length > 0 && (
        <ul aria-label="Task timeline" className="flex flex-col gap-0.5 font-mono text-[0.6875rem]">
          {timeline.slice(-8).map((entry, index) => (
            <li key={`${entry.stage}-${entry.timestamp}-${index}`}>
              {entry.stage} — {entry.status}
              {entry.duration ? ` (${entry.duration})` : ''}
            </li>
          ))}
        </ul>
      )}
      {!expanding && timeline.length === 0 && sumActiveSeconds(summary) === 0 && (
        <p>No stage visits recorded yet.</p>
      )}
    </div>
  );
}
