import { useState, useEffect, useMemo, useRef } from 'react';
import { useBoardFilters } from './useBoardFilters';
import { useStageTagFilter } from './useStageTagFilter';
import {
  STAGE_TAG_FILTER_STORAGE_KEY,
  availableStageTags,
  currentStageTagFilter,
  groupStagesByTagFilter,
  normalizeSelectedTagTokens,
  writeStageTagFilterParam,
} from '../stageTagFilter';
import { parseSearchQuery, buildSearchQuery } from '../searchQueryParser';
import { isColumnSystemFilter } from '../systemFilters';
import { isTaskCompleted } from '../../tasks/taskFormatters';
import {
  filterActiveWorkflowTasks,
  filterBoardTasksWithTags,
  filterVisibleStagesByColumnFilters,
  resolveEffectiveMobileStageId,
} from '../nodeModel';

/***
 * MARK: useCanvasSearchFilter
 * @description Search/filter seam extracted from WorkflowCanvas: board filter
 *   state, tag hydration/migration, URL sync, pipeline-switch reset, and the
 *   board/tag/column-filter/mobile-resolution memos. `!` column filters
 *   (`!running`, `!tasked`) intersect with the `#` tag visibility; every memo
 *   depends on the websocket-fed `tasks`/`engineState` props so columns
 *   show/hide live with no refresh. No JSX — returns state + derived data.
 * @example const search = useCanvasSearchFilter({ uiPreferences, stages, tasks, activeWorkflow, activeWfId, currentStageId });
 ***/
