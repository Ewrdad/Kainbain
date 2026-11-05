import React from 'react';
import { useKainBain } from '../context/KainBainContext';
import { WorkflowCanvas } from './workflow/WorkflowCanvas';
import { NowPlayingBar } from './layout/NowPlayingBar';
import { TaskDetailOverlay } from './tasks/TaskDetailOverlay';
import { useIsGlassesViewport } from './util/viewport';
import { GlassesViewportGate, GlassesTaskListView, resolveGlassesCounts } from './glasses/index.js';
import { resolveRunningTask } from './tasks/runningTask';

/***
 * MARK: OrchestratorView
 * @description The unified master Kanban orchestrator workspace.
 * Integrates the workflow canvas pipeline (with search/filter, stage columns with
 * in-column expandable settings bars, draggable headers, inline task creation,
 * drag-and-drop, checkpoint approval, and live agent activity console),
 * the persistent engine Now Playing bar, and the integrated slide-over Task Inspector.
 *
 * On a Meta Ray-Ban shaped viewport (~600x600 square) the canvas area swaps
 * to the glasses observability task list instead, and the slide-over
 * inspector stays closed (details move to the glasses Details affordance).
 * Every other viewport renders exactly as before.
 *
 * @example <OrchestratorView />
 ***/
export function OrchestratorView() {
  const {
    selectedTask,
    setSelectedTask,
    setView,
    uiPreferences,
    tasks = [],
    engineState = {},
    stages = [],
    activeProjectId,
    refreshTasks = () => {},
    isAgentRunning = false,
  } = useKainBain();

  const showNowPlayingBar = uiPreferences?.showNowPlayingBar !== false;
  const isGlassesViewport = useIsGlassesViewport();

  const openGlassesReview = (task) => {
    if (!task?.id) return;
    setSelectedTask(task);
    setView('task-review', { taskId: task.id });
  };
  const refreshGlassesTasks = () => {
    if (activeProjectId) refreshTasks(activeProjectId);
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      {/* Main Center Canvas */}
      <div
        className={`flex-1 bg-surface-deep flex flex-col overflow-hidden relative ${
          showNowPlayingBar && !isGlassesViewport ? 'pb-[72px]' : 'pb-0'
        }`}
      >
        <GlassesViewportGate
          glasses={
            <GlassesTaskListView
              tasks={tasks}
              runningTask={resolveRunningTask(tasks, engineState)}
              engineState={engineState}
              stages={stages}
              counts={resolveGlassesCounts(tasks, engineState, isAgentRunning)}
              onOpenTask={openGlassesReview}
              onRefresh={refreshGlassesTasks}
            />
          }
        >
          <WorkflowCanvas />
          {showNowPlayingBar && <NowPlayingBar />}
        </GlassesViewportGate>
      </div>

      {/* Integrated Slide-Over Task Inspector (No full-screen blocking modal) */}
      {selectedTask && !isGlassesViewport && (
        <TaskDetailOverlay
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          // Footer-reservation contract (#footer-overlap): when the Now Playing
          // footer is rendered the inspector ends above it, exactly like the
          // Configure drawer does above the Activity Console + footer.
          footerReserved={showNowPlayingBar}
        />
      )}
    </div>
  );
}
