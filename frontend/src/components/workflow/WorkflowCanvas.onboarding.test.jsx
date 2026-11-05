import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas onboarding tests
 * @description Verifies the canvas mounts the first-run onboarding UI:
 *   the empty state (gated on the server-confirmed zero-project count,
 *   with a loading shimmer while the summary resolves and static CTAs
 *   when the backend is unreachable) and the dismissible checklist
 *   banner once projects exist. One-click adoption registers the path
 *   and refreshes the summary.
 */
const useOnboardingMock = vi.hoisted(() => vi.fn());

vi.mock('../../hooks/useOnboarding', () => ({
  useOnboarding: useOnboardingMock,
}));

const ZERO_SUMMARY = {
  runner: { hasFreshRunner: false, nextAction: 'approve-runner', nextActionDetail: 'Approve it.' },
  projectCount: 0,
  taskCount: 0,
  hasRun: false,
  adoptable: [{ path: '/repos/foo', name: 'foo' }],
  steps: [
    { id: 'runner', title: 'Connect a Runner', done: false, detail: 'Approve it.' },
    { id: 'project', title: 'Create or adopt a project', done: false, detail: 'Create one.' },
    { id: 'run', title: 'Run your first task', done: false, detail: 'Add a task.' },
  ],
  complete: false,
};

const PARTIAL_SUMMARY = {
  ...ZERO_SUMMARY,
  projectCount: 1,
  adoptable: [],
  steps: [
    { id: 'runner', title: 'Connect a Runner', done: true, detail: 'Live.' },
    { id: 'project', title: 'Create or adopt a project', done: true, detail: 'On the board.' },
    { id: 'run', title: 'Run your first task', done: false, detail: 'Add a task.' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
  useOnboardingMock.mockReturnValue({
    summary: null,
    loading: true,
    loaded: false,
    refresh: vi.fn(),
  });
});

describe('WorkflowCanvas onboarding', () => {
  it('shows the onboarding empty state when the server confirms zero projects', () => {
    useOnboardingMock.mockReturnValue({
      summary: ZERO_SUMMARY,
      loading: false,
      loaded: true,
      refresh: vi.fn(),
    });
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [],
      activeProjectId: null,
      stages: [],
      tasks: [],
    });
    expect(screen.getByTestId('onboarding-empty-state')).toBeInTheDocument();
    expect(screen.queryByText(/No stages configured/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
    // Search/pipeline toolbar is meaningless without a project: hidden.
    expect(screen.queryByPlaceholderText(/Search tasks/)).not.toBeInTheDocument();
  });

  it('shows a loader while the summary resolves instead of flashing either empty state', () => {
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [],
      activeProjectId: null,
      stages: [],
      tasks: [],
    });
    expect(screen.getByText('Loading pipeline…')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByText(/No stages configured/)).not.toBeInTheDocument();
  });

  it('renders static CTAs when the backend is unreachable', () => {
    useOnboardingMock.mockReturnValue({ summary: null, loading: false, loaded: false, refresh: vi.fn() });
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [],
      activeProjectId: null,
      stages: [],
      tasks: [],
    });
    expect(screen.getByTestId('onboarding-empty-state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create New Project' })).toBeInTheDocument();
  });

  it('shows the checklist banner (not the empty state) once projects exist', () => {
    useOnboardingMock.mockReturnValue({
      summary: PARTIAL_SUMMARY,
      loading: false,
      loaded: true,
      refresh: vi.fn(),
    });
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [{ id: 'proj-1', name: 'Project Alpha' }],
      activeProjectId: 'proj-1',
      stages: [],
      tasks: [],
    });
    expect(screen.queryByTestId('onboarding-empty-state')).not.toBeInTheDocument();
    expect(screen.getByTestId('onboarding-checklist')).toBeInTheDocument();
    expect(screen.getByText(/No stages configured/)).toBeInTheDocument();
  });

  it('hides all onboarding UI once the checklist is complete', () => {
    useOnboardingMock.mockReturnValue({
      summary: { ...PARTIAL_SUMMARY, complete: true },
      loading: false,
      loaded: true,
      refresh: vi.fn(),
    });
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [{ id: 'proj-1', name: 'Project Alpha' }],
      activeProjectId: 'proj-1',
      stages: [],
      tasks: [],
    });
    expect(screen.queryByTestId('onboarding-empty-state')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-checklist')).not.toBeInTheDocument();
  });

  it('one-click adoption registers the path and refreshes the summary', async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const registerProject = vi.fn().mockResolvedValue({ id: 'proj-2', name: 'foo' });
    useOnboardingMock.mockReturnValue({
      summary: ZERO_SUMMARY,
      loading: false,
      loaded: true,
      refresh,
    });
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [],
      activeProjectId: null,
      stages: [],
      tasks: [],
      registerProject,
    });
    fireEvent.click(screen.getByTestId('onboarding-adopt-foo'));
    await waitFor(() => expect(registerProject).toHaveBeenCalledWith({ path: '/repos/foo' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('routes the setup guide through the docs view', () => {
    const setView = vi.fn();
    useOnboardingMock.mockReturnValue({
      summary: ZERO_SUMMARY,
      loading: false,
      loaded: true,
      refresh: vi.fn(),
    });
    renderWithKainBain(<WorkflowCanvas />, {
      projects: [],
      activeProjectId: null,
      stages: [],
      tasks: [],
      setView,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Setup guide' }));
    expect(setView).toHaveBeenCalledWith('docs');
  });
});
