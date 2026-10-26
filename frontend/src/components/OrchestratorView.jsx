import React from 'react';
import { useKainBain } from '../context/KainBainContext';
import { WorkflowCanvas } from './workflow/WorkflowCanvas';
import { NowPlayingBar } from './layout/NowPlayingBar';
import { TaskDetailOverlay } from './tasks/TaskDetailOverlay';

/***
 * MARK: OrchestratorView
 * @description The unified master Kanban orchestrator workspace.
 * Integrates the workflow canvas pipeline (with search/filter, stage columns with
 * in-column expandable settings bars, draggable headers, inline task creation,
 * drag-and-drop, checkpoint approval, and live agent activity console),
 * the persistent engine Now Playing bar, and the integrated slide-over Task Inspector.
 *
 * @example <OrchestratorView />
 ***/
export function OrchestratorView() {
  const { selectedTask, setSelectedTask, uiPreferences } = useKainBain();

  const showNowPlayingBar = uiPreferences?.showNowPlayingBar !== false;

  return (
    <div className="flex-1 flex h-full overflow-hidden relative">
      {/* Main Center Canvas */}
      <div
        className={`flex-1 bg-surface-deep flex flex-col overflow-hidden relative ${
          showNowPlayingBar ? 'pb-[72px]' : 'pb-0'
        }`}
      >
        <WorkflowCanvas />
        {showNowPlayingBar && <NowPlayingBar />}
      </div>

      {/* Integrated Slide-Over Task Inspector (No full-screen blocking modal) */}
      {selectedTask && (
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
