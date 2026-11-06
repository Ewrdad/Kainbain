import { useState, useEffect, useRef } from 'react';

import {
  TASK_INSPECTOR_WIDTH_MIN,
  TASK_INSPECTOR_WIDTH_MAX,
} from '../../../context/useUiPreferences';

/***
 * MARK: useTaskInspectorResize
 * @description Horizontal resize logic for the Task Inspector slide-over
 *   panel. Mirrors the Activity Console vertical splitter: pointer drag,
 *   touch drag, keyboard nudging, bounds clamping and preference
 *   persistence live here so `TaskDetailOverlayContent` never inlines drag
 *   state. Width persists to the `taskInspectorWidth` UI preference.
 * @example const resize = useTaskInspectorResize({ uiPreferences, updateUiPreference });
 ***/
const DEFAULT_TASK_INSPECTOR_WIDTH = 560;
const KEYBOARD_STEP = 20;
const VIEWPORT_MARGIN = 80;

function clampToRange(value, min, max) {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/**
 * @example getTaskInspectorDynamicMax() => 1920
 */
export function getTaskInspectorDynamicMax() {
  if (typeof window === 'undefined') return TASK_INSPECTOR_WIDTH_MAX;
  const viewportWidth = window.innerWidth || TASK_INSPECTOR_WIDTH_MIN + VIEWPORT_MARGIN;
  return Math.max(
    TASK_INSPECTOR_WIDTH_MIN,
    Math.min(TASK_INSPECTOR_WIDTH_MAX, viewportWidth - VIEWPORT_MARGIN),
  );
}

/**
 * @example const resize = useTaskInspectorResize({ uiPreferences, updateUiPreference });
 */
export function useTaskInspectorResize({ uiPreferences, updateUiPreference } = {}) {
  const requestedWidth = uiPreferences?.taskInspectorWidth;
  const safeRequested =
    typeof requestedWidth === 'number' && Number.isFinite(requestedWidth)
      ? requestedWidth
      : DEFAULT_TASK_INSPECTOR_WIDTH;

  const [isDraggingInspector, setIsDraggingInspector] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() =>
    clampToRange(safeRequested, TASK_INSPECTOR_WIDTH_MIN, TASK_INSPECTOR_WIDTH_MAX),
  );

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(panelWidth);

  // Keep local state in sync with the persisted preference when it changes
  // out-of-band (e.g. another tab), but never fight an in-progress drag.
  useEffect(() => {
    if (isDraggingRef.current) return;
    setPanelWidth(clampToRange(safeRequested, TASK_INSPECTOR_WIDTH_MIN, TASK_INSPECTOR_WIDTH_MAX));
  }, [safeRequested]);

  // Clamp the live width to the viewport on window resize without persisting
  // the viewport-derived value (only user drags persist).
  useEffect(() => {
    const handleResize = () => {
      if (isDraggingRef.current) return;
      setPanelWidth((prev) => {
        const max = getTaskInspectorDynamicMax();
        const next = Math.min(max, Math.max(TASK_INSPECTOR_WIDTH_MIN, prev));
        return next === prev ? prev : next;
      });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    return undefined;
  }, []);

  const commitWidth = (nextWidth) => {
    const max = getTaskInspectorDynamicMax();
    const clamped = clampToRange(nextWidth, TASK_INSPECTOR_WIDTH_MIN, max);
    setPanelWidth(clamped);
    updateUiPreference?.('taskInspectorWidth', clamped);
    return clamped;
  };

  /***
   * MARK: handleResizeMouseDown
   * @description Starts horizontal drag-resizing of the Task Inspector from
   *   its left edge. Moving the pointer left increases the width.
   * @example onMouseDown={handleResizeMouseDown}
   * @param {React.MouseEvent} e
   ***/
  const handleResizeMouseDown = (e) => {
    if (e && typeof e.button === 'number' && e.button !== 0) return;
    e?.preventDefault?.();
    setIsDraggingInspector(true);
    isDraggingRef.current = true;
    dragStartXRef.current = e?.clientX ?? 0;
    dragStartWidthRef.current = panelWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = dragStartXRef.current - moveEvent.clientX;
      const nextWidth = dragStartWidthRef.current + deltaX;
      commitWidth(nextWidth);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      setIsDraggingInspector(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
  };

  /***
   * MARK: handleResizeTouchStart
   * @description Allows touchscreen users to drag-resize the Task Inspector.
   * @example onTouchStart={handleResizeTouchStart}
   * @param {React.TouchEvent} e
   ***/
  const handleResizeTouchStart = (e) => {
    if (!e?.touches || e.touches.length === 0) return;
    e.preventDefault?.();
    setIsDraggingInspector(true);
    isDraggingRef.current = true;
    dragStartXRef.current = e.touches[0].clientX;
    dragStartWidthRef.current = panelWidth;

    const handleTouchMove = (moveEvent) => {
      if (!moveEvent?.touches || moveEvent.touches.length === 0) return;
      const deltaX = dragStartXRef.current - moveEvent.touches[0].clientX;
      const nextWidth = dragStartWidthRef.current + deltaX;
      const touchMax = Math.max(
        TASK_INSPECTOR_WIDTH_MIN,
        Math.min(getTaskInspectorDynamicMax(), (typeof window !== 'undefined' ? window.innerHeight : TASK_INSPECTOR_WIDTH_MAX) * 0.9),
      );
      const clamped = clampToRange(nextWidth, TASK_INSPECTOR_WIDTH_MIN, touchMax);
      setPanelWidth(clamped);
      updateUiPreference?.('taskInspectorWidth', clamped);
    };

    const handleTouchEnd = () => {
      isDraggingRef.current = false;
      setIsDraggingInspector(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        window.removeEventListener('touchcancel', handleTouchEnd);
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd);
      window.addEventListener('touchcancel', handleTouchEnd);
    }
  };

  /***
   * MARK: handleResizeKeyDown
   * @description Keyboard nudging for the Task Inspector splitter.
   *   ArrowLeft increases width, ArrowRight decreases width by 20px.
   * @example onKeyDown={handleResizeKeyDown}
   * @param {React.KeyboardEvent} e
   ***/
  const handleResizeKeyDown = (e) => {
    if (e?.key === 'ArrowLeft') {
      e.preventDefault?.();
      const next = Math.min(
        TASK_INSPECTOR_WIDTH_MAX,
        Math.max(TASK_INSPECTOR_WIDTH_MIN, panelWidth + KEYBOARD_STEP),
      );
      setPanelWidth(next);
      updateUiPreference?.('taskInspectorWidth', next);
    } else if (e?.key === 'ArrowRight') {
      e.preventDefault?.();
      const next = Math.min(
        TASK_INSPECTOR_WIDTH_MAX,
        Math.max(TASK_INSPECTOR_WIDTH_MIN, panelWidth - KEYBOARD_STEP),
      );
      setPanelWidth(next);
      updateUiPreference?.('taskInspectorWidth', next);
    }
  };

  const handleResizeDoubleClick = () => {
    commitWidth(DEFAULT_TASK_INSPECTOR_WIDTH);
  };

  return {
    panelWidth,
    isDraggingInspector,
    isDragging: isDraggingInspector,
    handleResizeMouseDown,
    handleResizeTouchStart,
    handleResizeKeyDown,
    handleResizeDoubleClick,
    // Expose constants for callers/tests.
    min: TASK_INSPECTOR_WIDTH_MIN,
    max: TASK_INSPECTOR_WIDTH_MAX,
  };
}

/**
 * @example export default useTaskInspectorResize;
 */
export default useTaskInspectorResize;

export {
  TASK_INSPECTOR_WIDTH_MIN as MIN_TASK_INSPECTOR_WIDTH,
  TASK_INSPECTOR_WIDTH_MAX as MAX_TASK_INSPECTOR_WIDTH,
};
