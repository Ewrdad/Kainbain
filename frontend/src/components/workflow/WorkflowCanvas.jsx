import React, { useState, useEffect, useRef } from 'react';
import { useKainBain } from '../../context/KainBainContext';
import { readStoredShowCompleted } from '../../context/useTaskBoard';
import { FALLBACK_MODELS } from '../stageTypes';
import { useModelCatalog } from '../../hooks/useModelCatalog';
import { useNow } from '../../hooks/useNow';

import { AddStageMenu } from './AddStageMenu';
import { CanvasToolbar } from './CanvasToolbar';
import { StageColumn } from './StageColumn';
import { CollapsedStageRunBar } from './CollapsedStageRunBar';
import { ActivityConsole } from './ActivityConsole';
import {
  useMobileToolbarCollapse,
  MOBILE_TOOLBAR_COLLAPSE_EVENT,
} from './hooks/useMobileToolbarCollapse';
import { useStageDnD } from './hooks/useStageDnD';
import { useTaskActions } from './hooks/useTaskActions';
import { useActivityConsole } from './hooks/useActivityConsole';
import { useCanvasSearchFilter } from './hooks/useCanvasSearchFilter';
import { useCollapsedGroups } from './hooks/useCollapsedGroups';
import { useCanvasAnalytics } from './hooks/useCanvasAnalytics';

/***
 * MARK: WorkflowCanvas
 * @description The unified master Kanban orchestrator canvas.
 * Features:
 * - Top-level search and filter bar (search by goal/id/tags, status pills, show completed toggle).
 * - Dynamic stage columns with rich ochre draggable headers for reordering columns.
 * - In-column stage analytics strip and expandable Stage Settings drawer.
 * - Full-height drop zone "+ Add Task" button that stretches to fill empty column space (#33).
 * - Mobile (< 768px): single full-width stage column with a stage-selector
 *   tab strip; stage creation lives in the strip's trailing "+" button
 *   (the desktop dashed end column is hidden on mobile). Full width is
 *   enforced by a `@media (max-width: 767px)` override in `index.css`
 *   because the desktop inline column-width style outranks `w-full`, and
 *   the board locks horizontal panning (`overflow-x-hidden`) so the single
 *   stage can never slide sideways. The trailing "+" renders as an in-flow
 *   pill at the end of the scrollable strip, styled like a stage tab with
 *   a dashed border (it never overlays the other tabs).
 * - Flicker-free live drag-and-drop for tasks and column reordering.
 * - Visual paused stage indicators (PAUSED badge, muted border/background, no-advance notice).
 * - Individual task card human checkpoint approval actions and direct stage execution triggers.
 * - Collapsible Live Agent Activity Console with severity-colored logs, auto-scroll, and resizer.
 *
 * @example <WorkflowCanvas />
 ***/
export { STAGE_KEYWORD_TOKENS } from './stageTokens';
export { AddStageButton } from './AddStageButton';

