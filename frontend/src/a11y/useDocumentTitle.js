import { useEffect } from 'react';

/***
 * MARK: pageTitleForView
 * @description Maps the synced router view state onto a short human-readable
 * page label (the trailing segment of the document title). Unknown views
 * return null so the caller can omit the page segment instead of leaking
 * `undefined` into the tab title.
 * @param {string} view - Router-synced view key (see KainBainRouteBridge).
 * @param {string} [taskKey] - Short task key for task-scoped views.
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
 * @param {string} view - Router-synced view key (see KainBainRouteBridge).
 * @param {string|Object} [taskKeyOrOptions] - Legacy positional task key, or
 * an options object `{ taskKey, projectName }`. A `computeRunning` key is
 * still accepted but ignored (deprecated, kept for backward compatibility).
 * @param {Object} [legacyOptions] - Options when the task key is positional:
 * `{ projectName }`.
 * @returns {string} Full document title without any status prefix.
 * @example titleForView('explorer', { projectName: 'MyProject' }) => 'Kainbain - MyProject - Files & Repo'
 * @example titleForView('task-detail', 'task-1') => 'Kainbain - Task task-1'
 ***/
export function titleForView(view, taskKeyOrOptions, legacyOptions = {}) {
  const taskKey =
    taskKeyOrOptions !== null && typeof taskKeyOrOptions === 'object'
      ? taskKeyOrOptions.taskKey
      : taskKeyOrOptions;
  const options =
    taskKeyOrOptions !== null && typeof taskKeyOrOptions === 'object'
      ? taskKeyOrOptions
      : legacyOptions || {};
  const projectName = typeof options.projectName === 'string' ? options.projectName.trim() : '';
  const page = pageTitleForView(view, taskKey);

  const segments = ['Kainbain'];
  if (projectName) segments.push(projectName);
  if (page) segments.push(page);
  return segments.join(' - ');
}

/***
 * MARK: useDocumentTitle
 * @description Sets `document.title` for the active view and restores the
 * previous title on unmount (so tests and host shells never leak a stale
 * title). No-ops outside a DOM environment.
 * @param {string} title - Full title to apply while mounted.
 * @example useDocumentTitle(titleForView(view, { taskKey, projectName }))
 ***/
export function useDocumentTitle(title) {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
