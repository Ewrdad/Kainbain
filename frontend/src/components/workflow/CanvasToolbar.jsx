import { useEffect, useRef, useState } from 'react';
import { InfoTooltip } from '../common/InfoTooltip';
import { STAGE_TAB_PILL_CLASS } from './stageTokens';
import { AddStageMenu } from './AddStageMenu';
import { UnifiedSearchBar } from './UnifiedSearchBar';

/***
 * MARK: CanvasToolbar
 * @description Pipeline-board chrome extracted from WorkflowCanvas: top
 *   search/filter bar (workflow switcher, search, status pills, completed
 *   toggle), mobile stage-selector tab strip and task-list loading/error
 *   banners. Pure presentational — all state arrives via props; the workflow
 *   dropdown open state is the only local state. `isToolbarCollapsed` (with
 *   `onExpandToolbar`) drives the phone-only auto-collapse of the secondary
 *   row (task 34793321): search + stage tabs stay pinned while pipeline and
 *   order controls fold away, re-expanding on scroll-up, tap, or focus.
 * @example <CanvasToolbar searchQuery={q} setSearchQuery={set} ... />
 ***/
export function CanvasToolbar({
  projectWorkflows,
  activeWorkflow,
  activeWorkflowId,
  workflowSwitching,
  activeProjectId,
  switchWorkflow,
  setView,
  searchQuery,
  setSearchQuery,
  showCompleted,
  setShowCompleted,
  completedCount,
  stages,
  filteredTasks,
  tasks,
  tasksLoading,
  tasksError,
  retryTasks,
  effectiveMobileStageId,
  setSelectedMobileStageId,
  addStageAndSave,
  onImportWorkflow,
  notifySuccess,
  notifyError,
  taskSort = 'manual',
  onTaskSortChange,
  stageTagOptions = [],
  stageTagFilterMode = 'any',
  setStageTagFilterMode,
  visibleStages = stages,
  hiddenStageCount = 0,
  onClearStageTagFilter,
  isToolbarCollapsed = false,
  onExpandToolbar,
}) {
  const [isWorkflowDropdownOpen, setIsWorkflowDropdownOpen] = useState(false);
  const workflowMenuRef = useRef(null);

  // MARK: collapsed-row focus + tap expand (task 34793321)
  // Keyboard parity (WCAG 2.1.1): tabbing into the collapsed secondary row
  // re-expands it before focus lands, so controls are never stranded behind
  // `aria-hidden`. Pointer users get the same via the expand affordance and
  // scroll-up; both funnel through the canvas-owned `onExpandToolbar`.
  const handleToolbarFocusExpand = () => {
    if (typeof onExpandToolbar === 'function') onExpandToolbar();
  };

  // Close workflow dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (workflowMenuRef.current && !workflowMenuRef.current.contains(event.target)) {
        setIsWorkflowDropdownOpen(false);
      }
    }
    if (isWorkflowDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isWorkflowDropdownOpen]);

  return (
    <>
      {/* Top Action & Search Bar */}
      {/* z-20: must stack ABOVE the mobile stage-tab strip (z-10, later in DOM)
          so this bar's absolute dropdown menus (z-50 children) are never
          covered by the tab strip on phones (task e2cf55ac). */}
      <div className="px-2 sm:px-6 py-1.5 sm:py-3 border-b border-border-standard bg-surface flex flex-wrap items-center justify-between gap-1.5 sm:gap-4 z-20 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 min-w-0 w-full sm:w-auto">
          {/* Secondary controls row (task 34793321): pipeline selector +
              card order toggle. On phones this row auto-collapses on
              scroll-down (search input + stage tabs stay pinned) and
              re-expands on scroll-up, tap, or keyboard focus. `sm:contents`
              rejoins the children with the desktop single row in
              `sm:order-*` sequence, so desktop layout is pixel-identical;
              every collapse visual is `max-md:` scoped so desktop can never
              hide these controls. */}
          <div
            data-testid="toolbar-secondary-row"
            aria-hidden={isToolbarCollapsed}
            onFocusCapture={isToolbarCollapsed ? handleToolbarFocusExpand : undefined}
            className={`flex flex-wrap items-center gap-1.5 min-w-0 sm:contents transition-all duration-200 motion-reduce:transition-none ${
              isToolbarCollapsed
                ? 'max-md:max-h-0 max-md:opacity-0 max-md:overflow-hidden max-md:py-0 max-md:pointer-events-none'
                : 'max-md:max-h-32 max-md:opacity-100'
            }`}
          >
            {/* Workflow Selector Dropdown */}
            {projectWorkflows && projectWorkflows.length > 0 && (
              <div className="relative sm:order-1" ref={workflowMenuRef}>
                <InfoTooltip
                  title="Workflow Pipeline Switcher"
                  description="Select which named multi-stage workflow pipeline to view and execute."
                  position="bottom"
                >
                  <button
                    type="button"
                    onClick={() => setIsWorkflowDropdownOpen((v) => !v)}
                    aria-haspopup="menu"
                    aria-expanded={isWorkflowDropdownOpen}
                    aria-label="Select pipeline workflow"
                    className="flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 min-h-[44px] bg-surface-container hover:bg-surface-container-high border border-border-standard rounded-sm text-xs font-medium text-on-surface transition-colors cursor-pointer"
                  >
                    <span className="text-primary text-[10px]">🔀</span>
                    <span className="font-mono text-xs truncate max-w-[80px] sm:max-w-[140px]">
                      {activeWorkflow?.name || 'Default Pipeline'}
                    </span>
                    <span className="text-[10px] text-text-muted">▼</span>
                  </button>
                </InfoTooltip>

                {isWorkflowDropdownOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1 w-64 bg-surface-container border border-border-standard shadow-2xl z-50 rounded-sm overflow-hidden"
                  >
                    <div className="p-1 space-y-0.5">
                      <div className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-text-muted flex justify-between items-center">
                        <span>Workflows</span>
                        <span>{projectWorkflows.length}</span>
                      </div>
                      {workflowSwitching && (
                        <div
                          role="status"
                          aria-label="Switching workflow"
                          className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-text-muted flex items-center gap-2"
                        >
                          <span
                            aria-hidden="true"
                            className="w-3 h-3 rounded-full border-2 border-text-muted border-t-transparent animate-spin"
                          />
                          Switching…
                        </div>
                      )}
                      {projectWorkflows.map((wf) => (
                        <button
                          key={wf.id}
                          role="menuitem"
                          disabled={workflowSwitching}
                          onClick={async () => {
                            setIsWorkflowDropdownOpen(false);
                            if (activeProjectId) {
                              await switchWorkflow(activeProjectId, wf.id);
                            }
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs rounded-sm transition-colors flex items-center justify-between cursor-pointer ${
                            activeWorkflowId === wf.id
                              ? 'bg-primary text-on-primary font-bold'
                              : 'text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{wf.name}</span>
                            {wf.isDefault && (
                              <span
                                className={`text-[8px] px-1 rounded uppercase font-mono ${
                                  activeWorkflowId === wf.id
                                    ? 'bg-black/20 text-on-primary'
                                    : 'bg-surface-deep text-text-muted'
                                }`}
                              >
                                default
                              </span>
                            )}
                          </div>
                          {activeWorkflowId === wf.id && <span className="font-bold">✓</span>}
                        </button>
                      ))}
                      <div className="h-px bg-border-standard my-1" role="separator" />
                      <button
                        role="menuitem"
                        onClick={() => {
                          setIsWorkflowDropdownOpen(false);
                          setView?.('settings');
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-on-primary rounded-sm transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>⚙️ Manage Workflows</span>
                      </button>
                      <p className="px-3 py-1.5 text-[10px] font-mono text-text-muted">
                        Tip: export or import a pipeline from the ▾ menu next to “Add stage”.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Card order toggle (manual drag order vs oldest-in-stage first).
              Lives in the collapsible secondary row with the pipeline
              selector — not the desktop-only pill row — so phones get it too
              when expanded. `sm:order-3` restores the exact desktop sequence
              (pipeline, search, order) through the `sm:contents` row. */}
            <InfoTooltip
              title="Card Order"
              description="Manual keeps your drag-and-drop order. Oldest first surfaces the longest-waiting task at the top of each stage without changing the stored order."
              position="bottom"
              className="sm:order-3"
            >
              <button
                type="button"
                onClick={() => onTaskSortChange?.(taskSort === 'oldest' ? 'manual' : 'oldest')}
                aria-label={`Card order: ${taskSort === 'oldest' ? 'oldest first' : 'manual'}. Activate to switch.`}
                aria-pressed={taskSort === 'oldest'}
                className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 min-h-[44px] border rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                  taskSort === 'oldest'
                    ? 'bg-primary text-on-primary border-primary font-bold'
                    : 'bg-surface-container hover:bg-surface-container-high border-border-standard text-on-surface'
                }`}
              >
                <span aria-hidden="true">{taskSort === 'oldest' ? '⏳' : '⇅'}</span>
                <span className="font-mono text-xs max-w-[90px] sm:max-w-none truncate">
                  {taskSort === 'oldest' ? 'Oldest first' : 'Manual order'}
                </span>
              </button>
            </InfoTooltip>
          </div>

          {/* One-tap expand affordance (task 34793321): only in the collapsed
              phone state. Full 44px tap target with slim ~20px visuals via
              negative margins, so it costs almost no vertical space. Hidden
              on desktop (`md:hidden`), where the row can never collapse. */}
          {isToolbarCollapsed && (
            <button
              type="button"
              data-testid="toolbar-expand"
              onClick={handleToolbarFocusExpand}
              aria-expanded={false}
              aria-label="Expand toolbar controls"
              className="md:hidden flex items-center justify-center w-full min-h-[44px] -my-3 py-0 text-[10px] font-mono uppercase tracking-wider text-text-muted hover:text-on-surface cursor-pointer"
            >
              <span aria-hidden="true">▾ show pipeline &amp; order ▾</span>
            </button>
          )}

          {/* Unified search: free-text task search plus `#tag` stage filtering
              in one bar. `#` tokens collapse runs of stages that do not match;
              the tag selection lives in the URL (`?tags=…`) so any filtered
              view can be shared by copying the address. The wrapper is
              full-width on phones (its own row via basis-full/order-last on
              the tooltip trigger) and fluid from sm up; the Any/All toggle is
              hidden on phones inside UnifiedSearchBar. Pinned when the
              secondary row collapses (survey Q5). */}
          <InfoTooltip
            title="Search & Filter"
            description="Search tasks by ID, goal title, or keywords. Type # to filter stages by tag (e.g. 'auth #Dev') or ! to filter by status (e.g. 'auth !failed', '!human')."
            shortcut="N"
            position="bottom"
            className="w-full sm:w-auto min-w-0 basis-full sm:basis-auto order-last sm:order-2"
          >
            <div className="w-full sm:w-64 lg:w-96 min-w-0">
              <UnifiedSearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                tagOptions={stageTagOptions}
                tagFilterMode={stageTagFilterMode}
                onTagFilterModeChange={setStageTagFilterMode}
              />
            </div>
          </InfoTooltip>
        </div>

        {/* Completed Toggle (status filtering moved into the search bar via ! filters) */}
        <div className="hidden md:flex items-center gap-3">
          {/* Show Completed Toggle */}
          <InfoTooltip
            title="Completed Tasks Archival"
            description="Toggle visibility of finished tasks. Completed tasks retain their markdown reports under docs/tasks/. Your Show Completed choice is remembered across sessions in this browser."
            position="bottom"
          >
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase text-text-muted cursor-pointer select-none bg-surface-container px-2.5 py-1.5 min-h-[44px] rounded-sm border border-border-standard hover:border-outline-variant">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="rounded-sm bg-surface-deep border-border-standard text-primary focus:ring-0"
              />
              <span>Show Completed ({completedCount})</span>
            </label>
          </InfoTooltip>
        </div>
      </div>

      {/* Mobile Stage Selector Tab Strip (< 768px): one tab per stage plus a
          trailing "Add stage" pill in normal flow at the end of the
          scrollable row (it scrolls with the strip, never overlaying tabs).
          Mobile board shows a single full-width stage column only; stage
          creation lives here, not in the board. */}
      {stages.length > 0 && (
        <div
          className="flex md:hidden items-center gap-2 px-2 py-1.5 bg-surface-container border-b border-border-standard overflow-x-auto custom-scrollbar shrink-0 select-none z-10"
          role="tablist"
          aria-label="Mobile stage column selector"
        >
          {visibleStages.map((stage) => {
            const isSelected = effectiveMobileStageId === stage.id;
            const stageTasks = filteredTasks.filter((t) => t.currentStageId === stage.id);
            // Number tabs by true pipeline position, not visible position, so
            // a filtered view still reads as a subset of the same pipeline.
            const pipelineIndex = stages.findIndex((s) => s.id === stage.id);

            return (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-controls={`stage-col-${stage.id}`}
                onClick={() => {
                  setSelectedMobileStageId(stage.id);
                  if (isSelected && isToolbarCollapsed && typeof onExpandToolbar === 'function') {
                    onExpandToolbar();
                  }
                }}
                className={`${STAGE_TAB_PILL_CLASS} ${
                  isSelected
                    ? 'bg-ochre text-surface-deep font-bold shadow-md ring-1 ring-ochre'
                    : 'bg-surface-deep text-text-muted hover:text-on-surface hover:bg-surface-container-high border border-border-standard'
                }`}
              >
                <span>{`${pipelineIndex + 1}. ${stage.name}`}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                    isSelected
                      ? 'bg-surface-deep/30 text-surface-deep'
                      : 'bg-surface-container text-text-muted'
                  }`}
                >
                  {stageTasks.length}
                </span>
              </button>
            );
          })}
          {hiddenStageCount > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={false}
              aria-label={`Show ${hiddenStageCount} hidden stages (clears the tag filter)`}
              title="Clear the tag filter to show hidden stages"
              onClick={() => onClearStageTagFilter?.()}
              className={`${STAGE_TAB_PILL_CLASS} border-dashed border-border-standard text-text-muted hover:text-on-surface hover:bg-surface-container-high`}
            >
              <span>{`Hidden (${hiddenStageCount})`}</span>
            </button>
          )}
          <AddStageMenu
            variant="tab"
            onAdd={addStageAndSave}
            projectId={activeProjectId}
            workflowName={activeWorkflow?.name}
            stages={stages}
            onImportWorkflow={onImportWorkflow}
            notifySuccess={notifySuccess}
            notifyError={notifyError}
          />
        </div>
      )}

      {/* Task-list status: skeleton while the first load is in flight and an
          explicit error with retry when it fails, so slow-link waiting is
          visible instead of a silent empty board. Hidden once tasks arrive
          (background polls must never flash it). */}
      {stages.length > 0 && filteredTasks.length === 0 && tasks.length === 0 && tasksLoading && (
        <div
          role="status"
          aria-label="Loading tasks"
          className="mx-3 md:mx-6 mt-3 px-3 py-2 rounded-sm bg-surface-container-high border border-border-standard flex items-center gap-3"
        >
          <span
            aria-hidden="true"
            className="w-4 h-4 rounded-full border-2 border-text-muted border-t-transparent animate-spin"
          />
          <p className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
            Loading tasks…
          </p>
        </div>
      )}
      {stages.length > 0 &&
        filteredTasks.length === 0 &&
        tasks.length === 0 &&
        !tasksLoading &&
        tasksError && (
          <div
            role="alert"
            aria-label="Tasks failed to load"
            className="mx-3 md:mx-6 mt-3 px-3 py-2 rounded-sm bg-surface-container-high border border-border-standard flex items-center gap-3 flex-wrap"
          >
            <p className="text-[11px] font-mono uppercase tracking-wider text-text-muted">
              Couldn&apos;t load tasks. Check your connection and retry.
            </p>
            <button
              type="button"
              onClick={() => retryTasks?.(activeProjectId)}
              className="px-3 py-2 min-h-[44px] text-[10px] font-bold uppercase tracking-wider bg-ochre text-surface-deep rounded-sm hover:brightness-110 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}
    </>
  );
}
