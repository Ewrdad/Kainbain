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
import {
  filterActiveWorkflowTasks,
  filterBoardTasksWithTags,
  resolveEffectiveMobileStageId,
} from '../nodeModel';

/***
 * MARK: useCanvasSearchFilter
 * @description Search/filter seam extracted from WorkflowCanvas: board filter
 *   state, tag hydration/migration, URL sync, pipeline-switch reset, and the
 *   board/tag/mobile-resolution memos. No JSX — returns state + derived data.
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
      }),
    [
      activeWorkflowTasks,
      stages,
      showCompleted,
      derivedText,
      derivedTags,
      stageTagFilterMode,
      derivedSystemFilters,
    ],
  );

  const stageTagOptions = useMemo(
    () => availableStageTags(stages).map((tag) => ({ value: tag, label: tag })),
    [stages],
  );
  const tagRenderEntries = useMemo(
    () => groupStagesByTagFilter(stages, derivedTags, stageTagFilterMode),
    [stages, derivedTags, stageTagFilterMode],
  );
  const visibleStages = useMemo(
    () => tagRenderEntries.filter((entry) => entry.kind === 'stage').map((entry) => entry.stage),
    [tagRenderEntries],
  );
  const hiddenStageCount = stages.length - visibleStages.length;
  const allStagesHiddenByTags =
    stages.length > 0 && derivedTags.length > 0 && visibleStages.length === 0;

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
    filteredTasks,
    stageTagOptions,
    tagRenderEntries,
    visibleStages,
    hiddenStageCount,
    allStagesHiddenByTags,
    effectiveMobileStageId,
    boardWfId,
  };
}
