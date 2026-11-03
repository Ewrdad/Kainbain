import { formatTaskTitleFirstLine } from '../tasks/taskFormatters';

/***
 * MARK: formatMobileMonitorTitle
 * @description Pure formatter for the compact monitor header's right-side
 *   text when no Runner fleet is shown. The engine pill already shows the
 *   stage name when running, so this text shows the active task identity
 *   instead (title, falling back to the goal's first line with a leading
 *   markdown heading stripped — mirroring ActiveTaskPromptWidget). When a
 *   fleet is shown the view uses the header-mode chip (`<task> · <stage>`)
 *   instead, falling back to this title only when no task names the chip.
 *   When idle with no task the previous stage/empty text is kept so the
 *   header never blanks.
 * @param {Object|null} [activeTask] - Resolved active task (title, goal).
 * @param {Object} [engineState] - Engine snapshot (activeStageName).
 * @param {boolean} [isRunning] - Engine currently executing.
 * @returns {string} Header text for the right-side element.
 * @example formatMobileMonitorTitle({ title: 'Build auth' }, {}, true) // 'Build auth'
 * @example formatMobileMonitorTitle(null, {}, false) // 'No active stage'
 ***/
export function formatMobileMonitorTitle(activeTask = null, engineState = {}, isRunning = false) {
  // First-line extraction shares the markdown-strip rule with every other
  // title surface; the idle fallback chain below stays local to this header.
  const taskName = formatTaskTitleFirstLine(activeTask?.title || activeTask?.goal || '', '').trim();
  if (taskName) return taskName;
  if (isRunning) return 'No active task';
  // The stranded stage name is display text, but a numeric id (or worse, an
  // object) can leak through from a malformed payload — coerce so the
  // documented string return always holds and the header never crashes.
  const strandedStageName = engineState?.activeStageName;
  return strandedStageName ? String(strandedStageName) : 'No active stage';
}

/***
 * MARK: default formatMobileMonitorTitle
 * @description Default-export alias for `formatMobileMonitorTitle` so the
 *   compact monitor title formatter can be imported either way.
 * @example formatMobileMonitorTitle({ title: 'Build auth' }, {}, true) // 'Build auth'
 ***/
export default formatMobileMonitorTitle;
