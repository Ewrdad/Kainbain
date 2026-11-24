import { useEffect } from 'react';

/***
 * MARK: pageTitleForView
 * @description Maps the synced router view state onto a short human-readable
 * page label (the trailing segment of the document title). Unknown views
 * return null so the caller can omit the page segment instead of leaking
 * `undefined` into the tab title. The caller passes an already-cleaned view
 * key and task key, so this mapping itself never has to guess at bad input.
 * @param {string} view - Cleaned router view key (see KainBainRouteBridge).
 * @param {string} [taskKey] - Cleaned short task key for task-scoped views.
 * @returns {string|null} Page label, or null for unknown views.
 * @example pageTitleForView('explorer') => 'Files & Repo'
 ***/
function pageTitleForView(view, taskKey) {
  switch (view) {
    case 'orchestrator':
    case 'tasks':
      return 'Orchestrator';
    case 'explorer':
      return 'Files & Repo';
    case 'settings':
      return 'Settings';
    case 'system-settings':
      return 'System Settings';
    case 'observability':
      return 'Observability';
    case 'docs':
      return 'Docs';
    case 'retrospective':
      return 'Retrospective';
    case 'accessibility':
      return 'Accessibility';
    case 'task-review':
      return taskKey ? `Review ${taskKey}` : 'Task review';
    case 'task-survey':
      return taskKey ? `Survey ${taskKey}` : 'Task survey';
    case 'task-detail':
    case 'task':
      return taskKey ? `Task ${taskKey}` : 'Task detail';
    default:
      return null;
  }
}

/***
 * MARK: titleForView
 * @description Builds the full document title (WCAG 2.4.2 Page Titled: every
 * SPA view exposes a distinct, descriptive title so screen-reader and tab
 * users always know where they are). Format is
 * `Kainbain - <project> - <page>`; the project segment is omitted while no
 * project name is known, and the page segment is omitted for unknown views.
 * The title deliberately carries no engine-status prefix: compute state is
 * surfaced by badges and pills instead, so the tab never implies a single
 * global running/paused state.
 * How it fails safe (it never throws and never returns a blank title):
 * unknown or non-string views omit the page segment, blank or non-string
 * project names omit the project segment, and blank or non-string/non-number
 * task keys fall back to the generic task label (`Task detail`, `Task
 * review`, `Task survey`) instead of leaking `[object Object]` into the tab.
 * @param {string} view - Router-synced view key (see KainBainRouteBridge).
 * @param {string|Object} [taskKeyOrOptions] - Legacy positional task key, or
 * an options object `{ taskKey, projectName }`. A `computeRunning` key is
 * still accepted but ignored (deprecated, kept for backward compatibility).
 * @param {Object} [legacyOptions] - Options when the task key is positional:
 * `{ projectName }`.
 * @returns {string} Full document title without any status prefix.
 * @example titleForView('explorer', { projectName: 'MyProject' }) => 'Kainbain - MyProject - Files & Repo'
 * @example titleForView('task-detail', 'task-1') => 'Kainbain - Task task-1'
 * @example titleForView('nope', { projectName: 'MyProject' }) => 'Kainbain - MyProject'
 ***/
export function titleForView(view, taskKeyOrOptions, legacyOptions = {}) {
  const titleInputIsOptionsObject =
    taskKeyOrOptions !== null && typeof taskKeyOrOptions === 'object';
  const rawTaskKey = titleInputIsOptionsObject ? taskKeyOrOptions.taskKey : taskKeyOrOptions;
  // Reading `.projectName` off a truthy non-object (a stray string or number)
  // is safe — it just yields `undefined` — so only nullish trailing options
  // need the empty-object fallback.
  const titleOptions = titleInputIsOptionsObject ? taskKeyOrOptions : legacyOptions || {};
  const projectName =
    typeof titleOptions.projectName === 'string' ? titleOptions.projectName.trim() : '';
  // Task keys arrive from selected-task state, so they are usually strings
  // but can be numbers, blank, or (after a bad merge) objects. Only strings
  // and finite numbers can be shown; anything else falls back to the generic
  // task label.
  const trimmedTaskKey = typeof rawTaskKey === 'string' ? rawTaskKey.trim() : '';
  const numericTaskKey =
    typeof rawTaskKey === 'number' && Number.isFinite(rawTaskKey) ? String(rawTaskKey) : '';
  const cleanedTaskKey = trimmedTaskKey || numericTaskKey || undefined;
  const viewKey = typeof view === 'string' ? view.trim() : '';
  const pageLabel = pageTitleForView(viewKey, cleanedTaskKey);

  const segments = ['Kainbain'];
  if (projectName) segments.push(projectName);
  if (pageLabel) segments.push(pageLabel);
  return segments.join(' - ');
}

/***
 * MARK: useDocumentTitle
 * @description Sets `document.title` for the active view and restores the
 * previous title on unmount (so tests and host shells never leak a stale
 * title). No-ops outside a DOM environment. Fails safe: a missing, blank, or
 * non-string title falls back to `Kainbain` so the tab can never paint
 * `undefined` (or go blank) and stick there.
 * @param {string} title - Full title to apply while mounted.
 * @example useDocumentTitle(titleForView(view, { taskKey, projectName }))
 ***/
export function useDocumentTitle(title) {
  const safeTitle = typeof title === 'string' && title.trim() ? title : 'Kainbain';
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.title;
    document.title = safeTitle;
    return () => {
      document.title = previous;
    };
  }, [safeTitle]);
}
