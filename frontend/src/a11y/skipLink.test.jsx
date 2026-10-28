// Skip-link unit gate (WCAG 2.4.1 Bypass Blocks, 2.4.3 Focus Order, 2.4.7
// Focus Visible).
//
// The canary suite already asserts the skip link is reachable and visible on
// focus at the E2E level. This file pins the same contract at the unit level
// for faster feedback: the skip link must be (a) the FIRST focusable element
// in the document (so the first Tab stop lands on it), (b) hidden until
// focused (sr-only, becoming visible via focus:not-sr-only), and (c) wired
// to move focus to #main-content without touching the URL hash (the router
// owns the hash — a #main-content fragment would become an unknown route).
//
// Rendered in happy-dom via Testing Library.

import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../components/App';
import '@testing-library/jest-dom';

// Mock the API service so tests don't hit a live backend (same mock shape as
// App.test.jsx — kept minimal: only what App + OrchestratorView need to
// render the shell).
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  const projects = [{ id: 'proj-1', name: 'Project A', stages: [] }];
  const stages = [
    { id: '1', name: 'Idea', type: 'agent', prompt: '', paused: false, failback: 'start' },
  ];
  return {
    ...actual,
    api: {
      API_BASE: 'http://localhost:3000',
      listProjects: vi.fn().mockResolvedValue(projects),
      createProject: vi.fn().mockResolvedValue({ id: 'proj-3', name: 'New', stages: [] }),
      activateProject: vi.fn().mockResolvedValue({ status: 'activated' }),
      getWorkflow: vi.fn().mockResolvedValue({ stages, currentStageId: '1' }),
      updateWorkflow: vi.fn().mockResolvedValue({ stages }),
      jumpToStage: vi.fn().mockResolvedValue({ currentStageId: '1' }),
      skipStage: vi.fn().mockResolvedValue({ currentStageId: '1' }),
      observabilityStatus: vi.fn().mockResolvedValue({ status: 'ok', observability: {} }),
      computeStatus: vi.fn().mockResolvedValue({ running: false }),
      computeStart: vi.fn().mockResolvedValue({ running: true }),
      computeStop: vi.fn().mockResolvedValue({ running: false }),
      getModels: vi.fn().mockResolvedValue({ models: [] }),
      listTasks: vi.fn().mockResolvedValue([]),
      createTask: vi.fn().mockResolvedValue({ id: 't1', title: 'Task 1' }),
      deleteTask: vi.fn().mockResolvedValue({}),
      getTask: vi
        .fn()
        .mockResolvedValue({ id: 't1', title: 'T', goal: 'T', history: [], reports: [] }),
      getTaskReports: vi.fn().mockResolvedValue({ taskId: 't1', reports: [] }),
      submitTask: vi.fn().mockResolvedValue({ status: 'prompted' }),
      getTaskLogs: vi.fn().mockResolvedValue({ logs: [] }),
      getProjectSkills: vi.fn().mockResolvedValue({ skills: [] }),
      listAgents: vi.fn().mockResolvedValue({ agents: [] }),
      getProjectConfig: vi.fn().mockResolvedValue({}),
      saveProjectConfig: vi.fn().mockResolvedValue({}),
    },
  };
});

// Mock WebSocket so the app doesn't try to connect.
vi.mock('../services/websocket', () => ({
  connectWebSocket: vi.fn(),
  disconnectWebSocket: vi.fn(),
  onMessage: vi.fn(),
  offMessage: vi.fn(),
}));

beforeEach(() => {
  window.location.hash = '';
});

test('skip link is the first focusable element in the document (WCAG 2.4.1/2.4.3)', async () => {
  render(<App />);
  await screen.findByText('Orchestrator');

  // Collect every focusable element in DOM order.
  const focusable = document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  expect(focusable.length).toBeGreaterThan(0);
  const first = focusable[0];
  expect(first.textContent).toContain('Skip to main content');
  expect(first.getAttribute('href')).toBe('#main-content');
});

test('skip link is sr-only until focused, then becomes visible (WCAG 2.4.1/2.4.7)', async () => {
  render(<App />);
  await screen.findByText('Orchestrator');

  const skip = screen.getByText('Skip to main content');
  // sr-only class present (visually hidden until focus).
  expect(skip.className).toContain('sr-only');
  // focus:not-sr-only — becomes visible on focus.
  expect(skip.className).toContain('focus:not-sr-only');
});

test('activating the skip link moves focus to #main-content without touching the hash (WCAG 2.4.1)', async () => {
  render(<App />);
  await screen.findByText('Orchestrator');

  const hashBefore = window.location.hash;
  fireEvent.click(screen.getByText('Skip to main content'));
  // The router owns the hash: activation must not create an unknown route.
  expect(window.location.hash).toBe(hashBefore);
  // Focus moves to the main content landmark.
  expect(document.querySelector('#main-content')).toHaveFocus();
});

test('#main-content is a focusable main landmark (WCAG 1.3.1/2.4.1)', async () => {
  render(<App />);
  await screen.findByText('Orchestrator');

  const main = document.querySelector('#main-content');
  expect(main).not.toBeNull();
  expect(main.tagName).toBe('MAIN');
  // tabIndex={-1} makes it programmatically focusable (skip-link target).
  expect(main.getAttribute('tabindex')).toBe('-1');
});
