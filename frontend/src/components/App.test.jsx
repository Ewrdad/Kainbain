import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';
import '@testing-library/jest-dom';

/**
 * MARK: App render tests
 * @description Verifies the App renders the orchestrator cockpit, tab
 * navigation, project selector, and stage-type discrimination.
 */

// Mock the API service so tests don't hit a live backend.
vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal();
  const projects = [
    { id: 'proj-1', name: 'Project A', stages: [] },
    { id: 'proj-2', name: 'Project B', stages: [] },
  ];
  const stages = [
    { id: '1', name: 'Idea', type: 'agent', prompt: '', paused: false, failback: 'start' },
    { id: '2', name: 'Review', type: 'human', prompt: '', paused: false, failback: 'previous' },
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
      jumpToStage: vi.fn().mockResolvedValue({ currentStageId: '2' }),
      skipStage: vi.fn().mockResolvedValue({ currentStageId: '2' }),
      observabilityStatus: vi.fn().mockResolvedValue({ status: 'ok', observability: {} }),
      computeStatus: vi.fn().mockResolvedValue({ running: false }),
      computeStart: vi.fn().mockResolvedValue({ running: true }),
      computeStop: vi.fn().mockResolvedValue({ running: false }),
      getModels: vi.fn().mockResolvedValue({ models: [] }),
      listTasks: vi
        .fn()
        .mockResolvedValue([
          { id: 't1', title: 'Task 1', goal: 'Task 1', currentStageId: '1', status: 'in_stage' },
        ]),
      createTask: vi.fn().mockResolvedValue({ id: 't1', title: 'Task 1' }),
      deleteTask: vi.fn().mockResolvedValue({}),
      getTask: vi
        .fn()
        .mockResolvedValue({ id: 't1', title: 'Task 1', goal: 'Task 1', history: [], reports: [] }),
      getTaskReports: vi.fn().mockResolvedValue({ taskId: 't1', reports: [] }),
      submitTask: vi.fn().mockResolvedValue({ status: 'prompted' }),
      executeTaskStage: vi.fn().mockResolvedValue({}),
      listWorkflows: vi.fn().mockResolvedValue([]),
      startWorkflow: vi.fn().mockResolvedValue({}),
      updateProject: vi.fn().mockResolvedValue({}),
      docsIndex: vi.fn().mockResolvedValue({
        sections: ['how-it-works', 'working-with'],
        docs: [
          {
            slug: 'architecture',
            title: 'System Architecture',
            section: 'how-it-works',
            order: 10,
          },
          { slug: 'install-run', title: 'Install & Run', section: 'working-with', order: 10 },
        ],
      }),
      docsArticle: vi.fn().mockResolvedValue('# Doc body'),
      getHarnesses: vi.fn().mockResolvedValue({
        harnesses: [
          {
            id: 'pi',
            name: 'pi coding agent',
            description: 'pi-backed AgentHarness.',
            capabilities: { createSession: true, listModels: true },
            modelSelection: 'list',
            modelFlag: null,
            isDefault: true,
            available: null,
            detectionSource: 'unknown',
          },
          {
            id: 'custom',
            name: 'Custom command',
            description: 'Runs a project-configured command line.',
            capabilities: { createSession: true, listModels: false },
            modelSelection: 'none',
            modelFlag: null,
            isDefault: false,
            available: null,
            detectionSource: 'unknown',
          },
        ],
      }),
      getHarnessModels: vi.fn().mockResolvedValue({ models: [] }),
      getRunners: vi.fn().mockResolvedValue([
        {
          runnerId: 'r1',
          status: 'active',
          facts: {},
          capabilities: { harnesses: [{ id: 'pi' }] },
          projectScope: null,
          paused: false,
          lastSeenAt: null,
          operatorConfig: {
            displayName: null,
            availableTools: null,
            jobTypes: { runsCi: true, runsMerges: true, runsImpromptu: true },
            directories: { masterDir: '', worktreeDir: '' },
            projectScope: null,
          },
        },
      ]),
      getRunnerMonitor: vi.fn().mockResolvedValue({ liveAssignments: [] }),
    },
    wsUrl: vi.fn(() => 'ws://localhost:3000/ws?projectId=proj-1'),
  };
});

// Mock WebSocket so the provider can connect without a real server.
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
  send() {}
}
vi.stubGlobal('WebSocket', MockWebSocket);

beforeEach(() => {
  vi.clearAllMocks();
  // Each test boots a fresh App on a real HashRouter: reset the shared jsdom
  // URL so one test's navigations can never leak into the next test's boot.
  window.location.hash = '';
});

test('renders the KainBain orchestrator dashboard', async () => {
  render(<App />);
  expect(screen.getByText(/KAINBAIN/i)).toBeInTheDocument();
  // Tab navigation is present
  expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  expect(screen.getByText('Settings')).toBeInTheDocument();
});

