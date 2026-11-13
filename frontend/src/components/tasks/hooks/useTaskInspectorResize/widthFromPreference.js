import { clampToRange } from './clampToRange';
import { getTaskInspectorDynamicMax } from './getTaskInspectorDynamicMax';
import { DEFAULT_TASK_INSPECTOR_WIDTH } from './defaultTaskInspectorWidth';
import { TASK_INSPECTOR_WIDTH_MIN } from '../../../../context/useUiPreferences';

/***
 * MARK: widthFromPreference
 * @description Turns a stored preference into a safe width: non-numeric or
 *   missing values fall back to the default, then the result is clamped to
 *   the current dynamic range.
 * @example widthFromPreference(99999) // clamped to getTaskInspectorDynamicMax()
 * @param {number} requestedWidth - Stored preference value.
 * @returns {number} Safe inspector width in px.
 ***/
export function widthFromPreference(requestedWidth) {
  const safeRequested =
    typeof requestedWidth === 'number' && Number.isFinite(requestedWidth)
      ? requestedWidth
      : DEFAULT_TASK_INSPECTOR_WIDTH;
  return clampToRange(safeRequested, TASK_INSPECTOR_WIDTH_MIN, getTaskInspectorDynamicMax());
}
