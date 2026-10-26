import { useRef, useState } from 'react';
import { soundEffects } from '../../../services/soundEffects';

/***
 * MARK: useStageDnD
 * @description Stage-column + task-card drag-and-drop handlers extracted from
 *   WorkflowCanvas. Owns the drag-over/dragging ids and the anti-flicker
 *   enter-count ref; drops dispatch to `reorderAndSave` (column reorder) or
 *   `moveTask` (task move). No JSX.
 * @example const dnd = useStageDnD({ stages, moveTask, activeProjectId, uiPreferences, reorderAndSave });
 ***/
export function useStageDnD({ stages, moveTask, activeProjectId, uiPreferences, reorderAndSave }) {
  const [dragOverStageId, setDragOverStageId] = useState(null);
  const [draggingStageId, setDraggingStageId] = useState(null);
  const dragEnterCountsRef = useRef({});

  // Stage column dragging handlers
  const handleStageDragStart = (e, stageId) => {
    e.dataTransfer.setData('application/kainbain-stage-id', stageId);
    e.dataTransfer.setData('text/plain', stageId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingStageId(stageId);
  };

  const handleStageDragEnd = () => {
    setDraggingStageId(null);
    setDragOverStageId(null);
  };

  // Anti-flicker drag enter / leave / over / drop
  const handleDragEnter = (e, stageId) => {
    e.preventDefault();
    dragEnterCountsRef.current[stageId] = (dragEnterCountsRef.current[stageId] || 0) + 1;
    setDragOverStageId(stageId);
  };

  const handleDragLeave = (e, stageId) => {
    e.preventDefault();
    dragEnterCountsRef.current[stageId] = Math.max(
      0,
      (dragEnterCountsRef.current[stageId] || 0) - 1,
    );
    if (dragEnterCountsRef.current[stageId] === 0) {
      setDragOverStageId((prev) => (prev === stageId ? null : prev));
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  /***
   * MARK: handleDrop
   * @description Handles drop events for both stage column reordering and moving task cards across columns.
   * @param {React.DragEvent} e
   * @param {string} stageId - Destination stage ID.
   * @example onDrop={(e) => handleDrop(e, stage.id)}
   ***/
  const handleDrop = (e, stageId) => {
    e.preventDefault();
    dragEnterCountsRef.current[stageId] = 0;
    setDragOverStageId(null);
    setDraggingStageId(null);

    const draggedStageId = e.dataTransfer.getData('application/kainbain-stage-id');
    const taskId =
      e.dataTransfer.getData('application/kainbain-task') || e.dataTransfer.getData('text/plain');

    if (draggedStageId && String(draggedStageId) !== String(stageId)) {
      const fromIndex = stages.findIndex((s) => String(s.id) === String(draggedStageId));
      const toIndex = stages.findIndex((s) => String(s.id) === String(stageId));
      if (fromIndex !== -1 && toIndex !== -1) {
        reorderAndSave(fromIndex, toIndex);
        if (uiPreferences?.enableAudioChimes) {
          soundEffects.playChime('stageAdvance');
        }
      }
      return;
    }

    if (taskId && stageId && moveTask) {
      moveTask(activeProjectId, taskId, stageId);
      if (uiPreferences?.enableAudioChimes) {
        soundEffects.playChime('stageAdvance');
      }
    }
  };

  return {
    draggingStageId,
    dragOverStageId,
    handleStageDragStart,
    handleStageDragEnd,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
