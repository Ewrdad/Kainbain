import { TaskCard } from '../tasks/TaskCard';
import { compareStageAge } from '../tasks/stagePace';
import { useNow } from '../../hooks/useNow';
import { getStageType, isCheckpoint } from '../stageTypes';
import { isTaskRunning } from '../tasks/runningTask';
import { soundEffects } from '../../services/soundEffects';
import { InfoTooltip } from '../common/InfoTooltip';
import { StageSettingsDrawer } from './StageSettingsDrawer';
import { STAGE_HEADER_TAG_CHIP_CLASS } from './stageTokens';
import { parseSearchQuery } from './searchQueryParser';

/***
 * MARK: StageColumn
 * @description One desktop pipeline stage column extracted from
 *   WorkflowCanvas: draggable ochre header (full + Human-filter collapsed
 *   variants), paused banner, task list with inline add-task form, analytics
 *   strip and the settings drawer trigger. Per-column values are derived
 *   from raw board props so the canvas map stays a thin prop pass-through.
 *   `workflowKey` (the active pipeline id) scopes card remounts so a
 *   pipeline switch fully rewrites board state (task 8a056fc4).
 * @example <StageColumn stage={stage} stageIndex={0} stages={stages} ... />
 ***/
export function StageColumn({
  workflowKey,
  stage,
  stageIndex,
  stages,
  currentStageId,
  effectiveMobileStageId,
  filteredTasks,
  searchQuery,
  addingTaskStageId,
  expandedSettingsStageId,
  draggingStageId,
  dragOverStageId,
  stageAnalytics,
  colStyle,
  collapsedStyle,
  engineState,
  isAgentRunning,
  uiPreferences,
  newTaskTitle,
  isSubmittingTask,
  pendingStageAction,
  activeProjectId,
  setAddingTaskStageId,
  setNewTaskTitle,
  setExpandedSettingsStageId,
  setSelectedTask,
  handleApprove,
  handleReject,
  handleExecute,
  handleCreateTaskInline,
  handleUpdateStage,
  saveStages,
  removeStageAndSave,
  reorderAndSave,
  handleStageDragStart,
  handleStageDragEnd,
  handleDragEnter,
  handleDragLeave,
  handleDragOver,
  handleDrop,
  availableModels,
  availableHarnesses,
  modelsRefreshing,
  refreshModels,
  projectHarnessId,
  projectHarnessLabel,
  isHarnessDisabled,
  skills,
  skillsLoading,
  skillsError,
  fetchSkills,
  getSkillByName,
  nowMs,
  onCardListScroll,
}) {
  const isCurrent = stage.id === currentStageId;
  const isMobileActive = effectiveMobileStageId === stage.id;
  const isPaused = stage.paused === true;
  const typeConfig = getStageType(stage.type);
  // Display tags: valid strings only; the backend normalises on save, this is
  // the fail-visible render filter for hand-edited or corrupt data.
  const stageTags = Array.isArray(stage.tags)
    ? stage.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
    : [];
  const stageTasks = filteredTasks.filter((t) => String(t.currentStageId) === String(stage.id));
  // Card order: manual (insertion/drag order) by default so drag-and-drop
  // keeps working; the opt-in oldest-first sort surfaces the longest-waiting
  // task per column without ever rewriting the stored order. The tick is the
  // shared board subscription (one interval for the whole board); an explicit
  // nowMs prop wins so tests can freeze the clock.
  const sharedNowMs = useNow();
  const effectiveNowMs = nowMs ?? sharedNowMs;
  const visibleStageTasks =
    uiPreferences?.taskSort === 'oldest'
      ? [...stageTasks].sort((a, b) => compareStageAge(a, b, effectiveNowMs))
      : stageTasks;
  const isAddingTask = addingTaskStageId === stage.id;
  const isSettingsExpanded = expandedSettingsStageId === stage.id;
  const isDraggingThisStage = draggingStageId === stage.id;
  const stageStat = stageAnalytics?.byStage?.[stage.id] || {
    throughput: 0,
    avgDuration: '--',
    passRate: 100,
    passedCount: 0,
    failedCount: 0,
    activeTasksCount: 0,
  };

  const parsedSearch = parseSearchQuery(searchQuery);
  const isHumanFilterActive = Array.isArray(parsedSearch.systemFilters)
    ? parsedSearch.systemFilters.includes('human')
    : false;
  const shouldCollapse =
    isHumanFilterActive && !isCheckpoint(stage.type) && stageTasks.length === 0;

  const startAddTask = () => {
    setAddingTaskStageId(stage.id);
    setNewTaskTitle('');
  };
  const cancelAddTask = () => {
    setAddingTaskStageId(null);
    setNewTaskTitle('');
  };
  const toggleSettings = () => setExpandedSettingsStageId(isSettingsExpanded ? null : stage.id);
  const closeSettings = () => setExpandedSettingsStageId(null);
  const saveAndCloseSettings = () => {
    if (activeProjectId && saveStages) {
      saveStages(activeProjectId, stages);
    }
    setExpandedSettingsStageId(null);
  };
  const persistTypeChange = (stageId, val) => {
    if (activeProjectId && saveStages) {
      const next = stages.map((s) => (s.id === stageId ? { ...s, type: val } : s));
      saveStages(activeProjectId, next);
    }
  };

  // MARK: positioned column container
  // The <section> below is the containing block for the Configure
  // drawer's `absolute inset-0` overlay. It MUST stay `relative`:
  // without it the drawer resolved against the canvas root and
  // extended underneath the Live Agent Activity Console and the Now
  // Playing footer, hiding the drawer's Delete/Done buttons.
  // Scoped to the column, the drawer always ends above both bars.
  return (
    <section
      id={`stage-col-${stage.id}`}
      data-stage-id={stage.id}
      style={shouldCollapse ? collapsedStyle : colStyle}
      onDragOver={handleDragOver}
      onDragEnter={(e) => handleDragEnter(e, stage.id)}
      onDragLeave={(e) => handleDragLeave(e, stage.id)}
      onDrop={(e) => handleDrop(e, stage.id)}
      data-collapsed={shouldCollapse ? 'true' : 'false'}
      aria-label={`${stage.name} ${shouldCollapse ? '(collapsed)' : ''}`}
      className={`relative h-full flex-col bg-surface-container-low border rounded-sm overflow-hidden transition-all shrink-0 ${
        isMobileActive ? 'flex w-full md:w-auto' : 'hidden md:flex'
      } ${isDraggingThisStage ? 'opacity-40 scale-[0.98]' : 'opacity-100'} ${
        isPaused
          ? 'opacity-90 bg-surface-container-lowest/80 border-ochre/40'
          : dragOverStageId === stage.id
            ? 'ring-2 ring-primary border-primary bg-surface-container/50'
            : isCurrent
              ? 'border-primary/60 shadow-[0_0_10px_rgba(123,219,133,0.1)]'
              : 'border-border-standard'
      }`}
    >
      {/* Draggable Stage Header (Ochre Palette per DESIGN_SPEC.md 3.2).
          Keyboard path: Alt+Left/Right reorders (see expanded header
          below); the header stays focusable for drag/keyboard parity
          (WCAG 2.1.1, 2.5.7). */}
      {shouldCollapse ? (
        <header
          draggable
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable reorder target; Alt+Arrow keyboard parity (WCAG 2.1.1, 2.5.7)
          tabIndex={0}
          onDragStart={(e) => handleStageDragStart(e, stage.id)}
          onDragEnd={handleStageDragEnd}
          className="bg-stage-fill border-b-4 border-ochre p-2 rounded-t relative select-none shrink-0 cursor-grab active:cursor-grabbing group hover:brightness-105 focus:ring-2 focus:ring-ochre focus:outline-none transition-all w-full flex flex-col items-center justify-start gap-2"
        >
          <div
            className="text-[#ffe0b2] font-label-caps text-[10px] uppercase font-bold tracking-wider truncate"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {stage.name}
          </div>
          <div className="flex flex-col items-center gap-1">
            <span
              data-testid={`collapsed-badge-${stage.id}`}
              title={`${stageStat.activeTasksCount} active tasks in stage`}
              className="text-[9px] font-mono text-[#ffe0b2] bg-black/40 font-bold px-1 py-0.5 rounded"
            >
              {stageStat.activeTasksCount}
            </span>
            {stageTags.length > 0 && (
              <span
                data-testid={`collapsed-tags-${stage.id}`}
                title={`Tags: ${stageTags.join(', ')}`}
                className="text-[9px] font-mono text-[#ffe0b2] bg-black/40 px-1 py-0.5 rounded"
              >
                {stageTags.length} {stageTags.length === 1 ? 'tag' : 'tags'}
              </span>
            )}
            {isPaused && <span className="w-1.5 h-1.5 rounded-full bg-[#ffe0b2] animate-pulse" />}
          </div>
        </header>
      ) : (
        <InfoTooltip
          title={`Stage: ${stage.name} (${typeConfig.label})`}
          description={
            stage.type === 'agent'
              ? 'Autonomous AI worker stage. Executes system prompt against codebase and generates markdown report.'
              : stage.type === 'human'
                ? 'Human review gate. Pipeline halts and requires user approval or feedback rejection.'
                : stage.type === 'merge'
                  ? 'Merge stage. Integrates the task git branch into the main branch — git operations only; conflicts fail the stage for resolution.'
                  : 'Deterministic CI verification stage. Executes bash command script; exit 0 advances task. A stage whose command runs the deploy script (e.g. ./deploy.sh --prod) is an ordinary CI stage.'
          }
          behindTheScenes={
            stage.type === 'agent'
              ? 'Spawns PI Agent worker with curated prompt and sandboxed tool executions.'
              : stage.type === 'human'
                ? 'Rejection routes task with feedback to fallback stage; approval advances to next stage.'
                : stage.type === 'merge'
                  ? 'Auto-commits pending work on the task branch, checks out main, merges (conflicts abort and fail back), then pushes main.'
                  : 'Spawns child bash process and captures stdout/stderr to task audit log. A stage whose command runs the deploy script is an ordinary CI stage — on failure it routes to its configured fallback.'
          }
          shortcut="Alt+Left/Right to reorder"
          position="bottom"
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Alt+Arrow keyboard reorder via onKeyDown below (WCAG 2.1.1) */}
          <header
            draggable
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable reorder target with keyboard handler
            tabIndex={0}
            onDragStart={(e) => handleStageDragStart(e, stage.id)}
            onDragEnd={handleStageDragEnd}
            onKeyDown={(e) => {
              if (e.altKey && e.key === 'ArrowLeft' && stageIndex > 0) {
                e.preventDefault();
                reorderAndSave(stageIndex, stageIndex - 1);
                if (uiPreferences?.enableAudioChimes) soundEffects.playChime('stageAdvance');
              } else if (e.altKey && e.key === 'ArrowRight' && stageIndex < stages.length - 1) {
                e.preventDefault();
                reorderAndSave(stageIndex, stageIndex + 1);
                if (uiPreferences?.enableAudioChimes) soundEffects.playChime('stageAdvance');
              }
            }}
            aria-label={`Stage ${stage.name}. Position ${stageIndex + 1} of ${stages.length}. Press Alt+Left or Alt+Right to reorder.`}
            className="bg-stage-fill border-b-4 border-ochre p-3 rounded-t relative select-none shrink-0 cursor-grab active:cursor-grabbing group hover:brightness-105 focus:ring-2 focus:ring-ochre focus:outline-none transition-all w-full"
          >
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="text-ochre/60 group-hover:text-[#ffe0b2] text-xs font-mono font-bold select-none cursor-grab"
                  aria-hidden="true"
                >
                  ⠿
                </span>
                <span className="font-label-caps text-label-caps text-[#ffe0b2] uppercase font-bold tracking-wider truncate">
                  {stage.name}
                </span>
                {isPaused && (
                  <span
                    className="text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-black/40 text-[#ffe0b2] border border-[#ffb77f]/70 flex items-center gap-1 shrink-0"
                    aria-label={`Stage ${stage.name} is paused`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#ffe0b2] animate-pulse" />
                    <span>Paused</span>
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#ffe0b2] bg-black/40 font-bold px-1.5 py-0.5 rounded">
                {stageTasks.length} {stageTasks.length === 1 ? 'task' : 'tasks'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#f5f2f0] font-label-caps text-[9px] uppercase tracking-wider font-medium truncate pr-2">
                {stage.description || typeConfig.sublabel || 'SPECIFICATION'}
              </span>
              <span className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-[#ffe0b2] shrink-0">
                {typeConfig.label}
              </span>
            </div>
            {stageTags.length > 0 && (
              <div
                className="flex items-center gap-1 mt-1.5 flex-wrap"
                title={`Tags: ${stageTags.join(', ')}`}
                data-testid={`stage-tag-chips-${stage.id}`}
              >
                {stageTags.slice(0, 3).map((tag) => (
                  <span key={tag} className={STAGE_HEADER_TAG_CHIP_CLASS}>
                    {tag}
                  </span>
                ))}
                {stageTags.length > 3 && (
                  <span className={STAGE_HEADER_TAG_CHIP_CLASS}>+{stageTags.length - 3}</span>
                )}
              </div>
            )}
          </header>
        </InfoTooltip>
      )}

      {isPaused && !shouldCollapse && (
        <InfoTooltip
          title="Stage Paused"
          description="Tasks entering this stage will not automatically execute or advance until manually triggered."
          behindTheScenes="Stage paused flag held in workflow definition; scheduler skips automatic execution"
          position="bottom"
        >
          <div
            className="px-3 py-2 bg-ochre/10 border-b border-ochre/30 text-ochre text-[10px] font-mono flex items-center gap-1.5 font-semibold shrink-0 select-none cursor-help w-full"
            role="status"
            aria-label="Stage is paused"
          >
            <span>⏸</span>
            <span>Stage paused — tasks will not advance automatically</span>
          </div>
        </InfoTooltip>
      )}

      {/* Task Card List & Add Task Area (#33). The `onScroll` feed drives the
          phone-only toolbar auto-collapse (task 34793321): the page shell
          never scrolls, so this list is the only scroll source. */}
      {!shouldCollapse && (
        <div
          data-testid={`stage-card-list-${stage.id}`}
          onScroll={onCardListScroll}
          className="flex-1 p-3 space-y-3 overflow-y-auto custom-scrollbar flex flex-col"
        >
          {visibleStageTasks.map((task) => (
            <TaskCard
              // Pipeline+stage-scoped card key (task 8a056fc4): a pipeline
              // switch remounts every card so per-card state (pending
              // checkpoint actions, Copied ✓, dragging) can never leak
              // across pipelines that reuse stage/task ids. Stable within
              // a pipeline, so drag-and-drop and pending guards keep working.
              key={`${workflowKey ?? ''}:${stage.id}:${task.id}`}
              task={task}
              stageName={stage.name}
              role={stage.type}
              // Single-active invariant: only the engine owner
              // is active — never every card in the running stage.
              isActive={isTaskRunning(task, engineState, isAgentRunning)}
              onClick={() => setSelectedTask?.(task)}
              onApprove={handleApprove}
              onReject={handleReject}
              onExecute={handleExecute}
              avgDurationSeconds={stageStat.avgDurationSeconds}
              nowMs={effectiveNowMs}
            />
          ))}

          {stageTasks.length === 0 && !isAddingTask && (
            <div className="flex-1 flex flex-col justify-center min-h-[140px]">
              {searchQuery && (
                <div className="text-xs italic text-text-muted text-center py-2 select-none font-body-sm">
                  No matching tasks.
                </div>
              )}
              <InfoTooltip
                title={`Add Task to ${stage.name}`}
                description={
                  stage.type === 'agent'
                    ? 'Creates a new task in this stage. Agent will auto-dispatch when engine is running.'
                    : 'Creates a new task waiting at this stage.'
                }
                position="bottom"
              >
                <button
                  type="button"
                  onClick={startAddTask}
                  aria-label={`Add task to ${stage.name}`}
                  className="flex-1 w-full min-h-[120px] py-6 px-4 border-2 border-dashed border-border-standard hover:border-primary rounded-sm transition-all flex flex-col items-center justify-center gap-2 text-text-muted hover:text-primary hover:bg-surface-container/30 cursor-pointer select-none group"
                >
                  <div className="w-8 h-8 rounded-full bg-surface-container group-hover:bg-primary group-hover:text-on-primary text-text-muted flex items-center justify-center text-base font-bold transition-all shadow-sm">
                    +
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider font-label-caps">
                    Add Task
                  </span>
                  <span className="text-[10px] font-mono text-text-muted/80">
                    Create task in {stage.name}
                  </span>
                </button>
              </InfoTooltip>
            </div>
          )}

          {/* Inline Add Task Form or Bottom Button when tasks exist */}
          {isAddingTask ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateTaskInline(stage.id);
              }}
              className="space-y-2 bg-surface-deep p-2.5 rounded-sm border border-primary/40 shadow-md shrink-0"
            >
              <input
                type="text"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- initial focus follows the user's explicit add-task action (WCAG 3.2.1 safe)
                autoFocus
                aria-label={`Task goal for ${stage.name}`}
                placeholder="Enter task goal / title..."
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    cancelAddTask();
                  }
                }}
                className="w-full p-2.5 text-xs bg-surface-container border border-border-standard rounded-sm text-on-surface outline-none focus:border-primary transition-colors font-medium min-h-[44px]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelAddTask}
                  className="px-3 py-2 min-h-[44px] text-[10px] font-bold uppercase text-text-muted hover:text-on-surface rounded-sm transition-colors cursor-pointer flex items-center justify-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  aria-label="Submit new task"
                  disabled={isSubmittingTask || !newTaskTitle.trim()}
                  className="px-4 py-2 min-h-[44px] text-[10px] font-bold uppercase bg-primary text-on-primary rounded-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center"
                >
                  {isSubmittingTask ? 'Adding…' : 'Add Task'}
                </button>
              </div>
            </form>
          ) : (
            stageTasks.length > 0 && (
              <InfoTooltip
                title={`Add Task to ${stage.name}`}
                description={
                  stage.type === 'agent'
                    ? 'Creates a new task in this stage. Agent will auto-dispatch when engine is running.'
                    : 'Creates a new task waiting at this stage.'
                }
                position="bottom"
              >
                <button
                  type="button"
                  onClick={startAddTask}
                  aria-label={`Add task to ${stage.name}`}
                  className="w-full py-2 px-3 min-h-[44px] text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-primary hover:bg-surface-container border border-dashed border-border-standard hover:border-primary rounded-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none shrink-0"
                >
                  <span className="text-sm">+</span>
                  <span>Add Task</span>
                </button>
              </InfoTooltip>
            )
          )}
        </div>
      )}

      {!shouldCollapse && (
        <div
          data-testid={`stage-analytics-${stage.id}`}
          className="px-3 py-1.5 bg-surface-deep/80 border-t border-border-standard flex items-center justify-between text-[10px] font-mono text-text-muted select-none shrink-0"
        >
          <span title="Stage throughput (tasks processed)">
            📦 <strong className="text-on-surface">{stageStat.throughput}</strong>
          </span>
          <span title="Average stage duration">
            ⏱️ <strong className="text-on-surface">{stageStat.avgDuration}</strong>
          </span>
          <span
            title={`Pass/Fail rate: ${stageStat.passRate}% (${stageStat.passedCount} passed, ${stageStat.failedCount} failed)`}
            className={`font-bold ${
              stageStat.passRate >= 90
                ? 'text-[#7bdb85]'
                : stageStat.passRate >= 75
                  ? 'text-[#ffb77f]'
                  : 'text-[#ffb4ab]'
            }`}
          >
            {stageStat.passRate}%
          </span>
        </div>
      )}

      {/* In-Column Full-Height Expandable Stage Settings Drawer (#9, #10, #11, #42) */}
      {!shouldCollapse && (
        <StageSettingsDrawer
          stage={stage}
          stages={stages}
          isSettingsExpanded={isSettingsExpanded}
          onToggleSettings={toggleSettings}
          onCloseSettings={closeSettings}
          onSaveAndClose={saveAndCloseSettings}
          onUpdateStage={handleUpdateStage}
          onTypeChange={persistTypeChange}
          activeProjectId={activeProjectId}
          saveStages={saveStages}
          pendingStageAction={pendingStageAction}
          removeStageAndSave={removeStageAndSave}
          typeConfigProps={{
            skills,
            skillsLoading,
            skillsError,
            fetchSkills,
            getSkillByName,
            activeProjectId,
            availableModels,
            availableHarnesses,
            modelsRefreshing,
            refreshModels,
            projectHarnessId,
            projectHarnessLabel,
            isHarnessDisabled,
          }}
        />
      )}
    </section>
  );
}