export function WorkflowCanvas() {
  const {
    activeProject = null,
    stages = [],
    workflowLoading = false,
    workflowSwitching = false,
    tasksLoading = false,
    tasksError = null,
    retryTasks,
    tasks = [],
    messages = [],
    toolCalls = [],
    processLogs = [],
    clearLogs,
    setSelectedTask,
    currentStageId,
    activeProjectId,
    projectWorkflows = [],
    activeWorkflowId,
    switchWorkflow,
    createWorkflow,
    notifySuccess,
    notifyError,
    advanceTask,
    moveTask,
    createTask,
    executeTaskStage,
    openFeedbackDialog,
    isAgentRunning,
    engineState,
    handleUpdateStage,
    hasPendingTaskSaveFlush,
    flushPendingTaskSave,
    handleAddStage,
    handleRemoveStage,
    handleReorderStages,
    saveStages,
    // stage skills library (lazy; see useSkills)
    skills = [],
    skillsLoading,
    skillsError,
    fetchSkills,
    getSkillByName,
    uiPreferences,
    updateUiPreference,
    setView,
    isHarnessDisabled,
  } = useKainBain();

  const activeWorkflow =
    projectWorkflows.find((w) => w.id === activeWorkflowId) || projectWorkflows[0];

  const activeWfId = activeWorkflowId || activeWorkflow?.id || 'wf-default';

  const [expandedSettingsStageId, setExpandedSettingsStageId] = useState(null);
  // Shared model catalogue (flat models + per-harness view) for the in-column
  // stage settings; falls back to the curated list when the API is unavailable.
  const {
    models: availableModels,
    harnesses: availableHarnesses,
    refreshing: modelsRefreshing,
    refresh: refreshModels,
  } = useModelCatalog(FALLBACK_MODELS, { aliases: activeProject?.modelAliases });
  // Stages inherit the project's harness unless overridden: the per-stage
  // picker offers an explicit inherit choice naming the project harness, and
  // the model control stays scoped to the effective (stage or inherited)
  // harness either way.
  const projectHarnessId =
    activeProject?.harness || availableHarnesses.find((h) => h.isDefault)?.id || 'pi';
  const projectHarnessLabel =
    availableHarnesses.find((h) => h.id === projectHarnessId)?.label || projectHarnessId;

  // Phone-only toolbar auto-collapse (task 34793321, survey Q4/Q5): the page
  // shell never scrolls, so the active mobile `StageColumn` card list feeds
  // its `onScroll` into `handleToolbarScroll`. The collapsed state folds the
  // secondary toolbar row (pipeline selector, card order) while search input
  // + stage tabs stay pinned, and is broadcast so the sibling `Header` can
  // fold its tab row in sync without prop drilling through `App.jsx`.
  const {
    isCollapsed: isToolbarCollapsed,
    handleScroll: handleToolbarScroll,
    expand: expandToolbar,
  } = useMobileToolbarCollapse();
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
      return;
    }
    window.dispatchEvent(
      new window.CustomEvent(MOBILE_TOOLBAR_COLLAPSE_EVENT, {
        detail: { collapsed: isToolbarCollapsed },
      }),
    );
  }, [isToolbarCollapsed]);

  // When leaving the canvas (view change, unmount), ensure sibling Header
  // is restored so navigation is never trapped in collapsed state.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        window.dispatchEvent(
          new window.CustomEvent(MOBILE_TOOLBAR_COLLAPSE_EVENT, {
            detail: { collapsed: false },
          }),
        );
      }
    };
  }, []);

  // Dismiss in-column stage settings drawer on Escape key
  useEffect(() => {
    if (!expandedSettingsStageId) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setExpandedSettingsStageId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedSettingsStageId]);

  // Search/filter seam (extracted). See useCanvasSearchFilter.
  const {
    searchQuery,
    setSearchQuery,
    showCompleted,
    setShowCompleted,
    addingTaskStageId,
    setAddingTaskStageId,
    newTaskTitle,
    setNewTaskTitle,
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
  } = useCanvasSearchFilter({
    uiPreferences,
    stages,
    tasks,
    activeWorkflow,
    activeWfId,
    currentStageId,
    setExpandedSettingsStageId,
  });

  // Show-completed scope: the fetch layer defaults lean, so flipping the
  // toggle re-pulls with the matching scope. Skipped on mount when the boot
  // fetch already used this scope (persisted toggle, or the lean default) —
  // otherwise a preference-defaulted ON toggle pulls the full history in.
  const showCompletedMountRef = useRef(false);
  useEffect(() => {
    if (!activeProjectId) return;
    if (!showCompletedMountRef.current) {
      showCompletedMountRef.current = true;
      if (showCompleted === readStoredShowCompleted()) return;
    }
    retryTasks(activeProjectId, { includeCompleted: showCompleted });
  }, [showCompleted, activeProjectId, retryTasks]);

  // Task + stage mutation actions (approve/reject/execute, reorder/add/remove,
  // inline creation). Defined before useStageDnD so drops can reorder columns.
  const {
    handleApprove,
    handleReject,
    handleExecute,
    reorderAndSave,
    addStageAndSave,
    removeStageAndSave,
    handleCreateTaskInline,
    isSubmittingTask,
    pendingStageAction,
  } = useTaskActions({
    activeProjectId,
    stages,
    activeWfId,
    advanceTask,
    openFeedbackDialog,
    executeTaskStage,
    createTask,
    switchWorkflow,
    setSelectedTask,
    handleAddStage,
    handleRemoveStage,
    handleReorderStages,
    saveStages,
    hasPendingTaskSaveFlush,
    flushPendingTaskSave,
    uiPreferences,
    newTaskTitle,
    setNewTaskTitle,
    setAddingTaskStageId,
    setSelectedMobileStageId,
    setExpandedSettingsStageId,
  });

  // Stage-column + task-card drag-and-drop.
  const {
    draggingStageId,
    dragOverStageId,
    handleStageDragStart,
    handleStageDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useStageDnD({ stages, moveTask, activeProjectId, uiPreferences, reorderAndSave });

  // Live Agent Activity Console state + resize/copy handlers.
  const {
    showActivityDrawer,
    autoScroll,
    setAutoScroll,
    viewer: activityViewer,
    logRecords: activityLogRecords,
    consoleHeight,
    isDraggingConsole,
    copiedLogs,
    toggleActivityDrawer,
    handleResizeMouseDown,
    handleResizeTouchStart,
    handleResizeKeyDown,
    handleCopyLogs,
  } = useActivityConsole({ uiPreferences, updateUiPreference, processLogs, messages, toolCalls });

  // Analytics seam (extracted). See useCanvasAnalytics.
  const { stageAnalytics, completedCount, hasActivity } = useCanvasAnalytics({
    tasks,
    stages,
    activeWfId,
    activeWorkflow,
    messages,
    toolCalls,
    processLogs,
    isAgentRunning,
  });

  // Board-level subscription to the shared tick (see useNow): every card
  // age re-renders from one 60s interval, passed down so columns and cards
  // stay in sync.
  const nowMs = useNow();

  // Collapsed-group seam (extracted). See useCollapsedGroups.
  const { expandedCollapsedGroups, toggleCollapsedGroup } = useCollapsedGroups();

  // Switching mobile stage tab expands the toolbar so the user has full
  // context on the newly selected column and avoids being stranded if the
  // column has few or no tasks to scroll up.
  useEffect(() => {
    expandToolbar();
  }, [effectiveMobileStageId, expandToolbar]);

  // Log filtering and copy formatting live in `nodeModel.js`
  // (`filterProcessLogs` / `formatLogsForCopy`); the unified viewer state and
  // records come from useActivityConsole above.

  // Dynamic column width styling with fixed stable min/max constraints to prevent jitter (#9)
  const colWidth = uiPreferences?.columnWidth || '280px';
  const isFill = colWidth === 'fill';
  const colStyle = isFill
    ? { minWidth: '260px', maxWidth: '100%', flex: '1 1 0px' }
    : { width: colWidth, minWidth: colWidth, maxWidth: colWidth, flexShrink: 0 };

  const COLLAPSED_COL_STYLE = {
    width: '48px',
    minWidth: '48px',
    maxWidth: '48px',
    flexShrink: 0,
  };

  // One StageColumn per stage, keyed and indexed against the FULL stage list
  // so drag/keyboard reorder keeps operating on true pipeline positions even
  // while the tag filter hides some columns behind collapsed bars.
  const renderStageColumn = (stage) => {
    const stageIndex = stages.findIndex((s) => s.id === stage.id);
    return (
      <StageColumn
        // Pipeline-scoped key (task 8a056fc4): switching pipelines
        // remounts columns and cards, dropping per-card state
        // (pending Approve/Reject, Copied ✓, dragging) that would
        // otherwise survive onto the new pipeline's stages.
        key={`${activeWfId}:${stage.id}`}
        workflowKey={activeWfId}
        stage={stage}
        stageIndex={stageIndex}
        stages={stages}
        currentStageId={currentStageId}
        effectiveMobileStageId={effectiveMobileStageId}
        filteredTasks={filteredTasks}
        searchQuery={searchQuery}
        addingTaskStageId={addingTaskStageId}
        expandedSettingsStageId={expandedSettingsStageId}
        draggingStageId={draggingStageId}
        dragOverStageId={dragOverStageId}
        stageAnalytics={stageAnalytics}
        colStyle={colStyle}
        collapsedStyle={COLLAPSED_COL_STYLE}
        engineState={engineState}
        isAgentRunning={isAgentRunning}
        uiPreferences={uiPreferences}
        newTaskTitle={newTaskTitle}
        isSubmittingTask={isSubmittingTask}
        pendingStageAction={pendingStageAction}
        activeProjectId={activeProjectId}
        setAddingTaskStageId={setAddingTaskStageId}
        setNewTaskTitle={setNewTaskTitle}
        setExpandedSettingsStageId={setExpandedSettingsStageId}
        setSelectedTask={setSelectedTask}
        handleApprove={handleApprove}
        handleReject={handleReject}
        handleExecute={handleExecute}
        handleCreateTaskInline={handleCreateTaskInline}
        handleUpdateStage={handleUpdateStage}
        saveStages={saveStages}
        removeStageAndSave={removeStageAndSave}
        reorderAndSave={reorderAndSave}
        handleStageDragStart={handleStageDragStart}
        handleStageDragEnd={handleStageDragEnd}
        handleDragEnter={handleDragEnter}
        handleDragLeave={handleDragLeave}
        handleDragOver={handleDragOver}
        handleDrop={handleDrop}
        availableModels={availableModels}
        availableHarnesses={availableHarnesses}
        modelsRefreshing={modelsRefreshing}
        refreshModels={refreshModels}
        projectHarnessId={projectHarnessId}
        projectHarnessLabel={projectHarnessLabel}
        isHarnessDisabled={isHarnessDisabled}
        skills={skills}
        skillsLoading={skillsLoading}
        skillsError={skillsError}
        fetchSkills={fetchSkills}
        getSkillByName={getSkillByName}
        nowMs={nowMs}
        onCardListScroll={handleToolbarScroll}
      />
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-deep relative">
      <CanvasToolbar
        projectWorkflows={projectWorkflows}
        activeWorkflow={activeWorkflow}
        activeWorkflowId={activeWorkflowId}
        workflowSwitching={workflowSwitching}
        activeProjectId={activeProjectId}
        switchWorkflow={switchWorkflow}
        setView={setView}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        showCompleted={showCompleted}
        setShowCompleted={setShowCompleted}
        completedCount={completedCount}
        stages={stages}
        filteredTasks={filteredTasks}
        tasks={tasks}
        tasksLoading={tasksLoading}
        tasksError={tasksError}
        retryTasks={retryTasks}
        effectiveMobileStageId={effectiveMobileStageId}
        setSelectedMobileStageId={setSelectedMobileStageId}
        addStageAndSave={addStageAndSave}
        onImportWorkflow={(payload) => createWorkflow?.(activeProjectId, payload)}
        notifySuccess={notifySuccess}
        notifyError={notifyError}
        taskSort={uiPreferences?.taskSort === 'oldest' ? 'oldest' : 'manual'}
        onTaskSortChange={(next) => updateUiPreference?.('taskSort', next)}
        stageTagOptions={stageTagOptions}
        stageTagFilterMode={stageTagFilterMode}
        setStageTagFilterMode={setStageTagFilterMode}
        visibleStages={visibleStages}
        hiddenStageCount={hiddenStageCount}
        onClearStageTagFilter={clearTagFilter}
        isToolbarCollapsed={isToolbarCollapsed}
        onExpandToolbar={expandToolbar}
      />

      {/* Horizontal Pipeline Board: scrollable region is keyboard-focusable so
          keyboard users can scroll it with arrows (WCAG 2.1.1). On mobile
          (< 768px) horizontal panning is locked (`overflow-x-hidden`): the
          board shows a single full-width stage column, so there is nothing
          to slide to and touch swipes must never shift the stage sideways.
          Desktop keeps `md:overflow-x-auto` for the multi-column strip. */}
      <div
        className="flex-1 overflow-x-hidden md:overflow-x-auto overflow-y-hidden flex gap-3 p-3 md:p-6 scroll-smooth custom-scrollbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard-scrollable region
        tabIndex={0}
        aria-label="Workflow pipeline canvas"
      >
        {stages.length === 0 && !hasActivity && workflowLoading && (
          <div
            className="flex-1 h-full flex flex-col items-center justify-center text-text-muted space-y-4"
            role="status"
            aria-label="Loading pipeline"
          >
            <div className="text-5xl grayscale">⏳</div>
            <p className="text-sm font-mono uppercase tracking-widest">Loading pipeline…</p>
          </div>
        )}
        {stages.length === 0 && !hasActivity && !workflowLoading && (
          <div className="flex-1 h-full flex flex-col items-center justify-center text-text-muted space-y-4">
            <div className="text-5xl grayscale">📋</div>
            <p className="text-sm font-mono uppercase tracking-widest">
              No stages configured. Click "+ Add Stage" to create pipeline stages.
            </p>
            <button
              type="button"
              onClick={() => {
                addStageAndSave();
              }}
              className="px-4 py-2 bg-primary text-on-primary rounded text-xs font-bold uppercase tracking-wider cursor-pointer hover:brightness-110"
            >
              + Add First Stage
            </button>
          </div>
        )}

        {/* Pipeline-switch gate (task 8a056fc4): while the switch is in
            flight the board may hold new stages with old tasks (or vice
            versa) — render a skeleton instead of that mixed frame. */}
        {workflowSwitching ? (
          <div
            className="flex-1 h-full flex flex-col items-center justify-center text-text-muted space-y-4"
            role="status"
            aria-label="Switching pipeline"
          >
            <div className="text-5xl grayscale">⏳</div>
            <p className="text-sm font-mono uppercase tracking-widest">Switching pipeline…</p>
          </div>
        ) : allStagesHiddenByTags ? (
          <div
            className="flex-1 h-full flex flex-col items-center justify-center text-text-muted space-y-4"
            role="status"
            aria-label="No stages match the selected tags"
          >
            <div className="text-5xl grayscale">🏷️</div>
            <p className="text-sm font-mono uppercase tracking-widest">
              No stages match the selected tags
            </p>
            <button
              type="button"
              onClick={clearTagFilter}
              className="px-4 py-2 bg-primary text-on-primary rounded text-xs font-bold uppercase tracking-wider cursor-pointer hover:brightness-110"
            >
              Clear tag filter
            </button>
          </div>
        ) : (
          tagRenderEntries.map((entry) => {
            if (entry.kind === 'collapsed') {
              const isExpanded = expandedCollapsedGroups.has(entry.id);
              return (
                <React.Fragment key={entry.id}>
                  <CollapsedStageRunBar
                    entry={entry}
                    isExpanded={isExpanded}
                    onToggle={() => toggleCollapsedGroup(entry.id)}
                    colStyle={COLLAPSED_COL_STYLE}
                    stageAnalytics={stageAnalytics}
                  />
                  {isExpanded && entry.stages.map((stage) => renderStageColumn(stage))}
                </React.Fragment>
              );
            }
            return renderStageColumn(entry.stage);
          })
        )}
        {/* Per-stage column owns its <section> (see StageColumn.jsx) */}

        {/* "+ Add Stage" Column at End of Pipeline (#12, #24). Desktop only
            (`hidden md:flex` inside): on mobile the board shows a single
            stage column and creation lives in the trailing strip button. */}
        {stages.length > 0 && (
          <AddStageMenu
            variant="column"
            onAdd={addStageAndSave}
            projectId={activeProjectId}
            workflowName={activeWorkflow?.name}
            stages={stages}
            onImportWorkflow={(payload) => createWorkflow?.(activeProjectId, payload)}
            notifySuccess={notifySuccess}
            notifyError={notifyError}
          />
        )}
      </div>

      <ActivityConsole
        hasActivity={hasActivity}
        showActivityDrawer={showActivityDrawer}
        consoleHeight={consoleHeight}
        isDraggingConsole={isDraggingConsole}
        isAgentRunning={isAgentRunning}
        processLogs={processLogs}
        messages={messages}
        toolCalls={toolCalls}
        viewer={activityViewer}
        logRecords={activityLogRecords}
        autoScroll={autoScroll}
        setAutoScroll={setAutoScroll}
        copiedLogs={copiedLogs}
        clearLogs={clearLogs}
        toggleActivityDrawer={toggleActivityDrawer}
        handleResizeMouseDown={handleResizeMouseDown}
        handleResizeTouchStart={handleResizeTouchStart}
        handleResizeKeyDown={handleResizeKeyDown}
        handleCopyLogs={handleCopyLogs}
      />
      {/* Live Agent Activity Console (see ActivityConsole.jsx) renders above */}
    </div>
  );
}
