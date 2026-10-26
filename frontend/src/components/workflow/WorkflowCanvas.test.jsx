import { expect, test, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { KainBainContext } from '../../context/KainBainContext';
import { renderWithKainBain } from '../../testUtils';
import { DEFAULT_UI_PREFERENCES } from '../../context/useUiPreferences';
import { WorkflowCanvas } from './WorkflowCanvas';
import '@testing-library/jest-dom';

/***
 * MARK: WorkflowCanvas tests
 * @description Composition smoke tests for the thinned `WorkflowCanvas` orchestrator: board-level render, cross-workflow isolation, responsive contracts and loading/empty states. Per-module cases live in WorkflowCanvas.{toolbar,mobile,column,settings,console}.test.jsx.
 ***/
beforeEach(() => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.clear();
  }
});

const stages = [
  { id: '1', name: 'Idea', type: 'agent', prompt: 'Generate ideas.' },
  { id: '2', name: 'Review', type: 'human', prompt: 'Human review.' },
];

const tasks = [
  { id: 'task-1', goal: 'Build login page', currentStageId: '1', status: 'in_stage' },
  { id: 'task-2', goal: 'Review API spec', currentStageId: '2', status: 'in_stage' },
  { id: 'task-3', goal: 'Old task', currentStageId: '1', status: 'completed' },
];

test('renders stage columns, tasks, and in-place add task buttons', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
  });

  expect(screen.getByText('Build login page')).toBeInTheDocument();
  expect(screen.getByText('Review API spec')).toBeInTheDocument();
  expect(screen.getAllByText('Add Task').length).toBe(2);
});

test('isolates tasks strictly by active workflow (#6, #24, #26)', () => {
  const multiWfTasks = [
    {
      id: 'task-wf1',
      title: 'Task in Main Pipeline',
      workflowId: 'wf-main',
      currentStageId: '1',
      status: 'in_stage',
    },
    {
      id: 'task-wf2',
      title: 'Task in Hotfix Pipeline',
      workflowId: 'wf-hotfix',
      currentStageId: '1',
      status: 'in_stage',
    },
  ];

  const projectWorkflows = [
    { id: 'wf-main', name: 'Main Pipeline', isDefault: true, stages },
    { id: 'wf-hotfix', name: 'Hotfix Pipeline', isDefault: false, stages },
  ];

  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks: multiWfTasks,
    activeProjectId: 'proj-1',
    projectWorkflows,
    activeWorkflowId: 'wf-main',
  });

  // Only task for wf-main should appear
  expect(screen.getByText('Task in Main Pipeline')).toBeInTheDocument();
  expect(screen.queryByText('Task in Hotfix Pipeline')).not.toBeInTheDocument();
});

test('filter pills row and activity console are CSS-hidden on mobile, flex on desktop (task 7a411b12)', () => {
  // Seed a two-tag query so the search bar renders its chip strip and the
  // Any/All toggle for the responsive assertions at the end of this test.
  window.localStorage.setItem('kainbain:board:search', JSON.stringify('#PO #Dev'));
  renderWithKainBain(<WorkflowCanvas />, {
    stages,
    tasks,
    activeProjectId: 'proj-1',
    projectWorkflows: [{ id: 'wf-1', name: 'Main Pipeline', isDefault: true }],
    activeWorkflowId: 'wf-1',
    messages: [{ id: 'm1', role: 'assistant', content: 'Activity present' }],
  });

  // R1: filter pills + Show Completed container is hidden below md, flex from md up.
  const completedToggle = screen.getByText(/Show Completed/);
  const filterRow = completedToggle.closest('div.items-center.gap-3');
  expect(filterRow).not.toBeNull();
  expect(filterRow).toHaveClass('hidden');
  expect(filterRow).toHaveClass('md:flex');

  // R3: the Live Agent Activity Console root is hidden below md, flex from md up.
  const consoleBar = screen.getByTestId('activity-console-bar');
  expect(consoleBar).toHaveClass('hidden');
  expect(consoleBar).toHaveClass('md:flex');

  // The workflow selector and search input stay available on mobile (not hidden).
  const workflowBtn = screen.getByRole('button', { name: /Select pipeline workflow/i });
  expect(workflowBtn.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  const searchInput = screen.getByRole('combobox', { name: 'Search tasks' });
  expect(searchInput.className).not.toMatch(/(^|\s)hidden(\s|$)/);

  // Task da91c31e: the search bar stays width-bounded with tags present.
  // Root fills its line and stays shrinkable; the single-line shell is
  // full-width on mobile and flexes beside the Any/All toggle from lg up.
  const searchRoot = screen.getByTestId('unified-search-bar');
  expect(searchRoot).toHaveClass('w-full');
  expect(searchRoot).toHaveClass('min-w-0');
  const shell = searchRoot.querySelector(':scope > div');
  expect(shell).toHaveClass('w-full');
  expect(shell).toHaveClass('min-w-0');
  expect(shell).toHaveClass('overflow-hidden');
  expect(shell).toHaveClass('lg:flex-1');
  // Tag chips scroll horizontally inside the shell instead of wrapping or
  // pushing the input/clear button out of view.
  const chips = screen.getByTestId('unified-search-chips');
  expect(chips).toHaveClass('overflow-x-auto');
  expect(chips).toHaveClass('shrink');
  expect(chips).toHaveClass('min-w-0');
  expect(chips.querySelector('div')).toHaveClass('flex-nowrap');
  // The Any/All toggle stays in the DOM but is CSS-hidden below md.
  const toggleBtn = screen.getByRole('button', { name: 'Match any selected tag' });
  expect(toggleBtn.parentElement).toHaveClass('hidden');
  expect(toggleBtn.parentElement).toHaveClass('md:flex');
});

test('shows a loading state instead of the empty state while the workflow loads', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [],
    tasks: [],
    activeProjectId: 'proj-1',
    workflowLoading: true,
  });

  expect(screen.getByText('Loading pipeline…')).toBeInTheDocument();
  expect(screen.queryByText(/No stages configured/)).not.toBeInTheDocument();
});

test('shows the empty state once loading finishes with no stages', () => {
  renderWithKainBain(<WorkflowCanvas />, {
    stages: [],
    tasks: [],
    activeProjectId: 'proj-1',
  });

  expect(screen.getByText(/No stages configured/)).toBeInTheDocument();
});
