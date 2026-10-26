/***
 * MARK: routing
 * @description Single route table for the KainBain SPA (HashRouter-first).
 * The router location is the source of truth for the current view:
 * leaving a view IS a navigation, so a stale docs/task location can never
 * survive it, and refresh re-opens the CURRENT route with its params.
 *
 * Route table (canonical paths; the HashRouter renders them as `#/...` URLs):
 *
 * | View         | Canonical path        | Legacy entries (redirect)        |
 * |--------------|-----------------------|----------------------------------|
 * | Orchestrator | `/`                   | `#/orchestrator`, `?view=...`    |
 * | Files & Repo | `/explorer`           | `?view=explorer`                 |
 * | Settings     | `/settings`           | `?view=settings`                 |
 * | System Settings| `/system-settings/:section?` | (none)                    |
 * | Observability| `/observability`      | `?view=observability`            |
 * | Docs         | `/docs/:slug?`        | `#docs`, `?view=docs`            |
 * | Task detail  | `/tasks/:id`          | `#/task/:id`, `?task=:id`        |
 * | Task review  | `/tasks/:id/review`   | (existing shape, now canonical)  |
 * | Task survey  | `/tasks/:id/survey`   | `#/task/:id/survey` (legacy)       |
 * | Retrospective| `/retrospective`      | (none — new view, no legacy)     |
 *
 * Note: `/settings` is project-scoped (ProjectSettings); `/system-settings` is
 * application-level (SystemSettingsPage, a full screen — not a modal). The
 * System Menu entry and the `S` shortcut open it in a new window by default
 * (`openSystemSettings`), falling back to same-tab `setView('system-settings')`
 * when the popout is blocked or the viewport is phone-narrow. The `:section`
 * segment (or `?section=`) deep-links a settings tab.
 *
 * Refresh guarantees:
 * - Refresh re-opens the CURRENT route (docs slug, task id preserved).
 * - Unknown locations keep the current view (explicit catch-all, no switch).
 * - Each view entry is one history entry; back/forward traverse real entries.
 * - Legacy-redirect normalisation uses history REPLACE, never a push.
 *
 * How to add a view: add its canonical path here + a `<Route>` in
 * `routes.jsx` + a `viewToPath`/`routeToView` row + redirect/tests below.
 * A future move to `<BrowserRouter>` is mechanical: canonical paths are
 * already full-URL shaped; only the router shell in `main.jsx` changes.
 ***/

export const ROUTES = {
  orchestrator: '/',
  explorer: '/explorer',
  settings: '/settings',
  systemSettings: '/system-settings',
  systemSettingsSection: '/system-settings/:section',
  observability: '/observability',
  docs: '/docs',
  docsArticle: '/docs/:slug',
  taskDetail: '/tasks/:id',
  taskReview: '/tasks/:id/review',
  taskSurvey: '/tasks/:id/survey',
  retrospective: '/retrospective',
};

/***
 * MARK: viewToPath
 * @description Canonical router path for a view id. The `setView` facade
 *   navigates here, so every view entry writes exactly one history entry.
 * @param {string} view - View id (`orchestrator`, `explorer`, `settings`,
 *   `system-settings`, `observability`, `docs`, `task-detail`/`task`,
 *   `task-review`, `tasks`, `retrospective`).
 * @param {Object} [opts]
 * @param {string} [opts.taskId] - Task id for task-detail/task-review paths.
 * @param {string} [opts.slug] - Docs slug for the docs article path.
 * @param {string} [opts.section] - Settings tab id for the system-settings path.
 * @returns {string|null} Canonical path, or null for unknown views.
 * @example viewToPath('docs', { slug: 'architecture' }) => '/docs/architecture'
 ***/
export function viewToPath(view, opts = {}) {
  const { taskId, slug, section } = opts;
  switch (view) {
    case 'orchestrator':
    case 'tasks':
      return '/';
    case 'explorer':
      return '/explorer';
    case 'settings':
      return '/settings';
    case 'system-settings':
      return section ? `/system-settings/${encodeURIComponent(section)}` : '/system-settings';
    case 'observability':
      return '/observability';
    case 'docs':
      return slug ? `/docs/${encodeURIComponent(slug)}` : '/docs';
    case 'task-detail':
    case 'task':
      return taskId ? `/tasks/${encodeURIComponent(taskId)}` : '/';
    case 'task-review':
      return taskId ? `/tasks/${encodeURIComponent(taskId)}/review` : '/';
    case 'task-survey':
      return taskId ? `/tasks/${encodeURIComponent(taskId)}/survey` : '/';
    case 'retrospective':
      return '/retrospective';
    default:
      return null;
  }
}

/***
 * MARK: routeToView
 * @description Resolves a router pathname to its view + params.
 *   Returns null for unknown paths so the caller keeps the current view
 *   instead of switching on fragments like `/main-content`.
 * @param {string} pathname - Router pathname (e.g. `/docs/architecture`).
 * @returns {{ view: string, taskId?: string, slug?: string, section?: string }|null}
 * @example routeToView('/tasks/t1/review') => { view: 'task-review', taskId: 't1' }
 * @example routeToView('/system-settings/models') => { view: 'system-settings', section: 'models' }
 ***/
