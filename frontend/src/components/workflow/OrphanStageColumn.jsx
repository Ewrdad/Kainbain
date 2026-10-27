import React from 'react';
import { TaskCard } from '../tasks/TaskCard';
import { isTaskRunning } from '../tasks/runningTask';

/***
 * MARK: OrphanStageColumn
 * @description Fail-visible bucket for tasks parked at a stage id that exists
 *   nowhere in the active pipeline (deleted stage, pipeline edit between
 *   parking and approval, pipeline switch). Board columns only render tasks
 *   whose `currentStageId` matches a live stage, so without this bucket an
 *   approved task silently vanishes the moment its stage is edited away —
 *   exactly what happened to cleanup task b6f7da08. Cards keep every recovery
 *   affordance (click-through detail, stage-move dropdown, drag onto a live
 *   column): moving a card into any live column re-parks it, nothing here
 *   runs until moved. Never a drop target itself.
 * @example <OrphanStageColumn tasks={orphanTasks} activeWfId="wf-default" ... />
 ***/
export function OrphanStageColumn({
  tasks = [],
  activeWfId,
  colStyle,
  engineState,
  isAgentRunning,
  nowMs,
  setSelectedTask,
  handleApprove,
  handleReject,
  handleExecute,
}) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const stageIds = [...new Set(tasks.map((t) => t?.currentStageId || t?.stageId).filter(Boolean))];

  return (
    <section
      id="stage-col-orphan"
      data-testid="stage-col-orphan"
      data-stage-id="__orphan__"
      style={colStyle}
      aria-label={`Unknown stage (${tasks.length} stranded tasks)`}
      className="relative h-full flex-col bg-surface-container-low border rounded-sm overflow-hidden shrink-0 flex w-full md:w-auto border-amber-500/60"
    >
      <header className="bg-stage-fill border-b-4 border-amber-500 p-3 rounded-t relative select-none shrink-0 w-full">
        <div className="flex justify-between items-center mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-amber-400 text-xs font-mono font-bold" aria-hidden="true">
              ⚠
            </span>
            <h3 className="font-label-caps text-[11px] uppercase font-bold tracking-wider truncate text-amber-200">
              Unknown stage
            </h3>
          </div>
          <span
            data-testid="orphan-count-badge"
            title={`${tasks.length} stranded tasks`}
            className="text-[10px] font-mono text-amber-100 bg-black/40 font-bold px-1.5 py-0.5 rounded"
          >
            {tasks.length}
          </span>
        </div>
        <p className="text-[11px] leading-snug text-text-muted">
          These tasks sit at a stage that no longer exists in this pipeline
          {stageIds.length > 0 && (
            <>
              {' '}
              (<span className="font-mono">{stageIds.join(', ')}</span>)
            </>
          )}
          . Nothing here runs until moved — open a card and move it into a live column.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        {tasks.map((task) => (
          <TaskCard
            // Orphan-scoped card key: a pipeline switch remounts every card
            // so per-card state can never leak across pipelines (task 8a056fc4).
            key={`${activeWfId ?? ''}:orphan:${task.id}`}
            task={task}
            stageName="Unknown stage"
            // Checkpoint chrome derives from the fallback role when no stage
            // record resolves: a stranded approval must keep its Approve /
            // Reject actions, anything else renders as a plain card.
            role={task?.status === 'waiting_human' ? 'human' : 'agent'}
            isActive={isTaskRunning(task, engineState, isAgentRunning)}
            onClick={() => setSelectedTask?.(task)}
            onApprove={handleApprove}
            onReject={handleReject}
            onExecute={handleExecute}
            avgDurationSeconds={undefined}
            nowMs={nowMs}
          />
        ))}
      </div>
    </section>
  );
}
