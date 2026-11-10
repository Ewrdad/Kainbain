import { useState, useEffect, useRef } from 'react';

import {
  TASK_INSPECTOR_WIDTH_MIN,
  TASK_INSPECTOR_WIDTH_MAX,
} from '../../../context/useUiPreferences';

/**
 * @example DEFAULT_TASK_INSPECTOR_WIDTH // 560
 */
export const DEFAULT_TASK_INSPECTOR_WIDTH = 560;
const KEYBOARD_STEP = 20;
// Space always left for the main canvas, even at the widest drag.
const VIEWPORT_MARGIN = 80;

function clampToRange(value, min, max) {
  const numeric = Number.isFinite(value) ? value : min;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

/***
 * MARK: getTaskInspectorDynamicMax
 * @description Widest the inspector may be right now: the stored maximum,
 *   reduced so `VIEWPORT_MARGIN` px of the canvas stays visible, but never
 *   below the minimum width. Falls back to the stored maximum when there is
 *   no `window` (server render / tests without a DOM).
 * @example getTaskInspectorDynamicMax() // 1840 on a 1920px-wide window
 * @returns {number}
 ***/
export function getTaskInspectorDynamicMax() {
  if (typeof window === 'undefined') return TASK_INSPECTOR_WIDTH_MAX;
  const viewportWidth = window.innerWidth || TASK_INSPECTOR_WIDTH_MIN + VIEWPORT_MARGIN;
  return Math.max(
    TASK_INSPECTOR_WIDTH_MIN,
    Math.min(TASK_INSPECTOR_WIDTH_MAX, viewportWidth - VIEWPORT_MARGIN),
  );
}

function widthFromPreference(requestedWidth) {
  const safeRequested =
    typeof requestedWidth === 'number' && Number.isFinite(requestedWidth)
      ? requestedWidth
      : DEFAULT_TASK_INSPECTOR_WIDTH;
  return clampToRange(safeRequested, TASK_INSPECTOR_WIDTH_MIN, getTaskInspectorDynamicMax());
}

/***
 * MARK: useTaskInspectorResize
 * @description Horizontal resize logic for the Task Inspector side panel.
 *   Mirrors the Activity Console vertical splitter: mouse drag, touch drag,
 *   keyboard nudging (ArrowLeft widens, ArrowRight narrows), double-click to
 *   reset, bounds clamping and persistence to the `taskInspectorWidth` UI
 *   preference. A missing or invalid stored width falls back to 560px; a
 *   width wider than the window is clamped for display without overwriting
 *   the stored preference. Window listeners added for a drag are always
 *   removed on release, on a new drag, and on unmount.
 * @example const resize = useTaskInspectorResize({ uiPreferences, updateUiPreference });
 * @param {{ uiPreferences?: object, updateUiPreference?: Function }} options
 * @returns {{ panelWidth: number, isDraggingInspector: boolean,
 *   handleResizeMouseDown: Function, handleResizeTouchStart: Function,
 *   handleResizeKeyDown: Function, handleResizeDoubleClick: Function }}
 ***/
export function useTaskInspectorResize({ uiPreferences, updateUiPreference } = {}) {
  const requestedWidth = uiPreferences?.taskInspectorWidth;

  const [isDraggingInspector, setIsDraggingInspector] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => widthFromPreference(requestedWidth));

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(panelWidth);
  // Removes whichever window listeners the current drag attached (or null).
  const detachDragListenersRef = useRef(null);

  // Keep local state in sync with the persisted preference when it changes
  // out-of-band (e.g. another tab), but never fight an in-progress drag.
  useEffect(() => {
    if (isDraggingRef.current) return;
    setPanelWidth(widthFromPreference(requestedWidth));
  }, [requestedWidth]);

  // Clamp the live width to the viewport on window resize without persisting
  // the viewport-derived value (only user actions persist).
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleResize = () => {
      if (isDraggingRef.current) return;
      setPanelWidth((prev) =>
        clampToRange(prev, TASK_INSPECTOR_WIDTH_MIN, getTaskInspectorDynamicMax()),
      );
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // An interrupted drag (unmount, route change) must not leak window handlers.
  useEffect(() => {
    return () => {
      detachDragListenersRef.current?.();
      detachDragListenersRef.current = null;
      isDraggingRef.current = false;
    };
  }, []);

  const commitWidth = (nextWidth) => {
    const clamped = clampToRange(nextWidth, TASK_INSPECTOR_WIDTH_MIN, getTaskInspectorDynamicMax());
    setPanelWidth(clamped);
    updateUiPreference?.('taskInspectorWidth', clamped);
    return clamped;
  };

  const endDrag = () => {
    detachDragListenersRef.current?.();
    detachDragListenersRef.current = null;
    isDraggingRef.current = false;
    setIsDraggingInspector(false);
  };

  // Shared drag bootstrap: `listeners` maps window event names to handlers.
  const beginDrag = (startX, listeners) => {
    // A second press while a drag is live (e.g. mouseup lost outside the
    // window) restarts cleanly instead of stacking listeners.
    detachDragListenersRef.current?.();
    isDraggingRef.current = true;
    setIsDraggingInspector(true);
    dragStartXRef.current = startX;
    dragStartWidthRef.current = panelWidth;
    if (typeof window === 'undefined') return;
    listeners.forEach(([name, handler, options]) => {
      window.addEventListener(name, handler, options);
    });
    detachDragListenersRef.current = () => {
      listeners.forEach(([name, handler]) => window.removeEventListener(name, handler));
    };
  };

  const widthForPointerX = (clientX) =>
    dragStartWidthRef.current + (dragStartXRef.current - clientX);

  /***
   * MARK: handleResizeMouseDown
   * @description Starts horizontal drag-resizing of the Task Inspector from
   *   its left edge. Moving the pointer left increases the width. Ignores
   *   non-primary mouse buttons.
   * @example onMouseDown={handleResizeMouseDown}
   * @param {React.MouseEvent} e
   ***/
  const handleResizeMouseDown = (e) => {
    if (e && typeof e.button === 'number' && e.button !== 0) return;
    e?.preventDefault?.();
    const handleMouseMove = (moveEvent) => commitWidth(widthForPointerX(moveEvent.clientX));
    beginDrag(e?.clientX ?? 0, [
      ['mousemove', handleMouseMove],
      ['mouseup', endDrag],
    ]);
  };

  /***
   * MARK: handleResizeTouchStart
   * @description Allows touchscreen users to drag-resize the Task Inspector.
   *   Events without touch points are ignored.
   * @example onTouchStart={handleResizeTouchStart}
   * @param {React.TouchEvent} e
   ***/
  const handleResizeTouchStart = (e) => {
    if (!e?.touches || e.touches.length === 0) return;
    e.preventDefault?.();
    const handleTouchMove = (moveEvent) => {
      if (!moveEvent?.touches || moveEvent.touches.length === 0) return;
      commitWidth(widthForPointerX(moveEvent.touches[0].clientX));
    };
    beginDrag(e.touches[0].clientX, [
      ['touchmove', handleTouchMove, { passive: true }],
      ['touchend', endDrag],
      ['touchcancel', endDrag],
    ]);
  };

  /***
   * MARK: handleResizeKeyDown
   * @description Keyboard nudging for the Task Inspector splitter.
   *   ArrowLeft increases width, ArrowRight decreases width by 20px.
   *   Other keys pass through untouched.
   * @example onKeyDown={handleResizeKeyDown}
   * @param {React.KeyboardEvent} e
   ***/
  const handleResizeKeyDown = (e) => {
    if (e?.key === 'ArrowLeft') {
      e.preventDefault?.();
      commitWidth(panelWidth + KEYBOARD_STEP);
    } else if (e?.key === 'ArrowRight') {
      e.preventDefault?.();
      commitWidth(panelWidth - KEYBOARD_STEP);
    }
  };

  /***
   * MARK: handleResizeDoubleClick
   * @description Resets the inspector to the default 560px width — the
   *   recovery path for a panel dragged to an awkward size.
   * @example onDoubleClick={handleResizeDoubleClick}
   ***/
  const handleResizeDoubleClick = () => {
    commitWidth(DEFAULT_TASK_INSPECTOR_WIDTH);
  };

  return {
    panelWidth,
    isDraggingInspector,
    handleResizeMouseDown,
    handleResizeTouchStart,
    handleResizeKeyDown,
    handleResizeDoubleClick,
  };
}
