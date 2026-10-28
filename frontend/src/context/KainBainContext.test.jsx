import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { MemoryRouter, useNavigate } from 'react-router';
import { KainBainProvider, KainBainRouteBridge, useKainBain } from './KainBainContext';

vi.mock('../services/api', () => ({
  api: {
    listProjects: vi.fn(),
    activateProject: vi.fn(),
    createProject: vi.fn(),
    healthStatus: vi.fn(),
    computeStatus: vi.fn(),
    listTasks: vi.fn(),
    getTask: vi.fn().mockResolvedValue(null),
    getWorkflow: vi.fn(),
    getWorkflows: vi.fn(),
    sessionHistory: vi.fn(),
    engineStatus: vi.fn(),
    systemStatus: vi.fn(),
  },
  wsUrl: vi.fn(() => 'ws://localhost/ws?projectId=p1'),
}));

vi.mock('../services/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { api } from '../services/api';

/**
 * MARK: KainBainContext accent tests
 * @description Verifies that the per-project accent CSS variables are applied to
 * the root element from the active project's `accentColor`, and that switching
 * the active project re-tints the root. This is Phase 6.5 of the accent theme
 * task. The accent effect keys on `[projects.activeProjectId, projects.projects]`.
 ***/

const mockInstances = [];

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    this.closed = false;
    mockInstances.push(this);
  }
  static reset() {
    mockInstances.length = 0;
  }
  send() {}
  close() {
    this.closed = true;
    if (this.onclose) this.onclose();
  }
}

// Minimal harness: render the provider and read the root CSS variables after the
// accent effect runs.
function Harness() {
  const ctx = useKainBain();
  return (
    <div data-testid="harness">
      <span data-testid="active">{ctx.activeProject?.accentColor || ''}</span>
      <button data-testid="switch" type="button" onClick={() => ctx.selectProject('p2')}>
        switch
      </button>
    </div>
  );
}

async function flushEffects() {
  // Wait for async init + data loads triggered by the provider's mount effects.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('KainBainContext accent theming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.reset();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    // Remove any accent vars set by a previous test run.
    const root = document.documentElement;
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-on');
    root.style.removeProperty('--accent-glow');
    root.style.removeProperty('--accent-hex');

    vi.stubGlobal('WebSocket', MockWebSocket);

    api.listProjects.mockResolvedValue([
      { id: 'p1', name: 'A', accentColor: '#38bdf8' },
      { id: 'p2', name: 'B', accentColor: '#fbbf24' },
    ]);
    api.listTasks.mockResolvedValue([]);
    api.getWorkflow.mockResolvedValue({ stages: [] });
    api.getWorkflows.mockResolvedValue([]);
    api.sessionHistory.mockResolvedValue({ messages: [] });
    api.engineStatus.mockResolvedValue({});
    api.healthStatus.mockResolvedValue({});
    api.computeStatus.mockResolvedValue({ running: false });
    api.activateProject.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the active project accent CSS variables to the root', async () => {
    render(
      <KainBainProvider>
        <Harness />
      </KainBainProvider>,
    );
    await flushEffects();

    const root = document.documentElement;
    // #38bdf8 => 56 189 248
    expect(root.style.getPropertyValue('--accent')).toBe('56 189 248');
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#38bdf8');
    // Light cyan -> black text-on.
    expect(root.style.getPropertyValue('--accent-on')).toBe('0 0 0');
    expect(root.style.getPropertyValue('--accent-glow')).toBe('56 189 248 / 0.2');
  });

  it('re-tints the root when switching to a different active project', async () => {
    render(
      <KainBainProvider>
        <Harness />
      </KainBainProvider>,
    );
    await flushEffects();

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#38bdf8');

    await act(async () => {
      document.querySelector('[data-testid="switch"]').click();
      await Promise.resolve();
    });
    await flushEffects();

    // #fbbf24 => 251 191 36
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#fbbf24');
    expect(root.style.getPropertyValue('--accent')).toBe('251 191 36');
  });

  it('falls back to the default accent when the active project has none', async () => {
    api.listProjects.mockResolvedValue([
      { id: 'p1', name: 'A' }, // no accentColor
    ]);

    render(
      <KainBainProvider>
        <Harness />
      </KainBainProvider>,
    );
    await flushEffects();

    const root = document.documentElement;
    // Default emerald #7bdb85 => 123 219 133
    expect(root.style.getPropertyValue('--accent-hex')).toBe('#7bdb85');
    expect(root.style.getPropertyValue('--accent')).toBe('123 219 133');
  });
});

