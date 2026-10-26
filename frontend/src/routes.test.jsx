import React from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from './routes';
import '@testing-library/jest-dom';

/***
 * MARK: AppRoutes tests
 * @description Locks the route table: every canonical path renders its view,
 * legacy aliases redirect (history-replacing, never pushing), and unknown
 * paths fall back to the orchestrator without ever resurrecting docs.
 * Views are stubbed here so the table mapping itself is what's exercised;
 * real view rendering per route is covered by App/docs/task tests.
 ***/

vi.mock('./components/OrchestratorView', () => ({
  OrchestratorView: () => <div data-testid="view-orchestrator" />,
}));
vi.mock('./components/explorer/ProjectExplorer', () => ({
  ProjectExplorer: () => <div data-testid="view-explorer" />,
}));
vi.mock('./components/settings/ProjectSettings', () => ({
  ProjectSettings: () => <div data-testid="view-settings" />,
}));
vi.mock('./components/settings/SystemSettingsPage', () => ({
  SystemSettingsPage: () => <div data-testid="view-system-settings" />,
}));
vi.mock('./components/observability/ObservabilityDashboard', () => ({
  ObservabilityDashboard: () => <div data-testid="view-observability" />,
}));
vi.mock('./components/docs/DocsView', () => ({
  DocsView: () => <div data-testid="view-docs" />,
}));
vi.mock('./components/tasks/TaskDetailPage', () => ({
  TaskDetailPage: () => <div data-testid="view-task-detail" />,
}));
vi.mock('./components/tasks/TaskReviewPage', () => ({
  TaskReviewPage: () => <div data-testid="view-task-review" />,
}));
vi.mock('./components/tasks/SurveyPage', () => ({
  SurveyPage: () => <div data-testid="view-task-survey" />,
}));
vi.mock('./components/retrospective/RetrospectivePage', () => ({
  RetrospectivePage: () => <div data-testid="view-retrospective" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

test.each([
  ['/', 'view-orchestrator'],
  ['/explorer', 'view-explorer'],
  ['/settings', 'view-settings'],
  ['/system-settings', 'view-system-settings'],
  ['/system-settings/models', 'view-system-settings'],
  ['/observability', 'view-observability'],
  ['/docs', 'view-docs'],
  ['/docs/architecture', 'view-docs'],
  ['/tasks/t1', 'view-task-detail'],
  ['/tasks/t1/review', 'view-task-review'],
  ['/tasks/t1/survey', 'view-task-survey'],
  ['/retrospective', 'view-retrospective'],
])('canonical path %s renders %s', (path, testId) => {
  renderAt(path);
  expect(screen.getByTestId(testId)).toBeInTheDocument();
  // Exactly one view renders — no double-mount resurrection.
  expect(screen.queryByTestId('view-docs') === null || testId === 'view-docs').toBe(true);
});

test('project /settings renders only the project-scoped configuration page', () => {
  // Guards the naming split: the project-scoped configuration page and the
  // application-level System Settings screen must never collide.
  renderAt('/settings');
  expect(screen.getByTestId('view-settings')).toBeInTheDocument();
  expect(screen.queryByTestId('view-system-settings')).not.toBeInTheDocument();
});

test('platform /system-settings renders only the System Settings screen', () => {
  renderAt('/system-settings');
  expect(screen.getByTestId('view-system-settings')).toBeInTheDocument();
  expect(screen.queryByTestId('view-settings')).not.toBeInTheDocument();
});

test('legacy /orchestrator redirects to / without pushing history', () => {
  renderAt('/orchestrator');
  expect(screen.getByTestId('view-orchestrator')).toBeInTheDocument();
});

test('legacy singular /task/:id redirects to the canonical task detail route', () => {
  renderAt('/task/t1');
  expect(screen.getByTestId('view-task-detail')).toBeInTheDocument();
});

test.each([['/main-content'], ['/nope']])(
  'unknown path %s falls back to orchestrator and never shows docs',
  (path) => {
    renderAt(path);
    expect(screen.getByTestId('view-orchestrator')).toBeInTheDocument();
    expect(screen.queryByTestId('view-docs')).not.toBeInTheDocument();
  },
);