export function routeToView(pathname) {
  if (typeof pathname !== 'string') return null;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/' || path === '/orchestrator') return { view: 'orchestrator' };
  if (path === '/explorer') return { view: 'explorer' };
  if (path === '/settings') return { view: 'settings' };
  if (path === '/system-settings') return { view: 'system-settings' };
  const systemSettingsMatch = path.match(/^\/system-settings\/([^/]+)$/);
  if (systemSettingsMatch) {
    return { view: 'system-settings', section: safeDecode(systemSettingsMatch[1]) };
  }
  if (path === '/observability') return { view: 'observability' };
  if (path === '/retrospective') return { view: 'retrospective' };
  if (path === '/docs') return { view: 'docs' };
  const docsMatch = path.match(/^\/docs\/([^/]+)$/);
  if (docsMatch) return { view: 'docs', slug: safeDecode(docsMatch[1]) };
  const reviewMatch = path.match(/^\/(?:tasks|task)\/([^/]+)\/review$/);
  if (reviewMatch) return { view: 'task-review', taskId: safeDecode(reviewMatch[1]) };
  const surveyMatch = path.match(/^\/(?:tasks|task)\/([^/]+)\/survey$/);
  if (surveyMatch) return { view: 'task-survey', taskId: safeDecode(surveyMatch[1]) };
  // Legacy singular shape (`#/task/:id`) — canonicalises to `/tasks/:id`.
  const detailMatch = path.match(/^\/(?:tasks|task)\/([^/]+)$/);
  if (detailMatch) return { view: 'task-detail', taskId: safeDecode(detailMatch[1]) };
  return null;
}

function safeDecode(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

const LEGACY_VIEW_PATHS = {
  orchestrator: '/',
  tasks: '/',
  explorer: '/explorer',
  settings: '/settings',
  'system-settings': '/system-settings',
  observability: '/observability',
  docs: '/docs',
};

/***
 * MARK: normalizeLegacyUrl
 * @description Maps legacy entry URLs onto their canonical hash ONCE at boot
 *   (via `history.replaceState`, so no extra history entry is created).
 *   Returns null when the URL is already canonical and must be left alone.
 * @param {{ hash?: string, search?: string, pathname?: string }} loc
 *   A `window.location`-like. Defaults to the live location.
 * @returns {string|null} Canonical hash (e.g. `#/docs/architecture`) or null.
 * @example normalizeLegacyUrl({ hash: '#docs', search: '', pathname: '/' }) => '#/docs'
 ***/
export function normalizeLegacyUrl(loc = defaultLocation()) {
  const hash = loc?.hash || '';
  const search = loc?.search || '';
  const pathname = loc?.pathname || '';

  // Legacy query entries (`?view=`, `?task=`) win, matching the old boot order.
  if (search) {
    try {
      const params = new URLSearchParams(search);
      const queryView = params.get('view');
      const queryTask = params.get('task');
      const wantsReview = queryView === 'task-review' || hash.includes('/review');
      const wantsSurvey = queryView === 'task-survey' || hash.includes('/survey');
      if (queryTask && (queryView === 'task-review' || queryView === 'task-survey' || !queryView)) {
        if (wantsSurvey) return `#/tasks/${encodeURIComponent(queryTask)}/survey`;
        return wantsReview
          ? `#/tasks/${encodeURIComponent(queryTask)}/review`
          : `#/tasks/${encodeURIComponent(queryTask)}`;
      }
      if (queryView && LEGACY_VIEW_PATHS[queryView] !== undefined) {
        if ((queryView === 'task' || queryView === 'task-review') && queryTask) {
          return queryView === 'task-review'
            ? `#/tasks/${encodeURIComponent(queryTask)}/review`
            : `#/tasks/${encodeURIComponent(queryTask)}`;
        }
        if (queryView === 'task' || queryView === 'task-review' || queryView === 'tasks') {
          return '#/';
        }
        return `#${LEGACY_VIEW_PATHS[queryView] === '/' ? '/' : LEGACY_VIEW_PATHS[queryView]}`;
      }
    } catch {
      // fall through to hash/path handling
    }
  }

  if (hash === '#docs') return '#/docs';
  if (hash === '#/orchestrator') return '#/';
  const singularTask = hash.match(/^#\/task\/([^?#/]+)(\/review|\/survey)?\/?$/);
  if (singularTask) {
    const id = singularTask[1];
    if (singularTask[2] === '/review') return `#/tasks/${id}/review`;
    if (singularTask[2] === '/survey') return `#/tasks/${id}/survey`;
    return `#/tasks/${id}`;
  }
  // A present hash is either already canonical (`#/...`) or an in-page
  // fragment (`#main-content`): both must be left alone.
  if (hash) return null;

  // Server-style paths (no hash yet): only mapped when they name a real view.
  if (!pathname || pathname === '/') return null;
  const asRoute = routeToView(pathname);
  if (asRoute) {
    if (asRoute.view === 'orchestrator') return '#/';
    if (asRoute.view === 'docs') return asRoute.slug ? `#/docs/${asRoute.slug}` : '#/docs';
    if (asRoute.view === 'task-detail') return `#/tasks/${asRoute.taskId}`;
    if (asRoute.view === 'task-review') return `#/tasks/${asRoute.taskId}/review`;
    if (asRoute.view === 'task-survey') return `#/tasks/${asRoute.taskId}/survey`;
    if (asRoute.view === 'system-settings') {
      return `#${viewToPath('system-settings', { section: asRoute.section })}`;
    }
    return `#${viewToPath(asRoute.view)}`;
  }
  return null;
}

function defaultLocation() {
  if (typeof window !== 'undefined' && window.location) return window.location;
  return { hash: '', search: '', pathname: '/' };
}
