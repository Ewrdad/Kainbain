import {
  TASK_INSPECTOR_WIDTH_MIN,
  TASK_INSPECTOR_WIDTH_MAX,
} from '../../../../context/useUiPreferences';

// Space always left for the main canvas, even at the widest drag.
const VIEWPORT_MARGIN = 80;

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