test('switches to the Settings tab and renders project configuration', async () => {
  render(<App />);
  fireEvent.click(screen.getByText('Settings'));
  await waitFor(() => {
    expect(screen.getByText('Project Configuration')).toBeInTheDocument();
  });
  expect(screen.getByText('Project Details')).toBeInTheDocument();
  // Paths live on the Files & Repos tab.
  expect(screen.queryByText('Multi-Location Paths & Repositories')).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Files & Repos'));
  expect(screen.getByText('Multi-Location Paths & Repositories')).toBeInTheDocument();
});

test('project selector lists projects and switches active project', async () => {
  render(<App />);
  // Wait for the active project to be set (Project A)
  const projectButton = await screen.findByText(/Project A/i);
  fireEvent.click(projectButton);
  await waitFor(() => {
    expect(screen.getByText('Project B')).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText('Project B'));
  // The header should now show Project B
  await waitFor(() => {
    expect(screen.getByText(/Project B/i)).toBeInTheDocument();
  });
});

test('renders human and agent stage type badges in the orchestrator', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getAllByText('Idea').length).toBeGreaterThan(0);
  });
  // Stage headers render owner badges (Agent and Human)
  expect(screen.getAllByText('Agent').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Human').length).toBeGreaterThan(0);
});

test('hides the global KainBain header on the observability monitor view', async () => {
  window.location.hash = '#/observability';
  try {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
    });
    // The global app header (brand, project selector, tabs) is gone…
    // (asserted via its distinctive content: the dashboard keeps its own
    // <header>, which this toolchain also exposes as role "banner").
    expect(screen.queryByText('KAINBAIN')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open Observability Screen in Popout Window' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Project:/ })).not.toBeInTheDocument();
    // …while the monitor's own telemetry header and exit control remain.
    // Scoped to the heading: the polite a11y announcer also mentions
    // "Observability dashboard loaded.", so a bare text query matches twice.
    expect(screen.getByRole('heading', { level: 2, name: /Observability/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Exit monitor view' })).toBeInTheDocument();
  } finally {
    window.location.hash = '';
  }
});

test('shows the global KainBain header on the orchestrator view', async () => {
  window.location.hash = '';
  render(<App />);
  expect(screen.getByRole('banner')).toBeInTheDocument();
  expect(screen.getByText(/KAINBAIN/i)).toBeInTheDocument();
  expect(screen.queryByTestId('observability-dashboard')).not.toBeInTheDocument();
});

test('keyboard shortcuts keep working while the global header is hidden', async () => {
  window.location.hash = '#/observability';
  try {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('observability-dashboard')).toBeInTheDocument();
    });
    expect(screen.queryByText('KAINBAIN')).not.toBeInTheDocument();

    // Pressing "1" returns to the orchestrator and restores the header.
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => {
      expect(screen.getByText('KAINBAIN')).toBeInTheDocument();
    });
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  } finally {
    window.location.hash = '';
  }
});

test('renders full-page TaskDetailPage when URL hash contains task ID and navigates back to board', async () => {
  window.location.hash = '#/tasks/t1';
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Back to Board' })).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'Copy shareable task URL' })).toBeInTheDocument();

  // Click Back to Board
  fireEvent.click(screen.getByRole('button', { name: 'Back to Board' }));
  await waitFor(() => {
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  });
  window.location.hash = '';
});

test('opens Docs from the System Menu and renders the knowledge base', async () => {
  render(<App />);
  await screen.findByText('Orchestrator');
  // Flush any hashchange event queued by the previous test's hash reset, so a
  // stale navigation cannot flip the view back after the menu click below.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  // No Docs tab on the project tab bar: docs live in the System Menu.
  expect(screen.queryByText('Docs')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('System Menu'));
  fireEvent.click(screen.getByRole('menuitem', { name: /Docs/i }));
  await waitFor(() => {
    expect(screen.getByTestId('docs-view')).toBeInTheDocument();
  });
  // Full App boot settles many mocked stores first; allow extra time.
  expect(await screen.findByText('How KainBain works', {}, { timeout: 5000 })).toBeInTheDocument();
  expect(screen.getByText('How to work with KainBain')).toBeInTheDocument();
  // Docs keeps the global header like explorer/settings.
  expect(screen.getByRole('banner')).toBeInTheDocument();
  window.location.hash = '';
});

test('skip link moves focus without touching the route', async () => {
  window.location.hash = '';
  render(<App />);
  await screen.findByText('Orchestrator');
  const hashBefore = window.location.hash;
  fireEvent.click(screen.getByText('Skip to main content'));
  // The router owns the hash: activation must not create an unknown route…
  expect(window.location.hash).toBe(hashBefore);
  // …while focus still moves to the main content for keyboard users.
  expect(document.querySelector('#main-content')).toHaveFocus();
  // …and the view is untouched.
  expect(screen.getByText('Orchestrator')).toBeInTheDocument();
});

