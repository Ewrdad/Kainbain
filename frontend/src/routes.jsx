import React from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router';

import { OrchestratorView } from './components/OrchestratorView';
import { ProjectExplorer } from './components/explorer/ProjectExplorer';
import { ProjectSettings } from './components/settings/ProjectSettings';
import { ObservabilityDashboard } from './components/observability/ObservabilityDashboard';
import { DocsView } from './components/docs/DocsView';
import { TaskDetailPage } from './components/tasks/TaskDetailPage';
import { TaskReviewPage } from './components/tasks/TaskReviewPage';
import { SurveyPage } from './components/tasks/SurveyPage';
import { RetrospectivePage } from './components/retrospective/RetrospectivePage';
import { SystemSettingsPage } from './components/settings/SystemSettingsPage';

/***
 * MARK: AppRoutes
 * @description Declarative route table for the KainBain SPA (see
 *   `routing.js` for the table, refresh guarantees, and how to add a view).
 *   Rendered inside a `<HashRouter>` (see `main.jsx`); tests use
 *   `<MemoryRouter>`. Canonical paths are full-URL shaped so a future move
 *   to `<BrowserRouter>` only changes the router shell, not this table.
 *   No data loaders/actions: views keep fetching via their own hooks.
 *   `/settings` is the project-scoped ProjectSettings page; `/system-settings`
 *   is the application-level System Settings screen (the System Menu opens it
 *   in a new window by default).
 * @example <MemoryRouter initialEntries={['/docs/faq']}><AppRoutes /></MemoryRouter>
 ***/
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<OrchestratorView />} />
      {/* Legacy alias: normalise with a history REPLACE, never a push. */}
      <Route path="/orchestrator" element={<Navigate to="/" replace />} />
      <Route path="/explorer" element={<ProjectExplorer />} />
      <Route path="/settings" element={<ProjectSettings />} />
      <Route path="/system-settings" element={<SystemSettingsPage />} />
      <Route path="/system-settings/:section" element={<SystemSettingsPage />} />
      <Route path="/observability" element={<ObservabilityDashboard />} />
      <Route path="/docs" element={<DocsView />} />
      <Route path="/docs/:slug" element={<DocsView />} />
      <Route path="/tasks/:id" element={<TaskDetailPage />} />
      <Route path="/tasks/:id/review" element={<TaskReviewPage />} />
      <Route path="/tasks/:id/survey" element={<SurveyPage />} />
      <Route path="/retrospective" element={<RetrospectivePage />} />
      {/* Legacy singular shape (`#/task/:id`) redirects to canonical. */}
      <Route path="/task/:id" element={<SingularTaskRedirect />} />
      <Route path="/task/:id/review" element={<SingularTaskRedirect />} />
      <Route path="/task/:id/survey" element={<SingularTaskRedirect />} />
      {/* Unknown locations render the default view without switching state:
          the router bridge keeps the current view on unmatched paths. */}
      <Route path="*" element={<OrchestratorView />} />
    </Routes>
  );
}

/***
 * MARK: SingularTaskRedirect
 * @description Redirects the legacy `#/task/:id` shape onto canonical
 *   `/tasks/:id` (or its `/review` child), preserving the task id.
 ***/
function SingularTaskRedirect() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const suffix = pathname.endsWith('/review')
    ? '/review'
    : pathname.endsWith('/survey')
      ? '/survey'
      : '';
  return <Navigate to={`/tasks/${id}${suffix}`} replace />;
}

export default AppRoutes;
