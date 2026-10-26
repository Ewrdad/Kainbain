import React, { useEffect } from 'react';
import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { KainBainProvider, KainBainRouteBridge, useKainBain } from '../../context/KainBainContext';
import { api } from '../../services/api';
import '@testing-library/jest-dom';

/***
 * MARK: DocsNavigation tests
 * @description Regression lock for "docs keeps reopening itself": leaving
 * Docs (any exit path) IS a navigation, so the docs location cannot survive
 * it — refresh re-opens the CURRENT route, back/forward traverse real
 * history, and unknown locations never switch the view.
 ***/

vi.mock('../../services/api', () => ({
  api: {
    listProjects: vi.fn(),
    activateProject: vi.fn(),
    healthStatus: vi.fn(),
    computeStatus: vi.fn(),
    listTasks: vi.fn(),
    getTask: vi.fn().mockResolvedValue(null),
    getWorkflow: vi.fn(),
    getWorkflows: vi.fn(),
    sessionHistory: vi.fn(),
    engineStatus: vi.fn(),
    systemStatus: vi.fn(),
    docsIndex: vi.fn(),
    docsArticle: vi.fn(),
  },
  wsUrl: vi.fn(() => 'ws://localhost/ws?projectId=p1'),
}));

vi.mock('../../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

class MockWebSocket {
  constructor() {
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  send() {}
  close() {}
}
vi.stubGlobal('WebSocket', MockWebSocket);

const INDEX = {
  sections: ['how-it-works', 'working-with'],
  docs: [
    { slug: 'architecture', title: 'System Architecture', section: 'how-it-works', order: 10 },
    { slug: 'install-run', title: 'Install & Run', section: 'working-with', order: 10 },
  ],
};

let ctxRef;
let navRef;
let pathRef;

function Capture() {
  const ctx = useKainBain();
  useEffect(() => {
    ctxRef.current = ctx;
  });
  return null;
}

function RouterProbes() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    navRef.current = navigate;
    pathRef.current = location.pathname;
  });
  return null;
}

function ViewProbe() {
  const { view } = useKainBain();
  return <div data-testid={`probe-${view}`} />;
}

function renderShell(initialEntries) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <KainBainProvider>
        <KainBainRouteBridge />
        <Capture />
        <RouterProbes />
        <ViewProbe />
      </KainBainProvider>
    </MemoryRouter>,
  );
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  ctxRef = { current: null };
  navRef = { current: null };
  pathRef = { current: null };
  api.listProjects.mockResolvedValue([{ id: 'p1', name: 'A' }]);
  api.listTasks.mockResolvedValue([]);
  api.getWorkflow.mockResolvedValue({ stages: [] });
  api.getWorkflows.mockResolvedValue([]);
  api.sessionHistory.mockResolvedValue({ messages: [] });
  api.engineStatus.mockResolvedValue({});
  api.healthStatus.mockResolvedValue({});
  api.computeStatus.mockResolvedValue({ running: false });
  api.activateProject.mockResolvedValue({});
  api.docsIndex.mockResolvedValue(INDEX);
  api.docsArticle.mockImplementation(async (slug) => `# ${slug}\n\nBody.`);
});

test('leaving docs navigates away: no /docs remnant in the location', async () => {
  renderShell(['/docs/architecture']);
  await flush();
  expect(ctxRef.current.view).toBe('docs');
  expect(pathRef.current).toBe('/docs/architecture');

  // Every exit path goes through the setView facade (tabs, shortcuts, menu).
  for (const exit of ['orchestrator', 'explorer', 'settings', 'observability']) {
    act(() => {
      navRef.current('/docs/architecture');
    });
    await flush();
    expect(ctxRef.current.view).toBe('docs');
    act(() => {
      ctxRef.current.setView(exit);
    });
    await flush();
    expect(ctxRef.current.view).toBe(exit);
    expect(pathRef.current).not.toContain('/docs');
  }
});

test('refresh after leaving docs stays away (reload boots the current route)', async () => {
  const first = renderShell(['/docs/architecture']);
  await flush();
  act(() => {
    ctxRef.current.setView('orchestrator');
  });
  await flush();
  expect(pathRef.current).toBe('/');
  const landedPath = pathRef.current;
  first.unmount();

  // Simulate a full reload at the post-navigation URL.
  renderShell([landedPath]);
  await flush();
  expect(pathRef.current).toBe('/');
  expect(ctxRef.current.view).not.toBe('docs');
  expect(ctxRef.current.view).toBe('orchestrator');
  expect(screen.getByTestId('probe-orchestrator')).toBeInTheDocument();
});

test('back/forward around docs is symmetric with no resurrection', async () => {
  renderShell(['/docs/architecture']);
  await flush();
  expect(ctxRef.current.view).toBe('docs');

  act(() => {
    ctxRef.current.setView('orchestrator');
  });
  await flush();
  expect(pathRef.current).toBe('/');

  act(() => {
    navRef.current(-1);
  });
  await flush();
  expect(pathRef.current).toBe('/docs/architecture');
  expect(ctxRef.current.view).toBe('docs');

  act(() => {
    navRef.current(1);
  });
  await flush();
  expect(pathRef.current).toBe('/');
  expect(ctxRef.current.view).toBe('orchestrator');
});

test('unknown location keeps the current view', async () => {
  renderShell(['/']);
  await flush();
  expect(ctxRef.current.view).toBe('orchestrator');
  act(() => {
    navRef.current('/main-content');
  });
  await flush();
  expect(ctxRef.current.view).toBe('orchestrator');
});