test('keyboard shortcut S opens the System Settings screen with the Runners tab', async () => {
  window.location.hash = '';
  // Deterministic same-tab fallback: pretend the popout was blocked, so the
  // shortcut lands on the in-app screen we can assert against.
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  try {
    render(<App />);
    await screen.findByText('Orchestrator');
    // Drain any hashchange queued by the previous test's hash reset so a stale
    // navigation cannot flip the view back after the shortcut below.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(screen.queryByTestId('system-settings-page')).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 's' });
    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeInTheDocument();
    });
    expect(
      screen.getByRole('heading', { level: 1, name: 'System Settings' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Runners' })).toBeInTheDocument();
    // The Runners tab is live: the roster renders from the registry and the
    // selected Runner shows its configuration form — the reachability proof.
    expect(await screen.findByTestId('runner-row-r1')).toBeInTheDocument();
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
  } finally {
    openSpy.mockRestore();
    window.location.hash = '';
  }
});

test('keyboard shortcut S is inert while typing in an input', async () => {
  window.location.hash = '';
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  try {
    render(<App />);
    await screen.findByText('Orchestrator');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      input.focus();
      fireEvent.keyDown(window, { key: 's' });
      // The input guard must swallow the shortcut: no screen appears.
      expect(screen.queryByTestId('system-settings-page')).not.toBeInTheDocument();
    } finally {
      document.body.removeChild(input);
    }
  } finally {
    openSpy.mockRestore();
    window.location.hash = '';
  }
});

test('system menu System Settings entry opens the settings popout in a new window', async () => {
  window.location.hash = '';
  const popout = { focus: vi.fn() };
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(popout);
  try {
    render(<App />);
    await screen.findByText('Orchestrator');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(screen.getByLabelText('System Menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /System Settings/i }));

    // New-window default: the popout is opened, and the current tab stays put.
    expect(openSpy).toHaveBeenCalledWith(
      '#/system-settings',
      'kainbain_system_settings',
      'width=1200,height=800,menubar=no,toolbar=no,location=no',
    );
    expect(screen.queryByTestId('system-settings-page')).not.toBeInTheDocument();
    expect(screen.getByText('Orchestrator')).toBeInTheDocument();
  } finally {
    openSpy.mockRestore();
    window.location.hash = '';
  }
});

test('system menu System Settings falls back to same-tab when the popout is blocked', async () => {
  window.location.hash = '';
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  try {
    render(<App />);
    await screen.findByText('Orchestrator');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.click(screen.getByLabelText('System Menu'));
    fireEvent.click(screen.getByRole('menuitem', { name: /System Settings/i }));

    await waitFor(() => {
      expect(screen.getByTestId('system-settings-page')).toBeInTheDocument();
    });
    expect(await screen.findByTestId('runner-detail-r1')).toBeInTheDocument();
  } finally {
    openSpy.mockRestore();
    window.location.hash = '';
  }
});

test('keyboard shortcut 5 opens the Docs view', async () => {
  window.location.hash = '';
  render(<App />);
  await screen.findByText('Orchestrator');
  // Drain any hashchange queued by the previous test's hash reset so a stale
  // navigation cannot flip the view back after the shortcut below.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  fireEvent.keyDown(window, { key: '5' });
  await waitFor(() => {
    expect(screen.getByTestId('docs-view')).toBeInTheDocument();
  });
  expect(await screen.findByText('How KainBain works', {}, { timeout: 5000 })).toBeInTheDocument();
  window.location.hash = '';
});

test('document title follows [Paused] Kainbain - Project - Orchestrator on boot', async () => {
  window.localStorage.clear();
  window.location.hash = '';
  render(<App />);
  await screen.findByText(/Project A/i);
  await waitFor(() => {
    expect(document.title).toBe('[Paused] Kainbain - Project A - Orchestrator');
  });
  window.location.hash = '';
});

test('document title tracks view changes without getting stuck on retrospective', async () => {
  window.localStorage.clear();
  window.location.hash = '#/retrospective';
  try {
    render(<App />);
    await screen.findByTestId('retrospective-page');
    await waitFor(() => {
      expect(document.title).toBe('[Paused] Kainbain - Project A - Retrospective');
    });
    // Leaving retrospective must retitle the tab (the reported stuck-title bug).
    fireEvent.keyDown(window, { key: '1' });
    await waitFor(() => {
      expect(document.title).toBe('[Paused] Kainbain - Project A - Orchestrator');
    });
  } finally {
    window.location.hash = '';
  }
});

test('document title flips to Running when the compute engine starts', async () => {
  window.localStorage.clear();
  window.location.hash = '';
  render(<App />);
  await screen.findByText(/Project A/i);
  await waitFor(() => {
    expect(document.title).toBe('[Paused] Kainbain - Project A - Orchestrator');
  });
  fireEvent.keyDown(window, { key: 'p' });
  await waitFor(() => {
    expect(document.title).toBe('[Running] Kainbain - Project A - Orchestrator');
  });
  window.location.hash = '';
});
