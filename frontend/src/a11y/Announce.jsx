import React from 'react';

/***
 * MARK: Announcer
 * @description Visually-hidden live region for one-shot status announcements
 * (route changes, async saves, background refreshes). Uses a polite region by
 * default; errors use the assertive variant. The message clears after it is
 * announced so repeated identical messages re-announce (WCAG 4.1.3).
 * @param {Object} props
 * @param {string} props.message - Text to announce; empty clears the region.
 * @param {boolean} [props.assertive] - Assertive (error) instead of polite.
 * @example <Announcer message={saved ? 'Task saved' : ''} />
 ***/
export function Announcer({ message, assertive = false }) {
  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      aria-atomic="true"
      className="sr-only"
      data-testid="a11y-announcer"
    >
      {message}
    </div>
  );
}

/***
 * MARK: RouteAnnouncer
 * @description Announces SPA view changes to screen-reader users (WCAG 4.1.3:
 * a HashRouter swap fires no load event, so without this the new view is
 * silent). Renders nothing visual.
 * @param {Object} props
 * @param {string} props.view - Router-synced view key.
 * @param {string} [props.taskKey] - Short task key for task-scoped views.
 * @example <RouteAnnouncer view={view} taskKey={taskKey} />
 ***/
export function RouteAnnouncer({ view, taskKey }) {
  // Derived during render on purpose: the message is a pure function of the
  // props, so no post-mount effect (and no cascading setState) is needed —
  // the region mounts with its text and re-renders new text on every change,
  // which the live region announces either way.
  return <Announcer message={routeAnnouncement(view, taskKey)} />;
}

/***
 * MARK: routeAnnouncement
 * @description Human sentence announced on view change. Pure (unit-tested).
 * @param {string} view
 * @param {string} [taskKey]
 * @returns {string}
 ***/
export function routeAnnouncement(view, taskKey) {
  switch (view) {
    case 'orchestrator':
    case 'tasks':
      return 'Orchestrator workspace loaded.';
    case 'explorer':
      return 'Files and repository explorer loaded.';
    case 'settings':
      return 'Project settings loaded.';
    case 'system-settings':
      return 'System settings loaded.';
    case 'observability':
      return 'Observability dashboard loaded.';
    case 'docs':
      return 'Documentation loaded.';
    case 'retrospective':
      return 'Cross-task retrospective loaded.';
    case 'task-review':
      return taskKey ? `Reviewing task ${taskKey}.` : 'Task review loaded.';
    case 'task-survey':
      return taskKey ? `Survey for task ${taskKey} loaded.` : 'Task survey loaded.';
    case 'task-detail':
    case 'task':
      return taskKey ? `Task ${taskKey} details loaded.` : 'Task details loaded.';
    default:
      return 'View loaded.';
  }
}
