import { expect, test, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithKainBain } from '../../testUtils';
import { StageColumn } from './StageColumn';
import '@testing-library/jest-dom';

/***
 * MARK: StageColumn tests
 * @description Colocated tests for the extracted per-stage column: full vs
 *   Human-filter collapsed header, paused banner, analytics strip,
 *   add-task affordance and settings-drawer trigger. Props mirror what
 *   WorkflowCanvas passes through (see WorkflowCanvas.jsx composition).
 ***/

const stage = { id: 's-1', name: 'Idea', type: 'agent' };
const stages = [stage, { id: 's-2', name: 'Review', type: 'human' }];

const analytics = {
  byStage: {
    's-1': {
      throughput: 2,
      avgDuration: '3m',
      passRate: 100,
      passedCount: 2,
      failedCount: 0,
      activeTasksCount: 1,
    },
  },
};

function baseProps(overrides = {}) {
  return {
    stage,
    stageIndex: 0,
    stages,
    currentStageId: 's-1',
    effectiveMobileStageId: 's-1',
    filteredTasks: [],
    searchQuery: '',
    searchQuery: '',
    addingTaskStageId: null,
    expandedSettingsStageId: null,
    draggingStageId: null,
    dragOverStageId: null,
    stageAnalytics: analytics,
    colStyle: { width: '300px' },
    collapsedStyle: { width: '48px' },
    engineState: 'idle',
    isAgentRunning: false,
    uiPreferences: {},
    newTaskTitle: '',
    isSubmittingTask: false,
    pendingStageAction: null,
    activeProjectId: 'p1',
    setAddingTaskStageId: vi.fn(),
    setNewTaskTitle: vi.fn(),
    setExpandedSettingsStageId: vi.fn(),
    setSelectedTask: vi.fn(),
    handleApprove: vi.fn(),
    handleReject: vi.fn(),
    handleExecute: vi.fn(),
    handleCreateTaskInline: vi.fn(),
    handleUpdateStage: vi.fn(),
    saveStages: vi.fn(),
    removeStageAndSave: vi.fn(),
    reorderAndSave: vi.fn(),
    handleStageDragStart: vi.fn(),
    handleStageDragEnd: vi.fn(),
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDrop: vi.fn(),
    availableModels: [],
    availableHarnesses: [],
    modelsRefreshing: false,
    refreshModels: vi.fn(),
    projectHarnessId: 'pi',
    projectHarnessLabel: 'pi',
    isHarnessDisabled: false,
    skills: [],
    skillsLoading: false,
    skillsError: null,
    fetchSkills: vi.fn(),
    getSkillByName: vi.fn(),
    ...overrides,
  };
}

function renderColumn(overrides) {
  return renderWithKainBain(<StageColumn {...baseProps(overrides)} />);
}

test('full header shows stage name with reorder hint', () => {
  renderColumn();
  expect(
    screen.getByLabelText('Stage Idea. Position 1 of 2. Press Alt+Left or Alt+Right to reorder.'),
  ).toBeInTheDocument();
});

test('Human filter collapses empty non-checkpoint column', () => {
  renderColumn({ searchQuery: '!human' });
  const section = screen.getByLabelText('Idea (collapsed)');
  expect(section).toHaveAttribute('data-collapsed', 'true');
  expect(screen.getByTestId('collapsed-badge-s-1')).toHaveTextContent('1');
});

test('Human filter keeps columns with tasks expanded', () => {
  const { container } = renderColumn({
    searchQuery: '!human',
    filteredTasks: [{ id: 'KB-1', currentStageId: 's-1', status: 'active' }],
  });
  expect(container.querySelector('#stage-col-s-1')).toHaveAttribute('data-collapsed', 'false');
});

test('paused stage shows paused banner', () => {
  renderColumn({ stage: { ...stage, paused: true } });
  expect(screen.getByLabelText('Stage is paused')).toBeInTheDocument();
});

test('analytics strip renders per-stage stats', () => {
  renderColumn();
  const strip = screen.getByTestId('stage-analytics-s-1');
  expect(strip).toBeInTheDocument();
  expect(strip).toHaveTextContent('100%');
});

test('add-task button opens the inline form', () => {
  const setAddingTaskStageId = vi.fn();
  const setNewTaskTitle = vi.fn();
  renderColumn({ setAddingTaskStageId, setNewTaskTitle });
  fireEvent.click(screen.getByLabelText('Add task to Idea'));
  expect(setAddingTaskStageId).toHaveBeenCalledWith('s-1');
  expect(setNewTaskTitle).toHaveBeenCalledWith('');
});

test('inline form submits via handleCreateTaskInline', () => {
  const handleCreateTaskInline = vi.fn();
  renderColumn({
    addingTaskStageId: 's-1',
    newTaskTitle: 'Fix login bug',
    handleCreateTaskInline,
  });
  expect(screen.getByLabelText('Task goal for Idea')).toHaveValue('Fix login bug');
  fireEvent.click(screen.getByLabelText('Submit new task'));
  expect(handleCreateTaskInline).toHaveBeenCalledWith('s-1');
});

test('submit stays disabled on an empty title', () => {
  renderColumn({ addingTaskStageId: 's-1', newTaskTitle: '   ' });
  expect(screen.getByLabelText('Submit new task')).toBeDisabled();
});

test('settings trigger expands the drawer', () => {
  const setExpandedSettingsStageId = vi.fn();
  renderColumn({ setExpandedSettingsStageId });
  fireEvent.click(screen.getByRole('button', { name: 'Configure stage Idea' }));
  expect(setExpandedSettingsStageId).toHaveBeenCalledWith('s-1');
});