export function useCanvasSearchFilter({
  uiPreferences,
  stages = [],
  tasks = [],
  activeWorkflow,
  activeWfId,
  currentStageId,
  setExpandedSettingsStageId,
  engineState,
  isAgentRunning = false,
} = {}) {
  const {
    searchQuery,
    setSearchQuery,
    derivedTags,
    derivedText,
    derivedSystemFilters,
    showCompleted,
    setShowCompleted,
    addingTaskStageId,
    setAddingTaskStageId,
    newTaskTitle,
    setNewTaskTitle,
    selectedMobileStageId,
    setSelectedMobileStageId,
  } = useBoardFilters({ uiPreferences });

  const { stageTagFilterMode, setStageTagFilterMode } = useStageTagFilter();

  const clearTagFilter = () => {
    const parsed = parseSearchQuery(searchQuery);
    if (parsed.tags.length === 0) return;
    setSearchQuery(buildSearchQuery(parsed.text, [], parsed.systemFilters));
  };

  const clearColumnFilters = () => {
    const parsed = parseSearchQuery(searchQuery);
    const remaining = parsed.systemFilters.filter((id) => !isColumnSystemFilter(id));
    if (remaining.length === parsed.systemFilters.length) return;
    setSearchQuery(buildSearchQuery(parsed.text, parsed.tags, remaining));
  };

  const clearStageVisibilityFilters = () => {
    const parsed = parseSearchQuery(searchQuery);
    const remaining = parsed.systemFilters.filter((id) => !isColumnSystemFilter(id));
    if (parsed.tags.length === 0 && remaining.length === parsed.systemFilters.length) return;
    setSearchQuery(buildSearchQuery(parsed.text, [], remaining));
  };

  const hydratedSearchTagsOnce = useRef(false);
  useEffect(() => {
    if (hydratedSearchTagsOnce.current) return;
    hydratedSearchTagsOnce.current = true;
    const fromUrl = currentStageTagFilter();
    let stored = [];
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(STAGE_TAG_FILTER_STORAGE_KEY);
        if (raw) stored = normalizeSelectedTagTokens(JSON.parse(raw));
      }
    } catch {
      stored = [];
    }
    const incoming = fromUrl.present ? fromUrl.selected : stored;
    if (incoming.length > 0) {
      setSearchQuery((prev) => {
        const parsed = parseSearchQuery(typeof prev === 'string' ? prev : '');
        const merged = [...parsed.tags];
        for (const tag of incoming) {
          if (!merged.some((t) => t.toLowerCase() === tag.toLowerCase())) {
            merged.push(tag);
          }
        }
        if (merged.length === parsed.tags.length) return prev;
        // Keep any committed `!` system filters — hydration merges tags only.
        return buildSearchQuery(parsed.text, merged, parsed.systemFilters);
      });
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(STAGE_TAG_FILTER_STORAGE_KEY);
      }
    } catch {
      // Storage unavailable; nothing to migrate.
    }
  }, [setSearchQuery]);

  const urlSyncSkipMountRef = useRef(true);
  useEffect(() => {
    if (urlSyncSkipMountRef.current) {
      urlSyncSkipMountRef.current = false;
      return;
    }
    writeStageTagFilterParam(derivedTags, stageTagFilterMode);
  }, [derivedTags, stageTagFilterMode]);

  const activeWorkflowTasks = useMemo(
    () => filterActiveWorkflowTasks(tasks, activeWfId, activeWorkflow),
    [tasks, activeWfId, activeWorkflow],
  );

  const [boardWfId, setBoardWfId] = useState(activeWfId);
  if (boardWfId !== activeWfId) {
    setBoardWfId(activeWfId);
    if (typeof setExpandedSettingsStageId === 'function') {
      setExpandedSettingsStageId(null);
    }
    setAddingTaskStageId(null);
    setNewTaskTitle('');
    setSelectedMobileStageId(null);
  }

  const { filteredTasks } = useMemo(
    () =>
      filterBoardTasksWithTags({
        tasks: activeWorkflowTasks,
        stages,
        showCompleted,
        textQuery: derivedText,
        selectedTags: derivedTags,
        tagMode: stageTagFilterMode,
        systemFilters: derivedSystemFilters,
        filterCtx: { engineState, isAgentRunning },
      }),
    [
      activeWorkflowTasks,
      stages,
      showCompleted,
      derivedText,
      derivedTags,
      stageTagFilterMode,
      derivedSystemFilters,
      engineState,
      isAgentRunning,
    ],
  );

  const activeColumnFilterIds = useMemo(
    () => derivedSystemFilters.filter((id) => isColumnSystemFilter(id)),
    [derivedSystemFilters],
  );

  // Column visibility reads the board set after the completed toggle (survey
  // Q2): a column whose only tasks are hidden by that toggle hides too.
  const boardTasksForColumns = useMemo(
    () => activeWorkflowTasks.filter((task) => showCompleted || !isTaskCompleted(task)),
    [activeWorkflowTasks, showCompleted],
  );

  const columnVisibleStageIds = useMemo(
    () =>
      filterVisibleStagesByColumnFilters({
        stages,
        tasks: boardTasksForColumns,
        columnFilterIds: activeColumnFilterIds,
        tagMode: stageTagFilterMode,
        filterCtx: { engineState, isAgentRunning },
      }),
    [
      stages,
      boardTasksForColumns,
      activeColumnFilterIds,
      stageTagFilterMode,
      engineState,
      isAgentRunning,
    ],
  );

  // Filter-then-group: column-hidden stages are omitted (never a collapsed
  // rail), then the survivors group by `#` tags as before. With no column
  // filters the input is referentially identical to `stages`, so tag-only
  // behavior is byte-for-byte the old path.
  const columnVisibleStages = useMemo(() => {
    if (activeColumnFilterIds.length === 0) return stages;
    const visible = new Set(columnVisibleStageIds);
    return stages.filter((stage) => visible.has(stage?.id));
  }, [stages, activeColumnFilterIds, columnVisibleStageIds]);

  const stageTagOptions = useMemo(
    () => availableStageTags(stages).map((tag) => ({ value: tag, label: tag })),
    [stages],
  );
  const tagRenderEntries = useMemo(
    () => groupStagesByTagFilter(columnVisibleStages, derivedTags, stageTagFilterMode),
    [columnVisibleStages, derivedTags, stageTagFilterMode],
  );
  const visibleStages = useMemo(
    () => tagRenderEntries.filter((entry) => entry.kind === 'stage').map((entry) => entry.stage),
    [tagRenderEntries],
  );
  const hiddenStageCount = stages.length - visibleStages.length;
  // Tag-dimension only (over the FULL stage list): `visibleStages` is now the
  // tag ∩ column intersection, so the old formula would misreport a
  // `#tag` + `!running` intersection-empty board as tag-hidden.
  const allStagesHiddenByTags = useMemo(() => {
    if (stages.length === 0 || derivedTags.length === 0) return false;
    return !groupStagesByTagFilter(stages, derivedTags, stageTagFilterMode).some(
      (entry) => entry.kind === 'stage',
    );
  }, [stages, derivedTags, stageTagFilterMode]);
  // Intersection-empty while a column filter is active: covers both the
  // column dimension killing everything and a `#tag` × `!` mix emptying the
  // intersection (Q4: never a silent empty board). The canvas renders the tag
  // branch first when both flags hold.
  const allStagesHiddenByColumnFilters =
    stages.length > 0 && activeColumnFilterIds.length > 0 && visibleStages.length === 0;

  const effectiveMobileStageId = useMemo(
    () =>
      resolveEffectiveMobileStageId({
        selectedMobileStageId,
        currentStageId,
        stages: visibleStages,
        filteredTasks,
      }),
    [selectedMobileStageId, currentStageId, visibleStages, filteredTasks],
  );

  return {
    searchQuery,
    setSearchQuery,
    derivedTags,
    derivedText,
    systemFilters: derivedSystemFilters,
    showCompleted,
    setShowCompleted,
    addingTaskStageId,
    setAddingTaskStageId,
    newTaskTitle,
    setNewTaskTitle,
    selectedMobileStageId,
    setSelectedMobileStageId,
    stageTagFilterMode,
    setStageTagFilterMode,
    clearTagFilter,
    clearColumnFilters,
    clearStageVisibilityFilters,
    activeColumnFilterIds,
    hasActiveTagFilter: derivedTags.length > 0,
    hasActiveColumnFilters: activeColumnFilterIds.length > 0,
    filteredTasks,
    stageTagOptions,
    tagRenderEntries,
    visibleStages,
    hiddenStageCount,
    allStagesHiddenByTags,
    allStagesHiddenByColumnFilters,
    effectiveMobileStageId,
    boardWfId,
  };
}