/**
 * MARK: KainBainContext live board sync tests
 * @description Verifies the WebSocket TASK_UPDATED merge path: an unknown task
 *   (created elsewhere) appears on the board instantly, a known one is replaced
 *   in place, cross-project payloads are ignored, and the inspector's selected
 *   task derives from the freshest board snapshot so it never goes stale.
 */
describe('KainBainContext live board sync', () => {
  let ctxRef;
  let routerNav;

  const compactDetail = {
    id: 'detail-task',
    title: 'Compact',
    reports: [{ path: 'plan.md', stageName: 'Plan' }],
  };
  const fullDetail = {
    ...compactDetail,
    history: [{ action: 'Created' }],
    timeline: [{ stageId: 'plan', duration: 12 }],
    prompt: 'Full prompt',
    logEntries: [{ message: 'Full log' }],
    reports: [{ ...compactDetail.reports[0], content: 'Full report' }],
  };

  // Router-backed navigation: MemoryRouter isolates URLs per test, and the
  // bridge syncs every entry into view state + inspector task — the same
  // wiring the real app gets from HashRouter.
  function navigate(to) {
    act(() => {
      routerNav.current(to);
    });
  }

  function RouterCapture() {
    const nav = useNavigate();
    useEffect(() => {
      routerNav.current = nav;
    });
    return null;
  }

  function renderProvider(initialEntries = ['/']) {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <KainBainProvider>
          <CaptureContext />
          <RouterCapture />
          <KainBainRouteBridge />
        </KainBainProvider>
      </MemoryRouter>,
    );
  }

  function expectHydratedDetail() {
    for (const key of ['history', 'timeline', 'prompt', 'logEntries', 'reports']) {
      expect(ctxRef.current.selectedTask[key]).toEqual(fullDetail[key]);
    }
  }

  function CaptureContext() {
    const ctx = useKainBain();
    // Effects flush inside every act() call, so ctxRef.current is fresh by the
    // time assertions run after an act.
    useEffect(() => {
      ctxRef.current = ctx;
    });
    return null;
  }

  function dispatchWs(instance, message) {
    act(() => {
      instance.onmessage({ data: JSON.stringify(message) });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    MockWebSocket.reset();
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    vi.stubGlobal('WebSocket', MockWebSocket);

    ctxRef = { current: null };
    routerNav = { current: null };
    api.getTask.mockReset().mockResolvedValue(null);
    api.listTasks.mockReset().mockResolvedValue([]);
    api.listProjects.mockResolvedValue([{ id: 'p1', name: 'A' }]);

    api.getWorkflow.mockResolvedValue({ stages: [] });
    api.getWorkflows.mockResolvedValue([]);
    api.sessionHistory.mockResolvedValue({ messages: [] });
    api.engineStatus.mockResolvedValue({});
    api.healthStatus.mockResolvedValue({});
    api.computeStatus.mockResolvedValue({ running: false });
    api.activateProject.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(['/tasks/detail-task', '/task/detail-task/review', '/tasks/detail-task/review'])(
    'retains early hydration when the initial board loads after deep link %s',
    async (entry) => {
      let finishBoard;
      api.listTasks.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishBoard = resolve;
          }),
      );
      api.getTask.mockResolvedValue(fullDetail);
      renderProvider([entry]);
      await flushEffects();
      expectHydratedDetail();
      await act(async () => finishBoard([compactDetail]));
      expectHydratedDetail();
      expect(ctxRef.current.tasks).toEqual([compactDetail]);
      expect(api.getTask).toHaveBeenCalledTimes(1);
    },
  );

  it('hydrates an initial deep link when detail arrives after the compact board', async () => {
    let finishDetail;
    api.listTasks.mockResolvedValue([compactDetail]);
    api.getTask.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDetail = resolve;
        }),
    );
    renderProvider(['/tasks/detail-task']);
    await flushEffects();
    expect(ctxRef.current.selectedTask.history).toBeUndefined();
    await act(async () => finishDetail(fullDetail));
    expectHydratedDetail();
  });

  it('retains URL-selected detail through compact WebSocket updates and list refreshes', async () => {
    api.listTasks.mockResolvedValue([compactDetail]);
    api.getTask.mockResolvedValue(fullDetail);
    renderProvider();
    await flushEffects();
    navigate('/tasks/detail-task');
    await flushEffects();
    expectHydratedDetail();
    dispatchWs(mockInstances.at(-1), {
      type: 'TASK_UPDATED',
      payload: { ...compactDetail, status: 'running_agent', projectId: 'p1' },
    });
    expect(ctxRef.current.selectedTask.status).toBe('running_agent');
    expectHydratedDetail();
    const refreshed = { ...compactDetail, status: 'completed', title: 'Updated title' };
    api.listTasks.mockResolvedValue([refreshed]);
    await act(async () => ctxRef.current.refreshTasks('p1'));
    expect(ctxRef.current.selectedTask.status).toBe('completed');
    expect(ctxRef.current.selectedTask.title).toBe('Updated title');
    expectHydratedDetail();
    // A temporary missing board row must not discard the detail either.
    api.listTasks.mockResolvedValue([]);
    await act(async () => ctxRef.current.refreshTasks('p1'));
    expectHydratedDetail();
    expect(api.getTask).toHaveBeenCalledTimes(1);
  });

  it('retains detail on same-task detail/review navigation and browser history events', async () => {
    api.listTasks.mockResolvedValue([compactDetail]);
    api.getTask.mockResolvedValue(fullDetail);
    renderProvider();
    await flushEffects();
    navigate('/tasks/detail-task');
    await flushEffects();
    expectHydratedDetail();
    navigate('/tasks/detail-task/review');
    expect(ctxRef.current.view).toBe('task-review');
    expectHydratedDetail();
    navigate(-1);
    expect(ctxRef.current.view).toBe('task-detail');
    expectHydratedDetail();
    act(() => ctxRef.current.setSelectedTask(compactDetail));
    expectHydratedDetail();
    expect(api.getTask).toHaveBeenCalledTimes(1);
    navigate('/');
    expect(ctxRef.current.selectedTask).toBeNull();
  });

  it('clears old detail on a different task URL and ignores its late response after closing', async () => {
    let finishSecond;
    api.listTasks.mockResolvedValue([compactDetail, { id: 'second' }]);
    api.getTask.mockResolvedValueOnce(fullDetail).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
    );
    renderProvider();
    await flushEffects();
    navigate('/tasks/detail-task');
    await flushEffects();
    expectHydratedDetail();
    navigate('/tasks/second');
    expect(ctxRef.current.selectedTask).toEqual({ id: 'second' });
    navigate('/');
    await act(async () => finishSecond({ id: 'second', history: [{ action: 'Late' }] }));
    expect(ctxRef.current.selectedTask).toBeNull();
  });

  it('does not carry hydrated fields into another project with the same task id', async () => {
    let finishNew;
    api.listProjects.mockResolvedValue([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]);
    api.listTasks.mockResolvedValue([compactDetail]);
    api.getTask.mockResolvedValueOnce(fullDetail).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishNew = resolve;
        }),
    );
    renderProvider();
    await flushEffects();
    navigate('/tasks/detail-task');
    await flushEffects();
    expectHydratedDetail();
    await act(async () => ctxRef.current.selectProject('p2'));
    expect(ctxRef.current.selectedTask.history).toBeUndefined();
    expect(ctxRef.current.selectedTask.reports?.[0]?.content).toBeUndefined();
    await act(async () => finishNew({ id: 'detail-task', history: [{ action: 'New project' }] }));
    expect(ctxRef.current.selectedTask.history).toEqual([{ action: 'New project' }]);
    expect(api.getTask).toHaveBeenLastCalledWith('p2', 'detail-task');
  });

  it('ignores a late hydration response from the previous project for the same task id', async () => {
    let finishOld;
    api.listProjects.mockResolvedValue([
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ]);
    api.listTasks.mockResolvedValue([compactDetail]);
    api.getTask
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce({ id: 'detail-task', history: [{ action: 'New project' }] });
    renderProvider();
    await flushEffects();
    navigate('/tasks/detail-task');
    await act(async () => ctxRef.current.selectProject('p2'));
    await act(async () => finishOld(fullDetail));
    expect(ctxRef.current.selectedTask.history).toEqual([{ action: 'New project' }]);
    expect(ctxRef.current.selectedTask.reports?.[0]?.content).toBeUndefined();
  });

  it('navigates to the docs view on docs routes and back via history', async () => {
    api.listTasks.mockResolvedValue([]);
    renderProvider();
    await flushEffects();
    navigate('/docs/architecture');
    expect(ctxRef.current.view).toBe('docs');
    navigate('/docs');
    expect(ctxRef.current.view).toBe('docs');
    navigate('/');
    expect(ctxRef.current.view).toBe('orchestrator');
    // Back lands on docs with the same slug; forward returns with no resurrection.
    navigate(-1);
    expect(ctxRef.current.view).toBe('docs');
    navigate(1);
    expect(ctxRef.current.view).toBe('orchestrator');
  });

  it('boots into the docs view from a docs deep link and defaults to orchestrator', async () => {
    api.listTasks.mockResolvedValue([]);
    const first = renderProvider(['/docs/faq']);
    await flushEffects();
    expect(ctxRef.current.view).toBe('docs');
    first.unmount();
    // Legacy `?view=docs` entries are normalised to `#/docs` before the
    // router boots (see routing.test.js); a plain boot lands on orchestrator.
    renderProvider(['/']);
    await flushEffects();
    expect(ctxRef.current.view).toBe('orchestrator');
  });

  it('merges a TASK_UPDATED payload for an unknown task into the board instantly', async () => {
    ctxRef = { current: null };
    render(
      <KainBainProvider>
        <CaptureContext />
      </KainBainProvider>,
    );
    await flushEffects();

    const wsInstance = mockInstances.at(-1);
    const payload = { id: 'task-ws', title: 'From WS', projectId: 'p1' };
    dispatchWs(wsInstance, { type: 'TASK_UPDATED', payload });

    expect(ctxRef.current.tasks.some((t) => t.id === 'task-ws')).toBe(true);
  });

  it('replaces a known task in place on TASK_UPDATED without duplicating it', async () => {
    ctxRef = { current: null };
    render(
      <KainBainProvider>
        <CaptureContext />
      </KainBainProvider>,
    );
    await flushEffects();

    const wsInstance = mockInstances.at(-1);
    dispatchWs(wsInstance, {
      type: 'TASK_UPDATED',
      payload: { id: 'task-ws', title: 'From WS', projectId: 'p1' },
    });
    dispatchWs(wsInstance, {
      type: 'TASK_UPDATED',
      payload: { id: 'task-ws', title: 'From WS', projectId: 'p1', currentStageId: '3' },
    });

    const board = ctxRef.current.tasks.filter((t) => t.id === 'task-ws');
    expect(board).toHaveLength(1);
    expect(board[0].currentStageId).toBe('3');
  });

  it('ignores TASK_UPDATED payloads for a different project', async () => {
    ctxRef = { current: null };
    render(
      <KainBainProvider>
        <CaptureContext />
      </KainBainProvider>,
    );
    await flushEffects();

    const wsInstance = mockInstances.at(-1);
    dispatchWs(wsInstance, {
      type: 'TASK_UPDATED',
      payload: { id: 'task-other', title: 'Other project', projectId: 'p-other' },
    });

    expect(ctxRef.current.tasks.some((t) => t.id === 'task-other')).toBe(false);
  });

  it('keeps the selected inspector task synced with the freshest board snapshot', async () => {
    ctxRef = { current: null };
    render(
      <KainBainProvider>
        <CaptureContext />
      </KainBainProvider>,
    );
    await flushEffects();

    // Inspector opens with the creation-time snapshot (e.g. from the POST
    // response): no status yet.
    act(() => {
      ctxRef.current.setSelectedTask({ id: 'task-ws', title: 'From WS' });
    });
    expect(ctxRef.current.selectedTask.status).toBeUndefined();

    // The agent picks the task up; the board learns it via the live merge.
    const wsInstance = mockInstances.at(-1);
    dispatchWs(wsInstance, {
      type: 'TASK_UPDATED',
      payload: {
        id: 'task-ws',
        title: 'From WS',
        projectId: 'p1',
        status: 'running_agent',
      },
    });

    // Same id => derived selection now carries the fresh status without the
    // inspector's local edits being reset.
    expect(ctxRef.current.selectedTask.status).toBe('running_agent');
  });

  it('hydrates compact board selections without losing detail to fresh board metadata', async () => {
    const compact = { id: 'detail-task', title: 'Compact', reports: [{ stageName: 'Plan' }] };
    const full = {
      ...compact,
      history: [{ action: 'Created' }],
      reports: [{ stageName: 'Plan', content: 'Full report' }],
    };
    api.listTasks.mockResolvedValue([compact]);
    api.getTask.mockResolvedValueOnce(full);
    ctxRef = { current: null };
    renderProvider();
    await flushEffects();
    act(() => ctxRef.current.setSelectedTask(compact));
    await flushEffects();
    expect(api.getTask).toHaveBeenCalledWith('p1', 'detail-task');
    expect(ctxRef.current.selectedTask.history).toEqual(full.history);
    expect(ctxRef.current.selectedTask.reports).toEqual(full.reports);
    expect(ctxRef.current.tasks[0]).toEqual(compact);
    dispatchWs(mockInstances.at(-1), {
      type: 'TASK_UPDATED',
      payload: { ...compact, status: 'running_agent', projectId: 'p1' },
    });
    expect(ctxRef.current.selectedTask.status).toBe('running_agent');
    expect(ctxRef.current.selectedTask.reports).toEqual(full.reports);
  });

  it('ignores late detail responses after selecting another task', async () => {
    let finishFirst;
    api.getTask.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    );
    api.getTask.mockResolvedValueOnce({ id: 'second', history: [] });
    ctxRef = { current: null };
    renderProvider();
    await flushEffects();
    act(() => ctxRef.current.setSelectedTask({ id: 'first' }));
    act(() => ctxRef.current.setSelectedTask({ id: 'second' }));
    await flushEffects();
    await act(async () => finishFirst({ id: 'first', history: [{ action: 'Old' }] }));
    expect(ctxRef.current.selectedTask).toEqual({ id: 'second', history: [] });
  });

  it('pauses health polling when tab is hidden and refreshes on visibility return', async () => {
    ctxRef = { current: null };
    render(
      <KainBainProvider>
        <CaptureContext />
      </KainBainProvider>,
    );
    await flushEffects();

    expect(api.healthStatus).toHaveBeenCalledTimes(1);

    // Simulate tab hidden
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.healthStatus).toHaveBeenCalledTimes(1);

    // Simulate tab visible again
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.healthStatus).toHaveBeenCalledTimes(2);
  });

  it('hydrates a slim selected task with its full record in the background', async () => {
    api.getTask.mockResolvedValue({
      id: 'task-ws',
      title: 'From WS',
      history: [{ action: 'created' }],
    });
    ctxRef = { current: null };
    render(
      <KainBainProvider>
        <CaptureContext />
      </KainBainProvider>,
    );
    await flushEffects();

    act(() => {
      ctxRef.current.setSelectedTask({ id: 'task-ws', title: 'From WS' });
    });
    expect(ctxRef.current.selectedTask.history).toBeUndefined();

    await act(async () => {
      await vi.waitFor(() => expect(api.getTask).toHaveBeenCalledWith('p1', 'task-ws'));
      await Promise.resolve();
    });
    expect(ctxRef.current.selectedTask.history).toEqual([{ action: 'created' }]);
  });
});
